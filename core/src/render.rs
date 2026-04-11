//! Layout, frame extraction, and terminal painting for the Rust renderer.

use crate::shared::{CURRENT_BUFFER, DEFAULT_BG, DEFAULT_FG, FRAMES, HITMAP, TERMINAL_SIZE};
use crate::surface::{CellStyle, Surface, SurfaceRect, inherited_style, wrap_text};
use crate::tree::{ColumnOverflow, NodeContext, NodeType, TREE_STATE, TextOverflow, TextWrap};
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

        let mut hitmap_lock = HITMAP.lock().unwrap();
        let hitmap_vec =
            hitmap_lock.get_or_insert_with(|| vec![0u32; (tw as usize) * (th as usize)]);
        let expected_hitmap_len = (tw as usize) * (th as usize);
        if hitmap_vec.len() != expected_hitmap_len {
            hitmap_vec.resize(expected_hitmap_len, 0);
        }
        hitmap_vec.fill(0);

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
            let root_clip = SurfaceRect::terminal_bounds(tw, th);

            surface.draw_bg(root_rect, root_clip, parent_bg);

            paint_taffy_node(
                taffy,
                taffy_root,
                parent_fg,
                parent_bg,
                &mut surface,
                hitmap_vec,
                root_rect,
                root_clip,
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

#[unsafe(no_mangle)]
pub extern "C" fn get_hitmap_ptr() -> *const u32 {
    let hitmap = HITMAP.lock().unwrap();
    match *hitmap {
        Some(ref vec) => vec.as_ptr(),
        None => std::ptr::null(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_hitmap_len() -> u64 {
    let hitmap = HITMAP.lock().unwrap();
    match *hitmap {
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
    hitmap: &mut [u32],
    surface_rect: SurfaceRect,
    viewport: SurfaceRect,
) {
    if viewport.is_empty() {
        return;
    }

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
    let Some(visible_rect) = rect.intersect(viewport) else {
        return;
    };
    let content_clip = viewport.intersect(content_rect);

    let Some(ctx) = taffy.get_node_context(node_id) else {
        return;
    };

    let style = inherited_style(ctx.style.fg, ctx.style.bg, parent_fg, parent_bg);
    surface.draw_bg(rect, viewport, style.bg);
    surface.draw_border(rect, viewport, ctx.style.border, style.bg);

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

            if let Some(content_clip) = content_clip {
                for (line_index, line) in wrapped.lines.iter().enumerate() {
                    surface.draw_text(
                        SurfaceRect {
                            x: content_rect.x,
                            y: content_rect.y + line_index as f32,
                            w: content_rect.w,
                            h: 1.0,
                        },
                        content_clip,
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
                    content_clip,
                    cursor_col,
                    style,
                );
            }
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

            if let Some(content_clip) = content_clip {
                for (line_index, line) in wrapped.lines.iter().enumerate() {
                    surface.draw_text(
                        SurfaceRect {
                            x: content_rect.x,
                            y: content_rect.y + line_index as f32,
                            w: content_rect.w,
                            h: 1.0,
                        },
                        content_clip,
                        &line.text,
                        style,
                        &line.spans,
                    );
                }
            }
        }
        NodeType::Button => {
            if let Some(content_clip) = content_clip {
                surface.draw_text(content_rect, content_clip, &ctx.text, style, &[]);
            }
        }
    }

    if matches!(ctx.kind, NodeType::Input | NodeType::Button) {
        fill_hitmap_rect(hitmap, surface.tw, surface.th, visible_rect, ctx.id);
    }

    let CellStyle { fg, bg, .. } = style;
    let mut child_origin = rect;
    let mut child_clip = viewport;
    if ctx.kind == NodeType::Column && ctx.style.column_overflow == ColumnOverflow::Scroll {
        if let Some(viewport_clip) = viewport.intersect(content_rect) {
            child_clip = viewport_clip;
            child_origin.y -= sanitize_scroll_y(layout, ctx.style.scroll_y);
        } else {
            return;
        }
    }

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(
            taffy,
            child,
            fg,
            bg,
            surface,
            hitmap,
            child_origin,
            child_clip,
        );
    }
}

fn fill_hitmap_rect(hitmap: &mut [u32], width: u16, height: u16, rect: SurfaceRect, node_id: u32) {
    if width == 0 || height == 0 {
        return;
    }

    let Some(bounds) = rect.fill_bounds(width, height) else {
        return;
    };

    for row in bounds.y_start..bounds.y_end {
        let row_offset = row as usize * width as usize;
        for col in bounds.x_start..bounds.x_end {
            hitmap[row_offset + col as usize] = node_id;
        }
    }
}

fn sanitize_scroll_y(layout: &Layout, requested: f64) -> f32 {
    let requested = if requested.is_finite() && requested > 0.0 {
        requested
    } else {
        0.0
    };

    requested.min(layout.scroll_height() as f64).floor() as f32
}

#[cfg(test)]
mod tests {
    use super::*;
    use taffy::{Point, Rect, Size};

    fn layout_with_scroll_height(height: f32, content_height: f32) -> Layout {
        let mut layout = Layout::new();
        layout.size = Size {
            width: 10.0,
            height,
        };
        layout.content_size = Size {
            width: 10.0,
            height: content_height,
        };
        layout.scrollbar_size = Size::ZERO;
        layout.border = Rect::ZERO;
        layout.location = Point::ZERO;
        layout
    }

    #[test]
    fn sanitize_scroll_y_floors_and_clamps() {
        let layout = layout_with_scroll_height(5.0, 17.0);

        assert_eq!(sanitize_scroll_y(&layout, 3.9), 3.0);
        assert_eq!(sanitize_scroll_y(&layout, 99.0), 12.0);
        assert_eq!(sanitize_scroll_y(&layout, -4.0), 0.0);
    }

    #[test]
    fn sanitize_scroll_y_treats_non_finite_as_zero() {
        let layout = layout_with_scroll_height(5.0, 17.0);

        assert_eq!(sanitize_scroll_y(&layout, f64::NAN), 0.0);
        assert_eq!(sanitize_scroll_y(&layout, f64::INFINITY), 0.0);
        assert_eq!(sanitize_scroll_y(&layout, f64::NEG_INFINITY), 0.0);
    }

    #[test]
    fn later_hitmap_fill_wins_on_overlap() {
        let mut hitmap = vec![0u32; 25];

        fill_hitmap_rect(
            &mut hitmap,
            5,
            5,
            SurfaceRect {
                x: 1.0,
                y: 1.0,
                w: 3.0,
                h: 3.0,
            },
            7,
        );
        fill_hitmap_rect(
            &mut hitmap,
            5,
            5,
            SurfaceRect {
                x: 2.0,
                y: 2.0,
                w: 2.0,
                h: 2.0,
            },
            9,
        );

        assert_eq!(hitmap[1 + 1 * 5], 7);
        assert_eq!(hitmap[2 + 2 * 5], 9);
        assert_eq!(hitmap[3 + 3 * 5], 9);
    }
}
