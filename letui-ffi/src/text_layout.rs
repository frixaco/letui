use crate::shared::{
    DEFAULT_BG, DEFAULT_FG, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use crate::tree::{TextOverflow, TextSpanData, TextWrap};
use unicode_width::UnicodeWidthChar;

#[derive(Debug, Clone)]
pub(crate) struct TextLayoutRequest<'a> {
    pub(crate) text: &'a str,
    pub(crate) spans: &'a [TextSpanData],
    pub(crate) max_width: Option<u16>,
    pub(crate) wrap: TextWrap,
    pub(crate) overflow: TextOverflow,
    pub(crate) cursor: Option<usize>,
    pub(crate) show_cursor: bool,
    pub(crate) default_fg: u32,
    pub(crate) default_bg: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct TextLayoutResult {
    pub(crate) width: u16,
    pub(crate) height: u16,
    pub(crate) lines: Vec<VisualLine>,
    pub(crate) cursor: Option<CursorPlacement>,
}

#[derive(Debug, Clone)]
pub(crate) struct VisualLine {
    pub(crate) display_width: u16,
    pub(crate) cells: Vec<VisualCell>,
    pub(crate) ends_with_ellipsis: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct VisualCell {
    pub(crate) ch: char,
    pub(crate) display_col: u16,
    pub(crate) width: u8,
    pub(crate) foreground: u32,
    pub(crate) background: u32,
    pub(crate) attrs: u8,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct CursorPlacement {
    pub(crate) row: u16,
    pub(crate) col: u16,
}

#[derive(Debug, Clone)]
struct SourceUnit {
    ch: char,
    byte_start: usize,
    byte_end: usize,
    width: u8,
    is_space: bool,
    foreground: u32,
    background: u32,
    attrs: u8,
}

#[derive(Debug, Clone)]
struct ExplicitLine {
    units: Vec<SourceUnit>,
    break_start: Option<usize>,
    break_end: Option<usize>,
}

#[derive(Debug, Clone, Copy)]
struct SegmentRange {
    start: usize,
    end: usize,
    is_space: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ClipRect {
    pub(crate) left: u16,
    pub(crate) top: u16,
    pub(crate) right: u16,
    pub(crate) bottom: u16,
}

impl ClipRect {
    pub(crate) fn intersect(self, other: ClipRect) -> ClipRect {
        ClipRect {
            left: self.left.max(other.left),
            top: self.top.max(other.top),
            right: self.right.min(other.right),
            bottom: self.bottom.min(other.bottom),
        }
    }

    pub(crate) fn contains(self, col: u16, row: u16) -> bool {
        col >= self.left && col < self.right && row >= self.top && row < self.bottom
    }
}

fn saturating_usize_to_u16(value: usize) -> u16 {
    value.min(u16::MAX as usize) as u16
}

fn saturating_u32_to_u16(value: u32) -> u16 {
    value.min(u16::MAX as u32) as u16
}

fn resolve_span_style(span: &TextSpanData, default_fg: u32, default_bg: u32) -> (u32, u32, u8) {
    let mut attrs = 0u8;
    if span.bold {
        attrs |= TEXT_ATTR_BOLD;
    }
    if span.italic {
        attrs |= TEXT_ATTR_ITALIC;
    }
    if span.underline {
        attrs |= TEXT_ATTR_UNDERLINE;
    }

    (
        span.foreground.unwrap_or(default_fg),
        span.background.unwrap_or(default_bg),
        attrs,
    )
}

fn char_display_width(ch: char) -> u8 {
    UnicodeWidthChar::width(ch).unwrap_or(0).min(2) as u8
}

fn build_explicit_lines(request: &TextLayoutRequest<'_>) -> Vec<ExplicitLine> {
    let mut lines = Vec::new();
    let mut current_units = Vec::new();
    let mut span_index = 0usize;
    let mut chars = request.text.char_indices().peekable();

    while let Some((byte_start, ch)) = chars.next() {
        let mut byte_end = byte_start + ch.len_utf8();
        let mut is_break = false;

        if ch == '\r' {
            is_break = true;
            if let Some((next_start, '\n')) = chars.peek().copied() {
                let _ = chars.next();
                byte_end = next_start + '\n'.len_utf8();
            }
        } else if ch == '\n' {
            is_break = true;
        }

        if is_break {
            lines.push(ExplicitLine {
                units: std::mem::take(&mut current_units),
                break_start: Some(byte_start),
                break_end: Some(byte_end),
            });
            continue;
        }

        while span_index < request.spans.len() && request.spans[span_index].end_byte <= byte_start {
            span_index += 1;
        }

        let (foreground, background, attrs) = request
            .spans
            .get(span_index)
            .filter(|span| byte_start >= span.start_byte && byte_start < span.end_byte)
            .map(|span| resolve_span_style(span, request.default_fg, request.default_bg))
            .unwrap_or((request.default_fg, request.default_bg, 0));

        let rendered = if ch == '\t' { ' ' } else { ch };
        current_units.push(SourceUnit {
            ch: rendered,
            byte_start,
            byte_end,
            width: char_display_width(rendered),
            is_space: rendered == ' ',
            foreground,
            background,
            attrs,
        });
    }

    lines.push(ExplicitLine {
        units: current_units,
        break_start: None,
        break_end: None,
    });

    if lines.is_empty() {
        lines.push(ExplicitLine {
            units: Vec::new(),
            break_start: None,
            break_end: None,
        });
    }

    lines
}

fn build_segments(units: &[SourceUnit]) -> Vec<SegmentRange> {
    if units.is_empty() {
        return Vec::new();
    }

    let mut segments = Vec::new();
    let mut start = 0usize;
    let mut is_space = units[0].is_space;

    for index in 1..units.len() {
        if units[index].is_space != is_space {
            segments.push(SegmentRange {
                start,
                end: index,
                is_space,
            });
            start = index;
            is_space = units[index].is_space;
        }
    }

    segments.push(SegmentRange {
        start,
        end: units.len(),
        is_space,
    });
    segments
}

fn push_visible_unit(line: &mut VisualLine, unit: &SourceUnit) {
    if unit.width == 0 {
        return;
    }

    line.cells.push(VisualCell {
        ch: unit.ch,
        display_col: line.display_width,
        width: unit.width,
        foreground: unit.foreground,
        background: unit.background,
        attrs: unit.attrs,
    });
    line.display_width = line.display_width.saturating_add(unit.width as u16);
}

fn empty_line() -> VisualLine {
    VisualLine {
        display_width: 0,
        cells: Vec::new(),
        ends_with_ellipsis: false,
    }
}

fn line_end_cursor(row: usize, line: &VisualLine) -> CursorPlacement {
    CursorPlacement {
        row: saturating_usize_to_u16(row),
        col: line.display_width,
    }
}

fn place_cursor_if_matches(
    cursor: Option<usize>,
    placement: &mut Option<CursorPlacement>,
    byte_index: usize,
    row: usize,
    col: u16,
) {
    if placement.is_none() && cursor == Some(byte_index) {
        *placement = Some(CursorPlacement {
            row: saturating_usize_to_u16(row),
            col,
        });
    }
}

struct LineBuilder {
    cursor_target: Option<usize>,
    cursor: Option<CursorPlacement>,
    lines: Vec<VisualLine>,
    current: VisualLine,
}

impl LineBuilder {
    fn new(cursor_target: Option<usize>) -> Self {
        Self {
            cursor_target,
            cursor: None,
            lines: Vec::new(),
            current: empty_line(),
        }
    }

    fn current_row(&self) -> usize {
        self.lines.len()
    }

    fn current_width(&self) -> u16 {
        self.current.display_width
    }

    fn can_fit(&self, width: u16, max_width: u16) -> bool {
        self.current_width().saturating_add(width) <= max_width
    }

    fn mark_boundary(&mut self, byte_index: usize) {
        self.mark_boundary_at(byte_index, self.current_row(), self.current_width());
    }

    fn mark_boundary_at(&mut self, byte_index: usize, row: usize, col: u16) {
        place_cursor_if_matches(self.cursor_target, &mut self.cursor, byte_index, row, col);
    }

    fn push_unit(&mut self, unit: &SourceUnit) {
        push_visible_unit(&mut self.current, unit);
    }

    fn push_ellipsis(&mut self, source: Option<&SourceUnit>, request: &TextLayoutRequest<'_>) {
        let mut ellipsis = ellipsis_cell(source, request);
        ellipsis.display_col = self.current_width();
        self.current.cells.push(ellipsis);
        self.current.display_width = self.current.display_width.saturating_add(1);
        self.current.ends_with_ellipsis = true;
    }

    fn finish_line(&mut self) {
        let line = std::mem::replace(&mut self.current, empty_line());
        self.lines.push(line);
    }

    fn last_finished_line(&self) -> Option<&VisualLine> {
        self.lines.last()
    }

    fn finished_line_count(&self) -> usize {
        self.lines.len()
    }

    fn into_parts(self) -> (Vec<VisualLine>, Option<CursorPlacement>) {
        (self.lines, self.cursor)
    }
}

fn ellipsis_cell(source: Option<&SourceUnit>, request: &TextLayoutRequest<'_>) -> VisualCell {
    let foreground = source.map_or(request.default_fg, |unit| unit.foreground);
    let background = source.map_or(request.default_bg, |unit| unit.background);
    let attrs = source.map_or(0, |unit| unit.attrs);

    VisualCell {
        ch: '…',
        display_col: 0,
        width: 1,
        foreground,
        background,
        attrs,
    }
}

fn layout_no_wrap_clip(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        for unit in units {
            builder.mark_boundary(unit.byte_start);
            builder.push_unit(unit);
            builder.mark_boundary(unit.byte_end);
        }
        return;
    };

    if max_width == 0 {
        let row = builder.current_row();
        for unit in units {
            builder.mark_boundary_at(unit.byte_start, row, 0);
            builder.mark_boundary_at(unit.byte_end, row, 0);
        }
        return;
    }

    for unit in units {
        builder.mark_boundary(unit.byte_start);
        if unit.width == 0 {
            builder.mark_boundary(unit.byte_end);
            continue;
        }

        if !builder.can_fit(unit.width as u16, max_width) {
            builder.mark_boundary_at(unit.byte_end, builder.current_row(), max_width);
            break;
        }

        builder.push_unit(unit);
        builder.mark_boundary(unit.byte_end);
    }
}

fn layout_no_wrap_ellipsis(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap_clip(request, units, builder);
        return;
    };

    if max_width == 0 {
        let row = builder.current_row();
        for unit in units {
            builder.mark_boundary_at(unit.byte_start, row, 0);
            builder.mark_boundary_at(unit.byte_end, row, 0);
        }
        return;
    };

    if max_width == 1 {
        let truncation_source = units.iter().find(|unit| unit.width > 0);
        if truncation_source.is_some() {
            builder.push_ellipsis(truncation_source, request);
        }

        let col = builder.current_width().min(1);
        for unit in units {
            builder.mark_boundary_at(unit.byte_start, builder.current_row(), col);
            builder.mark_boundary_at(unit.byte_end, builder.current_row(), col);
        }
        return;
    }

    let mut truncation_source = None;
    for unit in units {
        builder.mark_boundary(unit.byte_start);
        if unit.width == 0 {
            builder.mark_boundary(unit.byte_end);
            continue;
        }

        if builder.current_width().saturating_add(unit.width as u16) > max_width.saturating_sub(1) {
            truncation_source = Some(unit);
            builder.mark_boundary_at(unit.byte_end, builder.current_row(), max_width);
            break;
        }

        builder.push_unit(unit);
        builder.mark_boundary(unit.byte_end);
    }

    if line_width_without_wrap(units) > max_width || truncation_source.is_some() {
        builder.push_ellipsis(truncation_source.or_else(|| units.last()), request);
    }
}

fn layout_no_wrap(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    builder: &mut LineBuilder,
) {
    match request.overflow {
        TextOverflow::Clip => layout_no_wrap_clip(request, units, builder),
        TextOverflow::Ellipsis => layout_no_wrap_ellipsis(request, units, builder),
    }
}

fn append_char_wrapped_units(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap(request, units, builder);
        return;
    };

    if max_width == 0 {
        let row = builder.current_row();
        for unit in units {
            builder.mark_boundary_at(unit.byte_start, row, 0);
            builder.mark_boundary_at(unit.byte_end, row, 0);
        }
        return;
    }

    for unit in units {
        builder.mark_boundary(unit.byte_start);

        if unit.width == 0 {
            builder.mark_boundary(unit.byte_end);
            continue;
        }

        if builder.current_width() > 0 && !builder.can_fit(unit.width as u16, max_width) {
            builder.finish_line();
            builder.mark_boundary(unit.byte_start);
        }

        if builder.current_width() == 0 && unit.width as u16 > max_width {
            builder.mark_boundary(unit.byte_end);
            builder.finish_line();
            continue;
        }

        builder.push_unit(unit);
        builder.mark_boundary(unit.byte_end);
    }
}

fn append_word_wrapped_units(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap(request, units, builder);
        return;
    };

    if max_width == 0 {
        let row = builder.current_row();
        for unit in units {
            builder.mark_boundary_at(unit.byte_start, row, 0);
            builder.mark_boundary_at(unit.byte_end, row, 0);
        }
        return;
    }

    if units.is_empty() {
        return;
    }

    let segments = build_segments(units);
    for segment in segments {
        let segment_units = &units[segment.start..segment.end];
        let segment_width: u16 = segment_units.iter().map(|unit| unit.width as u16).sum();

        if !segment.is_space
            && builder.current_width() > 0
            && builder.current_width().saturating_add(segment_width) > max_width
        {
            builder.finish_line();
        }

        if !segment.is_space && segment_width <= max_width {
            for unit in segment_units {
                builder.mark_boundary(unit.byte_start);
                builder.push_unit(unit);
                builder.mark_boundary(unit.byte_end);
            }
            continue;
        }

        for unit in segment_units {
            builder.mark_boundary(unit.byte_start);

            if unit.width == 0 {
                builder.mark_boundary(unit.byte_end);
                continue;
            }

            if builder.current_width() > 0 && !builder.can_fit(unit.width as u16, max_width) {
                builder.finish_line();
                builder.mark_boundary(unit.byte_start);
            }

            if builder.current_width() == 0 && unit.width as u16 > max_width {
                builder.mark_boundary(unit.byte_end);
                continue;
            }

            builder.push_unit(unit);
            builder.mark_boundary(unit.byte_end);
        }
    }
}

