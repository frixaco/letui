# Vertical Scrolling TODO

This is the execution sequence for [docs/vertical-scrolling-plan.md](/Users/frixa/Documents/letui/docs/vertical-scrolling-plan.md), grounded in the current codebase.

## Constraints From Current Code

- Keep scrolling as a style delta, not child slicing. The TS runtime rebuilds the Rust tree when node shape changes in [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts) via `hasSameNodeShape()` and `clear_tree_state()`, so generic scrolling must preserve child identity and tree shape.
- `Column` currently always maps to Taffy `Overflow::Hidden` on both axes in [core/src/tree.rs](/Users/frixa/Documents/letui/core/src/tree.rs). The plan keeps that behavior for non-scrollable columns.
- Current hit-testing is JS-side rectangle filling from layout frames in [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts). That will become wrong once paint-time scroll offsets diverge from layout frames, so the end state should be one Rust-owned hitmap rather than parallel JS and Rust hitmaps.
- Current surface drawing assumes non-negative coordinates in [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs) by casting `f32` positions directly to `u16`. Scroll offsets will produce negative child paint coordinates, so clip/surface hardening must happen before or together with scroll paint work.

## Task Sequence

1. [x] Enable Taffy `content_size` in Rust.
Why this task exists:
- [core/Cargo.toml](/Users/frixa/Documents/letui/core/Cargo.toml) currently enables `std`, `taffy_tree`, `flexbox`, `grid`, and `block_layout`, but not `content_size`.
- The plan now depends on `Layout::content_size` and `Layout::scroll_height()` for clamp logic.
Files:
- [core/Cargo.toml](/Users/frixa/Documents/letui/core/Cargo.toml)
Done when:
- `taffy` builds with the `content_size` feature enabled.

2. [x] Add `Column`-only public props in TypeScript without widening `Row`.
Why this task exists:
- Public types currently expose only `BoxProps` in [src/types.ts](/Users/frixa/Documents/letui/src/types.ts).
- `Column()` and `Row()` are just wrappers over `Box()` in [src/components.ts](/Users/frixa/Documents/letui/src/components.ts), so the public type split must happen at the constructor boundary.
Files:
- [src/types.ts](/Users/frixa/Documents/letui/src/types.ts)
- [src/components.ts](/Users/frixa/Documents/letui/src/components.ts)
Work:
- Add `Overflow = boolean | "scroll"`.
- Add `ColumnProps = Omit<BoxProps, "direction"> & { overflow?: Overflow; scrollTop?: number }`.
- Keep `Row` typed as plain `Omit<BoxProps, "direction">`.
- Update `Column()` to accept `ColumnProps`.
- Keep `Box()` internal if needed, but do not expose `overflow` / `scrollTop` through `Row`.
Done when:
- User code can pass `overflow` / `scrollTop` to `Column()` and not to `Row()` without type assertions.

3. [x] Thread `overflow` and `scrollTop` through the existing TS style signal and diff pipeline.
Why this task exists:
- `createStyleSignals()` / `createBoxSignals()` in [src/components.ts](/Users/frixa/Documents/letui/src/components.ts) are the source of reactive style state.
- The binary style-op names live in [src/ops.ts](/Users/frixa/Documents/letui/src/ops.ts).
- The sent-style snapshot and diff logic live in `readSentStyleState()`, `queueFullTreeInsert()`, and `syncNodeStyle()` in [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts).
Files:
- [src/types.ts](/Users/frixa/Documents/letui/src/types.ts)
- [src/components.ts](/Users/frixa/Documents/letui/src/components.ts)
- [src/ops.ts](/Users/frixa/Documents/letui/src/ops.ts)
- [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts)
Work:
- Add internal signals for `overflow` and `scrollTop`.
- Add `"overflow"` and `"scrollTop"` to `StylePropName` and `EMITTED_STYLE_PROPS`.
- In `readSentStyleState()`, emit `overflow` only for `Column` nodes.
- Normalize `overflow: true` to `"scroll"` before sending style ops.
- Emit `scrollTop` as a normal style value so updates stay on the diff path and do not rebuild the tree.
Done when:
- Changing `column.setStyle({ scrollTop })` produces only style ops, not a shape reset.

