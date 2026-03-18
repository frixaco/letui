# LeTUI docs

## Start here

1. Read `docs/getting-started.md`
2. Run `bun run build-ffi`
3. Start with `bun run dev`, `bun run anitrack`, or `examples/mission-control.ts`
4. Use `docs/components-and-styling.md` for current public props
5. Use `docs/state-events-lifecycle.md` for signals, focus, input, and cleanup

## Current API shape

- layout primitives: `Box`, `Row`, `Column`
- leaf nodes: `Text`, `Input`, `Button`
- supported shared style fields: `border`, `padding`, `background`, `foreground`, `flexGrow`
- supported box fields: `gap`, `direction`
- current docs treat code as source of truth; unsupported props should be considered not implemented

## Example map

- `examples/smoke.ts`: deterministic PTY smoke target for CI and agents
- `examples/anitrack.ts`: interactive torrent-search demo
- `examples/mission-control.ts`: static dashboard-style showcase
- `examples/ai-agent.ts`: keyboard-driven split-pane demo
- `examples/visualizer.ts`: metrics-friendly animated renderer stress demo

## Agent skills

Repo-local agent skills live in `.agents/skills/`.

- `.agents/skills/letui-api-doc-drift/SKILL.md`: docs/API drift workflow for this repo
- `.agents/skills/letui-smoke-runner/SKILL.md`: manual and CI-style TUI smoke validation
- `.agents/skills/kitty-tui-control/SKILL.md`: kitty tab/window control for interactive terminal testing

## Constraints to remember

- use Bun, not Node, for runtime in this repo
- colors are numeric hex (`0xRRGGBB`), not CSS strings
- `Ctrl+Q` is always the default quit path
- examples and scripts are part of typecheck; if docs drift from code, fix docs/examples first
