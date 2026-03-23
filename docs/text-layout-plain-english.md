# `letui-ffi/src/text_layout.rs` in plain English

This document explains what [`letui-ffi/src/text_layout.rs`](../letui-ffi/src/text_layout.rs) does,
without assuming you already know the file.

## Short version

This file is the Rust text layout engine for letui.

Its job is to take:

- a string
- optional style spans
- a width limit
- a wrap mode
- an overflow mode
- an optional cursor position

and turn that into:

- a list of visual lines
- a list of visual cells on each line
- measured width and height
- an optional cursor row/column

In other words:

- Taffy decides where the box goes
- `text_layout.rs` decides how text fits inside that box
- `render.rs` paints the result into the terminal buffer

## Why this file exists

Terminal UIs do not get browser text layout for free.

The engine still needs to answer questions like:

- where do line breaks happen?
- how wide is this text in terminal cells?
- which characters are visible under clipping?
- where should the cursor appear?
- how do text spans survive wrapping?

This file answers those questions once, in one place, so that:

- measurement uses the same logic as painting
- painting uses the same logic as cursor placement

That is the main design goal.

## Main inputs

The main input type is `TextLayoutRequest`.

It contains:

- `text`
  - the source string
- `spans`
  - styled byte ranges over that string
- `max_width`
  - optional width limit in terminal cells
- `wrap`
  - `None`, `Word`, or `Char`
- `overflow`
  - `Clip` or `Ellipsis`
- `cursor`
  - optional byte index where the cursor should land
- `show_cursor`
  - whether a cursor should be returned at all
- `default_fg` / `default_bg`
  - fallback colors

Important detail:

- cursor and span ranges are tracked in UTF-8 byte offsets
- visual layout is tracked in terminal cell columns

So this file constantly translates between:

- source-space: bytes in the original string
- screen-space: rows and columns in the terminal

## Main outputs

The main output type is `TextLayoutResult`.

It contains:

- `width`
  - widest produced visual line
- `height`
  - number of produced visual lines
- `lines`
  - the fully laid-out text
- `cursor`
  - optional row/column for the caret

Each `VisualLine` contains:

- `display_width`
  - how many terminal cells are occupied
- `cells`
  - the visible cells to paint
- `ends_with_ellipsis`
  - whether the line ended in `…`

Each `VisualCell` contains:

- the character to paint
- the display column where it starts
- whether it is width `1` or width `2`
- foreground/background colors
- text attributes like bold/italic/underline

## The file works in three stages

### 1. Parse source text into styled units

This happens in `build_explicit_lines(...)`.

The function walks the source text one Unicode scalar value at a time using
`char_indices()`.

For each character, it figures out:

- where it starts and ends in bytes
- how wide it is in terminal cells
- whether it should be treated as a space
- which style span applies to it

Those become `SourceUnit` values.

`SourceUnit` is the internal "raw material" type for layout.

Each unit stores:

- character
- byte start/end
- display width
- space/non-space flag
- resolved style

This stage also handles explicit line breaks:

- `\n`
- `\r`
- `\r\n`

Whenever one of those appears, the current list of units is closed into an
`ExplicitLine`.

That means the file treats source newlines as hard boundaries before any soft
wrapping logic runs.

It also normalizes tabs in a very simple way:

- `\t` becomes a single space

This file does not implement real tab stops.

### 2. Turn source units into visual lines

This is the heart of the file.

Once the text is split into explicit source lines, each explicit line is fed
through one of three policies:

- no wrap
- char wrap
- word wrap

All three policies share one helper: `LineBuilder`.

### 3. Return measurement and cursor placement

After all lines are built, `layout_text(...)` computes:

- final width
- final height
- final cursor placement

That same result is then used by callers for:

- intrinsic measurement
- final paint
- caret positioning

## `LineBuilder`: the central helper

`LineBuilder` exists to keep low-level line construction in one place.

