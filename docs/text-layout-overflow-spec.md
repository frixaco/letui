# text layout, multiline input, and overflow spec

Status: draft design spec
Scope: `Text` + `Input` only
Out of scope: scrolling containers, placeholder work, text selection, IME, bidi/shaping, vertical writing modes

## Why this exists

Current text behavior is split across mismatched paths:

- measurement does naive wrapping
- paint is mostly single-line
- input editing/cursor logic is single-line
- overflow behavior is ad hoc
- examples contain app-side wrap / truncate helpers that should be engine-owned

This spec defines one shared Rust text-layout core used by:

- Taffy measurement
- terminal paint
- input cursor placement

## First principles

Taffy is a box layout engine, not a text layout engine.

So letui should use Taffy for:

- parent/child box sizing
- flex placement
- content-box constraints
- future container-overflow bookkeeping

And letui itself should own text layout in Rust:

- explicit newline handling
- wrapping
- clipping / ellipsis
- span splitting across wrapped lines
- cursor placement for inputs

This matches Taffy’s examples/tests: text layout is supplied externally through the measure callback.

## Design goals

- one Rust text-layout core shared by `Text` and `Input`
- identical semantics for:
  - measurement
  - paint
  - cursor placement
- preserve explicit newlines
- preserve source spaces
- support multiline wrapping without app-side helpers
- support clipping and simple ellipsis
- keep public API small
- avoid pulling scrolling into scope

## Non-goals for v1

- public container overflow API
- scrolling
- line clamping
- placeholder behavior changes
- multiline ellipsis across a clipped block axis
- full grapheme-correct editing
- rich Unicode shaping
- arbitrary cursor movement / text selection if input remains append/delete-at-end initially
- making `Button` migration a blocker

## Public API and naming

Keep the first public API minimal and match existing naming in `src/types.ts`.

## New exported type aliases

Add to `src/types.ts`:

- `export type TextWrap = "none" | "word" | "char"`
- `export type TextOverflow = "clip" | "ellipsis"`

Reason:

- keeps `TextProps`, `InputProps`, and node method types readable
- matches current style of named string-union aliases like `FlexWrap`, `Direction`, `AlignItems`

## Public text-span indexing

Keep the public `StyledText` / `TextSpan` API unchanged.

Rules:

- public `TextSpan.start` / `end` remain **codepoint indices** in TypeScript land
- `src/text-spans.ts` continues translating those public indices into internal byte offsets
- Rust layout / paint / cursor code uses byte indices only after that normalization step

## `TextProps`

Extend current `TextProps` with:

- `wrap?: TextWrap`
  - default: `"word"`
- `textOverflow?: TextOverflow`
  - default: `"clip"`

v1 restriction:

- `textOverflow: "ellipsis"` is only defined for `wrap: "none"`
- if `wrap !== "none"`, overflow behavior is clipping, not multiline ellipsis

## `InputProps`

Extend current `InputProps` with:

- `multiline?: boolean`
  - default: `false`
- `wrap?: Exclude<TextWrap, "none">`
  - default: `"word"` when `multiline: true`
  - ignored when `multiline: false`

Behavior:

- single-line input keeps current submit-on-Enter behavior
- multiline input inserts `\n` on Enter
- no `textOverflow` prop for `Input` in v1
- no `wrap: "none"` for multiline input in v1; that would imply horizontal scrolling, which is out of scope
- programmatic `setText(...)` may still contain `\n` even when `multiline: false`
- when `multiline: false`, newline insertion is disabled for user editing, but existing stored newlines are preserved and rendered as forced breaks
- toggling `multiline: true -> false` does not rewrite the stored value; it only changes future editing behavior

## Keep these names out of `StyleProps`

Do **not** add `wrap`, `textOverflow`, or `multiline` to generic `StyleProps`.

Reason:

- they are not meaningful on all node kinds
- they are text/input-specific behavior, not generic box styling
- keeping them out of `StyleProps` preserves the current public separation between shared box props and leaf-specific props

## Internal signal prop names

Extend signal-backed props in `src/types.ts` / `src/components.ts`:

- `_TextProps`
  - add `wrap: Signal<TextWrap | undefined>`
  - add `textOverflow: Signal<TextOverflow | undefined>`
- `_InputProps`
  - add `multiline: Signal<boolean | undefined>`
  - add `wrap: Signal<Exclude<TextWrap, "none"> | undefined>`

