./AGENTS.md
```
# Project information

This is a TUI library written in Rust and TypeScript.
The core backend for the library is written in Rust for maximum performance.
The API/wrapper for the library is written in TypeScript for acccess to a wide ecosystem.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time in any practical use.

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

State management primitives, component API, diffing, number of optimizations are DONE.

Currently, following `./OPTIMIZATION_ROADMAP.md` to further optimize the library and

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, start from first principles

```
./ICED_POC_PLAN.md
```
- PoC Name: `letui-native-gui-poc`
- Goal: validate native GUI rendering path with `iced` for lower tail latency vs terminal flush path
- Goal: keep existing terminal backend intact during PoC
- Goal: measure where spikes move, not assume they disappear

- Assumptions
- Assumption: current `letui-ffi` render loop remains source of truth for layout + paint data
- Assumption: PoC can add new Rust crates without changing public TS API yet
- Assumption: success judged on steady-state percentiles after warmup, not single-run max
- Assumption: dependency check required before lock-in (`iced` recency, maintainers, release cadence, adoption)

- Inputs
- Input: existing Rust backend in `letui-ffi/src/lib.rs`
- Input: existing timing model in `src/metrics.ts`
- Input: current terminal baseline metrics in `dump/metrics.txt`

- Non-goals
- Non-goal: full feature parity with terminal renderer
- Non-goal: replacing Bun/TS runtime in this PoC
- Non-goal: VT compatibility in phase 1
- Non-goal: hard real-time guarantee

- Success criteria
- Success: steady-state (`frames 121+`) `render_p99 <= 1.0ms` on test scene A (mostly static)
- Success: steady-state (`frames 121+`) `render_p99 <= 1.5ms` on test scene B (moderate diff churn)
- Success: reported metrics split by stage: `engine`, `transport`, `raster`, `present_wait`
- Success: zero heap allocations in hot render loop after warmup (validated by instrumentation)
- Success: existing terminal mode still runnable and unaffected

- Failure criteria
- Fail: no statistically meaningful p99 improvement vs terminal baseline
- Fail: spike source moves to GUI path with same or worse tail
- Fail: architecture requires invasive rewrite before proving latency value

- High-level architecture
- Track A: terminal renderer (existing), unchanged
- Track B: native GUI renderer (`iced`), new
- Shared core target: renderer-agnostic frame data contract
- Frame contract v1: grid dimensions + cell payload (`char`, `fg`, `bg`) + optional dirty metadata
- Data flow v1: core produces frame -> GUI consumes frame -> GUI raster/present

- PoC implementation strategy
- Strategy: two-phase integration
- Strategy: phase 1 fastest validation path, tolerate duplication
- Strategy: phase 2 extraction for cleaner architecture only if phase 1 passes

- Phase 0: baseline + instrumentation hardening
- Task: add Rust-side per-frame timings around terminal `flush` internals
- Task: record `changed_cells`, `batches`, `bytes_written`, `first_diff`
- Task: export raw per-frame metrics to NDJSON/CSV for offline analysis
- Task: run baseline scenarios with fixed protocol
- Exit: baseline report with `p50/p95/p99/p99.9/max`, warmup excluded

- Phase 1: dependency and feasibility gate
- Task: validate `iced` viability
- Task: verify maintenance/adoption: latest release date, issue throughput, ecosystem usage
- Task: pin exact crate version, avoid floating semver
- Task: smoke-test minimal window + draw loop + resize handling
- Exit: documented go/no-go decision with evidence

- Phase 2: PoC crate scaffold
- Task: create crate `letui-gui-poc` (binary)
- Task: isolate feature flags so main package unaffected by default
- Task: add CLI flags
- Task: `--renderer terminal|iced`
- Task: `--scene static|churn|stress`
- Task: `--frames N`
- Task: `--headless-metrics` (no UI present path timing where possible)
- Exit: runnable binary switching renderer by flag

- Phase 3: frame contract extraction
- Task: define `FrameGrid` struct in shared Rust module
- Task: include metadata
- Task: `frame_id`
- Task: `width`, `height`
- Task: `cells: &[Cell]`
- Task: `dirty_rects` optional
- Task: add producer API in core to emit `FrameGrid` without terminal I/O
- Task: keep existing terminal flush path consuming same contract
- Exit: terminal path and GUI path consume identical frame contract

- Phase 4: iced renderer v1 (correctness first)
- Task: implement `iced` app with custom widget/canvas for cell grid
- Task: render full frame each tick first
- Task: verify color + glyph correctness against terminal snapshots
- Task: support resize, DPI scaling, font config
- Exit: visual parity for core primitives on representative scenes

- Phase 5: iced renderer v2 (latency tuning)
- Task: switch to dirty-rect rendering path
- Task: cache glyph raster/layout, precompute atlas where possible
- Task: reuse vertex/index buffers, no per-frame vec growth
- Task: move frame ingest to lock-free queue/ring buffer
- Task: minimize main-thread work before present
- Exit: steady-state p99 target hit on scene A, near-target on scene B

- Phase 6: optional VT compatibility path
- Task: integrate `libghostty-vt` as alternate input parser mode
- Task: `VT bytes -> grid ops -> shared FrameGrid -> iced renderer`
- Task: benchmark parser cost separately from raster/present
- Exit: compatibility demo with external TUI process + isolated parser metrics

- Bench protocol
- Scene A: static dashboard, tiny diffs
- Scene B: medium churn list updates + cursor movement
- Scene C: full-screen churn stress
- Warmup: first 120 frames excluded
- Sample size: minimum 5000 frames per scene
- Runs: 5 runs per scene per renderer
- Report: median of run-level p99 + worst-run p99
- Record environment per run
- Record: OS version
- Record: CPU model
- Record: refresh rate
- Record: power mode
- Record: terminal emulator (for baseline)

- Metrics schema (per frame)
- `frame_id`
- `ts_ns_start`
- `engine_ms`
- `transport_ms`
- `parse_ms` (VT mode only)
- `raster_ms`
- `present_wait_ms`
- `frame_total_ms`
- `changed_cells`
- `dirty_rect_count`
- `bytes_emitted`
- `alloc_count_delta` (if measurable)

- Guardrails for honest comparison
- Guardrail: same scenes, same update cadence, same machine state
- Guardrail: exclude startup and first-frame cold caches
- Guardrail: separate compute latency from display pacing
- Guardrail: publish raw metrics files, not only summary

- Risks
- Risk: `iced` text rendering path dominates tail latency
- Risk: vsync/compositor quantization masks renderer improvements
- Risk: lock contention between producer and UI thread
- Risk: allocation regressions reintroduced by scene updates
- Risk: false wins from biased measurement windows

- Mitigations
- Mitigation: include offscreen/headless timings where possible
- Mitigation: compare with vsync on/off configurations
- Mitigation: preallocate all frame buffers after first resize
- Mitigation: add CI perf sanity check with threshold alerts (non-blocking initially)

- Deliverables
- Deliverable: `letui-gui-poc` crate with renderer switch CLI
- Deliverable: shared frame contract module
- Deliverable: benchmark runner script and reproducible command list
- Deliverable: raw metrics artifacts + summary markdown report
- Deliverable: decision memo: continue iced / pivot / rollback

- Decision gates
- Gate 1 (post phase 1): `iced` viable -> continue or pivot framework
- Gate 2 (post phase 4): correctness acceptable -> begin tuning
- Gate 3 (post phase 5): p99 targets met -> proceed to integration roadmap
- Gate 4 (post phase 6 optional): VT mode worth maintaining -> keep or drop

- Proposed file/folder changes (PoC phase)
- `ICED_POC_PLAN.md` (this file)
- `letui-gui-poc/` (new crate)
- `letui-core/` (optional extraction if phase 3 requires)
- `scripts/bench-native.ts` or `scripts/bench-native.sh`
- `dump/bench/native/*.ndjson`
- `dump/bench/native/*.md`

- Execution order
- Step 1: phase 0
- Step 2: phase 1
- Step 3: phase 2
- Step 4: phase 3
- Step 5: phase 4
- Step 6: phase 5
- Step 7: phase 6 optional

- Immediate next task
- Next: implement phase 0 instrumentation first before adding GUI dependencies

```
./README.md
```
# letui

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

TUI library written using Rust and TypeScript

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

### Priority 0: Text Registry (FFI Optimization)

**Goal**: Stop sending all text on every render. Register text once → get `u8` ID → pass only ID (1 byte) across FFI.

**Rust side**:

- Add `TextRegistry` struct: `slots: Vec<Option<String>>` (256 max), `free: Vec<u8>` (freelist)
- FFI functions:
  - `text_register(ptr, len) -> u8` — alloc slot, return ID (0 = failure/empty)
  - `text_update(id, ptr, len) -> i32` — replace text at existing ID
  - `text_free(id) -> i32` — return slot to freelist
  - `text_clear() -> i32` — reset all (on quit)
- In `paint()`: lock registry once at start, pass `&TextRegistry` down
- Change node parsing: read `text_id` field (u8 stored as f32), resolve via `reg.get(id)`

**TypeScript side**:

- Add FFI symbols for `text_register`, `text_update`, `text_free`, `text_clear`
- Create `TextIdRegistry` class:
  - `byNodeId: Map<number, { id: number; last: string }>`
  - `getOrCreate(nodeId, text)`: register if new, update if changed, return ID
  - `freeNode(nodeId)`: reclaim ID when node unmounts
- In serialization: replace `textLength` field with `textId`, remove `textData` concat
- Track `prevNodeIds` vs `currentNodeIds` each frame → free disappeared nodes

**Key details**:

- `u8` IDs are exactly representable in `f32` (no Float32Array change needed)
- ID 0 = empty/missing text (reserve slot 0)
- Must free IDs on node removal (255 usable slots max)
- Lock registry once per `paint()`, not per-node (perf)

**Expected result**: FFI traffic O(changed texts) instead of O(all texts every frame)

---

### Priority 1: Scrollable Containers

- [ ] Add `overflow: "hidden"` style prop → triggers clipping during paint
- [ ] Add `scrollX`/`scrollY` signals per scrollable node
- [ ] Pass scissor rect to Rust paint — skip cells outside bounds
- [ ] Horizontal scrolling first, then vertical

### Priority 2: Styled Text (Chunks)

- [ ] `TextChunk` type: `{ text: string; fg?: number; bg?: number; bold?: boolean }`
- [ ] Update `Text` component to accept `TextChunk[]` or plain string
- [ ] Serialize chunks to Rust for rendering

### Priority 3: Text Input

- [ ] Single-line input improvements (cursor position, selection)
- [ ] Multi-line text editor (builds on scrollable + input)

### Priority 4: Syntax Highlighting

- [ ] Tree-sitter integration (Rust bindings → FFI)
- [ ] TextMate-compatible theme loading (like OpenTUI's `SyntaxStyle`)

---

### Performance & Other

- [x] Move paint to Rust (currently 81% of frame time @ 1.7ms avg)
  - **Why**: Eliminates JS per-cell loops, staging buffer, and BigInt conversions
  - **New FFI function**: `paint(node_data, text_data, focused_id, pressed_id, colors...)`
  - **Rust side**:
    - Reuse parsed node tree from `calculate_layout` (already has frames)
    - Add `PaintNode` struct with: frame, bg, fg, border_color, border_style, text range, node_type
    - Implement `draw_background()`, `draw_border()`, `draw_text()`, `draw_cursor()` writing directly to `CURRENT_BUFFER`
    - Recursive `paint_node()` traversal matching JS logic
  - **TS side**:
    - Add `isFocused` and `isPressed` fields to serialization (FIELDS_PER_NODE: 13 → 15)
    - Replace JS `paint()` call with `api.paint(...)` FFI call
    - Keep `registerHit()` in JS for mouse hit testing (cheap traversal)
    - Remove `stagingBuffer` and `flushStagingBuffer()` (no longer needed)
  - **Expected result**: Paint phase from 1.7ms → ~0.1-0.2ms
- [ ] Add scrollable containers

- [ ] How to handle serialization of walls of text: https://ampcode.com/threads/T-019bdac3-ba03-745f-a3d3-c9d53bfa0648
- [ ] Add render caching - skip serialize/layout if signals unchanged (pi-mono pattern)
- [ ] Incremental tree updates - don't rebuild entire Taffy tree each frame, cache structure and update only changed nodes
- [ ] Visibility culling - skip `paint()` for off-screen nodes (OpenTUI's `_getVisibleChildren` pattern)

- [ ] Neovim as text input (use [Bun PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support))
- [ ] Will SIMD work if I wanna implement caching for serialization. For example, when comparing trees I used SIMD (idk what i'm talking about)
- [ ] Refactor flush function with BatchWriter pattern to reduce nesting
  - BatchWriter struct holds stdout ref, char_seq, batch_start_x/y, prev_fg/bg
  - `new()` initializes with sentinel colors (u64::MAX) to force first color emit
  - `push(x, y, ch, fg, bg)` handles gap detection, color changes, and accumulates chars
  - `flush_pending()` emits MoveTo + Print for accumulated batch
  - Encapsulates all batching logic, main loop just calls push() for changed cells
- [ ] Add performance stats overlay that update independently from rest of the app (can i use a separate thread?)
- [x] Add `flexGrow` support for dynamic width components (e.g., progress bars)
  - **TypeScript side:**
    - Add `flexGrow?: number` to `StyleProps` in `src/types.ts`
    - Update `createStyleSignals()` in `src/components.ts` to include `flexGrow: $(input.flexGrow)`
    - Update serialization in `src/runtime.ts` to pass `flexGrow` value to Rust (add to `FIELDS_PER_NODE`)
  - **Rust side:**
    - Increment `FIELDS_PER_NODE` from 12 to 13 in `lib.rs`
    - Add `flex_grow: f32` field to `Node` struct
    - Parse `flex_grow` in `parse_node()` function
    - Apply `style.flex_grow = node.flex_grow` in `get_styles()` for all node types
  - **Progress bar update:**
    - Remove fixed `width` prop from `ProgressBar`
    - Instead of `" ".repeat(n)`, use a single space `" "` for text
    - Set `flexGrow: progress / 100` on filled node, `flexGrow: (100 - progress) / 100` on unfilled node
    - Layout engine distributes space proportionally - bar auto-sizes to container
  - **Benefits:** No fixed width needed, bar fills available space, cleaner API

### NPM publish notes:

1. push your changes
2. update versions in `Cargo.toml` and `package.json`
3. `git tag v0.0.1` - tag a commit
4. `git push origin v0.0.1` - push the tag
5. release action will build and deploy it as package

```
./TEXT_SERIALIZATION_OPTIMIZATIONS.md
````
# Text Serialization Optimizations

This doc explains what's inefficient in the current TS→Rust text path and how to fix it.

---

## The Render Pipeline (How It Works Now)

Each frame:

1. **TS** serializes the node tree into `nodeData` (numbers) + `textData` (UTF-8 bytes)
2. **TS** calls Rust `paint(nodeDataPtr, nodeDataLen, textDataPtr, textDataLen)`
3. **Rust** parses the data, runs Taffy layout, paints to buffer
4. **TS** reads frames back and updates the terminal

---

## Problem 1: TypeScript Encodes Text Twice

### Current Code (runtime.ts:115-153)

```ts
// For each text node...
let textContent = "";
if (node.type === "text" || node.type === "input" || node.type === "button") {
  textContent = (node.props as any).text?.() ?? "";
}
const textLength = new TextEncoder().encode(textContent).length; // <-- ENCODE #1: just to get byte length!

if (textContent) {
  texts.push(textContent); // collect into array
}

// ... later, after traversing all nodes:
const textData = new TextEncoder().encode(texts.join("")); // <-- ENCODE #2: join strings, then encode again
```

### What's Wrong

1. **Per-node allocation**: `new TextEncoder().encode(textContent)` creates a new `Uint8Array` for every text node, just to read `.length`. That array is immediately thrown away.

2. **Double work**: All the text gets encoded once per-node (for length), then collected into an array, joined into one big string, and encoded again.

3. **Extra allocations**: `texts.push()` grows an array, `texts.join("")` creates a new string, then `encode()` creates the final `Uint8Array`.

### The Fix: Encode Once with `encodeInto`

Instead of encoding twice, use a single buffer and `encodeInto()` which writes directly and tells you how many bytes it wrote:

```ts
const textEncoder = new TextEncoder();
let textBuffer = new Uint8Array(4096);
let textWriteOffset = 0;

function writeText(s: string): number {
  // Ensure buffer has room (worst case: 4 bytes per char for emoji)
  const needed = s.length * 4;
  if (textWriteOffset + needed > textBuffer.length) {
    const newSize = Math.max(textBuffer.length * 2, textWriteOffset + needed);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(textBuffer.subarray(0, textWriteOffset));
    textBuffer = newBuffer;
  }

  const { written } = textEncoder.encodeInto(
    s,
    textBuffer.subarray(textWriteOffset),
  );
  textWriteOffset += written;
  return written; // this IS the byte length
}
```

Then in serialize():

```ts
// Reset at frame start
textWriteOffset = 0;

// For each node:
const textLength = textContent ? writeText(textContent) : 0;

// At the end:
const textData = textBuffer.subarray(0, textWriteOffset); // no copy, just a view
```

**Result**: One encode pass, no intermediate arrays, no join, no per-node allocations.

---

## Problem 2: Rust Allocates Strings That Get Cloned

### Current Code (lib.rs)

**Step 1 - parse_node() allocates a String (lines 346-354):**

```rust
let text = if text_len > 0 {
    let s = std::str::from_utf8(&text_data[*text_offset..*text_offset + text_len])
        .unwrap_or("")
        .to_string();  // <-- ALLOCATION: copies bytes into owned String
    *text_offset += text_len;
    s
} else {
    String::new()
};
```

**Step 2 - Node stores that String (lines 301-318):**

```rust
struct Node {
    // ...
    text: String,  // <-- owned String per node
    // ...
}
```

**Step 3 - node_type_to_context() clones it again (lines 439-457):**

```rust
NodeType::Text => NodeContext::Text {
    content: node.text.clone(),  // <-- CLONE: another allocation
    // ...
},
NodeType::Button => NodeContext::Button {
    label: node.text.clone(),    // <-- CLONE
    // ...
},
NodeType::Input => NodeContext::Input {
    content: node.text.clone(),  // <-- CLONE
    // ...
},
```

**Step 4 - NodeContext also stores owned Strings (lines 498-530):**

```rust
enum NodeContext {
    Text {
        content: String,  // <-- owned String
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,    // <-- owned String
        // ...
    },
    // ...
}
```

### What's Wrong

Every frame, for every text node:

1. `to_string()` allocates and copies UTF-8 bytes into a `String`
2. `clone()` allocates and copies that `String` again into `NodeContext`

That's 2 heap allocations per text node per frame. For a UI with 50 text elements at 60fps, that's 6000 allocations/second just for text.

### The Fix: Store Ranges, Decode On Demand

Instead of copying text into owned Strings, just remember where the text lives in `text_data`:

**Node stores a range:**

```rust
struct Node {
    // ...
    text_start: u32,  // offset into text_data
    text_len: u32,    // byte length
    // ...
}
```

**NodeContext stores a range:**

```rust
enum NodeContext {
    Text {
        text_start: u32,
        text_len: u32,
        fg: u32,
        bg: u32,
    },
    // ...
}
```

**Helper to decode when needed:**

```rust
fn get_text<'a>(text_data: &'a [u8], start: u32, len: u32) -> &'a str {
    if len == 0 { return ""; }
    std::str::from_utf8(&text_data[start as usize..(start + len) as usize]).unwrap_or("")
}
```

**parse_node() just tracks offsets:**

```rust
let text_start = *text_offset as u32;
let text_len = node_data[base + 11] as u32;
*text_offset += text_len as usize;
// No to_string()!
```

**node_type_to_context() passes ranges:**

```rust
NodeType::Text => NodeContext::Text {
    text_start: node.text_start,
    text_len: node.text_len,
    // No clone()!
    fg: node.fg,
    bg: node.bg,
},
```

**measure_function and paint decode on demand:**

```rust
// In measure_function, text_data is captured by the closure
let text = get_text(text_data, *text_start, *text_len);
let width = text.chars().count() as f32;
```

**Result**: Zero String allocations per frame. Text is decoded from the original `text_data` buffer only when actually needed for measuring or painting.

---

## Summary

| Where                     | Problem                                  | Fix                                   |
| ------------------------- | ---------------------------------------- | ------------------------------------- |
| TS serialize              | Encodes text twice; per-node allocations | Use `encodeInto` with reusable buffer |
| Rust parse_node           | `to_string()` allocates per node         | Store `(start, len)` range instead    |
| Rust node_type_to_context | `clone()` allocates again                | Pass range, no clone needed           |
| Rust measure/paint        | N/A (already uses `&str`)                | Decode on demand via `get_text()`     |

**Expected wins:**

- Lower GC pressure in TS
- Zero allocator calls in Rust hot path
- Same wire format, same API, just faster

````
./index.ts
```typescript
export * from "./src/components";
export * from "./src/colors";
export * from "./src/signals";
export * from "./src/runtime";
// TODO: export ffi for low level access?

```
./letui-src.md
`````
./AGENTS.md
```
# Project information

This is a TUI library written in Rust and TypeScript.
The core backend for the library is written in Rust for maximum performance.
The API/wrapper for the library is written in TypeScript for acccess to a wide ecosystem.
Communication with Rust backend is achieved thanks to Bun's FFI support.
TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time in any practical use.

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

State management primitives, component API, diffing, number of optimizations are DONE.

Currently, following `./OPTIMIZATION_ROADMAP.md` to further optimize the library and

# General

- Prefer explaining concepts and helping build mental model for solutions to problems, instead of providing ready-to-copy-paste code
- Providing pseudo code is OK
- When explaining, start from first principles

```
./ICED_POC_PLAN.md
```
- PoC Name: `letui-native-gui-poc`
- Goal: validate native GUI rendering path with `iced` for lower tail latency vs terminal flush path
- Goal: keep existing terminal backend intact during PoC
- Goal: measure where spikes move, not assume they disappear

- Assumptions
- Assumption: current `letui-ffi` render loop remains source of truth for layout + paint data
- Assumption: PoC can add new Rust crates without changing public TS API yet
- Assumption: success judged on steady-state percentiles after warmup, not single-run max
- Assumption: dependency check required before lock-in (`iced` recency, maintainers, release cadence, adoption)

- Inputs
- Input: existing Rust backend in `letui-ffi/src/lib.rs`
- Input: existing timing model in `src/metrics.ts`
- Input: current terminal baseline metrics in `dump/metrics.txt`

- Non-goals
- Non-goal: full feature parity with terminal renderer
- Non-goal: replacing Bun/TS runtime in this PoC
- Non-goal: VT compatibility in phase 1
- Non-goal: hard real-time guarantee

- Success criteria
- Success: steady-state (`frames 121+`) `render_p99 <= 1.0ms` on test scene A (mostly static)
- Success: steady-state (`frames 121+`) `render_p99 <= 1.5ms` on test scene B (moderate diff churn)
- Success: reported metrics split by stage: `engine`, `transport`, `raster`, `present_wait`
- Success: zero heap allocations in hot render loop after warmup (validated by instrumentation)
- Success: existing terminal mode still runnable and unaffected

- Failure criteria
- Fail: no statistically meaningful p99 improvement vs terminal baseline
- Fail: spike source moves to GUI path with same or worse tail
- Fail: architecture requires invasive rewrite before proving latency value

- High-level architecture
- Track A: terminal renderer (existing), unchanged
- Track B: native GUI renderer (`iced`), new
- Shared core target: renderer-agnostic frame data contract
- Frame contract v1: grid dimensions + cell payload (`char`, `fg`, `bg`) + optional dirty metadata
- Data flow v1: core produces frame -> GUI consumes frame -> GUI raster/present

- PoC implementation strategy
- Strategy: two-phase integration
- Strategy: phase 1 fastest validation path, tolerate duplication
- Strategy: phase 2 extraction for cleaner architecture only if phase 1 passes

- Phase 0: baseline + instrumentation hardening
- Task: add Rust-side per-frame timings around terminal `flush` internals
- Task: record `changed_cells`, `batches`, `bytes_written`, `first_diff`
- Task: export raw per-frame metrics to NDJSON/CSV for offline analysis
- Task: run baseline scenarios with fixed protocol
- Exit: baseline report with `p50/p95/p99/p99.9/max`, warmup excluded

- Phase 1: dependency and feasibility gate
- Task: validate `iced` viability
- Task: verify maintenance/adoption: latest release date, issue throughput, ecosystem usage
- Task: pin exact crate version, avoid floating semver
- Task: smoke-test minimal window + draw loop + resize handling
- Exit: documented go/no-go decision with evidence

- Phase 2: PoC crate scaffold
- Task: create crate `letui-gui-poc` (binary)
- Task: isolate feature flags so main package unaffected by default
- Task: add CLI flags
- Task: `--renderer terminal|iced`
- Task: `--scene static|churn|stress`
- Task: `--frames N`
- Task: `--headless-metrics` (no UI present path timing where possible)
- Exit: runnable binary switching renderer by flag

- Phase 3: frame contract extraction
- Task: define `FrameGrid` struct in shared Rust module
- Task: include metadata
- Task: `frame_id`
- Task: `width`, `height`
- Task: `cells: &[Cell]`
- Task: `dirty_rects` optional
- Task: add producer API in core to emit `FrameGrid` without terminal I/O
- Task: keep existing terminal flush path consuming same contract
- Exit: terminal path and GUI path consume identical frame contract

- Phase 4: iced renderer v1 (correctness first)
- Task: implement `iced` app with custom widget/canvas for cell grid
- Task: render full frame each tick first
- Task: verify color + glyph correctness against terminal snapshots
- Task: support resize, DPI scaling, font config
- Exit: visual parity for core primitives on representative scenes

- Phase 5: iced renderer v2 (latency tuning)
- Task: switch to dirty-rect rendering path
- Task: cache glyph raster/layout, precompute atlas where possible
- Task: reuse vertex/index buffers, no per-frame vec growth
- Task: move frame ingest to lock-free queue/ring buffer
- Task: minimize main-thread work before present
- Exit: steady-state p99 target hit on scene A, near-target on scene B

- Phase 6: optional VT compatibility path
- Task: integrate `libghostty-vt` as alternate input parser mode
- Task: `VT bytes -> grid ops -> shared FrameGrid -> iced renderer`
- Task: benchmark parser cost separately from raster/present
- Exit: compatibility demo with external TUI process + isolated parser metrics

- Bench protocol
- Scene A: static dashboard, tiny diffs
- Scene B: medium churn list updates + cursor movement
- Scene C: full-screen churn stress
- Warmup: first 120 frames excluded
- Sample size: minimum 5000 frames per scene
- Runs: 5 runs per scene per renderer
- Report: median of run-level p99 + worst-run p99
- Record environment per run
- Record: OS version
- Record: CPU model
- Record: refresh rate
- Record: power mode
- Record: terminal emulator (for baseline)

- Metrics schema (per frame)
- `frame_id`
- `ts_ns_start`
- `engine_ms`
- `transport_ms`
- `parse_ms` (VT mode only)
- `raster_ms`
- `present_wait_ms`
- `frame_total_ms`
- `changed_cells`
- `dirty_rect_count`
- `bytes_emitted`
- `alloc_count_delta` (if measurable)

- Guardrails for honest comparison
- Guardrail: same scenes, same update cadence, same machine state
- Guardrail: exclude startup and first-frame cold caches
- Guardrail: separate compute latency from display pacing
- Guardrail: publish raw metrics files, not only summary

- Risks
- Risk: `iced` text rendering path dominates tail latency
- Risk: vsync/compositor quantization masks renderer improvements
- Risk: lock contention between producer and UI thread
- Risk: allocation regressions reintroduced by scene updates
- Risk: false wins from biased measurement windows

- Mitigations
- Mitigation: include offscreen/headless timings where possible
- Mitigation: compare with vsync on/off configurations
- Mitigation: preallocate all frame buffers after first resize
- Mitigation: add CI perf sanity check with threshold alerts (non-blocking initially)

- Deliverables
- Deliverable: `letui-gui-poc` crate with renderer switch CLI
- Deliverable: shared frame contract module
- Deliverable: benchmark runner script and reproducible command list
- Deliverable: raw metrics artifacts + summary markdown report
- Deliverable: decision memo: continue iced / pivot / rollback

- Decision gates
- Gate 1 (post phase 1): `iced` viable -> continue or pivot framework
- Gate 2 (post phase 4): correctness acceptable -> begin tuning
- Gate 3 (post phase 5): p99 targets met -> proceed to integration roadmap
- Gate 4 (post phase 6 optional): VT mode worth maintaining -> keep or drop

- Proposed file/folder changes (PoC phase)
- `ICED_POC_PLAN.md` (this file)
- `letui-gui-poc/` (new crate)
- `letui-core/` (optional extraction if phase 3 requires)
- `scripts/bench-native.ts` or `scripts/bench-native.sh`
- `dump/bench/native/*.ndjson`
- `dump/bench/native/*.md`

- Execution order
- Step 1: phase 0
- Step 2: phase 1
- Step 3: phase 2
- Step 4: phase 3
- Step 5: phase 4
- Step 6: phase 5
- Step 7: phase 6 optional

- Immediate next task
- Next: implement phase 0 instrumentation first before adding GUI dependencies

```
./README.md
```
# letui

https://github.com/user-attachments/assets/a84f8b6c-86fd-4f42-9ec8-84edd24c7abd

TUI library written using Rust and TypeScript

**Core dependencies**:

- [`crossterm`](https://github.com/crossterm-rs/crossterm) - cross-platform terminal manipulation library
- [`taffy`](https://github.com/DioxusLabs/taffy) - UI layout engine

**TODO**:

### Priority 0: Text Registry (FFI Optimization)

**Goal**: Stop sending all text on every render. Register text once → get `u8` ID → pass only ID (1 byte) across FFI.

**Rust side**:

- Add `TextRegistry` struct: `slots: Vec<Option<String>>` (256 max), `free: Vec<u8>` (freelist)
- FFI functions:
  - `text_register(ptr, len) -> u8` — alloc slot, return ID (0 = failure/empty)
  - `text_update(id, ptr, len) -> i32` — replace text at existing ID
  - `text_free(id) -> i32` — return slot to freelist
  - `text_clear() -> i32` — reset all (on quit)
- In `paint()`: lock registry once at start, pass `&TextRegistry` down
- Change node parsing: read `text_id` field (u8 stored as f32), resolve via `reg.get(id)`

**TypeScript side**:

- Add FFI symbols for `text_register`, `text_update`, `text_free`, `text_clear`
- Create `TextIdRegistry` class:
  - `byNodeId: Map<number, { id: number; last: string }>`
  - `getOrCreate(nodeId, text)`: register if new, update if changed, return ID
  - `freeNode(nodeId)`: reclaim ID when node unmounts
- In serialization: replace `textLength` field with `textId`, remove `textData` concat
- Track `prevNodeIds` vs `currentNodeIds` each frame → free disappeared nodes

**Key details**:

- `u8` IDs are exactly representable in `f32` (no Float32Array change needed)
- ID 0 = empty/missing text (reserve slot 0)
- Must free IDs on node removal (255 usable slots max)
- Lock registry once per `paint()`, not per-node (perf)

**Expected result**: FFI traffic O(changed texts) instead of O(all texts every frame)

---

### Priority 1: Scrollable Containers

- [ ] Add `overflow: "hidden"` style prop → triggers clipping during paint
- [ ] Add `scrollX`/`scrollY` signals per scrollable node
- [ ] Pass scissor rect to Rust paint — skip cells outside bounds
- [ ] Horizontal scrolling first, then vertical

### Priority 2: Styled Text (Chunks)

- [ ] `TextChunk` type: `{ text: string; fg?: number; bg?: number; bold?: boolean }`
- [ ] Update `Text` component to accept `TextChunk[]` or plain string
- [ ] Serialize chunks to Rust for rendering

### Priority 3: Text Input

- [ ] Single-line input improvements (cursor position, selection)
- [ ] Multi-line text editor (builds on scrollable + input)

### Priority 4: Syntax Highlighting

- [ ] Tree-sitter integration (Rust bindings → FFI)
- [ ] TextMate-compatible theme loading (like OpenTUI's `SyntaxStyle`)

---

### Performance & Other

- [x] Move paint to Rust (currently 81% of frame time @ 1.7ms avg)
  - **Why**: Eliminates JS per-cell loops, staging buffer, and BigInt conversions
  - **New FFI function**: `paint(node_data, text_data, focused_id, pressed_id, colors...)`
  - **Rust side**:
    - Reuse parsed node tree from `calculate_layout` (already has frames)
    - Add `PaintNode` struct with: frame, bg, fg, border_color, border_style, text range, node_type
    - Implement `draw_background()`, `draw_border()`, `draw_text()`, `draw_cursor()` writing directly to `CURRENT_BUFFER`
    - Recursive `paint_node()` traversal matching JS logic
  - **TS side**:
    - Add `isFocused` and `isPressed` fields to serialization (FIELDS_PER_NODE: 13 → 15)
    - Replace JS `paint()` call with `api.paint(...)` FFI call
    - Keep `registerHit()` in JS for mouse hit testing (cheap traversal)
    - Remove `stagingBuffer` and `flushStagingBuffer()` (no longer needed)
  - **Expected result**: Paint phase from 1.7ms → ~0.1-0.2ms
- [ ] Add scrollable containers

- [ ] How to handle serialization of walls of text: https://ampcode.com/threads/T-019bdac3-ba03-745f-a3d3-c9d53bfa0648
- [ ] Add render caching - skip serialize/layout if signals unchanged (pi-mono pattern)
- [ ] Incremental tree updates - don't rebuild entire Taffy tree each frame, cache structure and update only changed nodes
- [ ] Visibility culling - skip `paint()` for off-screen nodes (OpenTUI's `_getVisibleChildren` pattern)

- [ ] Neovim as text input (use [Bun PTY support](https://bun.com/docs/runtime/child-process#terminal-pty-support))
- [ ] Will SIMD work if I wanna implement caching for serialization. For example, when comparing trees I used SIMD (idk what i'm talking about)
- [ ] Refactor flush function with BatchWriter pattern to reduce nesting
  - BatchWriter struct holds stdout ref, char_seq, batch_start_x/y, prev_fg/bg
  - `new()` initializes with sentinel colors (u64::MAX) to force first color emit
  - `push(x, y, ch, fg, bg)` handles gap detection, color changes, and accumulates chars
  - `flush_pending()` emits MoveTo + Print for accumulated batch
  - Encapsulates all batching logic, main loop just calls push() for changed cells
- [ ] Add performance stats overlay that update independently from rest of the app (can i use a separate thread?)
- [x] Add `flexGrow` support for dynamic width components (e.g., progress bars)
  - **TypeScript side:**
    - Add `flexGrow?: number` to `StyleProps` in `src/types.ts`
    - Update `createStyleSignals()` in `src/components.ts` to include `flexGrow: $(input.flexGrow)`
    - Update serialization in `src/runtime.ts` to pass `flexGrow` value to Rust (add to `FIELDS_PER_NODE`)
  - **Rust side:**
    - Increment `FIELDS_PER_NODE` from 12 to 13 in `lib.rs`
    - Add `flex_grow: f32` field to `Node` struct
    - Parse `flex_grow` in `parse_node()` function
    - Apply `style.flex_grow = node.flex_grow` in `get_styles()` for all node types
  - **Progress bar update:**
    - Remove fixed `width` prop from `ProgressBar`
    - Instead of `" ".repeat(n)`, use a single space `" "` for text
    - Set `flexGrow: progress / 100` on filled node, `flexGrow: (100 - progress) / 100` on unfilled node
    - Layout engine distributes space proportionally - bar auto-sizes to container
  - **Benefits:** No fixed width needed, bar fills available space, cleaner API

### NPM publish notes:

1. push your changes
2. update versions in `Cargo.toml` and `package.json`
3. `git tag v0.0.1` - tag a commit
4. `git push origin v0.0.1` - push the tag
5. release action will build and deploy it as package

```
./TEXT_SERIALIZATION_OPTIMIZATIONS.md
````
# Text Serialization Optimizations

This doc explains what's inefficient in the current TS→Rust text path and how to fix it.

---

## The Render Pipeline (How It Works Now)

Each frame:

1. **TS** serializes the node tree into `nodeData` (numbers) + `textData` (UTF-8 bytes)
2. **TS** calls Rust `paint(nodeDataPtr, nodeDataLen, textDataPtr, textDataLen)`
3. **Rust** parses the data, runs Taffy layout, paints to buffer
4. **TS** reads frames back and updates the terminal

---

## Problem 1: TypeScript Encodes Text Twice

### Current Code (runtime.ts:115-153)

```ts
// For each text node...
let textContent = "";
if (node.type === "text" || node.type === "input" || node.type === "button") {
  textContent = (node.props as any).text?.() ?? "";
}
const textLength = new TextEncoder().encode(textContent).length; // <-- ENCODE #1: just to get byte length!

if (textContent) {
  texts.push(textContent); // collect into array
}

// ... later, after traversing all nodes:
const textData = new TextEncoder().encode(texts.join("")); // <-- ENCODE #2: join strings, then encode again
```

### What's Wrong

1. **Per-node allocation**: `new TextEncoder().encode(textContent)` creates a new `Uint8Array` for every text node, just to read `.length`. That array is immediately thrown away.

2. **Double work**: All the text gets encoded once per-node (for length), then collected into an array, joined into one big string, and encoded again.

3. **Extra allocations**: `texts.push()` grows an array, `texts.join("")` creates a new string, then `encode()` creates the final `Uint8Array`.

### The Fix: Encode Once with `encodeInto`

Instead of encoding twice, use a single buffer and `encodeInto()` which writes directly and tells you how many bytes it wrote:

```ts
const textEncoder = new TextEncoder();
let textBuffer = new Uint8Array(4096);
let textWriteOffset = 0;

function writeText(s: string): number {
  // Ensure buffer has room (worst case: 4 bytes per char for emoji)
  const needed = s.length * 4;
  if (textWriteOffset + needed > textBuffer.length) {
    const newSize = Math.max(textBuffer.length * 2, textWriteOffset + needed);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(textBuffer.subarray(0, textWriteOffset));
    textBuffer = newBuffer;
  }

  const { written } = textEncoder.encodeInto(
    s,
    textBuffer.subarray(textWriteOffset),
  );
  textWriteOffset += written;
  return written; // this IS the byte length
}
```

Then in serialize():

```ts
// Reset at frame start
textWriteOffset = 0;

// For each node:
const textLength = textContent ? writeText(textContent) : 0;

// At the end:
const textData = textBuffer.subarray(0, textWriteOffset); // no copy, just a view
```

**Result**: One encode pass, no intermediate arrays, no join, no per-node allocations.

---

## Problem 2: Rust Allocates Strings That Get Cloned

### Current Code (lib.rs)

**Step 1 - parse_node() allocates a String (lines 346-354):**

```rust
let text = if text_len > 0 {
    let s = std::str::from_utf8(&text_data[*text_offset..*text_offset + text_len])
        .unwrap_or("")
        .to_string();  // <-- ALLOCATION: copies bytes into owned String
    *text_offset += text_len;
    s
} else {
    String::new()
};
```

**Step 2 - Node stores that String (lines 301-318):**

```rust
struct Node {
    // ...
    text: String,  // <-- owned String per node
    // ...
}
```

**Step 3 - node_type_to_context() clones it again (lines 439-457):**

```rust
NodeType::Text => NodeContext::Text {
    content: node.text.clone(),  // <-- CLONE: another allocation
    // ...
},
NodeType::Button => NodeContext::Button {
    label: node.text.clone(),    // <-- CLONE
    // ...
},
NodeType::Input => NodeContext::Input {
    content: node.text.clone(),  // <-- CLONE
    // ...
},
```

**Step 4 - NodeContext also stores owned Strings (lines 498-530):**

```rust
enum NodeContext {
    Text {
        content: String,  // <-- owned String
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,    // <-- owned String
        // ...
    },
    // ...
}
```

### What's Wrong

Every frame, for every text node:

1. `to_string()` allocates and copies UTF-8 bytes into a `String`
2. `clone()` allocates and copies that `String` again into `NodeContext`

That's 2 heap allocations per text node per frame. For a UI with 50 text elements at 60fps, that's 6000 allocations/second just for text.

### The Fix: Store Ranges, Decode On Demand

Instead of copying text into owned Strings, just remember where the text lives in `text_data`:

**Node stores a range:**

```rust
struct Node {
    // ...
    text_start: u32,  // offset into text_data
    text_len: u32,    // byte length
    // ...
}
```

**NodeContext stores a range:**

```rust
enum NodeContext {
    Text {
        text_start: u32,
        text_len: u32,
        fg: u32,
        bg: u32,
    },
    // ...
}
```

**Helper to decode when needed:**

```rust
fn get_text<'a>(text_data: &'a [u8], start: u32, len: u32) -> &'a str {
    if len == 0 { return ""; }
    std::str::from_utf8(&text_data[start as usize..(start + len) as usize]).unwrap_or("")
}
```

**parse_node() just tracks offsets:**

```rust
let text_start = *text_offset as u32;
let text_len = node_data[base + 11] as u32;
*text_offset += text_len as usize;
// No to_string()!
```

**node_type_to_context() passes ranges:**

```rust
NodeType::Text => NodeContext::Text {
    text_start: node.text_start,
    text_len: node.text_len,
    // No clone()!
    fg: node.fg,
    bg: node.bg,
},
```

**measure_function and paint decode on demand:**

```rust
// In measure_function, text_data is captured by the closure
let text = get_text(text_data, *text_start, *text_len);
let width = text.chars().count() as f32;
```

**Result**: Zero String allocations per frame. Text is decoded from the original `text_data` buffer only when actually needed for measuring or painting.

---

## Summary

| Where                     | Problem                                  | Fix                                   |
| ------------------------- | ---------------------------------------- | ------------------------------------- |
| TS serialize              | Encodes text twice; per-node allocations | Use `encodeInto` with reusable buffer |
| Rust parse_node           | `to_string()` allocates per node         | Store `(start, len)` range instead    |
| Rust node_type_to_context | `clone()` allocates again                | Pass range, no clone needed           |
| Rust measure/paint        | N/A (already uses `&str`)                | Decode on demand via `get_text()`     |

**Expected wins:**

- Lower GC pressure in TS
- Zero allocator calls in Rust hot path
- Same wire format, same API, just faster

`````
./letui-ffi/src/colors.rs
```
pub struct ColorScheme {
    pub bg: u32,
    pub bg_alt: u32,
    pub bg_highlight: u32,
    pub fg: u32,
    pub grey: u32,
    pub blue: u32,
    pub green: u32,
    pub cyan: u32,
    pub red: u32,
    pub yellow: u32,
    pub magenta: u32,
    pub pink: u32,
    pub orange: u32,
    pub purple: u32,
}

pub const DEFAULT: ColorScheme = ColorScheme {
    bg: 0x16181a,
    bg_alt: 0x1e2124,
    bg_highlight: 0x3c4048,
    fg: 0xffffff,
    grey: 0x7b8496,
    blue: 0x5ea1ff,
    green: 0x5eff6c,
    cyan: 0x5ef1ff,
    red: 0xff6e5e,
    yellow: 0xf1ff5e,
    magenta: 0xff5ef1,
    pink: 0xff5ea0,
    orange: 0xffbd5e,
    purple: 0xbd5eff,
};

pub const LIGHT: ColorScheme = ColorScheme {
    bg: 0xffffff,
    bg_alt: 0xeaeaea,
    bg_highlight: 0xacacac,
    fg: 0x16181a,
    grey: 0x7b8496,
    blue: 0x0057d1,
    green: 0x008b0c,
    cyan: 0x008c99,
    red: 0xd11500,
    yellow: 0x997b00,
    magenta: 0xd100bf,
    pink: 0xf40064,
    orange: 0xd17c00,
    purple: 0xa018ff,
};

```
./letui-ffi/src/lib.rs
```
/*
* Rust backend for my TUI library
* that exposes core methods to be calling in TypeScript using Bun's FFI module
*/

