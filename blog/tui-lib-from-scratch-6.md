---
title: "Building a TUI Library from scratch: Part 6"
description: "Stabilizing Rust paint, fixing lifecycle issues, and shipping through v0.0.10/v0.0.11 pain"
date: "2026-02-14T10:00:00"
---

## Building a TUI Library from Scratch: Part 6 - Stabilization and Release Pain

#### Things I learned:

- Fast code can still feel bad if lifecycle state is wrong
- Benchmark setup matters as much as optimizations
- Releases expose bugs local dev can hide

Part 5 ended with paint/layout in Rust. Performance looked great.

Then I hit the less fun part: stability and release workflow.

#### Responsiveness regression

I had a bug where responsiveness degraded after resize/reinit.
Root cause: I freed buffers but forgot to reset first-diff state.

```rust
pub extern "C" fn free_buffer() -> c_int {
    *CURRENT_BUFFER.lock().unwrap() = None;
    *LAST_BUFFER.lock().unwrap() = None;
    *FIRST_DIFF.lock().unwrap() = true;
    // ...
}
```

One boolean, noticeable UX impact.

#### Locking cleanup in paint

I also removed unnecessary buffer locks in Rust paint.
Before, helper draw functions locked buffer internally.
After, `paint()` takes one lock and passes `&mut [u64]` down.

```rust
// before: each draw_* locked CURRENT_BUFFER internally
fn draw_text_at(x: f32, y: f32, text: &str, ...)

// after: paint() takes one lock, helpers just write
fn draw_text_at(buf: &mut [u64], x: f32, y: f32, text: &str, ...)
```

Less lock churn in hot path.

#### Benchmark measurement fixes

I also fixed benchmark wrappers for OpenTUI and pi-mono.
I was measuring at the wrong point for their render scheduling.
Switched to measuring after scheduled completion (`setTimeout(0)` in adapters).

After this pass, sample metrics were around `0.5ms` avg and ~`1900fps` in that scene.

#### Research before next optimization

Once paint was stable, text path became the obvious target.
I wrote `TEXT_SERIALIZATION_OPTIMIZATIONS.md` to map waste before coding changes.

Main findings:

- TS encoded text twice in current serialize flow
- Rust allocated/cloned strings per text node each frame
- Work scaled with total text, not changed text

I also added a small stress script for raw terminal writes as calibration.

#### Repo refactor + release cycle

I did a big structure cleanup before release:

- moved runtime code under `src/`
- reorganized examples under `examples/`
- cleaned up exports in `index.ts`
- moved older implementation into `legacy/`

Then I shipped `v0.0.10` and immediately hit publish/package issues.
Fixed package files/deps, then hit another issue: logger could crash in some environments.

I changed logger init to safe fallback:

```typescript
function createLogWriter() {
  try {
    return Bun.file("dump/logs.txt").writer();
  } catch {
    return { write() {}, flush() {} };
  }
}
```

That became `v0.0.11`.

#### End of part 6

Part 5 was mostly raw speed.
Part 6 was making that speed usable and shippable.

- cleaner locking model in Rust paint
- corrected benchmark methodology
- cleaned project structure
- painful but useful release fixes
- concrete plan for text diff sync

Part 7 is where text/style sync architecture changed for real.