Existing `placeholder?: string` stays on `InputProps`, but this work does not change placeholder behavior.

Important clarification:

- current source has placeholder stored in TS props only; it is not serialized to Rust and has no native render behavior yet
- this spec keeps that status quo

## Node mutator signatures

For API consistency with existing per-node `setStyle(...)` patterns, extend node mutator types:

- `TextNode.setStyle`
  - from `Partial<StyleProps>`
  - to `Partial<StyleProps & { wrap?: TextWrap; textOverflow?: TextOverflow }>`
- `InputNode.setStyle`
  - from `Partial<StyleProps & { placeholder?: string }>`
  - to `Partial<StyleProps & { placeholder?: string; multiline?: boolean; wrap?: Exclude<TextWrap, "none"> }>`

Reason:

- current API already allows some leaf-local fields through `setStyle` on `Input` / `Button`
- adding these fields there keeps runtime mutation consistent with constructor props

## Scope boundary with container overflow

Do not expose `overflow`, `overflowX`, or `overflowY` as public props in this change.

Reason:

- text overflow presentation and container overflow geometry are different problems
- public container overflow immediately raises scrolling questions
- this change is about text semantics, not scroll containers

Internal distinction remains:

- **text overflow**: clip / ellipsis for text content
- **container overflow**: future box-level scroll / clip behavior

## Text semantics

## Newlines

- `\n` creates a forced line break
- consecutive newlines create empty visual lines
- trailing newline creates a final empty visual line
- internal layout must preserve source byte offsets; therefore it must **not** rewrite stored text bytes during layout
- `\r\n` and lone `\r` are normalized to `\n` **at text ingress only** before byte-indexed spans/cursor indices are produced
- if legacy callers somehow still provide stored text containing `\r\n` or `\r`, layout may treat them as forced breaks for robustness, but that path is best-effort only and is not the source-of-truth byte model

## Whitespace

Whitespace is preserved by default.

Rules:

- spaces are visible cells
- leading spaces are preserved
- repeated spaces are preserved
- wrapping must not use `split_whitespace()`
- layout never trims line content automatically

## Tabs

Tabs are not supported as semantic tab stops in v1.

Policy:

- layout treats `\t` as a single space, or runtime normalizes `\t` to a single space before layout
- exact tab-stop expansion is deferred

Pick one implementation path, but behavior must be explicit and testable.

## Wrap modes

### `wrap: "none"`

- no soft wrapping
- only explicit newlines create multiple visual lines
- each explicit source line is measured independently
- if a line exceeds available width:
  - `textOverflow: "clip"` => visible prefix only
  - `textOverflow: "ellipsis"` => visible prefix replaced at tail with `…` if width >= 1

### `wrap: "word"`

- wrap at preferred break opportunities
- explicit newlines still force breaks
- if a token is wider than the whole line, fall back to char wrapping for that token

Deterministic v1 algorithm:

- process one explicit source line at a time
- treat each maximal run of U+0020 SPACE as its own segment
- treat each maximal run of non-space, non-newline codepoints as its own segment
- build the visual line left-to-right while tracking display-cell width
- preferred breakpoints exist **after** space segments that have already fit on the current line
- wrapping never trims or collapses spaces
- if the next segment would overflow and at least one preferred breakpoint exists on the current line, break at the last such breakpoint
- if no preferred breakpoint exists on the current line, char-wrap the overflowing segment starting at the current position
- if a space segment itself is wider than remaining width, split that space segment across lines as needed to preserve source text exactly
- lines may legally begin with spaces
- lines may legally end with spaces

Min-content rule for `wrap: "word"`:

- min-content width is the widest indivisible segment under the above rules
- non-space segments are indivisible until the runtime has a concrete line width and decides to char-wrap them as overflow fallback
- space segments are divisible, so they do not by themselves raise min-content above `1` cell

This is intentionally source-preserving, not browser-like whitespace collapsing.

### `wrap: "char"`

- wrap at display-cell boundaries
- explicit newlines still force breaks
- no word-boundary preference

## Overflow semantics

## `clip`

- keep source content unchanged
- paint only visible cells inside the final clip rect
- no ellipsis marker

## `ellipsis`

v1 support:

- `Text` only
- only when `wrap: "none"`
- only on lines that overflow the inline axis

Behavior:

