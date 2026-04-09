use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthChar;
use unicode_width::UnicodeWidthStr;

use crate::shared::{
    CONTINUATION_CELL, DEFAULT_FG, FIELDS_PER_CELL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC,
    TEXT_ATTR_UNDERLINE,
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

    let mut lines: Vec<WrappedLineDraft> = vec![];
    let mut explicit_line_start_byte = 0usize;

    for explicit_line in text.split('\n') {
        lines.extend(wrap_single_line(
            explicit_line,
            explicit_line_start_byte,
            max_width,
            wrap,
            overflow,
        ));

        explicit_line_start_byte += explicit_line.len();
        // skip over the actual new line byte
        if explicit_line_start_byte < text.len() {
            explicit_line_start_byte += 1;
        }
    }

    let clipped = lines.len() > max_height as usize;
    if clipped {
        lines.truncate(max_height as usize);
    }

    if overflow == TextOverflow::Ellipsis && clipped {
        if let Some(last_line) = lines.last_mut() {
            apply_ellipsis(last_line, max_width as usize);
        }
    }

    WrappedText {
        lines: finalize_wrapped_lines(lines, spans),
    }
}

fn wrap_single_line(
    text: &str,
    line_start_byte: usize,
    max_width: u32,
    wrap: TextWrap,
    overflow: TextOverflow,
) -> Vec<WrappedLineDraft> {
    if text.is_empty() {
        return vec![WrappedLineDraft {
            text: String::new(),
            source_start_byte: line_start_byte,
            source_end_byte: line_start_byte,
        }];
    }

    let max_width = max_width as usize;

    match wrap {
        TextWrap::None => clip_single_line(text, line_start_byte, max_width, overflow),
        TextWrap::Char => wrap_by_graphemes(text, line_start_byte, max_width),
        TextWrap::Word => wrap_by_words(text, line_start_byte, max_width),
    }
}

fn clip_single_line(
    text: &str,
    line_start_byte: usize,
    max_width: usize,
    overflow: TextOverflow,
) -> Vec<WrappedLineDraft> {
    let graphemes = collect_graphemes(text);
    let mut visible_end_byte = 0usize;
    let mut visible_width = 0usize;

    for grapheme in &graphemes {
        if visible_width + grapheme.width > max_width {
            break;
        }
        visible_width += grapheme.width;
        visible_end_byte = grapheme.end_byte;
    }

    let mut line = WrappedLineDraft {
        text: text[..visible_end_byte].to_owned(),
        source_start_byte: line_start_byte,
        source_end_byte: line_start_byte + visible_end_byte,
    };

    if visible_end_byte < text.len() && overflow == TextOverflow::Ellipsis {
        apply_ellipsis(&mut line, max_width);
    }

    vec![line]
}

fn wrap_by_graphemes(
    text: &str,
    line_start_byte: usize,
    max_width: usize,
) -> Vec<WrappedLineDraft> {
    wrap_by_segments(text, line_start_byte, &collect_graphemes(text), max_width)
}

fn wrap_by_words(text: &str, line_start_byte: usize, max_width: usize) -> Vec<WrappedLineDraft> {
    let words = collect_word_segments(text);
    let mut lines = Vec::new();
    let mut line_start = 0usize;
    let mut line_end = 0usize;
    let mut line_width = 0usize;

    for word in words {
        if word.width > max_width {
            if line_start < line_end {
                push_wrapped_line(&mut lines, text, line_start_byte, line_start, line_end);
                line_width = 0;
            }

            let segment_text = &text[word.start_byte..word.end_byte];
            lines.extend(wrap_by_graphemes(
                segment_text,
                line_start_byte + word.start_byte,
                max_width,
            ));
            line_start = word.end_byte;
            line_end = word.end_byte;
            continue;
        }

        if line_start == line_end {
            line_start = word.start_byte;
            line_end = word.end_byte;
            line_width = word.width;
            continue;
        }

        if line_width + word.width > max_width {
            push_wrapped_line(&mut lines, text, line_start_byte, line_start, line_end);
            line_start = word.start_byte;
            line_end = word.end_byte;
            line_width = word.width;
            continue;
        }

        line_end = word.end_byte;
        line_width += word.width;
    }

    if line_start < text.len() {
        push_wrapped_line(&mut lines, text, line_start_byte, line_start, text.len());
    }

    if lines.is_empty() {
        lines.push(WrappedLineDraft {
            text: String::new(),
            source_start_byte: line_start_byte,
            source_end_byte: line_start_byte,
        });
    }

    lines
}