use crossterm::{
    cursor::{Hide, MoveTo},
    event::EnableMouseCapture,
    execute, queue,
    style::{Color, Print, SetBackgroundColor, SetForegroundColor},
    terminal::{
        BeginSynchronizedUpdate, Clear, ClearType, EndSynchronizedUpdate, EnterAlternateScreen,
        LeaveAlternateScreen, disable_raw_mode, enable_raw_mode, size,
    },
};
use std::{
    io::{Stdout, Write, stdout},
    os::raw::c_int,
    slice,
    sync::Mutex,
};
use taffy::{Overflow, Point, prelude::*};

mod colors;

static LAST_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));
static FRAMES: Mutex<Option<Vec<f32>>> = Mutex::new(None);
static FIRST_DIFF: Mutex<bool> = Mutex::new(true);

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    let buffer_size = (w as usize) * (h as usize) * 3;

    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = (w, h);

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(vec![0u64; buffer_size]);
    let mut lb = LAST_BUFFER.lock().unwrap();
    *lb = Some(vec![0u64; buffer_size]);

    1
}

#[unsafe(no_mangle)]
pub extern "C" fn init_letui() -> c_int {
    execute!(
        stdout(),
        EnterAlternateScreen,
        EnableMouseCapture,
        Clear(ClearType::All),
        Hide
    )
    .unwrap();
    enable_raw_mode().unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn deinit_letui() -> c_int {
    disable_raw_mode().unwrap();
    execute!(stdout(), LeaveAlternateScreen).unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_width() -> u16 {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    term_size.0
}

#[unsafe(no_mangle)]
pub extern "C" fn get_height() -> u16 {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    term_size.1
}

fn hex_to_color(hex: u64) -> Color {
    Color::Rgb {
        r: ((hex >> 16) & 0xFF) as u8,
        g: ((hex >> 8) & 0xFF) as u8,
        b: (hex & 0xFf) as u8,
    }
}

fn first_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64]) {
    if w == 0 || h == 0 {
        return;
    }

    let mut char_seq = String::with_capacity(w as usize);

    for y in 0..h {
        let row_start = (w * y) as usize * 3;
        let first_idx = row_start;
        let mut prev_fg = buf[first_idx + 1];
        let mut prev_bg = buf[first_idx + 2];
        char_seq.clear();
        queue!(
            stdout,
            MoveTo(0, y),
            SetForegroundColor(hex_to_color(prev_fg)),
            SetBackgroundColor(hex_to_color(prev_bg))
        )
        .unwrap();

        for x in 0..w {
            let idx = row_start + x as usize * 3;
            let curr_char = char::from_u32(buf[idx] as u32).unwrap();
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];

            if curr_fg == prev_fg && curr_bg == prev_bg {
                char_seq.push(curr_char);
                continue;
            }

            let fg_changed = curr_fg != prev_fg;
            let bg_changed = curr_bg != prev_bg;

            match (fg_changed, bg_changed) {
                (true, true) => {
                    queue!(
                        stdout,
                        Print(&char_seq),
                        SetForegroundColor(hex_to_color(curr_fg)),
                        SetBackgroundColor(hex_to_color(curr_bg))
                    )
                    .unwrap();
                }
                (true, false) => {
                    queue!(
                        stdout,
                        Print(&char_seq),
                        SetForegroundColor(hex_to_color(curr_fg))
                    )
                    .unwrap();
                }
                (false, true) => {
                    queue!(
                        stdout,
                        Print(&char_seq),
                        SetBackgroundColor(hex_to_color(curr_bg))
                    )
                    .unwrap();
                }
                (false, false) => {}
            }

            prev_fg = curr_fg;
            prev_bg = curr_bg;

            char_seq.clear();
            char_seq.push(curr_char);
        }
        queue!(stdout, Print(&char_seq)).unwrap();
    }
}

