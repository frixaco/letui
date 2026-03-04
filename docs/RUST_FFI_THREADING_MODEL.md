# Rust FFI Threading Model

Status: guidance note
Scope: `letui-ffi` call safety around tree ownership

## Option A: Single-thread runtime + `thread_local!` tree

Use when:
- all FFI calls guaranteed from one JS thread
- simplest migration path from current code

Core idea:
- keep `TREE` in `thread_local!`
- record owner thread in `init_letui()`
- reject any FFI call from non-owner thread

Snippet:

```rust
use std::sync::LazyLock;
use std::sync::Mutex;
use std::thread::ThreadId;

static OWNER_THREAD: LazyLock<Mutex<Option<ThreadId>>> =
    LazyLock::new(|| Mutex::new(None));

fn is_owner_thread() -> bool {
    let owner = OWNER_THREAD.lock().unwrap();
    owner
        .as_ref()
        .map(|id| *id == std::thread::current().id())
        .unwrap_or(false)
}

#[unsafe(no_mangle)]
pub extern "C" fn init_letui() -> c_int {
    *OWNER_THREAD.lock().unwrap() = Some(std::thread::current().id());
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn paint(/* ... */) -> c_int {
    if !is_owner_thread() {
        set_last_error(ErrorCode::WrongThread);
        return 0;
    }
    TREE.with_borrow_mut(|taffy| {
        // normal work
    });
    1
}
```

Reasoning:
- `thread_local!` isolates non-`Send`/non-`Sync` state per thread
- explicit guard turns implicit assumption into runtime contract
- avoids silent split-brain state (`TREE` per thread, buffers global)

Tradeoffs:
- hard failure if app later introduces worker-thread FFI calls
- still no shared tree authority across threads

## Option B: Global Rust authority + one lock

Use when:
- want one canonical tree regardless of calling thread
- future-safe for workers / multi-thread FFI entry

Core idea:
- move tree + related state into one `RendererState`
- protect with one `Mutex<RendererState>`
- all state mutations/layout/paint under same lock boundary

Snippet:

```rust
use std::sync::{LazyLock, Mutex};

struct RendererState {
    tree: TaffyTree<NodeContext>,
    root: Option<NodeId>,
    // keep related state together:
    // text registry, dirty flags, last error, etc.
}

static RENDERER: LazyLock<Mutex<RendererState>> = LazyLock::new(|| {
    Mutex::new(RendererState {
        tree: TaffyTree::new(),
        root: None,
    })
});

#[unsafe(no_mangle)]
pub extern "C" fn render_frame() -> c_int {
    let mut state = RENDERER.lock().unwrap();
    // mutate canonical tree, compute layout, paint
    1
}
```

Reasoning:
- one source of truth for all threads
- no per-thread tree divergence
- maps directly to “Rust canonical authority” spec direction

Tradeoffs:
- requires `RendererState` members to satisfy thread-safety constraints
- lock contention possible if API becomes high-frequency from many threads

## Quick decision rule

- pick Option A if runtime is intentionally single-thread forever; enforce contract immediately
- pick Option B if long-term architecture says Rust owns canonical UI state globally