fn line_width_without_wrap(units: &[SourceUnit]) -> u16 {
    saturating_u32_to_u16(units.iter().map(|unit| unit.width as u32).sum())
}

pub(crate) fn layout_text(request: &TextLayoutRequest<'_>) -> TextLayoutResult {
    let explicit_lines = build_explicit_lines(request);
    let mut builder = LineBuilder::new(request.cursor);

    for explicit_line in &explicit_lines {
        match request.wrap {
            TextWrap::None => layout_no_wrap(request, &explicit_line.units, &mut builder),
            TextWrap::Char => {
                append_char_wrapped_units(request, &explicit_line.units, &mut builder)
            }
            TextWrap::Word => {
                append_word_wrapped_units(request, &explicit_line.units, &mut builder)
            }
        }
        builder.finish_line();

        if let Some(break_start) = explicit_line.break_start {
            if let Some(last_line) = builder.last_finished_line() {
                builder.mark_boundary_at(
                    break_start,
                    builder.finished_line_count() - 1,
                    last_line.display_width,
                );
            }
        }
        if let Some(break_end) = explicit_line.break_end {
            builder.mark_boundary_at(break_end, builder.finished_line_count(), 0);
        }
    }

    let (mut lines, mut cursor) = builder.into_parts();

    if lines.is_empty() {
        lines.push(empty_line());
    }

    if request.show_cursor && cursor.is_none() && request.cursor == Some(request.text.len()) {
        if let Some(last_line) = lines.last() {
            cursor = Some(line_end_cursor(lines.len() - 1, last_line));
        }
    }

    let width = lines
        .iter()
        .map(|line| line.display_width)
        .max()
        .unwrap_or(0);
    let height = saturating_usize_to_u16(lines.len());

    TextLayoutResult {
        width,
        height,
        lines,
        cursor: if request.show_cursor { cursor } else { None },
    }
}