fn next_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64], last_buf: &[u64]) {
    let mut prev_fg = u64::MAX;
    let mut prev_bg = u64::MAX;

    for y in 0..h {
        let mut char_seq = String::with_capacity(w as usize);
        let mut batch_start_x = 0;

        for x in 0..w {
            let idx = (w * y + x) as usize * 3;
            let curr_code = buf[idx];
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];

            if buf[idx] == last_buf[idx]
                && buf[idx + 1] == last_buf[idx + 1]
                && buf[idx + 2] == last_buf[idx + 2]
            {
                continue;
            }

            let curr_char = char::from_u32(curr_code as u32).unwrap();

            if !char_seq.is_empty() && x != batch_start_x + char_seq.len() as u16 {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
                char_seq.clear();
                batch_start_x = x;
            }

            if curr_fg == prev_fg && curr_bg == prev_bg {
                if char_seq.is_empty() {
                    batch_start_x = x;
                }
                char_seq.push(curr_char);
                continue;
            }
            if curr_fg != prev_fg || curr_bg != prev_bg {
                queue!(
                    stdout,
                    MoveTo(batch_start_x, y),
                    Print(&char_seq),
                    SetForegroundColor(hex_to_color(curr_fg)),
                    SetBackgroundColor(hex_to_color(curr_bg))
                )
                .unwrap();
                prev_fg = curr_fg;
                prev_bg = curr_bg;

                char_seq.clear();
                char_seq.push(curr_char);
                batch_start_x = x;
            }
        }
        if !char_seq.is_empty() {
            queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn flush() -> c_int {
    let cb = CURRENT_BUFFER.lock().unwrap();
    let mut lb = LAST_BUFFER.lock().unwrap();
    let term_size = TERMINAL_SIZE.lock().unwrap();
    let (w, h) = *term_size;
    let mut stdout = stdout();

    let Some(ref buf) = *cb else {
        return 1;
    };
    let Some(ref mut last_buf) = *lb else {
        return 1;
    };

    queue!(stdout, BeginSynchronizedUpdate).unwrap();

    let mut first_diff = FIRST_DIFF.lock().unwrap();

    if *first_diff {
        first_flush(w, h, &mut stdout, buf);
        *first_diff = false;
    } else {
        next_flush(w, h, &mut stdout, buf, last_buf);
    }
    queue!(stdout, EndSynchronizedUpdate).unwrap();
    stdout.flush().unwrap();

    last_buf.copy_from_slice(buf);

    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer_ptr() -> *mut u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    match *cb {
        Some(ref buf) => buf.as_ptr() as *mut u64,
        None => std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer_len() -> u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    match *cb {
        Some(ref buf) => buf.len() as u64,
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer() -> c_int {
    *CURRENT_BUFFER.lock().unwrap() = None;
    *LAST_BUFFER.lock().unwrap() = None;
    *FIRST_DIFF.lock().unwrap() = true;

    execute!(
        stdout(),
        SetBackgroundColor(Color::Reset),
        SetForegroundColor(Color::Reset),
        Clear(ClearType::All)
    )
    .unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn update_terminal_size() -> c_int {
    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = size().unwrap();
    1
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum NodeType {
    Row = 1,
    Column = 2,
    Button = 3,
    Input = 4,
    Text = 5,
}

impl NodeType {
    fn from_f32(v: f32) -> Self {
        match v as u32 {
            1 => NodeType::Row,
            2 => NodeType::Column,
            3 => NodeType::Button,
            4 => NodeType::Input,
            5 => NodeType::Text,
            _ => NodeType::Column,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum BorderStyle {
    None = 0,
    Rounded = 1,
    Squared = 2,
}

impl BorderStyle {
    fn from_f32(v: f32) -> Self {
        match v as u32 {
            1 => BorderStyle::Rounded,
            2 => BorderStyle::Squared,
            _ => BorderStyle::None,
        }
    }
}

#[derive(Debug)]
struct Node {
    node_type: NodeType,
    gap: f32,
    padding_x: f32,
    padding_y: f32,
    border: f32,
    flex_grow: f32,
    text: String,
    children: Vec<Node>,
    bg: u32,
    fg: u32,
    border_color: u32,
    border_style: BorderStyle,
    node_id: u32,
    // TODO: want u32, see TODO below
    text_len: usize,
}

const FIELDS_PER_NODE: usize = 13;

fn parse_node(
    node_data: &[f32],
    node_offset: &mut usize,
    text_data: &[u8],
    text_offset: &mut usize,
) -> Node {
    let base = *node_offset;
    let node_type = NodeType::from_f32(node_data[base]);
    let gap = node_data[base + 1];
    let padding_x = node_data[base + 2];
    let padding_y = node_data[base + 3];
    let border = node_data[base + 4];
    let child_count = node_data[base + 5] as usize;
    let bg = node_data[base + 6] as u32;
    let fg = node_data[base + 7] as u32;
    let border_color = node_data[base + 8] as u32;
    let border_style = BorderStyle::from_f32(node_data[base + 9]);
    let node_id = node_data[base + 10] as u32;
    // TODO: I need this to be u32, not usize
    let text_len = node_data[base + 11] as usize;
    let flex_grow = node_data[base + 12];

    *node_offset += FIELDS_PER_NODE;

    let text = if text_len > 0 {
        let s = std::str::from_utf8(&text_data[*text_offset..*text_offset + text_len])
            .unwrap_or("")
            .to_string();
        *text_offset += text_len;
        s
    } else {
        String::new()
    };

    let mut children = Vec::with_capacity(child_count);
    for _ in 0..child_count {
        children.push(parse_node(node_data, node_offset, text_data, text_offset));
    }

    Node {
        node_type,
        gap,
        padding_x,
        padding_y,
        border,
        flex_grow,
        text,
        children,
        bg,
        fg,
        border_color,
        border_style,
        node_id,
        text_len,
    }
}

fn get_styles(node: &Node) -> Style {
    let mut style = Style {
        gap: Size {
            width: length(node.gap),
            height: zero(),
        },
        padding: Rect {
            left: length(node.padding_x),
            right: length(node.padding_x),
            top: length(node.padding_y),
            bottom: length(node.padding_y),
        },
        border: Rect {
            left: length(node.border),
            right: length(node.border),
            top: length(node.border),
            bottom: length(node.border),
        },
        flex_grow: node.flex_grow,
        ..Default::default()
    };

    match node.node_type {
        NodeType::Column => {
            style.flex_direction = FlexDirection::Column;
            style.align_items = Some(AlignItems::Stretch);
            style.overflow = Point {
                x: Overflow::Hidden,
                y: Overflow::Hidden,
            };
        }
        NodeType::Row => {
            style.flex_direction = FlexDirection::Row;
        }
        NodeType::Input => {
            style.flex_direction = FlexDirection::Row;
            if node.flex_grow == 0.0 {
                style.flex_grow = 1.0;
            }
        }
        _ => {}
    }

    style
}

fn node_type_to_context(node: &Node) -> NodeContext {
    match node.node_type {
        NodeType::Column => NodeContext::Column {
            bg: node.bg,
            fg: node.fg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Row => NodeContext::Row {
            bg: node.bg,
            fg: node.fg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Text => NodeContext::Text {
            content: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
        },
        NodeType::Button => NodeContext::Button {
            label: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Input => NodeContext::Input {
            content: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
    }
}

fn build_taffy_tree(taffy: &mut TaffyTree<NodeContext>, taffy_root: &NodeId, tree_node: &Node) {
    for child in &tree_node.children {
        let child_styles = get_styles(child);
        let context = node_type_to_context(child);

        let taffy_child = taffy.new_leaf_with_context(child_styles, context).unwrap();
        taffy.add_child(*taffy_root, taffy_child).unwrap();

        build_taffy_tree(taffy, &taffy_child, child);
    }
}

fn build_frames_array(
    taffy: &mut TaffyTree<NodeContext>,
    node: NodeId,
    out: &mut Vec<f32>,
    offset_x: f32,
    offset_y: f32,
) -> () {
    let layout = taffy.layout(node).unwrap();

    let absolute_x = offset_x + layout.location.x;
    let absolute_y = offset_y + layout.location.y;

    out.extend([
        absolute_x,
        absolute_y,
        layout.size.width,
        layout.size.height,
    ]);

    let children = taffy.children(node).unwrap();
    for child in children {
        build_frames_array(taffy, child, out, absolute_x, absolute_y);
    }
}

enum NodeContext {
    Text {
        content: String,
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,
        fg: u32,
        bg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Input {
        content: String,
        fg: u32,
        bg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Row {
        bg: u32,
        fg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Column {
        bg: u32,
        fg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
}

fn measure_function(
    known_dimensions: Size<Option<f32>>,
    available_space: Size<AvailableSpace>,
    _node_id: NodeId,
    node_context: Option<&mut NodeContext>,
    _style: &Style,
) -> Size<f32> {
    if let Size {
        width: Some(width),
        height: Some(height),
    } = known_dimensions
    {
        return Size { width, height };
    }

    let text = match node_context {
        Some(NodeContext::Text { content, .. }) => content.as_str(),
        Some(NodeContext::Button { label, .. }) => label.as_str(),
        Some(NodeContext::Input { content, .. }) => content.as_str(),
        Some(NodeContext::Row { .. }) | Some(NodeContext::Column { .. }) => return Size::ZERO,
        None => return Size::ZERO,
    };

    let text_width = text.chars().count() as f32;

    let max_width = match available_space.width {
        AvailableSpace::Definite(w) => w,
        _ => text_width,
    };

    if text_width <= max_width {
        return Size {
            width: text_width,
            height: 1.0,
        };
    }

    let words: Vec<&str> = text.split_whitespace().collect();
    let mut lines = 1;
    let mut current_width: f32 = 0.0;
    let mut max_line_width: f32 = 0.0;

    for word in words {
        let word_width = word.chars().count() as f32;
        let needed_width = if current_width == 0.0 {
            word_width
        } else {
            current_width + 1.0 + word_width
        };

        if needed_width > max_width {
            lines += 1;
            max_line_width = max_line_width.max(current_width);
            current_width = word_width;
        } else {
            current_width = needed_width;
        }
    }

    Size {
        width: max_line_width.max(max_width),
        height: lines as f32,
    }
}

fn draw_background_at(buf: &mut [u64], x: f32, y: f32, w: f32, h: f32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = (x + w).min(tw as f32) as u16;
    let y_end = (y + h).min(th as f32) as u16;

    for row in y_start..y_end {
        for col in x_start..x_end {
            let idx = (tw * row + col) as usize * 3;
            if idx + 2 < buf.len() {
                buf[idx] = ' ' as u64;
                buf[idx + 2] = bg as u64;
            }
        }
    }
}

fn draw_text_at(buf: &mut [u64], x: f32, y: f32, text: &str, fg: u32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_row = y as u16;

    if y_row >= th {
        return;
    }

    for (i, ch) in text.chars().enumerate() {
        let col = x_start + i as u16;
        if col >= tw {
            break;
        }
        let idx = (tw * y_row + col) as usize * 3;
        buf[idx] = ch as u64;
        buf[idx + 1] = fg as u64;
        buf[idx + 2] = bg as u64;
    }
}

fn draw_border_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: u32,
    bg: u32,
    style: BorderStyle,
    tw: u16,
    th: u16,
) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = ((x + w) as u16).saturating_sub(1).min(tw.saturating_sub(1));
    let y_end = ((y + h) as u16).saturating_sub(1).min(th.saturating_sub(1));

    let (tl, tr, bl, br, h_line, v_line) = match style {
        BorderStyle::Rounded => ('╭', '╮', '╰', '╯', '─', '│'),
        BorderStyle::Squared => ('┌', '┐', '└', '┘', '─', '│'),
        BorderStyle::None => return,
    };

    let set_cell = |buf: &mut [u64], col: u16, row: u16, ch: char| {
        if col < tw && row < th {
            let idx = (tw * row + col) as usize * 3;
            buf[idx] = ch as u64;
            buf[idx + 1] = color as u64;
            buf[idx + 2] = bg as u64;
        }
    };

    set_cell(buf, x_start, y_start, tl);
    set_cell(buf, x_end, y_start, tr);
    set_cell(buf, x_start, y_end, bl);
    set_cell(buf, x_end, y_end, br);

    for col in (x_start + 1)..x_end {
        set_cell(buf, col, y_start, h_line);
        set_cell(buf, col, y_end, h_line);
    }
    for row in (y_start + 1)..y_end {
        set_cell(buf, x_start, row, v_line);
        set_cell(buf, x_end, row, v_line);
    }
}

fn draw_cursor_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    text_len: f32,
    fg: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    let col = (x + text_len) as u16;
    let row = y as u16;

    if col < tw && row < th {
        let idx = (tw * row + col) as usize * 3;
        if idx + 2 < buf.len() {
            buf[idx] = '█' as u64;
            buf[idx + 1] = fg as u64;
            buf[idx + 2] = bg as u64;
        }
    }
}

fn paint_taffy_node(
    taffy: &TaffyTree<NodeContext>,
    node_id: NodeId,
    buf: &mut [u64],
    abs_x: f32,
    abs_y: f32,
    parent_fg: u32,
    parent_bg: u32,
    tw: u16,
    th: u16,
) {
    let layout = taffy.layout(node_id).unwrap();
    let x = abs_x + layout.location.x;
    let y = abs_y + layout.location.y;
    let w = layout.size.width;
    let h = layout.size.height;

    // Content box position (inside border + padding)
    let content_x = abs_x + layout.content_box_x();
    let content_y = abs_y + layout.content_box_y();

    let (fg, bg) = match taffy.get_node_context(node_id) {
        Some(NodeContext::Text { content, fg, bg }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_text_at(buf, content_x, content_y, content, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            draw_text_at(buf, content_x, content_y, label, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            draw_text_at(buf, content_x, content_y, content, fg, bg, tw, th);
            draw_cursor_at(
                buf,
                content_x,
                content_y,
                content.chars().count() as f32,
                fg,
                bg,
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Row {
            fg,
            bg,
            border_color,
            border_style,
        })
        | Some(NodeContext::Column {
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            (fg, bg)
        }
        None => (parent_fg, parent_bg),
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, buf, x, y, fg, bg, tw, th);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn paint(pn: *const f32, ln: u32, pt: *const u8, lt: u32) -> c_int {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    let (tw, th) = *term_size;
    drop(term_size); // Release early

    let node_data = unsafe { slice::from_raw_parts(pn, ln as usize) };
    let text_data = unsafe { slice::from_raw_parts(pt, lt as usize) };

    let mut node_offset = 0usize;
    let mut text_offset = 0usize;
    let root_node = parse_node(node_data, &mut node_offset, text_data, &mut text_offset);

    let mut taffy: TaffyTree<NodeContext> = TaffyTree::new();

    let mut root_styles = get_styles(&root_node);
    root_styles.size = Size {
        width: length(tw),
        height: length(th),
    };

    let context = node_type_to_context(&root_node);
    let root = taffy.new_leaf_with_context(root_styles, context).unwrap();

    build_taffy_tree(&mut taffy, &root, &root_node);

    let _ = taffy.compute_layout_with_measure(
        root,
        Size {
            width: length(tw),
            height: length(th),
        },
        |known_dimensions, available_space, node_id, node_context, style| {
            measure_function(
                known_dimensions,
                available_space,
                node_id,
                node_context,
                style,
            )
        },
    );

    let mut frame_lock = FRAMES.lock().unwrap();
    let frames_vec = frame_lock.get_or_insert_with(Vec::new);
    frames_vec.clear();
    build_frames_array(&mut taffy, root, frames_vec, 0.0, 0.0);
    drop(frame_lock);

    let parent_fg = colors::DEFAULT.fg;
    let parent_bg = colors::DEFAULT.bg;

    // Single lock for entire paint phase
    let mut cb = CURRENT_BUFFER.lock().unwrap();
    if let Some(ref mut buf) = *cb {
        paint_taffy_node(&taffy, root, buf, 0.0, 0.0, parent_fg, parent_bg, tw, th);
    }

    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_ptr() -> *const f32 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.as_ptr(),
        None => std::ptr::null(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_len() -> u64 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.len() as u64,
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn debug_buffer(idx: u64) -> u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    if let Some(ref buf) = *cb {
        if buf.len() < idx as usize {
            return 0;
        }
        println!("{}", buf[idx as usize]);
        return buf[idx as usize];
    } else {
        0
    }
}

```
./legacy/v0.ts
```typescript
init_buffer();

const getBuffer = () => {
  const bufPtr = get_buffer_ptr()!;
  const bufLen = Number(get_buffer_len()!);

  return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
};

let buffer = getBuffer();

let canQuit = true;

let terminalWidth = get_width();
let terminalHeight = get_height();

const debugLogPath = "./logs.txt";

const MOUSE_EVENT_PREFIX = "\u001b[<";
const isMouseEvent = (d: string) => {
  if (d.startsWith(MOUSE_EVENT_PREFIX)) {
    return true;
  }
  return false;
};

let hitIdCounter = 0;
const componentMap = new Map<number, Button | Input>();
const hitMap = new Map<number, number>();
const getHitComponent = (x: number, y: number): Button | Input => {
  const component = componentMap.get(hitMap.get(y * terminalWidth + x)!);
  return component!;
};

const handleMouseEvent = async (d: string) => {
  const i = d.indexOf("<") + 1;
  const j = d.length - 1;
  const c = d.slice(i, j).split(";");
  await appendFile(debugLogPath, `parsed: ${JSON.stringify(c)}\n`);
  const isPress = d[d.length - 1] === "M";
  const isRelease = d[d.length - 1] === "m";
  const x = Number(c[1]!) - 1;
  const y = Number(c[2]!) - 1;

  if (c[0] == "0") {
    await appendFile(debugLogPath, `mouse left button at (${x}, ${y})\n`);
    await appendFile(debugLogPath, `hitMap key: ${y * terminalWidth + x}\n`);
    await appendFile(
      debugLogPath,
      `hitMap has key: ${hitMap.has(y * terminalWidth + x)}\n`,
    );

    const hitComponent: Button | Input = getHitComponent(x, y);
    if (hitComponent instanceof Button) {
      if (isPress) {
        await appendFile(debugLogPath, "pressed\n");
        await hitComponent?.press();
      }
      if (isRelease) {
        await appendFile(debugLogPath, "released\n");
        await hitComponent?.release();
      }
    }
    if (hitComponent instanceof Input) {
      canType = hitComponent.id;
    }
  }
};

let canType = 0;

const handleKeyboardEvent = (d: string) => {
  if (canType === 0) return;

  let input = componentMap.get(canType)! as Input;
  input.setText(d);
};

init_letui();
process.stdin.resume();
Bun.write(debugLogPath, "");
process.stdin.on("data", async (data) => {
  // hex notation
  // await appendFile(
  //   debugLogPath,
  //   Array.from(data)
  //     .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
  //     .join(" ") + "\n",
  // );
  // unicode escape sequence (code point)
  await appendFile(debugLogPath, JSON.stringify(data.toString()) + "\n\n");

  const d = data.toString();

  if (isMouseEvent(d)) {
    await appendFile(debugLogPath, "isMouseEvent\n");
    await handleMouseEvent(d);
    return;
  }

  if (d === "\u0011" && canQuit) {
    free_buffer();
    deinit_letui();
    process.exit(0);
  }

  handleKeyboardEvent(d);
});

process.stdout.on("resize", () => {
  update_terminal_size();
  terminalWidth = get_width();
  terminalHeight = get_height();

  free_buffer();
  init_buffer();
  buffer = getBuffer();

  // v.render();
});

type Border = "none" | "square" | "rounded";
type Justify = "start" | "end";

class View {
  children: (Column | Row | Text | Button | Input)[] = [];

  constructor() {}

  add(child: Column | Row | Text | Button | Input) {
    this.children.push(child);

    return this;
  }

  render() {
    let x = 0;
    let y = 0;
    for (const child of this.children) {
      child.render(x, y, { w: terminalWidth, h: terminalHeight });
      y += child.size().h;
      x = child.size().w > x ? child.size().w : x;
    }

    flush();
  }
}

class Row {
  id: number;
  children: (Column | Row | Text | Input | Button)[] = [];

  border: Border = "none";
  justify: Justify = "start";

  constructor(border: Border = "none", justify: Justify = "start") {
    this.border = border;
    this.justify = justify;
    this.id = hitIdCounter++;
  }

  add(child: Column | Row | Text | Input | Button) {
    this.children.push(child);
    return this;
  }

  size() {
    let w = 0;
    let h = 0;

    for (const c of this.children) {
      w += c.size().w;
      h = c.size().h > h ? c.size().h : h;
    }

    return {
      w: w + (this.border !== "none" ? 2 : 0),
      h: h + (this.border !== "none" ? 2 : 0),
    };
  }

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft =
        yo * terminalWidth + xo + terminalWidth * (this.size().h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      let topRight = topLeft + w - 1;
      let bottomRight = bottomLeft + w - 1;

      let middleLeft = topLeft;
      let middleRight = topRight;
      for (let i = 0; i < this.size().h - 2; i++) {
        middleLeft += terminalWidth;
        middleRight += terminalWidth;

        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          middleLeft * 3,
        );

        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          middleRight * 3,
        );
      }

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    let pad = 0;
    if (this.justify === "end") {
      pad = w - this.size().w;
    }
    let cx = pad + (this.border !== "none" ? 1 : 0);
    for (const c of this.children) {
      let cw = w - (this.border !== "none" ? 2 : 0);

      if (c instanceof Input) {
        let x = 0;
        for (let c of this.children) {
          if (c instanceof Input) continue;
          x += c.size().w;
        }
        cw = w - x - 2; // "- 2" because in size() Input.size().w doesn't account for container filling
      }

      c.render(cx + xo, yo + (this.border !== "none" ? 1 : 0), {
        w: cw,
        h: h - (this.border !== "none" ? 2 : 0),
      });
      cx += c instanceof Input ? cw : c.size().w;
    }
  }
}

class Column {
  id: number;
  children: (Column | Row | Text | Button | Input)[] = [];

  border: Border = "none";
  justify: Justify = "start";

  constructor(border: Border = "none", justify: Justify = "start") {
    this.border = border;
    this.justify = justify;
    this.id = hitIdCounter++;
  }

  add(child: Column | Row | Text | Button | Input) {
    this.children.push(child);
    return this;
  }

  size() {
    let w = 0;
    let h = 0;

    for (const c of this.children) {
      w = c.size().w > w ? c.size().w : w;
      h += c.size().h;
    }

    return {
      w: w + (this.border !== "none" ? 2 : 0),
      h: h + (this.border !== "none" ? 2 : 0),
    };
  }

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft = yo * terminalWidth + xo + terminalWidth * (h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      for (let i = 1; i < h - 1; i++) {
        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          (topLeft + i * terminalWidth) * 3,
        );
      }

      let topRight = topLeft + w - 1;
      let bottomRight = topRight + (h - 1) * terminalWidth;
      for (let i = 1; i < h - 1; i++) {
        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          (topRight + i * terminalWidth) * 3,
        );
      }

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    let cy = this.border !== "none" ? 1 : 0;
    if (this.justify === "end") {
      cy += h - this.size().h;
    }

    for (const c of this.children) {
      c.render(xo + this.border !== "none" ? 1 : 0, cy + yo, {
        w: w - (this.border !== "none" ? 2 : 0),
        h: h - (this.border !== "none" ? 2 : 0),
      });
      cy += c.size().h;
    }
  }
}

class Text {
  id: number;
  text: string;
  fg: number;
  bg: number;

  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();

  width: number;
  height: number;

  constructor(text: string, fg: number, bg: number, border: Border = "none") {
    this.border = border;
    this.width = [...text].length + (border !== "none" ? 2 : 0);
    this.height = 1;

    this.text = text;
    this.fg = fg;
    this.bg = bg;

    this.id = hitIdCounter++;

    this.prerender();
  }

  prerender() {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(BigInt(c.codePointAt(0)!), BigInt(this.fg), BigInt(this.bg));
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  size() {
    return { w: this.width, h: this.height };
  }

  render(xo: number, yo: number) {
    const cursor = terminalWidth * yo + xo;
    buffer.set(this.prebuilt.subarray(0), cursor * 3);
  }
}

type RGB = { r: number; g: number; b: number };
const hexToRgb = (hex: number) => ({
  r: (hex >> 16) & 0xff,
  g: (hex >> 8) & 0xff,
  b: hex & 0xff,
});
const rgbToHex = ({ r, g, b }: RGB) => {
  return (r << 16) | (g << 8) | b;
};

const lightenRgb = ({ r, g, b }: RGB, amount: number = 8) => ({
  r: Math.min(r + amount, 255),
  g: Math.min(g + amount, 255),
  b: Math.min(b + amount, 255),
});

class Button {
  id: number;
  px = 4;
  py = 1;
  text: string;
  fg: number;
  active_fg: number;
  bg: number;
  active_bg: number;

  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();

  width: number;
  height: number;

  onClick: (() => Promise<void>) | (() => void) | null = null;

  constructor(
    text: string,
    fg: number,
    bg: number,
    border: Border = "none",
    active_fg?: number,
    active_bg?: number,
  ) {
    this.border = border;
    this.width = [...text].length + (border !== "none" ? 2 : 0);
    this.height = 1;

    this.text = text;
    this.fg = fg;
    this.bg = bg;

    this.active_fg = active_fg || rgbToHex(lightenRgb(hexToRgb(fg)));
    this.active_bg = active_bg || rgbToHex(lightenRgb(hexToRgb(bg)));

    this.id = hitIdCounter++;
    componentMap.set(this.id, this);
  }

  prerender(active: boolean = false) {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(
        BigInt(c.codePointAt(0)!),
        BigInt(active ? this.active_fg : this.fg),
        BigInt(active ? this.active_bg : this.bg),
      );
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  size() {
    return { w: this.width + 2 * this.px, h: this.height + 2 * this.py };
  }

  xo: number = 0;
  yo: number = 0;
  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;

    this.prerender();

    // top part
    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    // bottom part
    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    // middle part
    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.fg),
              BigInt(this.bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    // actual text
    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );

    this.updateHitMap(xo, yo);
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  async release() {
    const xo = this.xo;
    const yo = this.yo;

    this.prerender();

    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.fg),
              BigInt(this.bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );
    flush();
  }

  async press() {
    await this.onClick?.();

    const xo = this.xo;
    const yo = this.yo;

    this.prerender(true);

    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.active_fg),
            BigInt(this.active_bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.active_fg),
            BigInt(this.active_bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.active_fg),
              BigInt(this.active_bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );
    flush();
  }
}

class Input {
  id: number;
  text: string = "";
  fg: number;
  bg: number;
  multiline: boolean;
  border: Border;

  constructor(
    fg: number,
    bg: number,
    border: Border,
    multiline: boolean = false,
  ) {
    this.multiline = multiline;
    this.border = border;

    this.fg = fg;
    this.bg = bg;

    this.id = hitIdCounter++;
    componentMap.set(this.id, this);

    this.prerender();
  }

  getMultilineTextHeight() {
    return 1;
  }

  size() {
    return {
      w: [...this.text].length + (this.border !== "none" ? 2 : 0),
      h: this.multiline
        ? this.getMultilineTextHeight()
        : 1 + (this.border !== "none" ? 2 : 0),
    };
  }

  prebuilt: BigUint64Array = new BigUint64Array();
  prerender() {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(BigInt(c.codePointAt(0)!), BigInt(this.fg), BigInt(this.bg));
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  xo: number = 0;
  yo: number = 0;
  containerSize: { w: number; h: number } = { w: 0, h: 0 };
  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;
    this.containerSize = { w, h };

    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft =
        yo * terminalWidth + xo + terminalWidth * (this.size().h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      let middleLeft = topLeft + terminalWidth;
      let topRight = topLeft + w - 1;
      let middleRight = topRight + terminalWidth;
      let bottomRight = middleRight + terminalWidth;

      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleLeft * 3,
      );

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    const cursor =
      terminalWidth * (this.border === "none" ? yo : yo + 1) +
      xo +
      (this.border === "none" ? 2 : 1);
    buffer.set(this.prebuilt.subarray(0), cursor * 3);

    this.updateHitMap(xo, yo);

    flush();
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.containerSize.w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  press() {}

  release() {}

  setText(v: string) {
    this.text += v;
    this.prerender();
    this.render(this.xo, this.yo, this.containerSize);
  }

  clearText() {
    this.text = "";
    this.prerender();
    this.render(this.xo, this.yo, this.containerSize);
  }
}

const v = new View();
const c = new Column("rounded", "start");

const r1 = new Row("rounded", "start");
const i1 = new Input(cl.magenta, cl.bg, "rounded", false);
const b1 = new Button("button", cl.bg, cl.green, "none", cl.cyan, cl.yellow);
r1.add(i1);
r1.add(b1);
c.add(r1);
v.add(c);

type Activity = {
  platform: string;
  title: string;
  url: string;
  date: string;
};
let results: Array<Activity> = [];

b1.onClick = async () => {
  const searchTerm = i1.text;
  const r = await fetch("https://api.whatmedoin.frixaco.com/activity");
  const d = (await r.json()) as Activity;
  i1.clearText();

  results.push(d);

  for (const r of results) {
    const item = new Row("rounded", "start");
    item.add(new Text(r.title, cl.fg, cl.bg));
    c.add(item);
    v.render();
    results = [];
  }
};

v.render();

```
./legacy/v1.ts
```typescript
import { ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors.ts";
import api from "./ffi.ts";
import { $, ff, type Signal } from "./signals";
import {
  startFrame,
  endFrame,
  startPhase,
  endLayout,
  endPaint,
  formatMetrics,
} from "./metrics.ts";

function log(_txt: string) {
  // noop - for debugging
}

const generateId = (() => {
  let counter = 1;
  return () => {
    return counter++;
  };
})();

export function run(
  nodeFactory: (tw: number, th: number) => Node,
  deps: Signal<any>[],
  focusedIdSignal?: Signal<number>,
) {
  api.init_buffer();
  api.init_letui();
  process.stdin.resume();

  let pressedComponentId = $(0);
  let focusedComponentId = focusedIdSignal || $(0);

  let terminalWidth = $(api.get_width());
  let terminalHeight = $(api.get_height());

  let spatialLookup = new Array(terminalWidth() * terminalHeight());
  let nodeRegistry = new Map<number, Node>();

  function getComponentAt(x: number, y: number): Node | undefined {
    const id = spatialLookup[y * terminalWidth() + x];
    return id ? nodeRegistry.get(id) : undefined;
  }

  function registerHit(n: Node) {
    const { x, y, width, height } = n.frame;
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        spatialLookup[row * terminalWidth() + col] = n.id;
      }
    }
  }

  function setFocus(newId: number) {
    focusedComponentId(newId);
  }

  function clearFocus() {
    focusedComponentId(0);
  }

  function getNodeById(id: number): Node | undefined {
    return nodeRegistry.get(id);
  }

  function handleKeyboardEvent(d: string) {
    const focused = getNodeById(focusedComponentId());
    if (!focused) return;

    if (focused.type === "button") {
      if (d === "\r" || d === " ") {
        (focused.props as ButtonProps).onClick();
      } else {
        const onKeyDown = (focused.props as ButtonProps).onKeyDown;
        if (onKeyDown) {
          onKeyDown(d);
        }
      }
      return;
    }

    if (focused.type === "input") {
      const props = focused.props as InputBoxProps;
      const curr = props.text() ?? "";

      if (d === "\x7f") {
        props.onType(curr.slice(0, -1));
      } else if (d === "\r") {
        props.onSubmit?.(curr);
        clearFocus();
      } else if (d.length === 1) {
        const code = d.charCodeAt(0);
        if (code >= 32 && code <= 126) {
          props.onType(curr + d);
        }
      }
      return;
    }
  }

  function handleMouseEvent(d: string) {
    const i = d.indexOf("<") + 1;
    const j = d.length - 1;
    const parts = d.slice(i, j).split(";");
    const isPress = d.endsWith("M");
    const isRelease = d.endsWith("m");
    const cb = Number(parts[0]);
    const x = Number(parts[1]) - 1;
    const y = Number(parts[2]) - 1;

    const btn = cb & 0b11;
    const isLeftPress = isPress && btn === 0;

    const target = getComponentAt(x, y);

    if (isLeftPress) {
      if (target) {
        pressedComponentId(target.id);
        setFocus(target.id);
      } else {
        pressedComponentId(0);
        clearFocus();
      }
      return;
    }

    if (isRelease) {
      const pressed = getNodeById(pressedComponentId());
      if (pressed && target && target.id === pressed.id) {
        if (pressed.type === "button") {
          (pressed.props as ButtonProps).onClick();
        }
      }
      pressedComponentId(0);
      return;
    }
  }

  const isMouseEvent = (d: string) => d.startsWith("\u001b[<");

  process.stdin.on("data", (data) => {
    const d = data.toString();

    if (d === "\u0011") {
      api.free_buffer();
      api.deinit_letui();
      const stats = formatMetrics();
      Bun.write("metrics.txt", stats + "\n");
      console.log(stats);
      process.exit(0);
    }

    if (isMouseEvent(d)) {
      handleMouseEvent(d);
      return;
    }

    handleKeyboardEvent(d);
  });

  let getBuffer = () => {
    const bufPtr = api.get_buffer_ptr()!;
    const bufLen = Number(api.get_buffer_len()!);

    return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
  };
  let buffer = getBuffer();

  process.stdout.on("resize", () => {
    api.update_terminal_size();

    terminalWidth(api.get_width());
    terminalHeight(api.get_height());

    api.free_buffer();
    api.init_buffer();

    buffer = getBuffer();
    spatialLookup = new Array(terminalWidth() * terminalHeight());
  });

  function serializeNodes(
    node: Node,
    result: Float32Array,
    offset: number,
    texts: string[],
  ) {
    // 1 - row
    // 2 - column
    // 3 - button
    // 4 - input
    // 5 - text
    let nodeType =
      node.type === "row"
        ? 1
        : node.type === "column"
          ? 2
          : node.type === "button"
            ? 3
            : node.type === "input"
              ? 4
              : node.type === "text"
                ? 5
                : 0;

    result[offset++] = nodeType;
    result[offset++] = (node.props as ColumnProps)?.gap || 0;

    let padding = node.props.padding;
    let paddingX = padding as number;
    let paddingY = padding as number;
    if (typeof padding === "string") {
      [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
    }

    result[offset++] = paddingX;
    result[offset++] = paddingY;
    result[offset++] = node.props?.border ? 1 : 0;
    result[offset++] = node.children.length;
    result[offset++] = node.props.bg || COLORS.default.bg;
    result[offset++] = node.props.fg || COLORS.default.bg;
    result[offset++] =
      node.props.border?.color || node.props.bg || COLORS.default.bg;
    let borderStyle =
      node.props.border?.style === "rounded"
        ? 1
        : node.props.border?.style === "square"
          ? 2
          : 0;
    result[offset++] = borderStyle;
    result[offset++] = node.id;

    let hasText =
      node.type === "input" || node.type === "text" || node.type === "button";
    const textValue = hasText
      ? (node.props as TextProps | InputBoxProps | ButtonProps).text() || ""
      : "";
    result[offset++] = [...textValue].length;

    if (hasText && textValue) {
      texts.push(textValue);
    }

    for (let child of node.children) {
      offset = serializeNodes(child, result, offset, texts);
    }

    return offset;
  }

  function countNodes(node: Node): number {
    return 1 + node.children.reduce((a, c) => a + countNodes(c), 0);
  }

  function layout(node: Node) {
    let nodeCount = countNodes(node);
    let FIELDS_PER_NODE = 12;
    let nodeData: Float32Array = new Float32Array(nodeCount * FIELDS_PER_NODE);
    let offset = 0;
    let texts: string[] = [];

    serializeNodes(node, nodeData, offset, texts);

    const textBuffer = new TextEncoder().encode(texts.join(""));
    const safeTextBuffer =
      textBuffer.length > 0 ? textBuffer : new Uint8Array(1);

    api.calculate_layout(
      ptr(nodeData),
      nodeData.length,
      ptr(safeTextBuffer),
      textBuffer.length,
      terminalWidth(),
      terminalHeight(),
    );

    const framesPtr = api.get_frames_ptr()!;
    const framesLen = Number(api.get_frames_len()!);

    let frameArray = new Float32Array(
      toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4),
    );

    let idx = 0;
    function updateFrames(n: Node) {
      n.frame.x = frameArray![idx++]!;
      n.frame.y = frameArray![idx++]!;
      n.frame.width = frameArray![idx++]!;
      n.frame.height = frameArray![idx++]!;
      n.children.forEach(updateFrames);
    }
    updateFrames(node);
  }

  function triggerLayoutEvents(node: Node) {
    if (node.props.onLayout) {
      node.props.onLayout(node);
    }
    node.children.forEach(triggerLayoutEvents);
  }

  function paint(
    node: Node,
    overrideBg: number = COLORS.default.bg,
    clipBounds?: { x: number; y: number; width: number; height: number },
  ) {
    nodeRegistry.set(node.id, node);

    if (clipBounds) {
      const nodeBottom = node.frame.y + node.frame.height;
      const clipBottom = clipBounds.y + clipBounds.height;

      if (node.frame.y < clipBounds.y || nodeBottom > clipBottom) {
        return;
      }
    }

    if (node.type === "column") {
      let { bg = overrideBg } = node.props as ColumnProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);
    }

    if (node.type === "row") {
      let { bg = overrideBg } = node.props as RowProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);
    }

    if (node.type === "text") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        padding,
        text,
      } = node.props as TextProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }
      let cells: bigint[] = [];
      for (const c of text()) {
        cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let textBuffer = new BigUint64Array(cells);
      let offset =
        (node.frame.y + paddingY + (border !== "none" ? 1 : 0)) *
          terminalWidth() +
        node.frame.x +
        paddingX +
        (border !== "none" ? 1 : 0);
      buffer.set(textBuffer, offset * 3);
    }

    if (node.type === "button") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        padding,
        text: buttonText,
        focus = false,
      } = node.props as ButtonProps;

      if (focus && initialRender) {
        initialRender = false;
        focusedComponentId(node.id);
      }

      let isFocused = focusedComponentId() === node.id;
      let isPressed = pressedComponentId() === node.id;

      drawBackground(buffer, node, isPressed ? fg : bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          isFocused ? COLORS.default.green : COLORS.default.fg,
          isPressed ? fg : bg,
        );
      }

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      const drawLine = (text: string, x: number, y: number) => {
        let cells: bigint[] = [];
        for (const c of text) {
          cells.push(
            BigInt(c.codePointAt(0)!),
            BigInt(isPressed ? bg : fg),
            BigInt(isPressed ? fg : bg),
          );
        }
        let textBuffer = new BigUint64Array(cells);
        buffer.set(
          textBuffer,
          ((y + paddingY + (border !== "none" ? 1 : 0)) * terminalWidth() +
            x +
            paddingX +
            (border !== "none" ? 1 : 0)) *
            3,
        );
      };

      const maxWidth =
        node.frame.width - paddingX * 2 - (border !== "none" ? 2 : 0);
      const words = buttonText().split(/\s+/);
      const lines: string[] = [];
      let currentLine: string[] = [];
      let currentWidth = 0;

      for (const word of words) {
        const wordWidth = word.length;
        const neededWidth =
          currentLine.length === 0 ? wordWidth : currentWidth + 1 + wordWidth;

        if (neededWidth > maxWidth && currentLine.length > 0) {
          lines.push(currentLine.join(" "));
          currentLine = [word];
          currentWidth = wordWidth;
        } else {
          currentLine.push(word);
          currentWidth = neededWidth;
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "));
      }

      lines.forEach((line, lineIndex) => {
        drawLine(line, node.frame.x, node.frame.y + lineIndex);
      });

      registerHit(node);
    }

    if (node.type === "input") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        text: inputText,
        padding = 0,
        focus = false,
      } = node.props as InputBoxProps;

      if (focus && initialRender) {
        initialRender = false;
        focusedComponentId(node.id);
      }

      let isFocused = focusedComponentId() === node.id;

      drawBackground(buffer, node, bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          isFocused ? COLORS.default.green : COLORS.default.fg,
          bg,
        );
      }

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }
      let cells: bigint[] = [];
      for (const c of inputText()) {
        cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let textBuffer = new BigUint64Array(cells);
      buffer.set(
        textBuffer,
        ((node.frame.y + paddingY + (border !== "none" ? 1 : 0)) *
          terminalWidth() +
          node.frame.x +
          paddingX +
          (border !== "none" ? 1 : 0)) *
          3,
      );

      registerHit(node);
    }

    const childClipBounds = {
      x: node.frame.x,
      y: node.frame.y,
      width: node.frame.width,
      height: node.frame.height,
    };

    for (let child of node.children) {
      paint(child, node.props.bg, childClipBounds);
    }
  }

  let initialRender = true;
  let previousFocusId = focusedComponentId();

  ff(() => {
    log(`ff triggered ${Date.now()}`);
    const frameStart = startFrame();

    pressedComponentId();
    const currentFocusId = focusedComponentId();
    let tw = terminalWidth();
    let th = terminalHeight();

    if (deps) {
      for (let i = 0; i < deps.length; i++) {
        deps[i]!();
      }
    }

    spatialLookup.fill(undefined);

    nodeRegistry.clear();

    const node = nodeFactory(tw, th);

    const layoutStart = startPhase();
    layout(node);
    endLayout(layoutStart);

    triggerLayoutEvents(node);

    const paintStart = startPhase();
    paint(node, node.props.bg);
    endPaint(paintStart);

    if (currentFocusId !== previousFocusId) {
      const oldNode = nodeRegistry.get(previousFocusId);
      const newNode = nodeRegistry.get(currentFocusId);

      if (oldNode?.type === "input") {
        (oldNode.props as InputBoxProps).onBlur();
      }
      if (newNode?.type === "input") {
        (newNode.props as InputBoxProps).onFocus();
      }
      previousFocusId = currentFocusId;
    }

    api.flush();

    endFrame(frameStart);
  });
}

function drawBackground(
  buffer: BigUint64Array<ArrayBuffer>,
  node: Node,
  bg: number,
  terminalWidth: Signal<number>,
) {
  let tw = terminalWidth();
  for (let j = node.frame.y; j < node.frame.y + node.frame.height; j++) {
    for (let i = node.frame.x; i < node.frame.x + node.frame.width; i++) {
      setCell(buffer, (j * tw + i) * 3, " ", COLORS.default.bg, bg);
    }
  }
}

function setCell(
  buffer: BigUint64Array<ArrayBuffer>,
  offset: number,
  char: string,
  fg: number,
  bg: number,
) {
  buffer[offset] = BigInt(char.codePointAt(0)!);
  buffer[offset + 1] = BigInt(fg);
  buffer[offset + 2] = BigInt(bg);
}

function getContainerCorners(node: Node, tw: number) {
  let topLeft = node.frame.y * tw + node.frame.x;
  let bottomLeft = topLeft + (node.frame.height - 1) * tw;
  let topRight = topLeft + node.frame.width - 1;
  let bottomRight = bottomLeft + node.frame.width - 1;
  return { topLeft, bottomLeft, topRight, bottomRight };
}

function drawBorder(
  buffer: BigUint64Array<ArrayBuffer>,
  node: Node,
  terminalWidth: Signal<number>,
  overrideFg?: number,
  overrideBg?: number,
) {
  let border = node.props?.border;
  if (!border) return;

  let { width, height } = node.frame;
  let style = border.style;

  let fg = overrideFg || border.color || COLORS.default.fg;
  let bg = overrideBg || node.props.bg || COLORS.default.bg;

  let { topLeft, bottomLeft, topRight, bottomRight } = getContainerCorners(
    node,
    terminalWidth(),
  );

  setCell(buffer, topLeft * 3, style === "square" ? "┌" : "╭", fg, bg);
  setCell(buffer, bottomLeft * 3, style === "square" ? "└" : "╰", fg, bg);

  setCell(buffer, topRight * 3, style === "square" ? "┐" : "╮", fg, bg);
  setCell(buffer, bottomRight * 3, style === "square" ? "┘" : "╯", fg, bg);

  for (let i = 1; i < height - 1; i++) {
    setCell(buffer, (topLeft + i * terminalWidth()) * 3, "│", fg, bg);
    setCell(buffer, (topRight + i * terminalWidth()) * 3, "│", fg, bg);
  }

  for (let i = 1; i < width - 1; i++) {
    setCell(buffer, (topLeft + i) * 3, "─", fg, bg);
    setCell(buffer, (bottomLeft + i) * 3, "─", fg, bg);
  }
}

export function Column(props: ColumnProps, children: Array<Node>): Node {
  const node: Node = {
    id: generateId(),
    type: "column",
    props,
    frame: getInitialFrame(),
    children,
  };
  if (props.ref) props.ref.current = node;
  return node;
}

export function Row(
  props: RowProps & { id?: string },
  children: Array<Node>,
): Node {
  const node: Node = {
    id: generateId(),
    type: "row",
    props,
    frame: getInitialFrame(),
    children,
  };
  if (props.ref) props.ref.current = node;
  return node;
}

export function Text(props: TextProps): Node {
  const node: Node = {
    id: generateId(),
    type: "text",
    props,
    frame: getInitialFrame(),
    children: [],
  };
  if (props.ref) props.ref.current = node;
  return node;
}

export function Button(props: ButtonProps): Node {
  const node: Node = {
    id: generateId(),
    type: "button",
    props,
    frame: getInitialFrame(),
    children: [],
  };

  if (props.ref) props.ref.current = node;

  return node;
}

export function InputBox(props: InputBoxProps): Node {
  const node: Node = {
    id: generateId(),
    type: "input",
    props,
    frame: getInitialFrame(),
    children: [],
  };
  if (props.ref) props.ref.current = node;
  return node;
}

function getInitialFrame(): Frame {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

// I need to handle two types of mouse/keyboard events
// 1. On action, something USER WANTS runs - make API call
// 2. On cation, something TUI WANTS happens - change background color

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ComponentType = "column" | "row" | "input" | "button" | "text";

export type Node = {
  id: number;
  type: ComponentType;
  children: Array<Node>;
  props: ColumnProps | RowProps | InputBoxProps | ButtonProps | TextProps;
  frame: Frame;
};

export function createRef<T>(): Ref<T> {
  return { current: null };
}

export type Ref<T> = { current: T | null };

export type CommonProps = {
  ref?: Ref<Node>;
  fg?: number;
  bg?: number;
  padding?: number | `${number} ${number}`;
  border?: BorderProps;
  onLayout?: (node: Node) => void;
};

export type ColumnProps = CommonProps & {
  gap?: number;
};

export type RowProps = CommonProps & {
  gap?: number;
};

export type TextProps = CommonProps & {
  text: Signal<string>;
};

export type BorderStyle = "square" | "rounded";

export type BorderProps = {
  color: number;
  style: BorderStyle;
};

export type ButtonProps = CommonProps & {
  focus?: boolean;
  text: Signal<string>;
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => void;
};

export type InputBoxProps = CommonProps & {
  focus?: boolean;
  text: Signal<string>;
  onBlur: () => void;
  onFocus: () => void;
  onType: (value: string) => void;
  onSubmit?: (value: string) => void;
};

```
./blog/tui-lib-from-scratch-1.md
````
import Script from "next/script";

export const metadata = {
  title: "Building a TUI Library from scratch: Part 1",
  description:
    "Initial implementation of my terminal user interface library using Bun, Rust and classes",
  date: "2025-12-12T10:00:00",
};

## Building a TUI Library from Scratch: From Classes to Signals

#### Things I learned:

- I learned **tons** of things but had to write **tons** of garbage for it and (of course) ended up using **none** of it
- Separation of concerns is **extremely** important, never stop following this principle
- Bun, FFI, some Rust, ANSI escape sequences, memory management

#### Tools used:

- ampcode.com, aistudio.google.com, t3.chat, deepwiki.com

I've been using Neovim for years and enjoyed living inside my terminal. I was also super interested in different CLIs and TUIs. I got even more curious when I started hearing about Claude Code, Codex, Aider and similar AI agents that run in the terminal (about a year ago I think) more and more. I did some quick research and found [`react-ink`](https://github.com/vadimdemedes/ink), then [`opencode`](https://github.com/sst/opencode). Soon after I saw this post:

<blockquote className="twitter-tweet">
  <p lang="en" dir="ltr">
    yeah unfortunately the best tooling for TUIs is in go
    <br />
    <br />
    we&#39;ll build OpenTUI one day for js but till then this hack works
  </p>
  &mdash; dax (@thdxr){" "}
  <a href="https://twitter.com/thdxr/status/1928902930419048585?ref_src=twsrc%5Etfw">
    May 31, 2025
  </a>
</blockquote>
<Script src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" />

and right then I decided to build my own TUI library someday.

When I started building `LeTUI` around September, I decided not to follow or copy any tutorial, guide or existing repository. I wanted to build something from scratch, on my own. I did use AI for a general roadmap and learning, but I wrote every single line of code myself.

I reached for the most "simple to reason about" pattern - classes - and wanted to just go with the flow. I never wrote a library or worked with terminals before, so instead of making a detailed step-by-step plan, I decided to just start by playing around with the code.

As the result, initial implementation had `View`, `Row`, `Column`, `Text`, `Button`, and `Input` classes. It was a complete mess, but I learned a lot and it gave me enough of a base to build on later.

Here's an example snippet. Enjoy!

```typescript
class Button {
  id: number;
  px = 4;
  py = 1;
  text: string;
  fg: number;
  active_fg: number;
  bg: number;
  active_bg: number;
  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();
  width: number;
  height: number;
  onClick: (() => Promise<void>) | (() => void) | null = null;

  // ... constructor and other methods ...

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;

    this.prerender(); // layout? painting? who knows!

    // top part - manual pixel pushing
    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3
        );
      }
    }

    // bottom part - more manual pixel pushing
    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3
        );
      }
    }

    // middle part - even more manual pixel pushing
    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.active_fg),
              BigInt(this.active_bg),
            ]),
            (terminalWidth * cy + cx) * 3
          );
        }
      }
    }

    // actual text
    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3
    );

    this.updateHitMap(xo, yo); // hit-testing mixed in here too!
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  // ...
}
```

Layout and painting were hopelessly tangled - `render()` calculates positions _and_ writes to the buffer _and_ updates the hit-map for click detection. Every component duplicates border-drawing logic. The API is completely inflexible: want to change how buttons look when pressed? Good luck finding the right place. Want to add a new component type? Copy-paste 100 lines and pray you got the coordinate math right.

The real problem emerged when I needed state management and dynamic updates. User types in an `Input`, clicks a `Button`, and the UI needs to update. My class-based approach required manual `setText()` calls that triggered `prerender()` and `render()`. Every component held mutable state, and coordinating updates became a mess of method calls.

This was my first attempt at building a TUI library and it kinda worked. I could render containers and primitives, make them nested and show some colors. I started to understand the problem space - what a render loop actually needs, which parts should be separate, how hit-testing works, why you need separate layout and painting processes and especially, how I want to handle dynamic updates.

At this point, it was time to stop playing around and started from scratch again, but now with a better understanding of how things should work.

````
./blog/tui-lib-from-scratch-2.md
````
export const metadata = {
  title: "Building a TUI Library from scratch using Bun and Rust: Part 2",
  description:
    "Rewriting everything with signals-based reactivity, functional components, better API and more",
  date: "2025-12-13T10:00:00",
};

## Building a TUI Library from Scratch: Part 2

#### Things I learned:

- Signals are simple but powerful - auto-tracking dependencies changes everything
- Separating layout from painting makes the code so much cleaner
- Pure functions returning data structures beat classes with internal state

As a small fan of SolidJS, I decided to try out a signals approach and implement the base primitives from scratch. A signal is deceptively simple - a function that tracks its subscribers and schedules updates when values change:

```typescript
export function $<T>(defaultValue: T): Signal<T> {
  let v: T = defaultValue;
  let subs = new Set<Sub>();

  function $$(next?: T): T | void {
    if (arguments.length === 0) {
      if (caller) subs.add(caller); // auto-subscribe on read
      return v;
    }
    if (Object.is(v, next)) return;
    v = next as T;
    for (let s of subs) schedule(s); // notify all subscribers
  }
  return $$;
}
```

With signals in place, components became pure functions returning `Node` objects. No classes, no internal state - just data structures describing what to render. The `run()` function handles the entire lifecycle: layout calculation (offloaded to Rust via `taffy`), painting to the buffer, and event handling. When any signal changes (either internally or externally), the effect function re-runs and the UI updates automatically. Boom!

```typescript
export function Button(props: ButtonProps & { id: string }): Node {
  return {
    id: props.id,
    type: "button",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

// Usage: reactive text that updates automatically
let buttonText = $("Click me");
Button({ id: "btn", text: buttonText, onClick: () => buttonText("Clicked!") });
```

Designing an actual architecture paid off. Layout and painting are now separate concerns - Rust calculates coordinates, TypeScript paints to the buffer. Mouse and keyboard events flow through a spatial lookup table. Most importantly, derived state with `dd()` and async effects with `af()` compose naturally. What started as 700+ lines of class-based spaghetti became a clean separation: ~60 lines of signal primitives driving a declarative component tree.

#### The layout engine rabbit hole

I started adding layout calculations for `Column` and `Row` - nothing fancy, just positioning children correctly. Then I needed to handle flex and fixed components. Then coordinate conversions. Then gap calculations. Then nested containers...

At some point I stepped back and realized: I was basically writing a layout engine from scratch without knowing it. Every fix introduced two new edge cases. After a few late nights debugging why my rows weren't aligning properly, I had a moment of clarity: this is completely out of scope.

So I reached for [`taffy`](https://github.com/DioxusLabs/taffy) - a Rust layout library that implements flexbox. One integration later and all my layout headaches disappeared. The lesson? Know when something deserves its own library or is out of scope. I'm building a TUI framework, not a layout engine.

#### The key insight

When you stop fighting the data flow and let reactivity handle updates, everything becomes easier. Instead of manually calling `setText()` and `prerender()` and `render()`, you just update a signal. The system figures out what needs to change. Now the library became somewhat usable. I even re-wrote my Anitrack TUI project using LeTUI.

At this point I decided it's time to do some optimizations and add some more features.

#### Clipping

One feature I had to implement that was relatively simple but interesting was clipping. When you have a container with fixed dimensions, child content shouldn't overflow and bleed into surrounding components. Content (e.g. text) that's too long needs to be cut off at the component boundary.

This meant during painting I had to track each container's bounds and skip any pixels that fall outside. For text, I also added wrapping support - if a line is too long, break it and continue on the next line (but only within the container's height). Simple in concept, but getting the edge cases right took some debugging.

````
./blog/tui-lib-from-scratch-3.md
````
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

````
./blog/tui-lib-from-scratch-4.md
````
export const metadata = {
  title: "Building a TUI Library from scratch: Part 4",
  description:
    "Binary protocols, batched flushing, component API redesign, and facing competition",
  date: "2026-01-08T10:00:00",
};

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


````
./blog/tui-lib-from-scratch-5.md
````
export const metadata = {
  title: "Building a TUI Library from scratch: Part 5",
  description:
    "Moving paint to Rust and rethinking interaction state",
  date: "2026-01-19T10:00:00",
};

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

````
./examples/examples-opentui.ts
```typescript
// TORRENT SEARCH APP - OpenTUI Port
// Demonstrating API differences from letui

import { existsSync } from "fs";
import {
  createCliRenderer,
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import {
  startFrame,
  endFrame,
  saveMetrics,
  resetMetrics,
} from "@/metrics";

// --- Metrics state ---
let frameStartTime = 0;

// --- Types ---
type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

type ScrapeResult = {
  results: ScrapeResultItem[];
};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: unknown[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

// --- State (manual, no signals) ---
let results: ScrapeResultItem[] = [];
let loading = false;
let selectedIndex = 0;

// --- Renderer & Components (declared for later init) ---
let renderer: CliRenderer;
let searchInput: InputRenderable;
let loadingText: TextRenderable;
let resultsList: BoxRenderable;
let resultButtons: TextRenderable[] = [];

// --- Loading Animation ---
const loaderFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let loaderFrame = 0;
let loaderInterval: ReturnType<typeof setInterval> | null = null;

function startLoader() {
  if (loaderInterval) return;
  loaderInterval = setInterval(() => {
    loaderFrame = (loaderFrame + 1) % loaderFrames.length;
    if (loadingText) {
      loadingText.content = `${loaderFrames[loaderFrame]} Loading...`;
      renderer.requestRender();
    }
  }, 80);
}

function stopLoader() {
  if (loaderInterval) {
    clearInterval(loaderInterval);
    loaderInterval = null;
  }
  if (loadingText) {
    loadingText.content = "";
    renderer.requestRender();
  }
}

// --- API ---
async function fetchResults(query: string) {
  loading = true;
  startLoader();

  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`
  );
  const data = (await response.json()) as ScrapeResult;

  results = data.results;
  selectedIndex = 0;
  loading = false;
  stopLoader();
  updateResultsList();
}

async function streamResult(magnet: string) {
  startLoader();

  const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
    method: "post",
    body: magnet,
  });
  const data = (await response.json()) as TorrentResponse;
  const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
    data.details.files.length - 1
  }`;

  const ipcPath = `/tmp/mpv-socket-${Date.now()}`;
  Bun.spawn({
    cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
    stdout: "ignore",
    stderr: "ignore",
  });

  while (!existsSync(ipcPath)) {
    await Bun.sleep(50);
  }

  stopLoader();
}

// --- Update Results List (manual re-render) ---
function updateResultsList() {
  // Remove old result buttons
  for (const btn of resultButtons) {
    resultsList.remove(btn.id);
    btn.destroy();
  }
  resultButtons = [];

  if (results.length === 0) return;

  // Virtual windowing calculation
  const availableHeight = renderer.height - 10; // Approximate
  const itemHeight = 3;
  const visibleCount = Math.max(1, Math.floor(availableHeight / itemHeight));

  let start = selectedIndex - visibleCount + 1;
  start = Math.max(0, Math.min(start, results.length - visibleCount));
  const end = Math.min(start + visibleCount, results.length);
  const visible = results.slice(start, end);

  visible.forEach((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selectedIndex;

    const btn = new TextRenderable(renderer, {
      id: `result-${globalIdx}`,
      content: `${isActive ? "▶ " : "  "}${item.title}`,
      width: "100%",
      height: 1,
      fg: isActive ? "#00FF00" : "#FFFFFF",
      onMouseDown() {
        streamResult(item.magnet);
      },
    });

    resultsList.add(btn);
    resultButtons.push(btn);
  });

  renderer.requestRender();
}

// --- Navigation ---
function selectNext() {
  const max = results.length - 1;
  if (selectedIndex < max) {
    selectedIndex++;
    updateResultsList();
  }
}

function selectPrev() {
  if (selectedIndex > 0) {
    selectedIndex--;
    updateResultsList();
  }
}

function selectFirst() {
  selectedIndex = 0;
  updateResultsList();
}

function selectLast() {
  const max = results.length - 1;
  if (max >= 0) {
    selectedIndex = max;
    updateResultsList();
  }
}

function selectCurrent() {
  if (results[selectedIndex]) {
    streamResult(results[selectedIndex].magnet);
  }
}

// --- Main ---
async function main() {
  resetMetrics();
  
  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useKittyKeyboard: { disambiguate: true },
  });

  // Wrap requestRender to measure frame times
  // OpenTUI schedules activateFrame via nextTick/setTimeout, so use setTimeout(0)
  // to measure AFTER render + native Zig I/O completes
  const originalRequestRender = renderer.requestRender.bind(renderer);
  renderer.requestRender = () => {
    frameStartTime = startFrame();
    originalRequestRender();
    setTimeout(() => {
      if (frameStartTime > 0) {
        endFrame(frameStartTime);
        frameStartTime = 0;
      }
    }, 0);
  };

  renderer.setBackgroundColor("#1a1a2e");

  // Root container
  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    border: true,
    borderColor: "#FFFFFF",
    gap: 1,
  });
  renderer.root.add(root);

  // Search row
  const searchRow = new BoxRenderable(renderer, {
    id: "search-row",
    flexDirection: "column",
    width: "100%",
    gap: 1,
  });
  root.add(searchRow);

  // Search input
  searchInput = new InputRenderable(renderer, {
    id: "search-input",
    width: "100%",
    height: 1,
    placeholder: "Search torrents...",
    textColor: "#FFFFFF",
    backgroundColor: "#2a2a4e",
    focusedBackgroundColor: "#3a3a6e",
    cursorColor: "#00FF00",
  });
  searchRow.add(searchInput);

  // Handle submit
  searchInput.on(InputRenderableEvents.ENTER, (value: string) => {
    fetchResults(value);
  });

  // Loading text
  loadingText = new TextRenderable(renderer, {
    id: "loading-text",
    content: "",
    width: "100%",
    height: 1,
    fg: "#00FF00",
  });
  searchRow.add(loadingText);

  // Results container
  resultsList = new BoxRenderable(renderer, {
    id: "results-list",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    gap: 1,
    padding: 1,
  });
  root.add(resultsList);

  // Keyboard handler
  renderer.keyInput.on("keypress", (key) => {
    // Global keys (when not focused on input)
    if (!searchInput.focused) {
      switch (key.name) {
        case "slash":
          searchInput.focus();
          break;
        case "j":
        case "down":
          selectNext();
          break;
        case "k":
        case "up":
          selectPrev();
          break;
        case "l":
        case "right":
          selectLast();
          break;
        case "h":
        case "left":
          selectFirst();
          break;
        case "return":
        case "linefeed":
          selectCurrent();
          break;
        case "q":
          saveMetrics("dump/metrics-opentui.txt");
          renderer.destroy();
          process.exit(0);
          break;
      }
    } else {
      // ESC to blur input
      if (key.name === "escape") {
        searchInput.blur();
      }
    }
  });

  // Focus input initially
  searchInput.focus();

  renderer.start();
}

