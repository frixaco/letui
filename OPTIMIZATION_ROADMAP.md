# Optimization Roadmap

## Completed ✅

- [x] **Skip diff on first flush** — `FIRST_DIFF` flag writes rows directly without cell comparison
- [x] **Minimize escape sequences on first flush** — row-based `MoveTo`, color caching with `prev_fg`/`prev_bg`, batched character sequences
- [x] **Remove redundant `api.flush()` calls** — single `flush()` per frame in `ff()` callback
- [x] **Binary layout protocol** — `Float32Array` for nodes, `Uint8Array` for text, no JSON parsing
- [x] **Batch consecutive changed cells** — instead of 4 commands per cell (`MoveTo` + `SetFG` + `SetBG` + `Print`), batch runs:
  - Track `run_start_x`, `run_y`, `run_chars` for current batch
  - If next changed cell has same colors AND same row → append to run
  - Otherwise flush current run with single `MoveTo` + `Print`
- [x] **Track colors across entire frame** — init `prev_fg`/`prev_bg` to `u64::MAX`, only emit `SetForegroundColor`/`SetBackgroundColor` when color actually changes

## Priority 2: New Component API (Option B — Retained Nodes, Full Rebuild)

Simplified architecture: persistent node objects in TS, full Taffy rebuild each frame in Rust.

### Design Decisions

- **No VDOM diffing** — Taffy rebuild is fast enough (~0.3ms for 1000 nodes)
- **Terminal cell diffing preserved** — only changed cells repaint
- **Retained nodes** — nodes are persistent objects with methods (`.focus()`, `.setStyle()`, etc.)
- **Signals + effects** — reactive state management

### API Surface

**Node constructors:**
- `Col({ gap, padding, border, ... }, children)`
- `Row({ gap, padding, border, ... }, children)`
- `Box({ width, height, bg, ... })`
- `Text(string)` or `Text({ text: signal })`
- `Input({ placeholder, onChange, onSubmit, onFocus, onBlur })`
- `Button({ text, onPress, onFocus, onBlur })`

**Node methods:**
- `.setStyle({ ... })` — update layout/style props
- `.setChildren([...])` — replace children (containers)
- `.setText(string)` — update text content
- `.focus()` / `.blur()` / `.isFocused()` — focus management

**Reactivity (already implemented in `signals.ts`):**
- `$()` — create signal, call to read, call with arg to write
- `dd()` — derived/computed signal
- `ff()` — effect (runs when dependencies change)
- `af()` — async effect

**Global:**
- `onKey(key, callback)` — global key handler
- `run(rootNode)` — start app, returns `{ quit() }`

### Tasks

- [x] **Signal API** — already implemented (`$`, `dd`, `ff`, `af` in `signals.ts`)

- [ ] **Implement new node constructors**
  - `Col`, `Row`, `Box`, `Text`, `Input`, `Button`
  - Each returns object with methods (`.setStyle()`, `.focus()`, etc.)
  - Internal: nodes track dirty state, serialize on frame boundary

- [x] **Effect system** — already implemented (`ff()` in `signals.ts`)

- [ ] **Implement global `onKey()`**
  - Register key handlers at app level
  - Route keys to handlers before focused component

- [ ] **Implement focus management**
  - Track single focused node
  - `.focus()` sets focus, `.blur()` removes
  - `.isFocused()` returns boolean
  - `onFocus`/`onBlur` callbacks on nodes

- [ ] **Refactor `run()`**
  - Accept root node (not function)
  - Return `{ quit() }` for app control
  - Frame loop: collect dirty nodes → serialize → FFI → Rust rebuilds Taffy → render

- [ ] **Update serialization**
  - Walk node tree, serialize to existing binary format
  - No changes needed on Rust side (full rebuild each frame)

## Priority 3: Rust Painting

Build primitives first, then combine into single FFI call.

- [ ] **Rust-side painting functions**
  - `fill_rect()` — fill rectangular area with fg/bg colors
  - `draw_border_rust()` — draw box-drawing characters for borders
  - `draw_text_rust()` — write text characters to buffer
  - Handle focused/pressed state for buttons/inputs

- [ ] **Combined `layout_and_paint` FFI call** — single FFI call instead of separate layout + TS paint
  - Applies pending incremental updates
  - Runs layout on persistent Taffy tree
  - Uses Rust painting primitives to paint into frame buffer
  - Returns frame data for hit-testing

