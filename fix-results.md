# Fixing Scrollable Lists in letui

## The Problem

Your `examples.ts` sets `maxItems = 1`, but even with more items, the layout system (Taffy) calculates a small height for the `resultsList` Column and content overflows/gets clipped.

**Root cause**: There's no concept of a **viewport window** - you're trying to render ALL items, but layout constrains them.

---

## How They Calculate "How Many Items Fit"

### pi-mono: Caller Responsibility

Pi-mono does **NOT** auto-calculate. It's the caller's job:

```typescript
// Terminal dimensions available via:
const terminal = new ProcessTerminal();
terminal.rows;    // e.g., 24
terminal.columns; // e.g., 80

// Caller calculates maxVisible:
const headerLines = 3;      // title, input, padding
const footerLines = 2;      // hints, status
const itemHeight = 1;       // each item is 1 line
const maxVisible = Math.floor((terminal.rows - headerLines - footerLines) / itemHeight);

// Pass to component at construction
const selectList = new SelectList(items, maxVisible, theme);
```

Components receive `maxVisible` as a fixed parameter - they don't query terminal size themselves.

### opencode: Dynamic Height Memo

OpenCode uses reactive computation:

```typescript
const dimensions = useTerminalDimensions();  // { width, height }

const height = createMemo(() =>
  Math.min(
    flat().length + grouped().length * 2 - 1,    // Ideal: all items fit
    Math.floor(dimensions().height / 2) - 6       // Cap: 50% of terminal minus overhead
  )
);

<scrollbox maxHeight={height()}>
  {/* items */}
</scrollbox>
```

**The formula breakdown:**
- `flat().length` = number of items
- `grouped().length * 2` = category headers (2 rows each)
- `dimensions().height / 2` = max 50% of terminal
- `- 6` = UI overhead (title, input, footer, padding)

---

## How pi-mono and opencode Solve This

Both projects use the same fundamental pattern: **virtual windowing** (render only visible items).

### Pattern 1: Calculated Visible Window (pi-mono)

```typescript
// State
private items: Item[] = [];           // Full list
private selectedIndex: number = 0;    // Current selection
private maxVisible: number = 10;      // Viewport size

render(width: number): string[] {
  // Calculate which items to render based on selection
  const startIndex = Math.max(0, 
    Math.min(
      this.selectedIndex - Math.floor(this.maxVisible / 2),  // Keep selected centered
      this.items.length - this.maxVisible                     // Don't scroll past end
    )
  );
  const endIndex = Math.min(startIndex + this.maxVisible, this.items.length);

  // Only render items in viewport
  for (let i = startIndex; i < endIndex; i++) {
    // render item[i]
  }
}
```

**Key insight**: Selection drives scroll position. No separate scroll state needed.

### Pattern 2: Scrollbox with Scroll-Into-View (opencode)

```typescript
// ScrollBox component tracks:
interface ScrollBox {
  scrollTop: number;      // Current offset
  scrollHeight: number;   // Total content height
  height: number;         // Visible viewport
  scrollBy(delta: number): void;
}

function moveTo(index: number) {
  setSelected(index);
  
  // Scroll into view if needed
  if (index < scrollTop) {
    scroll.scrollBy(index - scrollTop);
  } else if (index >= scrollTop + viewportHeight) {
    scroll.scrollBy(index - scrollTop - viewportHeight + 1);
  }
}
```

---

## The Fix for Your TUI

You have two options:

### Option A: Virtual Windowing (Simpler, Recommended)

Don't change Taffy or layout - just render a slice of items.

```typescript
// State
const results = $<ScrapeResultItem[]>([]);
const selectedIndex = $(0);               // NEW: track selection index
const viewportSize = $(10);               // NEW: how many items visible

// Computed visible window
ff(() => {
  const allResults = results();
  const selected = selectedIndex();
  const maxVisible = viewportSize();

  // Calculate window centered on selection
  let startIndex = Math.max(0,
    Math.min(
      selected - Math.floor(maxVisible / 2),
      allResults.length - maxVisible
    )
  );
  startIndex = Math.max(0, startIndex);
  const endIndex = Math.min(startIndex + maxVisible, allResults.length);

  // Get visible slice
  const visibleResults = allResults.slice(startIndex, endIndex);

  // Create buttons for ONLY visible items
  resultButtons = visibleResults.map((item, localIndex) => {
    const globalIndex = startIndex + localIndex;
    return Button({
      text: item.title,
      border: globalIndex === selected ? focusedBorderStyle : borderStyle,
      padding: "1 0",
      onClick: () => streamResult(item.magnet),
    });
  });

  resultsList.setChildren?.(resultButtons);
});

// Navigation moves selection, not pages
function focusNext() {
  const max = results().length - 1;
  if (selectedIndex() < max) {
    selectedIndex(selectedIndex() + 1);
  }
}

function focusPrev() {
  if (selectedIndex() > 0) {
    selectedIndex(selectedIndex() - 1);
  }
}
```

**Why this works**:
- Taffy only sees 10 items max (fits in terminal)
- Selection change triggers re-render with new window
- Focus tracking becomes index-based, not node-based

### Option B: True Scroll Container (More Complex)

Add a `ScrollBox` component that:
1. Renders all children
2. Tracks `scrollTop` offset
3. Only paints children within `[scrollTop, scrollTop + height]`
4. Clips content outside viewport

This requires changes to:
- `types.ts`: Add ScrollBox node type
- `components.ts`: Create ScrollBox constructor
- `runtime.ts`: Paint logic with Y offset
- `lib.rs`: Layout with scroll offset consideration

---

## Detailed Implementation: Option A

### Step 1: Change State Model

