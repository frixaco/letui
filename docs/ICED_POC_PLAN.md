- PoC Name: `letui-native-gui-poc`
- Goal: validate native GUI rendering path with `iced` for lower tail latency vs terminal flush path
- Goal: keep existing terminal backend intact during PoC
- Goal: measure where spikes move, not assume they disappear

- Assumptions
- Assumption: current `letui-ffi` render loop remains source of truth for layout + paint data
- Assumption: PoC can add new Rust crates without changing public TS API yet
- Assumption: success judged on steady-state percentiles after warmup, not single-run max
- Assumption: dependency check required before lock-in (`iced` recency, maintainers, release cadence, adoption)

- Inputs
- Input: existing Rust backend in `letui-ffi/src/lib.rs`
- Input: existing timing model in `src/metrics.ts`
- Input: current terminal baseline metrics in `dump/metrics.txt`

- Non-goals
- Non-goal: full feature parity with terminal renderer
- Non-goal: replacing Bun/TS runtime in this PoC
- Non-goal: VT compatibility in phase 1
- Non-goal: hard real-time guarantee

- Success criteria
- Success: steady-state (`frames 121+`) `render_p99 <= 1.0ms` on test scene A (mostly static)
- Success: steady-state (`frames 121+`) `render_p99 <= 1.5ms` on test scene B (moderate diff churn)
- Success: reported metrics split by stage: `engine`, `transport`, `raster`, `present_wait`
- Success: zero heap allocations in hot render loop after warmup (validated by instrumentation)
- Success: existing terminal mode still runnable and unaffected

- Failure criteria
- Fail: no statistically meaningful p99 improvement vs terminal baseline
- Fail: spike source moves to GUI path with same or worse tail
- Fail: architecture requires invasive rewrite before proving latency value

- High-level architecture
- Track A: terminal renderer (existing), unchanged
- Track B: native GUI renderer (`iced`), new
- Shared core target: renderer-agnostic frame data contract
- Frame contract v1: grid dimensions + cell payload (`char`, `fg`, `bg`) + optional dirty metadata
- Data flow v1: core produces frame -> GUI consumes frame -> GUI raster/present

- PoC implementation strategy
- Strategy: two-phase integration
- Strategy: phase 1 fastest validation path, tolerate duplication
- Strategy: phase 2 extraction for cleaner architecture only if phase 1 passes

- Phase 0: baseline + instrumentation hardening
- Task: add Rust-side per-frame timings around terminal `flush` internals
- Task: record `changed_cells`, `batches`, `bytes_written`, `first_diff`
- Task: export raw per-frame metrics to NDJSON/CSV for offline analysis
- Task: run baseline scenarios with fixed protocol
- Exit: baseline report with `p50/p95/p99/p99.9/max`, warmup excluded

- Phase 1: dependency and feasibility gate
- Task: validate `iced` viability
- Task: verify maintenance/adoption: latest release date, issue throughput, ecosystem usage
- Task: pin exact crate version, avoid floating semver
- Task: smoke-test minimal window + draw loop + resize handling
- Exit: documented go/no-go decision with evidence

- Phase 2: PoC crate scaffold
- Task: create crate `letui-gui-poc` (binary)
- Task: isolate feature flags so main package unaffected by default
- Task: add CLI flags
- Task: `--renderer terminal|iced`
- Task: `--scene static|churn|stress`
- Task: `--frames N`
- Task: `--headless-metrics` (no UI present path timing where possible)
- Exit: runnable binary switching renderer by flag

- Phase 3: frame contract extraction
- Task: define `FrameGrid` struct in shared Rust module
- Task: include metadata
- Task: `frame_id`
- Task: `width`, `height`
- Task: `cells: &[Cell]`
- Task: `dirty_rects` optional
- Task: add producer API in core to emit `FrameGrid` without terminal I/O
- Task: keep existing terminal flush path consuming same contract
- Exit: terminal path and GUI path consume identical frame contract

