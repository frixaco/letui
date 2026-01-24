export const metadata = {
  title: "Building a TUI Library from scratch: Part 3",
  description: "Optimization journey - I want 120+fps and sub 8ms frame times",
  date: "2025-12-13T12:00:00",
};

## Building a TUI Library from Scratch: Part 3 - Optimization

#### Things I learned:

- Measure first, optimize second - metrics are essential
- The less you do, the faster it runs

At this point LeTUI was working. Signals drove the reactivity, Rust handled layout via taffy, and the diff-based flush meant only changed cells got written to the terminal. Now I wanted maximum performance.

Time to actually measure things.

#### Building a metrics system

Before optimizing anything, I needed to know what was slow. I built a simple metrics tracker using `Bun.nanoseconds()`:

```typescript
export function startFrame(): number {
  return Bun.nanoseconds();
}

export function endFrame(startTime: number): void {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  frameCount++;
  frameTimes.push(elapsed);
  if (frameTimes.length > MAX_SAMPLES) {
    frameTimes.shift();
  }
}

export function formatMetrics(): string {
  const m = getMetrics();
  return `${m.fps}fps | ${m.avgFrameTime}ms avg (${m.minFrameTime}-${m.maxFrameTime}) | ${m.heapMB}MB heap | ${m.frameCount} frames`;
}
```

Now when I quit the app with `Ctrl+Q`, I get something like:

```
113fps | 8.85ms avg (3.47-32.43) | 31.7MB heap | 27 frames
```

8.85ms average with spikes up to 32ms? That's bad. My target is < 8ms.

#### The first culprit: debug file writes I forgot to remove

Removing it immediately improved things:

```
139fps | 7.2ms avg (3-33) | 22.2MB heap | 40 frames
```

Better, but those 33ms spikes were still there.

#### The big one: buffer cloning

Looking at my Rust code, I found this in the `flush()` function:

```rust
// Before - cloning the entire buffer every frame
if let Some(ref buf) = *cb {
    *lb = Some(buf.clone());
}
```

The buffers were `Box<[u64; 2_000_000]>` - that's 16MB being copied every single frame. Even if only a few cells changed.

The fix was simple - only copy what's actually used, and do it in place:

```rust
// After - copy only what we need
last_buf.copy_from_slice(buf);
```

And while I was at it, I changed the buffers from fixed-size arrays to vectors sized to the actual terminal:

```rust
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    let buffer_size = (w as usize) * (h as usize) * 3;

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(vec![0u64; buffer_size]);
    let mut lb = LAST_BUFFER.lock().unwrap();
    *lb = Some(vec![0u64; buffer_size]);
    1
}
```

Result:

```
~150+ fps | ~5ms avg (1-13) | ~20MB heap | 39fps
```

Now we're talking.

#### Death by a thousand allocations

The remaining spikes came from allocations in the hot path. In `drawBackground()`, I was creating a new `BigUint64Array` for every single cell:

```typescript
// Before - allocating per cell
for (let j = node.frame.y; j < node.frame.y + node.frame.height; j++) {
  for (let i = node.frame.x; i < node.frame.x + node.frame.width; i++) {
    buffer.set(
      new BigUint64Array([
        BigInt(" ".codePointAt(0)!),
        BigInt(COLORS.default.bg),
        BigInt(bg),
      ]),
      (j * terminalWidth() + i) * 3
    );
  }
}
```

For a 200x50 terminal, that's potentially 10,000 array allocations per frame. The fix was to write directly to the buffer:

```typescript
function setCell(
  buffer: BigUint64Array<ArrayBuffer>,
  offset: number,
  char: string,
  fg: number,
  bg: number
) {
  buffer[offset] = BigInt(char.codePointAt(0)!);
  buffer[offset + 1] = BigInt(fg);
  buffer[offset + 2] = BigInt(bg);
}

// After - direct index writes
for (let j = node.frame.y; j < node.frame.y + node.frame.height; j++) {
  for (let i = node.frame.x; i < node.frame.x + node.frame.width; i++) {
    setCell(buffer, (j * tw + i) * 3, " ", COLORS.default.bg, bg);
  }
}
```

Same pattern for the spatial lookup array - instead of creating a new array every frame:

```typescript
// Before
spatialLookup = new Array(terminalWidth() * terminalHeight());

// After - reuse and clear
spatialLookup.fill(undefined);
```

And in Rust, reusing the frames vector instead of allocating a new one:

```rust
// Before
let mut frames: Vec<f32> = Vec::new();
build_frames_array(&mut taffy, root, &mut frames, 0.0, 0.0);
*FRAMES.lock().unwrap() = Some(frames);

// After - reuse existing vec
let mut frame_lock = FRAMES.lock().unwrap();
let frames_vec = frame_lock.get_or_insert_with(Vec::new);
frames_vec.clear();
build_frames_array(&mut taffy, root, frames_vec, 0.0, 0.0);
```

#### Current state

After all these changes, it's even more optimized:

```
170fps | 5.89ms avg (2.85-9.81) | 10.7MB heap | 40 frames
```

The target was < 8ms and I'm now averaging under 5ms. The occasional spikes to 13ms are likely because of the JSON serialization for layout and rebuilding the taffy tree every frame.

#### What's next

The architecture still has room for improvement. Right now, any signal change triggers a full rebuild: node tree → JSON → taffy layout → full repaint. The obvious next steps are:

1. **Persist the node tree** - call `nodeFactory` once, not every frame
2. **Dirty tracking** - only repaint node (sub-trees) that actually changed
3. **Binary layout protocol** - replace JSON with packed buffers

But for now, hitting results are pretty good. I really wanna stress test it and make a nice demo while doing it.
