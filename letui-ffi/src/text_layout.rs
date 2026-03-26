//! Text layout engine: converts raw text + spans into visual lines with wrapping, truncation, and cursor placement.
//!
//! ## Data flow
//!
//! ```ignore
//! TextLayoutRequest { text, spans, max_width, wrap, overflow }
//!     |
//!     v
//! +----------------------+
//! | build_explicit_lines |  <- splits on \n, assigns span styles, builds RichChars
//! +----------------------+
//!     |
//!     v
//! +----------------+
//! |  LineBuilder   |  <- accumulates VisualLines, handles wrapping strategies
//! +----------------+
//!     |
//!     v
//! TextLayoutResult { width, height, lines, cursor }
//! ```
//!
//! ## Wrapping strategies
//!
//! Wrap mode / Behavior
//! `None` - No wrapping; respects overflow (clip or ellipsis)
//! `Char` - Break anywhere to fit; wide chars (`日`) may overflow line
//! `Word` - Only break at segment boundaries (spaces or wide-char gaps)
//!
//! ## Example
//!
//! ```ignore
//! // Input: "hello world" at max_width=8, word wrap
//! layout_text(&TextLayoutRequest {
//!     text: "hello world",
//!     spans: &[],
//!     max_width: Some(8),
//!     wrap: TextWrap::Word,
//!     overflow: TextOverflow::Clip,
//!     cursor: None,
//!     show_cursor: false,
//!     default_fg: DEFAULT_FG,
//!     default_bg: DEFAULT_BG,
//! });
//!
//! // Output:
//! // Line 0: "hello"  (display_width=5)
//! // Line 1: "world"  (display_width=5)
//! ```

use crate::shared::{
    DEFAULT_BG, DEFAULT_FG, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC, TEXT_ATTR_UNDERLINE,
};
use crate::tree::{TextOverflow, TextSpanData, TextWrap};
use unicode_width::UnicodeWidthChar;

// ============================================================================
// PUBLIC API
// ============================================================================

