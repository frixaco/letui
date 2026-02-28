# letui

![](./demo.png)
![](./demo-2.png)

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

TUI library written using Rust and TypeScript

**Dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

### TODO

- [ ] scrolling support
- [ ] better text styling user API: add `TextChunk` type `{ text: string; fg?: number; bg?: number; bold?: boolean }`
- [ ] better text input: multi-line and shortcuts
- [ ] verify DX for supporting syntax highlighting
- [ ] persistent taffy tree
- [ ] (experiment) Neovim as text input (see [Bun PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support))
- [ ] refactor `flush` with `BatchWriter` pattern
- [ ] add performance stats overlay (runs independently)

### NPM publish notes:

1. push your changes
2. update versions in `Cargo.toml` and `package.json`
3. `git tag v0.0.1` - tag a commit
4. `git push origin v0.0.1` - push the tag
5. release action will build and deploy it as package

### Benchmark Results (letui vs Rezi) - may not be accurate, just playing around right now

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
