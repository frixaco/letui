# OSS Submission Plan

- Goal: make repo credible for `Codex for Open Source` review
- Scope: repo hygiene, API/docs consistency, CI/checks, runtime polish, README
- Constraint: keep architecture intact unless mismatch forces API change
- Strategy: fix reviewer-trust issues first, polish second

## Order

- Phase 1: legal + verification baseline
- Phase 2: API/docs reconciliation
- Phase 3: runtime polish
- Phase 4: README rewrite
- Phase 5: AI readiness
- Phase 6: final submission pass

## Phase 1: legal + verification baseline

- Add root `LICENSE`
- Use `MIT`
- Verify package metadata and repo copy do not contradict chosen license

- Add package scripts:
- `typecheck`: `bun x tsc --noEmit`
- `check:rust`: `cargo check --manifest-path letui-ffi/Cargo.toml`
- `test` or `smoke`: simple automated verification entrypoint
- `check`: run TS + Rust checks

- Add basic CI workflow on push + pull_request
- Steps:
- checkout
- install Bun
- install Rust toolchain
- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run check:rust`
- `bun run test` or `bun run smoke`

- Add simple testing / benchmark signal to CI
- Keep scope small:
- one deterministic smoke test for core runtime/data path
- one lightweight benchmark or metrics capture job for regression visibility
- benchmark job should not gate merges if too noisy; archive output instead
- prefer stable signal over ambitious performance claims

- Done when:
- `LICENSE` present at repo root
- local `bun run check` passes
- local smoke test passes
- CI workflow exists and is minimal, readable, green

## Phase 2: API/docs reconciliation

- Decision locked: Path A
- Reason:
- current docs describe a larger API than exported types/runtime guarantee
- expanding API would create extra implementation/risk outside submission scope
- submission goal favors correctness and trust over surface-area growth

- Inputs to inspect first:
- [src/types.ts](/Users/frixa/Documents/letui/src/types.ts)
- [src/components.ts](/Users/frixa/Documents/letui/src/components.ts)
- [docs/getting-started.md](/Users/frixa/Documents/letui/docs/getting-started.md)
- [docs/components-and-styling.md](/Users/frixa/Documents/letui/docs/components-and-styling.md)
- [docs/troubleshooting.md](/Users/frixa/Documents/letui/docs/troubleshooting.md)
- `examples/**`

- Decide one path before code:
- Path A: shrink docs/examples to match current real API
- Path B: expand API/types/runtime to match documented props

- Decision rule:
- already decided: Path A
- do not add new public props in this phase
- reject hybrid drift

- Verification before change:
- list every documented prop not present in `BoxProps` / `StyleProps`
- list every example prop currently excluded from typecheck
- confirm whether runtime/Rust actually consumes each prop

- Path A execution:
- remove unsupported props from docs/examples
- make starter example compile against exported types
- make docs describe current constraints, not future design
- replace unsupported layout/styling examples with combinations that exist today
- if an example depends on unsupported props heavily, simplify it instead of papering over mismatch
- update troubleshooting guidance to recommend real props only

- If Path B:
- extend TS types first
- extend serializer/runtime shape next
- extend Rust parse/layout/paint only for props with actual implementation
- avoid adding type-level support without runtime support

- Guardrails:
- examples must be part of typecheck, or dedicated `examples` typecheck script added
- docs snippets must be copied from compiling examples where possible
- no “coming soon” props in reference docs without clear labeling

- Done when:
- docs, examples, and exported types agree
- at least one starter example compiles exactly as documented
- no unsupported style fields advertised as working

## Phase 3: runtime polish

- Remove noisy FFI loader logging in normal path
- Keep useful diagnostics only for explicit debug mode or failure path
- Replace unconditional `console.log` in loader with silent success + actionable error on failure

- Fix terminal teardown contract
- Review init path:
- alternate screen entered
- mouse capture enabled
- cursor hidden
- raw mode enabled

- Ensure deinit restores all of:
- raw mode disabled
- alternate screen left
- cursor shown
- mouse capture disabled
- colors reset if needed

- Failure modes to think through:
- init succeeds partially, later step fails
- runtime exits through quit path
- runtime throws before quit path
- resize/reinit path leaves stale terminal state

- Done when:
- normal startup prints nothing extra
- terminal state restores cleanly after quit
- repeated run/quit cycles do not leave hidden cursor or mouse mode behind

## Phase 4: README rewrite

- Rewrite top section of [README.md](/Users/frixa/Documents/letui/README.md)
- Goal: show off technical and product features in roughly `50/50` ratio
- Target first-screen structure:
- one-sentence project description
- current status
- install / prerequisites
- quickstart
- short architecture section
- product-facing capability section
- technical architecture section
- proof points: demos, performance notes, release packaging

- Remove or demote weak signals:
- giant TODO block near top
- “may not be accurate, just playing around” benchmark framing
- internal publish notes near top

- Keep, but reposition:
- screenshots / demo link
- benchmark notes with methodology caveats
- roadmap / known gaps
- TODO section lower in README, after quickstart + architecture + current status

- README questions reviewer should answer in under 60s:
- what is this
- why Bun + Rust
- does it build
- how do I run it
- is it maintained
- what works today vs not yet

- Technical features to emphasize:
- signals-based reactive runtime
- cell-based terminal diffing / incremental paint
- Rust core for layout, paint, and terminal buffer work
- TS wrapper with Bun FFI bridge
- batched text sync instead of full text payloads each frame
- performance instrumentation / frame metrics

- Product features to emphasize:
- build interactive TUIs with a small component API
- cross-language developer experience: TS app layer, Rust speed path
- keyboard + mouse interaction support
- responsive full-screen layouts
- demos that show real app-like surfaces, not only toy widgets
- packaged native binaries for multiple platforms
- fast feedback loop with `bun run dev`

- README shape for the 50/50 split:
- section 1: what you can build with it
- section 2: how it works under the hood
- section 3: quickstart
- section 4: current status
- section 5: TODO / roadmap

- Done when:
- top of README reads like maintained OSS, not scratchpad
- install + first-run path visible without scrolling far
- current status and limitations stated plainly
- technical depth and user-facing value both visible in first screen

## Phase 5: AI readiness

- Goal: make repo easier for agents to operate, validate, and demo safely
- Local skill baseline:
- project-local copy of `kitty-tui-control` under `.agents/skills/kitty-tui-control`
- add two project-specific skills under `.agents/skills/`
- target skills:
- `letui-smoke-runner`
- `letui-api-doc-drift`

- `kitty-tui-control` boundary:
- own Kitty remote-control primitives only
- launch / focus / send keys / capture output / close target
- do not duplicate repo-specific assertions there

- `letui-smoke-runner` boundary:
- own repo-specific TUI scenarios and pass/fail assertions
- call into `kitty-tui-control` patterns for transport and screen capture
- keep black-box by default; avoid hard-wiring app internals unless needed for exact assertions

- `letui-smoke-runner` first scenario:
- run `bun run dev`
- confirm outer border rendered
- confirm input box rendered
- type `shangri-la`
- confirm input box shows `shangri-la`
- send `Enter`
- confirm results are fetched
- confirm result items do not overlap borders
- confirm no obvious text overflow past right border
- confirm screen still respects outer frame after results render
- quit cleanly
- confirm terminal restored

- Smoke-runner assertion model:
- v1 uses Kitty screen capture and heuristic black-box assertions
- treat overlap / overflow as visible-screen checks first
- if heuristics prove too weak, add optional debug dump later for exact frame assertions

- `letui-api-doc-drift` boundary:
- treat code as source of truth
- compare exported TS API against `README.md`, `docs/**`, and `examples/**`
- flag unsupported props, undocumented exports, and examples excluded from verification
- prefer shrinking docs/examples to current API rather than expanding API

- `letui-api-doc-drift` outputs:
- compact drift report with file references
- list of unsupported documented props
- list of example usages outside current typecheck surface
- “safe to merge” vs “still drifting” verdict

- Skill selection rule:
- both selected already
- prefer skills that combine repo-specific steps, commands, and validation heuristics
- avoid generic skills that do not materially improve agent execution here

- Done when:
- `.agents/skills/` contains `kitty-tui-control`, `letui-smoke-runner`, and `letui-api-doc-drift`
- each new skill has a clear trigger, narrow scope, and concrete validation path
- agent workflows for demo run or repo verification are faster / less error-prone

## Phase 6: final submission pass

- Run final local checks:
- `bun run typecheck`
- `bun run check:rust`
- smoke test: `bun run dev`

- Review repo root for optics:
- `LICENSE`
- `README.md`
- no stray `.DS_Store`
- no misleading TODO-heavy front page

- Review submission narrative inputs:
- maintainer role
- why repo qualifies
- how API credits would be used
- honest note: niche project, but active maintainer, serious engineering, cross-language runtime, performance-focused experimentation

- Optional polish if time remains:
- add release or changelog entry
- add issue templates / contributing guide
- add one regression test around current text-diff pipeline

## Exit criteria

- legal status clear
- docs/examples/API consistent
- basic CI exists
- runtime startup/teardown clean
- README reviewer-friendly
- local AI workflow improved with at least 2 useful skills
- repo feels intentional, not half-documented
