# Project information

This is a fast, simple and minimal TUI library written in Rust and TypeScript.

The core backend for the library is written in Rust for maximum performance.

The API/wrapper for the library is written in TypeScript for wide ecosystem and developer friendliness.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time in any practical use.

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

Everything is mostly implemented and working (component API, buffer update, separate layout and painting process, mouse and keyboard events, input and button.

Next tasks:

- Be able to update children nodes while TUI is running - dynamic layout updates
- Implement following TUI app:
  - header with Input and Button
  - footer with two Buttons
  - main section spanning max available space and renders items
  - user can type into Input and press Enter or click Button next to it which runs async request and fetches list of items
  - main section is then updated with those items, only part of the results will be visible
  - two Buttons in the footer will be used for navigating "page" of results in main section

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, do it from first principles
- Include some sarcasm here and there. Don't go overboard, keep sarcasm minimal.