main().catch(console.error);

/*
 * API COMPARISON NOTES - OpenTUI vs letui:
 *
 * 1. COMPONENT CREATION:
 *    - OpenTUI: `new InputRenderable(renderer, {...})` - class instantiation, requires renderer context
 *    - letui:   `Input({...})` - factory function, no context needed
 *
 * 2. STATE MANAGEMENT:
 *    - OpenTUI: Manual state variables + explicit `renderer.requestRender()` calls
 *    - letui:   Signals `$()` with automatic dependency tracking, `ff()` for effects
 *
 * 3. CHILDREN MANAGEMENT:
 *    - OpenTUI: `parent.add(child)` / `parent.remove(id)` - imperative
 *    - letui:   `Column({}, [children])` + `setChildren([])` - declarative arrays
 *
 * 4. EVENT HANDLING:
 *    - OpenTUI: `input.on(EventEnum, handler)` - EventEmitter pattern
 *    - letui:   `onSubmit: (val) => {}` - props-based callbacks
 *
 * 5. FOCUS MANAGEMENT:
 *    - OpenTUI: `input.focus()` / `input.blur()` - explicit methods
 *    - letui:   `input.focus()` - same, but `onFocus`/`onBlur` callbacks in props
 *
 * 6. KEYBOARD HANDLING:
 *    - OpenTUI: `renderer.keyInput.on("keypress", handler)` - global EventEmitter
 *    - letui:   `onKey("/", handler)` - declarative key binding
 *
 * 7. LAYOUT:
 *    - OpenTUI: Yoga layout with explicit props (flexGrow, flexDirection, etc.)
 *    - letui:   Taffy via FFI with simplified props (gap, padding as strings)
 *
 * 8. RENDERING:
 *    - OpenTUI: Native Zig renderer, framebuffer-based
 *    - letui:   Rust FFI diffing, TypeScript orchestration
 *
 * VERDICT: OpenTUI is more verbose but offers fine-grained control.
 *          letui's signal system reduces boilerplate significantly.
 */

