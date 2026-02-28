# LeTUI Hardening Plan (Conceptual)

See: './pi-session-2026-02-22T19-42-55-808Z_7fb7f1be-d71a-4607-93b4-4cb93a8d7d19.html'

## Assumptions
- Keep current architecture for now (TS runtime + Rust renderer + FFI).
- Goal: remove fragile behavior in wrapping, overflow, flush, text/style sync.
- This doc is design-only. No code-level instructions.

---

## Main idea
Use **one clear model per concern**:
- text measurement model
- text overflow model
- container overflow model
- frame present/flush model
- TS↔Rust data ownership model

If one concern uses multiple hidden rules, bugs appear.

---

## Phase 1 — Text model first

### Problem today
- Width logic uses char count in multiple places.
- Draw, measure, wrap, cursor can disagree.

### Target concept
Define one shared text rule:
- Unit = terminal cells, not JS string length / Rust char count.
- Measure by grapheme cluster + cell width policy.
- Same rule used by:
  - layout measurement
  - line wrapping
  - text drawing
  - cursor position

### Invariants
- If measure says text fits width `W`, draw must also fit width `W`.
- Cursor column must match visual rendered column.
- No split inside grapheme cluster.

### Edge cases to support
- emoji
- ZWJ sequences
- combining marks
- CJK wide chars
- tab behavior (explicit policy)
- `\r`, `\n`, `\r\n`

---

## Phase 2 — Separate text overflow from container overflow

### Problem today
- Overflow behavior is partly container clipping + implicit text wrapping.
- Hard to reason about expected behavior.

### Target concept
Two separate APIs/behaviors:

1. **Text overflow** (for text node)
- `clip`
- `ellipsis`
- `middle`
- (optional) `wrap`

2. **Container overflow** (for row/column/box)
- `visible`
- `hidden`
- `scroll`

### Invariants
- Text overflow decides how text itself is shortened/wrapped.
- Container overflow decides child clipping and scroll viewport.
- These never silently override each other.

---

## Phase 3 — Add explicit scroll model

### Problem today
- Hidden clipping exists, but no full scroll model.

### Target concept
For scroll containers, store metadata:
- `scrollX`, `scrollY`
- `contentWidth`, `contentHeight`
- `viewportWidth`, `viewportHeight`

### Rules
- Clamp scroll offsets to valid range.
- Child layout shifted by `-scrollX`, `-scrollY`.
- Clip children to viewport.
- (Optional) reserve scrollbar cells with deterministic rules.

### Invariants
- Scroll values are always valid.
- Same input state always gives same viewport and hit-testing.

---

## Phase 4 — Present/flush contract

### Problem today
- Flush logic works, but contract is implicit.
- Capability assumptions (sync update support) are not explicit.

### Target concept
Write and enforce a present contract:
- Build full output bytes for frame first.
- Commit frame state only after successful write.
- Exactly one write per present on success.
- Zero writes on failure.
- Use sync-update only when terminal supports it.

### Invariants
- No partial terminal state from failed frame.
- No visual corruption from mid-frame failure.

---

## Phase 5 — TS↔Rust ownership model (choose one clearly)

You currently use ID registries for text/styles. Keep it or switch, but make contract explicit.

### Option A: Keep registry model
- TS owns truth.
- Rust mirrors via upsert/delete ops.
- Frame render reads mirrored state.

Required guarantees:
- op ordering deterministic
- delete semantics strict
- partial sync failure recovery path
- resize/reset behavior well-defined

### Option B: Self-contained frame payload
- Each frame carries all needed text/style payload (with in-frame dedupe).
- No long-lived mirrored registries in Rust.

Tradeoff:
- simpler correctness, bigger payload

### Decision rule
Pick the model that makes failures easiest to recover deterministically.

---

## Phase 6 — Test strategy (must exist before refactor)

Create tests by behavior class:

1. **Text measurement parity tests**
- measure vs draw vs cursor agree

2. **Unicode safety tests**
- no grapheme splitting
- width always <= max width after truncation

3. **Overflow tests**
- text overflow modes
- container visible/hidden/scroll behavior
- nested clip intersections

4. **Scroll tests**
- clamp behavior
- viewport math
- hit-testing in scrolled containers

5. **Present contract tests**
- failed write causes no commit
- success path single write

6. **Regression snapshots**
- complex UI scenes with known output

---

## Phase 7 — Recommended implementation order

1. Lock text model (Phase 1)  
2. Split overflow semantics (Phase 2)  
3. Introduce scroll metadata + behavior (Phase 3)  
4. Formalize present contract (Phase 4)  
5. Finalize TS↔Rust ownership contract (Phase 5)  
6. Expand tests continuously (Phase 6)

Reason: text correctness is foundation for wrapping, overflow, cursor, and diff quality.

---

## “Done” checklist
- One text width model used everywhere.
- Text overflow and container overflow are separate concepts.
- Scroll behavior deterministic and clamped.
- Present contract documented + tested.
- TS↔Rust data contract explicit, with recovery behavior.
- Unicode + overflow regressions covered by tests.
