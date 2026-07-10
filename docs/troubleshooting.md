# troubleshooting

## App exits but terminal looks broken

Symptom:

- cursor/raw mode feels wrong after crash

Checks:

1. use one guarded `quit()` path
2. avoid duplicate `app.quit()` calls
3. prefer `Ctrl+Q` fallback during debugging

## Key handler not firing

Symptom:

- `onKey` callback never runs

Checks:

1. key string must match raw terminal data exactly
2. focused node may be consuming event first
3. test with plain keys first (`q`, `r`, `+`, `-`)

## Input does not type

Symptom:

- `Input` visible but no text updates

Checks:

1. focus the input first (mouse click or `input.focus()`)
2. ensure `onChange`/`onSubmit` handlers do not throw
3. verify text updates via `input.props.text()` or UI text node

## Styles/colors look wrong

Symptom:

- colors not applied, layout odd

Checks:

1. use numeric colors (`0xRRGGBB`), not `"#RRGGBB"`
2. check prop names against exported `StyleProps` / `BoxProps` in `src/types.ts`
3. use valid border styles only: `"square"` or `"rounded"`

## Demo is slow

Checks:

1. keep updates signal-driven; avoid rebuilding whole subtrees each tick
2. keep node identity stable so runtime can reuse Taffy tree state and caches
3. enable debug metrics: `run(root, { debug: true })`
4. to persist metrics, pass `run(root, { debug: true, metricsPath: "dump/metrics.txt" })`
5. inspect the quit summary or metrics file for phase bottlenecks

Interpretation:

- high `js`: too much application-side reactive work
- high `render`: layout, text wrapping, or paint cost
- high `flush`: terminal I/O bound; reduce changed surface area
