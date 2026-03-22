use crate::shared::{
    CELL_STRIDE, CONTINUATION_CELL, CURRENT_BUFFER, DEFAULT_BG, DEFAULT_FG, FRAMES, TERMINAL_SIZE,
};
use crate::text_layout::{
    ClipRect, TextLayoutRequest, layout_text, measure_max_content, measure_min_content,
};
use crate::tree::{
    BorderStyle, Direction, NodeData, NodeType, ResolvedBorder, StyleDimension, TREE_STATE,
    TextOverflow, TextSpanData, TextWrap, TreeState,
};
use std::{cell::RefCell, os::raw::c_int};
use taffy::{Overflow, Point, prelude::*};

thread_local! {
    static TREE: RefCell<TaffyTree<NodeContext>> = RefCell::new(TaffyTree::new());
}

fn style_dimension_to_taffy(dim: StyleDimension) -> Dimension {
    match dim {
        StyleDimension::Auto => Dimension::auto(),
        StyleDimension::Points(v) => Dimension::length(v),
    }
}

fn quantize_origin(value: f32) -> u16 {
    value.max(0.0).floor().min(u16::MAX as f32) as u16
}

fn quantize_size(value: f32) -> u16 {
    value.max(0.0).floor().min(u16::MAX as f32) as u16
}

fn resolved_default_fg(fg: u32, parent_fg: u32) -> u32 {
    if fg != 0 { fg } else { parent_fg }
}

fn resolved_default_bg(bg: u32, parent_bg: u32) -> u32 {
    if bg != 0 { bg } else { parent_bg }
}

fn input_should_default_to_flex_grow(data: &NodeData, parent_kind: Option<NodeType>) -> bool {
    if data.kind != NodeType::Input || data.style.flex_grow != 0.0 {
        return false;
    }

    if !matches!(data.style.width, StyleDimension::Auto) {
        return false;
    }

    matches!(parent_kind, Some(NodeType::Row))
}

fn node_data_to_style(data: &NodeData, parent_kind: Option<NodeType>) -> Style {
    let s = &data.style;
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
        ..Default::default()
    };

    match s.direction {
        Direction::Row => style.flex_direction = FlexDirection::Row,
        Direction::Column => style.flex_direction = FlexDirection::Column,
        Direction::RowReverse => style.flex_direction = FlexDirection::RowReverse,
        Direction::ColumnReverse => style.flex_direction = FlexDirection::ColumnReverse,
    }

    match data.kind {
        NodeType::Column => {
            if s.align_items.is_none() {
                style.align_items = Some(AlignItems::Stretch);
            }
            style.overflow = Point {
                x: Overflow::Hidden,
                y: Overflow::Hidden,
            };
        }
        NodeType::Input => {}
        _ => {}
    }

    if input_should_default_to_flex_grow(data, parent_kind) {
        style.flex_grow = 1.0;
    }

    style
}

fn effective_wrap(kind: NodeType, data: &NodeData) -> TextWrap {
    match kind {
        NodeType::Text => data.style.text_wrap,
        NodeType::Input => {
            if data.style.multiline {
                match data.style.text_wrap {
                    TextWrap::None => TextWrap::Word,
                    wrap => wrap,
                }
            } else {
                TextWrap::None
            }
        }
        NodeType::Button => TextWrap::None,
        NodeType::Row | NodeType::Column => TextWrap::None,
    }
}

fn effective_overflow(kind: NodeType, data: &NodeData) -> TextOverflow {
    match kind {
        NodeType::Text => data.style.text_overflow,
        _ => TextOverflow::Clip,
    }
}

enum NodeContext {
    Text {
        content: String,
        spans: Vec<TextSpanData>,
        fg: u32,
        bg: u32,
        wrap: TextWrap,
        overflow: TextOverflow,
    },
    Button {
        label: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
        wrap: TextWrap,
        overflow: TextOverflow,
    },
    Input {
        content: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
        wrap: TextWrap,
        cursor_visible: bool,
    },
    Row {
        bg: u32,
        fg: u32,
        border: ResolvedBorder,
    },
    Column {
        bg: u32,
        fg: u32,
        border: ResolvedBorder,
    },
}

