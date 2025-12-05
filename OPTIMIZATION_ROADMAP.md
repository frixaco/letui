# letui Optimization Roadmap

> Generated from architecture analysis session. Use as reference for improving performance and architecture.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current Architecture](#current-architecture)
3. [Performance Baseline](#performance-baseline)
4. [Completed Optimizations](#completed-optimizations)
5. [Remaining Optimizations](#remaining-optimizations)
6. [Fine-Grained Reactivity](#fine-grained-reactivity)
7. [Advanced Path](#advanced-path)
8. [Quick Reference](#quick-reference)

---

## Project Overview

**Goal**: A minimal, fast TUI library with:

- Signals for state management (TypeScript)
- Rust backend for core operations (buffer, diffing, layout via Taffy)
- TypeScript component API (layout, paint, events)

**Performance Target**: <8ms per frame (120hz)

---

## Current Architecture

### Strengths

| Area                 | Why It Works                                                 |
| -------------------- | ------------------------------------------------------------ |
| Rust/TS separation   | FFI only for coarse operations (layout, flush), not per-cell |
| Signals              | Simple, effective reactive primitives (`$`, `dd`, `ff`)      |
| Diff-based flush     | Rust only writes changed cells to terminal                   |
| Single render effect | One `ff` drives the whole render loop                        |

### Weaknesses

| Area                     | Problem                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| Full rebuild every frame | Any signal change rebuilds entire tree, re-layouts, repaints everything |
| Buffer cloning           | ~~Was copying 16MB every flush~~ ✅ Fixed                               |
| Debug I/O                | ~~`Bun.write("tree.json")` every frame~~ ✅ Fixed                       |
| Allocations in hot path  | Per-cell `BigUint64Array`, new arrays every frame                       |

### Render Pipeline

```
Signal Change
     ↓
ff() effect triggers
     ↓
nodeFactory(tw, th)        → Rebuild entire node tree
     ↓
serializeNodes(node)       → Convert to JSON
     ↓
api.calculate_layout()     → Rust: parse JSON, build Taffy tree, compute layout
     ↓
updateFrames(node)         → Copy frame data back to TS nodes
     ↓
paint(node)                → Write to buffer (per-cell)
     ↓
api.flush()                → Rust: diff buffers, write to terminal
```

---

## Performance Baseline

### Before Optimizations

```
113 fps | 8.85ms avg (3.47-32.43) | 31.7MB heap | 27 frames
```

### After Removing `Bun.write`

```
139 fps | 7.2ms avg (3-33) | 22.2MB heap | 40 frames
```

### After Fixing Buffer Clone

```
~150+ fps | ~5ms avg (1-13) | ~20MB heap
```

### Remaining Spikes (1-13ms range)

Likely causes:

1. GC pauses from per-cell allocations
2. JSON serialization overhead
3. Taffy tree rebuild

---

## Completed Optimizations

### 1. Remove Debug File Write ✅

**File**: `components.ts`
**Change**: Removed `Bun.write("tree.json", jsonTree)` from `layout()`
**Impact**: Eliminated ~10-20ms spikes

### 2. Fix Buffer Clone ✅

**File**: `letui-ffi/src/lib.rs`
**Change**: Replace full 16MB `buf.clone()` with `copy_from_slice` of only used cells

```rust
// Before
*lb = Some(buf.clone());

// After
last_buf[0..used_cells * 3].copy_from_slice(&buf[0..used_cells * 3]);
```

**Impact**: Eliminated major memory copy, reduced spikes

### 3. Add Metrics Tracking ✅

**File**: `metrics.ts`
**Features**:

- Frame timing via `Bun.nanoseconds()`
- Memory tracking via `process.memoryUsage().heapUsed`
- FPS, avg/min/max frame time
- Outputs to console and `metrics.txt` on quit

---

## Remaining Optimizations

### Priority 1: Quick Wins (S effort, high impact)

#### 1A. Eliminate Per-Cell `BigUint64Array` Allocation

**File**: `components.ts` → `drawBackground()`

**Current** (allocates per cell):

```typescript
buffer.set(
  new BigUint64Array([
    BigInt(" ".codePointAt(0)!),
    BigInt(COLORS.default.bg),
    BigInt(bg),
  ]),
  (j * terminalWidth() + i) * 3,
);
```

**Fixed** (direct index writes):

```typescript
const blankChar = BigInt(" ".codePointAt(0)!);
const defaultBg = BigInt(COLORS.default.bg);

function drawBackground(buffer, node, bg, terminalWidth) {
  const tw = terminalWidth();
  const bgBig = BigInt(bg);
  for (let j = node.frame.y; j < node.frame.y + node.frame.height; j++) {
    for (let i = node.frame.x; i < node.frame.x + node.frame.width; i++) {
      const idx = (j * tw + i) * 3;
      buffer[idx] = blankChar;
      buffer[idx + 1] = defaultBg;
      buffer[idx + 2] = bgBig;
    }
  }
}
```

#### 1B. Reuse `spatialLookup` Array

**File**: `components.ts` → inside `run()`

**Current**:

```typescript
spatialLookup = new Array(terminalWidth() * terminalHeight());
```

**Fixed**:

```typescript
// At init
let spatialLookup = new Array(terminalWidth() * terminalHeight());

// In render loop
spatialLookup.fill(undefined);
```

#### 1C. Reuse Frames Vector in Rust

**File**: `letui-ffi/src/lib.rs` → `calculate_layout()`

**Current**:

```rust
let mut frames: Vec<f32> = Vec::new();
build_frames_array(&mut taffy, root, &mut frames, 0.0, 0.0);
*FRAMES.lock().unwrap() = Some(frames);
```

**Fixed**:

```rust
let mut frames_lock = FRAMES.lock().unwrap();
let frames_vec = frames_lock.get_or_insert_with(Vec::new);
frames_vec.clear();
build_frames_array(&mut taffy, root, frames_vec, 0.0, 0.0);
```

### Priority 2: Medium Effort (M effort)

#### 2A. Remove Redundant `api.flush()` Calls

**File**: `components.ts`

Event handlers (`handleKeyboardEvent`, `handleMouseEvent`) call `api.flush()`, then the reactive `ff` effect also flushes. Remove flushes from event handlers — let the render loop handle it.

#### 2B. Right-Size Buffers

**File**: `letui-ffi/src/lib.rs`

Allocate buffers based on terminal size, not fixed `MAX_BUFFER_SIZE = 2_000_000`:

```rust
fn buffer_len_for_terminal(w: u16, h: u16) -> usize {
    w as usize * h as usize * 3
}
```

### Priority 3: Larger Effort (L effort)

#### 3A. Binary Layout Protocol

Replace JSON serialization with a flat binary buffer (e.g., `Float32Array` with node records).

#### 3B. Persistent Taffy Tree

Keep Taffy tree alive in Rust, update incrementally instead of rebuilding.

---

## Fine-Grained Reactivity

### Current Problem

Any signal change triggers: full tree rebuild → full layout → full repaint

### Goal

Signal change → mark node dirty → batch updates → layout if needed → repaint only dirty nodes

### Implementation Steps

#### Step 1: Persist Node Tree

Call `nodeFactory` once at startup, not every frame.

```typescript
let root: NodeInstance;

function init() {
  root = nodeFactory(terminalWidth(), terminalHeight());
  setupNodeReactivity(root);
  layout(root);
  paint(root);
  api.flush();
}
```

#### Step 2: Add Dirty Tracking

```typescript
const layoutDirtyNodes = new Set<NodeInstance>();
const paintDirtyNodes = new Set<NodeInstance>();

function markLayoutDirty(node: NodeInstance) {
  layoutDirtyNodes.add(node);
  scheduleProcess();
}

function markPaintDirty(node: NodeInstance) {
  paintDirtyNodes.add(node);
  scheduleProcess();
}
```

#### Step 3: Central Scheduler

```typescript
let updateScheduled = false;

function scheduleProcess() {
  if (updateScheduled) return;
  updateScheduled = true;
  queueMicrotask(processUpdates);
}

function processUpdates() {
  updateScheduled = false;

  if (layoutDirtyNodes.size) {
    layoutDirtyNodes.clear();
    layout(root); // Still full layout, but less often
    paintDirtyNodes.add(root);
  }

  for (const node of paintDirtyNodes) {
    paintSubtree(node);
  }
  paintDirtyNodes.clear();

  rebuildSpatialLookup(root);
  api.flush();
}
```

#### Step 4: Per-Node Reactive Bindings

```typescript
function setupNodeReactivity(node: NodeInstance) {
  if (node.type === "text" || node.type === "button" || node.type === "input") {
    const textSignal = (node.props as TextProps).text;

    ff(() => {
      textSignal(); // Subscribe
      markLayoutDirty(node); // Text affects size
    });
  }

  ff(() => {
    const focused = focusedComponentId() === node.id;
    markPaintDirty(node); // Focus is visual only
  });

  for (const child of node.children) {
    setupNodeReactivity(child);
  }
}
```

### Layout vs Paint Distinction

| Change Type  | Examples                                 | Action                |
| ------------ | ---------------------------------------- | --------------------- |
| Layout dirty | text content, padding, gap, border width | Full layout + repaint |
| Paint dirty  | focus, colors, pressed state             | Repaint only          |

---

## Advanced Path

Only pursue if you hit performance limits with the above optimizations.

### Persistent Taffy Tree in Rust

1. **Stable node IDs**: Include `node.id` in layout JSON
2. **ID→NodeId map**: `HashMap<String, NodeId>` in Rust
3. **Incremental updates**: FFI functions like:
   - `update_node_text(id, text_ptr, text_len)`
   - `update_node_style(id, padding, gap, ...)`
4. **Recompute without rebuild**: `recompute_layout(width, height)` on existing tree

### Binary Layout Protocol

Replace JSON with packed structs:

```typescript
// TypeScript side
const nodeBuffer = new Float32Array([
  // node 0: type, gap, paddingX, paddingY, border, textLen, ...textChars
]);
api.calculate_layout_binary(ptr(nodeBuffer), nodeBuffer.length);
```

### Packed Cell Representation

One `u64` per cell instead of three:

```
┌────────────────────────────────────────────────────────────────┐
│  bits 0-20: codepoint  │  bits 21-44: fg RGB  │  bits 45-63: bg RGB  │
└────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

### Commands

```bash
# Build Rust FFI
cd letui-ffi && cargo build --release

# Run example
bun run dev

# Quit TUI (outputs metrics)
Ctrl+Q
```

### Metrics API

```typescript
import { getMetrics, formatMetrics, shouldReport } from "./metrics.ts";

// Get raw values
const { fps, avgFrameTime, maxFrameTime, heapMB } = getMetrics();

// Get formatted string
formatMetrics(); // "120fps | 2.5ms avg (1.8-4.2) | 12.3MB heap | 847 frames"
```

### Performance Checklist

- [ ] No `Bun.write` or file I/O in render loop
- [ ] Buffer copy uses only `used_cells`, not full size
- [ ] No `new BigUint64Array()` per cell
- [ ] Arrays reused with `.fill()` instead of `new Array()`
- [ ] Rust vectors reused with `.clear()`
- [ ] Single `flush()` per frame (not in event handlers)
- [ ] Metrics show <8ms avg, <16ms max

### Architecture Checklist (Future)

- [ ] Node tree persisted, not rebuilt every frame
- [ ] Per-node `ff` effects for dirty tracking
- [ ] Central scheduler batches updates
- [ ] Layout runs only when layout-affecting props change
- [ ] Paint runs only for dirty subtrees

---

## Files Reference

| File                   | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `signals.ts`           | Reactive primitives (`$`, `dd`, `ff`, `af`) |
| `components.ts`        | Runtime, components, layout, paint          |
| `ffi.ts`               | Bun FFI bindings to Rust                    |
| `letui-ffi/src/lib.rs` | Rust core: buffer, flush, taffy layout      |
| `metrics.ts`           | Performance tracking                        |
| `examples.ts`          | Demo app                                    |
| `colors.ts`            | Color constants                             |
