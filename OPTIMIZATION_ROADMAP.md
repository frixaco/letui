# Optimization Roadmap

## Completed ✅

- [x] **Skip diff on first flush** — `FIRST_DIFF` flag writes rows directly without cell comparison
- [x] **Minimize escape sequences on first flush** — row-based `MoveTo`, color caching with `prev_fg`/`prev_bg`, batched character sequences
- [x] **Remove redundant `api.flush()` calls** — single `flush()` per frame in `ff()` callback
- [x] **Binary layout protocol** — `Float32Array` for nodes, `Uint8Array` for text, no JSON parsing

## Priority 1: Persistent Layout Tree

Essential for both static and dynamic UIs. Currently `calculate_layout` rebuilds the entire Taffy tree every frame.

- [ ] **Add stable node IDs and ID→NodeId map in Rust**
  - Generate IDs in TS (already have `node.id`), pass to Rust
  - Use `HashMap<String, NodeId>` for O(1) lookup
  - Required foundation for all incremental updates

- [ ] **Keep Taffy tree persistent in Rust**
  - Store `TaffyTree` in a static `Mutex` like the buffers
  - First call builds tree, subsequent calls update existing nodes
  - Use `taffy.set_style()` for style changes, `mark_dirty()` for recompute

- [ ] **Implement incremental FFI functions**
  - `update_node_text(id, text)` — update text without full serialize
  - `update_node_style(id, style_fields)` — partial style updates
  - `add_node(parent_id, node_data)` / `remove_node(id)` for dynamic children

## Priority 2: High-Churn Optimization (htop-level)

Only relevant for UIs with many elements updating at 60+ FPS.

- [ ] **Pack cell representation: one `u64` per cell**
  - Layout: `[codepoint: 21 bits][fg_r: 8][fg_g: 8][fg_b: 8][bg_r: 8][bg_g: 8][bg_b: 8][unused: 3]`
  - Reduces buffer from 240KB to 80KB for 200x50 terminal
  - Encode/decode with bit shifts in both TS and Rust

- [ ] **Smart diff-path batching**
  - Current diff path: per-cell `MoveTo` + colors + print (expensive for scattered updates)
  - Detect "high churn" frames (>N cells changed)
  - Switch to row-scan strategy: batch same-color runs like first-frame path
  - Threshold TBD via profiling (~100-500 cells)

- [ ] **Persist node tree in TS (`nodeFactory` once at startup)**
  - Currently `nodeFactory(tw, th)` runs every frame
  - For static layouts, call once and update text signals in-place
  - Requires distinguishing "mount" vs "update" lifecycle

## Not Worth Pursuing ❌

- **Per-node reactive bindings** — current `ff()` effect already batches signal updates efficiently
- **Dirty tracking sets for layout/paint** — Rust cell-diff handles repaint; layout changes are infrequent
- **`recompute_layout` partial rebuild** — only valuable after persistent Taffy tree is working; Taffy's internal caching may handle this automatically

## Profiling Checkpoints

Before implementing Priority 2, measure:

1. Time spent in `calculate_layout` vs `flush` vs TS paint logic
2. Number of cells changing per frame in target demo
3. Terminal I/O saturation (bytes written per frame)

Use `metrics.ts` to capture per-phase timing.
