TL;DR

The core architecture (signals + Rust buffer + taffy layout) is solid for a portfolio project.
The big wins are: remove obviously expensive debug I/O, fix buffer cloning, avoid unnecessary full layouts, and clean up the component/run API.
With those changes, <8 ms per frame is very realistic for small/medium TUIs.

Effort legend: S <1h, M 1–3h, L 1–2d, XL >2d

---

1. Current architecture – strengths and weaknesses

Strengths

Clear separation of responsibilities
Rust:
Terminal setup / teardown (init_letui, deinit_letui).
Buffer diffing & flush.
Layout via taffy + custom measure function.
TypeScript:
State via signals.
Component tree + painting into the buffer.
Input handling and focus logic.
FFI boundary is used only for “big chunks” (layout, buffer, flush, size), which is exactly what you want.
Signals model is simple and effective
$, dd, ff are small, understandable, and efficient for this scale.
run() uses a single top-level ff to re-render, so you don’t have reactive sprawl.
Rendering pipeline is conceptually clean
state → nodeFactory → layout(node) → frames → node.frame → paint(node) → flush().
Diffing happens in Rust, drawing happens in TS. Clear mental model.
Good ground for a portfolio
Demonstrates: low-level terminal control, FFI, layout engine integration, and a small reactive system.
Example app is non-trivial (network calls, pagination, keyboard/mouse focus).

Weaknesses / design debts

Everything re-renders and re-lays out on every state change
The top-level ff effect:
Rebuilds the entire tree.
Re-serializes to JSON.
Rebuilds the taffy tree and recomputes layout in Rust.
Repaints the entire buffer.
For a small app this is acceptable, but it’s the main thing that will push you towards the 8 ms limit.
Rust buffer management is wasteful
MAX_BUFFER_SIZE = 2_000_000 u64s per buffer (~16 MiB), and you keep two buffers.
flush() clones the entire buffer every frame: *lb = Some(buf.clone()), which copies the whole 16 MiB regardless of terminal size.
This is the largest low-hanging perf + memory issue.
Layout crossing is heavy (JSON each frame)
TS:
serializeNodes → JSON.stringify → allocate Buffer → FFI call.
Bun.write("tree.json", jsonTree) on every layout (!!) – this alone can easily blow your 8 ms budget.
Rust:
serde_json::from_slice + new TaffyTree + new Vec<f32> each frame.
Components + run loop are combined in a large file
components.ts mixes:
Core runtime (run, event loop, layout, paint).
Drawing primitives (drawBackground, drawBorder, setCell).
Component constructors (Column, Row, Text, etc.) and types.
Harder to read and reason about as a library.
API surface is a bit ad hoc
run(nodeFactory, deps, focusedIdSignal?) is powerful but not very self-documenting.
Props mix layout, visual, and behavior in a flat shape; ColumnProps and RowProps are basically the same.
Focus & hit-testing are baked into run instead of a reusable abstraction.

---

2. Performance bottlenecks & optimization opportunities

High-impact fixes (I would do these first)

Remove on-every-frame file write in layout (S)

// layout(node)
let jsonTree = JSON.stringify({ node: tree, width: terminalWidth(), height: terminalHeight() });

//  Bun.write("tree.json", jsonTree); // <- REMOVE this
let jsonBytes = Buffer.from(jsonTree, "utf-8");
api.calculate_layout(ptr(jsonBytes), jsonBytes.byteLength);

- This is pure debug and almost certainly dwarfs all other work once the app is interactive.

2. **Stop cloning the entire MAX_BUFFER_SIZE each flush** (M)