```
./examples/examples-pimono.ts
```typescript
// TORRENT SEARCH APP - Pi-mono TUI Port
// Demonstrating API differences from letui

import { existsSync } from "fs";
import {
  TUI,
  ProcessTerminal,
  Input,
  SelectList,
  Text,
  Container,
  Loader,
  type Component,
  type SelectItem,
  matchesKey,
} from "pi-monorepo/packages/tui/src/index";
import {
  startFrame,
  endFrame,
  saveMetrics,
  resetMetrics,
} from "@/metrics";

// --- Metrics state ---
let frameStartTime = 0;

// --- Types ---
type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

type ScrapeResult = {
  results: ScrapeResultItem[];
};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: unknown[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

// --- State ---
let results: ScrapeResultItem[] = [];
let loading = false;
let selectedIndex = 0;
let mode: "search" | "results" = "search";

// --- Theme helpers ---
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const white = (s: string) => `\x1b[37m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const inverse = (s: string) => `\x1b[7m${s}\x1b[27m`;

// --- Custom Components ---

// Loading bar component (pi-mono style)
class LoadingBar implements Component {
  private active = false;
  private frame = 0;
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private ui: TUI | null = null;

  setUI(ui: TUI) {
    this.ui = ui;
  }

  start() {
    this.active = true;
    this.intervalId = setInterval(() => {
      this.frame = (this.frame + 1) % this.frames.length;
      this.ui?.requestRender();
    }, 80);
  }

  stop() {
    this.active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.ui?.requestRender();
  }

  invalidate() {}

  render(width: number): string[] {
    if (!this.active) return [];
    return [green(this.frames[this.frame]) + " Loading..."];
  }
}

// Results list component (manual implementation)
class ResultsList implements Component {
  private items: ScrapeResultItem[] = [];
  private selected = 0;
  private maxVisible = 10;
  public onSelect?: (item: ScrapeResultItem) => void;

  setItems(items: ScrapeResultItem[]) {
    this.items = items;
    this.selected = 0;
  }

  setSelected(idx: number) {
    this.selected = Math.max(0, Math.min(idx, this.items.length - 1));
  }

  getSelected() {
    return this.selected;
  }

  getSelectedItem() {
    return this.items[this.selected];
  }

  invalidate() {}

  render(width: number): string[] {
    if (this.items.length === 0) {
      return [dim("  No results. Press / to search.")];
    }

    const lines: string[] = [];

    // Virtual windowing
    let start = this.selected - Math.floor(this.maxVisible / 2);
    start = Math.max(0, Math.min(start, this.items.length - this.maxVisible));
    const end = Math.min(start + this.maxVisible, this.items.length);

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const isSelected = i === this.selected;
      const prefix = isSelected ? green("▶ ") : "  ";
      const title = item.title.slice(0, width - 4);
      const line = prefix + (isSelected ? bold(title) : title);
      lines.push(line);
    }

    // Scroll indicator
    if (this.items.length > this.maxVisible) {
      lines.push(dim(`  (${this.selected + 1}/${this.items.length})`));
    }

    return lines;
  }

  handleInput(data: string) {
    // Navigation handled externally
  }
}

// Main app container
class TorrentApp implements Component {
  private searchInput: Input;
  private resultsList: ResultsList;
  private loadingBar: LoadingBar;
  private ui: TUI;

  constructor(ui: TUI) {
    this.ui = ui;
    this.searchInput = new Input();
    this.resultsList = new ResultsList();
    this.loadingBar = new LoadingBar();
    this.loadingBar.setUI(ui);

    this.searchInput.onSubmit = (value) => {
      this.fetchResults(value);
    };

    this.searchInput.onEscape = () => {
      mode = "results";
      this.ui.setFocus(this);
      this.ui.requestRender();
    };

    this.resultsList.onSelect = (item) => {
      this.streamResult(item.magnet);
    };
  }

  private async fetchResults(query: string) {
    loading = true;
    this.loadingBar.start();
    this.ui.requestRender();

    try {
      const response = await fetch(
        `https://scrape.anitrack.frixaco.com/scrape?q=${query}`
      );
      const data = (await response.json()) as ScrapeResult;
      results = data.results;
      this.resultsList.setItems(results);
      mode = "results";
      this.ui.setFocus(this);
    } finally {
      loading = false;
      this.loadingBar.stop();
    }
  }

  private async streamResult(magnet: string) {
    this.loadingBar.start();

    try {
      const response = await fetch(
        "https://rqbit.anitrack.frixaco.com/torrents",
        {
          method: "post",
          body: magnet,
        }
      );
      const data = (await response.json()) as TorrentResponse;
      const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
        data.details.files.length - 1
      }`;

      const ipcPath = `/tmp/mpv-socket-${Date.now()}`;
      Bun.spawn({
        cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
        stdout: "ignore",
        stderr: "ignore",
      });

      while (!existsSync(ipcPath)) {
        await Bun.sleep(50);
      }
    } finally {
      this.loadingBar.stop();
    }
  }

  invalidate() {
    this.searchInput.invalidate?.();
    this.resultsList.invalidate();
    this.loadingBar.invalidate();
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(bold("┌─ Torrent Search " + "─".repeat(width - 18) + "┐"));

    // Search input (always visible)
    const inputLines = this.searchInput.render(width - 4);
    for (const line of inputLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Loading indicator
    const loaderLines = this.loadingBar.render(width - 4);
    for (const line of loaderLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Separator
    lines.push("├" + "─".repeat(width - 2) + "┤");

    // Results
    const resultLines = this.resultsList.render(width - 4);
    for (const line of resultLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Footer
    lines.push("└" + "─".repeat(width - 2) + "┘");

    // Help line
    const helpText =
      mode === "search"
        ? dim("Enter: search | Esc: browse results")
        : dim("j/k: navigate | Enter: play | /: search | q: quit");
    lines.push(helpText);

    return lines;
  }

  handleInput(data: string) {
    if (mode === "search") {
      this.searchInput.handleInput(data);
      this.ui.requestRender();
      return;
    }

    // Results mode navigation
    if (matchesKey(data, "j") || data === "\x1b[B") {
      // j or down
      const max = results.length - 1;
      if (this.resultsList.getSelected() < max) {
        this.resultsList.setSelected(this.resultsList.getSelected() + 1);
        this.ui.requestRender();
      }
    } else if (matchesKey(data, "k") || data === "\x1b[A") {
      // k or up
      if (this.resultsList.getSelected() > 0) {
        this.resultsList.setSelected(this.resultsList.getSelected() - 1);
        this.ui.requestRender();
      }
    } else if (matchesKey(data, "l") || data === "\x1b[C") {
      // l or right - last
      this.resultsList.setSelected(results.length - 1);
      this.ui.requestRender();
    } else if (matchesKey(data, "h") || data === "\x1b[D") {
      // h or left - first
      this.resultsList.setSelected(0);
      this.ui.requestRender();
    } else if (data === "\r" || data === "\n") {
      // Enter - select
      const item = this.resultsList.getSelectedItem();
      if (item) {
        this.streamResult(item.magnet);
      }
    } else if (matchesKey(data, "/")) {
      // / - focus search
      mode = "search";
      this.ui.setFocus(this);
      this.ui.requestRender();
    } else if (matchesKey(data, "q") || data === "\x03") {
      // q or Ctrl+C - quit
      saveMetrics("dump/metrics-pimono.txt");
      this.ui.stop();
      process.exit(0);
    }
  }
}

// --- Main ---
function main() {
  resetMetrics();
  
  const terminal = new ProcessTerminal();
  const ui = new TUI(terminal);

  // Wrap requestRender to measure frame times
  // Pi-mono schedules doRender via process.nextTick, so use setTimeout(0)
  // to measure AFTER render + terminal I/O completes
  const originalRequestRender = ui.requestRender.bind(ui);
  ui.requestRender = () => {
    frameStartTime = startFrame();
    originalRequestRender();
    setTimeout(() => {
      if (frameStartTime > 0) {
        endFrame(frameStartTime);
        frameStartTime = 0;
      }
    }, 0);
  };

  const app = new TorrentApp(ui);
  ui.addChild(app);
  ui.setFocus(app);

  ui.start();
}

main();

/*
 * API COMPARISON NOTES - Pi-mono vs letui:
 *
 * 1. COMPONENT CREATION:
 *    - Pi-mono: Class implementing `Component` interface with `render(width): string[]`
 *    - letui:   `Button({...})` factory functions returning node objects
 *
 * 2. STATE MANAGEMENT:
 *    - Pi-mono: Manual class properties + `invalidate()` + `ui.requestRender()`
 *    - letui:   Signals `$()` with automatic dependency tracking
 *
 * 3. RENDERING MODEL:
 *    - Pi-mono: Components return `string[]` (lines) - pure string-based diffing
 *    - letui:   Component tree serialized to Rust, Taffy layout, cell-based diffing
 *
 * 4. LAYOUT:
 *    - Pi-mono: 1D only - `width` passed to render(), height is implicit (line count)
 *    - letui:   Full 2D flexbox via Taffy (gap, padding, flexGrow, etc.)
 *
 * 5. CHILDREN:
 *    - Pi-mono: Manual composition in render() - return child.render() lines
 *    - letui:   Declarative `Column({}, [child1, child2])` arrays
 *
 * 6. FOCUS:
 *    - Pi-mono: `ui.setFocus(component)` - focused component receives handleInput
 *    - letui:   `input.focus()` with signals tracking focus state
 *
 * 7. KEYBOARD:
 *    - Pi-mono: `handleInput(data: string)` method on focused component
 *    - letui:   `onKey("/", handler)` global registration + component handlers
 *
 * 8. STYLING:
 *    - Pi-mono: Manual ANSI escape codes in render output
 *    - letui:   Style props on components (border: {...}, padding: "1 0")
 *
 * 9. BUILT-IN COMPONENTS:
 *    - Pi-mono: Input, SelectList, Text, Loader, Editor, Markdown, Image
 *    - letui:   Input, Button, Row, Column, Box (more layout-focused)
 *
 * VERDICT: Pi-mono is simpler but requires more manual work for layout.
 *          The string[] return model is very explicit - you see exactly what renders.
 *          letui's 2D layout and signals make complex UIs easier to build.
 *
 * KEY INSIGHT: Pi-mono's 1D model means you must manually handle box-drawing
 *              and compose layouts. letui's Taffy integration handles this.
 */

```
./examples/examples-stress.ts
```typescript
import { Column, Text, run, onKey } from "@/components";
import { COLORS } from "@/colors";

const args = Bun.argv.slice(2);
const width = parseInt(args[0]!, 10) || 32;
const height = parseInt(args[1]!, 10) || 32;
const iterations = parseInt(args[2]!, 10) || 1000;

const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";

const randomInt = (max: number) => Math.floor(Math.random() * max);
const randomColor = () => randomInt(0xffffff + 1);

function randomLine(): string {
  let out = "";
  for (let i = 0; i < width; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

console.log(
  `Running letui stress: ${width}x${height} characters for ${iterations} frames...`,
);

const lines = Array.from({ length: height }, () =>
  Text({
    text: " ".repeat(width),
    foreground: COLORS.default.fg,
    background: COLORS.default.bg,
  }),
);

const root = Column(
  { gap: 0, padding: 0, background: COLORS.default.bg, flexGrow: 1 },
  lines,
);

const app = run(root, { debug: true });

onKey("q", () => app.quit());

const durationMs = 1000;
const start = Bun.nanoseconds();

async function runTest() {
  let frames = 0;
  while (frames < iterations) {
    const elapsedMs = (Bun.nanoseconds() - start) / 1e6;
    if (elapsedMs >= durationMs) break;

    for (let y = 0; y < height; y++) {
      lines[y]!.setText(randomLine());
      lines[y]!.setStyle({ foreground: randomColor() });
    }
    frames++;
    await Promise.resolve();
  }

  const totalTimeMs = (Bun.nanoseconds() - start) / 1e6;
  console.log("\n");
  console.log("Done! updates stopped");
  console.log(`Total Time: ${totalTimeMs.toFixed(2)} ms`);
  console.log(`Frames: ${frames}`);
  console.log(
    `Average per frame: ${(totalTimeMs / Math.max(1, frames)).toFixed(4)} ms`,
  );
}

void runTest();

```
./examples/index.ts
```typescript
// TORRENT SEARCH APP
// - Search input with loading bar
// - Virtual windowing results list
// - Keyboard navigation (j/k/h/l)

import { existsSync } from "fs";
import { COLORS } from "@/colors";
import { Button, Column, Input, Row, run, onKey } from "@/components";
import { LoadingBar } from "./progress-bar";
import { $, ff, whenSettled } from "@/signals";
import { saveMetrics } from "@/metrics";

// --- Types ---
type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

type ScrapeResult = {
  results: ScrapeResultItem[];
};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: unknown[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

// --- State ---
const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);

// --- Loading Bars ---
const loadingBar = LoadingBar({
  dotColor: COLORS.default.green,
  trackColor: COLORS.default.bg_alt,
});

// --- API ---
async function fetchResults(query: string) {
  loading(true);
  loadingBar.start();

  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  selectedIndex(0);
  loading(false);
  loadingBar.stop();
}

async function streamResult(magnet: string) {
  loadingBar.start();

  const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
    method: "post",
    body: magnet,
  });
  const data = (await response.json()) as TorrentResponse;
  const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
    data.details.files.length - 1
  }`;

  const ipcPath = `/tmp/mpv-socket-${Date.now()}`;
  Bun.spawn({
    cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
    stdout: "ignore",
    stderr: "ignore",
  });

  // Poll until socket exists (mpv fully initialized)
  while (!existsSync(ipcPath)) {
    await Bun.sleep(50);
  }

  loadingBar.stop();
}

