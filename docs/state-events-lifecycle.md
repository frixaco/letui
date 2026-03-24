# state events lifecycle

## First principles

- UI is a node tree
- Signals hold mutable state
- `ff(...)` reacts to signal reads/writes
- JS snapshots current node state each reactive frame
- same-shape trees keep Rust tree state alive and send deltas only
- shape changes clear and rebuild Rust tree state once
- Rust still owns layout, paint, terminal buffers, and incremental flush

## State primitives

```ts
import { $, ff } from "../index.ts";

const value = $(0);

ff(() => {
  // reads value(); reruns when value changes
  console.log(value());
});

value(value() + 1);
```

Available exports include: `$`, `dd`, `ff`, `af`, `wait`, `whenSettled`.

## Runtime entrypoint

```ts
run(root: Node, options?: { debug?: boolean }): { quit: () => void }
```

- `run(root)` starts stdin handling, resize handling, render loop
- `run(root, { debug: true })` enables metrics output (`dump/metrics.txt`)
- returned `quit()` tears everything down and exits process

## Render pipeline

1. JS builds a sent-tree snapshot from the current nodes
2. If previous and current tree shapes match, JS emits style deltas plus text ops (`SetText`, `DeleteTextRange`)
3. If shape differs, JS clears Rust tree state and re-inserts the full tree
4. Rust applies ops, runs layout + paint, then updates the terminal buffer
5. JS reads frame rectangles back into each node and rebuilds hit-testing lookup
6. Rust flushes only changed terminal cells

Debug phase names in `dump/metrics.txt` match that pipeline:

- `serialize`: JS tree snapshot + op generation
- `textSync`: text op generation and byte counts
- `rust`: Rust layout + paint
- `sync`: frame rectangles copied back into JS nodes
- `flush`: terminal I/O

## Global keyboard handlers

```ts
onKey(key: string, callback: () => void): void
```

- exact string match on raw terminal key data
- `onKey("q", ...)` handles `q`
- default hard quit already bound to `Ctrl+Q` (`"\\x11"`)

## Focus and interaction model

- Focus tracked globally (single focused node)
- Mouse press on interactive node focuses it
- Clicking empty space blurs current focus
- Keyboard input routed to focused node first
- If focused node consumes key event, global `onKey` handler does not run

## Wheel Routing Model

- wheel events use SGR mouse input and dispatch to `onWheel` on `Row`/`Column` containers
- dispatch starts at deepest container under cursor with a wheel handler
- if handler returns `true`, bubbling stops; otherwise event bubbles to parent containers
- current payload: `{ x, y, deltaY, raw }` with vertical `deltaY` only

## Input behavior

For focused `Input` node:

- printable ASCII appends to text, then calls `onChange(nextText)`
- backspace (`\x7f`) removes one char, then calls `onChange(nextText)`
- enter/newline triggers `onSubmit(currentText)`

## Button behavior

For focused `Button` node:

- Enter or Space triggers `onClick()`
- mouse press + release on same button triggers `onClick()`
- non-activation keys call optional `onKeyDown(rawKey)`

## Cleanup template

Use one quit path; clear timers/listeners before calling `app.quit()`.

```ts
const app = run(root);
let done = false;

function quit() {
  if (done) return;
  done = true;
  clearInterval(timer);
  process.stdout.off("resize", onResize);
  app.quit();
}

onKey("q", quit);
```

## Practical performance rule

- Keep long-lived nodes and mutate them with `setText`, `setStyle`, or signals
- Rebuilding whole subtrees every tick changes tree shape and forces Rust tree rebuilds

## Virtualization Rule

- for large scrolling lists, keep a fixed slot pool (`setChildren` only on viewport-size changes)
- bind slot content by updating text/style on stable nodes instead of creating/removing nodes per scroll tick
- row-based slicing is done in JS by mapping scroll rows to visible line ranges
- if virtualized rows are normal-flow children, overscan can feed back into layout (more slots -> taller viewport -> more slots)
- virtual list now auto-disables overscan when this runaway growth pattern is detected and logs a warning
- if you need overscan for smoothness, place virtualized slots in a clipped/fixed-height viewport container
