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
    let Some(root_id) = state.root_id else {
        return 0;
    };

    TREE.with_borrow_mut(|taffy| {
        let term_size = TERMINAL_SIZE.lock().unwrap();
        let (tw, th) = *term_size;
        drop(term_size);

        let Some(taffy_root) = build_taffy_from_state(taffy, &state, root_id, None) else {
            return 0;
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
            let mut surface = Surface { buf, tw, th };
            let layout = taffy.layout(taffy_root).unwrap();
            let root_rect = SurfaceRect {
                x: 0.0,
                y: 0.0,
                w: layout.size.width,
                h: layout.size.height,
            };

            paint_taffy_node(
                taffy,
                taffy_root,
                parent_fg,
                parent_bg,
                &mut surface,
                root_rect,
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
        Some(NodeContext::Button { label, .. }) => label.as_str(),
        Some(NodeContext::Text { content, .. }) | Some(NodeContext::Input { content, .. }) => {
            content.as_str()
        }
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

fn paint_taffy_node(
    taffy: &TaffyTree<NodeContext>,
    node_id: NodeId,
    parent_fg: u32,
    parent_bg: u32,
    surface: &mut Surface<'_>,
    surface_rect: SurfaceRect,
) {
    let layout = taffy.layout(node_id).unwrap();

    let rect = SurfaceRect {
        x: surface_rect.x + layout.location.x,
        y: surface_rect.y + layout.location.y,
        w: layout.size.width,
        h: layout.size.height,
    };

    let content_rect = SurfaceRect {
        x: surface_rect.x + layout.content_box_x(),
        y: surface_rect.y + layout.content_box_y(),
        w: layout.content_box_width(),
        h: layout.content_box_height(),
    };

    let CellStyle { fg, bg, attrs: _a } = match taffy.get_node_context(node_id) {
        Some(NodeContext::Text {
            content,
            spans,
            fg,
            bg,
        }) => {
            let style = inherited_style(*fg, *bg, parent_fg, parent_bg);
            surface.draw_bg(rect, style.bg);
            surface.draw_text(content_rect, content, style, spans);
            style
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border,
        }) => {
            let style = inherited_style(*fg, *bg, parent_fg, parent_bg);
            surface.draw_bg(rect, style.bg);
            surface.draw_border(rect, *border, style.bg);
            surface.draw_text(content_rect, label, style, &[]);
            style
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border,
        }) => {
            let style = inherited_style(*fg, *bg, parent_fg, parent_bg);
            surface.draw_bg(rect, style.bg);
            surface.draw_border(rect, *border, style.bg);
            surface.draw_text(content_rect, content, style, &[]);
            surface.draw_cursor(content_rect, content.chars().count() as f32, style);
            style
        }
        Some(NodeContext::Row { fg, bg, border })
        | Some(NodeContext::Column { fg, bg, border }) => {
            let style = inherited_style(*fg, *bg, parent_fg, parent_bg);
            surface.draw_bg(rect, style.bg);
            surface.draw_border(rect, *border, style.bg);
            style
        }
        None => CellStyle {
            fg: parent_fg,
            bg: parent_bg,
            attrs: 0,
        },
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, fg, bg, surface, rect);
    }
}

struct Surface<'a> {
    buf: &'a mut [u64],
    tw: u16,
    th: u16,
}

