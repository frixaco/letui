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

# Recent architecture updates (post `v0.0.11`)

- Text no longer sent as full payload during `paint()`
- TypeScript runtime computes text diffs and batches ops
- Rust applies batched ops via `sync_text_ops` into `TEXT_REGISTRY` keyed by node id
- Metrics include dedicated `textSync` phase and op/byte counters

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, start from first principles

# Testing

Use socket driver for fast/manual and automated checks:

- Interactive local testing (stdin enabled, can quit with `q` / `Ctrl+Q`):
  - `bun run test:socket`
- Headless automation (stdin disabled; drive only via socket commands):
  - `bun run test:socket:headless`
- Send commands to running socket app:
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"ping"}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"sleep","ms":50}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"key","data":"jigokuraku"}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"key","data":"\r"}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"mouse","kind":"click","x":6,"y":3}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"focused"}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"snapshot"}'`
  - `bun scripts/test-driver-client.ts /tmp/letui.sock '{"cmd":"quit"}'`
