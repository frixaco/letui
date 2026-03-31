use crate::shared::{
    DEFAULT_BG, DEFAULT_FG, TEXT_ATTR_ALL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use std::{
    collections::HashMap,
    os::raw::c_int,
    slice,
    sync::{LazyLock, Mutex},
};
use taffy::prelude::*;

pub(crate) static TREE_STATE: LazyLock<Mutex<TreeState>> =
    LazyLock::new(|| Mutex::new(TreeState::default()));

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
// Serialized span payload layout:
// <count:u32><startByte:u32><endByte:u32><attrFlags:u8><colorFlags:u8><fg:u32><bg:u32>...
const TEXT_SPAN_COUNT_SIZE: usize = 4;
const TEXT_SPAN_ATTR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_COLOR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_RECORD_SIZE: usize =
    ID_SIZE * 2 + TEXT_SPAN_ATTR_FLAGS_SIZE + TEXT_SPAN_COLOR_FLAGS_SIZE + ID_SIZE * 2;

#[derive(Debug, Default)]
pub(crate) struct TreeState {
    pub(crate) root_id: Option<u32>,
    pub(crate) nodes: HashMap<u32, NodeData>,
}

#[derive(Debug, Clone)]
pub(crate) struct TextSpanData {
    // Stored in byte offsets because Rust string slicing / validation is byte-based.
    pub(crate) start_byte: usize,
    pub(crate) end_byte: usize,
    pub(crate) foreground: Option<u32>,
    pub(crate) background: Option<u32>,
    pub(crate) bold: bool,
    pub(crate) italic: bool,
    pub(crate) underline: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct NodeData {
    pub(crate) kind: NodeType,
    pub(crate) parent: Option<u32>,
    pub(crate) children: Vec<u32>,
    pub(crate) text: String,
    pub(crate) text_spans: Vec<TextSpanData>,
    pub(crate) style: NodeStyle,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct BorderSide {
    pub(crate) width: f32,
    pub(crate) color: u32,
}

impl BorderSide {
    pub(crate) const fn none() -> Self {
        Self {
            width: 0.0,
            color: DEFAULT_BG,
        }
    }

    pub(crate) fn is_visible(&self) -> bool {
        self.width > 0.0
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ResolvedBorder {
    pub(crate) top: BorderSide,
    pub(crate) right: BorderSide,
    pub(crate) bottom: BorderSide,
    pub(crate) left: BorderSide,
    pub(crate) style: BorderStyle,
}

impl ResolvedBorder {
    pub(crate) const fn none() -> Self {
        Self {
            top: BorderSide::none(),
            right: BorderSide::none(),
            bottom: BorderSide::none(),
            left: BorderSide::none(),
            style: BorderStyle::None,
        }
    }

    pub(crate) fn has_any_visible_side(&self) -> bool {
        self.top.is_visible()
            || self.right.is_visible()
            || self.bottom.is_visible()
            || self.left.is_visible()
    }

    pub(crate) fn is_uniform_full_box(&self) -> Option<(u32, BorderStyle)> {
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
pub(crate) struct NodeStyle {
    pub(crate) gap: f32,
    pub(crate) padding_x: f32,
    pub(crate) padding_y: f32,
    pub(crate) border: ResolvedBorder,
    pub(crate) bg: u32,
    pub(crate) fg: u32,
    pub(crate) flex_grow: f32,
    pub(crate) direction: Direction,
    pub(crate) width: StyleDimension,
    pub(crate) height: StyleDimension,
    pub(crate) min_width: StyleDimension,
    pub(crate) min_height: StyleDimension,
    pub(crate) max_width: StyleDimension,
    pub(crate) max_height: StyleDimension,
    pub(crate) margin_x: f32,
    pub(crate) margin_y: f32,
    pub(crate) align_items: Option<AlignItems>,
    pub(crate) justify_content: Option<AlignContent>,
    pub(crate) align_self: Option<AlignItems>,
    pub(crate) flex_shrink: f32,
    pub(crate) flex_basis: StyleDimension,
    pub(crate) flex_wrap: FlexWrap,
    pub(crate) text_wrap: TextWrap,
    pub(crate) text_overflow: TextOverflow,
    pub(crate) multiline: bool,
    pub(crate) cursor_visible: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum TextWrap {
    None,
    Word,
    Char,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum TextOverflow {
    Clip,
    Ellipsis,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum StyleDimension {
    Auto,
    Points(f32),
}

impl NodeStyle {
    pub(crate) fn default_for_kind(kind: NodeType) -> Self {
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
            text_wrap: match kind {
                NodeType::Text => TextWrap::Word,
                NodeType::Input | NodeType::Button => TextWrap::None,
                NodeType::Row | NodeType::Column => TextWrap::None,
            },
            text_overflow: TextOverflow::Clip,
            multiline: false,
            cursor_visible: false,
        }
    }
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
    // Replaces the full span table for a Text node; text bytes still flow through
    // SetText/DeleteTextRange ops.
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

fn remove_subtree(state: &mut TreeState, node_id: u32) {
    let children = match state.nodes.get(&node_id) {
        Some(node) => node.children.clone(),
        None => return,
    };

    for child_id in children {
        remove_subtree(state, child_id);
    }

    state.nodes.remove(&node_id);
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
    // JS already normalized spans, but Rust still validates the binary payload and
    // byte ranges before accepting it into persistent tree state.
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

fn apply_style_reset(node: &mut NodeData, prop_name: &str) -> bool {
    match prop_name {
        "gap" => node.style.gap = 0.0,
        "padding" => {
            node.style.padding_x = 0.0;
            node.style.padding_y = 0.0;
        }
        "paddingX" => node.style.padding_x = 0.0,
        "paddingY" => node.style.padding_y = 0.0,
        "borderTopWidth" => node.style.border.top.width = 0.0,
        "borderRightWidth" => node.style.border.right.width = 0.0,
        "borderBottomWidth" => node.style.border.bottom.width = 0.0,
        "borderLeftWidth" => node.style.border.left.width = 0.0,
        "background" => node.style.bg = DEFAULT_BG,
        "foreground" => node.style.fg = DEFAULT_FG,
        "borderTopColor" => node.style.border.top.color = DEFAULT_BG,
        "borderRightColor" => node.style.border.right.color = DEFAULT_BG,
        "borderBottomColor" => node.style.border.bottom.color = DEFAULT_BG,
        "borderLeftColor" => node.style.border.left.color = DEFAULT_BG,
        "borderStyle" => node.style.border.style = BorderStyle::None,
        "flexGrow" => node.style.flex_grow = 0.0,
        "direction" => {
            if !node.kind.is_box() {
                return false;
            }
            node.style.direction = Direction::from_node_type(node.kind);
        }
        "width" => node.style.width = StyleDimension::Auto,
        "height" => node.style.height = StyleDimension::Auto,
        "minWidth" => node.style.min_width = StyleDimension::Auto,
        "minHeight" => node.style.min_height = StyleDimension::Auto,
        "maxWidth" => node.style.max_width = StyleDimension::Auto,
        "maxHeight" => node.style.max_height = StyleDimension::Auto,
        "margin" => {
            node.style.margin_x = 0.0;
            node.style.margin_y = 0.0;
        }
        "marginX" => node.style.margin_x = 0.0,
        "marginY" => node.style.margin_y = 0.0,
        "alignItems" => node.style.align_items = None,
        "justifyContent" => node.style.justify_content = None,
        "alignSelf" => node.style.align_self = None,
        "flexShrink" => node.style.flex_shrink = 1.0,
        "flexBasis" => node.style.flex_basis = StyleDimension::Auto,
        "flexWrap" => node.style.flex_wrap = FlexWrap::NoWrap,
        "wrap" => {
            node.style.text_wrap = match node.kind {
                NodeType::Text => TextWrap::Word,
                NodeType::Input | NodeType::Button => TextWrap::None,
                NodeType::Row | NodeType::Column => return false,
            }
        }
        "textOverflow" => node.style.text_overflow = TextOverflow::Clip,
        "multiline" => node.style.multiline = false,
        "cursorVisible" => node.style.cursor_visible = false,
        _ => return false,
    }

    true
}

fn apply_style_number(node: &mut NodeData, prop_name: &str, value: f64) -> bool {
    match prop_name {
        "gap" => match parse_style_f32(value) {
            Some(value) => node.style.gap = value,
            None => return false,
        },
        "padding" => match parse_style_f32(value) {
            Some(value) => {
                node.style.padding_x = value;
                node.style.padding_y = value;
            }
            None => return false,
        },
        "paddingX" => match parse_style_f32(value) {
            Some(value) => node.style.padding_x = value,
            None => return false,
        },
        "paddingY" => match parse_style_f32(value) {
            Some(value) => node.style.padding_y = value,
            None => return false,
        },
        "borderTopWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.top.width = value,
            None => return false,
        },
        "borderRightWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.right.width = value,
            None => return false,
        },
        "borderBottomWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.bottom.width = value,
            None => return false,
        },
        "borderLeftWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.left.width = value,
            None => return false,
        },
        "background" => match parse_style_u32(value) {
            Some(value) => node.style.bg = value,
            None => return false,
        },
        "foreground" => match parse_style_u32(value) {
            Some(value) => node.style.fg = value,
            None => return false,
        },
        "borderTopColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.top.color = value,
            None => return false,
        },
        "borderRightColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.right.color = value,
            None => return false,
        },
        "borderBottomColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.bottom.color = value,
            None => return false,
        },
        "borderLeftColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.left.color = value,
            None => return false,
        },
        "flexGrow" => match parse_style_f32(value) {
            Some(value) => node.style.flex_grow = value,
            None => return false,
        },
        "width" => match parse_style_f32(value) {
            Some(value) => node.style.width = StyleDimension::Points(value),
            None => return false,
        },
        "height" => match parse_style_f32(value) {
            Some(value) => node.style.height = StyleDimension::Points(value),
            None => return false,
        },
        "minWidth" => match parse_style_f32(value) {
            Some(value) => node.style.min_width = StyleDimension::Points(value),
            None => return false,
        },
        "minHeight" => match parse_style_f32(value) {
            Some(value) => node.style.min_height = StyleDimension::Points(value),
            None => return false,
        },
        "maxWidth" => match parse_style_f32(value) {
            Some(value) => node.style.max_width = StyleDimension::Points(value),
            None => return false,
        },
        "maxHeight" => match parse_style_f32(value) {
            Some(value) => node.style.max_height = StyleDimension::Points(value),
            None => return false,
        },
        "margin" => match parse_style_f32(value) {
            Some(value) => {
                node.style.margin_x = value;
                node.style.margin_y = value;
            }
            None => return false,
        },
        "marginX" => match parse_style_f32(value) {
            Some(value) => node.style.margin_x = value,
            None => return false,
        },
        "marginY" => match parse_style_f32(value) {
            Some(value) => node.style.margin_y = value,
            None => return false,
        },
        "flexShrink" => match parse_style_f32(value) {
            Some(value) => node.style.flex_shrink = value,
            None => return false,
        },
        "flexBasis" => match parse_style_f32(value) {
            Some(value) => node.style.flex_basis = StyleDimension::Points(value),
            None => return false,
        },
        "multiline" => node.style.multiline = value != 0.0,
        "cursorVisible" => node.style.cursor_visible = value != 0.0,
        _ => return false,
    }

    true
}

fn apply_style_string(node: &mut NodeData, prop_name: &str, value: &str) -> bool {
    match prop_name {
        "padding" => match parse_axis_pair(value) {
            Some((x, y)) => {
                node.style.padding_x = x;
                node.style.padding_y = y;
            }
            None => return false,
        },
        "margin" => match parse_axis_pair(value) {
            Some((x, y)) => {
                node.style.margin_x = x;
                node.style.margin_y = y;
            }
            None => return false,
        },
        "borderStyle" => match parse_border_style(value) {
            Some(value) => node.style.border.style = value,
            None => return false,
        },
        "direction" => {
            if !node.kind.is_box() {
                return false;
            }

            node.style.direction = match parse_direction(value) {
                Some(value) => value,
                None => return false,
            };
        }
        "alignItems" => match parse_align_items(value) {
            Some(value) => node.style.align_items = Some(value),
            None => return false,
        },
        "justifyContent" => match parse_justify_content(value) {
            Some(value) => node.style.justify_content = Some(value),
            None => return false,
        },
        "alignSelf" => match parse_align_items(value) {
            Some(value) => node.style.align_self = Some(value),
            None => return false,
        },
        "flexWrap" => match parse_flex_wrap(value) {
            Some(value) => node.style.flex_wrap = value,
            None => return false,
        },
        "wrap" => match parse_text_wrap(value) {
            Some(value) => node.style.text_wrap = value,
            None => return false,
        },
        "textOverflow" => match parse_text_overflow(value) {
            Some(value) => node.style.text_overflow = value,
            None => return false,
        },
        _ => return false,
    }

    true
}

#[unsafe(no_mangle)]
pub extern "C" fn clear_tree_state() -> c_int {
    let mut state = TREE_STATE.lock().unwrap();
    state.root_id = None;
    state.nodes.clear();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn apply_ops(ops_ptr: *const u8, ops_len: u32) -> c_int {
    if ops_len > 0 && ops_ptr.is_null() {
        return 0;
    }

    let ops_bytes: &[u8] = if ops_len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ops_ptr, ops_len as usize) }
    };

    if ops_bytes.is_empty() {
        return 1;
    }

    let mut state = TREE_STATE.lock().unwrap();
    let mut offset = 0usize;
    while offset < ops_bytes.len() {
        // Record layout: <op><node_id><payload_len><payload>
        let header = match ops_bytes.get(offset..offset + RECORD_HEADER_SIZE) {
            Some(header) => header,
            None => return 0,
        };

        let op = match OpType::from_u8(header[0]) {
            Some(op) => op,
            None => return 0,
        };

        let node_id = match header[OP_SIZE..OP_SIZE + ID_SIZE].try_into().ok() {
            Some(bytes) => u32::from_le_bytes(bytes),
            None => return 0,
        };

        let payload_len = match header[OP_SIZE + ID_SIZE..RECORD_HEADER_SIZE]
            .try_into()
            .ok()
        {
            Some(bytes) => u32::from_le_bytes(bytes) as usize,
            None => return 0,
        };

        offset += RECORD_HEADER_SIZE;

        let payload = match ops_bytes.get(offset..offset + payload_len) {
            Some(payload) => payload,
            None => return 0,
        };

        match op {
            OpType::AddNode => {
                if payload.len() != KIND_SIZE {
                    return 0;
                }
                if state.nodes.contains_key(&node_id) {
                    return 0;
                }

                let kind = match NodeType::from_u8(payload[0]) {
                    Some(kind) => kind,
                    None => return 0,
                };

                state.nodes.insert(
                    node_id,
                    NodeData {
                        kind,
                        parent: None,
                        children: Vec::new(),
                        text: String::new(),
                        text_spans: Vec::new(),
                        style: NodeStyle::default_for_kind(kind),
                    },
                );
            }
            OpType::SetText => {
                let appended_text = match std::str::from_utf8(payload) {
                    Ok(text) => text,
                    Err(_) => return 0,
                };

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if !node.kind.supports_text() {
                    return 0;
                }

                node.text.push_str(appended_text);
            }
            OpType::DeleteTextRange => {
                if payload.len() != ID_SIZE * 2 {
                    return 0;
                }

                let start_byte = match payload[0..ID_SIZE].try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes) as usize,
                    None => return 0,
                };

                let end_byte = match payload[ID_SIZE..ID_SIZE * 2].try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes) as usize,
                    None => return 0,
                };

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if !node.kind.supports_text() {
                    return 0;
                }

                if start_byte > end_byte || end_byte > node.text.len() {
                    return 0;
                }

                if !node.text.is_char_boundary(start_byte) || !node.text.is_char_boundary(end_byte)
                {
                    return 0;
                }

                node.text.replace_range(start_byte..end_byte, "");
            }
            OpType::SetTextSpans => {
                // Span metadata is stored separately from the text buffer so compatible
                // frames can diff text bytes and styling independently.
                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if node.kind != NodeType::Text {
                    return 0;
                }

                let spans = match parse_text_spans(payload, &node.text) {
                    Some(spans) => spans,
                    None => return 0,
                };

                node.text_spans = spans;
            }
            OpType::SetRoot => {
                if !payload.is_empty() || !state.nodes.contains_key(&node_id) {
                    return 0;
                }
                state.root_id = Some(node_id);
            }
            OpType::DeleteNode => {
                if !payload.is_empty() || !state.nodes.contains_key(&node_id) {
                    return 0;
                }

                let deleted_node_parent_id = state.nodes.get(&node_id).and_then(|node| node.parent);
                if let Some(parent_id) = deleted_node_parent_id {
                    if let Some(parent) = state.nodes.get_mut(&parent_id) {
                        parent.children.retain(|child_id| *child_id != node_id);
                    }
                }

                if state.root_id == Some(node_id) {
                    state.root_id = None;
                }

                remove_subtree(&mut state, node_id);
            }
            OpType::AppendChild => {
                if payload.len() != ID_SIZE {
                    return 0;
                }

                let parent_id = node_id;
                let child_id = match payload.try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes),
                    None => return 0,
                };

                if parent_id == child_id {
                    return 0;
                }

                if !state.nodes.contains_key(&parent_id) || !state.nodes.contains_key(&child_id) {
                    return 0;
                }

                let child_parent_id = match state.nodes.get(&child_id) {
                    Some(child) => child.parent,
                    None => return 0,
                };
                if child_parent_id.is_some() {
                    return 0;
                }

                // Walk upward from the proposed parent. If we ever reach the child,
                // attaching here would create a cycle.
                let mut current_parent_id = Some(parent_id);
                while let Some(parent_id_in_chain) = current_parent_id {
                    if parent_id_in_chain == child_id {
                        return 0;
                    }
                    current_parent_id = state
                        .nodes
                        .get(&parent_id_in_chain)
                        .and_then(|node| node.parent);
                }

                // Store the relationship in both directions.
                if let Some(parent) = state.nodes.get_mut(&parent_id) {
                    parent.children.push(child_id);
                } else {
                    return 0;
                }

                if let Some(child) = state.nodes.get_mut(&child_id) {
                    child.parent = Some(parent_id);
                } else {
                    return 0;
                }
            }
            OpType::UpdateStyle => {
                if payload.len() < 2 {
                    return 0;
                }

                let prop_name_len = payload[0] as usize;
                if prop_name_len == 0 || payload.len() < 1 + prop_name_len + 1 {
                    return 0;
                }

                let prop_name_end = 1 + prop_name_len;
                let prop_name = match std::str::from_utf8(&payload[1..prop_name_end]) {
                    Ok(prop_name) => prop_name,
                    Err(_) => return 0,
                };

                let value_kind = payload[prop_name_end];
                let value_payload = &payload[prop_name_end + 1..];

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                let success = match value_kind {
                    STYLE_VALUE_RESET => {
                        if !value_payload.is_empty() {
                            return 0;
                        }
                        apply_style_reset(node, prop_name)
                    }
                    STYLE_VALUE_NUMBER => {
                        let value = match parse_style_number(value_payload) {
                            Some(value) => value,
                            None => return 0,
                        };
                        apply_style_number(node, prop_name, value)
                    }
                    STYLE_VALUE_STRING => {
                        let value = match parse_style_string(value_payload) {
                            Some(value) => value,
                            None => return 0,
                        };
                        apply_style_string(node, prop_name, value)
                    }
                    _ => return 0,
                };

                if !success {
                    return 0;
                }
            }
        }

        offset += payload_len;
    }

    1
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum NodeType {
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

    pub(crate) fn supports_text(self) -> bool {
        matches!(self, NodeType::Text | NodeType::Button | NodeType::Input)
    }

    pub(crate) fn is_box(self) -> bool {
        matches!(self, NodeType::Row | NodeType::Column)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum Direction {
    Row = 1,
    Column = 2,
    RowReverse = 3,
    ColumnReverse = 4,
}

impl Direction {
    pub(crate) fn from_node_type(kind: NodeType) -> Self {
        match kind {
            NodeType::Row => Direction::Row,
            NodeType::Column => Direction::Column,
            _ => Direction::Column,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum BorderStyle {
    None = 0,
    Rounded = 1,
    Squared = 2,
}