fn node_data_to_context(data: &NodeData) -> NodeContext {
    let s = &data.style;
    match data.kind {
        NodeType::Column => NodeContext::Column {
            bg: s.bg,
            fg: s.fg,
            border: s.border,
        },
        NodeType::Row => NodeContext::Row {
            bg: s.bg,
            fg: s.fg,
            border: s.border,
        },
        NodeType::Text => NodeContext::Text {
            content: data.text.clone(),
            spans: data.text_spans.clone(),
            fg: s.fg,
            bg: s.bg,
            wrap: effective_wrap(data.kind, data),
            overflow: effective_overflow(data.kind, data),
        },
        NodeType::Button => NodeContext::Button {
            label: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
            wrap: effective_wrap(data.kind, data),
            overflow: effective_overflow(data.kind, data),
        },
        NodeType::Input => NodeContext::Input {
            content: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
            wrap: effective_wrap(data.kind, data),
            cursor_visible: s.cursor_visible,
        },
    }
}

fn build_taffy_from_state(
    taffy: &mut TaffyTree<NodeContext>,
    state: &TreeState,
    node_id: u32,
    taffy_parent: Option<NodeId>,
) -> Option<NodeId> {
    let data = state.nodes.get(&node_id)?;
    let parent_kind = data
        .parent
        .and_then(|parent_id| state.nodes.get(&parent_id))
        .map(|parent| parent.kind);
    let style = node_data_to_style(data, parent_kind);
    let context = node_data_to_context(data);
    let taffy_node = taffy.new_leaf_with_context(style, context).unwrap();

    if let Some(parent) = taffy_parent {
        taffy.add_child(parent, taffy_node).unwrap();
    }

    for &child_id in &data.children {
        build_taffy_from_state(taffy, state, child_id, Some(taffy_node));
    }

    Some(taffy_node)
}

fn build_frames_array(
    taffy: &mut TaffyTree<NodeContext>,
    node: NodeId,
    out: &mut Vec<f32>,
    offset_x: f32,
    offset_y: f32,
) {
    let layout = taffy.layout(node).unwrap();

    let absolute_x = offset_x + layout.location.x;
    let absolute_y = offset_y + layout.location.y;

    out.extend([
        absolute_x,
        absolute_y,
        layout.size.width,
        layout.size.height,
    ]);

    let children = taffy.children(node).unwrap();
    for child in children {
        build_frames_array(taffy, child, out, absolute_x, absolute_y);
    }
}

fn measure_function(
    known_dimensions: Size<Option<f32>>,
    available_space: Size<AvailableSpace>,
    _node_id: NodeId,
    node_context: Option<&mut NodeContext>,
    _style: &Style,
) -> Size<f32> {
    if let Size {
        width: Some(width),
        height: Some(height),
    } = known_dimensions
    {
        return Size { width, height };
    }

    let (text, spans, wrap, overflow, fg, bg, show_cursor) = match node_context {
        Some(NodeContext::Text {
            content,
            spans,
            wrap,
            overflow,
            fg,
            bg,
        }) => (
            content.as_str(),
            spans.as_slice(),
            *wrap,
            *overflow,
            *fg,
            *bg,
            false,
        ),
        Some(NodeContext::Button {
            label,
            wrap,
            overflow,
            fg,
            bg,
            ..
        }) => (label.as_str(), &[][..], *wrap, *overflow, *fg, *bg, false),
        Some(NodeContext::Input {
            content,
            wrap,
            fg,
            bg,
            cursor_visible,
            ..
        }) => (
            content.as_str(),
            &[][..],
            *wrap,
            TextOverflow::Clip,
            *fg,
            *bg,
            *cursor_visible,
        ),
        Some(NodeContext::Row { .. }) | Some(NodeContext::Column { .. }) => return Size::ZERO,
        None => return Size::ZERO,
    };

    let resolved_fg = if fg != 0 { fg } else { DEFAULT_FG };
    let resolved_bg = if bg != 0 { bg } else { DEFAULT_BG };

    let result = match available_space.width {
        AvailableSpace::MaxContent => measure_max_content(text, spans, resolved_fg, resolved_bg),
        AvailableSpace::MinContent => {
            let min_width = measure_min_content(text, spans, wrap, resolved_fg, resolved_bg);
            layout_text(&TextLayoutRequest {
                text,
                spans,
                max_width: Some(min_width),
                wrap,
                overflow,
                cursor: if show_cursor { Some(text.len()) } else { None },
                show_cursor,
                default_fg: resolved_fg,
                default_bg: resolved_bg,
            })
        }
        AvailableSpace::Definite(width) => layout_text(&TextLayoutRequest {
            text,
            spans,
            max_width: Some(quantize_size(width)),
            wrap,
            overflow,
            cursor: if show_cursor { Some(text.len()) } else { None },
            show_cursor,
            default_fg: resolved_fg,
            default_bg: resolved_bg,
        }),
    };

    Size {
        width: result.width as f32,
        height: result.height as f32,
    }
}

