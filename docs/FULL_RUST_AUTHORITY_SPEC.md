# Global ops queue to give Rust full authority

## 1) Problem

Today the runtime is split in an awkward way:
- TypeScript owns the canonical UI tree and style values.
- Rust receives a full node snapshot on every render via `paint(pointer, len, ...)`.
- Text already uses a separate path based on diff ops and `TEXT_REGISTRY`.

That split has a real cost:
- FFI traffic grows with total tree size, not with the size of the actual change.
- We redo full serialization work every frame, even for tiny updates.
- Authority is split between TS and Rust, which makes the model harder to reason about.

This spec changes that model:
- Rust becomes the canonical owner of tree structure, style, text, and lifecycle state.
- TypeScript sends mutation ops only.
- Per-frame traffic should scale with the change set, not the full tree.

## 2) Goals

- Remove the full-tree snapshot path from the hot render loop.
- Remove the text registry path: `sync_text_ops` and `TEXT_REGISTRY`.
- Keep the TS API ergonomic: `Box`, `Text`, `setStyle`, `setText`.
- Support inline rich text inside text leaves without losing plain-string ergonomics.
- Preserve the current performance target: under 8 ms in practical cases, 120 Hz as the stretch goal.
- Keep the protocol deterministic, batch-atomic, and easy to debug.

## 3) Non-Goals

- A rich-text incremental diff protocol.
- A block-level markdown or document AST inside text nodes.
- Cross-thread or concurrent mutation.
- Network protocol compatibility.
- Multi-root rendering.

Rich text stays intentionally simple:
- The user-facing model should stay string-first when possible.
- Rich text is represented as UTF-8 text plus ordered inline style spans.
- Plain text is just the zero-span case.
- The main API should expose ranges/spans, not chunks.
- The TS wrapper may offer helpers or builders for spans, but the wire format and canonical state stay as text plus spans.
- The renderer may normalize spans into runs or chunks internally for wrapping and paint.
- This keeps simple `setText` flows easy while still supporting syntax highlighting or markdown-style inline formatting.
- If we need block structure later, that likely belongs in normal tree nodes. Spans are only for inline styling inside text leaves.

## 4) Architecture

There is one source of truth per concern:
- Rust owns the canonical tree, style state, text/spans, and dirty state.
- TS owns app logic, closures/handlers, and op production.

High-level flow:
1. TS state changes.
2. TS queues mutation ops.
3. TS sends one batched op buffer over FFI.
4. Rust applies the batch atomically.
5. Rust recomputes layout and paint if anything is dirty.
6. TS calls `flush()`.

The important part: the frame loop no longer serializes full `nodeData`.

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

Required invariants:
- Node IDs are unique.
- A node has at most one parent.
- The tree cannot contain cycles.
- Child order is stable.
- `root_id` must point to an existing node.
- Text spans are sorted by `start_byte`.
- Text spans do not overlap.
- Span boundaries must align to UTF-8 code point boundaries.

## 6) FFI Surface

Add:
- `apply_ops(ptr: *const u8, len: u32) -> c_int`
- `render_frame() -> c_int`
- `clear_tree() -> c_int`
- `get_last_error_code() -> u32`

Keep for the first migration stages:
- `flush`
- `get_frames_ptr/get_frames_len`
- buffer init/deinit lifecycle

Remove once migration is complete:
- `sync_text_ops`
- `clear_text_registry`
- legacy full snapshot `paint(pointer, len, ...)`

## 7) Batch Wire Format

Endian: little-endian.

Batch header:
- `u32 magic` such as `0x4C545549` (`"LTUI"`)
- `u16 version` where this protocol starts at `1`; mismatches are rejected
- `u16 op_count`

Per-record layout:
- `u8 op`
- `u8 flags`
- `u16 payload_len`
- `u32 node_id`
- `u8 payload[payload_len]`

Rules:
- Batches are atomic. If one record is invalid, reject the whole batch.
- The parser bounds-checks every field before reading it.
- Unknown ops or unknown protocol versions are rejected.

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
- `SET_TEXT(node_id, utf8_bytes)` replaces content and clears spans
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
- bit0: `fg` (`u32`)
- bit1: `bg` (`u32`)
- bit2: `weight` (`u32 enum`)
- bit3: `italic` (`u8 bool`)
- bit4: `underline` (`u8 bool`)
- bit5: `strikethrough` (`u8 bool`)

Rich text rules:
- Spans are sorted by `start_byte` in ascending order.
- Spans may touch, but they may not overlap.
- Zero-length spans are rejected.
- Span boundaries must land on UTF-8 code point boundaries.
- Any invalid span payload rejects the entire batch.

## 9) Style Patch Encoding

Payload:
- `u32 mask`
- packed values in ascending bit order