Current:
```rust
if let Some(ref buf) = *cb {
    *lb = Some(buf.clone());
}

Problems:

Allocates and copies 2 000 000 u64s every frame (>16 MiB per frame).
Completely unrelated to actual w * h.

Better approach:

Allocate CURRENT_BUFFER and LAST_BUFFER with size used_cells * 3 when you know the terminal size.
Only copy the used slice, and reuse allocation:

static LAST_BUFFER: Mutex<Option<Box<[u64]>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Box<[u64]>>> = Mutex::new(None);

fn buffer_len_for_terminal(w: u16, h: u16) -> usize {
    (w as usize * h as usize * 3)
}

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    *TERMINAL_SIZE.lock().unwrap() = (w, h);

    let len = buffer_len_for_terminal(w, h);

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(vec![0u64; len].into_boxed_slice());

    let mut lb = LAST_BUFFER.lock().unwrap();
    *lb = Some(vec![0u64; len].into_boxed_slice());
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn flush() -> c_int {
    let cb_guard = CURRENT_BUFFER.lock().unwrap();
    let mut lb_guard = LAST_BUFFER.lock().unwrap();

    let (w, h) = *TERMINAL_SIZE.lock().unwrap();
    let used = buffer_len_for_terminal(w, h);

    if let (Some(ref buf), Some(ref mut last_buf)) = (&*cb_guard, &mut *lb_guard) {
        // ... diff buf[..used] vs last_buf[..used] ...
        // After flushing:
        last_buf[..used].copy_from_slice(&buf[..used]); // no reallocation
    }
    1
}

Effect: O(used_cells) copy instead of O(MAX_BUFFER_SIZE) clone per frame.
Huge perf and memory improvement without changing the TS side API.

Avoid full-screen work when the terminal is small (already partially done, but enforce it) (S)
You already use used_cells = w*h. Ensure all loops in Rust only iterate up to used_cells * 3, not buf.len().
That + smaller buffers makes performance predictable.
Throttle / batch flush() calls from event handlers (S)
Right now keyboard/mouse handlers often call flush() after tweaking signals, and then the reactive effect will trigger another layout + paint + flush().
Simple rule:
Let the reactive render be the single place that calls flush().
From event handlers:
Just update signals.
Optionally schedule a render if you ever move away from a continuous effect.
Short-term minimal change:
Remove api.flush() from handleKeyboardEvent and handleMouseEvent, rely on the ff effect to re-render.
That removes redundant flushes without changing architecture.

Medium-impact / optional optimizations

Avoid layout when only non-layout properties change (M)

Today:
Even changing just a color or focus border color causes:
Rebuild node tree.
Recompute layout in Rust.
Repaint.
But layout currently depends on:
type, gap, paddingX, paddingY, border (presence), and text (for Text/Button/InputBox).
Colors and focus state only affect painting, not layout.

Simple approach:
Track a “layout version” or boolean: layoutDirty.
In run, split the work into:
Effect A: recompute layout only when layout-affecting signals change.
Effect B: repaint whenever anything changes (including layout).
You can implement this with one top-level effect but with a conditional:
let layoutVersion = $(0);

// When building the tree
function serializeNodes(node: Node) {
  // bump layoutVersion only if we detect something structural changed
}

ff(() => {
  pressedComponentId();
  const currentFocusId = focusedComponentId();
  const tw = terminalWidth();
  const th = terminalHeight();

  // read deps to track them
  const _ = deps.map((dep) => dep());

  const needsLayout = /* check: did layoutVersion() change since last run? */;

  if (needsLayout) {
    spatialLookup = new Array(tw * th);
    nodeRegistry.clear();

    const node = nodeFactory(tw, th);
    layout(node);
    triggerLayoutEvents(node);
    paint(node, node.props.bg);
  } else {
    // reuse existing frames, just repaint (colors/focus changes)
    // you’ll need to keep the node tree around rather than recreating it
  }

  // focus changes, etc.
  api.flush();
});

For a portfolio piece, even a simple “always layout” is fine; this is a nice stretch goal.
Reuse allocations for layout JSON and frames (M)
Right now you:
JSON.stringify → new Buffer → FFI.
Rust: Vec<f32> each time for frames.
Improvements:
TS: keep a scratch Buffer (or Uint8Array) and reuse it if the JSON size stays under a threshold. For a small tree this isn’t critical but is nice polish.
Rust: keep FRAMES as a Vec<f32> and clear() then extend on each layout rather than allocating a new Vec.
You already store FRAMES in a Mutex<Option<Vec<f32>>>; just:

let mut frames_lock = FRAMES.lock().unwrap();
let frames_vec = frames_lock.get_or_insert_with(Vec::new);
frames_vec.clear();
build_frames_array(&mut taffy, root, frames_vec, 0.0, 0.0);

---

3. API design improvements for the component system

Clean up run and core APIs (M)

Current signature:

export function run(
  nodeFactory: (tw: number, th: number) => Node,
  deps: Signal<any>[],
  focusedIdSignal?: Signal<string>,
)

Suggestions:

Use an options object for clarity

type RunOptions = {
  deps?: Signal<any>[];
  focusId?: Signal<string>;
};

export function run(
  nodeFactory: (tw: number, th: number) => Node,
  options: RunOptions = {},
) { /*...*/ }
Return a handle from run (M)
For cleanup and for future extensions (e.g. imperatively triggering re-render, reading focus, etc.):
export type AppHandle = {
  destroy(): void;
  focusId: Signal<string>;
  // maybe expose terminal size signals, etc.
};

export function run(...): AppHandle {
  // set up listeners, buffers, ff, etc.

  return {
    destroy() {
      process.stdin.removeAllListeners("data");
      process.stdout.removeAllListeners("resize");
      api.free_buffer();
      api.deinit_letui();
    },
    focusId: focusedComponentId,
  };
}

Nice for demos and “feels like a real lib.”

Normalize component props & layout/visual separation (M)

Unify ColumnProps and RowProps into ContainerProps

export type ContainerProps = CommonProps & {
  gap?: number;
  bg?: number;
  direction: "row" | "column";
};
Consider a small layout sub-object (if you want more explicit separation):

export type CommonProps = {
  padding?: number | `${number} ${number}`;
  border?: BorderProps;
  onLayout?: (node: Node) => void;
};

export type VisualProps = {
  fg?: number;
  bg?: number;
};
Clarify text props
Today Text, Button, InputBox all use text: Signal<string>, which is fine.
Document that text is both for layout (width/height) and display, so long texts may reflow.

Better focus & keyboard routing abstraction (M)

Right now:

run manages focus state via focusedComponentId and spatialLookup + nodeRegistry.
Event callbacks often manually compute next focus (e.g. result buttons).

You could expose a small reusable helper:

type FocusManager = {
  focus(id: string): void;
  blur(): void;
  focusedId: Signal<string>;
};

export function createFocusManager(initialId = ""): FocusManager { /*...*/ }

Then run can consume focusManager.focusedId, and components can use it to move focus without knowing about focusedComponentId internals.
For a portfolio, this shows you can design a small “hook-like” abstraction.

---

4. Rust/TypeScript boundary optimization (FFI overhead)

You’re already doing the important thing: few, coarse-grained FFI calls.

Remaining opportunities:

Keep FFI calls out of hot loops (you already do) (S)
All loops (diffing, layout, painting) are on one side of the boundary.
Only “control” calls (flush, calculate_layout, get_*) cross the FFI boundary.
Coalesce width/height reads (S)
Not performance-critical, but cleaner: a single get_size() -> (u16, u16) instead of get_width and get_height. You already cache them in signals, so this is minor polish.
Layout protocol (JSON vs. binary) (L, advanced path)
For demo-scale UIs, JSON is fine. The main overhead is the Bun.write.
If you want extra points:
Define a small C-compatible struct array for nodes, pass a pointer + count.
Or pass a flat Float32Array/Int32Array with node records from TS → Rust and parse it without serde.
This is more “serious engine” territory; not required for <8 ms for small UIs, but a nice advanced write-up.

---

5. Memory management and buffer handling

Right-size buffers and reuse them (M, mostly covered above)
Buffer sizes should be a function of terminal size.
Avoid reallocations in the hot path (flush, calculate_layout).
FRAMES vector should be reused via .clear().
Handle terminal resize consistently (M)
TS: on resize you:
update_terminal_size().
Update signals.
free_buffer() then init_buffer().
Re-acquire buffer.
Rust: update_terminal_size updates TERMINAL_SIZE.
With the new per-size buffer strategy, init_buffer will allocate exactly the right size after resize.
Ensure LAST_BUFFER is reallocated with the same size whenever CURRENT_BUFFER changes.
Avoid unnecessary BigInt allocations inside tight loops (M)
In drawBackground:

buffer.set(
  new BigUint64Array([
    BigInt(" ".codePointAt(0)!),
    BigInt(COLORS.default.bg),
    BigInt(bg),
  ]),
  (j * terminalWidth() + i) * 3,
);
This allocates a BigUint64Array for every cell write.
Faster pattern:

const blankChar = BigInt(" ".codePointAt(0)!);
const defaultBg = BigInt(COLORS.default.bg);

function drawBackground(...) {
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
Same for setCell: keep BigInt(fg)/BigInt(bg) precomputed per call where possible.
Consider packing cell data if you want to show off (L, optional)
E.g. 1 u64 per cell: upper bits for fg/bg, lower bits for codepoint.
That halves buffer size and can simplify the diff loop.
This is a “cool trick” for a write-up, but not necessary to meet the perf goal.

---

6. Code organization and separation of concerns

This is mostly aesthetic/maintainability but has portfolio value.

Suggested TS structure (M):

signals.ts – unchanged.
ffi.ts – TS FFI bindings – unchanged except maybe naming.
runtime/run.ts
The run function, event loop, resize handling, main ff effect.
runtime/layout.ts
serializeNodes, layout, triggerLayoutEvents.
runtime/paint.ts
paint, drawBackground, drawBorder, setCell, getContainerCorners.
components/index.ts
Column, Row, Text, Button, InputBox, and their props/types.
focus.ts (optional)
A tiny focus manager abstraction.

Rust side (M):

Split lib.rs into modules:
terminal.rs – init/deinit, size, mouse/keyboard setup if you expand.
buffer.rs – buffer allocation, flush, debug.
layout.rs – Node/Tree structs, taffy integration, frames.

These refactors don’t change behavior but make the repo feel more like a “real” library and easier to browse.

---

7. Missing features worth adding for a portfolio TUI library

These are not required for speed but add “completeness”:

Graceful shutdown and error handling (M)
Handle SIGINT/SIGTERM and ensure free_buffer() + deinit_letui() are called.
Wrap FFI calls that can panic (execute!, enable_raw_mode, serde_json::from_slice) with better error propagation for library consumers (maybe return 0 / error codes, or log nicely).
Basic theming support (S)
You already have COLORS.
Define a Theme type and let components accept a theme or use a default:

type Theme = {
  fg: number;
  bg: number;
  borderColor: number;
  // ...
};
Makes examples cleaner and shows design sense.
Text alignment and wrapping options (M)
You already implement wrapping logic in measure_function.
Expose align: "left" | "center" | "right" on TextProps, and respect it when painting.
It shows the full path from layout to render.
Scrollable containers / lists (M–L)
You have the building blocks:
Column with Overflow::Hidden in get_styles.
Mouse and keyboard events.
Implement a simple List component that:
Takes an array of items.
Handles up/down/page movement and keeps a scrollOffset signal.
Makes the library feel more “application ready.”
Documentation-quality examples (M)
Your examples.ts is already interesting.
Add 2–3 smaller examples:
Counter with signals.
Simple input + validation.
Basic layout demo (columns/rows/borders/colors).

---

Rationale and trade-offs

Why not go full incremental/virtual-DOM-like diffing?
For terminal UIs with small node counts, full tree rebuild + layout + paint is often cheaper to implement and “fast enough.”
Your main costs right now are non-algorithmic (file write, huge clones), not the O(n) operations themselves.
Why keep JSON for layout?
It’s simple and debuggable.
You can always mention in the README “layout protocol is JSON now, could be a binary protocol later” as a future optimization.
Why not outsource all painting to Rust?
Keeping rendering in TS demonstrates array buffer manipulation, FFI, and keeps the Rust side smaller.
If perf ever becomes an issue, you can move painting to Rust as an advanced step.

---

Risks and guardrails

Unsafe FFI boundaries
Ensure that:
TS never keeps a BigUint64Array after free_buffer() without reacquiring pointer/len.
get_buffer_len() and actual allocated length always match the terminal size logic.
Guard: re-request the buffer after any resize, which you already do.
Panics in Rust (unwraps)
unwrap() in size(), serde_json::from_slice, and execute! can crash the process.
For a demo library, at least document the assumptions; for extra points, replace with graceful error codes.
Global mutable state
Mutex statics (CURRENT_BUFFER, LAST_BUFFER, FRAMES, TERMINAL_SIZE) are fine in a single-process TUI.
Just be clear in docs that this is a single-instance library; not meant for multiple independent UIs in one process.

---

When to consider the advanced path

Consider a more complex design (incremental layout, binary protocols, packed cells, Rust-side painting) if:

You start building UIs with:
Hundreds–thousands of nodes.
Frequent updates (e.g. 60–120 Hz animations).
Profiling shows:
serde_json or layout consistently >3–4 ms per frame.
flush or TS painting taking >3–4 ms per frame even after the simple fixes.
You want to pitch this as a serious library rather than a “nice, educational TUI engine.”

---

Optional advanced path (short outline)

If you decide to push further:

Binary layout protocol
Define a compact node record (e.g. fixed-size struct) and pass a pointer + len.
Rust parses it without JSON.
Persistent taffy tree
Build the taffy tree once.
On each frame, only update styles/contexts for nodes that changed and call compute_layout again.
Sub-tree rendering
Track which nodes changed props.
Only repaint/clear those regions in the buffer.
Combined with Rust-side diffing, this gets you very efficient updates.
Packed cell representation
One u64 per cell, bit-packed.
Smaller buffer, simpler diff, and possibly even faster terminal I/O.

---

If you implement just the high-impact fixes (remove Bun.write, fix buffer cloning, avoid per-cell BigUint64Array allocations, reduce redundant flush calls), you’ll have a clean, fast, and architecturally solid TUI library that is well within your <8 ms target for realistic usage and looks very good in a portfolio.
The Oracle provided a comprehensive analysis. Here's the summary:

Key Findings

Strengths: Clean Rust/TS separation, simple effective signals, sensible FFI boundary design.

Critical Issues to Fix First (will get you <8ms):

Remove Bun.write("tree.json", ...) in layout() — this debug line alone can blow your 8ms budget
Stop cloning 16 MiB every frame — LAST_BUFFER.clone() copies the entire MAX_BUFFER_SIZE, not just w×h×3
Avoid BigUint64Array allocation per cell — in drawBackground, allocate outside the loop
Remove redundant api.flush() calls — event handlers call flush, then the ff effect flushes again

Architecture Improvements

Area
Suggestion
Buffer sizing
Allocate buffers based on terminal size, not fixed 2M
Code organization
Split components.ts into runtime/, components/, paint.ts
API design
Use options object for run(), return a handle with destroy()
Props
Unify ColumnProps/RowProps into ContainerProps

Nice-to-Have Features (Portfolio Polish)

Graceful shutdown / SIGINT handling
Basic theming system
Text alignment options
Scrollable list component
2-3 smaller example apps

The Oracle recommends tackling the 4 high-impact fixes first — they're all S/M effort and will immediately put you well under your 8ms target. The architectural cleanups can follow incrementally.

