# letui

A minimal TUI renderer using Rust (crossterm) + Bun FFI. This plan targets a 2–3 day MVP with truecolor, sub-8ms input-to-render latency, and basic widgets (text, list, button). Borders are optional and included if time allows.

## Goals
- Truecolor output (24-bit RGB) and Unicode text.
- Sub-8ms input-to-render latency by rendering on demand (dirty-only), not fixed FPS.
- Widgets: text, list, button. Optional: simple box borders.
- Minimal API over Bun FFI. No new dependencies beyond crossterm.

## Current code (baseline)
- Renderer and buffers in Rust:
  - init buffer: [`init_buffer()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L18-L27)
  - terminal init: [`init_letui()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L30-L35)
  - terminal deinit: [`deinit_letui()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L38-L42)
  - render diff: [`render()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L45-L93)
  - expose buffer to JS: [`get_buffer()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L96-L107)
  - debug cell: [`debug_buffer()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L119-L131)
- Bun side setup and FFI calls: [`index.ts`](file:///Users/frixaco/personal/letui/index.ts#L1-L88)

## Scope & architecture
- Renderer in Rust, front-end in Bun/TS.
- Shared linear cell buffer owned by Rust, memory-mapped in Bun via `bun:ffi` `toArrayBuffer` as `BigUint64Array`.
- Cell format (per 3 u64s): `[codepoint:u64, fg_rgb:u64, bg_rgb:u64]`; RGB is 24-bit in lower bits. Indexing: `idx = (y * width + x) * 3`.
- Double-buffering in Rust: `CURRENT_BUFFER` (writable) and `LAST_BUFFER` for diff. Render compares triplets and only updates changed cells.
- Input handled in Rust with `crossterm::event::poll(Duration)` + `read()` (non-blocking) and exposed over FFI.

## API plan
- Rust FFI (existing and keep):
  - [`init_buffer()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L18-L27): allocate `(w*h*3)` cells, clone to last buffer.
  - [`init_letui()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L30-L35): enter alternate screen, clear, enable raw mode.
  - [`deinit_letui()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L38-L42): leave alternate screen; add `disable_raw_mode()` and show cursor.
  - [`render()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L45-L93): diff-based update + single flush.
  - [`get_buffer()`](file:///Users/frixaco/personal/letui/letui-ffi/src/lib.rs#L96-L107): return pointer + length.
- Rust FFI (add for MVP):
  - `resize_buffer(w:u16,h:u16)` – reallocate buffers on terminal resize; force a full redraw next frame.
  - `poll_event(out_ptr:*mut Event)` – non-blocking; returns `0/1`. `Event { kind:u8, key:u16, mods:u8 }` (4 bytes) to avoid packing in JS.
  - `clear(fg:u32,bg:u32)` – fill CURRENT buffer with spaces in given colors; mark dirty.
  - `get_size(out_w:*mut u16, out_h:*mut u16)` – optional; otherwise piggyback on get_buffer.
- JS/Bun convenience (JS-only):
  - `getBuffer(): BigUint64Array` – wrap `toArrayBuffer(ptr,len*8)`.
  - `setCell(x,y, ch:number, fg:number, bg:number)` – writes into mapped buffer.
  - Widgets: `drawText(x,y,text, style)`, `drawList(x,y,width,items,selected,style)`, `drawButton(x,y,label,state,style)`.
  - Borders: `drawRect(x,y,w,h, style)` using Unicode box-drawing; optional ASCII fallback.

## Performance tactics
- Truecolor via crossterm’s `Color::Rgb{r,g,b}` for FG/BG; supported on UNIX & Windows 10+ terminals.
- Batch outputs using `queue!` and one `flush()` per frame (avoid per-cell syscalls).
- Cache terminal size per render (or update on resize) instead of calling `size()` per cell.
- Coalesce contiguous runs with same FG+BG: emit one `MoveTo` + `Set*` then `Print(String)` for the run.
- Avoid redundant `SetForegroundColor/SetBackgroundColor` when values don’t change.
- Reset colors once after the loop (`ResetColor`) to leave the shell clean.
- Render-on-demand: JS writes to buffer, sets a `dirty` flag, and schedules `render()` via `queueMicrotask` (or `setTimeout(0)`) if not already scheduled. Input events trigger immediate render.
- Concurrency note: JS should not write while `render()` runs. In practice, Bun’s single-threaded model makes "write then call render()" safe; documenting this avoids UB with `static mut`.

## Input
- Add `poll_event()` FFI using `crossterm::event::poll(Duration)` + `read()`; return false if no event immediately available.
- JS polling loop: `setInterval(poll, 4)` (~240 Hz) drains events each tick and updates state; widgets schedule a render.
- Map common keys first (Up/Down/Enter/Escape/Tab/Space) and printable Unicode (treat width=1 for MVP).

## Widgets (MVP)
- Text: write string as sequential cells with style.
- List: vertical list with one selected index; selected row uses inverse/colored style; Up/Down navigates, Enter selects.
- Button: label with normal/focus/active styles; Space/Enter toggles callback.
- Borders (optional): `drawRect` with single-line box-drawing characters; clip to viewport.

## Milestones (2–3 days)
- Day 1: Renderer core
  - Move `size()` out of inner loop; cache `(w,h)` per render.
  - Update `LAST_BUFFER` after a successful flush (copy or swap) so diffs work.
  - Add `disable_raw_mode()` in `deinit_letui()` and show cursor.
  - Implement run coalescing + color caching + `ResetColor` once at end.
  - Add `resize_buffer()` and force full redraw after resize.
- Day 2: Input + widgets
  - Implement `poll_event()` and JS poll loop (4 ms tick) that drains the queue.
  - Implement `setCell`, `drawText`, `drawList`, `drawButton`, `drawRect` in JS.
  - Demo: interactive list + button with dirty-only renders.
- Day 3: Perf & polish
  - Benchmark (80×24, 160×48): measure render time per frame; aim <2–4 ms typical, <8 ms worst-case.
  - Unicode clip (assume width=1 for MVP), edge clipping, resize behavior.
  - Clean shutdown paths always call `deinit_letui()` and `free_buffer()`.

## Acceptance criteria
- Truecolor visually verified; widgets render and respond with low latency.
- Dirty-only updates; runs coalesced; single flush per frame; size cached.
- Input-to-render under ~8 ms in demo; no flicker; proper deinit restores terminal.

## References
- Crossterm Color::Rgb (truecolor): https://docs.rs/crossterm/latest/crossterm/style/enum.Color.html
- Raw mode APIs: https://docs.rs/crossterm/latest/crossterm/terminal/index.html
- Non-blocking input (`event::poll`): https://docs.rs/crossterm/latest/crossterm/event/index.html and https://docs.rs/crossterm/latest/crossterm/event/fn.poll.html
- Batching output (`queue!`, `execute!`): https://docs.rs/crossterm/latest/crossterm/macro.queue.html and https://docs.rs/crossterm/latest/crossterm/macro.execute.html
- Bun FFI (`bun:ffi`, `toArrayBuffer`): https://bun.sh/docs/api/ffi