- Phase 4: iced renderer v1 (correctness first)
- Task: implement `iced` app with custom widget/canvas for cell grid
- Task: render full frame each tick first
- Task: verify color + glyph correctness against terminal snapshots
- Task: support resize, DPI scaling, font config
- Exit: visual parity for core primitives on representative scenes

- Phase 5: iced renderer v2 (latency tuning)
- Task: switch to dirty-rect rendering path
- Task: cache glyph raster/layout, precompute atlas where possible
- Task: reuse vertex/index buffers, no per-frame vec growth
- Task: move frame ingest to lock-free queue/ring buffer
- Task: minimize main-thread work before present
- Exit: steady-state p99 target hit on scene A, near-target on scene B

- Phase 6: optional VT compatibility path
- Task: integrate `libghostty-vt` as alternate input parser mode
- Task: `VT bytes -> grid ops -> shared FrameGrid -> iced renderer`
- Task: benchmark parser cost separately from raster/present
- Exit: compatibility demo with external TUI process + isolated parser metrics

- Bench protocol
- Scene A: static dashboard, tiny diffs
- Scene B: medium churn list updates + cursor movement
- Scene C: full-screen churn stress
- Warmup: first 120 frames excluded
- Sample size: minimum 5000 frames per scene
- Runs: 5 runs per scene per renderer
- Report: median of run-level p99 + worst-run p99
- Record environment per run
- Record: OS version
- Record: CPU model
- Record: refresh rate
- Record: power mode
- Record: terminal emulator (for baseline)

- Metrics schema (per frame)
- `frame_id`
- `ts_ns_start`
- `engine_ms`
- `transport_ms`
- `parse_ms` (VT mode only)
- `raster_ms`
- `present_wait_ms`
- `frame_total_ms`
- `changed_cells`
- `dirty_rect_count`
- `bytes_emitted`
- `alloc_count_delta` (if measurable)

- Guardrails for honest comparison
- Guardrail: same scenes, same update cadence, same machine state
- Guardrail: exclude startup and first-frame cold caches
- Guardrail: separate compute latency from display pacing
- Guardrail: publish raw metrics files, not only summary

- Risks
- Risk: `iced` text rendering path dominates tail latency
- Risk: vsync/compositor quantization masks renderer improvements
- Risk: lock contention between producer and UI thread
- Risk: allocation regressions reintroduced by scene updates
- Risk: false wins from biased measurement windows

- Mitigations
- Mitigation: include offscreen/headless timings where possible
- Mitigation: compare with vsync on/off configurations
- Mitigation: preallocate all frame buffers after first resize
- Mitigation: add CI perf sanity check with threshold alerts (non-blocking initially)

- Deliverables
- Deliverable: `letui-gui-poc` crate with renderer switch CLI
- Deliverable: shared frame contract module
- Deliverable: benchmark runner script and reproducible command list
- Deliverable: raw metrics artifacts + summary markdown report
- Deliverable: decision memo: continue iced / pivot / rollback

- Decision gates
- Gate 1 (post phase 1): `iced` viable -> continue or pivot framework
- Gate 2 (post phase 4): correctness acceptable -> begin tuning
- Gate 3 (post phase 5): p99 targets met -> proceed to integration roadmap
- Gate 4 (post phase 6 optional): VT mode worth maintaining -> keep or drop

- Proposed file/folder changes (PoC phase)
- `ICED_POC_PLAN.md` (this file)
- `letui-gui-poc/` (new crate)
- `letui-core/` (optional extraction if phase 3 requires)
- `scripts/bench-native.ts` or `scripts/bench-native.sh`
- `dump/bench/native/*.ndjson`
- `dump/bench/native/*.md`

- Execution order
- Step 1: phase 0
- Step 2: phase 1
- Step 3: phase 2
- Step 4: phase 3
- Step 5: phase 4
- Step 6: phase 5
- Step 7: phase 6 optional

- Immediate next task
- Next: implement phase 0 instrumentation first before adding GUI dependencies
