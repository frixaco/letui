# LineBuilder Migration Plan

## Goal

Make `letui-ffi/src/text_layout.rs` easier to read and maintain without changing behavior.

The core idea:

- keep one place that knows how to build visual lines
- make wrap modes decide only where line breaks happen
- stop repeating cursor logic, width handling, and line-reset code in multiple functions

## Why this refactor makes sense

Right now, `text_layout.rs` has three different paths that all do similar work:

- no wrap
- char wrap
- word wrap

Each path ends up doing the same kinds of things:

- create a new `VisualLine`
- track current display width
- skip width-0 units
- place cursor before and after units
- push visible cells
- decide whether a new line is needed

That means the file is not large only because the problem is hard.
It is also large because the same low-level work is repeated.

The refactor should separate two concerns:

- line building
- wrap policy

That split is the main architectural win.

## Target design

### 1. Keep source parsing separate

`build_explicit_lines(...)` already has a clear job:

- read source text
- normalize break handling
- attach span styling
- produce styled source units

That part can stay separate.

### 2. Introduce `LineBuilder`

Add a small internal helper that owns:

- the current line being built
- the list of completed lines
- current row index
- cursor placement state

It should be the only place that knows how to:

- create an empty line
- push a visible unit
- handle width-0 units
- record cursor matches at byte boundaries
- break the current line
- finish layout and return the built lines

In plain English:

- wrap code should say "put this unit on the current line"
- `LineBuilder` should know what that actually means

### 3. Make wrap code only decide break behavior

After `LineBuilder` exists:

- no-wrap logic should decide when content stops fitting
- char-wrap logic should decide when the next unit forces a line break
- word-wrap logic should decide whether a whole segment fits, or whether it must fall back to unit-by-unit placement

But none of those paths should manually manage `VisualLine` internals.

## Proposed `LineBuilder` responsibilities

Suggested responsibilities:

- `mark_boundary(byte_index)`
- `push_unit(unit)`
- `can_fit(width)`
- `break_line()`
- `current_width()`
- `finish()`

Suggested behavior:

- `mark_boundary(...)`
  - checks whether the requested cursor byte index matches this boundary
  - if it matches, records `(row, col)`
- `push_unit(...)`
  - skips width-0 units cleanly
  - pushes a `VisualCell` for width-1 or width-2 units
  - updates current display width
- `break_line()`
  - pushes current line into output
  - resets current line to empty
- `finish()`
  - pushes the final line if needed
  - returns completed lines and cursor placement

Important rule:

- cursor logic should live here, not be repeated in every wrap function

## Refactor strategy

Do this in small steps.
Do not rewrite the whole file in one shot.

### Step 1. Lock behavior down with tests

Before changing architecture, add focused Rust tests for current behavior.

Cover:

- empty text
- explicit newline
- consecutive newlines
- trailing newline
- width-0 characters
- width-2 characters
- no-wrap clip
- no-wrap ellipsis
- char wrap
- word wrap
- cursor at start
- cursor in middle
- cursor at end
- cursor after newline
- styled spans surviving layout

Why first:

- this refactor touches cursor and wrapping logic
- without tests, behavior drift is too easy

### Step 2. Extract tiny shared helpers

Before adding `LineBuilder`, extract low-risk helpers such as:

- `empty_line()`
- `line_width_without_wrap(...)`
- maybe a small default-color helper if it removes repeated noise

This is a safe warm-up step.

### Step 3. Add `LineBuilder` without changing wrap decisions

Introduce the new helper, but keep the existing wrap functions in place for now.

Use `LineBuilder` only to remove repeated low-level operations:

- creating/resetting lines
- pushing units
- placing cursor before and after units
- handling width-0 units

This step should not change how wrapping decisions are made.

### Step 4. Split no-wrap into two small paths

Today, `finalize_line_for_no_wrap(...)` mixes:

- simple clipping
- ellipsis behavior
- cursor handling

That should become:

- `layout_no_wrap_clip(...)`
- `layout_no_wrap_ellipsis(...)`

Both should use `LineBuilder`.

Why:

- no-wrap becomes easier to understand
- ellipsis rules stop being buried inside one large function

### Step 5. Rewrite char-wrap on top of `LineBuilder`

Char wrap should become straightforward:

- for each unit
- mark its start boundary
- if it does not fit, break the line first
- push it
- mark its end boundary

That path should become much shorter after low-level work moves into the builder.

### Step 6. Rewrite word-wrap on top of `LineBuilder`

Word wrap should focus only on segment strategy:

- if a non-space segment fits, place it whole
- if it does not fit, break first
- if the segment itself is too wide, fall back to unit-by-unit placement

Again:

- word-wrap decides break policy
- `LineBuilder` performs actual line mutation

### Step 7. Simplify `layout_text(...)`

After the wrap functions are simplified, `layout_text(...)` should read like a coordinator:

- parse explicit lines
- choose wrap strategy
- feed units into the chosen policy
- finalize lines
- compute width and height
- apply final cursor fallback if needed

If `layout_text(...)` still feels busy after this, the refactor is not complete.

### Step 8. Review `measure_min_content(...)`

This function may stay separate, but it should reuse shared helpers where possible.

The goal is not to force it into the builder.
The goal is to avoid a second hidden wrap engine.

Good candidates for reuse:

- segment width helpers
- line width helpers
- source parsing output

## What should not change in this refactor

Keep these stable:

- public behavior of `layout_text(...)`
- `TextLayoutRequest`
- `TextLayoutResult`
- current clipping and ellipsis semantics
- current byte-index cursor model

This is a structure refactor first, not a feature rewrite.

## Risks

Main risks:

- cursor placement regressions
- off-by-one ellipsis bugs
- trailing newline behavior changing
- width-2 glyph regressions
- subtle word-wrap changes around spaces

That is why the tests need to come first.

## Verification plan

After each step:

- run Rust tests for the text layout module
- run `cargo check --manifest-path letui-ffi/Cargo.toml`

After the full refactor:

- run manual smoke checks in the TUI
- verify multiline input, wrapping, wide glyphs, and clipping still behave correctly

## Recommended implementation order

1. add tests that describe current behavior
2. extract tiny helpers
3. introduce `LineBuilder`
4. migrate no-wrap clip
5. migrate no-wrap ellipsis
6. migrate char wrap
7. migrate word wrap
8. simplify `layout_text(...)`
9. review `measure_min_content(...)`

## Expected outcome

If this goes well:

- `text_layout.rs` gets shorter
- more importantly, it gets less repetitive
- cursor logic exists in one place
- line construction exists in one place
- wrap modes read like policy instead of mini renderers

That is the right tradeoff here.
The problem is still complex, but the code should stop making the same decision in three different ways.
