# Project information

This is a simple and minimal TUI library written in Rust and TypeScript.
The core backend for the library is written in Rust for maximum performance.
The API/wrapper for the library is written in TypeScript for wide ecosystem and developer friendliness.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time in any practical use.

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

Following are considered implemented and working;

- component API
- state management based on signals
- buffer update with diffing
- separate layout and painting process
- mouse and keyboard events support
- clipping for containers
- multiline for text

Confirmed possible:

- update children nodes while TUI is running - dynamic layout updates

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, do it from first principles
