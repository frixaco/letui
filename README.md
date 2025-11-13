# letui

TUI library written using Rust and TypeScript

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

- [ ] Try to optimizatize the shit out of the code
- [ ] Multiline support for Text and TextInput components
- [ ] Add logging and debugging utilities

## Goals

- Truecolor output (24-bit RGB) and Unicode text
- Sub-8ms input-to-render latency
- Widgets: text, list, button, borders, containers (row, column), input box and more