```typescript
// examples.ts - Replace page-based with index-based

const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);      // Selection in full list
const viewportSize = 10;         // Fixed visible count

// Remove: page, maxItems
```

### Step 2: Update Render Effect

```typescript
ff(() => {
  const allResults = results();
  const selected = selectedIndex();
  
  if (allResults.length === 0) {
    resultsList.setChildren?.([]);
    return;
  }

  // Calculate viewport window
  const halfView = Math.floor(viewportSize / 2);
  let start = selected - halfView;
  
  // Clamp to bounds
  if (start < 0) start = 0;
  if (start + viewportSize > allResults.length) {
    start = Math.max(0, allResults.length - viewportSize);
  }
  
  const end = Math.min(start + viewportSize, allResults.length);
  const visible = allResults.slice(start, end);

  resultButtons = visible.map((item, i) => {
    const globalIdx = start + i;
    const isSelected = globalIdx === selected;
    
    return Button({
      text: `${isSelected ? '→ ' : '  '}${item.title}`,
      border: isSelected ? focusedBorderStyle : borderStyle,
      padding: "0 1",
      onClick: () => streamResult(item.magnet),
    });
  });

  resultsList.setChildren?.(resultButtons);
});
```

### Step 3: Update Navigation

```typescript
onKey("j", () => {
  const max = results().length - 1;
  if (selectedIndex() < max) {
    selectedIndex(selectedIndex() + 1);
  }
});

onKey("k", () => {
  if (selectedIndex() > 0) {
    selectedIndex(selectedIndex() - 1);
  }
});

// Remove h/l page navigation or repurpose:
onKey("h", () => selectedIndex(0));                    // Jump to start
onKey("l", () => selectedIndex(results().length - 1)); // Jump to end
```

### Step 4: Add Scroll Indicator (Optional)

```typescript
// Add to resultsList or as separate Text node
const scrollIndicator = Text({
  text: "",
  foreground: COLORS.default.grey,
});

ff(() => {
  const total = results().length;
  const current = selectedIndex() + 1;
  scrollIndicator.setText?.(`${current}/${total}`);
});
```

---

## Why Your Current Approach Fails

Looking at your code:

1. **`maxItems = 1`** - You hardcoded 1 item visible
2. **`page` state** - You paginate but navigation doesn't update focus
3. **`resultButtons` focus tracking** - Buttons are recreated each render, losing focus state
4. **Layout constraint** - Taffy's `Overflow::Hidden` clips content

The key issue: **focus is node-based, but nodes are recreated on each render**.

Pi-mono and opencode both use **index-based selection** that survives re-renders.

---

## Comparison Table

| Aspect | Your Current Code | Fix |
|--------|------------------|-----|
| Selection | `Button.isFocused()` | `selectedIndex` signal |
| Visible items | All or `page * maxItems` slice | Centered window around selection |
| Navigation | Find focused button, move | Increment/decrement index |
| Render | Recreate all buttons | Recreate visible slice only |
| Focus survival | Lost on re-render | Index persists |

---

## Quick Test

Replace your `ff(() => {...})` effect with this minimal version:

```typescript
ff(() => {
  const all = results();
  const sel = selectedIndex();
  const visible = 5;
  
  const start = Math.max(0, Math.min(sel - 2, all.length - visible));
  const end = Math.min(start + visible, all.length);
  
  resultButtons = all.slice(start, end).map((item, i) => {
    const isActive = (start + i) === sel;
    return Button({
      text: `${isActive ? '▶' : ' '} ${item.title}`,
      border: isActive ? focusedBorderStyle : borderStyle,
      padding: "0 1",
      onClick: () => streamResult(item.magnet),
    });
  });
  
  resultsList.setChildren?.(resultButtons);
});

onKey("j", () => selectedIndex(Math.min(selectedIndex() + 1, results().length - 1)));
onKey("k", () => selectedIndex(Math.max(selectedIndex() - 1, 0)));
```

This should immediately give you working j/k navigation through all results.

---

---

## For Your TUI: Calculating Available Space

You already have terminal dimensions via `terminalWidth` and `terminalHeight` signals in runtime.ts. Here's how to use them:

```typescript
// examples.ts

// Import terminal dimensions (you'd need to expose these from runtime)
// Or calculate from known layout

// Calculate available space for results list
const viewportSize = ff(() => {
  const totalHeight = terminalHeight();
  
  // Subtract fixed UI elements:
  // - Root border: 2 (top + bottom)
  // - Search container: ~4 (border + padding + input + progress bar)
  // - Results list padding: 2
  // - Each item height: 3 (border + padding + text)
  const overhead = 2 + 4 + 2;
  const itemHeight = 3;
  
  return Math.max(1, Math.floor((totalHeight - overhead) / itemHeight));
});
```

**The key insight**: Neither library asks Taffy/layout "how many items fit". They:
1. Know terminal size
2. Know their UI structure (fixed overhead)
3. Calculate available space manually
4. Render only that many items

---

## Summary: Two Approaches

| Approach | How "items fit" is calculated | Who calculates |
|----------|------------------------------|----------------|
| **pi-mono** | `terminalRows - overhead` at construction | Application code |
| **opencode** | `min(itemCount, terminalHeight/2 - overhead)` reactively | Component memo |
| **Your TUI** | Should use reactive signal based on `terminalHeight()` | Effect or memo |

The layout engine (Taffy) is **never asked** how many items fit. It's always calculated externally based on known dimensions.

---

## References

- **pi-mono SelectList**: https://github.com/badlogic/pi-mono/blob/main/packages/tui/src/components/select-list.ts
- **opencode DialogSelect**: https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx
- **opencode Autocomplete scroll-into-view**: https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx#L509-L528
