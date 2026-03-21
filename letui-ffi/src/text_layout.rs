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

fn finalize_line_for_no_wrap(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    row: usize,
    cursor: &mut Option<CursorPlacement>,
) -> VisualLine {
    let mut line = VisualLine {
        display_width: 0,
        cells: Vec::new(),
        ends_with_ellipsis: false,
    };

    let Some(max_width) = request.max_width else {
        for unit in units {
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_start,
                row,
                line.display_width,
            );
            push_visible_unit(&mut line, unit);
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_end,
                row,
                line.display_width,
            );
        }
        return line;
    };

    if max_width == 0 {
        for unit in units {
            place_cursor_if_matches(request.cursor, cursor, unit.byte_start, row, 0);
            place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, 0);
        }
        return line;
    }

    if request.overflow == TextOverflow::Ellipsis {
        if max_width == 1 {
            let truncation_source = units.iter().find(|unit| unit.width > 0);
            line.cells.push(ellipsis_cell(truncation_source, request));
            line.display_width = 1;
            line.ends_with_ellipsis = truncation_source.is_some();
            for unit in units {
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_start,
                    row,
                    line.display_width.min(1),
                );
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_end,
                    row,
                    line.display_width.min(1),
                );
            }
            return line;
        }

        let mut truncation_source = None;
        for unit in units {
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_start,
                row,
                line.display_width,
            );
            if unit.width == 0 {
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_end,
                    row,
                    line.display_width,
                );
                continue;
            }

            let next_width = line.display_width.saturating_add(unit.width as u16);
            if next_width > max_width.saturating_sub(1) {
                truncation_source = Some(unit);
                place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, max_width);
                break;
            }

            push_visible_unit(&mut line, unit);
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_end,
                row,
                line.display_width,
            );
        }

        let content_width = line.display_width;
        let full_width: u16 = units.iter().map(|unit| unit.width as u16).sum();
        if full_width > max_width || truncation_source.is_some() {
            let mut ellipsis = ellipsis_cell(truncation_source.or_else(|| units.last()), request);
            ellipsis.display_col = content_width;
            line.cells.push(ellipsis);
            line.display_width = content_width.saturating_add(1);
            line.ends_with_ellipsis = true;
        }

        return line;
    }

    for unit in units {
        place_cursor_if_matches(
            request.cursor,
            cursor,
            unit.byte_start,
            row,
            line.display_width,
        );
        if unit.width == 0 {
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_end,
                row,
                line.display_width,
            );
            continue;
        }

        let next_width = line.display_width.saturating_add(unit.width as u16);
        if next_width > max_width {
            place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, max_width);
            break;
        }

        push_visible_unit(&mut line, unit);
        place_cursor_if_matches(
            request.cursor,
            cursor,
            unit.byte_end,
            row,
            line.display_width,
        );
    }

    line
}

fn append_char_wrapped_units(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    lines: &mut Vec<VisualLine>,
    cursor: &mut Option<CursorPlacement>,
) {
    let Some(max_width) = request.max_width else {
        let row = lines.len();
        lines.push(finalize_line_for_no_wrap(request, units, row, cursor));
        return;
    };

    if max_width == 0 {
        let row = lines.len();
        let line = VisualLine {
            display_width: 0,
            cells: Vec::new(),
            ends_with_ellipsis: false,
        };
        for unit in units {
            place_cursor_if_matches(request.cursor, cursor, unit.byte_start, row, 0);
            place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, 0);
        }
        lines.push(line);
        return;
    }

    let mut line = VisualLine {
        display_width: 0,
        cells: Vec::new(),
        ends_with_ellipsis: false,
    };

    for unit in units {
        let mut row = lines.len();
        place_cursor_if_matches(
            request.cursor,
            cursor,
            unit.byte_start,
            row,
            line.display_width,
        );

        if unit.width == 0 {
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_end,
                row,
                line.display_width,
            );
            continue;
        }

        if line.display_width > 0
            && line.display_width.saturating_add(unit.width as u16) > max_width
        {
            lines.push(line);
            line = VisualLine {
                display_width: 0,
                cells: Vec::new(),
                ends_with_ellipsis: false,
            };
            row = lines.len();
            place_cursor_if_matches(request.cursor, cursor, unit.byte_start, row, 0);
        }

        if line.display_width == 0 && unit.width as u16 > max_width {
            place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, 0);
            lines.push(line);
            line = VisualLine {
                display_width: 0,
                cells: Vec::new(),
                ends_with_ellipsis: false,
            };
            continue;
        }

        push_visible_unit(&mut line, unit);
        place_cursor_if_matches(
            request.cursor,
            cursor,
            unit.byte_end,
            row,
            line.display_width,
        );
    }

    lines.push(line);
}