pub(crate) fn layout_text(request: &TextLayoutRequest<'_>) -> TextLayoutResult {
    let explicit_lines = build_explicit_lines(request);
    let mut builder = LineBuilder::new(request.cursor);

    for explicit_line in &explicit_lines {
        match request.wrap {
            TextWrap::None => layout_no_wrap(request, &explicit_line.chars, &mut builder),
            TextWrap::Char => {
                append_char_wrapped_chars(request, &explicit_line.chars, &mut builder)
            }
            TextWrap::Word => {
                append_word_wrapped_chars(request, &explicit_line.chars, &mut builder)
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
    let height = floor_usize_to_u16(lines.len());

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
            .map(|line| chars_display_width(&line.chars))
            .max()
            .unwrap_or(0),
        TextWrap::Char => explicit_lines
            .iter()
            .flat_map(|line| line.chars.iter())
            .map(|char| char.width as u16)
            .max()
            .unwrap_or(0),
        TextWrap::Word => explicit_lines
            .iter()
            .flat_map(|line| {
                build_segments(&line.chars)
                    .into_iter()
                    .map(move |segment| (segment, &line.chars))
            })
            .map(|(segment, chars)| {
                if segment.is_space {
                    chars[segment.start..segment.end]
                        .iter()
                        .map(|char| char.width as u16)
                        .max()
                        .unwrap_or(0)
                } else {
                    chars[segment.start..segment.end]
                        .iter()
                        .map(|char| char.width as u16)
                        .sum::<u16>()
                }
            })
            .max()
            .unwrap_or(0),
    }
}

// ============================================================================
// REQUEST / RESULT TYPES
// ============================================================================

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

// ============================================================================
// LINE BUILDER (stateful accumulator for visual lines)
// ============================================================================

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

    fn push_char(&mut self, char: &RichChar) {
        push_visible_char(&mut self.current, char);
    }

    fn push_ellipsis(&mut self, source: Option<&RichChar>, request: &TextLayoutRequest<'_>) {
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

// ============================================================================
// INTERNAL ALGORITHM
// ============================================================================

/// Parses raw text into explicit lines (split on \n, \r\n), applying span styles.
fn build_explicit_lines(request: &TextLayoutRequest<'_>) -> Vec<ExplicitLine> {
    let mut lines = Vec::new();
    let mut current_chars = Vec::new();
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
                chars: std::mem::take(&mut current_chars),
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
        current_chars.push(RichChar {
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
        chars: current_chars,
        break_start: None,
        break_end: None,
    });

    lines
}

/// Groups source chars into segments (contiguous runs of space or non-space chars).
/// Used by word-wrap to avoid breaking in the middle of words.
fn build_segments(chars: &[RichChar]) -> Vec<SegmentRange> {
    if chars.is_empty() {
        return Vec::new();
    }

    let mut segments = Vec::new();
    let mut start = 0usize;
    let mut is_space = chars[0].is_space;

    for index in 1..chars.len() {
        if chars[index].is_space != is_space {
            segments.push(SegmentRange {
                start,
                end: index,
                is_space,
            });
            start = index;
            is_space = chars[index].is_space;
        }
    }

    segments.push(SegmentRange {
        start,
        end: chars.len(),
        is_space,
    });
    segments
}

// ------------------------------------------------------------------------
// Layout strategies (no-wrap, char-wrap, word-wrap)
// ------------------------------------------------------------------------

fn layout_no_wrap(request: &TextLayoutRequest<'_>, chars: &[RichChar], builder: &mut LineBuilder) {
    match request.overflow {
        TextOverflow::Clip => layout_no_wrap_clip(request, chars, builder),
        TextOverflow::Ellipsis => layout_no_wrap_ellipsis(request, chars, builder),
    }
}

fn layout_no_wrap_clip(
    request: &TextLayoutRequest<'_>,
    chars: &[RichChar],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        append_chars_without_wrap(builder, chars);
        return;
    };

    if max_width == 0 {
        mark_boundaries_at(builder, chars, builder.current_row(), 0);
        return;
    }

    for char in chars {
        builder.mark_boundary(char.byte_start);
        if char.width == 0 {
            builder.mark_boundary(char.byte_end);
            continue;
        }

        if !builder.can_fit(char.width as u16, max_width) {
            builder.mark_boundary_at(char.byte_end, builder.current_row(), max_width);
            break;
        }

        builder.push_char(char);
        builder.mark_boundary(char.byte_end);
    }
}

fn layout_no_wrap_ellipsis(
    request: &TextLayoutRequest<'_>,
    chars: &[RichChar],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap_clip(request, chars, builder);
        return;
    };

    if max_width == 0 {
        mark_boundaries_at(builder, chars, builder.current_row(), 0);
        return;
    };

    if max_width == 1 {
        let truncation_source = chars.iter().find(|char| char.width > 0);
        if truncation_source.is_some() {
            builder.push_ellipsis(truncation_source, request);
        }

        let col = builder.current_width().min(1);
        mark_boundaries_at(builder, chars, builder.current_row(), col);
        return;
    }

    let mut truncation_source = None;
    for char in chars {
        builder.mark_boundary(char.byte_start);
        if char.width == 0 {
            builder.mark_boundary(char.byte_end);
            continue;
        }

        if builder.current_width().saturating_add(char.width as u16) > max_width.saturating_sub(1) {
            truncation_source = Some(char);
            builder.mark_boundary_at(char.byte_end, builder.current_row(), max_width);
            break;
        }

        builder.push_char(char);
        builder.mark_boundary(char.byte_end);
    }

    if chars_display_width(chars) > max_width || truncation_source.is_some() {
        builder.push_ellipsis(truncation_source.or_else(|| chars.last()), request);
    }
}

fn append_char_wrapped_chars(
    request: &TextLayoutRequest<'_>,
    chars: &[RichChar],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap(request, chars, builder);
        return;
    };

    if max_width == 0 {
        mark_boundaries_at(builder, chars, builder.current_row(), 0);
        return;
    }

    for char in chars {
        append_wrapped_char(builder, char, max_width, OversizeCharPolicy::FinishLine);
    }
}