// --- Styles ---
const borderStyle = {
  color: COLORS.default.fg,
  style: "square" as const,
};

const focusedBorderStyle = {
  color: COLORS.default.green,
  style: "square" as const,
};

// --- Nodes ---
const searchInput = Input({
  placeholder: "Search torrents...",
  border: borderStyle,
  padding: "1 0",
  onSubmit: (val) => fetchResults(val),
  onFocus: (self) => self.setStyle({ border: focusedBorderStyle }),
  onBlur: (self) => self.setStyle({ border: borderStyle }),
});
whenSettled(() => searchInput.focus());

const loadingBars = Row({ flexGrow: 1 }, [loadingBar.node]);

const resultsList = Column({ gap: 1, padding: "1 0", flexGrow: 1 }, []);

const root = Column({ border: borderStyle, gap: 1, padding: "1 0" }, [
  Column({ padding: "1 0" }, [searchInput, loadingBars]),
  resultsList,
]);

// --- Keep track of result buttons for focus management ---
let resultButtons: ReturnType<typeof Button>[] = [];

// --- Reactive effects ---

// Update results list with virtual windowing
ff(() => {
  const all = results();
  const selected = selectedIndex();

  if (all.length === 0) {
    resultsList.setChildren?.([]);
    return;
  }

  // Use actual computed frame height from Taffy
  const availableHeight = resultsList.frameHeight();

  // Each item: border(2) + text(1) = 3, plus gap(1) between items
  const itemHeight = 3;
  const visibleCount = Math.max(1, Math.floor(availableHeight / itemHeight));

  // Calculate window with selection at bottom (scroll only when needed)
  let start = selected - visibleCount + 1;
  start = Math.max(0, Math.min(start, all.length - visibleCount));
  const end = Math.min(start + visibleCount, all.length);
  const visible = all.slice(start, end);

  resultButtons = visible.map((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selected;
    return Button({
      text: `${isActive ? "▶ " : "  "}${item.title}`,
      border: isActive ? focusedBorderStyle : borderStyle,
      padding: "1 0",
      onClick: () => streamResult(item.magnet),
    });
  });

  resultsList.setChildren?.(resultButtons);

  // Focus the selected button
  const selectedVisibleIndex = selected - start;
  if (resultButtons[selectedVisibleIndex]) {
    resultButtons[selectedVisibleIndex].focus();
  }
});

