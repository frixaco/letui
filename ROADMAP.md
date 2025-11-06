# API Improvements for Dynamic UI Components

## Current Limitation

The current component API works great for **fixed-structure UIs** where all components are known at initialization. However, it lacks support for **dynamic component manipulation** — adding/removing children after initial render based on runtime state.

## What Works Today

✅ **Reactive signal updates** - Text, Button labels update when signals change  
✅ **Async state management** - `af()` handles async data fetching with loading states  
✅ **Derived state** - `ff()` creates effects that re-run when dependencies change  
✅ **Pagination via fixed slots** - Pre-allocate components and update their signals

## What's Missing

### 1. **Reactive Children Array** (Priority: HIGH)

**Problem:**  
Mutating `node.children` doesn't trigger re-render. The render effect in `run()` only responds to signal reads, not structural changes.

**Current behavior:**

```typescript
const row = Row({...}, [Text({text: $("initial")})]);
// Later: row.children.push(Text({text: $("new")}));
// ❌ Nothing happens - UI doesn't update
```

**Solution A: Root as Signal** (Effort: M, 1–3h)

```typescript
// Modify run() signature
function run(root: Signal<Node>) {
  // Inside the render effect
  ff(() => {
    const currentRoot = root(); // Subscribe to root changes
    hitMap = [];
    layout(currentRoot, terminalWidth(), terminalHeight());
    paint(currentRoot);
    api.flush();
  });
}

// Usage
const rootNode = $(Column({...}, [...]));
run(rootNode);

// Later: trigger re-render by updating root
rootNode(Column({...}, [...newChildren]));
```

**Solution B: Global Re-render Signal** (Effort: S, <1h)

```typescript
let rerenderTrigger = $(0);

function run(node: Node) {
  ff(() => {
    rerenderTrigger(); // Subscribe to rerender signal
    hitMap = [];
    layout(node, terminalWidth(), terminalHeight());
    paint(node);
    api.flush();
  });
}

// Export helper
export function requestRender() {
  rerenderTrigger(rerenderTrigger() + 1);
}

// Usage: after mutating children
node.children.push(newChild);
requestRender();
```

**Recommendation:** Start with Solution B (simpler, less invasive).

---

### 2. **Effect Re-tracking Bug in `ff()`** (Priority: HIGH)

**Problem:**  
`ff()` only sets `caller` on first run. If the effect re-runs and reads _new_ signals (e.g., signals created after async data arrives), those new dependencies aren't tracked.

**Current implementation:**

```typescript
export function ff(fn: Sub): void {
  let prev = caller;
  try {
    caller = fn;
    fn();
  } finally {
    caller = prev;
  }
}
```

**Issue:** `caller` is only set once. On subsequent scheduled re-runs, `caller` is null.

**Fix:** (Effort: S, <30min)

```typescript
export function ff(fn: Sub): void {
  function effect() {
    const prev = caller;
    try {
      caller = effect; // ✅ Re-track on every run
      fn();
    } finally {
      caller = prev;
    }
  }
  effect();
}
```

**Why this matters:**  
When you dynamically add components with new signals (e.g., after fetching data), the effect needs to subscribe to those signals. Without re-tracking, the UI won't update when those signals change.

**Test case:**

```typescript
const items = $([] as Array<Signal<string>>);

ff(() => {
  for (const item of items()) {
    console.log(item()); // ❌ Won't re-run when item() changes with current ff()
  }
});

// Later: items([$(​"hello"), $(​"world")]);
// items()[0]("updated"); // Should log "updated" but doesn't
```

---

### 3. **ReadonlySignal Compatibility** (Priority: MEDIUM)

**Problem:**  
`dd()` (derived signal) returns `ReadonlySignal<T>`, but component props require `Signal<T>`.

**Current types:**

```typescript
type TextProps = {
  text: Signal<string>; // ❌ Can't pass ReadonlySignal
  // ...
};
```

**Example that fails today:**

```typescript
const count = $(0);
const label = dd(() => `Count: ${count()}`); // ReadonlySignal<string>

Text({ text: label }); // ❌ Type error
```

**Fix:** (Effort: S, <30min)

```typescript
type TextProps = {
  text: Signal<string> | ReadonlySignal<string>;
  fg?: number;
  bg?: number;
  border?: BorderProps;
};

type ButtonProps = {
  text: Signal<string> | ReadonlySignal<string>;
  // ... rest unchanged
};

// Same for InputBox if needed
```

