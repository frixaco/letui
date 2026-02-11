# letui

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

TUI library written using Rust and TypeScript

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

### Priority 0: Text Registry (FFI Optimization)

**Goal**: Stop sending all text on every render. Register text once → get `u8` ID → pass only ID (1 byte) across FFI.

**Rust side**:

- Add `TextRegistry` struct: `slots: Vec<Option<String>>` (256 max), `free: Vec<u8>` (freelist)
- FFI functions:
  - `text_register(ptr, len) -> u8` — alloc slot, return ID (0 = failure/empty)
  - `text_update(id, ptr, len) -> i32` — replace text at existing ID
  - `text_free(id) -> i32` — return slot to freelist
  - `text_clear() -> i32` — reset all (on quit)
- In `paint()`: lock registry once at start, pass `&TextRegistry` down
- Change node parsing: read `text_id` field (u8 stored as f32), resolve via `reg.get(id)`

**TypeScript side**:

- Add FFI symbols for `text_register`, `text_update`, `text_free`, `text_clear`
- Create `TextIdRegistry` class:
  - `byNodeId: Map<number, { id: number; last: string }>`
  - `getOrCreate(nodeId, text)`: register if new, update if changed, return ID
  - `freeNode(nodeId)`: reclaim ID when node unmounts
- In serialization: replace `textLength` field with `textId`, remove `textData` concat
- Track `prevNodeIds` vs `currentNodeIds` each frame → free disappeared nodes

**Key details**:

- `u8` IDs are exactly representable in `f32` (no Float32Array change needed)
- ID 0 = empty/missing text (reserve slot 0)
- Must free IDs on node removal (255 usable slots max)
- Lock registry once per `paint()`, not per-node (perf)

**Expected result**: FFI traffic O(changed texts) instead of O(all texts every frame)

---

### Priority 1: Scrollable Containers

- [ ] Add `overflow: "hidden"` style prop → triggers clipping during paint
- [ ] Add `scrollX`/`scrollY` signals per scrollable node
- [ ] Pass scissor rect to Rust paint — skip cells outside bounds
- [ ] Horizontal scrolling first, then vertical

### Priority 2: Styled Text (Chunks)

- [ ] `TextChunk` type: `{ text: string; fg?: number; bg?: number; bold?: boolean }`
- [ ] Update `Text` component to accept `TextChunk[]` or plain string
- [ ] Serialize chunks to Rust for rendering

### Priority 3: Text Input

- [ ] Single-line input improvements (cursor position, selection)
- [ ] Multi-line text editor (builds on scrollable + input)

### Priority 4: Syntax Highlighting

- [ ] Tree-sitter integration (Rust bindings → FFI)
- [ ] TextMate-compatible theme loading (like OpenTUI's `SyntaxStyle`)

---

### Performance & Other

- [x] Move paint to Rust (currently 81% of frame time @ 1.7ms avg)
  - **Why**: Eliminates JS per-cell loops, staging buffer, and BigInt conversions
  - **New FFI function**: `paint(node_data, text_data, focused_id, pressed_id, colors...)`
  - **Rust side**:
    - Reuse parsed node tree from `calculate_layout` (already has frames)
    - Add `PaintNode` struct with: frame, bg, fg, border_color, border_style, text range, node_type
    - Implement `draw_background()`, `draw_border()`, `draw_text()`, `draw_cursor()` writing directly to `CURRENT_BUFFER`
    - Recursive `paint_node()` traversal matching JS logic
  - **TS side**:
    - Add `isFocused` and `isPressed` fields to serialization (FIELDS_PER_NODE: 13 → 15)
    - Replace JS `paint()` call with `api.paint(...)` FFI call
    - Keep `registerHit()` in JS for mouse hit testing (cheap traversal)
    - Remove `stagingBuffer` and `flushStagingBuffer()` (no longer needed)
  - **Expected result**: Paint phase from 1.7ms → ~0.1-0.2ms
- [ ] Add scrollable containers

- [ ] How to handle serialization of walls of text: https://ampcode.com/threads/T-019bdac3-ba03-745f-a3d3-c9d53bfa0648
- [ ] Add render caching - skip serialize/layout if signals unchanged (pi-mono pattern)
- [ ] Incremental tree updates - don't rebuild entire Taffy tree each frame, cache structure and update only changed nodes
- [ ] Visibility culling - skip `paint()` for off-screen nodes (OpenTUI's `_getVisibleChildren` pattern)

- [ ] Neovim as text input (use [Bun PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support))
- [ ] Will SIMD work if I wanna implement caching for serialization. For example, when comparing trees I used SIMD (idk what i'm talking about)
- [ ] Refactor flush function with BatchWriter pattern to reduce nesting
  - BatchWriter struct holds stdout ref, char_seq, batch_start_x/y, prev_fg/bg
  - `new()` initializes with sentinel colors (u64::MAX) to force first color emit
  - `push(x, y, ch, fg, bg)` handles gap detection, color changes, and accumulates chars
  - `flush_pending()` emits MoveTo + Print for accumulated batch
  - Encapsulates all batching logic, main loop just calls push() for changed cells
- [ ] Add performance stats overlay that update independently from rest of the app (can i use a separate thread?)
- [x] Add `flexGrow` support for dynamic width components (e.g., progress bars)
  - **TypeScript side:**
    - Add `flexGrow?: number` to `StyleProps` in `src/types.ts`
    - Update `createStyleSignals()` in `src/components.ts` to include `flexGrow: $(input.flexGrow)`
    - Update serialization in `src/runtime.ts` to pass `flexGrow` value to Rust (add to `FIELDS_PER_NODE`)
  - **Rust side:**
    - Increment `FIELDS_PER_NODE` from 12 to 13 in `lib.rs`
    - Add `flex_grow: f32` field to `Node` struct
    - Parse `flex_grow` in `parse_node()` function
    - Apply `style.flex_grow = node.flex_grow` in `get_styles()` for all node types
  - **Progress bar update:**
    - Remove fixed `width` prop from `ProgressBar`
    - Instead of `" ".repeat(n)`, use a single space `" "` for text
    - Set `flexGrow: progress / 100` on filled node, `flexGrow: (100 - progress) / 100` on unfilled node
    - Layout engine distributes space proportionally - bar auto-sizes to container
  - **Benefits:** No fixed width needed, bar fills available space, cleaner API

### NPM publish notes:

1. push your changes
2. update versions in `Cargo.toml` and `package.json`
3. `git tag v0.0.1` - tag a commit
4. `git push origin v0.0.1` - push the tag
5. release action will build and deploy it as package
