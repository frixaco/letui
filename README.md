# letui

A minimal TUI renderer using Rust (crossterm) + Bun FFI.

## Goals

- Truecolor output (24-bit RGB) and Unicode text
- Sub-8ms input-to-render latency
- Widgets: text, list, button, borders, containers (row, column) and more
- Minimal API over Bun FFI. No new dependencies beyond crossterm.
