# Rust Scene Graph + Hybrid Immediate-State Design

## Goals
- Hit <8 ms (120 Hz) by letting Rust own the hottest render path.
- Keep the TypeScript API ergonomic via immediate-mode calls backed by a lightweight retained state machine.
- Avoid full-screen redraws by combining dirty flags in TypeScript with cell-level diffing in Rust.

## High-Level Architecture
```
TypeScript app state ──► Immediate UI DSL ──► State Machine (dirty flags)
        │                                       │
        └──────── events ◄── Event Router ◄─────┘
                      │
                      ▼
          Scene Updates (batched commands)
                      │
                      ▼
          Rust Scene Graph + Diff + Flush
```

### TypeScript Responsibilities
1. **App State**  
   Plain objects (e.g., `state.results`, `state.status`).

2. **Immediate UI DSL**  
   Declarative functions (`ui.col`, `ui.button`, `ui.input`) called inside `ui.frame(() => …)`.

3. **Retained State Machine**  
   Component-level stores tracked by ID. Each store exposes:
   - `get(id)` – returns current component state.
   - `update(id, fn)` – mutates state, marks relevant dirty flags.
   - `consumeDirty()` – returns list of component IDs that changed this frame.

4. **Scene Update Builder**  
   Converts dirty component states into commands for Rust:
   ```ts
   type SceneCommand =
     | { type: "Shape"; id: string; rect: Rect; style: Style }
     | { type: "Text"; id: string; rect: Rect; content: string; style: Style }
     | { type: "Remove"; id: string };
   ```

5. **Event Router**  
   Normalizes keyboard/mouse/resize events. Routes them to component states by ID, requests new frames when state changes.

### Rust Responsibilities
1. **Scene Graph**  
   Stores nodes keyed by stable IDs:
   ```rust
   struct SceneNode {
       id: String,
       rect: Rect,
       kind: NodeKind, // Text, Shape, Widget, etc.
       style: Style,
       z_index: u16,
   }
   ```

2. **Command Processor**  
   Accepts batches of `SceneCommand` from TypeScript, mutates the scene graph, and records what changed.

3. **Cell Diff + Flush**  
   - Re-rasterizes only affected nodes into an intermediate cell buffer.
   - Compares with the previous buffer to emit minimal terminal writes.
   - Calls `flush()` once per frame.

4. **Resize Handling**  
   Rebuilds buffers and re-rasterizes the visible scene when terminal size changes.

## TypeScript API Snapshot

```ts
import { createUI } from "letui";

const ui = createUI({
  renderer: bunFFIRenderer,
  stateMachine: createStateMachine(),
});

ui.frame(() => {
  ui.col({ id: "root", pad: { x: 2, y: 1 }, gap: 1, border: "rounded" }, () => {
    ui.text({ id: "title", content: "What am I doing?", fg: cl.cyan });

    ui.row({ id: "controls", gap: 1 }, () => {
      const input = ui.input({
        id: "search-input",
        value: state.searchTerm,
        placeholder: "Type to fetch…",
        fg: cl.magenta,
      });
      if (input.changed) state.searchTerm = input.value;

      if (ui.button({ id: "fetch-btn", label: "Fetch", fg: cl.black, bg: cl.green })) {
        queueFetch(state.searchTerm);
      }
    });

    ui.text({ id: "status", content: state.status, fg: cl.grey });

    ui.col({ id: "results", gap: 0 }, () => {
      for (const activity of state.results) {
        ui.row({
          id: `activity-${activity.id}`,
          gap: 1,
          border: "none",
        }, () => {
          ui.text({ id: `activity-${activity.id}-title`, content: activity.title, fg: cl.white });
          ui.text({ id: `activity-${activity.id}-platform`, content: activity.platform, fg: cl.dimGrey });
          ui.text({ id: `activity-${activity.id}-date`, content: activity.date, fg: cl.blue });
        });
      }
    });
  });
});
```

### Event Flow Example
1. User types inside `"search-input"`; event router forwards characters to the input store.
2. Store updates value, marks dirty flags `["search-input.text", "fetch-btn.state"]`.
3. Scheduler runs `ui.frame`, but only components with dirty flags execute their drawing callbacks.
4. Scene builder emits updated commands for the dirty IDs only.
5. Rust scene graph updates those nodes, re-rasterizes them, and diff flushes.

