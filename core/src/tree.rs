//! Persistent node state and binary op decoding for the Rust backend.

use crate::shared::{
    DEFAULT_BG, DEFAULT_FG, TEXT_ATTR_ALL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use std::{cell::RefCell, collections::HashMap, os::raw::c_int, slice};
use taffy::{Overflow, Point, prelude::*};

#[unsafe(no_mangle)]
pub extern "C" fn clear_tree_state() -> c_int {
    TREE_STATE.with_borrow_mut(|state| {
        state.tree.clear();
        state.ids.clear();
        state.root = None;
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn apply_ops(ops_ptr: *const u8, ops_len: u32) -> c_int {
    match apply_ops_inner(ops_ptr, ops_len) {
        Some(()) => 1,
        None => 0,
    }
}

fn apply_ops_inner(ops_ptr: *const u8, ops_len: u32) -> Option<()> {
    if ops_len > 0 && ops_ptr.is_null() {
        return None;
    }

    let ops_bytes: &[u8] = if ops_len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ops_ptr, ops_len as usize) }
    };

    if ops_bytes.is_empty() {
        return Some(());
    }

    TREE_STATE.with_borrow_mut(|state| apply_ops_to_state(state, ops_bytes))
}

fn apply_ops_to_state(state: &mut TreeState, ops_bytes: &[u8]) -> Option<()> {
    let mut offset = 0usize;
    while offset < ops_bytes.len() {
        let header = ops_bytes.get(offset..offset + RECORD_HEADER_SIZE)?;

        let op = OpType::from_u8(header[0])?;

        let node_id = u32::from_le_bytes(header[OP_SIZE..OP_SIZE + ID_SIZE].try_into().ok()?);

        let payload_len = u32::from_le_bytes(
            header[OP_SIZE + ID_SIZE..RECORD_HEADER_SIZE]
                .try_into()
                .ok()?,
        ) as usize;

        offset += RECORD_HEADER_SIZE;

        let payload = ops_bytes.get(offset..offset + payload_len)?;

        match op {
            OpType::AddNode => {
                if payload.len() != KIND_SIZE {
                    return None;
                }
                if state.ids.contains_key(&node_id) {
                    return None;
                }

                let kind = NodeType::from_u8(payload[0])?;
                let ctx = NodeContext {
                    id: node_id,
                    kind,
                    text: String::new(),
                    text_spans: Vec::new(),
                    style: NodeStyle::default_for_kind(kind),
                };
                let taffy_style = node_context_to_taffy_style(&ctx);
                let taffy_id = state.tree.new_leaf_with_context(taffy_style, ctx).unwrap();
                state.ids.insert(node_id, taffy_id);
            }
            OpType::SetText => {
                let appended_text = std::str::from_utf8(payload).ok()?;
                let taffy_id = *state.ids.get(&node_id)?;
                let ctx = state.tree.get_node_context_mut(taffy_id)?;

                if !ctx.kind.supports_text() {
                    return None;
                }

                ctx.text.push_str(appended_text);
                state.tree.mark_dirty(taffy_id).ok()?;
            }
            OpType::DeleteTextRange => {
                if payload.len() != ID_SIZE * 2 {
                    return None;
                }

                let start_byte = u32::from_le_bytes(payload[0..ID_SIZE].try_into().ok()?) as usize;
                let end_byte =
                    u32::from_le_bytes(payload[ID_SIZE..ID_SIZE * 2].try_into().ok()?) as usize;

                let taffy_id = *state.ids.get(&node_id)?;
                let ctx = state.tree.get_node_context_mut(taffy_id)?;

                if !ctx.kind.supports_text() {
                    return None;
                }

                if start_byte > end_byte || end_byte > ctx.text.len() {
                    return None;
                }

                if !ctx.text.is_char_boundary(start_byte) || !ctx.text.is_char_boundary(end_byte) {
                    return None;
                }

                ctx.text.replace_range(start_byte..end_byte, "");
                state.tree.mark_dirty(taffy_id).ok()?;
            }
            OpType::SetTextSpans => {
                let taffy_id = *state.ids.get(&node_id)?;
                let ctx = state.tree.get_node_context_mut(taffy_id)?;

                if ctx.kind != NodeType::Text {
                    return None;
                }

                let spans = parse_text_spans(payload, &ctx.text)?;
                ctx.text_spans = spans;
                state.tree.mark_dirty(taffy_id).ok()?;
            }
            OpType::SetRoot => {
                if !payload.is_empty() {
                    return None;
                }
                let taffy_id = *state.ids.get(&node_id)?;
                state.root = Some(taffy_id);
            }
            OpType::DeleteNode => {
                if !payload.is_empty() {
                    return None;
                }
                let taffy_id = *state.ids.get(&node_id)?;

                if let Some(parent_taffy) = state.tree.parent(taffy_id) {
                    state.tree.remove_child(parent_taffy, taffy_id).ok()?;
                }

                if state.root == Some(taffy_id) {
                    state.root = None;
                }

                remove_subtree(state, taffy_id);
            }
            OpType::AppendChild => {
                if payload.len() != ID_SIZE {
                    return None;
                }

                let parent_id = node_id;
                let child_id = u32::from_le_bytes(payload.try_into().ok()?);

                if parent_id == child_id {
                    return None;
                }

                let parent_taffy = *state.ids.get(&parent_id)?;
                let child_taffy = *state.ids.get(&child_id)?;

                // Child must not already have a parent
                if state.tree.parent(child_taffy).is_some() {
                    return None;
                }

                // Cycle detection: walk ancestors of parent
                let mut current = Some(parent_taffy);
                while let Some(ancestor) = current {
                    if ancestor == child_taffy {
                        return None;
                    }
                    current = state.tree.parent(ancestor);
                }

                state.tree.add_child(parent_taffy, child_taffy).ok()?;
            }
            OpType::UpdateStyle => {
                if payload.len() < 2 {
                    return None;
                }

                let prop_name_len = payload[0] as usize;
                if prop_name_len == 0 || payload.len() < 1 + prop_name_len + 1 {
                    return None;
                }

                let prop_name_end = 1 + prop_name_len;
                let prop_name = std::str::from_utf8(&payload[1..prop_name_end]).ok()?;
                let prop = StyleProp::parse(prop_name)?;
                let value =
                    StyleValue::parse(payload[prop_name_end], &payload[prop_name_end + 1..])?;

                let taffy_id = *state.ids.get(&node_id)?;
                let ctx = state.tree.get_node_context_mut(taffy_id)?;
                apply_style(ctx, prop, value)?;

                let taffy_style = node_context_to_taffy_style(ctx);
                state.tree.set_style(taffy_id, taffy_style).ok()?;
            }
        }

        offset += payload_len;
    }

    Some(())
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NodeType {
    Row = 1,
    Column = 2,
    Button = 3,
    Input = 4,
    Text = 5,
}

impl NodeType {
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(NodeType::Row),
            2 => Some(NodeType::Column),
            3 => Some(NodeType::Button),
            4 => Some(NodeType::Input),
            5 => Some(NodeType::Text),
            _ => None,
        }
    }

    pub fn supports_text(self) -> bool {
        matches!(self, NodeType::Text | NodeType::Button | NodeType::Input)
    }

    pub fn is_box(self) -> bool {
        matches!(self, NodeType::Row | NodeType::Column)
    }

    pub fn default_text_wrap(self) -> TextWrap {
        match self {
            NodeType::Text => TextWrap::Word,
            NodeType::Input | NodeType::Button | NodeType::Row | NodeType::Column => TextWrap::None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Direction {
    Row = 1,
    Column = 2,
    RowReverse = 3,
    ColumnReverse = 4,
}

impl Direction {
    pub fn from_node_type(kind: NodeType) -> Self {
        match kind {
            NodeType::Row => Direction::Row,
            NodeType::Column => Direction::Column,
            _ => Direction::Column,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BorderStyle {
    None = 0,
    Rounded = 1,
    Squared = 2,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum OpType {
    SetText = 1,
    DeleteTextRange = 2,
    AddNode = 3,
    DeleteNode = 4,
    UpdateStyle = 5,
    SetRoot = 6,
    AppendChild = 7,
    SetTextSpans = 8,
}

impl OpType {
    fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(OpType::SetText),
            2 => Some(OpType::DeleteTextRange),
            3 => Some(OpType::AddNode),
            4 => Some(OpType::DeleteNode),
            5 => Some(OpType::UpdateStyle),
            6 => Some(OpType::SetRoot),
            7 => Some(OpType::AppendChild),
            8 => Some(OpType::SetTextSpans),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum StyleProp {
    Gap,
    Padding,
    PaddingX,
    PaddingY,
    BorderTopWidth,
    BorderRightWidth,
    BorderBottomWidth,
    BorderLeftWidth,
    Background,
    Foreground,
    BorderTopColor,
    BorderRightColor,
    BorderBottomColor,
    BorderLeftColor,
    BorderStyle,
    FlexGrow,
    Direction,
    Width,
    Height,
    MinWidth,
    MinHeight,
    MaxWidth,
    MaxHeight,
    Margin,
    MarginX,
    MarginY,
    AlignItems,
    JustifyContent,
    AlignSelf,
    FlexShrink,
    FlexBasis,
    FlexWrap,
    Overflow,
    ScrollY,
    Wrap,
    TextOverflow,
    BoxSizing,
    CursorVisible,
}

impl StyleProp {
    fn parse(name: &str) -> Option<Self> {
        match name {
            "gap" => Some(Self::Gap),
            "padding" => Some(Self::Padding),
            "paddingX" => Some(Self::PaddingX),
            "paddingY" => Some(Self::PaddingY),
            "borderTopWidth" => Some(Self::BorderTopWidth),
            "borderRightWidth" => Some(Self::BorderRightWidth),
            "borderBottomWidth" => Some(Self::BorderBottomWidth),
            "borderLeftWidth" => Some(Self::BorderLeftWidth),
            "background" => Some(Self::Background),
            "foreground" => Some(Self::Foreground),
            "borderTopColor" => Some(Self::BorderTopColor),
            "borderRightColor" => Some(Self::BorderRightColor),
            "borderBottomColor" => Some(Self::BorderBottomColor),
            "borderLeftColor" => Some(Self::BorderLeftColor),
            "borderStyle" => Some(Self::BorderStyle),
            "flexGrow" => Some(Self::FlexGrow),
            "direction" => Some(Self::Direction),
            "width" => Some(Self::Width),
            "height" => Some(Self::Height),
            "minWidth" => Some(Self::MinWidth),
            "minHeight" => Some(Self::MinHeight),
            "maxWidth" => Some(Self::MaxWidth),
            "maxHeight" => Some(Self::MaxHeight),
            "margin" => Some(Self::Margin),
            "marginX" => Some(Self::MarginX),
            "marginY" => Some(Self::MarginY),
            "alignItems" => Some(Self::AlignItems),
            "justifyContent" => Some(Self::JustifyContent),
            "alignSelf" => Some(Self::AlignSelf),
            "flexShrink" => Some(Self::FlexShrink),
            "flexBasis" => Some(Self::FlexBasis),
            "flexWrap" => Some(Self::FlexWrap),
            "overflow" => Some(Self::Overflow),
            "scrollY" => Some(Self::ScrollY),
            "wrap" => Some(Self::Wrap),
            "textOverflow" => Some(Self::TextOverflow),
            "boxSizing" => Some(Self::BoxSizing),
            "cursorVisible" => Some(Self::CursorVisible),
            _ => None,
        }
    }
}

enum StyleValue<'a> {
    Reset,
    Number(f64),
    String(&'a str),
}

impl<'a> StyleValue<'a> {
    fn parse(kind: u8, payload: &'a [u8]) -> Option<Self> {
        match kind {
            STYLE_VALUE_RESET => {
                if !payload.is_empty() {
                    return None;
                }
                Some(Self::Reset)
            }
            STYLE_VALUE_NUMBER => Some(Self::Number(parse_style_number(payload)?)),
            STYLE_VALUE_STRING => Some(Self::String(parse_style_string(payload)?)),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TextWrap {
    None,
    Word,
    Char,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TextOverflow {
    Clip,
    Ellipsis,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BoxSizing {
    BorderBox,
    ContentBox,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ColumnOverflow {
    NotScrollable,
    Scroll,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StyleDimension {
    Auto,
    Points(f32),
}

fn remove_subtree(state: &mut TreeState, taffy_id: NodeId) {
    let children = state.tree.children(taffy_id).unwrap_or_default();
    for child in children {
        remove_subtree(state, child);
    }
    if let Some(ctx) = state.tree.get_node_context(taffy_id) {
        state.ids.remove(&ctx.id);
    }
    let _ = state.tree.remove(taffy_id);
}

fn parse_style_number(payload: &[u8]) -> Option<f64> {
    let bytes: [u8; 8] = payload.try_into().ok()?;
    Some(f64::from_le_bytes(bytes))
}

fn parse_style_string(payload: &[u8]) -> Option<&str> {
    let string_len = *payload.first()? as usize;
    if payload.len() != 1 + string_len {
        return None;
    }

    std::str::from_utf8(&payload[1..]).ok()
}

fn parse_axis_pair(value: &str) -> Option<(f32, f32)> {
    let (first, second) = value.split_once(' ')?;
    let first = first.trim().parse::<f32>().ok()?;
    let second = second.trim().parse::<f32>().ok()?;
    Some((second, first))
}

fn parse_align_items(value: &str) -> Option<AlignItems> {
    match value {
        "start" => Some(AlignItems::Start),
        "end" => Some(AlignItems::End),
        "flexStart" => Some(AlignItems::FlexStart),
        "flexEnd" => Some(AlignItems::FlexEnd),
        "center" => Some(AlignItems::Center),
        "baseline" => Some(AlignItems::Baseline),
        "stretch" => Some(AlignItems::Stretch),
        _ => None,
    }
}

fn parse_justify_content(value: &str) -> Option<AlignContent> {
    match value {
        "start" => Some(AlignContent::Start),
        "end" => Some(AlignContent::End),
        "flexStart" => Some(AlignContent::FlexStart),
        "flexEnd" => Some(AlignContent::FlexEnd),
        "center" => Some(AlignContent::Center),
        "stretch" => Some(AlignContent::Stretch),
        "spaceBetween" => Some(AlignContent::SpaceBetween),
        "spaceEvenly" => Some(AlignContent::SpaceEvenly),
        "spaceAround" => Some(AlignContent::SpaceAround),
        _ => None,
    }
}

fn parse_flex_wrap(value: &str) -> Option<FlexWrap> {
    match value {
        "noWrap" => Some(FlexWrap::NoWrap),
        "wrap" => Some(FlexWrap::Wrap),
        "wrapReverse" => Some(FlexWrap::WrapReverse),
        _ => None,
    }
}

fn parse_direction(value: &str) -> Option<Direction> {
    match value {
        "row" => Some(Direction::Row),
        "column" => Some(Direction::Column),
        "rowReverse" => Some(Direction::RowReverse),
        "columnReverse" => Some(Direction::ColumnReverse),
        _ => None,
    }
}

fn parse_border_style(value: &str) -> Option<BorderStyle> {
    match value {
        "none" => Some(BorderStyle::None),
        "rounded" => Some(BorderStyle::Rounded),
        "square" => Some(BorderStyle::Squared),
        _ => None,
    }
}

fn parse_text_wrap(value: &str) -> Option<TextWrap> {
    match value {
        "none" => Some(TextWrap::None),
        "word" => Some(TextWrap::Word),
        "char" => Some(TextWrap::Char),
        _ => None,
    }
}

fn parse_text_overflow(value: &str) -> Option<TextOverflow> {
    match value {
        "clip" => Some(TextOverflow::Clip),
        "ellipsis" => Some(TextOverflow::Ellipsis),
        _ => None,
    }
}

fn parse_box_sizing(value: &str) -> Option<BoxSizing> {
    match value {
        "borderBox" => Some(BoxSizing::BorderBox),
        "contentBox" => Some(BoxSizing::ContentBox),
        _ => None,
    }
}

fn parse_column_overflow(value: &str) -> Option<ColumnOverflow> {
    match value {
        "scroll" => Some(ColumnOverflow::Scroll),
        _ => None,
    }
}

fn parse_style_f32(value: f64) -> Option<f32> {
    if value.is_finite() && value >= f32::MIN as f64 && value <= f32::MAX as f64 {
        Some(value as f32)
    } else {
        None
    }
}

fn parse_style_u32(value: f64) -> Option<u32> {
    if value.is_finite() && value >= 0.0 && value <= u32::MAX as f64 {
        Some(value as u32)
    } else {
        None
    }
}

fn parse_text_spans(payload: &[u8], text: &str) -> Option<Vec<TextSpanData>> {
    let count_bytes: [u8; TEXT_SPAN_COUNT_SIZE] =
        payload.get(..TEXT_SPAN_COUNT_SIZE)?.try_into().ok()?;
    let count = u32::from_le_bytes(count_bytes) as usize;
    let expected_len = TEXT_SPAN_COUNT_SIZE + count * TEXT_SPAN_RECORD_SIZE;
    if payload.len() != expected_len {
        return None;
    }

    let mut spans = Vec::with_capacity(count);
    let mut previous_end = 0usize;
    let mut offset = TEXT_SPAN_COUNT_SIZE;

    for _ in 0..count {
        let start_byte =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?) as usize;
        offset += ID_SIZE;
        let end_byte =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?) as usize;
        offset += ID_SIZE;

        let attr_flags = payload[offset];
        offset += TEXT_SPAN_ATTR_FLAGS_SIZE;
        if attr_flags & !TEXT_ATTR_ALL != 0 {
            return None;
        }

        let color_flags = payload[offset];
        offset += TEXT_SPAN_COLOR_FLAGS_SIZE;
        if color_flags & !(TEXT_SPAN_COLOR_FOREGROUND | TEXT_SPAN_COLOR_BACKGROUND) != 0 {
            return None;
        }

        let foreground_value =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?);
        offset += ID_SIZE;
        let background_value =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?);
        offset += ID_SIZE;

        if start_byte > end_byte || end_byte > text.len() {
            return None;
        }
        if start_byte < previous_end {
            return None;
        }
        if !text.is_char_boundary(start_byte) || !text.is_char_boundary(end_byte) {
            return None;
        }

        spans.push(TextSpanData {
            start_byte,
            end_byte,
            foreground: if (color_flags & TEXT_SPAN_COLOR_FOREGROUND) != 0 {
                Some(foreground_value)
            } else {
                None
            },
            background: if (color_flags & TEXT_SPAN_COLOR_BACKGROUND) != 0 {
                Some(background_value)
            } else {
                None
            },
            bold: (attr_flags & TEXT_ATTR_BOLD) != 0,
            italic: (attr_flags & TEXT_ATTR_ITALIC) != 0,
            underline: (attr_flags & TEXT_ATTR_UNDERLINE) != 0,
        });

        previous_end = end_byte;
    }

    Some(spans)
}

fn apply_style(node: &mut NodeContext, prop: StyleProp, value: StyleValue<'_>) -> Option<()> {
    match prop {
        StyleProp::Gap => apply_f32(&mut node.style.gap, 0.0, value),
        StyleProp::Padding => {
            apply_axis_pair_value(&mut node.style.padding_x, &mut node.style.padding_y, value)
        }
        StyleProp::PaddingX => apply_f32(&mut node.style.padding_x, 0.0, value),
        StyleProp::PaddingY => apply_f32(&mut node.style.padding_y, 0.0, value),
        StyleProp::BorderTopWidth => apply_f32(&mut node.style.border.top.width, 0.0, value),
        StyleProp::BorderRightWidth => apply_f32(&mut node.style.border.right.width, 0.0, value),
        StyleProp::BorderBottomWidth => apply_f32(&mut node.style.border.bottom.width, 0.0, value),
        StyleProp::BorderLeftWidth => apply_f32(&mut node.style.border.left.width, 0.0, value),
        StyleProp::Background => apply_u32(&mut node.style.bg, DEFAULT_BG, value),
        StyleProp::Foreground => apply_u32(&mut node.style.fg, DEFAULT_FG, value),
        StyleProp::BorderTopColor => apply_u32(&mut node.style.border.top.color, DEFAULT_BG, value),
        StyleProp::BorderRightColor => {
            apply_u32(&mut node.style.border.right.color, DEFAULT_BG, value)
        }
        StyleProp::BorderBottomColor => {
            apply_u32(&mut node.style.border.bottom.color, DEFAULT_BG, value)
        }
        StyleProp::BorderLeftColor => {
            apply_u32(&mut node.style.border.left.color, DEFAULT_BG, value)
        }
        StyleProp::BorderStyle => apply_border_style_value(&mut node.style.border.style, value),
        StyleProp::FlexGrow => apply_f32(&mut node.style.flex_grow, 0.0, value),
        StyleProp::Direction => apply_direction_value(node, value),
        StyleProp::Width => apply_dimension(&mut node.style.width, value),
        StyleProp::Height => apply_dimension(&mut node.style.height, value),
        StyleProp::MinWidth => apply_dimension(&mut node.style.min_width, value),
        StyleProp::MinHeight => apply_dimension(&mut node.style.min_height, value),
        StyleProp::MaxWidth => apply_dimension(&mut node.style.max_width, value),
        StyleProp::MaxHeight => apply_dimension(&mut node.style.max_height, value),
        StyleProp::Margin => {
            apply_axis_pair_value(&mut node.style.margin_x, &mut node.style.margin_y, value)
        }
        StyleProp::MarginX => apply_f32(&mut node.style.margin_x, 0.0, value),
        StyleProp::MarginY => apply_f32(&mut node.style.margin_y, 0.0, value),
        StyleProp::AlignItems => apply_align_items(&mut node.style.align_items, value),
        StyleProp::JustifyContent => apply_justify_content(&mut node.style.justify_content, value),
        StyleProp::AlignSelf => apply_align_items(&mut node.style.align_self, value),
        StyleProp::FlexShrink => apply_f32(&mut node.style.flex_shrink, 1.0, value),
        StyleProp::FlexBasis => apply_dimension(&mut node.style.flex_basis, value),
        StyleProp::FlexWrap => apply_flex_wrap_value(&mut node.style.flex_wrap, value),
        StyleProp::Overflow => apply_column_overflow_value(node, value),
        StyleProp::ScrollY => apply_f64(&mut node.style.scroll_y, 0.0, value),
        StyleProp::Wrap => apply_text_wrap_value(node, value),
        StyleProp::TextOverflow => apply_text_overflow_value(&mut node.style.text_overflow, value),
        StyleProp::BoxSizing => apply_box_sizing(&mut node.style.box_sizing, value),
        StyleProp::CursorVisible => apply_bool(&mut node.style.cursor_visible, value),
    }
}

fn apply_f32(slot: &mut f32, reset: f32, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = reset,
        StyleValue::Number(value) => *slot = parse_style_f32(value)?,
        StyleValue::String(_) => return None,
    }
    Some(())
}

fn apply_u32(slot: &mut u32, reset: u32, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = reset,
        StyleValue::Number(value) => *slot = parse_style_u32(value)?,
        StyleValue::String(_) => return None,
    }
    Some(())
}

fn apply_bool(slot: &mut bool, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = false,
        StyleValue::Number(value) => *slot = value != 0.0,
        StyleValue::String(_) => return None,
    }
    Some(())
}

fn apply_f64(slot: &mut f64, reset: f64, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = reset,
        StyleValue::Number(value) => *slot = value,
        StyleValue::String(_) => return None,
    }
    Some(())
}

fn apply_dimension(slot: &mut StyleDimension, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = StyleDimension::Auto,
        StyleValue::Number(value) => *slot = StyleDimension::Points(parse_style_f32(value)?),
        StyleValue::String(_) => return None,
    }
    Some(())
}

fn apply_axis_pair_value(x: &mut f32, y: &mut f32, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => {
            *x = 0.0;
            *y = 0.0;
        }
        StyleValue::Number(value) => {
            let value = parse_style_f32(value)?;
            *x = value;
            *y = value;
        }
        StyleValue::String(value) => {
            let (parsed_x, parsed_y) = parse_axis_pair(value)?;
            *x = parsed_x;
            *y = parsed_y;
        }
    }
    Some(())
}

fn apply_align_items(slot: &mut Option<AlignItems>, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = None,
        StyleValue::String(value) => *slot = Some(parse_align_items(value)?),
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_justify_content(slot: &mut Option<AlignContent>, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = None,
        StyleValue::String(value) => *slot = Some(parse_justify_content(value)?),
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_border_style_value(slot: &mut BorderStyle, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = BorderStyle::None,
        StyleValue::String(value) => *slot = parse_border_style(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_direction_value(node: &mut NodeContext, value: StyleValue<'_>) -> Option<()> {
    if !node.kind.is_box() {
        return None;
    }

    match value {
        StyleValue::Reset => node.style.direction = Direction::from_node_type(node.kind),
        StyleValue::String(value) => node.style.direction = parse_direction(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_flex_wrap_value(slot: &mut FlexWrap, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = FlexWrap::NoWrap,
        StyleValue::String(value) => *slot = parse_flex_wrap(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_column_overflow_value(node: &mut NodeContext, value: StyleValue<'_>) -> Option<()> {
    if node.kind != NodeType::Column {
        return None;
    }

    match value {
        StyleValue::Reset => node.style.column_overflow = ColumnOverflow::NotScrollable,
        StyleValue::String(value) => node.style.column_overflow = parse_column_overflow(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_text_wrap_value(node: &mut NodeContext, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => node.style.text_wrap = node.kind.default_text_wrap(),
        StyleValue::String(value) => node.style.text_wrap = parse_text_wrap(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_text_overflow_value(slot: &mut TextOverflow, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = TextOverflow::Clip,
        StyleValue::String(value) => *slot = parse_text_overflow(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

fn apply_box_sizing(slot: &mut BoxSizing, value: StyleValue<'_>) -> Option<()> {
    match value {
        StyleValue::Reset => *slot = BoxSizing::BorderBox,
        StyleValue::String(value) => *slot = parse_box_sizing(value)?,
        StyleValue::Number(_) => return None,
    }
    Some(())
}

const STYLE_VALUE_RESET: u8 = 0;
const STYLE_VALUE_NUMBER: u8 = 1;
const STYLE_VALUE_STRING: u8 = 2;
const TEXT_SPAN_COLOR_FOREGROUND: u8 = 1 << 0;
const TEXT_SPAN_COLOR_BACKGROUND: u8 = 1 << 1;
const OP_SIZE: usize = 1;
const ID_SIZE: usize = 4;
const KIND_SIZE: usize = 1;
const LEN_SIZE: usize = 4;
const RECORD_HEADER_SIZE: usize = OP_SIZE + ID_SIZE + LEN_SIZE;
const TEXT_SPAN_COUNT_SIZE: usize = 4;
const TEXT_SPAN_ATTR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_COLOR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_RECORD_SIZE: usize =
    ID_SIZE * 2 + TEXT_SPAN_ATTR_FLAGS_SIZE + TEXT_SPAN_COLOR_FLAGS_SIZE + ID_SIZE * 2;

pub struct TreeState {
    pub tree: TaffyTree<NodeContext>,
    pub ids: HashMap<u32, NodeId>,
    pub root: Option<NodeId>,
}

#[derive(Debug, Clone)]
pub struct TextSpanData {
    pub start_byte: usize,
    pub end_byte: usize,
    pub foreground: Option<u32>,
    pub background: Option<u32>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
}

#[derive(Debug, Clone)]
pub struct NodeContext {
    pub id: u32,
    pub kind: NodeType,
    pub text: String,
    pub text_spans: Vec<TextSpanData>,
    pub style: NodeStyle,
}

#[derive(Debug, Clone, Copy)]
pub struct BorderSide {
    pub width: f32,
    pub color: u32,
}

impl BorderSide {
    pub const fn none() -> Self {
        Self {
            width: 0.0,
            color: DEFAULT_BG,
        }
    }

    pub fn is_visible(&self) -> bool {
        self.width > 0.0
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ResolvedBorder {
    pub top: BorderSide,
    pub right: BorderSide,
    pub bottom: BorderSide,
    pub left: BorderSide,
    pub style: BorderStyle,
}

impl ResolvedBorder {
    pub const fn none() -> Self {
        Self {
            top: BorderSide::none(),
            right: BorderSide::none(),
            bottom: BorderSide::none(),
            left: BorderSide::none(),
            style: BorderStyle::None,
        }
    }

    pub fn has_any_visible_side(&self) -> bool {
        self.top.is_visible()
            || self.right.is_visible()
            || self.bottom.is_visible()
            || self.left.is_visible()
    }

    pub fn is_uniform_full_box(&self) -> Option<(u32, BorderStyle)> {
        if !self.top.is_visible()
            || !self.right.is_visible()
            || !self.bottom.is_visible()
            || !self.left.is_visible()
        {
            return None;
        }

        if self.style == BorderStyle::None {
            return None;
        }

        let color = self.top.color;
        if self.right.color != color || self.bottom.color != color || self.left.color != color {
            return None;
        }

        Some((color, self.style))
    }
}

#[derive(Debug, Clone)]
pub struct NodeStyle {
    pub gap: f32,
    pub padding_x: f32,
    pub padding_y: f32,
    pub border: ResolvedBorder,
    pub bg: u32,
    pub fg: u32,
    pub flex_grow: f32,
    pub direction: Direction,
    pub width: StyleDimension,
    pub height: StyleDimension,
    pub min_width: StyleDimension,
    pub min_height: StyleDimension,
    pub max_width: StyleDimension,
    pub max_height: StyleDimension,
    pub margin_x: f32,
    pub margin_y: f32,
    pub align_items: Option<AlignItems>,
    pub justify_content: Option<AlignContent>,
    pub align_self: Option<AlignItems>,
    pub flex_shrink: f32,
    pub flex_basis: StyleDimension,
    pub flex_wrap: FlexWrap,
    pub column_overflow: ColumnOverflow,
    pub scroll_y: f64,
    pub text_wrap: TextWrap,
    pub text_overflow: TextOverflow,
    pub box_sizing: BoxSizing,
    pub cursor_visible: bool,
}

impl NodeStyle {
    pub fn default_for_kind(kind: NodeType) -> Self {
        Self {
            gap: 0.0,
            padding_x: 0.0,
            padding_y: 0.0,
            border: ResolvedBorder::none(),
            bg: DEFAULT_BG,
            fg: DEFAULT_FG,
            flex_grow: 0.0,
            direction: Direction::from_node_type(kind),
            width: StyleDimension::Auto,
            height: StyleDimension::Auto,
            min_width: StyleDimension::Auto,
            min_height: StyleDimension::Auto,
            max_width: StyleDimension::Auto,
            max_height: StyleDimension::Auto,
            margin_x: 0.0,
            margin_y: 0.0,
            align_items: None,
            justify_content: None,
            align_self: None,
            flex_shrink: 1.0,
            flex_basis: StyleDimension::Auto,
            flex_wrap: FlexWrap::NoWrap,
            column_overflow: ColumnOverflow::NotScrollable,
            scroll_y: 0.0,
            text_wrap: kind.default_text_wrap(),
            text_overflow: TextOverflow::Clip,
            box_sizing: BoxSizing::BorderBox,
            cursor_visible: false,
        }
    }
}

fn style_dimension_to_taffy(dim: StyleDimension) -> Dimension {
    match dim {
        StyleDimension::Auto => Dimension::auto(),
        StyleDimension::Points(v) => Dimension::length(v),
    }
}

pub fn node_context_to_taffy_style(ctx: &NodeContext) -> Style {
    let s = &ctx.style;
    let mut style = Style {
        gap: Size {
            width: length(s.gap),
            height: zero(),
        },
        padding: Rect {
            left: length(s.padding_x),
            right: length(s.padding_x),
            top: length(s.padding_y),
            bottom: length(s.padding_y),
        },
        border: Rect {
            left: length(s.border.left.width),
            right: length(s.border.right.width),
            top: length(s.border.top.width),
            bottom: length(s.border.bottom.width),
        },
        margin: Rect {
            left: length(s.margin_x),
            right: length(s.margin_x),
            top: length(s.margin_y),
            bottom: length(s.margin_y),
        },
        flex_grow: s.flex_grow,
        flex_shrink: s.flex_shrink,
        size: Size {
            width: style_dimension_to_taffy(s.width),
            height: style_dimension_to_taffy(s.height),
        },
        min_size: Size {
            width: style_dimension_to_taffy(s.min_width),
            height: style_dimension_to_taffy(s.min_height),
        },
        max_size: Size {
            width: style_dimension_to_taffy(s.max_width),
            height: style_dimension_to_taffy(s.max_height),
        },
        flex_basis: style_dimension_to_taffy(s.flex_basis),
        flex_wrap: s.flex_wrap,
        align_items: s.align_items,
        justify_content: s.justify_content,
        align_self: s.align_self,
        box_sizing: match s.box_sizing {
            BoxSizing::BorderBox => taffy::style::BoxSizing::BorderBox,
            BoxSizing::ContentBox => taffy::style::BoxSizing::ContentBox,
        },
        ..Default::default()
    };

    match s.direction {
        Direction::Row => style.flex_direction = FlexDirection::Row,
        Direction::Column => style.flex_direction = FlexDirection::Column,
        Direction::RowReverse => style.flex_direction = FlexDirection::RowReverse,
        Direction::ColumnReverse => style.flex_direction = FlexDirection::ColumnReverse,
    }

    match ctx.kind {
        NodeType::Column => {
            if s.align_items.is_none() {
                style.align_items = Some(AlignItems::Stretch);
            }
            match s.column_overflow {
                ColumnOverflow::NotScrollable => {
                    style.overflow = Point {
                        x: Overflow::Hidden,
                        y: Overflow::Hidden,
                    };
                }
                ColumnOverflow::Scroll => {
                    style.overflow = Point {
                        x: Overflow::Clip,
                        y: Overflow::Scroll,
                    };
                    style.scrollbar_width = 0.0;
                }
            }
        }
        NodeType::Input => {
            if s.flex_grow == 0.0 {
                style.flex_grow = 1.0;
            }
        }
        _ => {}
    }

    style
}

thread_local! {
    pub static TREE_STATE: RefCell<TreeState> = RefCell::new(TreeState {
        tree: TaffyTree::new(),
        ids: HashMap::new(),
        root: None,
    });
}
