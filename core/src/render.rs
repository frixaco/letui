//! Layout, frame extraction, and terminal painting for the Rust renderer.

use crate::shared::{CURRENT_BUFFER, DEFAULT_BG, DEFAULT_FG, FRAMES, TERMINAL_SIZE};
use crate::surface::{CellStyle, Surface, SurfaceRect, inherited_style, wrap_text};
use crate::tree::{
    BoxSizing, Direction, NodeData, NodeType, ResolvedBorder, StyleDimension, TextOverflow,
    TextWrap,
};
use crate::tree::{TREE_STATE, TextSpanData, TreeState};
use std::{cell::RefCell, os::raw::c_int};
use taffy::{Overflow, Point, prelude::*};
use unicode_width::UnicodeWidthStr;

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
            measure_function,
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

struct NodeContext {
    chrome: Chrome,
    content: Content,
}

struct Chrome {
    fg: u32,
    bg: u32,
    border: ResolvedBorder,
}

enum Content {
    Box,
    Text {
        content: String,
        spans: Vec<TextSpanData>,
        wrap: TextWrap,
        overflow: TextOverflow,
    },
    Button {
        label: String,
    },
    Input {
        content: String,
    },
}

impl NodeContext {
    fn text(&self) -> Option<&str> {
        match &self.content {
            Content::Box => None,
            Content::Input { content, .. } => Some(content),
            Content::Text { content, .. } => Some(content),
            Content::Button { label, .. } => Some(label),
        }
    }
}

fn style_dimension_to_taffy(dim: StyleDimension) -> Dimension {
    match dim {
        StyleDimension::Auto => Dimension::auto(),
        StyleDimension::Points(v) => Dimension::length(v),
    }
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
    let chrome = Chrome {
        fg: data.style.fg,
        bg: data.style.bg,
        border: data.style.border,
    };
    let content = match data.kind {
        NodeType::Row | NodeType::Column => Content::Box,
        NodeType::Text => Content::Text {
            content: data.text.clone(),
            spans: data.text_spans.clone(),
            wrap: data.style.text_wrap,
            overflow: data.style.text_overflow,
        },
        NodeType::Button => Content::Button {
            label: data.text.clone(),
        },
        NodeType::Input => Content::Input {
            content: data.text.clone(),
        },
    };

    NodeContext { chrome, content }
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

    let Some(node_context) = node_context else {
        return Size::ZERO;
    };

    let max_width = match available_space.width {
        AvailableSpace::Definite(width) => width.max(0.0) as u32,
        _ => u32::MAX,
    };
    let max_height = match available_space.height {
        AvailableSpace::Definite(height) => height.max(0.0) as u32,
        _ => u32::MAX,
    };

    if let Content::Text {
        content,
        spans,
        wrap,
        overflow,
    } = &node_context.content
    {
        let wrapped = wrap_text(content, spans, max_width, max_height, *wrap, *overflow);
        let width = wrapped
            .lines
            .iter()
            .map(|line| line.text.width())
            .max()
            .unwrap_or(0) as f32;

        return Size {
            width,
            height: wrapped.lines.len() as f32,
        };
    }

    let Some(text) = node_context.text() else {
        return Size::ZERO;
    };
    let wrapped = wrap_text(
        text,
        &[],
        max_width,
        max_height,
        TextWrap::None,
        TextOverflow::Clip,
    );
    let width = wrapped
        .lines
        .iter()
        .map(|line| line.text.width())
        .max()
        .unwrap_or(0) as f32;

    Size {
        width,
        height: wrapped.lines.len() as f32,
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

    let Some(ctx) = taffy.get_node_context(node_id) else {
        return;
    };

    let chrome = &ctx.chrome;
    let style = inherited_style(chrome.fg, chrome.bg, parent_fg, parent_bg);
    surface.draw_bg(rect, style.bg);

    let CellStyle { fg, bg, attrs: _a } = match &ctx.content {
        Content::Box => {
            surface.draw_border(rect, chrome.border, style.bg);
            style
        }
        Content::Input { content } => {
            surface.draw_border(rect, chrome.border, style.bg);
            surface.draw_text(content_rect, &content, style, &[]);
            surface.draw_cursor(content_rect, content.chars().count() as f32, style);
            style
        }
        Content::Text {
            content,
            spans,
            wrap,
            overflow,
        } => {
            surface.draw_border(rect, chrome.border, style.bg);
            let wrapped = wrap_text(
                content,
                spans,
                content_rect.w.max(0.0) as u32,
                content_rect.h.max(0.0) as u32,
                *wrap,
                *overflow,
            );

            for (line_index, line) in wrapped.lines.iter().enumerate() {
                surface.draw_text(
                    SurfaceRect {
                        x: content_rect.x,
                        y: content_rect.y + line_index as f32,
                        w: content_rect.w,
                        h: 1.0,
                    },
                    &line.text,
                    style,
                    &line.spans,
                );
            }
            style
        }
        Content::Button { label } => {
            surface.draw_border(rect, chrome.border, style.bg);
            surface.draw_text(content_rect, &label, style, &[]);
            style
        }
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, fg, bg, surface, rect);
    }
}
