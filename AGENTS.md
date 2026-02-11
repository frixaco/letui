# Project information

This is a TUI library written in Rust and TypeScript.
The core backend for the library is written in Rust for maximum performance.
The API/wrapper for the library is written in TypeScript for acccess to a wide ecosystem.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time in any practical use.

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

State management primitives, component API, diffing, number of optimizations are DONE.

Currently, following `./OPTIMIZATION_ROADMAP.md` to further optimize the library and

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, start from first principles
