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

Structure each source file for **learning flow** — a stranger should be able to read top-down and build understanding progressively.

1. **Module doc** — one-liner purpose + data flow diagram (if non-trivial)
2. **Primary abstraction** — the main exported class or function that embodies what the module does. Include its public methods inline so readers see the full API at once.
3. **Domain vocabulary** — enums, types that define operation names/payloads. Pairs naturally with the primary abstraction.
4. **Core algorithm** — functions that transform data (encode, decode, diff, etc.)
5. **Binary layout** — size constants, magic numbers, format specifications
6. **Supporting types** — Request/Result types, style types, other domain-specific types
7. **Internal state** — accumulators, intermediate structures used during computation
8. **Helpers** — small utility functions, singletons (TextEncoder, etc.)

# Testing

Manual TUI testing:

- Start app: `bun run dev`
- Validate behavior interactively in terminal
- Quit with `q` or `Ctrl+Q`

# Dump directory

- `dump/` is for dump logs, metrics, screenshots, screen captures, and similar debug artifacts
- `dump/` is tracked; it may be used for debugging and verification
- If a task does not explicitly involve `dump/`, ignore it rather than cleaning it up and reverting changes in it