Bit layout:
- bit0: `gap` (`f32`)
- bit1: `padding_x` (`f32`)
- bit2: `padding_y` (`f32`)
- bit3: `border_width` (`f32`)
- bit4: `bg` (`u32`)
- bit5: `fg` (`u32`)
- bit6: `border_color` (`u32`)
- bit7: `border_style` (`u32 enum`)
- bit8: `flex_grow` (`f32`)
- bit9: `direction` (`u32 enum`)

Why this encoding:
- Fixed bit order avoids per-field tags.
- Decode stays fast.
- Payload stays compact.
- Higher bits can be reserved for forward compatibility.

## 10) Dirty/Invalidation Rules

For `SET_STYLE_PATCH`:
- If layout-related fields change, set `layout_dirty = true`.
- If only paint-related fields change, set `paint_dirty = true`.

For `SET_TEXT` and `CLEAR_TEXT`:
- `measure_dirty = true`
- `layout_dirty = true`
- `paint_dirty = true`

For `SET_RICH_TEXT`:
- Use the same invalidation rules as `SET_TEXT`.

For hierarchy ops:
- Mark the parent chain with `layout_dirty = true`.
- Mark affected subtrees with `paint_dirty = true`.

For focus ops:
- Set `paint_dirty` on both the previously focused node and the next focused node.

Dirty propagation:
- Bubble layout dirtiness to the root.
- Do not mark the full tree dirty when a local paint-only patch is enough.

## 11) Render Scheduling

`apply_ops` is responsible for:
- decoding
- validation
- state mutation
- no terminal I/O

`render_frame` is responsible for:
- no-op success when nothing is dirty
- running Taffy layout from the root if layout is dirty
- repainting:
  - baseline behavior is full-buffer repaint
  - dirty-rect paint is an internal optimization, not a protocol change
- updating the frame array that JS reads
- clearing dirty flags

`flush` stays the same:
- existing terminal diff flush path

## 12) TS Runtime Responsibilities

TS still owns:
- node handles and event handlers
- keyboard and mouse dispatch logic
- the op queue and commit loop

TS stops owning:
- full tree-to-float snapshot serialization every frame
- text registry sync calls

New frame loop:
1. Collect queued ops.
2. Call `apply_ops(batch)`.
3. Call `render_frame()`.
4. Call `flush()`.
5. Read frame pointers only if JS needs hit-map or focus coordinates.

## 13) Error Handling

Failure classes:
- malformed buffer or bounds overflow
- invalid UTF-8
- invalid rich text span payload
- missing node ID
- duplicate node ID on create
- cycle creation attempt
- parent/child mismatch
- missing root

Behavior on failure:
- Reject the full batch.
- Store a sticky last error code.
- Return `0` from `apply_ops`.
- Expose the enum value through `get_last_error_code()`.

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

The important behavior here:
- apply into a temporary transactional view
- validate after all records are processed
- commit only if the full batch succeeds

## 16) Migration Plan

Phase 0: protocol scaffold
- add new FFI symbols
- do not switch behavior yet

Phase 1: create/delete/hierarchy ops
- build the same tree in Rust
- keep the old snapshot render path as fallback

Phase 2: text ownership move
- route plain text through `SET_TEXT`
- route rich text leaves through `SET_RICH_TEXT`
- remove `sync_text_ops` and `TEXT_REGISTRY`

Phase 3: style ownership move
- route `setStyle` through `SET_STYLE_PATCH`
- stop serializing full style state every frame

Phase 4: remove legacy path
- delete snapshot `paint(pointer, len, ...)`
- keep only `apply_ops + render_frame`

Phase 5: optimize
- add dirty-rect paint
- optionally move input or hit-testing ownership into Rust

## 17) Verification Plan

Correctness:
- Rust unit tests:
  - parser bounds and invalid cases
  - tree invariant checks
  - style patch decode order
  - dirty propagation
- TS unit tests:
  - op emission from `setStyle`, `setText`, rich text API, `setChildren`
  - batch encoding correctness

Integration:
- golden frame snapshots for deterministic op scripts
- regression coverage for a large tree with sparse updates

Manual:
- run `bun run dev`
- verify interactive input and focus behavior
- quit with `q` or `Ctrl+Q`

Performance acceptance:
- add metrics:
  - `opsApplyMs`
  - `opsCount`
  - `opsBytes`
  - `renderFrameMs`
- compare against the baseline demo:
  - bytes per frame should drop under sparse updates
  - p99 frame time should stay stable or improve

## 18) Open Questions

- Should TS keep hit testing long-term, or should that move to Rust?
- Do we eventually need rollback-by-log instead of clone-on-apply transactions?
- Should the first implementation use full repaint as the baseline, or build dirty-rect support immediately?
- Do we need a class/token layer now, or can that wait?

## 19) Recommended First Small Task

- implement the `apply_ops` parser, error codes, and no-op ops only
- wire `render_frame` into the existing paint path
- add `opsCount` and `opsBytes` metrics
- prove protocol stability before moving lifecycle ownership
