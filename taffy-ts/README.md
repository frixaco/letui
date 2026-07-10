# Taffy TypeScript

TypeScript layout engine used directly by LetUI. It provides flexbox, grid, block layout, intrinsic measurement, caching, rounding, and calculation support in-process.

## Commands

```bash
bun run typecheck
bun run test
bun run build
bun run bench
bun run check
```

The generated layout archive in `test/fixtures/generated-layouts.json` contains 1,027 framework-owned parity fixtures. Tests deserialize those fixtures into real layout objects and execute them without external source trees or source-language parsers.

The package and generated archive are licensed under MIT. See `LICENSE.md`.
