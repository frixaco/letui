# Refactor Plan

## Stage 0 — Establish Baseline

1. Issue: `index.ts` hides how TypeScript talks to Rust, which makes every edit risky. Fix: move all Bun FFI setup into `src/runtime/ffi.ts` so UI code only sees stable helper functions.
   - Copy the `dlopen`, `init_buffer`, `flush`, `update_terminal_size`, and related logic into the new file with clear exports.
   - Create a simple `RuntimeContext` object that stores buffer pointers, terminal size, and init state in one place.
   - Replace the global calls inside `index.ts` with imports from the new module and check that no other file touches raw FFI functions.

2. Issue: The project has no written record of how data flows between Rust and TypeScript. Fix: write a short doc in `docs/runtime.md` that lists buffer layout (3 `u64` values per cell), color encoding, and expected init/deinit order.
   - Describe the steps `init_letui -> init_buffer -> render -> flush -> deinit`.
   - Document the resize path and note the maximum buffer size so future changes stay inside bounds.
   - Update README with a link to the new doc so you can actually find it later.

## Stage 1 — Harden the Rust Backend

3. Issue: `letui-ffi/src/lib.rs` relies on raw mutexes and `unwrap()` everywhere, so one failure leaves the terminal in a broken state. Fix: wrap all shared state inside a struct and return explicit error codes.
   - Create a `RendererState` struct that owns the buffers and terminal size; implement `init`, `resize`, `diff_and_flush`, and `teardown`.
   - Replace every `unwrap()` with `match` blocks that return `0` on failure and log to stderr for debugging.
   - Ensure `deinit_letui` resets colors, disables raw mode, and releases buffers even when `flush` fails.

4. Issue: Terminal resize is only half-supported and ignores width/height changes until something else triggers a redraw. Fix: expose a `resize` function that TypeScript must call and make `flush` read the fresh size.
   - Update `update_terminal_size` to call the struct method and refresh both buffers.
   - Add a new FFI export `needs_resize` that TypeScript can poll and respond to by asking the layout engine to recalc.
   - In the Rust diff loop, clamp row/column indices to the latest width and height to avoid out-of-bounds writes.

## Stage 2 — Split TypeScript Responsibilities

5. Issue: Rendering, layout, events, and components all live in `index.ts`, so any tweak turns into a search-and-destroy mission. Fix: split the file into `src/runtime`, `src/layout`, `src/components`, and `src/demo`.
   - Move the current demo usage into `src/demo/basic.ts` so the library code stays clean.
   - Create a `Component` base class in `src/components/component.ts` that holds props, state, and lifecycle hooks.
   - Export a single entry point from `src/index.ts` that re-exports public APIs: `createView`, `Button`, `Input`, etc.

6. Issue: Layout math is duplicated across `View`, `Row`, `Column`, and `Text`, which makes spacing bugs inevitable. Fix: build a shared layout helper that takes parent bounds and child constraints.
   - Implement `computeLayout(tree, containerSize)` that returns rectangles for every node.
   - Store layout metadata on each component instance so renderers use it without recomputing.
   - Include options for padding, margin, alignment, and minimum sizes, but skip flex-box overkill.

## Stage 3 — Hybrid Immediate + Rust Scene Graph

7. Issue: Directly mutating the shared buffer from TypeScript wastes time and forces full redraws. Fix: implement the Rust-owned scene graph and command protocol described in `DESIGN_SCENE_GRAPH.md`.
   - Add FFI bindings for `apply_commands`, `resize`, and `frame_stats` so TypeScript can stream batched scene updates.
   - Build the Rust-side `SceneGraph` with node storage, command processing, and cell diffing before flush.
   - Replace raw buffer writes in TypeScript with scene commands (text, rect, border) emitted per component.

8. Issue: Immediate-mode rendering without retention makes it impossible to skip unchanged UI regions. Fix: wire in the retained state machine that tracks component-level dirty flags (see `DESIGN_SCENE_GRAPH.md`).
   - Create a `StateMachine` helper that stores component state, marks dirty bits, and exposes `consumeDirty()` each frame.
   - Update the immediate-mode DSL so components pull their state from the state machine and emit only the dirty commands.
   - Ensure the scheduler requests a new frame only when `dirty.consume()` returns work or when a forced redraw is required (resize, theme change).

## Stage 4 — Event Handling and State

9. Issue: Mouse and keyboard events use global maps and raw escape codes, making them impossible to extend. Fix: centralize event parsing and dispatch in `src/runtime/events.ts`.
   - Parse data from `process.stdin` once, detect mouse vs keyboard vs resize, and emit clean event objects.
   - Keep a registry mapping component ids to handlers; components subscribe during `mount` and unsubscribe during `unmount`.
   - Support focus tracking so keyboard events go to the focused component by default.

10. Issue: Components mutate their own state and re-render instantly, which makes coordinated updates brittle. Fix: implement `setState` with batching.
    - Store state in a simple map keyed by component id.
    - Let `setState` queue an update via the renderer service so multiple changes coalesce into one frame.
    - Update `Button`, `Input`, and future components to use `props` for incoming data and `setState` for internal changes.

## Stage 5 — Tooling and Confidence

11. Issue: There are zero tests, so regressions sneak in unnoticed. Fix: add Bun tests for layout math and renderer diffing.
    - Write unit tests under `tests/layout.test.ts` that feed sample trees into `computeLayout` and snapshot the rectangles.
    - Add a renderer test that feeds fake component data and confirms only changed cells trigger flush calls.
    - Integrate `bun test` into a simple `bun run check` script that also runs `cargo clippy` on the Rust side.

12. Issue: Debugging requires rewriting `logs.txt` by hand. Fix: add lightweight logging controls and profiling hooks.
    - Provide a `Logger` utility that writes to stderr with log levels controlled by an env variable.
    - Expose timing helpers around `renderFrame` so you can measure latency against the 8 ms target.
    - Document how to enable logging or profiling in the README so you do not have to reverse-engineer your own project later.

## Stage 6 — Demo Refresh

13. Issue: The current demo fetches remote data and rebuilds everything, which hides layout issues and hammers the terminal. Fix: rewrite the demo to show common interactions without network calls.
    - Build a static list view with scrolling, a form with validation, and a simple status bar to exercise layout and events.
    - Add comments pointing to the library API so readers can follow the flow without digging through code.
    - Keep the fetch example in a separate demo file that uses the new scheduler, proving that async workloads remain smooth.
