# Full Rust Authority Spec

Status: Draft
Owner: letui runtime/ffi
Last updated: 2026-03-17

## 1) Problem

Current model:
- TS owns canonical UI tree + style values
- Rust receives full node snapshot per render (`paint(pointer,len,...)`)
- Text is special-cased via diff ops + `TEXT_REGISTRY`

Cost:
- FFI bytes scale with full tree size, not change size
- Repeat serialization work each frame
- Split authority: TS tree truth + Rust layout truth

Target:
- Rust owns canonical tree/style/text/lifecycle
- TS sends mutation ops only
- Per-frame traffic proportional to changes only

## 2) Goals

- Remove full tree snapshot path from hot loop
- Remove text registry path (`sync_text_ops`, `TEXT_REGISTRY`)
- Keep TS user-facing API ergonomic (`Box`, `Text`, `setStyle`, `setText`)
- Support inline rich text in text leaves without giving up plain-string ergonomics
- Preserve current performance target (<8ms practical, 120hz aspirational)
- Keep protocol deterministic, batch-atomic, debuggable

## 3) Non-Goals

- Rich-text incremental diff protocol
- Block-level markdown/document AST inside text nodes
- Cross-thread/concurrent mutation model
- Network protocol compatibility
- Multi-root renderer

Rich text model:
- keep user-facing text model string-first where possible
- support rich text as plain UTF-8 text + ordered inline style spans
- plain text is the zero-span case
- prefer spans/ranges over exposing chunks as the primary API
- TS wrapper may expose helpers/builders for spans, but wire/state model stays text + spans
- renderer may still normalize spans into runs/chunks internally for wrapping/paint
- this keeps editing/simple `setText` ergonomics while still supporting markdown/syntax highlighting
- block markdown structure likely belongs in normal tree nodes; spans handle inline styling inside text leaves

## 4) Architecture

Single source of truth:
- Rust: canonical tree + style + text/spans + dirty state
- TS: app logic + closures/handlers + op producer

High-level flow:
1. TS state changes
2. TS queues mutation ops
3. TS sends one batched op buffer via FFI
4. Rust applies batch atomically
5. Rust computes layout/paint if dirty
6. TS calls `flush()`

No full `nodeData` serialization in frame loop.

## 5) Rust Canonical State

```rust
struct TreeState {
    root_id: Option<u32>,
    nodes: HashMap<u32, NodeState>,
    generation: u64,
    focused_id: Option<u32>,
}

struct NodeState {
    id: u32,
    kind: NodeKind,          // row/column/text/input/button
    parent: Option<u32>,
    children: Vec<u32>,
    style: StyleState,
    text: TextState,

    // dirty flags
    layout_dirty: bool,
    paint_dirty: bool,
    measure_dirty: bool,
}

struct StyleState {
    gap: f32,
    padding_x: f32,
    padding_y: f32,
    border_width: f32,
    bg: u32,
    fg: u32,
    border_color: u32,
    border_style: BorderStyle,
    flex_grow: f32,
    direction: Direction,
}

struct TextState {
    content: String,
    spans: Vec<TextSpan>,
}

struct TextSpan {
    start_byte: u32,
    end_byte: u32,
    style: InlineTextStyleState,
}

struct InlineTextStyleState {
    fg: Option<u32>,
    bg: Option<u32>,
    weight: FontWeight,
    italic: bool,
    underline: bool,
    strikethrough: bool,
}
```

Invariants:
- node id unique
- at most one parent per node
- no cycles
- child list order stable
- root id points to existing node
- text spans sorted by `start_byte`
- text spans non-overlapping
- text span boundaries must align to UTF-8 code point boundaries

## 6) FFI Surface

Add:
- `apply_ops(ptr: *const u8, len: u32) -> c_int`
- `render_frame() -> c_int`
- `clear_tree() -> c_int`
- `get_last_error_code() -> u32`

Keep (unchanged initially):
- `flush`
- `get_frames_ptr/get_frames_len`
- buffer init/deinit lifecycle

Remove after migration complete:
- `sync_text_ops`
- `clear_text_registry`
- legacy full snapshot `paint(pointer,len,...)`

## 7) Batch Wire Format

Little-endian.

Batch header:
- `u32 magic` (e.g. `0x4C545549` = "LTUI")
- `u16 version` (`1` for this protocol; reject mismatch)
- `u16 op_count`

Record layout:
- `u8 op`
- `u8 flags`
- `u16 payload_len`
- `u32 node_id`
- `u8 payload[payload_len]`