fn set_buffer_cell(
    buf: &mut [u64],
    col: u16,
    row: u16,
    ch: char,
    fg: u32,
    bg: u32,
    attrs: u8,
    tw: u16,
    th: u16,
) {
    if col >= tw || row >= th {
        return;
    }

    let idx = (tw * row + col) as usize * CELL_STRIDE;
    if idx + (CELL_STRIDE - 1) >= buf.len() {
        return;
    }

    buf[idx] = ch as u64;
    buf[idx + 1] = fg as u64;
    buf[idx + 2] = bg as u64;
    buf[idx + 3] = attrs as u64;
}

fn set_buffer_cell_clipped(
    buf: &mut [u64],
    clip: ClipRect,
    col: u16,
    row: u16,
    ch: char,
    fg: u32,
    bg: u32,
    attrs: u8,
    tw: u16,
    th: u16,
) {
    if !clip.contains(col, row) {
        return;
    }
    set_buffer_cell(buf, col, row, ch, fg, bg, attrs, tw, th);
}

fn draw_background_at(
    buf: &mut [u64],
    clip: ClipRect,
    x: u16,
    y: u16,
    w: u16,
    h: u16,
    bg: u32,
    tw: u16,
    th: u16,
) {
    for row in y..y.saturating_add(h) {
        for col in x..x.saturating_add(w) {
            set_buffer_cell_clipped(buf, clip, col, row, ' ', DEFAULT_FG, bg, 0, tw, th);
        }
    }
}

fn set_border_cell(
    buf: &mut [u64],
    clip: ClipRect,
    col: u16,
    row: u16,
    ch: char,
    color: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    set_buffer_cell_clipped(buf, clip, col, row, ch, color, bg, 0, tw, th);
}

fn draw_uniform_border_at(
    buf: &mut [u64],
    clip: ClipRect,
    x: u16,
    y: u16,
    w: u16,
    h: u16,
    color: u32,
    bg: u32,
    style: BorderStyle,
    tw: u16,
    th: u16,
) {
    if w == 0 || h == 0 {
        return;
    }

    let x_end = x.saturating_add(w).saturating_sub(1);
    let y_end = y.saturating_add(h).saturating_sub(1);

    let (tl, tr, bl, br, h_line, v_line) = match style {
        BorderStyle::Rounded => ('╭', '╮', '╰', '╯', '─', '│'),
        BorderStyle::Squared => ('┌', '┐', '└', '┘', '─', '│'),
        BorderStyle::None => return,
    };

    set_border_cell(buf, clip, x, y, tl, color, bg, tw, th);
    set_border_cell(buf, clip, x_end, y, tr, color, bg, tw, th);
    set_border_cell(buf, clip, x, y_end, bl, color, bg, tw, th);
    set_border_cell(buf, clip, x_end, y_end, br, color, bg, tw, th);

    for col in x.saturating_add(1)..x_end {
        set_border_cell(buf, clip, col, y, h_line, color, bg, tw, th);
        set_border_cell(buf, clip, col, y_end, h_line, color, bg, tw, th);
    }
    for row in y.saturating_add(1)..y_end {
        set_border_cell(buf, clip, x, row, v_line, color, bg, tw, th);
        set_border_cell(buf, clip, x_end, row, v_line, color, bg, tw, th);
    }
}

