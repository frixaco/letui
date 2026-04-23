# LeTUI

TUI library with a Rust rendering core and TypeScript wrapper API. Written from scratch.

## Demos

### Snake

https://github.com/user-attachments/assets/31f3efcc-0c2b-4b85-8fe1-99129e6b8394

### Typing Speed

https://github.com/user-attachments/assets/7f4f53f5-deb6-4781-bdfa-bf769cabfbb1

### AI agent

https://github.com/user-attachments/assets/1599de82-146d-4a0d-bc66-86a2b51a77c1

## Prerequisites

- Runtime: [Bun](https://bun.sh/) 1.3+ (Node.js not supported)
- Prebuilt binaries: `darwin-arm64`, `linux-x64`, `win32-x64`
- Rust toolchain if building locally

## Quick start

```bash
git clone https://github.com/frixaco/letui.git
cd letui
bun install
bun run build-ffi
```

More examples:

```bash
bun run examples/typing-speed.ts
```

(`bun run anitrack` is for personal testing and requires `mpv` player configured with `Anime4K` shaders)

Checks:

```bash
bun run typecheck
bun run check:rust
```

## Install as a library

```bash
bun add @frixaco/letui
```

On supported targets, install pulls the matching native binary automatically.

Minimal reactive app:

```ts
import { $, Column, Text, appearance, ff, onKey, run } from "@frixaco/letui";

const THEME = {
  fg: 0xf5f7fa,
  muted: 0x94a0b2,
  surface: 0x16181a,
  border: 0x3c4048,
} as const;

const count = $(0);
const counterText = Text({
  text: "count: 0",
  foreground: THEME.fg,
});

ff(() => {
  counterText.setText(`count: ${count()}`);
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: THEME.surface,
    border: { color: THEME.border, style: "rounded" },
  },
  [
    Text({ text: "hello from letui", foreground: THEME.fg }),
    counterText,
    Text({
      text: "+ / - update, q quit, Ctrl+Q default quit",
      foreground: THEME.muted,
    }),
  ],
);

ff(() => {
  const mode = appearance();
  root.setStyle({
    background: mode === "light" ? 0xffffff : THEME.surface,
  });
});

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
2. Each reactive frame snapshots the current node tree into JS-side sent state
3. If node shape stays compatible, JS sends only style deltas plus text ops; if shape changes, Rust tree state is rebuilt once
4. Rust keeps persistent tree state, runs layout + paint, and owns the terminal buffers
5. Frame data is synced back to JS nodes for `frame` / `frameWidth()` / `frameHeight()`, while Rust also exposes the final visible hitmap for interaction
6. Terminal output is cell-based and incremental; flush only writes changed cells

## Architecture

- **TypeScript** — component API, signals, input routing, sent-tree diffing, op encoding
- **Rust** — persistent tree state, style/text op application, layout, paint, incremental flush
- **Bun FFI** — bridge for op buffers, frame buffers, and lifecycle hooks
- Packaged native binaries for `darwin-arm64`, `linux-x64`, `win32-x64`
- Only deps: `crossterm`, `taffy`, `unicode-width` and `unicode-segmentation` Rust crates, everything else is written from scratch.

Text wrapping, clipping, and overflow are resolved in the Rust renderer. Explicit newlines are treated as hard row boundaries after text normalization.

Vertical scrolling is available on `ScrollView`:

```ts
const viewport = ScrollView(
  {
    flexGrow: 1,
    minHeight: 0,
    scrollY: 12,
  },
  [content],
);
```

`ScrollView` always scrolls vertically. `scrollY` is a row offset; Rust clamps oversized values, floors fractional values to whole rows, and owns the final hit-testing for the visible scrolled region.

Debug metrics split the frame into `js`, `render`, `sync`, and `flush`, plus a worst-frame breakdown. Enable with `run(root, { debug: true })` to print the summary on quit. If you also want a file, pass `run(root, { debug: true, metricsPath: "dump/metrics.txt" })` or call `saveMetrics(...)` yourself.

Appearance detection uses the terminal background query (`OSC 11`) and refreshes again when the terminal regains focus. `appearance()` returns `"light"`, `"dark"`, or `"unknown"`, and `refreshAppearance()` lets apps force a re-query later if needed.

## Performance (TODO)

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
- [Releasing](./docs/releasing.md)
- [Troubleshooting](./docs/troubleshooting.md)

## TODO

- [x] All essential features except ones below
- [x] Text styling: markdown and syntax highlighting API
- [x] Text wrap, overflow, clipping, and explicit newline layout in the renderer
- [x] Persistent Taffy tree
- [x] Vertical and horizontal scrolling
- [x] Minimal theming support
- [ ] Full grapheme rendering support: store/render whole grapheme strings per lead cell instead of a single codepoint
- [ ] Better Input experience: multiline editing, shortcuts, cursor movement, scrolling, placeholder rendering, etc.
- [ ] Safer quit/cleanup when used as a library
- [ ] Experiment: Neovim as text input via a Bun-compatible PTY workflow
- [ ] Refactor `flush` with `BatchWriter` pattern
- [ ] Performance stats overlay

## Releasing

See [docs/releasing.md](./docs/releasing.md).
