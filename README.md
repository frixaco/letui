# LeTUI

TUI library with a Rust rendering core, built for interactive full-screen terminal apps. Performance of `ratatui`, ecosystem of TypeScript. No more `Ink`. Written from scratch.

![](./demo.png)
![](./demo-2.png)

Demo video:

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

## Prerequisites

- Runtime: [Bun](https://bun.sh/) 1.3+ (Node.js not supported — native bridge uses Bun FFI)
- Prebuilt binaries: `darwin-arm64`, `linux-x64`, `win32-x64`
- Rust toolchain if building locally

## Quick start

```bash
git clone https://github.com/frixaco/letui.git
cd letui
bun install
bun run build-ffi
bun run examples/hello-world.ts
```

More examples:

```bash
bun run dev
bun run examples/mission-control.ts
bun run examples/ai-agent.ts
bun run examples/visualizer.ts
bun run examples/progress-bar.ts
```

(`bun run anitrack` is for personal testing and requires `mpv` player configured with `Anime4K` shaders)

Checks:

```bash
bun run typecheck
bun run smoke
bun run metrics:smoke
```

## Install as a library

```bash
bun add @frixaco/letui typescript
```

On supported targets, install pulls the matching native binary automatically.

Minimal reactive app:

```ts
import { $, COLORS, Column, Text, ff, onKey, run } from "@frixaco/letui";

const count = $(0);
const counterText = Text({
  text: "count: 0",
  foreground: COLORS.default.fg,
});

ff(() => {
  counterText.setText(`count: ${count()}`);
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: COLORS.default.bg,
    border: { color: COLORS.default.bg_highlight, style: "rounded" },
  },
  [
    Text({ text: "hello from letui", foreground: COLORS.default.fg }),
    counterText,
    Text({
      text: "+ / - update, q quit, Ctrl+Q default quit",
      foreground: COLORS.default.grey,
    }),
  ],
);

const app = run(root);

onKey("+", () => count(count() + 1));
onKey("-", () => count(count() - 1));
onKey("q", () => app.quit());
```

```bash
bun run app.ts
```

## How it works

1. Signals-based TypeScript runtime drives updates
2. UI tree is serialized into a compact flat payload for the native core
3. Rust handles layout, paint, terminal buffer work, and flush
4. Terminal output is cell-based and incremental — no full-frame repaints
5. Text updates are batched as diff ops instead of sending full payloads every frame

## Architecture

- **TypeScript** — component API, signals, event handling, serialization
- **Rust** — terminal state, layout, paint, diff flush, buffer storage
- **Bun FFI** — bridge between both layers
- Packaged native binaries for `darwin-arm64`, `linux-x64`, `win32-x64`
- Only deps: `crossterm` and `taffy` Rust crates, everything written from scratch.

## Performance

Frame latency is <1ms for practical workloads.

Benchmark snapshot (`2026-02-20`, `terminal-rerender`, `full` profile, PTY mode):

| Metric       |       letui |       Rezi |               Delta |
| ------------ | ----------: | ---------: | ------------------: |
| Mean latency |       20 µs |     259 µs | letui 12.69× faster |
| p95 latency  |       21 µs |     260 µs |         letui lower |
| Throughput   | 48.6K ops/s | 3.9K ops/s | letui 12.46× higher |
| Peak RSS     |     60.4 MB |   128.2 MB |   letui 2.12× lower |
| PTY bytes    |     43.2 KB |    30.1 KB |  letui 1.43× higher |

## Docs

- [Index](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Components & styling](./docs/components-and-styling.md)
- [State, events & lifecycle](./docs/state-events-lifecycle.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Status

Mid-stage, active development. Core reactive runtime, terminal diffing, Rust paint/layout, and Bun FFI bridge are working. Public API is intentionally small.

## TODO

- [ ] Globals ops queue (see `./docs/FULL_RUST_AUTHORITY_SPEC.md`)
- [ ] Text styling: markdown and syntax highlighting API
- [ ] Safer quit/cleanup when used as a library
- [ ] Responsive examples for smaller terminal sizes
- [ ] Vertical and horizontal scrolling
- [ ] Multi-line text input and shortcuts
- [ ] Persistent Taffy tree
- [ ] Experiment: Neovim as text input via [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)
- [ ] Refactor `flush` with `BatchWriter` pattern
- [ ] Performance stats overlay

## Releasing

1. Push changes
2. Update versions in `Cargo.toml` and `package.json`
3. `git tag v0.0.x && git push origin v0.0.x`
4. Release action builds and publishes packages