Rules:
- batch atomic: any invalid record rejects full batch
- parser bounds-check every field before read
- reject unknown op/version

## 8) Ops

Core lifecycle:
- `CREATE_NODE(node_id, kind)`
- `DELETE_NODE(node_id)`
- `SET_ROOT(node_id)`

Hierarchy:
- `APPEND_CHILD(parent_id, child_id)`
- `INSERT_CHILD(parent_id, child_id, index)`
- `REMOVE_CHILD(parent_id, child_id)`

State:
- `SET_STYLE_PATCH(node_id, mask, values...)`
- `SET_TEXT(node_id, utf8_bytes)` replaces content, clears spans
- `SET_RICH_TEXT(node_id, utf8_bytes, spans...)`
- `CLEAR_TEXT(node_id)`
- `SET_FOCUS(node_id)`

Rich text payload:
- `u32 text_len`
- `u32 span_count`
- `u8 text[text_len]`
- `span_count` records:
  - `u32 start_byte`
  - `u32 end_byte`
  - `u32 style_mask`
  - packed style values in ascending bit order

Inline text style bit layout:
- bit0: `fg` (u32)
- bit1: `bg` (u32)
- bit2: `weight` (u32 enum)
- bit3: `italic` (u8 bool)
- bit4: `underline` (u8 bool)
- bit5: `strikethrough` (u8 bool)

Rich text rules:
- spans sorted ascending by `start_byte`
- spans may touch but not overlap
- zero-length spans rejected
- boundaries must land on UTF-8 code point boundaries
- invalid span payload rejects the full batch

## 9) Style Patch Encoding

Payload:
- `u32 mask`
- packed values in ascending bit order

Bit layout:
- bit0: `gap` (f32)
- bit1: `padding_x` (f32)
- bit2: `padding_y` (f32)
- bit3: `border_width` (f32)
- bit4: `bg` (u32)
- bit5: `fg` (u32)
- bit6: `border_color` (u32)
- bit7: `border_style` (u32 enum)
- bit8: `flex_grow` (f32)
- bit9: `direction` (u32 enum)

Design notes:
- fixed bit order avoids per-field tags
- fast decode, compact payload
- forward-compatible by reserving high bits

## 10) Dirty/Invalidation Rules

`SET_STYLE_PATCH`:
- layout fields changed => `layout_dirty=true`
- paint-only fields changed => `paint_dirty=true`

`SET_TEXT`/`CLEAR_TEXT`:
- `measure_dirty=true`
- `layout_dirty=true`
- `paint_dirty=true`

`SET_RICH_TEXT`:
- same invalidation as `SET_TEXT`

Hierarchy ops:
- parent chain `layout_dirty=true`
- affected subtrees `paint_dirty=true`

Focus ops:
- `paint_dirty` on previous and next focused nodes

Dirty propagation:
- bubble layout dirtiness to root
- avoid full-tree dirty if local patch paint-only

## 11) Render Scheduling

`apply_ops`:
- decode + validate + mutate state
- no terminal IO

`render_frame`:
- if no dirty flags: no-op success
- if layout dirty: run taffy compute from root
- repaint path:
  - full buffer repaint baseline
  - dirty-rect paint is internal optimization; no protocol change
- update frame array for JS reads
- clear dirty flags

`flush`:
- unchanged terminal diff flush path

## 12) TS Runtime Responsibilities

TS keeps:
- node handles and event handlers
- keyboard/mouse dispatch logic
- op queue + commit loop

TS no longer does:
- full tree-to-float snapshot serialization per frame
- text registry sync calls

Frame loop:
1. collect queued ops
2. `apply_ops(batch)`
3. `render_frame()`
4. `flush()`
5. read frames pointer if JS needs hit-map/focus coords

## 13) Error Handling

Failure classes:
- malformed buffer / bounds overflow
- invalid UTF-8
- invalid rich text span payload
- missing node id
- duplicate node id on create
- cycle creation attempt
- parent/child mismatch
- root missing

Behavior:
- reject full batch
- set sticky last error code
- return `0` from `apply_ops`
- `get_last_error_code()` returns enum value

Example enum:
- `1 INVALID_HEADER`
- `2 UNKNOWN_OP`
- `3 OUT_OF_BOUNDS`
- `4 NODE_NOT_FOUND`
- `5 NODE_EXISTS`
- `6 TREE_CYCLE`
- `7 INVALID_UTF8`
- `8 INVALID_PARENT_CHILD`
- `9 INVALID_TEXT_SPAN`

