# Optimization Roadmap

## Priority 0: Quick Wins (First Frame Latency)

- [x] Skip diff on first flush in Rust, write all cells directly
  - What does the first `flush()` compare against? Why does every cell "differ"?
  - How would you detect it's the first flush? A static flag? Reset when?
  - Does skipping the diff actually reduce work, or just avoid the comparison?

- [x] Minimize escape sequences on first flush (row-based cursor, color caching)
  - How many `MoveTo` calls happen today per frame? How many are truly needed?
  - When do fg/bg colors actually change vs repeat? Can you track "last emitted" color?
  - What's the cost of a `queue!` macro invocation vs building a string buffer?

## Priority 1: Medium Effort

- [ ] Remove redundant `api.flush()` calls from event handlers in `components.ts`
  - Where are `api.flush()` calls currently happening? Which ones trigger a full render?
  - What is the call stack when an event fires? Does it already end with a flush somewhere?
  - Could you batch multiple events into a single flush? When is the "right" moment to flush?

## Priority 2: Larger Effort

- [x] Replace JSON serialization with binary layout protocol (`Float32Array`)
  - What data are you currently serializing? What are the fixed fields vs variable-length fields?
  - How would you handle variable-length data (like text) in a binary layout?
  - What endianness does Bun FFI expect? How do `TypedArray` views share an `ArrayBuffer`?
  - How do you currently read the data on the Rust side? What would change?

- [ ] Keep Taffy tree persistent in Rust, update incrementally
  - What triggers a full tree rebuild today? What information do you need to avoid it?
  - How does Taffy identify nodes internally? How would you correlate TS nodes to Taffy nodes?
  - What operations does Taffy expose for modifying an existing tree (add/remove/reparent)?
  - When a node's style changes, what's the minimal Taffy API call needed?

## Priority 3: Fine-Grained Reactivity

- [ ] Persist node tree across frames (call `nodeFactory` once at startup)
  - Where is `nodeFactory` called today? What causes it to be called again?
  - What state lives inside a node that must survive across frames?
  - How would you "mount" vs "update" a component?

- [ ] Add dirty tracking sets for layout and paint nodes
  - What changes require re-layout? What changes only require repaint?
  - How would a node mark itself dirty? Who clears the dirty flag and when?
  - Should dirty sets be global or per-subtree?

- [ ] Implement central scheduler with `queueMicrotask`
  - When do you want the scheduler to run—before or after the current event finishes?
  - What's the difference between `queueMicrotask`, `setTimeout(0)`, and `requestAnimationFrame`?
  - How do you prevent multiple flushes if several signals change in the same tick?

- [ ] Set up per-node reactive bindings for text/focus changes
  - How do signals currently propagate changes? What callback runs when a signal updates?
  - Could you subscribe a node to only the signals it reads during render?
  - How would you unsubscribe when a node is removed?

- [ ] Add stable node IDs and ID→NodeId map in Rust
  - Where should the ID be generated—TS or Rust? What guarantees uniqueness?
  - What data structure gives O(1) lookup by ID on the Rust side?
  - How do you handle ID reuse if nodes are destroyed and recreated?

- [ ] Implement incremental FFI functions (`update_node_text`, `update_node_style`)
  - What's the minimal payload for each update type?
  - How does Rust locate the node to update? By index, pointer, or ID?
  - Can you batch multiple updates into one FFI call, or is per-node cheaper?

- [ ] Implement `recompute_layout` without full tree rebuild
  - What does Taffy's `compute_layout` do internally? Does it cache subtree results?
  - If only one node changed, which ancestors need re-layout?
  - Does Taffy expose a "mark dirty" API, or do you need to track it yourself?

- [ ] Pack cell representation: one `u64` per cell with codepoint + RGB colors
  - How many bits do you need for a Unicode codepoint? For RGB fg and bg?
  - How would you encode/decode with bit shifts and masks?
  - Does Bun's `BigUint64Array` have alignment requirements? What about endianness?
