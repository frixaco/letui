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

### NPM publish notes:

1. push your changes
2. `git tag v0.0.1` - tag a commit
3. `git push origin v0.0.1` - push the tag
4. release action will build and deploy it as package
