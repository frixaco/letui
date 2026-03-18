---
name: letui-api-doc-drift
description: Check and fix drift between letui code, docs, and examples. Use when props or examples may not match the real exported API, and prefer shrinking docs/examples to current code unless the user explicitly asks to expand the API.
---

# letui API / Doc Drift

Use this skill when docs, examples, or README content may describe props the code does not actually export or support.

## Source of truth

Read these first:

- `src/types.ts`
- `src/components.ts`
- `index.ts`

For this repo, code wins. Do not add docs for future props. Do not assume runtime support from naming alone.

## Default policy

- shrink docs/examples to current API
- do not expand public props unless the user explicitly asks for that path
- if an example depends heavily on unsupported props, simplify the example instead of faking support

## Files to scan

- `README.md`
- `docs/getting-started.md`
- `docs/components-and-styling.md`
- `docs/troubleshooting.md`
- `docs/README.md`
- `examples/**/*.ts`
- `tsconfig.check.json`

## Fast drift scan

Use `rg` with unsupported or suspicious prop names:

- `rowGap`
- `columnGap`
- `justifyContent`
- `alignItems`
- `overflow`
- `width`
- `height`
- `minWidth`
- `maxWidth`
- `minHeight`
- `maxHeight`
- `flexShrink`
- `flexBasis`
- `margin`
- `alignSelf`

Then run:

- `bun run typecheck`

## What to report

- docs that advertise unsupported props
- examples that compile only because they were outside typecheck
- exported props missing from docs
- type ergonomics problems that make supported APIs harder to use than they should be

## Fix style

- keep examples runnable
- keep docs concrete and current
- reference only props that exist in `StyleProps`, `BoxProps`, `TextProps`, `InputProps`, or `ButtonProps`
- if there is ambiguity, point to the exact exported type instead of paraphrasing loosely

## Done criteria

- docs, examples, and exported types agree
- `bun run typecheck` passes
- no unsupported public props are presented as working