- if available width is `0`, paint nothing
- if available width is `1`, paint only `…`
- otherwise reserve one cell for `…` and keep the longest prefix that fits before it
- ellipsis styling uses the style active at the truncation point, else node default style

Deferred:

- multiline ellipsis after wrapping
- ellipsis on the final visible line of a height-clipped block
- editable-input ellipsis

## Cell geometry and rounding

Layout and paint must quantize to terminal cells deterministically.

Rules:

- text layout consumes an integer content-box width in terminal cells
- when Taffy gives floating-point geometry, letui floors content-box origin and floors content-box width/height to whole cells before text layout / clipping
- negative or sub-1 remaining content width/height become `0`
- measure, paint, and cursor placement must all use the same quantized content-box geometry
- no text cell may paint outside that quantized clip rect, even if the original Taffy box had fractional geometry

## Measurement semantics

Measurement must come from the same text-layout algorithm as paint.

## Inputs to layout

A text-layout request should be derived from:

- source text
- normalized spans
- content-box width constraint
- wrap mode
- text overflow mode
- node kind (`Text`, `Input`, maybe `Button` later)
- optional cursor byte index for `Input`

No height limit is needed in the core request for v1.

Paint clipping handles final visibility in the block axis.

## Width resolution from Taffy

Map Taffy width to text layout width like this:

- `AvailableSpace::MaxContent`
  - no inline constraint
  - measure the longest explicit source line without soft wrapping
- `AvailableSpace::MinContent`
  - `wrap: "word"` => width of the longest unbreakable segment under current rules
  - `wrap: "char"` => width of the widest indivisible display unit supported by current engine
  - `wrap: "none"` => width of the longest explicit source line
- `AvailableSpace::Definite(width)`
  - use that value as the inline wrapping/clipping constraint after quantizing to whole cells
  - returned measured width is the actual visual width produced under that constraint, not necessarily the constraint itself

## Height measurement

- line height = 1 terminal row in the current engine
- measured height = number of visual lines produced by the layout
- if style later constrains node height, Taffy owns the final box height and paint clips to the content box

## Returned size vs clipped paint

For v1, keep the contract simple:

- the text-layout core returns the size of the fully laid-out text under the given width constraint
- ancestor clipping and explicit box height do not change the text-layout result itself
- paint decides which rows/cells are actually visible

This spec does **not** require separate `measured_size` vs `content_size` fields yet.
Those can be added later with scrolling.

## Correctness invariant

For the same:

- source text
- spans
- width constraint
- wrap mode
- overflow mode
- cursor index

all of these must come from the same layout result:

- measured line count
- painted line breaks
- cursor visual row/col

## Internal Rust model

Keep the internal model minimal.

Suggested types:

- `TextLayoutRequest`
- `TextLayoutResult`
- `VisualLine`
- `VisualFragment`
- `CursorPlacement`

## `TextLayoutRequest`

Suggested fields:

- `text: &str`
- `spans: &[TextSpanData]`
- `max_width: Option<u16>`
- `wrap: WrapMode`
- `overflow: TextOverflow`
- `cursor: Option<usize>` // byte index at valid UTF-8 boundary
- `show_cursor: bool`
- `default_fg`, `default_bg`

Notes:

- choose one source indexing unit and use it consistently
- this spec chooses **byte indices at valid UTF-8 boundaries**
- spans already naturally fit byte ranges
- input editing can still be codepoint-based internally, but cursor handoff into layout should resolve to a byte boundary
- in v1, `cursor` should normally be `Some(text.len())` for focused end-editing inputs and `None` otherwise
- in v1, `show_cursor` is driven by JS focus state; only the focused `Input` should request a visible cursor

## `TextLayoutResult`

Suggested minimum fields:

- `width: u16`
- `height: u16`
- `lines: Vec<VisualLine>`
- `cursor: Option<CursorPlacement>`

Optional later:

- truncation flags
- separate content metrics for scrolling

## `VisualLine`

Suggested fields:

- `source_range_bytes`
- `display_width`
- `fragments: Vec<VisualFragment>`
- `ends_with_ellipsis: bool`

## `VisualFragment`

Suggested fields:

- `source_range_bytes`
- `display_col`
- resolved style attrs
- either:
  - `text_slice`, or
  - pre-expanded cells

Either representation is fine if measure, paint, and cursor all reuse the same result.

## Span handling

Styled spans must survive wrapping.

Rules:

