//! Layout, frame extraction, and terminal painting for the Rust renderer.

use crate::shared::{CURRENT_BUFFER, DEFAULT_BG, DEFAULT_FG, FRAMES, TERMINAL_SIZE};
use crate::surface::{CellStyle, Surface, SurfaceRect, inherited_style, wrap_text};
use crate::tree::{NodeContext, NodeType, TextOverflow, TextWrap, TREE_STATE};
use std::os::raw::c_int;
use taffy::prelude::*;
use unicode_width::UnicodeWidthStr;

#[unsafe(no_mangle)]
pub extern "C" fn render() -> c_int {
    TREE_STATE.with_borrow_mut(|state| {
        let Some(taffy_root) = state.root else {
            return 0;
        };

        let term_size = TERMINAL_SIZE.lock().unwrap();
        let (tw, th) = *term_size;
        drop(term_size);

        let taffy = &mut state.tree;

        let root_style = taffy.style(taffy_root).unwrap();
        let new_size = Size {
            width: length(tw),
            height: length(th),
        };
        if root_style.size != new_size {
            let mut root_style = root_style.clone();
            root_style.size = new_size;
            taffy.set_style(taffy_root, root_style).unwrap();
        }

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

        let root_ctx = taffy.get_node_context(taffy_root);
        let parent_fg = root_ctx.map_or(DEFAULT_FG, |c| c.style.fg);
        let parent_bg = root_ctx.map_or(DEFAULT_BG, |c| c.style.bg);

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

            surface.draw_bg(root_rect, parent_bg);

            paint_taffy_node(
                taffy,
                taffy_root,
                parent_fg,
                parent_bg,
                &mut surface,
                root_rect,
            );
        }

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

fn build_frames_array(
    taffy: &TaffyTree<NodeContext>,
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

    let (text, spans, wrap, overflow) = match node_context.kind {
        NodeType::Text => (
            node_context.text.as_str(),
            node_context.text_spans.as_slice(),
            node_context.style.text_wrap,
            node_context.style.text_overflow,
        ),
        NodeType::Input => (
            node_context.text.as_str(),
            [].as_slice(),
            node_context.style.text_wrap,
            TextOverflow::Clip,
        ),
        NodeType::Button => (
            node_context.text.as_str(),
            [].as_slice(),
            TextWrap::None,
            TextOverflow::Clip,
        ),
        _ => return Size::ZERO,
    };

    let wrapped = wrap_text(text, spans, max_width, max_height, wrap, overflow);
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

    let style = inherited_style(ctx.style.fg, ctx.style.bg, parent_fg, parent_bg);
    surface.draw_bg(rect, style.bg);
    surface.draw_border(rect, ctx.style.border, style.bg);

    match ctx.kind {
        NodeType::Row | NodeType::Column => {}
        NodeType::Input => {
            let wrapped = wrap_text(
                &ctx.text,
                &[],
                content_rect.w.max(0.0) as u32,
                content_rect.h.max(0.0) as u32,
                ctx.style.text_wrap,
                TextOverflow::Clip,
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
                    &[],
                );
            }

            let cursor_row = wrapped.lines.len().saturating_sub(1) as f32;
            let cursor_col = wrapped
                .lines
                .last()
                .map_or(0.0, |line| line.text.width() as f32)
                .min(content_rect.w.max(1.0) - 1.0);
            surface.draw_cursor(
                SurfaceRect {
                    x: content_rect.x,
                    y: content_rect.y + cursor_row,
                    w: content_rect.w,
                    h: 1.0,
                },
                cursor_col,
                style,
            );
        }
        NodeType::Text => {
            let wrapped = wrap_text(
                &ctx.text,
                &ctx.text_spans,
                content_rect.w.max(0.0) as u32,
                content_rect.h.max(0.0) as u32,
                ctx.style.text_wrap,
                ctx.style.text_overflow,
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
        }
        NodeType::Button => {
            surface.draw_text(content_rect, &ctx.text, style, &[]);
        }
    }

    let CellStyle { fg, bg, .. } = style;
    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, fg, bg, surface, rect);
    }
}
