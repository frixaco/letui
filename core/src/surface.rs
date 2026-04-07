use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

use crate::shared::{
    DEFAULT_FG, FIELDS_PER_CELL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use crate::tree::{BorderStyle, ResolvedBorder, TextOverflow, TextSpanData, TextWrap};

pub fn wrap_text(
    text: &str,
    spans: &[TextSpanData],
    max_width: u32,
    max_height: u32,
    wrap: TextWrap,
    overflow: TextOverflow,
) -> WrappedText {
    let _ = spans;

    if max_height == 0 {
        return WrappedText { lines: vec![] };
    }

    if max_width == 0 {
        return WrappedText { lines: vec![] };
    }

    if text.is_empty() {
        return WrappedText {
            lines: vec![WrappedLine {
                text: String::new(),
                spans: vec![],
            }],
        };
    }

    let mut lines: Vec<String> = vec![];
    let mut remaining = text;

    loop {
        let (explicit_line, rest) = match remaining.split_once('\n') {
            Some((line, rest)) => (line, Some(rest)),
            None => (remaining, None),
        };

        lines.extend(wrap_single_line(explicit_line, max_width, wrap, overflow));

        match rest {
            Some(rest) => {
                remaining = rest;
                if remaining.is_empty() {
                    lines.push(String::new());
                    break;
                }
            }
            None => break,
        }
    }

    let clipped = lines.len() > max_height as usize;
    if clipped {
        lines.truncate(max_height as usize);
    }

    if overflow == TextOverflow::Ellipsis && clipped {
        if let Some(last_line) = lines.last_mut() {
            apply_ellipsis(last_line, max_width);
        }
    }

    WrappedText {
        lines: lines
            .into_iter()
            .map(|text| WrappedLine {
                text,
                spans: vec![],
            })
            .collect(),
    }
}

fn wrap_single_line(
    text: &str,
    max_width: u32,
    wrap: TextWrap,
    overflow: TextOverflow,
) -> Vec<String> {
    if text.is_empty() {
        return vec![String::new()];
    }

    let clipped_horizontally = wrap == TextWrap::None && text.width() > max_width as usize;

    let mut guws = if wrap == TextWrap::Char {
        UnicodeSegmentation::graphemes(text, true)
            .map(|g| (g, g.width()))
            .collect::<Vec<(&str, usize)>>()
    } else {
        text.split_word_bounds()
            .map(|g| (g, g.width()))
            .collect::<Vec<(&str, usize)>>()
    };

    let mut idx = 0;
    let mut total_w = 0usize;
    let mut line = String::new();
    let mut lines: Vec<String> = vec![];

    if guws[idx].1 > max_width as usize && wrap != TextWrap::Char {
        guws = UnicodeSegmentation::graphemes(text, true)
            .map(|g| (g, g.width()))
            .collect::<Vec<(&str, usize)>>()
    }

    while idx < guws.len() {
        let (g, uw) = guws[idx];
        total_w += uw;
        line.push_str(g);

        let (_, nuw) = match guws.get(idx + 1) {
            Some(&(ng, nuw)) => (ng, nuw),
            None => ("", 0),
        };

        let next_total_w = total_w + nuw;

        if next_total_w > max_width as usize {
            lines.push(line);
            line = String::new();
            total_w = 0;

            if wrap == TextWrap::None {
                break;
            }
        }

        idx += 1;
    }

    if !line.is_empty() {
        lines.push(line);
    }

    if clipped_horizontally && overflow == TextOverflow::Ellipsis {
        if let Some(last_line) = lines.last_mut() {
            apply_ellipsis(last_line, max_width);
        }
    }

    lines
}

fn apply_ellipsis(last_line: &mut String, max_width: u32) {
    if max_width == 0 {
        last_line.clear();
        return;
    }

    if last_line.width() >= max_width as usize {
        last_line.pop();
        last_line.push('…');
        return;
    }

    last_line.push('…');
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_lines(
        text: &str,
        max_width: u32,
        max_height: u32,
        wrap: TextWrap,
        overflow: TextOverflow,
        expected: &[&str],
    ) {
        let wrapped = wrap_text(text, &[], max_width, max_height, wrap, overflow);
        let actual = wrapped
            .lines
            .into_iter()
            .map(|line| line.text)
            .collect::<Vec<_>>();
        let expected = expected
            .iter()
            .map(|line| (*line).to_owned())
            .collect::<Vec<_>>();
        assert_eq!(actual, expected);
    }

    #[test]
    fn empty_input_returns_one_empty_line() {
        assert_lines("", 10, 10, TextWrap::Word, TextOverflow::Clip, &[""]);
    }

    #[test]
    fn zero_height_returns_no_lines() {
        assert_lines(
            "hello world",
            5,
            0,
            TextWrap::Char,
            TextOverflow::Ellipsis,
            &[],
        );
    }

    #[test]
    fn zero_width_returns_no_lines() {
        assert_lines("hello world", 0, 5, TextWrap::Word, TextOverflow::Clip, &[]);
    }

    #[test]
    fn wrap_none_leaves_fitting_text_untouched() {
        assert_lines(
            "hello",
            10,
            2,
            TextWrap::None,
            TextOverflow::Clip,
            &["hello"],
        );
    }

    #[test]
    fn wrap_none_clips_without_reflow() {
        assert_lines(
            "abcdef",
            4,
            2,
            TextWrap::None,
            TextOverflow::Clip,
            &["abcd"],
        );
    }

    #[test]
    fn wrap_none_uses_ellipsis_for_horizontal_overflow() {
        assert_lines(
            "abcdef",
            4,
            2,
            TextWrap::None,
            TextOverflow::Ellipsis,
            &["abc…"],
        );
    }

    #[test]
    fn char_wrap_breaks_by_visible_width() {
        assert_lines(
            "abcdef",
            2,
            10,
            TextWrap::Char,
            TextOverflow::Clip,
            &["ab", "cd", "ef"],
        );
    }

    #[test]
    fn char_wrap_preserves_spaces_as_regular_graphemes() {
        assert_lines(
            "ab cd",
            3,
            10,
            TextWrap::Char,
            TextOverflow::Clip,
            &["ab ", "cd"],
        );
    }

    #[test]
    fn char_wrap_respects_grapheme_clusters() {
        assert_lines(
            "e\u{301}x",
            1,
            10,
            TextWrap::Char,
            TextOverflow::Clip,
            &["e\u{301}", "x"],
        );
    }

    #[test]
    fn char_wrap_respects_full_width_characters() {
        assert_lines(
            "界ab",
            2,
            10,
            TextWrap::Char,
            TextOverflow::Clip,
            &["界", "ab"],
        );
    }

    #[test]
    fn char_wrap_clips_when_height_is_exhausted() {
        assert_lines(
            "abcdefg",
            3,
            2,
            TextWrap::Char,
            TextOverflow::Clip,
            &["abc", "def"],
        );
    }

    #[test]
    fn char_wrap_marks_vertical_overflow_with_ellipsis() {
        assert_lines(
            "abcdefg",
            3,
            2,
            TextWrap::Char,
            TextOverflow::Ellipsis,
            &["abc", "de…"],
        );
    }

    #[test]
    fn word_wrap_breaks_on_word_boundaries() {
        assert_lines(
            "hello world",
            8,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["hello ", "world"],
        );
    }

    #[test]
    fn word_wrap_packs_multiple_words_when_they_fit() {
        assert_lines(
            "ab cd ef",
            5,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["ab cd", " ef"],
        );
    }

    #[test]
    fn word_wrap_drops_boundary_spaces_instead_of_leading_next_line() {
        assert_lines(
            "ab cd",
            3,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["ab ", "cd"],
        );
    }

    #[test]
    fn word_wrap_falls_back_to_char_wrapping_for_long_words() {
        assert_lines(
            "alphabet",
            3,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["alp", "hab", "et"],
        );
    }

    #[test]
    fn word_wrap_applies_ellipsis_after_height_limit() {
        assert_lines(
            "one two three",
            4,
            2,
            TextWrap::Word,
            TextOverflow::Ellipsis,
            &["one ", "two…"],
        );
    }

    #[test]
    fn explicit_newlines_start_new_rows() {
        assert_lines(
            "alpha\nbeta",
            10,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["alpha", "beta"],
        );
    }

    #[test]
    fn explicit_blank_lines_are_preserved() {
        assert_lines(
            "alpha\n\nbeta\n",
            10,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["alpha", "", "beta", ""],
        );
    }

    #[test]
    fn ellipsis_works_when_only_one_column_is_available() {
        assert_lines(
            "abcdef",
            1,
            1,
            TextWrap::None,
            TextOverflow::Ellipsis,
            &["…"],
        );
    }
}

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

        if spans.is_empty() {
            for (i, ch) in text.chars().enumerate() {
                self.set_cell(x_start + i as u16, y_row, printable_cell_char(ch), style);
            }
            return;
        }

        let mut span_index = 0usize;
        for (char_index, (byte_start, ch)) in text.char_indices().enumerate() {
            let col = x_start + char_index as u16;

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
                printable_cell_char(ch),
                CellStyle {
                    fg: resolved_fg,
                    bg: resolved_bg,
                    attrs,
                },
            );
        }
    }

    // TODO: weird stuff happening here
    pub fn draw_cursor(&mut self, rect: SurfaceRect, text_len: f32, style: CellStyle) {
        self.set_cell((rect.x + text_len) as u16, rect.y as u16, '█', style);
    }
}

fn printable_cell_char(ch: char) -> char {
    if ch.is_control() { ' ' } else { ch }
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

#[derive(Debug, Clone)]
pub struct WrappedText {
    pub lines: Vec<WrappedLine>,
}

#[derive(Debug, Clone)]
pub struct WrappedLine {
    pub text: String,
    pub spans: Vec<TextSpanData>,
}
