# letui

## High-level architecture  
(keep this picture in your head while you fill in the details later)

────────────────────────────────────────────────────────
        TypeScript / Bun (user space)
────────────────────────────────────────────────────────
App code
- Your clock, dashboards, games, etc.
- Pure JS logic; treats the screen as a 2-D array of cells.

TUI JS API (“Screen” class)
- Loads `libtui.*` over FFI.
- Maps the native framebuffer into a `BigUint64Array`.
- Provides helpers: `set_cell()`, `clear()`, `begin_frame()`, `end_frame()`,
  `set_style(idx, rgb…)`, `poll_event()`, `on_resize(cb)`.
- Never does any terminal I/O itself; that stays native.

Frame-authoring layer (optional)
- Higher-level helpers: widgets, layout, diff of logical → physical cells.
- Lives 100 % in JS; no performance burden on the Rust core.

────────────────────────────────────────────────────────
        Native core in Rust (`libtui`)
────────────────────────────────────────────────────────
0) FFI surface  
   – Thin `extern "C"` functions; **no logic here**.  
   – Exposes: init / deinit, width / height, generation, framebuffer pointer,
     set_style, begin_frame / end_frame, poll_event.

1) Terminal backend (crossterm)  
   – Switches to alt screen, raw mode, hides cursor.  
   – Restores everything on `deinit` or panic.  
   – Knows current capabilities (true-color, 256, 16).

2) Global state  
   – Two framebuffers (`Vec<u64>`): current & previous.  
   – Style table (256 entries, each pre-formats its SGR string).  
   – Resize generation counter.  
   – Small ring buffer for parsed input events.

3) Framebuffer manager  
   – Allocates buffers on `init` or resize (`SIGWINCH`).  
   – If resized: bump generation, update width/height, reallocate,
     leave previous buffer alive until JS remaps.

4) Renderer  
   – Runs inside `end_frame()`.  
   – Diffs row-by-row, groups consecutive cells with same style, writes
     “cursor move + cached SGR + run of UTF-8 bytes” per span.  
   – Streams into a large `BufferedWriter`, one flush at the end.  
   – Swaps `current` / `previous` pointers instead of copying.

5) Style & color manager  
   – On `set_style(idx, r, g, b, attrs)` regenerates the correct SGR
     string for the detected color mode.  
   – Keeps last-emitted SGR to avoid repeats in the renderer.

6) Input subsystem  
   – Non-blocking read on stdin within a tight poll loop or at each
     `end_frame()`.  
   – Parses keys (ASCII, arrows, Ctrl combinations).  
   – Pushes events into ring buffer; `poll_event()` pops one for JS.

7) Timing / throttling helper  
   – Optional: suppress redundant `end_frame()` calls that happen faster
     than terminal can accept (~100 µs budget each write).  
   – Lets you hit the “sub-8 ms from JS call → flush complete” goal when
     only a few cells change.

────────────────────────────────────────────────────────
              Runtime data flow
────────────────────────────────────────────────────────
1. JS mutates `BigUint64Array` cells.
2. JS calls `begin_frame()`   (no-op for now, placeholder for future fences).
3. JS calls `end_frame()`.
4. Rust renderer diffs, serializes ANSI, flushes to stdout (< 8 ms target).
5. Rust reads stdin, queues events.
6. JS pulls an event with `poll_event()`, processes it.
7. If terminal resized, Rust increments generation; on next JS tick
   `check_resize()` remaps the framebuffer.

Why this split works

- Only two transitions across the FFI boundary per frame (`end_frame` +
  any event polling) ⇒ negligible overhead.
- All heavy byte-pushing stays in Rust, right next to the OS write call.
- JS has a **zero-copy** view of screen memory, so drawing many cells is
  just typed-array writes—fast and garbage-free.
- Style table keeps each cell 64-bit yet still allows full 24-bit color.
- Generation counter lets you survive a terminal resize without UAF bugs.
- Crossterm abstracts termios/VT processing but we still emit raw ANSI
  for max performance.

That’s the whole mental model—flesh out each box incrementally, and you’ll
never drown in details.