Without it, every wrap mode would need to repeat logic for:

- tracking current line width
- creating new lines
- adding visible cells
- skipping zero-width units
- recording cursor matches

`LineBuilder` owns:

- the current in-progress visual line
- the list of finished lines
- the current cursor result, if found

It provides operations like:

- `current_width()`
- `can_fit(...)`
- `mark_boundary(...)`
- `push_unit(...)`
- `push_ellipsis(...)`
- `finish_line()`

The important mental model is:

- wrap functions decide *when* a break should happen
- `LineBuilder` knows *how* a line is actually built

## Cursor placement model

Cursor logic is easy to miss, but it is one of the most important parts of the
file.

The cursor is not attached to a character.
It is attached to a byte boundary in the source string.

That means the file checks cursor position:

- before each unit
- after each unit
- at explicit newline boundaries
- at end-of-text fallback

Why this matters:

- zero-width characters still affect cursor placement correctly
- the cursor can sit between characters
- the cursor can sit right after a newline

The core helper is `place_cursor_if_matches(...)`.

If the requested byte index matches the boundary currently being visited, the
file records the current visual row and column.

## Width model

This file uses `unicode_width` to decide how many terminal cells a character
occupies.

Possible widths in practice here:

- `0`
  - combining marks and similar zero-width units
- `1`
  - normal characters
- `2`
  - wide terminal characters

Zero-width units are important:

- they are still part of the source text
- they still have byte ranges
- they still affect cursor placement
- they do not create a visible painted cell

## No-wrap mode

This path is used when `wrap == TextWrap::None`.

There are two sub-modes:

- clip
- ellipsis

### No-wrap + clip

Implemented by `layout_no_wrap_clip(...)`.

Behavior:

- if there is no width limit, append everything
- if width is `0`, paint nothing and keep cursor at column `0`
- otherwise, keep appending visible units until the next visible unit would not fit

Once the next visible unit would overflow:

- stop
- do not soft-wrap

### No-wrap + ellipsis

Implemented by `layout_no_wrap_ellipsis(...)`.

Behavior:

- if there is no width limit, it behaves like clip
- if width is `0`, nothing is visible
- if width is limited, reserve room for a trailing `…`

The general idea is:

- keep the longest prefix that fits
- if content overflows, place `…` at the end

The ellipsis inherits styling from the truncation point when possible.

## Char-wrap mode

Implemented by `append_char_wrapped_units(...)`.

This is the simplest wrapping strategy.

Behavior:

- walk units left to right
- if the next visible unit does not fit on the current line, finish the line
- then continue on the next line

It does not care about words.
It only cares about visible unit boundaries.

This means:

- `"abcd"` at width `3` becomes `"abc"` + `"d"`

Zero-width units still pass through for cursor accounting, but do not consume
display width.

## Word-wrap mode

Implemented by `append_word_wrapped_units(...)`.

This mode tries to keep non-space runs together.

It first splits the explicit line into segments using `build_segments(...)`.

A segment is a maximal run of either:

- spaces
- non-spaces

So text like:

- `"ab cd  ef"`

becomes segments like:

- `"ab"`
- `" "`
- `"cd"`
- `"  "`
- `"ef"`

Then the function lays out one segment at a time.

Rules in plain English:

- if a non-space segment fits on the current line, keep it together
- if it would overflow and there is already content on the line, start a new line first
- if a segment itself is too wide, fall back to per-unit wrapping inside that segment
- spaces are preserved exactly; they are not trimmed or collapsed

This is intentionally source-preserving, not browser-like whitespace handling.

## Shared helper functions

Several small helpers exist mostly to keep repeated logic out of the main flow.

Examples:

- `resolve_span_style(...)`
  - turns one `TextSpanData` into concrete fg/bg/attrs
- `char_display_width(...)`
  - asks `unicode_width` for cell width
- `units_display_width(...)`
  - sums unit widths