- source spans remain byte ranges over source text
- layout splits spans into per-line fragments
- spans are assumed pre-normalized, sorted, and non-overlapping
- empty visual lines have no fragments but still count toward height
- ellipsis uses the style active at the truncation point, else default node style

## Cursor model

Single-line cursor assumptions must be removed.

## Storage

Keep input text as one string.

Cursor handoff to layout uses a **byte index at a valid UTF-8 boundary**.

v1 editing scope may remain limited:

- append text at end
- delete previous codepoint at end
- insert newline at end for multiline

That is acceptable as long as layout itself can map any valid cursor byte index to a visual `(row, col)`.

## Behavior

- single-line input:
  - Enter submits
  - newline insertion disabled
- multiline input:
  - Enter inserts `\n`
  - Backspace deletes the previous codepoint
  - deleting a newline joins the lines

This spec does not add a new submit-shortcut prop in v1.

## Paint

- only the focused `Input` paints a cursor in v1
- cursor paints at the visual `(row, col)` produced by layout
- if clipping hides that row/col, cursor is not painted
- if cursor is after a trailing newline, it paints on the final empty line

## Unicode / display-width model

Current `chars().count()` logic is not enough.

Minimum required improvement:

- source indexing and display width must be separate concepts
- wrapping / clipping / ellipsis must use display-cell width, not UTF-8 byte count

Exact v1 cell rules:

- layout may still iterate by Unicode scalar value if needed
- each rendered unit resolves to a display width of `0`, `1`, or `2` cells
- width-0 units do not advance the cursor or wrap position; they attach to the previous rendered cell when one exists
- width-1 units occupy one cell
- width-2 units occupy two adjacent cells and must never be split across lines or clipping boundaries
- if only one cell remains before a width-2 unit in `wrap: "char"` or `wrap: "word"`, the whole unit moves to the next line
- if a width-2 unit is the first unit on an otherwise empty constrained line and still cannot fit, it is clipped away for that line; no half-glyph painting
- ellipsis reservation also works in cells: a width-2 unit either fits before the reserved ellipsis cell or is excluded entirely
- paint must never leave stale continuation cells from a previously drawn width-2 unit

v1 scope:

- deletion may remain codepoint-based
- full grapheme-cluster editing is deferred
- exact grapheme segmentation is deferred
- combining-mark handling is best-effort under the width-0 rule above

Deferred:

- full grapheme-cluster editing
- full emoji correctness
- bidi / shaping

## Exact implementation touchpoints

This section maps the spec onto the current codebase so implementation work lands in the right places.

## TypeScript API surface

### `src/types.ts`

Touchpoints:

- add `TextWrap` and `TextOverflow` type aliases
- extend `_TextProps`, `TextProps`, `TextNode.setStyle`
- extend `_InputProps`, `InputProps`, `InputNode.setStyle`

Recommended shape:

- `TextProps`
  - `text: string | StyledText`
  - `wrap?: TextWrap`
  - `textOverflow?: TextOverflow`
- `InputProps`
  - existing fields unchanged
  - add `multiline?: boolean`
  - add `wrap?: Exclude<TextWrap, "none">`

Important:

- keep `wrap` / `textOverflow` / `multiline` off generic `StyleProps`
- keep existing `placeholder?: string` API unchanged, but do not expand placeholder semantics in this work

### `src/components.ts`

Touchpoints:

- `createTextSignals(...)`
- `createInputSignals(...)`
- `Text(...)`
- `Input(...)`

Required changes:

- initialize new signals for `wrap`, `textOverflow`, `multiline`
- let `setStyle(...)` mutate those new signals on `Text` / `Input`
- normalize programmatic text ingress from `\r\n` / `\r` to `\n` before byte-offset span generation or cursor/index handoff
- keep `setText(...)` behavior unchanged except for new multiline semantics handled at runtime

## TypeScript render-tree serialization

### `src/runtime.ts`

Touchpoints:

- `readSentStyleState(...)`
- `buildSentNodeState(...)`
- `queueFullTreeInsert(...)`
- `syncRenderTree(...)`
- `dispatchToNode(...)`

Recommended transport path:

- reuse the existing style-delta channel for text-layout props
- treat them as layout-affecting per-node fields even though they are not part of public `StyleProps`

Concretely:

- `readSentStyleState(...)`
  - for `Text`, emit `wrap` and `textOverflow`
  - for `Input`, emit `multiline` and `wrap`