impl Surface<'_> {
    fn draw_bg(&mut self, rect: SurfaceRect, color: u32) {
        let SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        } = rect.fill_bounds(self.tw, self.th);

        for row in y_start..y_end {
            for col in x_start..x_end {
                self.set_cell(
                    col,
                    row,
                    ' ',
                    CellStyle {
                        fg: DEFAULT_FG,
                        bg: color,
                        attrs: 0,
                    },
                );
            }
        }
    }

    fn set_cell(&mut self, col: u16, row: u16, ch: char, style: CellStyle) {
        if col >= self.tw || row >= self.th {
            return;
        }

        let idx = (self.tw * row + col) as usize * FIELDS_PER_CELL;
        if idx + (FIELDS_PER_CELL - 1) >= self.buf.len() {
            return;
        }

        self.buf[idx] = u64::from(ch);
        self.buf[idx + 1] = u64::from(style.fg);
        self.buf[idx + 2] = u64::from(style.bg);
        self.buf[idx + 3] = u64::from(style.attrs);
    }

    fn draw_border(&mut self, rect: SurfaceRect, border: ResolvedBorder, bg: u32) {
        if !border.has_any_visible_side() {
            return;
        }

        let bounds = rect.border_bounds(self.tw, self.th);

        if let Some((fg, style)) = border.is_uniform_full_box() {
            self.draw_uniform_border(style, bounds, fg, bg);
            return;
        }

        self.draw_mixed_border(bounds, border, bg);
    }

    fn draw_mixed_border(&mut self, bounds: SurfaceBounds, border: ResolvedBorder, bg: u32) {
        let SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        } = bounds;

        let top = border.top.is_visible();
        let right = border.right.is_visible();
        let bottom = border.bottom.is_visible();
        let left = border.left.is_visible();

        let mut style = CellStyle {
            fg: 0,
            bg,
            attrs: 0,
        };

        if top {
            style.fg = border.top.color;
            for col in x_start..=x_end {
                self.set_cell(col, y_start, '─', style);
            }
        }
        if bottom {
            style.fg = border.bottom.color;
            for col in x_start..=x_end {
                self.set_cell(col, y_end, '─', style);
            }
        }
        if left {
            style.fg = border.left.color;
            for row in y_start..=y_end {
                self.set_cell(x_start, row, '│', style);
            }
        }
        if right {
            style.fg = border.right.color;
            for row in y_start..=y_end {
                self.set_cell(x_end, row, '│', style);
            }
        }

        if top && left {
            style.fg = border.top.color;
            self.set_cell(x_start, y_start, '┌', style);
        }
        if top && right {
            style.fg = border.top.color;
            self.set_cell(x_end, y_start, '┐', style);
        }
        if bottom && left {
            style.fg = border.bottom.color;
            self.set_cell(x_start, y_end, '└', style);
        }
        if bottom && right {
            style.fg = border.bottom.color;
            self.set_cell(x_end, y_end, '┘', style);
        }
    }

    fn draw_uniform_border(&mut self, style: BorderStyle, bounds: SurfaceBounds, fg: u32, bg: u32) {
        let SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        } = bounds;
        let (tl, tr, bl, br, h_line, v_line) = match style {
            BorderStyle::Rounded => ('╭', '╮', '╰', '╯', '─', '│'),
            BorderStyle::Squared => ('┌', '┐', '└', '┘', '─', '│'),
            BorderStyle::None => return,
        };

        let style = CellStyle { fg, bg, attrs: 0 };

        self.set_cell(x_start, y_start, tl, style);
        self.set_cell(x_end, y_start, tr, style);
        self.set_cell(x_start, y_end, bl, style);
        self.set_cell(x_end, y_end, br, style);

        for col in (x_start + 1)..x_end {
            self.set_cell(col, y_start, h_line, style);
            self.set_cell(col, y_end, h_line, style);
        }
        for row in (y_start + 1)..y_end {
            self.set_cell(x_start, row, v_line, style);
            self.set_cell(x_end, row, v_line, style);
        }
        return;
    }

    fn draw_text(
        &mut self,
        rect: SurfaceRect,
        text: &str,
        style: CellStyle,
        spans: &[TextSpanData],
    ) {
        let CellStyle { fg, bg, attrs: _a } = style;

        let x_start = rect.x as u16;
        let y_row = rect.y as u16;

        if y_row >= self.th {
            return;
        }

        if spans.is_empty() {
            for (i, ch) in text.chars().enumerate() {
                let col = x_start + i as u16;
                if col >= self.tw {
                    break;
                }
                self.set_cell(col, y_row, ch, style);
            }
            return;
        }

        let mut span_index = 0usize;
        for (char_index, (byte_start, ch)) in text.char_indices().enumerate() {
            let col = x_start + char_index as u16;
            if col >= self.tw {
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

            self.set_cell(
                col,
                y_row,
                ch,
                CellStyle {
                    fg: resolved_fg,
                    bg: resolved_bg,
                    attrs,
                },
            );
        }
    }

    fn draw_cursor(&mut self, rect: SurfaceRect, text_len: f32, style: CellStyle) {
        self.set_cell((rect.x + text_len) as u16, rect.y as u16, '█', style);
    }
}

#[derive(Clone, Copy)]
struct SurfaceRect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

struct SurfaceBounds {
    x_start: u16,
    x_end: u16,
    y_start: u16,
    y_end: u16,
}

impl SurfaceRect {
    fn fill_bounds(&self, max_w: u16, max_h: u16) -> SurfaceBounds {
        let x_start = self.x as u16;
        let y_start = self.y as u16;
        let x_end = (self.x + self.w).min(max_w as f32) as u16;
        let y_end = (self.y + self.h).min(max_h as f32) as u16;

        SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        }
    }

    fn border_bounds(&self, max_w: u16, max_h: u16) -> SurfaceBounds {
        let x_start = self.x as u16;
        let y_start = self.y as u16;
        let x_end = ((self.x + self.w) as u16)
            .saturating_sub(1)
            .min(max_w.saturating_sub(1));
        let y_end = ((self.y + self.h) as u16)
            .saturating_sub(1)
            .min(max_h.saturating_sub(1));

        SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        }
    }
}

#[derive(Clone, Copy)]
struct CellStyle {
    fg: u32,
    bg: u32,
    attrs: u8,
}

fn inherited_style(local_fg: u32, local_bg: u32, parent_fg: u32, parent_bg: u32) -> CellStyle {
    CellStyle {
        fg: if local_fg != 0 { local_fg } else { parent_fg },
        bg: if local_bg != 0 { local_bg } else { parent_bg },
        attrs: 0,
    }
}
