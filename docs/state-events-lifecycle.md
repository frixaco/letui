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
run(root: Node, options?: {
  debug?: boolean;
  metricsPath?: string | false;
  appearance?: "auto" | "light" | "dark";
}): { quit: () => void }
```

- `run(root)` starts stdin handling, resize handling, render loop
- `run(root, { debug: true })` enables in-memory metrics collection and prints the summary on quit
- `run(root, { debug: true, metricsPath: "dump/metrics.txt" })` also writes the summary to a file
- `run(root, { appearance: "auto" })` queries the terminal background and refreshes it again when the terminal regains focus
- `run(root, { appearance: "light" | "dark" })` forces an appearance without terminal detection
- returned `quit()` tears everything down and exits process

## Appearance detection

```ts
appearance(): "light" | "dark" | "unknown"
refreshAppearance(): Promise<"light" | "dark" | "unknown">
```

- `appearance()` is reactive: call it inside `ff(...)` to restyle nodes when the terminal theme is detected
- auto detection uses terminal background query (`OSC 11`) and terminal focus-in reporting, so it refreshes when you return to the terminal instead of polling continuously
- unsupported terminals stay on `"unknown"`; most apps should treat that as "use your default theme"

## Render pipeline

1. JS builds a sent-tree snapshot from the current nodes
2. If previous and current tree shapes match, JS emits style deltas plus text ops (`SetText`, `DeleteTextRange`)
3. If shape differs, JS clears Rust tree state and re-inserts the full tree
4. Rust applies ops, resolves newline boundaries plus wrap/overflow, runs layout + paint, then updates the terminal buffer
5. JS reads frame rectangles back into each node for measurement, while interaction uses the Rust-owned hitmap from the final painted frame
6. Rust flushes only changed terminal cells

Debug phase names in the quit summary and optional metrics file match that pipeline:

- `js`: JS-side snapshot, diff, op drain, and FFI op submit
- `render`: Rust layout + paint
- `sync`: frame rectangles copied back into JS nodes
- `flush`: terminal I/O
- `worst`: single slowest recorded frame with exact bucket breakdown

## Global keyboard handlers

```ts
onKey(key: string, callback: () => void): void
```

- exact string match on raw terminal key data
- `onKey("q", ...)` handles `q`
- default hard quit already bound to `Ctrl+Q` (`"\\x11"`)

## Scroll handlers

```ts
const viewport = ScrollView(
  {
    scrollY: 0,
    onScroll: (event) => {
      // event.deltaY is -1 for wheel up, +1 for wheel down
    },
  },
  children,
);
```

- wheel/touchpad scroll packets are decoded from terminal mouse input
- `ScrollView({ onScroll })` is the primary API
- handlers fire for any visible cell inside that scroll view's viewport, including empty background or text-only regions
- `event.target` is still the regular hit-tested node under the pointer, so it may be `undefined` over non-interactive content
- scroll input does not synthesize clicks or focus changes on its own

Global fallback still exists:

```ts
onScroll((event) => {
  // event.deltaY is -1 for wheel up, +1 for wheel down
}): void
```

## Focus and interaction model

- Focus tracked globally (single focused node)
- Mouse press on interactive node focuses it
- Clicking empty space blurs current focus
- Keyboard input routed to focused node first
- If focused node consumes key event, global `onKey` handler does not run
- For scrolled content, Rust is the final authority on which interactive cells are visible/clickable

## Input behavior

For focused `Input` node:

- printable input appends to the end of the current text, then calls `onChange(nextText)`
- backspace (`\x7f`) removes the previous codepoint from the end, then calls `onChange(nextText)`
- if `multiline` is `true`, enter/newline inserts `\n` and calls `onChange(nextText)`
- otherwise enter/newline triggers `onSubmit(currentText)`
- line separators are normalized to `\n` before input handling
- current `Input` is not a full editor yet: no caret movement, mid-buffer insertion, selection, or scroll viewport

## Button behavior

For focused `Button` node:

- Enter or Space triggers `onClick()`
- mouse left press focuses the button and triggers `onClick()`
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
- `ScrollView.setStyle({ scrollY })` stays on the style-diff path, so vertical scrolling does not require remounting children
