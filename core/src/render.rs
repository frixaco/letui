//! Layout, frame extraction, and terminal painting for the Rust renderer.

use crate::shared::{
    CURRENT_BUFFER, DEFAULT_BG, DEFAULT_FG, FIELDS_PER_CELL, FRAMES, TERMINAL_SIZE, TEXT_ATTR_BOLD,
    TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use crate::tree::{BorderStyle, Direction, NodeData, NodeType, ResolvedBorder, StyleDimension};
use crate::tree::{TREE_STATE, TextSpanData, TreeState};
use std::{cell::RefCell, os::raw::c_int};
use taffy::{Overflow, Point, prelude::*};

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
                parent_fg,
                parent_bg,
                Buffer {
                    buf,
                    x: 0.0,
                    y: 0.0,
                    tw,
                    th,
                },
            );
        }

        taffy.clear();
        1
    })
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

enum NodeContext {
    Text {
        content: String,
        spans: Vec<TextSpanData>,
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
    },
    Input {
        content: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
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

fn style_dimension_to_taffy(dim: StyleDimension) -> Dimension {
    match dim {
        StyleDimension::Auto => Dimension::auto(),
        StyleDimension::Points(v) => Dimension::length(v),
    }
}

fn text_span_attr_flags(span: &TextSpanData) -> u8 {
    let mut flags = 0;
    if span.bold {
        flags |= TEXT_ATTR_BOLD;
    }
    if span.italic {
        flags |= TEXT_ATTR_ITALIC;
    }
    if span.underline {
        flags |= TEXT_ATTR_UNDERLINE;
    }
    flags
}

fn node_data_to_style(data: &NodeData) -> Style {
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
        NodeType::Input => {
            if s.flex_grow == 0.0 {
                style.flex_grow = 1.0;
            }
        }
        _ => {}
    }

    style
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
        },
        NodeType::Button => NodeContext::Button {
            label: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
        },
        NodeType::Input => NodeContext::Input {
            content: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
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
    let style = node_data_to_style(data);
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

    let text = match node_context {
        Some(NodeContext::Text { content, .. }) => content.as_str(),
        Some(NodeContext::Button { label, .. }) => label.as_str(),
        Some(NodeContext::Input { content, .. }) => content.as_str(),
        Some(NodeContext::Row { .. }) | Some(NodeContext::Column { .. }) => return Size::ZERO,
        None => return Size::ZERO,
    };

    let text_width = text.chars().count() as f32;

    let max_width = match available_space.width {
        AvailableSpace::Definite(w) => w,
        _ => text_width,
    };

    if text_width <= max_width {
        return Size {
            width: text_width,
            height: 1.0,
        };
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    let mut lines = 1;
    let mut current_width: f32 = 0.0;
    let mut max_line_width: f32 = 0.0;

    for word in words {
        let word_width = word.chars().count() as f32;
        let needed_width = if current_width == 0.0 {
            word_width
        } else {
            current_width + 1.0 + word_width
        };

        if needed_width > max_width {
            lines += 1;
            max_line_width = max_line_width.max(current_width);
            current_width = word_width;
        } else {
            current_width = needed_width;
        }
    }

    Size {
        width: max_line_width.max(max_width),
        height: lines as f32,
    }
}

thread_local! {
    static TREE: RefCell<TaffyTree<NodeContext>> = RefCell::new(TaffyTree::new());
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

    let idx = (tw * row + col) as usize * FIELDS_PER_CELL;
    if idx + (FIELDS_PER_CELL - 1) >= buf.len() {
        return;
    }

    buf[idx] = ch as u64;
    buf[idx + 1] = fg as u64;
    buf[idx + 2] = bg as u64;
    buf[idx + 3] = attrs as u64;
}

fn draw_background_at(buf: &mut [u64], x: f32, y: f32, w: f32, h: f32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = (x + w).min(tw as f32) as u16;
    let y_end = (y + h).min(th as f32) as u16;

    for row in y_start..y_end {
        for col in x_start..x_end {
            set_buffer_cell(buf, col, row, ' ', DEFAULT_FG, bg, 0, tw, th);
        }
    }
}

fn draw_text_at(buf: &mut [u64], x: f32, y: f32, text: &str, fg: u32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_row = y as u16;

    if y_row >= th {
        return;
    }

    for (i, ch) in text.chars().enumerate() {
        let col = x_start + i as u16;
        if col >= tw {
            break;
        }
        set_buffer_cell(buf, col, y_row, ch, fg, bg, 0, tw, th);
    }
}

fn draw_styled_text_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    text: &str,
    spans: &[TextSpanData],
    fg: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    let x_start = x as u16;
    let y_row = y as u16;

    if y_row >= th {
        return;
    }

    let mut span_index = 0usize;
    for (char_index, (byte_start, ch)) in text.char_indices().enumerate() {
        let col = x_start + char_index as u16;
        if col >= tw {
            break;
        }

        while span_index < spans.len() && spans[span_index].end_byte <= byte_start {
            span_index += 1;
        }

        let mut resolved_fg = fg;
        let mut resolved_bg = bg;
        let mut attrs = 0u8;

        if let Some(span) = spans.get(span_index)
            && byte_start >= span.start_byte
            && byte_start < span.end_byte
        {
            resolved_fg = span.foreground.unwrap_or(fg);
            resolved_bg = span.background.unwrap_or(bg);
            attrs = text_span_attr_flags(span);
        }

        set_buffer_cell(buf, col, y_row, ch, resolved_fg, resolved_bg, attrs, tw, th);
    }
}

fn set_border_cell(
    buf: &mut [u64],
    col: u16,
    row: u16,
    ch: char,
    color: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    set_buffer_cell(buf, col, row, ch, color, bg, 0, tw, th);
}

fn draw_uniform_border_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: u32,
    bg: u32,
    style: BorderStyle,
    tw: u16,
    th: u16,
) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = ((x + w) as u16).saturating_sub(1).min(tw.saturating_sub(1));
    let y_end = ((y + h) as u16).saturating_sub(1).min(th.saturating_sub(1));

    let (tl, tr, bl, br, h_line, v_line) = match style {
        BorderStyle::Rounded => ('╭', '╮', '╰', '╯', '─', '│'),
        BorderStyle::Squared => ('┌', '┐', '└', '┘', '─', '│'),
        BorderStyle::None => return,
    };

    set_border_cell(buf, x_start, y_start, tl, color, bg, tw, th);
    set_border_cell(buf, x_end, y_start, tr, color, bg, tw, th);
    set_border_cell(buf, x_start, y_end, bl, color, bg, tw, th);
    set_border_cell(buf, x_end, y_end, br, color, bg, tw, th);

    for col in (x_start + 1)..x_end {
        set_border_cell(buf, col, y_start, h_line, color, bg, tw, th);
        set_border_cell(buf, col, y_end, h_line, color, bg, tw, th);
    }
    for row in (y_start + 1)..y_end {
        set_border_cell(buf, x_start, row, v_line, color, bg, tw, th);
        set_border_cell(buf, x_end, row, v_line, color, bg, tw, th);
    }
}