4. [x] Extend Rust style decoding and node style state for vertical scrolling.
Why this task exists:
- All style parsing and application currently happens in [core/src/tree.rs](/Users/frixa/Documents/letui/core/src/tree.rs): `StyleProp`, `StyleProp::parse()`, `apply_style()`, `NodeStyle`, and `node_context_to_taffy_style()`.
- There is no Rust-side representation yet for scrollability or scroll offset.
Files:
- [core/src/tree.rs](/Users/frixa/Documents/letui/core/src/tree.rs)
Work:
- Add Rust style props for `overflow` and `scrollTop`.
- Add node-style fields for resolved column overflow state and requested `scroll_top`.
- Parse `"scroll"` as the only public overflow string.
- Keep non-scrollable `Column` at `Hidden/Hidden`.
- Map scrollable `Column` to `x: Clip`, `y: Scroll`.
- Set `scrollbar_width` to `0.0`.
- Keep `Row`, `Text`, `Button`, and `Input` unchanged.
Done when:
- Rust accepts the new style ops and Taffy style generation becomes data-driven instead of hardcoded `Hidden/Hidden` for every column.

5. [x] Harden `SurfaceRect` and drawing helpers for clipped and negative coordinates.
Why this task exists:
- Scrolled children will paint above the viewport, producing negative `y`.
- Current code casts directly to `u16` in [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs): `draw_text()`, `draw_cursor()`, `fill_bounds()`, and `border_bounds()`.
- If this is not fixed first, scroll offsets will wrap negative coordinates into huge unsigned values.
Files:
- [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs)
Work:
- Add `SurfaceRect` helpers for intersection, emptiness, and safe clipping to terminal bounds.
- Make bounds calculations handle negative coordinates explicitly.
- Either add clipped drawing helpers or ensure every callsite passes already-clipped rects.
- Make cursor drawing safe under clipping as well.
Done when:
- Drawing code can receive partially or fully off-screen rects without unsigned wraparound or bogus writes.

6. [x] Implement paint-time scroll offset and clip propagation in the Rust renderer.
Why this task exists:
- Rendering currently paints recursively from layout rectangles only in `paint_taffy_node()` in [core/src/render.rs](/Users/frixa/Documents/letui/core/src/render.rs).
- Child paint currently inherits only `surface_rect`; there is no clip rect and no scroll offset state.
Files:
- [core/src/render.rs](/Users/frixa/Documents/letui/core/src/render.rs)
- [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs)
Work:
- Add clip rect threading through `paint_taffy_node()`.
- Intersect scrollable child paint with the container content box.
- Sanitize `scrollTop` in Rust: non-finite -> `0`, clamp to `layout.scroll_height()`, floor to whole rows.
- Apply the vertical offset only when painting children of a scrollable column.
- Keep layout frames unchanged; scrolling is paint-only.
- Skip painting early when the clip rect is empty.
Done when:
- Scrolling changes what is visible without changing Taffy layout positions or JS tree shape.

7. [x] Replace the JS hitmap with Rust-owned hitmap storage and exports.
Why this task exists:
- Current hit-testing in [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts) uses layout frames, which will diverge from painted visibility after scrolling.
- Shared render buffers are managed in [core/src/shared.rs](/Users/frixa/Documents/letui/core/src/shared.rs), but there is no hitmap buffer yet.
- FFI exports currently include frames but not hitmap in [src/ffi.ts](/Users/frixa/Documents/letui/src/ffi.ts) and [core/src/render.rs](/Users/frixa/Documents/letui/core/src/render.rs).
Files:
- [core/src/shared.rs](/Users/frixa/Documents/letui/core/src/shared.rs)
- [core/src/render.rs](/Users/frixa/Documents/letui/core/src/render.rs)
- [src/ffi.ts](/Users/frixa/Documents/letui/src/ffi.ts)
Work:
- Add a shared `Vec<u32>` hitmap buffer sized to terminal cells.
- Clear/rebuild it each render.
- Export `get_hitmap_ptr()` and `get_hitmap_len()`.
- Populate it in paint order so later painted nodes win overlaps.
- Fill the clipped visible interactive frame rect, not just text glyph cells, for `Button` and `Input`.
Done when:
- Rust exposes the only authoritative cell-addressable node-id map for the visible frame.