## Priority 4: High-Churn Optimization (htop-level)

Only relevant for UIs with many elements updating at 60+ FPS.

- [ ] **Persist node tree in TS (`nodeFactory` once at startup)**
  - Currently `nodeFactory(tw, th)` runs every frame
  - For static layouts, call once and update text signals in-place
  - Requires distinguishing "mount" vs "update" lifecycle

- [ ] **Smart diff-path batching**
  - Reuse Priority 1 batching as the "normal" diff path
  - Detect "high churn" frames (>N cells changed)
  - Switch to row-scan strategy: batch same-color runs like first-frame path
  - Threshold TBD via profiling (~100-500 cells)

- [ ] **Pack cell representation: one `u64` per cell** (only if profiling justifies)
  - Layout: `[codepoint: 21 bits][fg_r: 8][fg_g: 8][fg_b: 8][bg_r: 8][bg_g: 8][bg_b: 8][unused: 3]`
  - Reduces buffer from 240KB to 80KB for 200x50 terminal
  - Encode/decode with bit shifts in both TS and Rust

## Priority 5: Layout Features

Required for complex layouts like split-pane UIs.

- [ ] **Fixed width/height props on containers**
  - Expose `width`, `height`, `minHeight`, `maxHeight` in TS component props
  - Map to Taffy `size`, `min_size`, `max_size` in `get_styles()`
  - Enables fixed-height bottom input area, fixed-width sidebars

- [ ] **Scroll container with offset**
  - Add `scrollOffset` prop to Column/Row
  - Track scroll position in TS signal
  - In Rust paint: subtract `scrollOffset` from child Y coords
  - Clip children outside container bounds (already have `Overflow::Hidden`)
  - Keyboard-driven scroll (j/k already wired, just need offset mutation)

## Priority 6: Input & Cursor

Polish for text input components.

- [ ] **Cursor rendering**
  - Track cursor position in InputBox (default: end of text)
  - Paint cursor cell with inverted colors or blinking
  - Support cursor movement (left/right arrow keys, Home/End)

- [ ] **Text selection** (optional, lower priority)
  - Track selection start/end positions
  - Paint selected range with highlight background
  - Copy to clipboard on Ctrl+C

## Priority 7: PTY Embedding (Neovim integration)

Terminal emulator inside the TUI, using libghostty-vt for parsing/state.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Rust                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ PTY I/O  │───▶│ libghostty-vt│───▶│ Paint to     │  │
│  │ (spawn)  │    │ (C API)      │    │ frame buffer │  │
│  └──────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                     single FFI call
                           ▼
┌─────────────────────────────────────────────────────────┐
│              TypeScript (Terminal component)            │
└─────────────────────────────────────────────────────────┘
```

All PTY/VT logic lives in Rust — zero FFI crossings in the hot path.

### Tasks

- [ ] **Integrate libghostty-vt in Rust**
  - Add libghostty-vt C API dependency (via `cc` crate or system lib)
  - Create `Terminal` struct wrapping `ghostty_vt_t` pointer
  - Expose `feed(bytes)` → updates internal screen state
  - Expose `get_cell(x, y)` → returns char + fg + bg
  - Fallback: `vte` crate if libghostty-vt C API not ready

- [ ] **Spawn PTY subprocess**
  - Use `portable-pty` or `pty` crate in Rust
  - Allocate pseudo-terminal with desired size
  - Spawn Neovim (or any shell) attached to PTY
  - Non-blocking read loop for PTY stdout

- [ ] **PTY region painting**
  - New `Terminal` component in TS (width, height, command props)
  - Rust-side `paint_terminal(id, frame_x, frame_y, w, h)`
  - Copies libghostty-vt screen buffer → main frame buffer
  - Handle resize: send `SIGWINCH` to PTY when container resizes

- [ ] **Input routing to PTY**
  - When `Terminal` component is focused, route keyboard to Rust
  - Rust writes raw bytes to PTY stdin (including escape sequences)
  - Mouse input passthrough (optional, for mouse-enabled TUI apps)

### References

- libghostty-vt blog: https://mitchellh.com/writing/libghostty-is-coming
- C API header (internal, will change): https://github.com/ghostty-org/ghostty/blob/main/include/ghostty.h
- PR #8840 (Zig module): https://github.com/ghostty-org/ghostty/pull/8840
- Status: C API "coming very shortly", stable tag expected ~March 2026