- `buildSentNodeState(...)`
  - no separate text-layout field needed if values ride inside `style`
  - include enough ephemeral render state to tell Rust whether this `Input` should show a cursor this frame
- `queueFullTreeInsert(...)` / `syncRenderTree(...)`
  - already diff style payloads; new prop names join the same path
  - cursor visibility may use a small side channel or explicit focused-node signal; it should **not** be inferred from text content alone

### `dispatchToNode(...)`

Current issues:

- backspace uses `slice(0, -1)` on JS UTF-16 code units
- Enter always submits
- printable input is ASCII-only

Required behavior changes:

- if focused node is single-line `Input`
  - keep Enter => `onSubmit`
- if focused node is multiline `Input`
  - Enter inserts `\n`
  - call `onChange`
- backspace should delete the previous Unicode codepoint where practical, not just the previous UTF-16 code unit
- printable input gate should accept text payloads beyond ASCII when terminal input already provides them
- normalize incoming CRLF / CR to LF before insertion

## TypeScript op encoding

### `src/ops.ts`

Touchpoints:

- `StylePropName`
- `EMITTED_STYLE_PROPS`

Recommended additions:

- `wrap`
- `textOverflow`
- `multiline`

Encoding notes:

- `wrap` and `textOverflow` can remain string-valued style-like props
- `multiline` can ride as a numeric flag internally (`1` when true, omitted/reset when false)
- this keeps the existing op format unchanged

## Rust tree state and op application

### `letui-ffi/src/tree.rs`

Touchpoints:

- `NodeStyle`
- `default_for_kind(...)`
- `apply_style_reset(...)`
- `apply_style_number(...)`
- `apply_style_string(...)`
- existing `SetText` / `DeleteTextRange` / `SetTextSpans` handling

Recommended additions to stored node state:

- text wrap mode
- text overflow mode
- multiline flag for inputs
- focused/cursor-visible signal for inputs, or an equivalent frame-time input to render/layout

These can live in `NodeStyle` even though they are not public generic `StyleProps`.

Important existing alignment with this spec:

- `TextSpanData` already uses byte ranges
- `DeleteTextRange` already validates UTF-8 boundaries
- `SetTextSpans` already validates spans against current text

That means the Rust state model already fits byte-indexed layout work well.

## Rust measurement / paint

### `letui-ffi/src/render.rs`

Primary touchpoints:

- `node_data_to_style(...)`
- `node_data_to_context(...)`
- `measure_function(...)`
- `draw_text_at(...)`
- `draw_styled_text_at(...)`
- `draw_cursor_at(...)`
- `paint_taffy_node(...)`

Current problems:

- `measure_function(...)`
  - uses `text.chars().count()`
  - uses `split_whitespace()`
  - ignores explicit newline semantics
- `draw_text_at(...)` / `draw_styled_text_at(...)`
  - paint only one row
  - do their own independent text walk
- `draw_cursor_at(...)`
  - places cursor at `x + text_len`
  - assumes single-line, char-count width
- `paint_taffy_node(...)`
  - calls those single-line helpers directly

Required shape after change:

- add a shared text-layout function / module in Rust
- `measure_function(...)`
  - build a `TextLayoutRequest`
  - return size from `TextLayoutResult`
- `paint_taffy_node(...)`
  - fetch or recompute the same `TextLayoutResult`
  - paint visible lines/fragments from that result
  - respect a per-frame focused/cursor-visible signal for `Input`
- `draw_cursor_at(...)`
  - stop taking raw `text_len`
  - instead paint from cursor `(row, col)` in layout result

### About `node_data_to_style(...)`

Current code hardcodes hidden overflow for `Column`.

That behavior is separate from this spec.

For this work:

- do not expand public container-overflow scope
- but make text paint respect the effective clip rect derived from layout/content box

## Styled text byte-offset pipeline

### `src/text-spans.ts`

Important existing fit:

- styled text is already normalized to byte-offset spans
- `NormalizedStyledText` carries `startByte` / `endByte`
- ingress text normalization to `\n` must happen before these byte offsets are computed

Validation note:

- JS normalization is responsible for validating public span bounds, then sorting / merging public codepoint-indexed spans into byte-offset spans
- Rust op ingestion remains the final validator for byte-range correctness against the stored text buffer
- keep both layers explicit; do not assume JS normalization alone is the trust boundary

This matches the spec’s decision to use byte indices at valid UTF-8 boundaries for layout/cursor handoff.

