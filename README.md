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
- [ ] Add scrollable containers
- [ ] Add performance stats overlay that update independently from rest of the app (can i use a separate thread?)

### NPM publish notes:

1. push your changes
2. `git tag v0.0.1` - tag a commit
3. `git push origin v0.0.1` - push the tag
4. release action will build and deploy it as package