fn append_word_wrapped_chars(
    request: &TextLayoutRequest<'_>,
    chars: &[RichChar],
    builder: &mut LineBuilder,
) {
    let Some(max_width) = request.max_width else {
        layout_no_wrap(request, chars, builder);
        return;
    };

    if max_width == 0 {
        mark_boundaries_at(builder, chars, builder.current_row(), 0);
        return;
    }

    if chars.is_empty() {
        return;
    }

    let segments = build_segments(chars);
    for segment in segments {
        let segment_chars = &chars[segment.start..segment.end];
        let segment_width = chars_display_width(segment_chars);

        if !segment.is_space
            && builder.current_width() > 0
            && builder.current_width().saturating_add(segment_width) > max_width
        {
            builder.finish_line();
        }

        if !segment.is_space && segment_width <= max_width {
            append_chars_without_wrap(builder, segment_chars);
            continue;
        }

        for char in segment_chars {
            append_wrapped_char(builder, char, max_width, OversizeCharPolicy::Skip);
        }
    }
}

// ------------------------------------------------------------------------
// Low-level char append helpers
// ------------------------------------------------------------------------

fn mark_boundaries_at(builder: &mut LineBuilder, chars: &[RichChar], row: usize, col: u16) {
    for char in chars {
        builder.mark_boundary_at(char.byte_start, row, col);
        builder.mark_boundary_at(char.byte_end, row, col);
    }
}

fn append_chars_without_wrap(builder: &mut LineBuilder, chars: &[RichChar]) {
    for char in chars {
        builder.mark_boundary(char.byte_start);
        builder.push_char(char);
        builder.mark_boundary(char.byte_end);
    }
}

#[derive(Clone, Copy)]
enum OversizeCharPolicy {
    Skip,
    FinishLine,
}

fn append_wrapped_char(
    builder: &mut LineBuilder,
    char: &RichChar,
    max_width: u16,
    oversize_policy: OversizeCharPolicy,
) {
    builder.mark_boundary(char.byte_start);

    if char.width == 0 {
        builder.mark_boundary(char.byte_end);
        return;
    }

    if builder.current_width() > 0 && !builder.can_fit(char.width as u16, max_width) {
        builder.finish_line();
        builder.mark_boundary(char.byte_start);
    }

    if builder.current_width() == 0 && char.width as u16 > max_width {
        builder.mark_boundary(char.byte_end);
        if matches!(oversize_policy, OversizeCharPolicy::FinishLine) {
            builder.finish_line();
        }
        return;
    }

    builder.push_char(char);
    builder.mark_boundary(char.byte_end);
}

fn ellipsis_cell(source: Option<&RichChar>, request: &TextLayoutRequest<'_>) -> VisualCell {
    let foreground = source.map_or(request.default_fg, |char| char.foreground);
    let background = source.map_or(request.default_bg, |char| char.background);
    let attrs = source.map_or(0, |char| char.attrs);

    VisualCell {
        ch: '…',
        display_col: 0,
        width: 1,
        foreground,
        background,
        attrs,
    }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

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

#[derive(Debug, Clone)]
struct RichChar {
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
    chars: Vec<RichChar>,
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
pub(crate) struct CursorPlacement {
    pub(crate) row: u16,
    pub(crate) col: u16,
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

// ============================================================================
// HELPERS
// ============================================================================

fn floor_usize_to_u16(value: usize) -> u16 {
    value.min(u16::MAX as usize) as u16
}

fn floor_u32_to_u16(value: u32) -> u16 {
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

fn push_visible_char(line: &mut VisualLine, char: &RichChar) {
    if char.width == 0 {
        return;
    }

    line.cells.push(VisualCell {
        ch: char.ch,
        display_col: line.display_width,
        width: char.width,
        foreground: char.foreground,
        background: char.background,
        attrs: char.attrs,
    });
    line.display_width = line.display_width.saturating_add(char.width as u16);
}

fn chars_display_width(chars: &[RichChar]) -> u16 {
    floor_u32_to_u16(chars.iter().map(|char| char.width as u32).sum())
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
        row: floor_usize_to_u16(row),
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
            row: floor_usize_to_u16(row),
            col,
        });
    }
}
