# LeTUI docs

## Start here

1. Read `docs/getting-started.md`
2. Run `bun install && bun run build-ffi`
3. Use `docs/components-and-styling.md` for current public components and props
4. Use `docs/state-events-lifecycle.md` for signals, focus, input, and cleanup
5. Use `docs/releasing.md` when cutting a new npm release

## Current API shape

- layout primitives: `Box`, `Row`, `Column`
- leaf nodes: `Text`, `Input`, `Button`
- scrolling container: `ScrollView`
- shared style props live in `StyleProps`: borders, padding, colors, flex, sizing, min/max, margins, alignment, wrapping, box sizing
- box-only props live in `BoxProps`: `gap`, `direction`
- direction supports `row`, `column`, `rowReverse`, `columnReverse`
- current docs treat code as source of truth; anything outside exported prop types is not public API

## Current runtime shape

- JS keeps a previous sent-tree snapshot and compares it against the current node tree each frame
- compatible tree shape => send style deltas and text ops only
- incompatible tree shape => clear Rust tree state and rebuild it once
- Rust owns persistent tree state, layout, paint, terminal buffers, and incremental flush
- Rust text layout treats explicit newlines as hard row boundaries; wrap and overflow happen there, not in JS
- debug metrics phases: `js`, `render`, `sync`, `flush`
- auto appearance starts with a terminal color-scheme request plus OSC 11 fallback, then listens for DEC 2031 live updates when supported

## Current input scope

- `Text` wrapping, clipping, overflow, and newline layout are shipped in the renderer
- `Input` supports append-at-end typing, backspace-from-end, and multiline newline insertion
- `Input` is not yet a full editor: no caret movement, mid-buffer insertion, selection, or scrolling
- `placeholder` exists in props today but is not rendered yet

## Example map

- `examples/anitrack.ts`: interactive torrent-search demo
- `examples/anki.ts`: two-screen Anki-style flashcard UI demo
- `examples/ai-agent.ts`: chat-style agent UI demo
- `examples/snake.ts`: keyboard-driven game demo
- `examples/typing-speed.ts`: centered Colemak Mod-DH typing tester
- `examples/text.ts`: wrap, overflow, box sizing, and input layout demo
- `examples/visualizer.ts`: animated styled-text visualization
- `examples/progress-bar.ts`: reusable loading bar helper used by demos
- `examples/colors.ts`: demo-only palettes

## Agent skills

Repo-local agent skills live in `.agents/skills/`.

- `.agents/skills/kitty-tui-control/SKILL.md`: kitty tab/window control for interactive terminal testing

## Constraints to remember

- use Bun, not Node, for runtime in this repo
- colors are numeric hex (`0xRRGGBB`), not CSS strings
- `Ctrl+Q` is always the default quit path
- keep node identity stable when possible; recreating whole subtrees defeats incremental sync
- examples and scripts are part of typecheck; if docs drift from code, fix docs/examples first