## Caching

Need only a simple frame-local cache in v1.

Recommended cache key contents:

- node id
- text revision
- span revision
- width constraint
- wrap mode
- overflow mode
- cursor byte index / cursor visibility for inputs

Do not over-specify hashing strategy yet.

Persistent caching can come later with persistent node state.

## Clip rule

Need one clear v1 rule:

- text paint always intersects its own content box with the inherited ancestor clip rect

This is enough for multiline text + overflow.

Full container-overflow semantics can remain separate.

## Buttons

Buttons are text-bearing too, but button migration is not required for the first ship.

Preferred direction later:

- move `Button` onto the same internal text-layout machinery with defaults
- do not make button migration a blocker for `Text` + `Input`

## Backward compatibility

Recommended defaults:

- `Text.wrap = "word"`
- `Text.textOverflow = "clip"`
- `Input.multiline = false`

Notes:

- single-line input behavior stays the same by default
- multiline behavior is opt-in
- existing placeholder prop remains untouched
- wrapped `Text` as the default is the most author-friendly behavior for constrained TUI layouts

## Edge cases to define and test

- empty string
- string with only newlines
- trailing newline
- repeated spaces
- leading spaces
- explicit newline plus trailing spaces
- whitespace run crossing wrap boundary
- single token wider than width
- width `0`
- width `1` with ellipsis
- explicit width smaller than border+padding leaving zero content width
- CRLF input normalized before span generation
- styled span ending exactly at wrap boundary
- styled span crossing wrap boundary
- styled span ending exactly at newline boundary
- cursor after trailing newline
- focused vs unfocused inputs; only one visible cursor
- programmatic newline in `multiline: false` input
- toggling `multiline` off after multiline content exists
- width-2 glyph at wrap boundary
- width-2 glyph before ellipsis boundary
- combining-mark sequence under clipping/wrapping
- nested ancestor clipping
- very large text nodes updated incrementally
- UTF-8 multi-byte characters with byte-indexed spans/cursor

## Testing strategy

Use golden-style tests where output is visual.

## Rust unit tests

Functional-core tests for:

- newline preservation
- CRLF normalization-at-ingress contract
- word wrap
- char-wrap fallback for oversized token
- whitespace preservation at wrap boundaries
- clip behavior
- ellipsis behavior for `wrap: none`
- span splitting across wrapped lines
- span handling at explicit newline boundaries
- cursor mapping from byte index to visual position
- width `0` / `1` edge cases
- chosen display-width helper behavior
- width-2 and width-0 cell behavior near wrap/clip/ellipsis boundaries

## Integration tests

Render-level tests for:

- measure and paint consistency at same width
- focused-input-only cursor visibility
- multiline input newline insertion
- multiline input cursor placement
- programmatic multiline content in single-line mode
- nested clipping
- text style preservation across wrapped lines

## Smoke validation

Examples should exercise:

- paragraph wrapping
- explicit newlines
- ellipsis on single-line text
- multiline input entry

## Suggested implementation order

1. `src/types.ts` / `src/components.ts` API plumbing
2. `src/ops.ts` / `src/runtime.ts` transport plumbing
3. Rust shared text-layout core
4. `letui-ffi/src/render.rs` measurement integration
5. `letui-ffi/src/render.rs` paint + cursor integration
6. `src/runtime.ts` multiline input behavior cleanup
7. docs/example cleanup

## Accept criteria

Accept when all are true:

- explicit newlines render and measure correctly
- wrapped text height matches visible visual lines
- no app-side wrapping helpers needed for normal examples
- ellipsis is deterministic for single-line `Text`
- multiline input can insert newlines and paint cursor correctly
- nested clipping does not leak text outside ancestor bounds
- measure and paint use the same layout result
- public API names match current `src/types.ts` conventions

Reject if any are still true:

- measure and paint wrap independently
- spaces or newlines collapse unexpectedly
- cursor still assumes single-line `chars().count()`
- multiline input still treats Enter as submit by default
- new props are documented one way but named differently in `src/types.ts`

## Decision summary

- use Taffy for box layout only
- add one shared Rust text-layout core
- ship a small text-specific API first
- keep new public names aligned with `src/types.ts` conventions
- reuse the existing style-op transport path internally for text-layout props
- defer scrolling and public container overflow
- defer `lineClamp`
- defer placeholder work in this feature
