# letui

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

Simple TUI library written using Rust and TypeScript

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

- [ ] Hover support
- [ ] Try to optimizatize the shit out of everything
- [ ] Add logging and debugging utilities
- [ ] Improve overall architecture ("make it work" is done, now "make it right, make it fast" is left)
- [ ] Refactor flush function with BatchWriter pattern to reduce nesting
  - BatchWriter struct holds stdout ref, char_seq, batch_start_x/y, prev_fg/bg
  - `new()` initializes with sentinel colors (u64::MAX) to force first color emit
  - `push(x, y, ch, fg, bg)` handles gap detection, color changes, and accumulates chars
  - `flush_pending()` emits MoveTo + Print for accumulated batch
  - Encapsulates all batching logic, main loop just calls push() for changed cells
- [ ] Add scrollable containers
- [ ] Add performance stats overlay that update independently from rest of the app (can i use a separate thread?)
- [ ] Add `flexGrow` support for dynamic width components (e.g., progress bars)
  - **TypeScript side:**
    - Add `flexGrow?: number` to `StyleProps` in `types.ts`
    - Update `createStyleSignals()` in `components.ts` to include `flexGrow: $(input.flexGrow)`
    - Update serialization in `runtime.ts` to pass `flexGrow` value to Rust (add to `FIELDS_PER_NODE`)
  - **Rust side:**
    - Increment `FIELDS_PER_NODE` from 12 to 13 in `lib.rs`
    - Add `flex_grow: f32` field to `Node` struct
    - Parse `flex_grow` in `parse_node()` function
    - Apply `style.flex_grow = node.flex_grow` in `get_styles()` for all node types
  - **Progress bar update:**
    - Remove fixed `width` prop from `ProgressBar`
    - Instead of `" ".repeat(n)`, use a single space `" "` for text
    - Set `flexGrow: progress / 100` on filled node, `flexGrow: (100 - progress) / 100` on unfilled node
    - Layout engine distributes space proportionally - bar auto-sizes to container
  - **Benefits:** No fixed width needed, bar fills available space, cleaner API

### NPM publish notes:

1. push your changes
2. `git tag v0.0.1` - tag a commit
3. `git push origin v0.0.1` - push the tag
4. release action will build and deploy it as package