fn append_word_wrapped_units(
    request: &TextLayoutRequest<'_>,
    units: &[SourceUnit],
    lines: &mut Vec<VisualLine>,
    cursor: &mut Option<CursorPlacement>,
) {
    let Some(max_width) = request.max_width else {
        let row = lines.len();
        lines.push(finalize_line_for_no_wrap(request, units, row, cursor));
        return;
    };

    if max_width == 0 {
        let row = lines.len();
        for unit in units {
            place_cursor_if_matches(request.cursor, cursor, unit.byte_start, row, 0);
            place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, 0);
        }
        lines.push(VisualLine {
            display_width: 0,
            cells: Vec::new(),
            ends_with_ellipsis: false,
        });
        return;
    }

    if units.is_empty() {
        lines.push(VisualLine {
            display_width: 0,
            cells: Vec::new(),
            ends_with_ellipsis: false,
        });
        return;
    }

    let segments = build_segments(units);
    let mut line = VisualLine {
        display_width: 0,
        cells: Vec::new(),
        ends_with_ellipsis: false,
    };

    for segment in segments {
        let segment_units = &units[segment.start..segment.end];
        let segment_width: u16 = segment_units.iter().map(|unit| unit.width as u16).sum();

        if !segment.is_space
            && line.display_width > 0
            && line.display_width.saturating_add(segment_width) > max_width
        {
            lines.push(line);
            line = VisualLine {
                display_width: 0,
                cells: Vec::new(),
                ends_with_ellipsis: false,
            };
        }

        if !segment.is_space && segment_width <= max_width {
            let row = lines.len();
            for unit in segment_units {
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_start,
                    row,
                    line.display_width,
                );
                push_visible_unit(&mut line, unit);
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_end,
                    row,
                    line.display_width,
                );
            }
            continue;
        }

        for unit in segment_units {
            let mut row = lines.len();
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_start,
                row,
                line.display_width,
            );

            if unit.width == 0 {
                place_cursor_if_matches(
                    request.cursor,
                    cursor,
                    unit.byte_end,
                    row,
                    line.display_width,
                );
                continue;
            }

            if line.display_width > 0
                && line.display_width.saturating_add(unit.width as u16) > max_width
            {
                lines.push(line);
                line = VisualLine {
                    display_width: 0,
                    cells: Vec::new(),
                    ends_with_ellipsis: false,
                };
                row = lines.len();
                place_cursor_if_matches(request.cursor, cursor, unit.byte_start, row, 0);
            }

            if line.display_width == 0 && unit.width as u16 > max_width {
                place_cursor_if_matches(request.cursor, cursor, unit.byte_end, row, 0);
                continue;
            }

            push_visible_unit(&mut line, unit);
            place_cursor_if_matches(
                request.cursor,
                cursor,
                unit.byte_end,
                row,
                line.display_width,
            );
        }
    }

    lines.push(line);
}

fn line_width_without_wrap(units: &[SourceUnit]) -> u16 {
    saturating_u32_to_u16(units.iter().map(|unit| unit.width as u32).sum())
}

pub(crate) fn layout_text(request: &TextLayoutRequest<'_>) -> TextLayoutResult {
    let explicit_lines = build_explicit_lines(request);
    let mut lines = Vec::new();
    let mut cursor = None;

    for explicit_line in &explicit_lines {
        match request.wrap {
            TextWrap::None => {
                let row = lines.len();
                lines.push(finalize_line_for_no_wrap(
                    request,
                    &explicit_line.units,
                    row,
                    &mut cursor,
                ));
            }
            TextWrap::Char => {
                append_char_wrapped_units(request, &explicit_line.units, &mut lines, &mut cursor)
            }
            TextWrap::Word => {
                append_word_wrapped_units(request, &explicit_line.units, &mut lines, &mut cursor)
            }
        }

        if let Some(break_start) = explicit_line.break_start {
            if let Some(last_line) = lines.last() {
                place_cursor_if_matches(
                    request.cursor,
                    &mut cursor,
                    break_start,
                    lines.len() - 1,
                    last_line.display_width,
                );
            }
        }
        if let Some(break_end) = explicit_line.break_end {
            place_cursor_if_matches(request.cursor, &mut cursor, break_end, lines.len(), 0);
        }
    }

    if lines.is_empty() {
        lines.push(VisualLine {
            display_width: 0,
            cells: Vec::new(),
            ends_with_ellipsis: false,
        });
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
