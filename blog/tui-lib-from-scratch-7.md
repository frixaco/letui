---
title: "Building a TUI Library from scratch: Part 7"
description: "Text/style diff sync architecture, wrapping fixes, and docs+demos built on top"
date: "2026-02-21T16:00:00"
---

## Building a TUI Library from Scratch: Part 7 - Text Diffs, Style Registry, and Real Demos

#### Things I learned:

- Sending less over FFI usually beats micro-optimizing local code
- Smaller protocols need stricter validation or they fail in weird ways
- If demos are painful to build, architecture still has problems

After `v0.0.11`, I focused on one thing: stop sending all text every frame.

This part is mostly that migration plus style sync changes.

#### Cleanup before migration

I did quick cleanup first:

- proper terminal deinit (`disable_raw_mode` + leave alt screen)
- quit-path cleanup
- safer flush paths for zero-size terminals

I also fixed p99 calculation in metrics to use interpolation instead of rough indexing:

```typescript
function percentile(sorted: number[], p: number): number {
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower);
}
```

This made comparison across runs more trustworthy.

#### Text registry migration

Old flow:
- TS serialized full `textData`
- `paint()` received full text payload every frame

New flow:

- Rust keeps `TEXT_REGISTRY: HashMap<u32, String>` keyed by node id
- TS computes text diffs (upsert/delete) per frame
- text diffs sync separately
- `paint()` reads text from registry

First implementation used per-node FFI calls (`upsert_text`/`delete_text`).
Worked, but too many calls.

Then I switched to batched ops with one `sync_text_ops` call per frame:

- `op (u8)`
- `node_id (u32 LE)`
- `text_len (u32 LE)`
- `text bytes` for upserts

Rust applies all ops under one registry lock.

```rust
match op {
    TEXT_OP_UPSERT => registry.insert(node_id, text),
    TEXT_OP_DELETE => registry.remove(&node_id),
    _ => return 0,
}
```

Main result: text transfer scales with changed nodes, not total text nodes.

#### Metrics during transition

During transition, some snapshots got worse before they got better (`~0.9ms` avg vs older `~0.5ms` samples).

Expected reasons:
- extra JS work to build ops payload
- several architectural changes landed in same window

Later snapshots in this period were around `~0.7ms` avg.
Not a straight line, but direction was correct.

#### Short test-driver experiment

I added a Unix socket test driver (`ping`, `sleep`, `key`, `mouse`, `focused`, `snapshot`, `quit`) to script interactions.

It was useful for quick black-box checks, but I later removed it in cleanup while simplifying runtime and examples.

#### Style sync architecture rewrite

Next bottleneck: style payload duplication.

Before:
- each node carried full style payload inline in serialized node data

After:
- node payload shrank to 4 fields (`nodeType`, `childCount`, `nodeId`, `styleId`)
- style moved to Rust-side `STYLE_REGISTRY`
- TS computes style snapshots and sends style diffs via `sync_style_ops`

This introduced explicit schema files (`style_schema.rs`, `src/style-schema.ts`) and unlocked broader style support:

- `margin`, `rowGap`, `columnGap`
- `flexShrink`, `flexBasis`
- `justifyContent`, `alignItems`, `alignSelf`
- `min/max width/height`
- `overflow`, `overflowX`, `overflowY`

#### Wrapping and clipping fixes

I also fixed text wrapping and clipping behavior in Rust.

Problems were:
- naive text measurement for wrapping/newlines
- draw path not clipping correctly in nested overflow scenarios

Key changes:

- wrapped text measurement in Rust (`measure_wrapped_text`)
- draw/cursor functions aware of content box width/height
- clip-rect propagation down the tree with overflow-aware intersection

That improved:

- long text behavior
- input cursor placement in wrapped content
- nested container clipping correctness

#### Demos and docs

After those engine changes, I built more demos and proper docs:

- demos: `ai-agent`, `mission-control`, `visualizer`
- docs: getting started, components/styling, state/events/lifecycle, troubleshooting

It was a good validation pass because these examples touched many edge cases at once.

#### End of part 7

By end of this phase:
- Rust owns terminal-critical rendering paths
- TS sends text/style diffs instead of full payloads
- text and style have separate sync paths
- wrapping/clipping behavior is much more predictable

Next for me: scroll containers, richer text primitives, and more tail-latency cleanup on heavier scenes.