## 14) Example: TS Side

```ts
enum Op {
  CreateNode = 1,
  AppendChild = 2,
  SetStylePatch = 3,
  SetText = 4,
  SetRichText = 5,
  SetRoot = 6,
}

const q: number[] = [];

function queueCreate(nodeId: number, kind: number) {
  writeHeader(Op.CreateNode, nodeId, 1);
  q.push(kind);
}

function queueSetText(nodeId: number, text: string) {
  const b = new TextEncoder().encode(text);
  writeHeader(Op.SetText, nodeId, 4 + b.length);
  writeU32LE(q, b.length);
  for (const byte of b) q.push(byte);
}

function queueSetRichText(nodeId: number, text: string, spans: Span[]) {
  const b = new TextEncoder().encode(text);
  const payloadLen = 8 + b.length + encodeSpanRecords(spans).length;
  writeHeader(Op.SetRichText, nodeId, payloadLen);
  writeU32LE(q, b.length);
  writeU32LE(q, spans.length);
  for (const byte of b) q.push(byte);
  writeSpanRecords(q, spans);
}

function queueSetStyleBgFg(nodeId: number, bg?: number, fg?: number) {
  let mask = 0;
  const vals: number[] = [];
  if (bg !== undefined) {
    mask |= 1 << 4;
    vals.push(bg);
  }
  if (fg !== undefined) {
    mask |= 1 << 5;
    vals.push(fg);
  }

  writeHeader(Op.SetStylePatch, nodeId, 4 + vals.length * 4);
  writeU32LE(q, mask);
  for (const v of vals) writeU32LE(q, v >>> 0);
}

function commitFrame() {
  if (q.length > 0) {
    const bytes = Uint8Array.from(q);
    api.apply_ops(bytes, bytes.length);
    q.length = 0;
  }
  api.render_frame();
  api.flush();
}
```

## 15) Example: Rust Apply Path

```rust
fn apply_ops_batch(state: &mut TreeState, bytes: &[u8]) -> Result<(), ErrorCode> {
    let mut tx = state.clone_for_transaction();
    let mut cur = Cursor::new(bytes);

    let hdr = parse_header(&mut cur)?;
    for _ in 0..hdr.op_count {
        let rec = parse_record(&mut cur)?;
        apply_record(&mut tx, rec)?;
    }

    tx.validate_tree()?;
    state.commit_from(tx);
    Ok(())
}
```

## 16) Migration Plan

Phase 0: protocol scaffold
- add new ffi symbols
- no behavior switch

Phase 1: create/delete/hierarchy ops
- build same tree in Rust
- still keep old snapshot render as fallback

Phase 2: text ownership move
- route plain text => `SET_TEXT`
- route rich text leaves => `SET_RICH_TEXT`
- remove `sync_text_ops` + `TEXT_REGISTRY`

Phase 3: style ownership move
- route `setStyle` => `SET_STYLE_PATCH`
- stop serializing full style each frame

Phase 4: remove legacy path
- delete snapshot `paint(pointer,len...)`
- keep only `apply_ops + render_frame`

Phase 5: optimize
- dirty rect paint
- optional Rust-side input/hit-testing ownership

## 17) Verification Plan

Correctness:
- Rust unit tests:
  - parser bounds/invalid cases
  - tree invariant checks
  - style patch decode order
  - dirty propagation
- TS unit tests:
  - op emission from `setStyle`, `setText`, rich text API, `setChildren`
  - batch encoding correctness

Integration:
- golden frame snapshots for deterministic op scripts
- regression case: large tree with sparse updates

Manual:
- `bun run dev`
- interactive input/focus behavior
- quit with `q` or `Ctrl+Q`

Performance acceptance:
- add metrics:
  - `opsApplyMs`
  - `opsCount`
  - `opsBytes`
  - `renderFrameMs`
- compare against baseline demo:
  - lower bytes/frame under sparse updates
  - stable or improved p99 frame time

## 18) Open Questions

- keep TS-side hit testing long-term or move to Rust?
- need transactional rollback-by-log instead of clone-on-apply?
- start with full repaint baseline or build dirty-rect immediately?
- add class/token layer now or defer?

## 19) Recommended First Small Task

- implement only `apply_ops` parser + error codes + no-op ops
- wire `render_frame` to existing paint path
- add `opsCount/opsBytes` metrics
- prove protocol stability before lifecycle migration