- `append_units_without_wrap(...)`
  - append a run directly into the current line
- `append_wrapped_unit(...)`
  - shared "one unit under width constraint" helper
- `mark_boundaries_at(...)`
  - record cursor boundaries at a fixed visual position

These are mostly there to stop the wrap paths from repeating the same plumbing.

## How `layout_text(...)` ties everything together

`layout_text(...)` is the main entry point.

In plain English, it does this:

1. Parse the raw text into explicit lines of `SourceUnit`s.
2. Create a `LineBuilder`.
3. For each explicit line:
   - choose wrap policy
   - append units according to that policy
   - finish the visual line
   - if the source line ended in an explicit newline, record cursor positions around that break
4. If no lines were produced, ensure at least one empty line exists.
5. If the caller wants a cursor at end-of-text and no earlier boundary matched, place it at the end of the last line.
6. Compute the final width as the widest visual line.
7. Compute the final height as the number of visual lines.
8. Return everything.

This is the function to read if you want the whole story.

## Measurement helpers

This file is also used for sizing, not just final paint.

### `measure_max_content(...)`

This means:

- "how wide would this text be if nothing forced it to wrap?"

It builds a `TextLayoutRequest` with:

- no width constraint
- no cursor
- no overflow tricks beyond clip

and returns the full layout result.

### `measure_min_content(...)`

This means:

- "what is the smallest width that still matches the rules of this wrap mode?"

The answer depends on wrap mode.

For `TextWrap::None`:

- widest explicit source line

For `TextWrap::Char`:

- widest single visible unit

For `TextWrap::Word`:

- widest indivisible word-like segment
- space runs are treated as more divisible than non-space runs

This is used by the Taffy measure callback in `render.rs`.

## Relationship to `render.rs`

`text_layout.rs` does not paint directly into the terminal buffer.

Instead, it produces a layout result.

Then `render.rs` does the final painting work:

- clips to content box
- writes cells into the terminal buffer
- expands width-2 cells with continuation markers
- paints the cursor block if one is present

So the split of responsibility is:

- `text_layout.rs`
  - decide rows, columns, wrapping, clipping/ellipsis decisions, and cursor position
- `render.rs`
  - decide where on screen those cells go and write them to the buffer

## Relationship to spans

Styled text spans are already normalized before they reach this file.

This file assumes spans are valid byte ranges and applies them while building
`SourceUnit`s.

That means style is attached early, before wrapping.

So when wrapping happens:

- style naturally stays with the units that moved to later lines

This is the right model for terminal rendering.

## Relationship to terminal geometry

This file thinks in terminal cells, not pixels.

That means:

- width limits are whole-cell limits
- line height is one terminal row
- all columns and rows are integers

This keeps layout deterministic and makes it match the terminal renderer.

## Things this file does not try to do

This file is deliberately simpler than a browser text engine.

It does not try to solve:

- full grapheme cluster editing
- complex shaping
- bidirectional text
- real tab-stop expansion
- text selection
- scrolling
- multiline ellipsis
- height-aware line clamping

That is why the code can stay terminal-oriented instead of turning into a full
text engine.

## How to read the file without getting lost

A good reading order is:

1. `TextLayoutRequest`, `TextLayoutResult`, `VisualLine`, `VisualCell`
2. `SourceUnit`, `ExplicitLine`, `SegmentRange`
3. `build_explicit_lines(...)`
4. `LineBuilder`
5. `layout_no_wrap_*`
6. `append_char_wrapped_units(...)`
7. `append_word_wrapped_units(...)`
8. `layout_text(...)`
9. `measure_max_content(...)` and `measure_min_content(...)`
10. tests at the bottom

If you read in that order, the file is much easier to follow.

## One-sentence summary

`text_layout.rs` takes source text plus style and width constraints, turns it
into terminal-ready visual lines, and makes measurement, painting, and cursor
placement all agree with each other.
