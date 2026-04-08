# getting started

## Assumptions

- You are inside this repo
- Bun installed
- Rust toolchain installed (`cargo` available)
- You are building a demo app under `examples/`

## 1. Build native backend once

```bash
bun run build-ffi
```

What this does: compiles `core/` with `cargo build --release`.

## 2. Create first demo file

Create a demo file under `examples/`:

```ts
import { COLORS, Column, Text, $, ff, onKey, run } from "../index.ts";

const count = $(0);
const countText = Text({
  text: "count: 0",
  foreground: COLORS.default.green,
});

ff(() => {
  countText.setText(`count: ${count()}`);
});

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: COLORS.default.bg,
    border: { color: COLORS.default.bg_highlight, style: "rounded" },
  },
  [
    Text({ text: "letui demo", foreground: COLORS.default.fg }),
    countText,
    Text({
      text: "+/- update, r reset, q quit",
      foreground: COLORS.default.grey,
    }),
    Text({
      text: "starter uses gap/padding/flexGrow; wider layout API lives in StyleProps + BoxProps",
      foreground: COLORS.default.grey,
    }),
  ],
);

const app = run(root);

onKey("+", () => count(count() + 1));
onKey("-", () => count(count() - 1));
onKey("r", () => count(0));
onKey("q", () => app.quit());
```

## 3. Run it

```bash
bun run examples/<your-file>.ts
```

## 4. Interact + quit

- `+` increment
- `-` decrement
- `r` reset
- `q` quit (custom handler)
- `Ctrl+Q` quit (default runtime handler)

## 5. Recommended next moves

1. Replace static text with `Input` + `Button`
2. Split UI into small builder functions (`buildHeader`, `buildBody`, `buildFooter`)
3. Turn on metrics with `run(root, { debug: true })`

## Notes

- In `examples/`, relative import from `../index.ts` is simplest starter path
- Existing examples also use `@/...` alias for modules inside `src/`
- Current public props come from `StyleProps`, `BoxProps`, `TextProps`, `InputProps`, and `ButtonProps` in `src/types.ts`
- Keep node references stable across updates when you can; same-shape trees let runtime send deltas instead of rebuilding Rust tree state
- `run(root, { debug: true })` writes phase timings to `dump/metrics.txt`: `js`, `render`, `sync`, `flush`, plus worst-frame breakdown
