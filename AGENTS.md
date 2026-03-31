# Project information

This is a TUI library written in Rust and TypeScript.
The core backend for the library is written in Rust for maximum performance.
The API/wrapper for the library is written in TypeScript for acccess to a wide ecosystem.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Keep <1ms average response time for each render.

## Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

## Status

State management primitives, component API, diffing, number of optimizations are DONE.

# General

- Prefer explaining concepts and building mental models over copy-paste code
- Pseudo-code preferred unless actual code is requested
- When explaining, reason from first principles

# File structure

Structure each source file top-down — most important code first:

1. **Module doc** — one-liner purpose + data flow diagram (if non-trivial)
2. **Public API** — exported functions first
3. **Request/Result types** — types the caller constructs or receives
4. **Internal state / accumulator types** — structs that hold state during computation
5. **Internal algorithm** — private functions implementing the logic
6. **Supporting/lower-level types** — internal data structures
7. **Helpers** — small utility functions

# Testing

Manual TUI testing:

- Start app: `bun run dev`
- Validate behavior interactively in terminal
- Quit with `q` or `Ctrl+Q`

# Dump directory

- `dump/` is for dump logs, metrics, screenshots, screen captures, and similar debug artifacts
- `dump/` is tracked; it may be used for debugging and verification
- If a task does not explicitly involve `dump/`, ignore it rather than cleaning it up and reverting changes in it
