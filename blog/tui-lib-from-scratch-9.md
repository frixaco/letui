---
title: "Building a TUI Library from scratch: Part 9"
description: "Per-character styling, text layout engine, persistent layout tree, and vertical scrolling"
date: "2026-03-24T13:00:00"
---

## Building a TUI Library from Scratch: Part 9 - Text, Layout, and Scroll

#### Things I learned:

- Text layout, text rendering and text editing are harder than they look
- Building real demos exposes missing primitives faster than writing tests

After the ops queue unification, I had bandwidth for features that touched every layer: rich text rendering, proper wrapping and overflow, and scrollable containers. This batch took the library from "functional" to "usable for real apps."

#### Per-character styling

Plain text was fine for logs and labels. But markdown rendering, syntax highlighting, and inline error messages need styles that change mid-string. I added per-character styling via `TextSpan` primitives.

A styled text input looks like:

```typescript
type TextSpan = {
  text: string;
  start: number; // byte offset into parent text
  end: number; // byte offset
  foreground?: number;
  background?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
```

Spans are normalized before sync: sorted by start, overlapping spans are split, and adjacent spans with identical styles are merged. The result goes over the wire as a `SetTextSpans` op with a compact binary encoding.

Rust stores spans alongside text in the registry. During paint, the layout engine walks spans to apply attributes to terminal cells. This unlocked the AI agent demo with full markdown rendering: headers, code blocks, inline code, and emphasis all styled correctly.

#### Text layout engine

Wrapping text is easy until you care about:

- Unicode grapheme boundaries (not byte boundaries)
- CJK characters that don't use word spacing
- Preserving intentional line breaks
- Overflow handling (ellipsis vs clip)
- Input cursor placement in wrapped content

I wrote a layout engine in Rust that handles all of this. The core is a line-breaking algorithm that respects `word-wrap` and `overflow` styles:

- `wrap: "char"` breaks at any grapheme boundary
- `wrap: "word"` breaks at word boundaries, falls back to char for long words
- `overflow: "ellipsis"` truncates with `…`, `"clip"` just cuts

For inputs, the engine tracks byte-to-cell mappings so the cursor renders in the right visual position even with wrapping. Multiline inputs with padding and borders required careful content-box calculations, but the result handles real-world typing correctly.

The engine also measures text height before layout, which matters for flex containers that need to know intrinsic sizes.

#### Persistent Taffy tree

Before this phase, Rust rebuilt the layout tree every frame from the node tree sent by TS. Taffy (the flexbox layout library) is fast, but tree construction has overhead. Worse, scroll positions and focus state lived in TS, so scroll containers would reset on every re-render.

I made the Taffy tree persistent:

- TS sends `AddNode`/`DeleteNode`/`AppendChild` ops
- Rust maintains `TREE_STATE` with both the node hierarchy and the Taffy layout tree
- Layout runs only on dirty subtrees
- Scroll positions are stored in Rust and synced back to JS after render

Dirty tracking is coarse-grained for now: any style change marks the node and its ancestors dirty. This is pessimistic but correct. The persistent tree landed in `v0.0.13`.

#### Vertical scrolling with virtualization

With persistent layout and scroll state in Rust, I could build proper scroll containers on the TS side. The `virtual-list.ts` module provides:

- Scroll position tracking in rows
- Virtualization: only visible items (plus overscan) get rendered
- Variable item heights via a height lookup function
- Wheel and key navigation

The API looks like:

```typescript
createVirtualList({
  container: scrollBox,
  items: largeArray,
  createSlot: (index) => renderItem(largeArray[index]),
  overscanRows: 4,
});
```

The virtual list computes a render window based on scroll position and item heights. Items outside the window are not in the component tree, so Reactivity handles the rest. Scroll events update the window, which triggers re-render of just the visible slice.

This made the AI agent demo usable with long conversation histories. Without virtualization, rendering 1000+ messages would kill performance. With it, only the viewport plus a small buffer gets touched.

#### Putting it together

These four features came together in the `ai-agent` and `anitrack` demos:

- Per-character styling renders markdown and syntax highlighting
- Text layout handles wrapping long assistant responses
- Persistent tree keeps scroll position stable during streaming updates
- Virtual scrolling makes long lists responsive

The demos were validation: if I could build a pleasant chat interface and a music tracker, the primitives were right.

#### End of part 9

By end of this phase:

- Rich text with per-character styling works end-to-end
- Text layout handles wrapping, overflow, and multiline inputs
- Persistent Taffy tree enables incremental layout
- Vertical scrolling with virtualization handles large datasets

The library now supports the essentials: text, input, overflow, scrolling, keyboard, mouse, and performance. Time to ship `v0.1.0` and call this project complete.
