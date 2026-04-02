use crate::shared::{DEFAULT_FG, FIELDS_PER_CELL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE};
use crate::tree::{BorderStyle, ResolvedBorder, TextSpanData};

pub fn text_span_attr_flags(span: &TextSpanData) -> u8 {
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

pub struct Surface<'a> {
    pub buf: &'a mut [u64],
    pub tw: u16,
    pub th: u16,
}

impl Surface<'_> {
    pub fn draw_bg(&mut self, rect: SurfaceRect, color: u32) {
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

    pub fn set_cell(&mut self, col: u16, row: u16, ch: char, style: CellStyle) {
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

    pub fn draw_border(&mut self, rect: SurfaceRect, border: ResolvedBorder, bg: u32) {
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

    pub fn draw_text(
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

    pub fn draw_cursor(&mut self, rect: SurfaceRect, text_len: f32, style: CellStyle) {
        self.set_cell((rect.x + text_len) as u16, rect.y as u16, '█', style);
    }
}

#[derive(Clone, Copy)]
pub struct SurfaceRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

pub struct SurfaceBounds {
    pub x_start: u16,
    pub x_end: u16,
    pub y_start: u16,
    pub y_end: u16,
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
pub struct CellStyle {
    pub fg: u32,
    pub bg: u32,
    pub attrs: u8,
}

pub fn inherited_style(local_fg: u32, local_bg: u32, parent_fg: u32, parent_bg: u32) -> CellStyle {
    CellStyle {
        fg: if local_fg != 0 { local_fg } else { parent_fg },
        bg: if local_bg != 0 { local_bg } else { parent_bg },
        attrs: 0,
    }
}
