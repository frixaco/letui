---
title: "Building a TUI Library from scratch: Part 5"
description: "Moving paint to Rust and rethinking interaction state"
date: "2026-01-19T10:00:00"
---

## Building a TUI Library from Scratch: Part 5 - Paint in Rust, State in Rust

#### Things I learned:

- Interaction state belongs with the renderer, not the component layer
- Hit-testing and focus management should happen where the layout lives
- FFI round-trips kill your frame budget - batch events, don't callback

Part 4 ended with paint taking 81% of frame time. The fix was obvious: move paint to Rust.

#### The paint migration

In TypeScript, I was calling `setCell()` for every character - updating a typed array through Bun's FFI. Each call had overhead:

```typescript
// Before - setCell per character
for (let x = frame.x; x < frame.x + frame.width; x++) {
  for (let y = frame.y; y < frame.y + frame.height; y++) {
    setCell(x, y, char, fg, bg);
  }
}
```

In Rust, I write directly to the buffer. No FFI boundary per cell:

```rust
let idx = (w * y + x) as usize * 3;
buf[idx] = char as u64;
buf[idx + 1] = fg;  // raw hex, no conversion
buf[idx + 2] = bg;
```

The `hex_to_color()` conversion only happens at flush time when crossterm needs it. During paint, it's just integer writes.

#### The interaction state problem

But here's where it got interesting. My components had `isFocused` and `isPressed` props for styling:

```typescript
const bg = isFocused ? COLORS.default.bg_highlight : COLORS.default.bg;
```

If paint moves to Rust, who owns these flags?

Option 1: Keep state in TS, pass as node props every frame. But then TS needs layout rects for hit-testing, or Rust needs to send them back. FFI round-trip. Latency. Duplication.

Option 2: Move interaction state to Rust.

I went with option 2.

#### Rust owns interaction state

The insight: `isFocused` and `isPressed` are view state, not app state. They belong with the renderer.

Rust now maintains:

```rust
struct InteractionState {
    focused: Option<NodeId>,
    pressed: Option<NodeId>,
}
```

When a click comes in:
1. Rust receives the event (crossterm)
2. Rust hit-tests using layout rects it already computed
3. Rust updates `InteractionState`
4. Rust paints with the right style variant - immediately, no FFI

TypeScript doesn't need to know a button "looks pressed". It only cares when the click completes and `onClick` should fire.

#### Events go to TS, state stays in Rust

The split:

- **Rust owns**: layout, paint, input routing, focus/press state, hit-testing
- **TS owns**: app state, component tree, event handlers

Rust batches events and returns them to TS:

```rust
// Rust queues these during input handling
events.push(Event::Focus(node_id));
events.push(Event::Click(node_id));
// TS receives batch after frame
```

No synchronous callbacks across FFI. TS updates app state, rebuilds tree, sends to Rust. Rust renders at 120hz without waiting.

#### Style variants

Components now declare style variants in the node data:

```typescript
{
  id: buttonId,
  focusable: true,
  styles: {
    base: { bg: 0x16181a, fg: 0xffffff },
    focused: { bg: 0x3c4048, fg: 0xffffff },
    pressed: { bg: 0x5ea1ff, fg: 0x16181a },
  }
}
```

Rust picks the right variant based on `InteractionState`. Clean separation.

#### Merging layout and paint

Originally I had two FFI calls: `calculate_layout()` then `paint()`. Both built the same Taffy tree. Wasteful.

Now there's just `paint()`. It parses the node data, builds the Taffy tree once, computes layout, stores frames for TS to read, then paints. One tree, one pass.

TypeScript just calls `api.paint()` then reads frames back to update its node references:

```typescript
api.paint(ptr(nodeData), nodeData.length, ptr(textData), textData.length);
updateNodeFrames(root);  // reads FRAMES array from Rust
```

#### NodeContext as single source of truth

The Taffy tree stores everything needed for both layout and paint via `NodeContext`:

```rust
enum NodeContext {
    Text { content: String, fg: u32, bg: u32 },
    Button { label: String, fg: u32, bg: u32, border_color: u32, border_style: BorderStyle },
    Input { content: String, fg: u32, bg: u32, border_color: u32, border_style: BorderStyle },
    Row { fg: u32, bg: u32, border_color: u32, border_style: BorderStyle },
    Column { fg: u32, bg: u32, border_color: u32, border_style: BorderStyle },
}
```

`paint_taffy_node()` walks the tree recursively, calling `taffy.layout(node_id)` for position and `taffy.get_node_context(node_id)` for paint data. No separate data structures.

#### The text positioning bug

Text was rendering wrong: `[ ld hello wor ]` instead of `[ hello world ]`. Two issues:

**Issue 1**: Using `layout.location` instead of content box. Location is the outer box - includes border and padding. Fixed by using `content_box_x()` and `content_box_y()`:

```rust
let content_x = abs_x + layout.content_box_x();
let content_y = abs_y + layout.content_box_y();
draw_text_at(content_x, content_y, content, fg, bg, tw, th);
```

**Issue 2**: Character count vs byte count. TypeScript was sending `[...text].length` (character count). Rust was using it to slice UTF-8 bytes. For ASCII they match, but the offset accumulation was wrong.

Fix: send byte length from TypeScript:

```typescript
const textLength = new TextEncoder().encode(textContent).length;
```

#### What's next

Still measuring, but early results look promising. Paint in Rust eliminates thousands of FFI calls per frame. Next up: proper text input handling and figuring out how to do controlled vs uncontrolled inputs cleanly.