// --- Keyboard navigation ---
onKey("/", () => searchInput.focus());

onKey("j", () => selectNext());
onKey("\x1b[B", () => selectNext()); // Arrow Down

onKey("k", () => selectPrev());
onKey("\x1b[A", () => selectPrev()); // Arrow Up

onKey("l", () => selectLast());
onKey("\x1b[C", () => selectLast()); // Arrow Right - jump to end

onKey("h", () => selectFirst());
onKey("\x1b[D", () => selectFirst()); // Arrow Left - jump to start

onKey("q", () => {
  saveMetrics("dump/metrics-letui.txt");
  app.quit();
});

function selectNext() {
  const max = results().length - 1;
  if (selectedIndex() < max) {
    selectedIndex(selectedIndex() + 1);
  }
}

function selectPrev() {
  if (selectedIndex() > 0) {
    selectedIndex(selectedIndex() - 1);
  }
}

function selectFirst() {
  selectedIndex(0);
}

function selectLast() {
  const max = results().length - 1;
  if (max >= 0) {
    selectedIndex(max);
  }
}

// --- Start app ---
const app = run(root, { debug: true });

```
./examples/progress-bar.ts
```typescript
import { Row, Text } from "@/components";
import { $, ff } from "@/signals";
import type { Node } from "@/types";
import { log } from "@/debug";

export type LoadingBarProps = {
  dotColor: number;
  trackColor: number;
  flexGrow?: number;
  interval?: number; // ms between frames
};

export type LoadingBarController = {
  node: Node;
  start: () => void;
  stop: () => void;
};

export function LoadingBar(props: LoadingBarProps): LoadingBarController {
  const { dotColor, trackColor, flexGrow = 1, interval = 80 } = props;

  const position = $(0);
  const direction = $(1); // 1 = right, -1 = left
  const active = $(false);
  let timer: Timer | null = null;

  const leftTrack = Text({
    text: "",
    background: trackColor,
    foreground: trackColor,
  });
  const dot = Text({ text: "", background: dotColor, foreground: dotColor });
  const rightTrack = Text({
    text: "",
    background: trackColor,
    foreground: trackColor,
  });

  const node = Row({ flexGrow }, [leftTrack, dot, rightTrack]);

  // React to position changes
  ff(() => {
    const isActive = active();
    const pos = position();
    const width = node.frameWidth();
    log(
      `LoadingBar: x=${node.frame.x}, width=${width}, pos=${pos}, active=${isActive}`,
    );
    if (width === 0 || !isActive) return;

    const maxPos = width - 1;
    const clampedPos = Math.max(0, Math.min(pos, maxPos));

    leftTrack.setStyle?.({ text: " ".repeat(clampedPos) });
    dot.setStyle?.({ text: " " });
    rightTrack.setStyle?.({ text: " ".repeat(maxPos - clampedPos) });
  });

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (active()) return;
    active(true);
    position(0);
    direction(1);

    timer = setInterval(() => {
      const width = node.frameWidth();
      if (width === 0) return;

      const maxPos = width - 1;
      const pos = position();
      const dir = direction();

      const step = 12;
      const nextPos = pos + dir * step;
      if (nextPos >= maxPos) {
        direction(-1);
        position(maxPos);
      } else if (nextPos <= 0) {
        direction(1);
        position(0);
      } else {
        position(nextPos);
      }
    }, interval);
  }

  function stop() {
    clearTimer();
    active(false);
    position(0);
    // Clear all three segments
    leftTrack.setStyle?.({ text: "" });
    dot.setStyle?.({ text: "" });
    rightTrack.setStyle?.({ text: "" });
  }

  return { node, start, stop };
}

```
./examples/stress-test.ts
```typescript
const args = Bun.argv.slice(2);
const width = parseInt(args[0]!, 10) || 32;
const height = parseInt(args[1]!, 10) || 32;
const iterations = parseInt(args[2]!, 10) || 1000;

const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";

const randomInt = (max: number) => Math.floor(Math.random() * max);

console.log(
  `Running test: ${width}x${height} characters for ${iterations} frames...`,
);

const start = Bun.nanoseconds();

for (let i = 0; i < iterations; i++) {
  let buffer = "\x1b[H";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = randomInt(256);
      const char = chars[randomInt(chars.length)];
      buffer += `\x1b[38;5;${color}m${char}`;
    }
    buffer += "\x1b[0m\n";
  }

  Bun.write(Bun.stdout, buffer);
}

const totalTimeMs = (Bun.nanoseconds() - start) / 1e6;

console.log("\n");
console.log(`Done!`);
console.log(`Total Time: ${totalTimeMs.toFixed(2)} ms`);
console.log(`Average per frame: ${(totalTimeMs / iterations).toFixed(4)} ms`);

```
./scripts/build-npm.ts
```typescript
import { write } from "bun";
import { mkdir } from "node:fs/promises";
import { join } from "path";

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: bun scripts/build-npm.ts <version> <platform> <arch>");
  process.exit(1);
}

const [version, platform, arch] = args;

const pkgName = `letui-${platform}-${arch}`;
const scope = "@frixaco";
const fullPkgName = `${scope}/${pkgName}`;

console.log(`Preparing ${fullPkgName} v${version}...`);

const manifest = {
  name: fullPkgName,
  version,
  description: `Prebuilt binary for letui on ${platform}-${arch}`,
  os: [platform],
  cpu: [arch],
  // We don't really need a 'main' since we resolve the file directly,
  // but it's good practice.
  files: [
    "*.dylib",
    "*.so",
    "*.dll",
    "*.node"
  ]
};

const outDir = join("npm", pkgName);

// Ensure directory exists
await mkdir(outDir, { recursive: true });

// Write package.json
await write(join(outDir, "package.json"), JSON.stringify(manifest, null, 2));

console.log(`Created package manifest in ${outDir}`);

```
./src/colors.ts
```typescript
export const COLORS = {
	default: {
		bg: 0x16181a,
		bg_alt: 0x1e2124,
		bg_highlight: 0x3c4048,
		fg: 0xffffff,
		grey: 0x7b8496,
		blue: 0x5ea1ff,
		green: 0x5eff6c,
		cyan: 0x5ef1ff,
		red: 0xff6e5e,
		yellow: 0xf1ff5e,
		magenta: 0xff5ef1,
		pink: 0xff5ea0,
		orange: 0xffbd5e,
		purple: 0xbd5eff,
	},
	light: {
		bg: 0xffffff,
		bg_alt: 0xeaeaea,
		bg_highlight: 0xacacac,
		fg: 0x16181a,
		grey: 0x7b8496,
		blue: 0x0057d1,
		green: 0x008b0c,
		cyan: 0x008c99,
		red: 0xd11500,
		yellow: 0x997b00,
		magenta: 0xd100bf,
		pink: 0xf40064,
		orange: 0xd17c00,
		purple: 0xa018ff,
	},
} as const;

```
./src/components.ts
```typescript
import { $, type Signal } from "./signals";
import type {
  Frame,
  Node,
  BoxProps,
  TextProps,
  InputProps,
  ButtonProps,
  StyleProps,
  _StyleProps,
  _BoxProps,
  _TextProps,
  _InputProps,
  _ButtonProps,
} from "./types";

// Re-export types for convenience
export type {
  Frame,
  Node,
  BoxProps,
  TextProps,
  InputProps,
  ButtonProps,
  StyleProps,
  BorderStyle,
  BorderProps,
} from "./types";

// =============================================================================
// INTERNALS
// =============================================================================

const generateId = (() => {
  let counter = 1;
  return () => counter++;
})();

function getInitialFrame(): Frame {
  return { x: 0, y: 0, width: 0, height: 0 };
}

// --- Props-to-Signals Converters ---

function createStyleSignals(input: StyleProps): _StyleProps {
  return {
    border: $(input.border),
    padding: $(input.padding),
    background: $(input.background),
    foreground: $(input.foreground),
    flexGrow: $(input.flexGrow),
  };
}

function createBoxSignals(input: BoxProps): _BoxProps {
  return {
    ...createStyleSignals(input),
    gap: $(input.gap),
    direction: $(input.direction),
  };
}

function createTextSignals(input: TextProps): _TextProps {
  return {
    ...createStyleSignals(input),
    text: $(input.text),
  };
}

function createInputSignals(
  input: { placeholder?: string } & StyleProps,
): _InputProps {
  return {
    ...createStyleSignals(input),
    text: $(""),
    placeholder: $(input.placeholder),
  };
}

function createButtonSignals(
  input: { text: string } & StyleProps,
): _ButtonProps {
  return {
    ...createStyleSignals(input),
    text: $(input.text),
  };
}

// --- Generic setStyle ---

function makeSetStyle<T extends Record<string, Signal<any>>>(
  props: T,
): (
  newProps: Partial<{
    [K in keyof T]: T[K] extends Signal<infer V> ? V : never;
  }>,
) => void {
  return (newProps) => {
    for (const [key, value] of Object.entries(newProps)) {
      if (key in props) {
        (props as any)[key](value);
      }
    }
  };
}

// =============================================================================
// FOCUS MANAGEMENT
// =============================================================================

let focusedNode: Node | null = null;

export function getFocusedNode(): Node | null {
  return focusedNode;
}

export function focusNode(node: Node): void {
  if (focusedNode === node) return;

  if (focusedNode) {
    const prev = focusedNode;
    focusedNode = null;
    const handler = (prev.handlers as any).onBlur;
    if (handler) handler(prev);
  }

  focusedNode = node;
  const handler = (node.handlers as any).onFocus;
  if (handler) handler(node);
}

function blurNode(node: Node): void {
  if (focusedNode !== node) return;
  focusedNode = null;
  const handler = (node.handlers as any).onBlur;
  if (handler) handler(node);
}

// =============================================================================
// CONSTRUCTORS
// =============================================================================

