# letui

![](./demo.png)
![](./demo-2.png)

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

- [ ] Scrollable containers: route wheel/touchpad events (`deltaX`/`deltaY`) to nearest scrollable container
- [ ] Scrollable containers: add `overflow: "hidden"` prop to trigger clipping during paint
- [ ] Scrollable containers: add `scrollX`/`scrollY` signals per scrollable node
- [ ] Scrollable containers: pass scissor rect to Rust paint to skip out-of-bounds cells
- [ ] Scrollable containers: implement horizontal scrolling first, then vertical
- [ ] Styled text chunks: add `TextChunk` type `{ text: string; fg?: number; bg?: number; bold?: boolean }`
- [ ] Styled text chunks: update `Text` to accept `TextChunk[]` or plain string
- [ ] Styled text chunks: serialize chunks to Rust renderer
- [ ] Text input: improve single-line input (cursor position, selection)
- [ ] Text input: add multi-line editor (builds on scrollable + input)
- [ ] Syntax highlighting: integrate Tree-sitter (Rust bindings -> FFI)
- [ ] Syntax highlighting: load TextMate-compatible themes (like OpenTUI `SyntaxStyle`)
- [ ] Performance: define wall-of-text serialization strategy ([thread](https://ampcode.com/threads/T-019bdac3-ba03-745f-a3d3-c9d53bfa0648))
- [ ] Performance: add render caching to skip serialize/layout when signals unchanged (pi-mono pattern)
- [ ] Performance: implement incremental tree updates instead of rebuilding Taffy tree each frame
- [ ] Performance: add visibility culling to skip `paint()` for off-screen nodes (OpenTUI `_getVisibleChildren`)
- [ ] Experiment: explore Neovim as text input (use [Bun PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support))
- [ ] Experiment: evaluate SIMD for tree diff / serialization comparisons
- [ ] Performance: refactor `flush` with `BatchWriter` pattern
- [ ] Tooling: add performance stats overlay that updates independently from app render

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
