# troubleshooting

## Native library load fails

Symptom:

- error around `dlopen` / missing `letui_ffi`

Checks:

1. run `bun run build-ffi`
2. confirm release artifact exists under `letui-ffi/target/release`
3. rerun demo: `bun run examples/<file>.ts`

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
2. current public layout API is small: `gap`, `padding`, `flexGrow`, `border`, `background`, `foreground`
3. use valid border styles only: `"square"` or `"rounded"`

## Demo is slow

Checks:

1. keep updates signal-driven; avoid rebuilding whole subtrees each tick
2. keep node identity stable so runtime can reuse Rust tree state
3. enable debug metrics: `run(root, { debug: true })`
4. inspect `dump/metrics.txt` for phase bottlenecks

Interpretation:

- high `serialize`: too much JS-side tree churn or effect work
- high `textSync`: large text rewrites; prefer targeted `setText` on stable nodes
- high `rust`: layout/paint cost in native side
- high `flush`: terminal I/O bound; reduce changed surface area