fn wrap_by_segments(
    text: &str,
    line_start_byte: usize,
    segments: &[TextSegment],
    max_width: usize,
) -> Vec<WrappedLineDraft> {
    let mut lines = Vec::new();
    let mut line_start = 0usize;
    let mut line_width = 0usize;

    for segment in segments {
        if segment.width > max_width {
            if line_start < segment.start_byte {
                push_wrapped_line(
                    &mut lines,
                    text,
                    line_start_byte,
                    line_start,
                    segment.start_byte,
                );
            }

            push_wrapped_line(
                &mut lines,
                text,
                line_start_byte,
                segment.start_byte,
                segment.end_byte,
            );
            line_start = segment.end_byte;
            line_width = 0;
            continue;
        }

        if line_width + segment.width > max_width && line_start < segment.start_byte {
            push_wrapped_line(
                &mut lines,
                text,
                line_start_byte,
                line_start,
                segment.start_byte,
            );
            line_start = segment.start_byte;
            line_width = 0;
        }

        line_width += segment.width;
    }

    if line_start < text.len() {
        push_wrapped_line(&mut lines, text, line_start_byte, line_start, text.len());
    }

    if lines.is_empty() {
        lines.push(WrappedLineDraft {
            text: String::new(),
            source_start_byte: line_start_byte,
            source_end_byte: line_start_byte,
        });
    }

    lines
}

fn push_wrapped_line(
    lines: &mut Vec<WrappedLineDraft>,
    text: &str,
    line_start_byte: usize,
    start_byte: usize,
    end_byte: usize,
) {
    lines.push(WrappedLineDraft {
        text: text[start_byte..end_byte].to_owned(),
        source_start_byte: line_start_byte + start_byte,
        source_end_byte: line_start_byte + end_byte,
    });
}

fn collect_graphemes(text: &str) -> Vec<TextSegment> {
    UnicodeSegmentation::grapheme_indices(text, true)
        .map(|(start_byte, grapheme)| TextSegment {
            start_byte,
            end_byte: start_byte + grapheme.len(),
            width: grapheme.width(),
        })
        .collect()
}

fn collect_word_segments(text: &str) -> Vec<TextSegment> {
    let mut byte_offset = 0usize;

    let mut segments = Vec::new();
    for boundary in text.split_word_bounds() {
        let start_byte = byte_offset;
        byte_offset += boundary.len();
        segments.push(TextSegment {
            start_byte,
            end_byte: byte_offset,
            width: boundary.width(),
        });
    }

    segments
}

fn apply_ellipsis(last_line: &mut WrappedLineDraft, max_width: usize) {
    if max_width == 0 {
        last_line.text.clear();
        last_line.source_end_byte = last_line.source_start_byte;
        return;
    }

    let ellipsis_width = '…'.width().unwrap_or(1);
    while !last_line.text.is_empty() && last_line.text.width() + ellipsis_width > max_width {
        if let Some((last_grapheme_start, _)) =
            UnicodeSegmentation::grapheme_indices(last_line.text.as_str(), true).last()
        {
            last_line.text.truncate(last_grapheme_start);
            last_line.source_end_byte = last_line.source_start_byte + last_line.text.len();
        } else {
            last_line.text.clear();
            last_line.source_end_byte = last_line.source_start_byte;
            break;
        }
    }

    if ellipsis_width <= max_width {
        last_line.text.push('…');
    }
}

fn finalize_wrapped_lines(
    lines: Vec<WrappedLineDraft>,
    spans: &[TextSpanData],
) -> Vec<WrappedLine> {
    let mut wrapped_lines = Vec::with_capacity(lines.len());
    let mut span_index = 0usize;

    for line in lines {
        // skip spans that end before this line
        while span_index < spans.len() && spans[span_index].end_byte <= line.source_start_byte {
            span_index += 1;
        }

        let mut line_spans = Vec::new();
        let mut current_index = span_index;

        while current_index < spans.len() && spans[current_index].start_byte < line.source_end_byte
        {
            let span = &spans[current_index];
            let overlap_start = span.start_byte.max(line.source_start_byte);
            let overlap_end = span.end_byte.min(line.source_end_byte);

            if overlap_start < overlap_end {
                line_spans.push(TextSpanData {
                    start_byte: overlap_start - line.source_start_byte,
                    end_byte: overlap_end - line.source_start_byte,
                    foreground: span.foreground,
                    background: span.background,
                    bold: span.bold,
                    italic: span.italic,
                    underline: span.underline,
                });
            }

            if span.end_byte <= line.source_end_byte {
                current_index += 1;
                continue;
            }

            // we don't "consume" the span if it's part of next line
            break;
        }

        wrapped_lines.push(WrappedLine {
            text: line.text,
            spans: line_spans,
        });
    }

    wrapped_lines
}