export function Box(input: BoxProps, children: Node[]): Node {
  const props = createBoxSignals(input);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "box",
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: makeSetStyle(props),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Column(
  props: Omit<BoxProps, "direction">,
  children: Node[],
): Node {
  return Box({ ...props, direction: "column" }, children);
}

export function Row(
  props: Omit<BoxProps, "direction">,
  children: Node[],
): Node {
  return Box({ ...props, direction: "row" }, children);
}

export function Text(input: TextProps): Node {
  const props = createTextSignals(input);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "text",
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Input(input: InputProps): Node {
  const { onChange, onSubmit, onFocus, onBlur, ...styleInput } = input;
  const props = createInputSignals(styleInput);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "input",
    id: generateId(),
    props,
    handlers: { onChange, onSubmit, onFocus, onBlur },
    frame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Button(input: ButtonProps, children: Node[] = []): Node {
  const { onClick, onKeyDown, onFocus, onBlur, ...styleInput } = input;
  const props = createButtonSignals(styleInput);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "button",
    id: generateId(),
    props,
    handlers: { onClick, onKeyDown, onFocus, onBlur },
    frame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

// Re-export runtime
export { run, onKey } from "./runtime";

```
./src/debug.ts
```typescript
function createLogWriter() {
  try {
    return Bun.file("dump/logs.txt").writer();
  } catch {
    return {
      write(..._args: unknown[]) {},
      flush(..._args: unknown[]) {},
    };
  }
}

export const logWriter = createLogWriter();

export function log(txt: string, ...args: string[]) {
  logWriter.write(txt + " " + args.join(" ") + "\n");
}

```
./src/ffi.ts
```typescript
import { dlopen, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const filename = `${prefix}letui_ffi.${suffix}`;

import { fileURLToPath } from "url";

function getLibraryPath(): string {
  const { platform, arch } = process;

  const localPath = fileURLToPath(
    new URL(`../letui-ffi/target/release/${filename}`, import.meta.url),
  );

  console.log("Attempting to load local build from:", localPath);

  try {
    if (Bun.file(localPath).size > 0) {
      console.log("Found local build!");
      return localPath;
    }
  } catch (e) {
    console.log("Local build check failed:", e);
  }

  const pkgName = `@frixaco/letui-${platform}-${arch}`;
  console.log("Falling back to package:", pkgName);
  return Bun.resolveSync(`${pkgName}/${filename}`, import.meta.dir);
}

const path = getLibraryPath();

const { symbols: api } = dlopen(path, {
  init_letui: {
    args: [],
    returns: "i32",
  },
  deinit_letui: {
    args: [],
    returns: "i32",
  },
  init_buffer: {
    args: [],
    returns: "i32",
  },
  get_buffer_ptr: {
    args: [],
    returns: "pointer",
  },
  get_buffer_len: {
    args: [],
    returns: "u64",
  },

  paint: {
    args: ["pointer", "u32", "pointer", "u32"],
    returns: "i32",
  },
  get_frames_ptr: {
    args: [],
    returns: "pointer",
  },
  get_frames_len: {
    args: [],
    returns: "u64",
  },
  get_width: {
    args: [],
    returns: "u16",
  },
  get_height: {
    args: [],
    returns: "u16",
  },
  free_buffer: {
    args: [],
    returns: "i32",
  },
  debug_buffer: {
    args: ["u64"],
    returns: "u64",
  },
  flush: {
    args: [],
    returns: "i32",
  },
  update_terminal_size: {
    args: [],
    returns: "i32",
  },
});

export default api;

```
./src/metrics.ts
```typescript
interface MetricsData {
  frameTimes: number[];
  serializeTimes: number[];
  rustTimes: number[]; // FFI call: taffy layout + buffer paint
  syncTimes: number[]; // Reading frames back to JS
  flushTimes: number[];
  frameCount: number;
}

const metrics: MetricsData = {
  frameTimes: [],
  serializeTimes: [],
  rustTimes: [],
  syncTimes: [],
  flushTimes: [],
  frameCount: 0,
};

const MAX_SAMPLES = 120;

export function startFrame(): number {
  return Bun.nanoseconds();
}

export function startPhase(): number {
  return Bun.nanoseconds();
}

function recordTime(arr: number[], startTime: number): void {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000;
  arr.push(elapsed);
  if (arr.length > MAX_SAMPLES) arr.shift();
}

export function endSerialize(startTime: number): void {
  recordTime(metrics.serializeTimes, startTime);
}

export function endRust(startTime: number): void {
  recordTime(metrics.rustTimes, startTime);
}

export function endSync(startTime: number): void {
  recordTime(metrics.syncTimes, startTime);
}

export function endFlush(startTime: number): void {
  recordTime(metrics.flushTimes, startTime);
}

export function endFrame(startTime: number): void {
  recordTime(metrics.frameTimes, startTime);
  metrics.frameCount++;
}

interface Stats {
  avg: number;
  min: number;
  max: number;
  p99: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const clamped = Math.max(0, Math.min(1, p));
  const rank = clamped * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) return sorted[lower]!;

  const weight = rank - lower;
  const lowValue = sorted[lower]!;
  const highValue = sorted[upper]!;
  return lowValue + (highValue - lowValue) * weight;
}

function calculateStats(times: number[]): Stats {
  if (times.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p99 = percentile(sorted, 0.99);
  return { avg, min, max, p99 };
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function getMetrics() {
  const frame = calculateStats(metrics.frameTimes);
  const serialize = calculateStats(metrics.serializeTimes);
  const rust = calculateStats(metrics.rustTimes);
  const sync = calculateStats(metrics.syncTimes);
  const flush = calculateStats(metrics.flushTimes);

  const fps = frame.avg > 0 ? Math.round(1000 / frame.avg) : 0;
  const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  return {
    fps,
    heapMB,
    frameCount: metrics.frameCount,
    frame,
    serialize,
    rust,
    sync,
    flush,
  };
}

export function formatMetrics(): string {
  const m = getMetrics();
  const f = m.frame;
  return [
    `${m.fps}fps | ${fmt(f.avg)}ms avg (${fmt(f.min)}-${fmt(f.max)}, p99:${fmt(f.p99)}) | ${m.heapMB}MB | ${m.frameCount} frames`,
    `serialize: ${fmt(m.serialize.avg)}ms (${fmt(m.serialize.min)}-${fmt(m.serialize.max)})`,
    `rust:      ${fmt(m.rust.avg)}ms (${fmt(m.rust.min)}-${fmt(m.rust.max)}) [layout+paint]`,
    `sync:      ${fmt(m.sync.avg)}ms (${fmt(m.sync.min)}-${fmt(m.sync.max)}) [frames→JS]`,
    `flush:     ${fmt(m.flush.avg)}ms (${fmt(m.flush.min)}-${fmt(m.flush.max)}) [terminal I/O]`,
  ].join("\n");
}

export function resetMetrics(): void {
  metrics.frameTimes = [];
  metrics.serializeTimes = [];
  metrics.rustTimes = [];
  metrics.syncTimes = [];
  metrics.flushTimes = [];
  metrics.frameCount = 0;
}

export function saveMetrics(filename: string): void {
  Bun.write(filename, formatMetrics() + "\n");
}

```
./src/runtime.ts
```typescript
import { ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors";
import api from "./ffi";
import { $, ff, type Signal } from "./signals";
import { getFocusedNode } from "./components";
import type { Node } from "./types";
import {
  startFrame,
  endFrame,
  startPhase,
  endSerialize,
  endRust,
  endSync,
  endFlush,
  formatMetrics,
} from "./metrics";
import { logWriter } from "./debug";

export type RunOptions = {
  debug?: boolean;
};

let terminalWidth: Signal<number>;
let terminalHeight: Signal<number>;
let spatialLookup: (number | undefined)[];
let nodeRegistry: Map<number, Node>;
let globalKeyHandlers: Map<string, () => void>;
let pressedNodeId: number | null = null;
let isRunning = false;
let quitFn: (() => void) | null = null;


function getNodeAt(x: number, y: number): Node | undefined {
  const id = spatialLookup[y * terminalWidth() + x];
  return id !== undefined ? nodeRegistry.get(id) : undefined;
}

const FIELDS_PER_NODE = 13;

function countNodes(node: Node): number {
  const children = node.children?.() ?? [];
  return 1 + children.reduce((sum, child) => sum + countNodes(child), 0);
}

function serialize(root: Node): {
  nodeData: Float32Array;
  textData: Uint8Array;
} {
  const nodeCount = countNodes(root);
  const nodeData = new Float32Array(nodeCount * FIELDS_PER_NODE);
  const texts: string[] = [];

  let offset = 0;

  function serializeNode(node: Node): void {
    // Node type: 1=row, 2=column, 3=button, 4=input, 5=text
    let nodeType: number;
    if (node.type === "box") {
      nodeType = node.props.direction?.() === "row" ? 1 : 2;
    } else if (node.type === "button") {
      nodeType = 3;
    } else if (node.type === "input") {
      nodeType = 4;
    } else {
      nodeType = 5; // text
    }

    // Read props (auto-subscribes render effect)
    const gap = (node.props as any).gap?.() ?? 0;
    const padding = node.props.padding?.() ?? 0;
    let paddingX: number, paddingY: number;
    if (typeof padding === "string") {
      [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
    } else {
      paddingX = paddingY = padding;
    }

    const border = node.props.border?.();
    const hasBorder = border ? 1 : 0;
    const borderColor = border?.color ?? COLORS.default.bg;
    const borderStyle =
      border?.style === "rounded" ? 1 : border?.style === "square" ? 2 : 0;

    const background = node.props.background?.() ?? COLORS.default.bg;
    const foreground = node.props.foreground?.() ?? COLORS.default.fg;
    const flexGrow = node.props.flexGrow?.() ?? 0;

    // Children count
    const children = node.children?.() ?? [];
    const childCount = children.length;

    // Text content (for text/input/button)
    let textContent = "";
    if (
      node.type === "text" ||
      node.type === "input" ||
      node.type === "button"
    ) {
      textContent = (node.props as any).text?.() ?? "";
    }
    const textLength = new TextEncoder().encode(textContent).length; // Byte length for Rust

    if (textContent) {
      texts.push(textContent);
    }

    // Write 13 fields
    nodeData[offset++] = nodeType;
    nodeData[offset++] = gap;
    nodeData[offset++] = paddingX;
    nodeData[offset++] = paddingY;
    nodeData[offset++] = hasBorder;
    nodeData[offset++] = childCount;
    nodeData[offset++] = background;
    nodeData[offset++] = foreground;
    nodeData[offset++] = borderColor;
    nodeData[offset++] = borderStyle;
    nodeData[offset++] = node.id;
    nodeData[offset++] = textLength;
    nodeData[offset++] = flexGrow;

    for (const child of children) {
      serializeNode(child);
    }
  }

  serializeNode(root);

  const textData = new TextEncoder().encode(texts.join(""));

  return { nodeData, textData };
}

function updateNodeFrames(root: Node): void {
  const framesPtr = api.get_frames_ptr()!;
  const framesLen = Number(api.get_frames_len()!);
  const framesArray = new Float32Array(
    toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4),
  );

  let idx = 0;

  function updateFrames(node: Node): void {
    nodeRegistry.set(node.id, node);

    node.frame.x = framesArray[idx++]!;
    node.frame.y = framesArray[idx++]!;
    node.frame.width = framesArray[idx++]!;
    node.frame.height = framesArray[idx++]!;

    node.frameWidth(node.frame.width);
    node.frameHeight(node.frame.height);

    const children = node.children?.() ?? [];
    for (const child of children) {
      updateFrames(child);
    }
  }

  updateFrames(root);
}

function dispatchToNode(node: Node, data: string): boolean {
  if (node.type === "input") {
    const handlers = node.handlers;
    const currentText = (node.props as any).text();

    // Backspace
    if (data === "\x7f") {
      node.setText!(currentText.slice(0, -1));
      handlers.onChange?.(node.props.text());
      return true;
    }

    // Enter (Handle \r, \n, or \r\n)
    if (data.includes("\r") || data.includes("\n")) {
      handlers.onSubmit?.(currentText);
      return true;
    }

    // Printable characters
    if (data.length === 1) {
      const code = data.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        node.setText!(currentText + data);
        handlers.onChange?.((node.props as any).text());
        return true;
      }
    }

    return false;
  }

  if (node.type === "button") {
    const handlers = node.handlers;

    // Enter or Space triggers click
    if (data.includes("\r") || data.includes("\n") || data === " ") {
      handlers.onClick();
      return true;
    }

    // Custom key handler
    if (handlers.onKeyDown) {
      handlers.onKeyDown(data);
      return true;
    }

    return false;
  }

  return false;
}

function handleKeyboardEvent(data: string): void {
  const focused = getFocusedNode();

  // If a node is focused, try its handlers first
  if (focused) {
    const handled = dispatchToNode(focused, data);
    if (handled) return;
  }

  // Fall back to global handlers
  const globalHandler = globalKeyHandlers.get(data);
  if (globalHandler) {
    globalHandler();
  }
}

function handleMouseEvent(data: string): void {
  // Parse: \x1b[<btn;x;y[Mm]
  const i = data.indexOf("<") + 1;
  const j = data.length - 1;
  const parts = data.slice(i, j).split(";");

  const isPress = data.endsWith("M");
  const isRelease = data.endsWith("m");
  const btn = Number(parts[0]) & 0b11;
  const x = Number(parts[1]) - 1; // 1-indexed -> 0-indexed
  const y = Number(parts[2]) - 1;

  const isLeftButton = btn === 0;
  const target = getNodeAt(x, y);

  if (isPress && isLeftButton) {
    if (target) {
      pressedNodeId = target.id;
      target.focus();
    } else {
      pressedNodeId = null;
      const focused = getFocusedNode();
      if (focused) focused.blur();
    }
    return;
  }

  if (isRelease && isLeftButton) {
    if (pressedNodeId !== null && target && target.id === pressedNodeId) {
      if (target.type === "button") {
        target.handlers.onClick();
      }
    }
    pressedNodeId = null;
  }
}

function handleInput(data: string, _options?: RunOptions): void {
  // Ctrl+Q to quit
  if (data === "\x11") {
    quitFn?.();
    return;
  }

  if (data.startsWith("\x1b[<")) {
    handleMouseEvent(data);
    return;
  }

  handleKeyboardEvent(data);
}

function handleResize(): void {
  api.update_terminal_size();

  // Reallocate buffer BEFORE updating signals (which trigger render)
  api.free_buffer();
  api.init_buffer();

  // Now update signals - this triggers render with correct buffer
  terminalWidth(api.get_width());
  terminalHeight(api.get_height());
  spatialLookup = new Array(terminalWidth() * terminalHeight());
}

export function onKey(key: string, callback: () => void): void {
  if (!globalKeyHandlers) {
    globalKeyHandlers = new Map();
  }
  globalKeyHandlers.set(key, callback);
}

export function run(root: Node, options?: RunOptions): { quit: () => void } {
  // 1. Initialize terminal (Rust side) - MUST be first to set TERMINAL_SIZE
  api.init_buffer();
  api.init_letui();

  // 2. Initialize state (after init_buffer so terminal size is available)
  terminalWidth = $(api.get_width());
  terminalHeight = $(api.get_height());
  globalKeyHandlers = globalKeyHandlers ?? new Map();
  nodeRegistry = new Map();
  spatialLookup = new Array(terminalWidth() * terminalHeight());
  pressedNodeId = null;
  isRunning = true;

  // 3. Setup stdin for keyboard/mouse input
  // process.stdin.resume();
  // process.stdin.setRawMode(true);
  process.stdin.on("data", (data) => handleInput(data.toString(), options));

  // 4. Setup resize handler
  process.stdout.on("resize", handleResize);

  // 5. Create render effect
  ff(() => {
    if (!isRunning) return;

    // Subscribe to terminal size changes (triggers re-render on resize)
    terminalWidth();
    terminalHeight();

    const frameStart = options?.debug ? startFrame() : 0;

    // Clear state for this frame
    spatialLookup.fill(undefined);
    nodeRegistry.clear();

    // Phase 1: Serialize node tree to flat arrays
    const serializeStart = options?.debug ? startPhase() : 0;
    const { nodeData, textData } = serialize(root);
    if (options?.debug) endSerialize(serializeStart);

    // Phase 2: Rust FFI (taffy layout + buffer paint)
    const rustStart = options?.debug ? startPhase() : 0;
    const safeTextData = textData.length > 0 ? textData : new Uint8Array(1);
    api.paint(
      ptr(nodeData),
      nodeData.length,
      ptr(safeTextData),
      textData.length,
    );
    if (options?.debug) endRust(rustStart);

    // Phase 3: Sync frame data back to JS nodes
    const syncStart = options?.debug ? startPhase() : 0;
    updateNodeFrames(root);
    if (options?.debug) endSync(syncStart);

    // Phase 4: Flush buffer to terminal
    const flushStart = options?.debug ? startPhase() : 0;
    api.flush();
    if (options?.debug) endFlush(flushStart);

    if (options?.debug) endFrame(frameStart);
  });

  // 6. Create and store quit function
  quitFn = () => {
    isRunning = false;
    api.free_buffer();
    api.deinit_letui();
    // process.stdin.setRawMode(false);
    if (options?.debug) {
      const stats = formatMetrics();
      Bun.write("dump/metrics.txt", stats + "\n");
      console.log(stats);
      logWriter.flush();
    }
    process.exit(0);
  };

  return { quit: quitFn };
}

```
./src/signals.ts
```typescript
export type Signal<T> = {
  (): T;
  (next: T): void;
};
export type ReadonlySignal<T> = () => T;
export type Sub = () => void;

let caller: null | Sub = null;

let scheduled = new Set<Sub>();
let flushing = false;

function schedule(fn: Sub) {
  scheduled.add(fn);

  if (flushing) return;

  flushing = true;
  queueMicrotask(() => {
    try {
      while (scheduled.size) {
        const snapshot = Array.from(scheduled);
        scheduled.clear();
        for (let s of snapshot) {
          // Set caller so signals read during re-run create new subscriptions
          let prev = caller;
          try {
            caller = s;
            s();
          } finally {
            caller = prev;
          }
        }
      }
    } finally {
      flushing = false;
    }
  });
}

export function $<T>(defaultValue: T): Signal<T> {
  let v: T = defaultValue;
  let subs = new Set<Sub>();

  function $$(): T;
  function $$(next: T): void;

  function $$(next?: T): T | void {
    if (arguments.length === 0) {
      if (caller) subs.add(caller);
      return v;
    }

    let newV = next as T;
    if (Object.is(v, newV)) return;
    v = newV;

    for (let s of subs) schedule(s);
  }

  return $$;
}

export function dd<T>(fn: () => T): ReadonlySignal<T> {
  let v: T;
  let initialized = false;
  let subs = new Set<Sub>();

  let recompute = () => {
    let prev = caller;
    let newV: T;

    try {
      caller = recompute;
      newV = fn();
    } finally {
      caller = prev;
    }

    if (!initialized || !Object.is(v, newV)) {
      v = newV;
      initialized = true;
      for (const s of subs) schedule(s);
    }

    return v;
  };

  v = recompute();

  function $$(): T {
    if (caller) subs.add(caller);
    return v;
  }

  return $$;
}

export function ff(fn: Sub): void {
  let prev = caller;
  try {
    caller = fn;
    fn();
  } finally {
    caller = prev;
  }
}

// TODO: improve types
export function af<T>(srcOrFn: () => Promise<T | null>): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
};
export function af<T>(
  srcOrFn: Signal<T>,
  fn: (src: T) => Promise<T | null>,
): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
};

export function af<T>(
  srcOrFn: Signal<T> | (() => Promise<T | null>),
  fn?: (src: T) => Promise<T | null>,
): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
} {
  let data = $<T | null>(null);
  let loading = $(false);
  let ctrl: AbortController | null = null;

  async function fetchData(src?: T): Promise<void> {
    ctrl?.abort();
    ctrl = new AbortController();

    let currentCtrl = ctrl;

    loading(true);

    try {
      let v: T | null = null;
      if (fn && src !== undefined) {
        v = await fn(src);
      } else {
        v = await srcOrFn();
      }

      if (currentCtrl.signal.aborted) return;

      data(v);
    } finally {
      if (!currentCtrl.signal.aborted) {
        loading(false);
      }
    }
  }

  ff(() => {
    if (!fn) {
      fetchData();
      return;
    }

    fetchData((srcOrFn as Signal<T>)());
  });

  return {
    data,
    loading,
  };
}

// const counter = $(0);

// const { data, loading } = af(counter, async (c) => {
//   console.log("--- async effect running");
//   await wait();
//   return c + 100;
// });
//
// ff(() => {
//   console.log(`loading: ${loading()} data: ${data()}`);
// });

// ff(() => {
//   console.log(counter());
// });
//
// counter(1);
// console.log("first set called");
//
// counter(2);
// console.log("second set called");

export function wait(ms: number = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function whenSettled(fn: Sub): void {
  schedule(fn);
}

// const doubleCounter = dd(() => counter.get() * 2);
//
// ff(() => {
//   console.log("fc", counter.get() + 1); // prints 1 first time, 2 second time
// });
//
// counter.set(1);
// await Promise.resolve();
// console.log("dc", doubleCounter.get()); // prints 2 cause of line above

// Output:
// ❯ bun run component-api.ts
// fc 1
// fc 2
// dc 2

```
./src/types.ts
```typescript
import type { Signal } from "./signals";

// =============================================================================
// CORE TYPES
// =============================================================================

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BorderStyle = "square" | "rounded";

export type BorderProps = {
  color: number;
  style: BorderStyle;
};

// =============================================================================
// INTERNAL PROP TYPES (signal-based, used inside nodes)
// =============================================================================

export type _StyleProps = {
  border: Signal<BorderProps | undefined>;
  padding: Signal<number | `${number} ${number}` | undefined>;
  background: Signal<number | undefined>;
  foreground: Signal<number | undefined>;
  flexGrow: Signal<number | undefined>;
};

export type _BoxProps = _StyleProps & {
  gap: Signal<number | undefined>;
  direction: Signal<"row" | "column" | undefined>;
};

export type _TextProps = _StyleProps & {
  text: Signal<string>;
};

export type _InputProps = _StyleProps & {
  text: Signal<string>;
  placeholder: Signal<string | undefined>;
};

export type _ButtonProps = _StyleProps & {
  text: Signal<string>;
};

// =============================================================================
// USER-FACING PROP TYPES (plain values, passed to constructors)
// =============================================================================

export type StyleProps = {
  border?: BorderProps;
  padding?: number | `${number} ${number}`;
  background?: number;
  foreground?: number;
  flexGrow?: number;
};

export type BoxProps = StyleProps & {
  gap?: number;
  direction?: "row" | "column";
};

export type TextProps = StyleProps & {
  text: string;
};

export type InputProps = StyleProps & {
  placeholder?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonProps = StyleProps & {
  text: string;
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

// =============================================================================
// HANDLER TYPES (plain functions, not reactive)
// =============================================================================

export type BoxHandlers = {};

export type TextHandlers = {};

export type InputHandlers = {
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonHandlers = {
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

// =============================================================================
// NODE TYPE
// =============================================================================

type CommonFields = {
  id: number;
  frame: Frame;
  frameWidth: Signal<number>;
  frameHeight: Signal<number>;
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
};

type ContainerNode = {
  children: Signal<Node[]>;
  setChildren: (nodes: Node[]) => void;
};

type LeafNode = {
  children: undefined;
  setChildren: undefined;
};

export type TextNode = CommonFields &
  LeafNode & {
    type: "text";
    props: _TextProps;
    handlers: TextHandlers;
    setStyle: (p: Partial<StyleProps>) => void;
    setText: (v: string) => void;
  };

export type InputNode = CommonFields &
  LeafNode & {
    type: "input";
    props: _InputProps;
    handlers: InputHandlers;
    setStyle: (p: Partial<StyleProps & { placeholder?: string }>) => void;
    setText: (v: string) => void;
  };

export type ButtonNode = CommonFields &
  ContainerNode & {
    type: "button";
    props: _ButtonProps;
    handlers: ButtonHandlers;
    setStyle: (p: Partial<StyleProps & { text?: string }>) => void;
    setText: (v: string) => void;
  };

export type BoxNode = CommonFields &
  ContainerNode & {
    type: "box";
    props: _BoxProps;
    handlers: BoxHandlers;
    setStyle: (p: Partial<BoxProps>) => void;
  };

export type Node = TextNode | InputNode | ButtonNode | BoxNode;

```
