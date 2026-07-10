# LeTUI docs

## Start here

1. Read `docs/getting-started.md`
2. Run `bun install`
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

- TypeScript keeps a persistent Taffy tree alongside the live component tree
- compatible tree shape => update changed styles and measure contexts in place
- incompatible tree shape => rebuild the internal Taffy tree once
- TypeScript owns layout, paint, terminal buffers, hit maps, and incremental flush
- text layout treats explicit newlines as hard row boundaries before wrapping and overflow
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
- `examples/smoke.ts`: deterministic smoke-test fixture
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