struct WrappedLineDraft {
    text: String,
    source_start_byte: usize,
    source_end_byte: usize,
}

#[derive(Clone, Copy)]
struct TextSegment {
    start_byte: usize,
    width: usize,
    end_byte: usize,
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

    fn test_span(start_byte: usize, end_byte: usize) -> TextSpanData {
        TextSpanData {
            start_byte,
            end_byte,
            foreground: Some(0xff00ff),
            background: Some(0x112233),
            bold: true,
            italic: true,
            underline: true,
        }
    }

    fn assert_span(
        span: &TextSpanData,
        start_byte: usize,
        end_byte: usize,
        foreground: Option<u32>,
        background: Option<u32>,
    ) {
        assert_eq!(span.start_byte, start_byte);
        assert_eq!(span.end_byte, end_byte);
        assert_eq!(span.foreground, foreground);
        assert_eq!(span.background, background);
        assert!(span.bold);
        assert!(span.italic);
        assert!(span.underline);
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
    fn word_wrap_falls_back_to_char_wrapping_for_later_long_words() {
        assert_lines(
            "a alphabet",
            3,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
            &["a ", "alp", "hab", "et"],
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

    #[test]
    fn ellipsis_trims_grapheme_clusters_as_whole_units() {
        assert_lines(
            "e\u{301}\nx",
            1,
            1,
            TextWrap::Char,
            TextOverflow::Ellipsis,
            &["…"],
        );
    }

    #[test]
    fn spans_follow_explicit_newline_splits() {
        let wrapped = wrap_text(
            "hello\nworld",
            &[test_span(3, 8)],
            10,
            10,
            TextWrap::Word,
            TextOverflow::Clip,
        );

        assert_eq!(wrapped.lines.len(), 2);
        assert_eq!(wrapped.lines[0].text, "hello");
        assert_eq!(wrapped.lines[1].text, "world");
        assert_eq!(wrapped.lines[0].spans.len(), 1);
        assert_eq!(wrapped.lines[1].spans.len(), 1);
        assert_span(
            &wrapped.lines[0].spans[0],
            3,
            5,
            Some(0xff00ff),
            Some(0x112233),
        );
        assert_span(
            &wrapped.lines[1].spans[0],
            0,
            2,
            Some(0xff00ff),
            Some(0x112233),
        );
    }

    #[test]
    fn spans_follow_soft_wrap_boundaries() {
        let wrapped = wrap_text(
            "abcdef",
            &[test_span(2, 4)],
            3,
            10,
            TextWrap::Char,
            TextOverflow::Clip,
        );

        assert_eq!(wrapped.lines.len(), 2);
        assert_eq!(wrapped.lines[0].text, "abc");
        assert_eq!(wrapped.lines[1].text, "def");
        assert_eq!(wrapped.lines[0].spans.len(), 1);
        assert_eq!(wrapped.lines[1].spans.len(), 1);
        assert_span(
            &wrapped.lines[0].spans[0],
            2,
            3,
            Some(0xff00ff),
            Some(0x112233),
        );
        assert_span(
            &wrapped.lines[1].spans[0],
            0,
            1,
            Some(0xff00ff),
            Some(0x112233),
        );
    }

    #[test]
    fn ellipsis_trims_spans_to_visible_prefix() {
        let wrapped = wrap_text(
            "abcdef",
            &[test_span(1, 5)],
            4,
            2,
            TextWrap::None,
            TextOverflow::Ellipsis,
        );

        assert_eq!(wrapped.lines.len(), 1);
        assert_eq!(wrapped.lines[0].text, "abc…");
        assert_eq!(wrapped.lines[0].spans.len(), 1);
        assert_span(
            &wrapped.lines[0].spans[0],
            1,
            3,
            Some(0xff00ff),
            Some(0x112233),
        );
    }

    #[test]
    fn surface_rect_intersection_clips_negative_coordinates() {
        let rect = SurfaceRect {
            x: -2.0,
            y: -1.0,
            w: 5.0,
            h: 4.0,
        };
        let clip = SurfaceRect {
            x: 0.0,
            y: 0.0,
            w: 10.0,
            h: 10.0,
        };

        let visible = rect.intersect(clip).unwrap();
        assert_eq!(visible.x, 0.0);
        assert_eq!(visible.y, 0.0);
        assert_eq!(visible.w, 3.0);
        assert_eq!(visible.h, 3.0);
    }

    #[test]
    fn fill_bounds_clamps_to_terminal_without_unsigned_wrap() {
        let rect = SurfaceRect {
            x: -3.0,
            y: -2.0,
            w: 6.0,
            h: 4.0,
        };

        let bounds = rect.fill_bounds(8, 6).unwrap();
        assert_eq!(bounds.x_start, 0);
        assert_eq!(bounds.x_end, 3);
        assert_eq!(bounds.y_start, 0);
        assert_eq!(bounds.y_end, 2);
    }

    fn read_cell_char(buf: &[u64], width: u16, col: u16, row: u16) -> char {
        let idx = (width as usize * row as usize + col as usize) * FIELDS_PER_CELL;
        char::from_u32(buf[idx] as u32).unwrap_or('\0')
    }

    #[test]
    fn draw_text_skips_wide_graphemes_clipped_on_left_edge() {
        let mut buf = vec![0u64; 4 * FIELDS_PER_CELL];
        let mut surface = Surface {
            buf: &mut buf,
            tw: 4,
            th: 1,
        };

        surface.draw_text(
            SurfaceRect {
                x: 0.0,
                y: 0.0,
                w: 3.0,
                h: 1.0,
            },
            SurfaceRect {
                x: 1.0,
                y: 0.0,
                w: 2.0,
                h: 1.0,
            },
            "界a",
            CellStyle {
                fg: DEFAULT_FG,
                bg: 0,
                attrs: 0,
            },
            &[],
        );

        assert_eq!(read_cell_char(&buf, 4, 0, 0), '\0');
        assert_eq!(read_cell_char(&buf, 4, 1, 0), '\0');
        assert_eq!(read_cell_char(&buf, 4, 2, 0), 'a');
        assert_eq!(read_cell_char(&buf, 4, 3, 0), '\0');
    }

    #[test]
    fn draw_text_skips_wide_graphemes_clipped_on_right_edge() {
        let mut buf = vec![0u64; 4 * FIELDS_PER_CELL];
        let mut surface = Surface {
            buf: &mut buf,
            tw: 4,
            th: 1,
        };

        surface.draw_text(
            SurfaceRect {
                x: 0.0,
                y: 0.0,
                w: 3.0,
                h: 1.0,
            },
            SurfaceRect {
                x: 0.0,
                y: 0.0,
                w: 2.0,
                h: 1.0,
            },
            "a界",
            CellStyle {
                fg: DEFAULT_FG,
                bg: 0,
                attrs: 0,
            },
            &[],
        );

        assert_eq!(read_cell_char(&buf, 4, 0, 0), 'a');
        assert_eq!(read_cell_char(&buf, 4, 1, 0), '\0');
        assert_eq!(read_cell_char(&buf, 4, 2, 0), '\0');
        assert_eq!(read_cell_char(&buf, 4, 3, 0), '\0');
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
    pub fn draw_bg(&mut self, rect: SurfaceRect, viewport: SurfaceRect, color: u32) {
        let Some(SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        }) = rect
            .intersect(viewport)
            // going from Taffy coords to terminal coords
            .and_then(|visible| visible.fill_bounds(self.tw, self.th))
        else {
            return;
        };

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

    pub fn draw_border(
        &mut self,
        rect: SurfaceRect,
        clip_rect: SurfaceRect,
        border: ResolvedBorder,
        bg: u32,
    ) {
        if !border.has_any_visible_side() {
            return;
        }

        let Some(bounds) = rect.border_bounds(self.tw, self.th) else {
            return;
        };
        let Some(viewport_bounds) = clip_rect.fill_bounds(self.tw, self.th) else {
            return;
        };

        if let Some((fg, style)) = border.is_uniform_full_box() {
            self.draw_uniform_border(style, bounds, viewport_bounds, fg, bg);
            return;
        }

        self.draw_mixed_border(bounds, viewport_bounds, border, bg);
    }

    fn draw_mixed_border(
        &mut self,
        bounds: SurfaceBounds,
        viewport_bounds: SurfaceBounds,
        border: ResolvedBorder,
        bg: u32,
    ) {
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
                self.set_cell_if_clipped(col, y_start, '─', style, viewport_bounds);
            }
        }
        if bottom {
            style.fg = border.bottom.color;
            for col in x_start..=x_end {
                self.set_cell_if_clipped(col, y_end, '─', style, viewport_bounds);
            }
        }
        if left {
            style.fg = border.left.color;
            for row in y_start..=y_end {
                self.set_cell_if_clipped(x_start, row, '│', style, viewport_bounds);
            }
        }
        if right {
            style.fg = border.right.color;
            for row in y_start..=y_end {
                self.set_cell_if_clipped(x_end, row, '│', style, viewport_bounds);
            }
        }

        if top && left {
            style.fg = border.top.color;
            self.set_cell_if_clipped(x_start, y_start, '┌', style, viewport_bounds);
        }
        if top && right {
            style.fg = border.top.color;
            self.set_cell_if_clipped(x_end, y_start, '┐', style, viewport_bounds);
        }
        if bottom && left {
            style.fg = border.bottom.color;
            self.set_cell_if_clipped(x_start, y_end, '└', style, viewport_bounds);
        }
        if bottom && right {
            style.fg = border.bottom.color;
            self.set_cell_if_clipped(x_end, y_end, '┘', style, viewport_bounds);
        }
    }

    fn draw_uniform_border(
        &mut self,
        style: BorderStyle,
        bounds: SurfaceBounds,
        clip_bounds: SurfaceBounds,
        fg: u32,
        bg: u32,
    ) {
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

        self.set_cell_if_clipped(x_start, y_start, tl, style, clip_bounds);
        self.set_cell_if_clipped(x_end, y_start, tr, style, clip_bounds);
        self.set_cell_if_clipped(x_start, y_end, bl, style, clip_bounds);
        self.set_cell_if_clipped(x_end, y_end, br, style, clip_bounds);

        for col in (x_start + 1)..x_end {
            self.set_cell_if_clipped(col, y_start, h_line, style, clip_bounds);
            self.set_cell_if_clipped(col, y_end, h_line, style, clip_bounds);
        }
        for row in (y_start + 1)..y_end {
            self.set_cell_if_clipped(x_start, row, v_line, style, clip_bounds);
            self.set_cell_if_clipped(x_end, row, v_line, style, clip_bounds);
        }
        return;
    }

    pub fn draw_text(
        &mut self,
        rect: SurfaceRect,
        clip_rect: SurfaceRect,
        text: &str,
        style: CellStyle,
        spans: &[TextSpanData],
    ) {
        let max_width = rect.w.max(0.0) as usize;
        if max_width == 0 {
            return;
        }

        let Some(visible_rect) = rect
            .intersect(clip_rect)
            .and_then(|visible| visible.intersect(SurfaceRect::terminal_bounds(self.tw, self.th)))
        else {
            return;
        };
        let Some(visible_bounds) = visible_rect.fill_bounds(self.tw, self.th) else {
            return;
        };

        let x_start = visible_bounds.x_start;
        let y_row = visible_bounds.y_start;
        let clip_left = ((visible_rect.x - rect.x).max(0.0).floor()) as usize;
        let visible_width = (visible_rect.w.max(0.0).ceil()) as usize;
        if visible_width == 0 {
            return;
        }
        let clip_right = clip_left + visible_width;

        let mut span_index = 0usize;
        let mut col_offset = 0usize;

        for (byte_start, grapheme) in UnicodeSegmentation::grapheme_indices(text, true) {
            let grapheme_width = grapheme.width();
            if grapheme_width == 0 {
                continue;
            }

            if col_offset >= max_width {
                break;
            }
            if col_offset + grapheme_width <= clip_left {
                col_offset += grapheme_width;
                continue;
            }
            if col_offset >= clip_left + visible_width {
                break;
            }
            if col_offset + grapheme_width > max_width {
                break;
            }
            if col_offset < clip_left || col_offset + grapheme_width > clip_right {
                col_offset += grapheme_width;
                continue;
            }

            let byte_end = byte_start + grapheme.len();
            let col = x_start + (col_offset - clip_left) as u16;

            while span_index < spans.len() && spans[span_index].end_byte <= byte_start {
                span_index += 1;
            }

            let mut cell_style = style;

            if let Some(span) = spans.get(span_index)
                && span.start_byte < byte_end
                && span.end_byte > byte_start
            {
                cell_style.fg = span.foreground.unwrap_or(style.fg);
                cell_style.bg = span.background.unwrap_or(style.bg);
                cell_style.attrs |= text_span_attr_flags(span);
            }

            self.set_cell(col, y_row, printable_grapheme_char(grapheme), cell_style);

            for continuation_offset in 1..grapheme_width {
                self.set_cell_if_clipped(
                    col + continuation_offset as u16,
                    y_row,
                    CONTINUATION_CELL,
                    cell_style,
                    visible_bounds,
                );
            }

            col_offset += grapheme_width;
        }
    }

    pub fn draw_cursor(
        &mut self,
        rect: SurfaceRect,
        clip_rect: SurfaceRect,
        text_len: f32,
        style: CellStyle,
    ) {
        let cell_rect = SurfaceRect {
            x: rect.x + text_len,
            y: rect.y,
            w: 1.0,
            h: 1.0,
        };
        let Some(visible) = cell_rect
            .intersect(clip_rect)
            .and_then(|visible| visible.fill_bounds(self.tw, self.th))
        else {
            return;
        };
        self.set_cell(visible.x_start, visible.y_start, '█', style);
    }

    fn set_cell_if_clipped(
        &mut self,
        col: u16,
        row: u16,
        ch: char,
        style: CellStyle,
        clip_bounds: SurfaceBounds,
    ) {
        if cell_in_bounds(col, row, clip_bounds) {
            self.set_cell(col, row, ch, style);
        }
    }
}

fn printable_cell_char(ch: char) -> char {
    if ch.is_control() { ' ' } else { ch }
}

fn printable_grapheme_char(grapheme: &str) -> char {
    grapheme
        .chars()
        .find(|ch| !ch.is_control())
        .map_or(' ', printable_cell_char)
}

#[derive(Clone, Copy)]
pub struct SurfaceRect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Clone, Copy)]
pub struct SurfaceBounds {
    pub x_start: u16,
    pub x_end: u16,
    pub y_start: u16,
    pub y_end: u16,
}