fn draw_resolved_border_at(
    buf: &mut [u64],
    clip: ClipRect,
    x: u16,
    y: u16,
    w: u16,
    h: u16,
    border: ResolvedBorder,
    bg: u32,
    tw: u16,
    th: u16,
) {
    if w == 0 || h == 0 || !border.has_any_visible_side() {
        return;
    }

    if let Some((color, style)) = border.is_uniform_full_box() {
        draw_uniform_border_at(buf, clip, x, y, w, h, color, bg, style, tw, th);
        return;
    }

    let x_end = x.saturating_add(w).saturating_sub(1);
    let y_end = y.saturating_add(h).saturating_sub(1);

    let top = border.top.is_visible();
    let right = border.right.is_visible();
    let bottom = border.bottom.is_visible();
    let left = border.left.is_visible();

    if top {
        for col in x..=x_end {
            set_border_cell(buf, clip, col, y, '─', border.top.color, bg, tw, th);
        }
    }
    if bottom {
        for col in x..=x_end {
            set_border_cell(buf, clip, col, y_end, '─', border.bottom.color, bg, tw, th);
        }
    }
    if left {
        for row in y..=y_end {
            set_border_cell(buf, clip, x, row, '│', border.left.color, bg, tw, th);
        }
    }
    if right {
        for row in y..=y_end {
            set_border_cell(buf, clip, x_end, row, '│', border.right.color, bg, tw, th);
        }
    }

    if top && left {
        set_border_cell(buf, clip, x, y, '┌', border.top.color, bg, tw, th);
    }
    if top && right {
        set_border_cell(buf, clip, x_end, y, '┐', border.top.color, bg, tw, th);
    }
    if bottom && left {
        set_border_cell(buf, clip, x, y_end, '└', border.bottom.color, bg, tw, th);
    }
    if bottom && right {
        set_border_cell(
            buf,
            clip,
            x_end,
            y_end,
            '┘',
            border.bottom.color,
            bg,
            tw,
            th,
        );
    }
}

fn paint_text_layout(
    buf: &mut [u64],
    clip: ClipRect,
    x: u16,
    y: u16,
    request: TextLayoutRequest<'_>,
    tw: u16,
    th: u16,
) {
    let result = layout_text(&request);

    for (row_index, line) in result.lines.iter().enumerate() {
        let abs_row = y.saturating_add(row_index as u16);
        if abs_row >= th {
            break;
        }

        for cell in &line.cells {
            let abs_col = x.saturating_add(cell.display_col);
            if cell.width == 2 {
                let Some(continuation_col) = abs_col.checked_add(1) else {
                    continue;
                };

                if !clip.contains(abs_col, abs_row)
                    || !clip.contains(continuation_col, abs_row)
                    || continuation_col >= tw
                {
                    continue;
                }

                set_buffer_cell(
                    buf,
                    abs_col,
                    abs_row,
                    cell.ch,
                    cell.foreground,
                    cell.background,
                    cell.attrs,
                    tw,
                    th,
                );
                set_buffer_cell(
                    buf,
                    continuation_col,
                    abs_row,
                    CONTINUATION_CELL,
                    cell.foreground,
                    cell.background,
                    cell.attrs,
                    tw,
                    th,
                );
                continue;
            }

            set_buffer_cell_clipped(
                buf,
                clip,
                abs_col,
                abs_row,
                cell.ch,
                cell.foreground,
                cell.background,
                cell.attrs,
                tw,
                th,
            );
        }
    }

    if let Some(cursor) = result.cursor {
        let abs_col = x.saturating_add(cursor.col);
        let abs_row = y.saturating_add(cursor.row);
        set_buffer_cell_clipped(
            buf,
            clip,
            abs_col,
            abs_row,
            '█',
            request.default_fg,
            request.default_bg,
            0,
            tw,
            th,
        );
    }
}