fn draw_resolved_border_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    border: ResolvedBorder,
    bg: u32,
    tw: u16,
    th: u16,
) {
    if !border.has_any_visible_side() {
        return;
    }

    if let Some((color, style)) = border.is_uniform_full_box() {
        draw_uniform_border_at(buf, x, y, w, h, color, bg, style, tw, th);
        return;
    }

    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = ((x + w) as u16).saturating_sub(1).min(tw.saturating_sub(1));
    let y_end = ((y + h) as u16).saturating_sub(1).min(th.saturating_sub(1));

    let top = border.top.is_visible();
    let right = border.right.is_visible();
    let bottom = border.bottom.is_visible();
    let left = border.left.is_visible();

    if top {
        for col in x_start..=x_end {
            set_border_cell(buf, col, y_start, '─', border.top.color, bg, tw, th);
        }
    }
    if bottom {
        for col in x_start..=x_end {
            set_border_cell(buf, col, y_end, '─', border.bottom.color, bg, tw, th);
        }
    }
    if left {
        for row in y_start..=y_end {
            set_border_cell(buf, x_start, row, '│', border.left.color, bg, tw, th);
        }
    }
    if right {
        for row in y_start..=y_end {
            set_border_cell(buf, x_end, row, '│', border.right.color, bg, tw, th);
        }
    }

    if top && left {
        set_border_cell(buf, x_start, y_start, '┌', border.top.color, bg, tw, th);
    }
    if top && right {
        set_border_cell(buf, x_end, y_start, '┐', border.top.color, bg, tw, th);
    }
    if bottom && left {
        set_border_cell(buf, x_start, y_end, '└', border.bottom.color, bg, tw, th);
    }
    if bottom && right {
        set_border_cell(buf, x_end, y_end, '┘', border.bottom.color, bg, tw, th);
    }
}

fn draw_cursor_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    text_len: f32,
    fg: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    let col = (x + text_len) as u16;
    let row = y as u16;

    set_buffer_cell(buf, col, row, '█', fg, bg, 0, tw, th);
}

fn paint_taffy_node(
    taffy: &TaffyTree<NodeContext>,
    node_id: NodeId,
    parent_fg: u32,
    parent_bg: u32,
    buf_state: Buffer,
) {
    let Buffer {
        buf,
        x: abs_x,
        y: abs_y,
        tw,
        th,
    } = buf_state;

    let layout = taffy.layout(node_id).unwrap();
    let x = abs_x + layout.location.x;
    let y = abs_y + layout.location.y;
    let w = layout.size.width;
    let h = layout.size.height;

    let content_x = abs_x + layout.content_box_x();
    let content_y = abs_y + layout.content_box_y();

    let (fg, bg) = match taffy.get_node_context(node_id) {
        Some(NodeContext::Text {
            content,
            spans,
            fg,
            bg,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_styled_text_at(buf, content_x, content_y, content, spans, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
            draw_text_at(buf, content_x, content_y, label, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
            draw_text_at(buf, content_x, content_y, content, fg, bg, tw, th);
            draw_cursor_at(
                buf,
                content_x,
                content_y,
                content.chars().count() as f32,
                fg,
                bg,
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Row { fg, bg, border })
        | Some(NodeContext::Column { fg, bg, border }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
            (fg, bg)
        }
        None => (parent_fg, parent_bg),
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, fg, bg, Buffer { buf, x, y, tw, th });
    }
}

struct Buffer<'a> {
    buf: &'a mut [u64],
    tw: u16,
    th: u16,
    x: f32,
    y: f32,
}