## State Machine Granularity

```ts
interface InputComponentState {
  text: string;
  cursor: number;
  focused: boolean;
  dirty: {
    border: boolean;
    background: boolean;
    text: boolean;
  };
}
```

Updates:
- Focus change → `dirty.border = true`
- Value change → `dirty.text = true`
- Style change → mark all dirty

During `ui.input` execution:
1. `const state = store.get<InputComponentState>(id);`
2. Perform layout calculations (only if `state.dirty` or global resize)
3. Push scene commands:
   ```ts
   if (state.dirty.border) emitBorderCommand(id, rect, style);
   if (state.dirty.text) emitTextCommand(id, textRect, state.text, style);
   ```
4. State machine clears the dirty flags after command emission.

## Rust Scene Graph Data Model

```rust
enum NodeKind {
    Rect { fill: Option<Color> },
    Border { style: BorderStyle },
    Text { content: String },
}

struct SceneNode {
    id: Arc<str>,
    rect: Rect,
    kind: NodeKind,
    style: Style,
    z_index: u16,
    hash: u64, // quick change detection
}

struct SceneGraph {
    nodes: HashMap<Arc<str>, SceneNode>,
    spatial: QuadTree<NodeRef>, // optional for quick dirty region queries
}
```

## Command Batching Protocol

TypeScript packs commands into a shared memory buffer before calling `ffi.apply_commands(ptr, len)`. Example batch:

```
[StartFrame]
[Text,id="status",x=3,y=4,w=20,h=1,fg=0xCCCCCC,bg=0x111111,"Loading…"]
[Rect,id="results-bg",x=3,y=6,w=60,h=10,fg=0x111111,bg=0x111111]
[Border,id="results-border",x=3,y=6,w=60,h=10,style="rounded",fg=0x333333,bg=0x111111]
[EndFrame]
```

Rust unpacks the commands, updates the graph, and returns a tiny status struct:

```rust
#[repr(C)]
pub struct FrameStats {
    pub nodes_created: u32,
    pub nodes_updated: u32,
    pub nodes_removed: u32,
    pub cells_written: u32,
    pub frame_time_us: u64,
}
```

## Redraw Strategy
1. TypeScript marks dirty components via the state machine.
2. The scheduler runs `ui.frame`. Only dirty components execute; others return immediately.
3. Scene commands for dirty components are added to the batch.
4. TypeScript sends the batch to Rust once per frame.
5. Rust:
   - Updates the scene graph with the new/changed nodes.
   - Finds the union of affected rectangles.
   - Rasterizes those regions into the current cell buffer.
   - Diffs against the previous cell buffer to emit minimal terminal writes.
   - Flushes.

## Example: Updating One Row

1. Network callback updates `state.results[2]`.
2. State machine marks `dirty: ["results", "activity-<id>", "activity-<id>-title"]`.
3. Next frame emits commands for the parent row and its text nodes.
4. Rust updates those nodes, rasterizes only their combined bounding box, and flushes a handful of cells.
5. Frame budget stays well below 8 ms even with hundreds of rows.

## Resize Handling
1. Terminal resize event triggers:
   - TypeScript layout invalidation (`stateMachine.markAllDirty()`).
   - `ffi.resize(width, height)` so Rust rebuilds buffers.
2. Next frame replays the entire scene (because everything is dirty).
3. Subsequent frames revert to incremental updates.

## Error Safety
1. All FFI calls return status codes; TypeScript throws if the scene graph refuses an update.
2. Rust catches panics, flushes a blank frame, resets terminal modes, and signals failure to TypeScript.
3. TypeScript wraps `withRenderer(async () => { … })` to guarantee cleanup on crashes.

## Instrumentation
1. Rust populates `FrameStats` for each flush; TypeScript logs when `DEBUG_SCENE=1`.
2. TypeScript tracks scheduler latency (`frameStart → flushAck`) to ensure the 8 ms target is met.
3. Optional: record dirty counts (`componentsDirty`, `nodesUpdated`) for optimization passes.

