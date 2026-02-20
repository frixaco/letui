# letui

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

TUI library written using Rust and TypeScript

## Since `v0.0.11`

- Added socket-based test driver for automated checks (`ping`, `sleep`, `key`, `mouse`, `focused`, `snapshot`, `quit`)
- Stopped sending full text payload on every `paint()` call
- Added Rust-side text registry keyed by node id + per-frame text diff sync
- Batched text upsert/delete operations into single `sync_text_ops` FFI call per frame
- Improved terminal flush batching to track terminal cells (not UTF-8 byte length) for cleaner multibyte rendering
- Added stronger quit cleanup path (stop test driver, clear text registry, free buffers, deinit terminal)

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

### Priority 0: Text Registry (FFI Optimization) ✅

- [x] Keep text on Rust side in `TEXT_REGISTRY` (keyed by node id)
- [x] Detect text diffs in TS runtime (`upsert` + `delete`)
- [x] Encode text diffs as compact ops and send once via `sync_text_ops`
- [x] Apply all text ops in one Rust pass under one registry lock
- Result: text traffic scales with changed nodes, not total text nodes

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
  - **Why**: remove JS per-cell paint work from hot path
  - **Current flow**:
    - JS serializes node tree into `nodeData`
    - Rust does layout + paint into `CURRENT_BUFFER`
    - JS only syncs frames/event hit areas, then calls `flush()`
    - Text sync now happens separately via `sync_text_ops`
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

## Benchmark Results (letui vs Rezi) - may not be accurate, just playing around right now

Latest run: `2026-02-20` (`terminal-rerender`, `full` profile, PTY mode)

Run config:

- `warmup=100`
- `iterations=1000`
- `replicates=7` (first replicate discarded)
- command: `bun run bench/run.ts --profile full --scenario terminal-rerender`

| Metric       |       letui |       Rezi |               Delta |
| ------------ | ----------: | ---------: | ------------------: |
| Mean latency |       20 us |     259 us | letui 12.69x faster |
| p95 latency  |       21 us |     260 us |         letui lower |
| Throughput   | 48.6K ops/s | 3.9K ops/s | letui 12.46x higher |
| Peak RSS     |     60.4 MB |   128.2 MB |   letui 2.12x lower |
| PTY bytes    |     43.2 KB |    30.1 KB |  letui 1.43x higher |