8. [x] Switch the TS runtime from layout-rect hit-testing to Rust hitmap lookups.
Why this task exists:
- `updateNodeFrames()` in [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts) currently both updates measured frames and fills `spatialLookup` from raw frame rectangles.
- We still need frame syncing for `frameWidth()` / `frameHeight()`, but hit-testing must come from Rust.
Files:
- [src/runtime.ts](/Users/frixa/Documents/letui/src/runtime.ts)
- [src/ffi.ts](/Users/frixa/Documents/letui/src/ffi.ts)
Work:
- Keep frame syncing from `get_frames_ptr()` / `get_frames_len()`.
- Remove `markInteractiveHitArea()` and stop maintaining JS-owned hit areas from layout frames.
- Read the Rust hitmap after each render and use it in `getNodeAt()`.
- Keep `nodeRegistry` population as-is so ids can still resolve back to TS nodes.
- Make resize handling recreate any JS-side hitmap view assumptions.
Done when:
- Clicking visible scrolled content targets the painted node, clipped-out content is not clickable, and Rust is the only hitmap authority.

9. [x] Update the example to exercise real scrolling without tree-windowing.
Why this task exists:
- [examples/anitrack.ts](/Users/frixa/Documents/letui/examples/anitrack.ts) currently uses measured row heights plus `visibleWindow()` and `setVisibleButtons()` to mount only a slice of rows.
- That pattern is useful for future virtualization, but it is the wrong verification path for generic scrolling.
Files:
- [examples/anitrack.ts](/Users/frixa/Documents/letui/examples/anitrack.ts)
Work:
- Remove manual visible-window slicing.
- Mount the full result list under a scrollable outer `Column`.
- Drive `scrollTop` directly for testing vertical scroll behavior.
- Do not spend time polishing active-state-following yet; keep the example focused on scrolling.
Done when:
- The example is a direct vertical-scrolling playground instead of a virtualization demo.

10. [x] Update library docs to match the shipped API and behavior.
Why this task exists:
- The plan changes public API and runtime behavior, but existing docs do not describe `Column`-only scrolling yet.
Files:
- [README.md](/Users/frixa/Documents/letui/README.md)
- [docs/components-and-styling.md](/Users/frixa/Documents/letui/docs/components-and-styling.md)
- [docs/state-events-lifecycle.md](/Users/frixa/Documents/letui/docs/state-events-lifecycle.md)
- [docs/vertical-scrolling-plan.md](/Users/frixa/Documents/letui/docs/vertical-scrolling-plan.md) if implementation details need reconciliation
Work:
- Document `Column({ overflow: true | "scroll", scrollTop })`.
- Call out that scrolling is vertical-only and `Column`-only.
- Call out that v1 is scrolling, not virtualization.
- Document that Rust is the final clamp/hit-test authority.
Done when:
- Public docs match actual behavior and limitations.

11. [x] Add focused regression coverage for the new Rust-side behavior.
Why this task exists:
- The fragile parts of this feature are geometric and renderer-owned, not TS prop wiring.
- [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs) already contains Rust tests, so it is the natural home for clip/rect coverage.
Files:
- [core/src/surface.rs](/Users/frixa/Documents/letui/core/src/surface.rs)
- [core/src/render.rs](/Users/frixa/Documents/letui/core/src/render.rs) or nearby test modules if added
- [core/src/tree.rs](/Users/frixa/Documents/letui/core/src/tree.rs) if clamp/sanitize helpers live there
Work:
- Add tests for rect intersection / clipping with negative coordinates.
- Add tests for `scrollTop` sanitization and clamp logic.
- Add tests for paint skipping on empty clip rect.
- Add tests for hitmap overwrite order if practical.
Done when:
- The main failure modes of scroll geometry are covered by Rust tests.

12. [x] Run repo verification and manual TUI checks.
Commands:
- `bun run typecheck`
- `cargo test --manifest-path core/Cargo.toml`
- `bun run build-ffi`
- `bun run anitrack`
Manual checks:
- Content shorter than viewport.
- Content taller than viewport.
- `scrollTop = 0`.
- Oversized `scrollTop` clamps correctly.
- Borders and padding render correctly.
- Partially visible top/bottom rows clip cleanly.
- Click/Enter work on visible interactive nodes.
- Clipped-out nodes are not clickable.
- Terminal resize keeps rendering and hit-testing sane.

Status:
- `bun run typecheck` passed.
- `cargo test --manifest-path core/Cargo.toml` passed with the new scroll geometry tests.
- `bun run build-ffi` passed.
- `bun run examples/anitrack.ts` launched successfully and exited cleanly via `Ctrl+Q`.