**Note:** Implementation already only _reads_ `text()`, so this is purely a type-level fix.

---

### 4. **Multi-Input Focus Management** (Priority: LOW)

**Problem:**  
`handleKeyboardEvent()` in `run()` writes to a hardcoded `text4` signal. With multiple InputBox components, there's no focus tracking.

**Current code:**

```typescript
let canType = "k"; // Global flag, not per-component

function handleKeyboardEvent(d: string) {
  if (canType === "") return;

  // ❌ Hardcoded to text4
  if (d === "\x7f") {
    text4(text4().slice(0, -1));
  } else {
    text4(text4() + d);
  }
}
```

**Fix:** (Effort: M, 1–2h)

```typescript
let focusedInputId = $<string | null>(null);
const inputRegistry = new Map<string, Signal<string>>();

// In InputBox hit handling:
hitMap.push({
  id: node.id,
  ...node.frame,
  onHit: () => {
    focusedInputId(node.id);
    inputRegistry.set(node.id, (node.props as InputBoxProps).text);
    (node.props as InputBoxProps).onFocus();
  },
});

// Update handleKeyboardEvent:
function handleKeyboardEvent(d: string) {
  const focusedId = focusedInputId();
  if (!focusedId) return;

  const inputSignal = inputRegistry.get(focusedId);
  if (!inputSignal) return;

  if (d === "\x7f") {
    inputSignal(inputSignal().slice(0, -1));
  } else {
    inputSignal(inputSignal() + d);
  }
}
```

---

### 5. **Declarative List Rendering** (Priority: MEDIUM)

**Problem:**  
No helper for rendering dynamic lists. Users must manually manage children arrays.

**Desired API:**

```typescript
const items = $(["apple", "banana", "cherry"]);

ForEach(items, (item, index) =>
  Row({...}, [
    Text({ text: dd(() => `${index()}: ${item()}`) })
  ])
);
```

**Implementation:** (Effort: L, 4–6h)

- Maintain internal keyed map of items → Node instances
- Subscribe to `items()` signal
- On change: diff old vs new, reuse/create/destroy nodes
- Return a special Node type that expands to children during layout

**Alternative (simpler):**  
Just document the pattern of using `requestRender()` after mutating children, rather than building a full ForEach helper.

---

## Implementation Priority

### Phase 1: Core Reactivity (Do First) ⚡

1. **Fix `ff()` re-tracking** (~30min)
2. **Add global `requestRender()`** (~1h)
3. **Allow ReadonlySignal in props** (~30min)

**Total: ~2 hours** | Unblocks most dynamic UI patterns

### Phase 2: Quality of Life (Do Later) 🎨

4. **Multi-input focus management** (~2h)
5. **ForEach helper** (~6h) OR document manual pattern (~30min)

---

## Migration Path

### Today: Fixed Structure

```typescript
// Pre-allocate all components
const slot1 = $("");
const slot2 = $("");

run(Column({}, [Row({}, [Text({ text: slot1 }), Text({ text: slot2 })])]));

// Update via signals
slot1("new value");
```

### After Phase 1: Dynamic Structure

```typescript
const items = $([] as string[]);

const rootNode = Column({}, []);
run(rootNode);

// Later: add dynamic children
items(["hello", "world"]);
rootNode.children = items().map((item) => Text({ text: $(item) }));
requestRender();
```

### After Phase 2: Declarative Lists

```typescript
const items = $([] as string[]);

run(Column({}, [ForEach(items, (item) => Text({ text: item }))]));

// Just update the signal
items(["hello", "world"]);
```

---

## Testing Checklist

After implementing Phase 1, verify:

- [ ] Mutating `node.children` + `requestRender()` triggers re-layout/paint
- [ ] `ff()` re-subscribes to new signals on each run
- [ ] Derived signals work in Text/Button props
- [ ] Multiple async effects don't race (existing `af()` behavior preserved)
- [ ] Terminal resize still works correctly
- [ ] Hit maps rebuild properly after structural changes

---

## Notes

**Why not Vue/React-style VDOM?**  
Your current architecture paints directly to a terminal buffer, which is perfect for TUI performance. Adding a full VDOM would be overkill. The minimal changes above preserve your performance goals while enabling dynamic UIs.

**Backward compatibility:**  
All proposed changes are additive or fix bugs. Existing code continues to work.