fn paint_taffy_node(
    taffy: &TaffyTree<NodeContext>,
    node_id: NodeId,
    buf: &mut [u64],
    abs_x: f32,
    abs_y: f32,
    parent_fg: u32,
    parent_bg: u32,
    inherited_clip: ClipRect,
    tw: u16,
    th: u16,
) {
    let layout = taffy.layout(node_id).unwrap();
    let x = quantize_origin(abs_x + layout.location.x);
    let y = quantize_origin(abs_y + layout.location.y);
    let w = quantize_size(layout.size.width);
    let h = quantize_size(layout.size.height);

    let content_x = quantize_origin(abs_x + layout.content_box_x());
    let content_y = quantize_origin(abs_y + layout.content_box_y());
    let content_w = quantize_size(layout.content_box_width());
    let content_h = quantize_size(layout.content_box_height());

    let node_clip = inherited_clip.intersect(ClipRect {
        left: x,
        top: y,
        right: x.saturating_add(w),
        bottom: y.saturating_add(h),
    });
    let content_clip = inherited_clip.intersect(ClipRect {
        left: content_x,
        top: content_y,
        right: content_x.saturating_add(content_w),
        bottom: content_y.saturating_add(content_h),
    });

    let (fg, bg) = match taffy.get_node_context(node_id) {
        Some(NodeContext::Text {
            content,
            spans,
            fg,
            bg,
            wrap,
            overflow,
        }) => {
            let fg = resolved_default_fg(*fg, parent_fg);
            let bg = resolved_default_bg(*bg, parent_bg);
            draw_background_at(buf, node_clip, x, y, w, h, bg, tw, th);
            paint_text_layout(
                buf,
                content_clip,
                content_x,
                content_y,
                TextLayoutRequest {
                    text: content,
                    spans,
                    max_width: Some(content_w),
                    wrap: *wrap,
                    overflow: *overflow,
                    cursor: None,
                    show_cursor: false,
                    default_fg: fg,
                    default_bg: bg,
                },
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border,
            wrap,
            overflow,
        }) => {
            let fg = resolved_default_fg(*fg, parent_fg);
            let bg = resolved_default_bg(*bg, parent_bg);
            draw_background_at(buf, node_clip, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, node_clip, x, y, w, h, *border, bg, tw, th);
            paint_text_layout(
                buf,
                content_clip,
                content_x,
                content_y,
                TextLayoutRequest {
                    text: label,
                    spans: &[],
                    max_width: Some(content_w),
                    wrap: *wrap,
                    overflow: *overflow,
                    cursor: None,
                    show_cursor: false,
                    default_fg: fg,
                    default_bg: bg,
                },
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border,
            wrap,
            cursor_visible,
        }) => {
            let fg = resolved_default_fg(*fg, parent_fg);
            let bg = resolved_default_bg(*bg, parent_bg);
            draw_background_at(buf, node_clip, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, node_clip, x, y, w, h, *border, bg, tw, th);
            paint_text_layout(
                buf,
                content_clip,
                content_x,
                content_y,
                TextLayoutRequest {
                    text: content,
                    spans: &[],
                    max_width: Some(content_w),
                    wrap: *wrap,
                    overflow: TextOverflow::Clip,
                    cursor: if *cursor_visible {
                        Some(content.len())
                    } else {
                        None
                    },
                    show_cursor: *cursor_visible,
                    default_fg: fg,
                    default_bg: bg,
                },
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Row { fg, bg, border })
        | Some(NodeContext::Column { fg, bg, border }) => {
            let fg = resolved_default_fg(*fg, parent_fg);
            let bg = resolved_default_bg(*bg, parent_bg);
            draw_background_at(buf, node_clip, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, node_clip, x, y, w, h, *border, bg, tw, th);
            (fg, bg)
        }
        None => (parent_fg, parent_bg),
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(
            taffy,
            child,
            buf,
            abs_x + layout.location.x,
            abs_y + layout.location.y,
            fg,
            bg,
            content_clip,
            tw,
            th,
        );
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn render() -> c_int {
    let state = TREE_STATE.lock().unwrap();
    let root_id = match state.root_id {
        Some(id) => id,
        None => return 0,
    };

    TREE.with_borrow_mut(|taffy| {
        let term_size = TERMINAL_SIZE.lock().unwrap();
        let (tw, th) = *term_size;
        drop(term_size);

        let taffy_root = match build_taffy_from_state(taffy, &state, root_id, None) {
            Some(id) => id,
            None => return 0,
        };

        let mut root_style = taffy.style(taffy_root).unwrap().clone();
        root_style.size = Size {
            width: length(tw),
            height: length(th),
        };
        taffy.set_style(taffy_root, root_style).unwrap();

        let _ = taffy.compute_layout_with_measure(
            taffy_root,
            Size {
                width: length(tw),
                height: length(th),
            },
            |known_dimensions, available_space, node_id, node_context, style| {
                measure_function(
                    known_dimensions,
                    available_space,
                    node_id,
                    node_context,
                    style,
                )
            },
        );

        let mut frame_lock = FRAMES.lock().unwrap();
        let frames_vec = frame_lock.get_or_insert_with(Vec::new);
        frames_vec.clear();
        build_frames_array(taffy, taffy_root, frames_vec, 0.0, 0.0);
        drop(frame_lock);

        let root_data = state.nodes.get(&root_id);
        let parent_fg = root_data.map_or(DEFAULT_FG, |d| d.style.fg);
        let parent_bg = root_data.map_or(DEFAULT_BG, |d| d.style.bg);

        let mut cb = CURRENT_BUFFER.lock().unwrap();
        if let Some(ref mut buf) = *cb {
            paint_taffy_node(
                taffy,
                taffy_root,
                buf,
                0.0,
                0.0,
                parent_fg,
                parent_bg,
                ClipRect {
                    left: 0,
                    top: 0,
                    right: tw,
                    bottom: th,
                },
                tw,
                th,
            );
        }

        taffy.clear();
        1
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tree::{NodeData, NodeStyle};

    fn make_node(kind: NodeType) -> NodeData {
        NodeData {
            kind,
            parent: None,
            children: Vec::new(),
            text: String::new(),
            text_spans: Vec::new(),
            style: NodeStyle::default_for_kind(kind),
        }
    }

    fn cell_code(buf: &[u64], width: u16, col: u16, row: u16) -> u64 {
        let idx = (width * row + col) as usize * CELL_STRIDE;
        buf[idx]
    }

    #[test]
    fn multiline_input_defaults_to_word_wrap() {
        let mut node = make_node(NodeType::Input);
        node.style.multiline = true;

        assert_eq!(effective_wrap(NodeType::Input, &node), TextWrap::Word);
    }

    #[test]
    fn input_defaults_to_flex_grow_inside_rows_only() {
        let input = make_node(NodeType::Input);

        assert_eq!(node_data_to_style(&input, Some(NodeType::Row)).flex_grow, 1.0);
        assert_eq!(node_data_to_style(&input, Some(NodeType::Column)).flex_grow, 0.0);
        assert_eq!(node_data_to_style(&input, None).flex_grow, 0.0);
    }

    #[test]
    fn partially_clipped_wide_glyph_is_skipped() {
        let mut buf = vec![0u64; 4 * CELL_STRIDE];
        paint_text_layout(
            &mut buf,
            ClipRect {
                left: 1,
                top: 0,
                right: 4,
                bottom: 1,
            },
            0,
            0,
            TextLayoutRequest {
                text: "🙂",
                spans: &[],
                max_width: Some(4),
                wrap: TextWrap::None,
                overflow: TextOverflow::Clip,
                cursor: None,
                show_cursor: false,
                default_fg: DEFAULT_FG,
                default_bg: DEFAULT_BG,
            },
            4,
            1,
        );

        assert_eq!(cell_code(&buf, 4, 0, 0), 0);
        assert_eq!(cell_code(&buf, 4, 1, 0), 0);
    }

    #[test]
    fn fully_visible_wide_glyph_writes_lead_and_continuation_cells() {
        let mut buf = vec![0u64; 4 * CELL_STRIDE];
        paint_text_layout(
            &mut buf,
            ClipRect {
                left: 0,
                top: 0,
                right: 4,
                bottom: 1,
            },
            0,
            0,
            TextLayoutRequest {
                text: "🙂",
                spans: &[],
                max_width: Some(4),
                wrap: TextWrap::None,
                overflow: TextOverflow::Clip,
                cursor: None,
                show_cursor: false,
                default_fg: DEFAULT_FG,
                default_bg: DEFAULT_BG,
            },
            4,
            1,
        );

        assert_eq!(cell_code(&buf, 4, 0, 0), '🙂' as u64);
        assert_eq!(cell_code(&buf, 4, 1, 0), CONTINUATION_CELL as u64);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_ptr() -> *const f32 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.as_ptr(),
        None => std::ptr::null(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_len() -> u64 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.len() as u64,
        None => 0,
    }
}