pub(crate) fn measure_max_content(
    text: &str,
    spans: &[TextSpanData],
    fg: u32,
    bg: u32,
) -> TextLayoutResult {
    layout_text(&TextLayoutRequest {
        text,
        spans,
        max_width: None,
        wrap: TextWrap::None,
        overflow: TextOverflow::Clip,
        cursor: None,
        show_cursor: false,
        default_fg: if fg != 0 { fg } else { DEFAULT_FG },
        default_bg: if bg != 0 { bg } else { DEFAULT_BG },
    })
}

pub(crate) fn measure_min_content(
    text: &str,
    spans: &[TextSpanData],
    wrap: TextWrap,
    fg: u32,
    bg: u32,
) -> u16 {
    let request = TextLayoutRequest {
        text,
        spans,
        max_width: None,
        wrap,
        overflow: TextOverflow::Clip,
        cursor: None,
        show_cursor: false,
        default_fg: if fg != 0 { fg } else { DEFAULT_FG },
        default_bg: if bg != 0 { bg } else { DEFAULT_BG },
    };
    let explicit_lines = build_explicit_lines(&request);

    match wrap {
        TextWrap::None => explicit_lines
            .iter()
            .map(|line| line_width_without_wrap(&line.units))
            .max()
            .unwrap_or(0),
        TextWrap::Char => explicit_lines
            .iter()
            .flat_map(|line| line.units.iter())
            .map(|unit| unit.width as u16)
            .max()
            .unwrap_or(0),
        TextWrap::Word => explicit_lines
            .iter()
            .flat_map(|line| {
                build_segments(&line.units)
                    .into_iter()
                    .map(move |segment| (segment, &line.units))
            })
            .map(|(segment, units)| {
                if segment.is_space {
                    units[segment.start..segment.end]
                        .iter()
                        .map(|unit| unit.width as u16)
                        .max()
                        .unwrap_or(0)
                } else {
                    units[segment.start..segment.end]
                        .iter()
                        .map(|unit| unit.width as u16)
                        .sum::<u16>()
                }
            })
            .max()
            .unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request<'a>(
        text: &'a str,
        max_width: Option<u16>,
        wrap: TextWrap,
        overflow: TextOverflow,
        cursor: Option<usize>,
    ) -> TextLayoutRequest<'a> {
        TextLayoutRequest {
            text,
            spans: &[],
            max_width,
            wrap,
            overflow,
            cursor,
            show_cursor: cursor.is_some(),
            default_fg: DEFAULT_FG,
            default_bg: DEFAULT_BG,
        }
    }

    fn line_text(line: &VisualLine) -> String {
        line.cells.iter().map(|cell| cell.ch).collect()
    }

    #[test]
    fn no_wrap_ellipsis_truncates_with_trailing_marker() {
        let result = layout_text(&request(
            "abcd",
            Some(3),
            TextWrap::None,
            TextOverflow::Ellipsis,
            None,
        ));

        assert_eq!(result.width, 3);
        assert_eq!(result.height, 1);
        assert_eq!(line_text(&result.lines[0]), "ab…");
        assert!(result.lines[0].ends_with_ellipsis);
    }

    #[test]
    fn width_zero_units_do_not_advance_display_width() {
        let text = "a\u{0301}b";
        let accent_end = "a\u{0301}".len();
        let result = layout_text(&request(
            text,
            Some(10),
            TextWrap::None,
            TextOverflow::Clip,
            Some(accent_end),
        ));

        assert_eq!(result.width, 2);
        assert_eq!(result.height, 1);
        assert_eq!(line_text(&result.lines[0]), "ab");
        let cursor = result.cursor.expect("cursor should be placed");
        assert_eq!(cursor.row, 0);
        assert_eq!(cursor.col, 1);
    }

    #[test]
    fn char_wrap_breaks_at_visible_unit_boundaries() {
        let result = layout_text(&request(
            "abcd",
            Some(3),
            TextWrap::Char,
            TextOverflow::Clip,
            None,
        ));

        assert_eq!(result.width, 3);
        assert_eq!(result.height, 2);
        assert_eq!(line_text(&result.lines[0]), "abc");
        assert_eq!(line_text(&result.lines[1]), "d");
    }

    #[test]
    fn word_wrap_prefers_whole_segments() {
        let result = layout_text(&request(
            "ab cd",
            Some(3),
            TextWrap::Word,
            TextOverflow::Clip,
            None,
        ));

        assert_eq!(result.width, 3);
        assert_eq!(result.height, 2);
        assert_eq!(line_text(&result.lines[0]), "ab ");
        assert_eq!(line_text(&result.lines[1]), "cd");
    }

    #[test]
    fn explicit_break_places_cursor_on_following_row_start() {
        let text = "ab\ncd";
        let break_end = "ab\n".len();
        let result = layout_text(&request(
            text,
            Some(10),
            TextWrap::None,
            TextOverflow::Clip,
            Some(break_end),
        ));

        assert_eq!(result.height, 2);
        assert_eq!(line_text(&result.lines[0]), "ab");
        assert_eq!(line_text(&result.lines[1]), "cd");
        let cursor = result.cursor.expect("cursor should be placed");
        assert_eq!(cursor.row, 1);
        assert_eq!(cursor.col, 0);
    }
}
