---
name: letui-smoke-runner
description: Run and validate letui terminal apps. Use for repo smoke checks, CI-like PTY validation, or Kitty-driven end-to-end TUI checks such as typing into inputs, submitting queries, checking borders, and confirming terminal teardown.
---

# letui Smoke Runner

Use this skill when the task is to launch, validate, or demo a letui app.

## Scope

- repo-local smoke validation
- PTY-backed automated checks
- Kitty-driven interactive checks for real TUIs
- border / overflow / teardown sanity checks

## Pick the cheapest path first

1. Fast baseline:
   - run `bun run smoke`
   - run `bun run metrics:smoke` if metrics matter
2. Real interactive validation:
   - use `kitty-tui-control`
   - launch the target example in a new Kitty tab/window
   - inspect visible output and drive the app with keys/text

## Repo ground truth

- deterministic smoke example: `examples/smoke.ts`
- PTY smoke scripts:
  - `scripts/smoke.ts`
  - `scripts/capture-metrics.ts`
  - `scripts/run-smoke-example.ts`
- main interactive app: `examples/index.ts`
- quit paths:
  - custom `q` handlers in many demos
  - default runtime quit is `Ctrl+Q`

## Kitty boundary

- `kitty-tui-control` owns launch, focus, send keys/text, capture, close
- this skill owns the scenario, expected states, and pass/fail judgment
- do not re-document Kitty remote-control syntax here; open the kitty skill when needed

## Main interactive scenario

For the torrent-search demo in `examples/index.ts`, validate this sequence:

1. launch `bun run dev`
2. confirm outer border is visible
3. confirm search input box is visible
4. type `shangri-la`
5. confirm the input shows `shangri-la`
6. send `Enter`
7. wait for result area to change
8. confirm results rendered
9. confirm result items do not visibly overlap any border
10. confirm no obvious text overflow past the right border
11. quit cleanly
12. confirm terminal state restored after exit

## Assertion model

- prefer visible-screen assertions first
- treat overlap as a screen-level bug: text on border cells, broken frame glyphs, or content past the right edge
- if visible assertions are ambiguous, say so instead of claiming certainty
- if exact overlap proof is needed later, propose a debug dump rather than guessing

## Failure buckets

- app failed to boot
- native library failed to load
- input box not focusable / text not entering
- submit path did not change results
- results rendered but broke borders
- visible overflow / clipping regression
- quit path left cursor, mouse mode, or terminal state broken

## Reporting

- say which path you used: repo smoke vs Kitty interactive
- give exact command used
- list checks passed
- on failure, name the first broken step and likely owning file
