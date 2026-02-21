---
title: "Building a TUI Library from scratch: Part 4"
description: "Binary protocols, batched flushing, component API redesign, and facing competition"
date: "2026-01-08T10:00:00"
---

## Building a TUI Library from Scratch: Part 4 - Binary Protocol and Facing Reality

#### Things I learned:

- JSON serialization is secretly expensive - binary protocols are worth the effort
- Batching writes is always faster than individual operations
- Sometimes you need to step back and redesign the API before moving forward

After hitting ~5ms frame times in Part 3, I was feeling good. Then I looked at what was actually slowing things down.

#### Killing JSON serialization

Remember in Part 3 when I mentioned "JSON serialization for layout" as a potential bottleneck? It was time to actually fix it. Every frame, I was doing this:

```typescript
// Before - JSON serialization every frame
const tree = JSON.stringify({
  node: serializeNode(root),
  width: terminalWidth,
  height: terminalHeight
});
api.calculate_layout(ptr(Buffer.from(tree)), tree.length);
```

The fix was a binary protocol. Instead of JSON, I pack node data into a `Float32Array` and text into a `Uint8Array`. Each node gets exactly 7 fields (later expanded to 13):

```typescript
const FIELDS_PER_NODE = 7; // nodeType, gap, paddingX, paddingY, border, childCount, textLength

function serialize(root: Node): { nodeData: Float32Array, textData: Uint8Array } {
  // Pack node properties as floats
  nodeData[offset++] = nodeType;
  nodeData[offset++] = gap;
  nodeData[offset++] = paddingX;
  nodeData[offset++] = paddingY;
  nodeData[offset++] = border;
  nodeData[offset++] = children.length;
  nodeData[offset++] = textContent.length;
  // Text goes into separate buffer
}
```

On the Rust side, I replaced `serde` deserialization with direct pointer reads:

```rust
fn parse_node(node_data: &[f32], node_offset: &mut usize, text_data: &[u8], text_offset: &mut usize) -> Node {
    let base = *node_offset;
    let node_type = NodeType::from_f32(node_data[base]);
    let gap = node_data[base + 1];
    // ... read remaining fields
    *node_offset += FIELDS_PER_NODE;
    // ...
}
```

This let me drop the `serde` dependency entirely and got a nice speedup. The real benefit was eliminating the allocation overhead of building and parsing JSON strings every frame.

#### Batched flush - the 3x speedup

The next big win came from how I was writing to the terminal. My original `flush()` function would set foreground color, set background color, then print a character - for every single cell that changed:

```rust
// Before - command per cell
for each changed cell {
    queue!(stdout, MoveTo(x, y)).unwrap();
    queue!(stdout, SetForegroundColor(fg)).unwrap();
    queue!(stdout, SetBackgroundColor(bg)).unwrap();
    queue!(stdout, Print(char)).unwrap();
}
```

The fix was batching consecutive cells with the same colors into a single print:

```rust
fn next_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64], last_buf: &[u64]) {
    let mut char_seq = String::with_capacity(w as usize);
    let mut batch_start_x = 0;

    for y in 0..h {
        for x in 0..w {
            // Skip unchanged cells
            if buf[idx] == last_buf[idx] { continue; }

            // Same colors? Keep batching
            if curr_fg == prev_fg && curr_bg == prev_bg {
                char_seq.push(curr_char);
                continue;
            }

            // Colors changed - flush the batch and start new one
            queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
            // ... update colors, reset batch
        }
    }
}
```

I also separated the first frame flush (which writes everything) from subsequent flushes (which only write diffs). First frame can stream left-to-right without cursor moves. Subsequent frames need MoveTo for each batch, but skip most cells entirely.

Result: 8-10ms flush time dropped to 3-5ms.

#### Adding phase timing

To understand where time was actually going, I split the metrics into phases:

```typescript
export function startPhase() {
  return Bun.nanoseconds();
}

export function endLayout(startTime: number) {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000;
  metrics.layoutTimes.push(elapsed);
}

export function endPaint(startTime: number) {
  // ...
}
```

Now I could see exactly where the milliseconds were going:

```
674fps | 2.1ms avg | 6MB heap | 70 frames
  layout: 0.1ms
  paint:  1.7ms
  flush:  0.2ms
```

Paint was now 81% of my frame time. Good to know for later.

#### Component API overhaul

At this point, the library worked but the API was getting messy. Components had grown organically and the separation between "what a component is" and "how it renders" was blurring. I did a major refactor - split things into `components.ts` (pure component definitions), `runtime.ts` (render loop, painting, events), and `types.ts` (interfaces).

Components became cleaner:

```typescript
export function Button(props: ButtonProps): Node {
  return {
    id: generateId(),
    type: "button",
    props: normalizeProps(props),
    frame: getInitialFrame(),
    children: () => [],
  };
}
```

The runtime handles serialization, layout calls, painting, and hit testing. Components just describe what they want to be.

#### Pseudo-scrolling

One feature I kept putting off was scrolling. Real scrolling (with a viewport, scroll position, clipping) is complex. But I needed something for lists longer than the terminal height.

My solution was "pseudo-scrolling" - the parent component receives the frame dimensions after layout, and uses that to slice the visible portion:

```typescript
const visibleItems = items.slice(scrollOffset, scrollOffset + containerHeight);
```

Not real scrolling, but good enough for most use cases. The `frameWidth` and `frameHeight` signals let components react to their actual rendered size.

#### Facing the competition

With all these optimizations, I finally decided to benchmark LeTUI against two other libraries: [OpenTUI](https://github.com/example/opentui) (Zig-based, used by OpenCode) and pi-mono (pure TypeScript, string-based rendering).

I built equivalent demos in all three and ran them:

| Library | Avg Frame Time |
|---------|----------------|
| LeTUI   | 2.1ms          |
| OpenTUI | 0.4ms          |
| pi-mono | 0.2ms          |

Ouch.

pi-mono being faster was especially humbling - it's pure TypeScript with string concatenation, no fancy FFI or Rust. Turns out string building is really fast when you're not doing all the bookkeeping I was doing.

OpenTUI being 5x faster made sense - it's Zig, basically as close to the metal as you can get.

#### The path forward

At 2.1ms I'm well under 16.6ms (60fps) and even under 8.3ms (120fps). But there's clearly room to improve. Looking at the phase breakdown:

- serialize: 0.1ms (5%)
- layout: 0.1ms (5%)
- **paint: 1.7ms (81%)**
- flush: 0.2ms (9%)

Paint is the bottleneck. All those `setCell()` calls in JavaScript, writing to typed arrays, that's what's eating time. The obvious next step is moving paint to Rust - same as I did with layout.

But for now, I have a working TUI library that can do 500+ fps on a good day. Time to actually build something with it.
