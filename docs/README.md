# letui docs

Audience: people and agents building apps in `examples/`.
Goal: get from zero to first interactive TUI quickly, then scale safely.

## Start here

1. Read `docs/getting-started.md`
2. Copy starter file into `examples/`
3. Run `bun run build-ffi && bun run examples/<your-file>.ts`
4. Use `docs/components-and-styling.md` while building UI
5. Use `docs/state-events-lifecycle.md` for state, key handling, and cleanup

## Doc map

- `docs/getting-started.md`: setup, first app, run loop
- `docs/components-and-styling.md`: components, required props, style fields, enums
- `docs/state-events-lifecycle.md`: signals, focus, keyboard/mouse behavior, lifecycle
- `docs/troubleshooting.md`: common errors and quick fixes

## Runtime model (1 minute)

- TypeScript builds node tree + reactive updates
- Rust backend does paint/flush work
- `run(root)` starts loop, event handling, resize handling
- text/style updates are diffed and sent as ops, not full payload each frame

## Constraints to remember

- Use Bun, not Node, for app runtime in this repo
- Colors are numeric hex (`0xRRGGBB`), not CSS strings
- Default exit is `Ctrl+Q` (`"\\x11"`); add your own `onKey("q", ...)` if needed

## Demo spec: mission control (deep space probe)

### First principles

- One screen, one story: "probe alive, mission under control, operator in command"
- Readability first: critical states visible in `<1s` scan
- Motion with purpose: updates communicate health/risk, not noise
- Full-terminal contract: no floating island UI; all cells used intentionally

### Assumptions

- Target file: `examples/mission-control.ts`
- Build/runtime: `bun run build-ffi` then `bun run examples/mission-control.ts`
- Allowed primitives only: `Box/Row/Column/Text/Input/Button` + reactive signals/effects
- Mocked data accepted; deterministic mode needed for screenshot capture

### Demo goals

- Fill entire viewport at start (`root` uses `flexGrow: 1`)
- Feel responsive on resize; degrade gracefully on smaller terminals
- Showcase many UI patterns in one coherent theme
- Produce screenshot-friendly "hero" state without manual editing

### Viewport layout contract

- Root: `Column({ flexGrow: 1, background: <space-black> })`
- Row 1 (header, fixed ~3 lines): mission title, UTC clock, comms status badges, FPS/latency text
- Row 2 (main, `flexGrow: 1`): 3-column console (`left:center:right` flex ratio `3:6:4`)
- Row 3 (footer, fixed ~3 lines): command input, key hints, transient toast area

### Main columns and panels

- Left column (`Column`, `rowGap: 1`):
- Panel L1: subsystem tree (`Power`, `Thermal`, `Nav`, `Comms`, `Payload`) with status dots
- Panel L2: checklist (`Pre-burn`, `Antenna lock`, `Safe mode gate`) with checkbox glyphs
- Panel L3: command queue (`Button` rows): `ARM`, `PING`, `SYNC`, `SAFE`, `BURN`

- Center column (`Column`, `rowGap: 1`):
- Panel C1: trajectory strip (ASCII chart line + waypoint markers)
- Panel C2: telemetry grid (`2 x 3` mini cards): velocity, altitude, fuel, battery, temp, radiation
- Panel C3: reactor/engine thrust bars (stacked progress bars, warning thresholds)
- Panel C4: starfield/radar block (animated sweep line + contact markers)

- Right column (`Column`, `rowGap: 1`):
- Panel R1: event timeline (newest-first mission events with timestamp + severity badge)
- Panel R2: anomaly feed (alerts, ack state, owner)
- Panel R3: comms window (uplink/downlink message log + packet loss mini-stat)

### UI element inventory (explicit showcase)

- Boxed cards with 2 border styles (`rounded`, `single`)
- Section headers + subtitle text
- Severity badges (`OK/WARN/CRIT`)
- Progress bars (fuel, signal, CPU)
- Sparkline-like unicode strips for telemetry trend
- Table-like aligned rows/columns (right-aligned numeric fields)
- Selectable command buttons (focused, idle, disabled look)
- Input field (`:` prompt) + submit path
- Toast notifications in footer
- Blinking caret/indicator for active channel
- Timeline list with alternating row background

### Color and visual system

- Background tokens:
- `bg0 = 0x070B14` (global)
- `bg1 = 0x0E1422` (panel)
- `bg2 = 0x162033` (panel-alt/focus)

- Foreground tokens:
- `fg0 = 0xD8E4FF` (primary text)
- `fg1 = 0x91A6CC` (muted text)
- `accent = 0x35E0C8` (interactive/focus)

- Status tokens:
- `ok = 0x57D98A`
- `warn = 0xFFD166`
- `crit = 0xFF5D73`
- `info = 0x66B3FF`

- Style rules:
- Critical values pulse between `crit` and `fg0`
- Focused control gets `bg2` + accent border
- Keep contrast high; avoid low-sat dark-on-dark text

### Mock data model

- Mission meta: name, phase, elapsed time, ETA, comms state
- Numeric telemetry: `velocity`, `altitude`, `fuelPct`, `batteryPct`, `coreTemp`, `radiation`
- Health map: subsystem status enum (`OK|WARN|CRIT`)
- Event stream: `{ ts, severity, source, message }[]` capped ring buffer
- Command queue state: pending/running/success/fail with timestamps

### Update cadence and performance budget

- Fast loop (`100-150ms`): clock tick, radar sweep, one telemetry subset
- Medium loop (`400-700ms`): progress bars + trend strings
- Slow loop (`1.5-3s`): inject timeline/anomaly events
- Update changed nodes only via `setText`/`setStyle`; avoid full subtree rebuilds
- Target steady render budget: perceived smoothness at typical terminal sizes (`120x35+`)

### Responsiveness rules

- Width `<110` cols: collapse 3-column main to 2 columns (`left` stacks above `right`)
- Width `<86` cols: hide radar block; keep telemetry + timeline + command input
- Height `<30` rows: cap event list length and reduce row gaps to `0`
- Always preserve:
- Header mission status
- At least 4 key telemetry metrics
- Command input + quit hint

### Interaction map

- `q` quit app (plus default `Ctrl+Q`)
- `Tab` / `Shift+Tab` cycle focus between command queue and input
- Arrow keys / `j` `k` move queue selection
- `Enter` executes focused command or submits input
- `a` acknowledge top anomaly
- `p` pause/resume simulation ticks
- `s` screenshot mode: freeze data + force "hero" state
- `r` reset to seeded initial state

### Screenshot mode (for README/social)

- Freezes timers and random updates
- Sets mission phase to high-drama moment (`ORBIT INSERTION`)
- Ensures mixed statuses visible (`OK`, `WARN`, one `CRIT`)
- Keeps one toast visible (`COMMAND ACCEPTED`)
- Keeps command input prefilled (`: uplink sync --priority high`)

### Acceptance criteria

- App opens full-screen and stays full-screen through resize
- No panel overlap/cutoff at `120x35`, `100x30`, `80x24`
- Distinct visual states for focus, warn, crit, disabled
- Minimum 10 simultaneously visible "widget styles"
- Controls usable by keyboard only
- `run(root, { debug: true })` shows stable metrics without runaway growth

### Build order (implementation phases)

- Phase 1: static layout + theme tokens
- Phase 2: mock data engine + panel bindings
- Phase 3: input/focus/command interactions
- Phase 4: responsive breakpoints + screenshot mode
- Phase 5: polish pass (spacing, alignment, severity semantics)
