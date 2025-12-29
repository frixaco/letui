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

## Priority 2: Persistent Layout Tree + Node Protocol

Foundation for incremental updates. Combines serialization protocol with persistent tree.

- [ ] **Node serialization protocol** — 11 fields per node (canonical wire format):
  - nodeType, gap, paddingX, paddingY, border, childCount, textLength
  - fgColor, bgColor, borderColor, borderStyle
  - Include stable node ID in the format

- [ ] **Add stable node IDs and ID→NodeId map in Rust**
  - Generate IDs in TS (already have `node.id`), pass to Rust
  - Use `HashMap<String, NodeId>` for O(1) lookup

- [ ] **Keep Taffy tree persistent in Rust**
  - Store `TaffyTree` in a static `Mutex` like the buffers
  - First call builds tree, subsequent calls update existing nodes
  - Use `taffy.set_style()` for style changes, `mark_dirty()` for recompute

- [ ] **Implement incremental FFI functions**
  - `update_node_text(id, text)` — update text without full serialize
  - `update_node_style(id, style_fields)` — partial style updates
  - `add_node(parent_id, node_data)` / `remove_node(id)` for dynamic children

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

High complexity — essentially a terminal emulator inside the TUI.

- [ ] **Spawn PTY subprocess**
  - Use `pty` crate in Rust or Bun's `spawn` with PTY mode
  - Allocate pseudo-terminal with desired size
  - Spawn Neovim (or any shell) attached to PTY

- [ ] **PTY output parsing**
  - Read PTY stdout as stream of bytes
  - Parse ANSI escape sequences (CSI codes for colors, cursor movement)
  - Maintain virtual screen buffer: 2D array of cells (char + fg + bg)
  - Libraries: `vte` crate for Rust, or port minimal parser

- [ ] **PTY region painting**
  - New component type: `Terminal` or `Embed`
  - On each frame, copy PTY screen buffer into main buffer at component's frame coords
  - Handle resize: send `SIGWINCH` to PTY when container resizes

- [ ] **Input routing to PTY**
  - When `Terminal` component is focused, route all keyboard input to PTY stdin
  - Pass through raw bytes (including escape sequences for special keys)
  - Mouse input passthrough (optional, for mouse-enabled TUI apps)
