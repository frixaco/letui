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

What this does: compiles `letui-ffi` with `cargo build --release`.

## 2. Create first demo file

Create `examples/hello-world.ts`:

```ts
import { Box, Column, Text, COLORS, run, onKey, $, ff } from "../index.ts";

const count = $(0);
const countText = Text({ text: "count: 0", foreground: COLORS.default.green });

ff(() => {
  countText.setText(`count: ${count()}`);
});

const panel = Column(
  {
    padding: "1 3",
    rowGap: 1,
    alignItems: "center",
    background: COLORS.default.bg_alt,
    border: { color: COLORS.default.bg_highlight, style: "rounded" },
  },
  [
    Text({ text: "letui demo", foreground: COLORS.default.fg }),
    countText,
    Text({ text: "+/- update, r reset, q quit", foreground: COLORS.default.grey }),
  ],
);

const root = Box(
  {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    background: COLORS.default.bg,
  },
  [panel],
);

const app = run(root);

onKey("+", () => count(count() + 1));
onKey("-", () => count(count() - 1));
onKey("r", () => count(0));
onKey("q", () => app.quit());
```

## 3. Run it

```bash
bun run examples/hello-world.ts
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

- `bun run dev` runs `examples/index.ts` after building FFI
- In `examples/`, relative import from `../index.ts` is simplest starter path
- Existing examples also use `@/...` alias for modules inside `src/`
