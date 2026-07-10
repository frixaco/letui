# Taffy TypeScript Port Status

Upstream reference: `vendor/taffy-upstream` at Taffy `v0.9.1` (`fa5930c`), matching the Rust dependency in `core/Cargo.toml`.

## Feedback Loop

Run from `taffy-ts/`:

```sh
bun run check
```

This runs the TypeScript checker, the parity suite, emits the package build, and then runs `bench/layout.ts`. The benchmark suite fails if any scenario average exceeds its budget. Defaults are `0.2ms` for `flex-stress`, `0.05ms` for `flex-hot-cache`, `0.1ms` for `flex-leaf-dirty`, `0.25ms` for `flex-calc-stress`, `0.3ms` for `grid-stress`, `0.2ms` for `grid-leaf-dirty`, `0.2ms` for `block-stress`, and `0.1ms` for `block-leaf-dirty`; `TAFFY_TS_BENCH_MAX_AVG_MS` or `TAFFY_TS_BENCH_<SCENARIO>_MAX_AVG_MS` can override them locally.

Current local baseline:

- Tests: `1412 pass`
- Typecheck: `tsgo -p tsconfig.json` passes with strict mode enabled
- Benchmark suite on this machine:
  - `flex-stress`: about `0.029374ms` average per layout, `0.2ms` budget
  - `flex-hot-cache`: about `0.009982ms` average per layout, `0.05ms` budget
  - `flex-leaf-dirty`: about `0.049273ms` average per layout, `0.1ms` budget
  - `flex-calc-stress`: about `0.037910ms` average per layout, `0.25ms` budget
  - `grid-stress`: about `0.097024ms` average per layout, `0.3ms` budget
  - `grid-leaf-dirty`: about `0.086078ms` average per layout, `0.2ms` budget
  - `block-stress`: about `0.034039ms` average per layout, `0.2ms` budget
  - `block-leaf-dirty`: about `0.032731ms` average per layout, `0.1ms` budget

## Ported Surface

- Geometry primitives
- Style enums, dimensions, helpers, parsers, and trait-shaped accessors
- Tree storage, mutation, cache, traversal, layout APIs, and print/debug helpers
- Leaf, block, flexbox, grid, float, common alignment/content-size compute paths
- Opaque `calc()` style handles and tree-delegated resolution across dimensions, margins, padding, insets, gaps, flex basis, and grid tracks
- Package subpath exports for all ported source modules, including built `dist/src` import targets and Bun source targets
- Clean source-to-`dist/` package build via `tsconfig.build.json`
- Strict TypeScript typecheck wired into `bun run check`
- The current source, tests, and benchmarks are strict-clean under `tsgo -p tsconfig.json`
- `src/geometry.ts`, `src/compute/common.ts`, `src/compute/leaf.ts`, `src/compute/block.ts`, `src/compute/flexbox.ts`, `src/compute/float.ts`, `src/compute/grid.ts`, `src/tree/cache.ts`, `src/tree/layout.ts`, `src/tree/taffy-tree.ts`, `src/util/sys.ts`, `src/util/print.ts`, `src/util/debug.ts`, `src/util/parse.ts`, `src/style/helpers.ts`, `src/style/dimensions.ts`, `src/style/style.ts`, `src/util/math.ts`, and `src/style/available-space.ts` are strict-clean with explicit shared compute/tree contracts
- `src/style/style.ts` now has real TypeScript enum definitions for the core style vocabulary, typed grid track sizing wrappers/collections, and typed grid-placement helpers/parsers while preserving the existing string-valued API
- `src/compute/flexbox.ts` now has explicit flex item/line helper contracts and is strict-clean while keeping the shared tree/measure callback boundary intentionally external
- `src/compute/grid.ts` now has explicit local contracts for grid tracks, track sets, item placement, named-line resolution, contribution sizing, and absolute layout helpers, and is strict-clean while keeping the shared tree/measure callback boundary intentionally external
- Dirty root and dirty leaf benchmark scenarios for flex, grid, and block, plus hot-cache and calc-heavy flex, wired into the performance guard with per-scenario budgets
- Package smoke checks cover built subpath imports and `bun pm pack --dry-run` contents
- The packed artifact includes the upstream Taffy MIT license notice
- Seed coverage from upstream generated fixtures in `test/generated-fixtures.test.ts`:
  - `leaf/leaf_with_content_and_padding_border.rs`
  - `flex/gap_column_gap_determines_parent_width.rs`
  - `block/block_margin_y_sibling_collapse_positive_and_negative.rs`
  - `grid/grid_align_content_space_evenly.rs`
- Direct Rust-source fixture importer coverage in `test/generated-leaf-import.test.ts`:
  - all 14 generated leaf fixture files under `vendor/taffy-upstream/tests/generated/leaf`
- Direct Rust-source fixture importer coverage in `test/generated-block-import.test.ts`:
  - all 195 generated block fixture files under `vendor/taffy-upstream/tests/generated/block`
- Direct Rust-source fixture importer coverage in `test/generated-flex-import.test.ts`:
  - all 536 generated flex fixture files under `vendor/taffy-upstream/tests/generated/flex`
- Direct Rust-source fixture importer coverage in `test/generated-grid-import.test.ts`:
  - all 255 generated grid fixture files under `vendor/taffy-upstream/tests/generated/grid`
- Direct Rust-source fixture importer coverage in `test/generated-mixed-import.test.ts`:
  - all 14 generated blockgrid fixture files under `vendor/taffy-upstream/tests/generated/blockgrid`
  - all 7 generated blockflex fixture files under `vendor/taffy-upstream/tests/generated/blockflex`
  - all 6 generated gridflex fixture files under `vendor/taffy-upstream/tests/generated/gridflex`
- Shared Rust-source fixture parser/runner in `test/generated-fixture-runner.ts`, used by generated fixture importers.
  - The parser is intentionally strict for top-level style fields so fixture coverage does not pass by silently ignoring Rust input.
  - It handles the Rust fixture string escapes, context call formatting, explicit compute available space, and style vocabulary currently needed by the imported leaf, block, flex, and grid suites.

## Implementation Notes

- The TypeScript source was reconstructed from the existing generated JS artifact and now passes the default strict checker.
- Upstream grid internals are split into many Rust modules; the TS port currently keeps most grid compute code in `src/compute/grid.ts`.
- `vendor/taffy-upstream/tests/generated` contains 1,027 generated Rust fixture files excluding module declarations. The direct Rust-source importer covers all 1,027 of them: leaf, block, flex, grid, blockgrid, blockflex, and gridflex fixtures.
- `dist/` is a generated compatibility artifact. Edit `src/` first, then run `bun run build`; the build script cleans stale output before emitting.
