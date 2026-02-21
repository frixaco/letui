# state events lifecycle

## First principles

- UI is a node tree
- Signals hold mutable state
- `ff(...)` reacts to signal reads/writes
- Runtime re-serializes + paints + flushes after reactive changes

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