impl SurfaceRect {
    pub fn terminal_bounds(max_w: u16, max_h: u16) -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            w: max_w as f32,
            h: max_h as f32,
        }
    }

    pub fn is_empty(&self) -> bool {
        !self.x.is_finite()
            || !self.y.is_finite()
            || !self.w.is_finite()
            || !self.h.is_finite()
            || self.w <= 0.0
            || self.h <= 0.0
    }

    pub fn intersect(&self, other: SurfaceRect) -> Option<SurfaceRect> {
        if self.is_empty() || other.is_empty() {
            return None;
        }

        let x_start = self.x.max(other.x);
        let y_start = self.y.max(other.y);
        let x_end = (self.x + self.w).min(other.x + other.w);
        let y_end = (self.y + self.h).min(other.y + other.h);

        let width = x_end - x_start;
        let height = y_end - y_start;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }

        Some(SurfaceRect {
            x: x_start,
            y: y_start,
            w: width,
            h: height,
        })
    }

    pub(crate) fn fill_bounds(&self, max_w: u16, max_h: u16) -> Option<SurfaceBounds> {
        let visible = self.intersect(Self::terminal_bounds(max_w, max_h))?;
        let x_start = visible.x.floor().max(0.0) as u16;
        let y_start = visible.y.floor().max(0.0) as u16;
        let x_end = (visible.x + visible.w).ceil().min(max_w as f32) as u16;
        let y_end = (visible.y + visible.h).ceil().min(max_h as f32) as u16;
        if x_start >= x_end || y_start >= y_end {
            return None;
        }

        Some(SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        })
    }

    fn border_bounds(&self, max_w: u16, max_h: u16) -> Option<SurfaceBounds> {
        if self.is_empty() {
            return None;
        }

        let x_start = self.x.floor();
        let y_start = self.y.floor();
        let x_end = (self.x + self.w).ceil() - 1.0;
        let y_end = (self.y + self.h).ceil() - 1.0;

        if x_end < 0.0 || y_end < 0.0 || x_start >= max_w as f32 || y_start >= max_h as f32 {
            return None;
        }

        let x_start = x_start.max(0.0) as u16;
        let y_start = y_start.max(0.0) as u16;
        let x_end = x_end.min(max_w.saturating_sub(1) as f32) as u16;
        let y_end = y_end.min(max_h.saturating_sub(1) as f32) as u16;

        if x_start > x_end || y_start > y_end {
            return None;
        }

        Some(SurfaceBounds {
            x_start,
            x_end,
            y_start,
            y_end,
        })
    }
}

fn cell_in_bounds(col: u16, row: u16, bounds: SurfaceBounds) -> bool {
    col >= bounds.x_start && col < bounds.x_end && row >= bounds.y_start && row < bounds.y_end
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
