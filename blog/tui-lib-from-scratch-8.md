---
title: "Building a TUI Library from scratch: Part 8"
description: "Unifying text, style, and tree sync behind a single ops queue architecture"
date: "2026-03-20T22:00:00"
---

## Building a TUI Library from Scratch: Part 8 - The Ops Queue Architecture

#### Things I learned:

- Borrowing patterns from unrelated domains can come in very handy and save hours of time, be generalist!
- Find the abstraction that unifies similar things and half your code disappears along with the complexity

By `v0.0.11`, I had three separate sync paths: text diffs, style diffs, and full tree rebuilds. Each had its own FFI signature, its own serialization format, and its own edge cases. It worked, but adding features meant adding sync paths. That did not scale.

Time to unify everything behind one ops queue.

#### The problem with split sync

Text and style were already diff-based. But the node tree? Still full rebuilds every frame. TS serialized the entire tree, sent it over FFI, and Rust rebuilt its internal representation from scratch.

For small trees this was fine. For larger scenes, the serialization cost dominated the profile. Worse, the three paths had different failure modes: text could desync from nodes, styles could reference deleted node IDs, and tree rebuilds could lose focus state.

I needed one protocol that could express all mutations: text changes, style changes, and tree changes.

#### Where the idea came from

The ops format is borrowed from somewhere unexpected: MKV (Matroska) container files. I was working on a side project writing an MKV parser, and Matroska uses a simple `[id][size][data]` structure for every element. Variable-length integers (VINT) keep it compact, and the format is self-describing enough to skip unknown elements without parsing them.

I adapted that pattern: one-byte op ID, fixed-size fields for the common case, and length-prefixed data when variable-length payloads are needed. No VINT complexity required since I control both sides, but the core idea—tag-length-value framing—made the protocol obvious to implement and extend.

#### Designing the ops format

The queue is a single byte buffer. Each op starts with a one-byte tag, followed by fixed-size fields. Variable-length data (strings, nested arrays) comes last per record.

Current ops:

| Op                | Payload                                                 |
| ----------------- | ------------------------------------------------------- |
| `SetText`         | `node_id: u32`, `text_len: u32`, `text: bytes`          |
| `DeleteTextRange` | `node_id: u32`, `start: u32`, `end: u32`                |
| `AddNode`         | `node_id: u32`, `kind: u8`, `style_id: u32`             |
| `DeleteNode`      | `node_id: u32`                                          |
| `UpdateStyle`     | `style_id: u32`, `prop_count: u8`, then key/value pairs |
| `SetRoot`         | `node_id: u32`                                          |
| `AppendChild`     | `parent_id: u32`, `child_id: u32`                       |

Style values use a small union: `0` for reset, `1` followed by `f64` for numbers, `2` followed by `len: u32` and bytes for strings.

The entire frame's worth of changes gets encoded into one `Uint8Array`. One FFI call. One lock on the Rust side.

#### Migration strategy

I did not rewrite everything at once. The first step was extracting the existing text and style diff logic into op encoding functions. Then I added tree ops alongside the old tree rebuild path.

For a few commits, both paths ran: the new ops queue and the legacy full-tree serialization. I compared outputs to verify they produced equivalent Rust state. Once confident, I switched the default and deleted the old path.

The key insight: making Rust the source of truth simplified everything. TS no longer needs to know what Rust thinks the tree looks like. It just sends mutations. Rust applies them to its persistent state.

#### Runtime changes

The TS runtime used to maintain two trees: the user's component tree and a separate "previous sent tree" for diffing. That second tree is gone now. Instead, the runtime tracks dirty flags per node.

When a component re-renders:

1. New nodes get `AddNode` ops
2. Removed nodes get `DeleteNode` ops
3. Reparented nodes get `AppendChild` ops
4. Text changes get `SetText` or `DeleteTextRange` ops
5. Style changes get `UpdateStyle` ops

The encoder walks the dirty set and builds the batch. No need to diff against a previous snapshot.

#### Results

The ops queue landed in `v0.0.12`. Metrics showed:

- Serialization time dropped significantly on larger scenes
- FFI call count went from O(nodes) to O(changes) per frame
- Memory churn on the JS side decreased (no more full tree snapshots)

More importantly, the architecture became extensible. Adding new op types is just adding a case to the encoder and decoder. No new FFI signatures, no new sync paths.

#### Cleanup wins

Unifying the protocol let me delete a lot of code:

- Separate text and style sync functions
- The "previous sent tree" diffing logic
- Multiple FFI exports that were just variants of the same thing

The runtime went from managing three different sync abstractions to one: build ops, send ops, done.

#### End of part 8

By end of this phase:

- One ops queue handles all TS → Rust communication
- Rust owns persistent tree state, TS sends mutations
- Serialization scales with changes, not total tree size

Next for me: rich text support with per-character styling, and a proper text layout engine for wrapping and overflow.
