# Text Serialization Optimizations

This doc explains what's inefficient in the current TS→Rust text path and how to fix it.

---

## The Render Pipeline (How It Works Now)

Each frame:

1. **TS** serializes the node tree into `nodeData` (numbers) + `textData` (UTF-8 bytes)
2. **TS** calls Rust `paint(nodeDataPtr, nodeDataLen, textDataPtr, textDataLen)`
3. **Rust** parses the data, runs Taffy layout, paints to buffer
4. **TS** reads frames back and updates the terminal

---

## Problem 1: TypeScript Encodes Text Twice

### Current Code (runtime.ts:115-153)

```ts
// For each text node...
let textContent = "";
if (node.type === "text" || node.type === "input" || node.type === "button") {
  textContent = (node.props as any).text?.() ?? "";
}
const textLength = new TextEncoder().encode(textContent).length; // <-- ENCODE #1: just to get byte length!

if (textContent) {
  texts.push(textContent); // collect into array
}

// ... later, after traversing all nodes:
const textData = new TextEncoder().encode(texts.join("")); // <-- ENCODE #2: join strings, then encode again
```

### What's Wrong

1. **Per-node allocation**: `new TextEncoder().encode(textContent)` creates a new `Uint8Array` for every text node, just to read `.length`. That array is immediately thrown away.

2. **Double work**: All the text gets encoded once per-node (for length), then collected into an array, joined into one big string, and encoded again.

3. **Extra allocations**: `texts.push()` grows an array, `texts.join("")` creates a new string, then `encode()` creates the final `Uint8Array`.

### The Fix: Encode Once with `encodeInto`

Instead of encoding twice, use a single buffer and `encodeInto()` which writes directly and tells you how many bytes it wrote:

```ts
const textEncoder = new TextEncoder();
let textBuffer = new Uint8Array(4096);
let textWriteOffset = 0;

function writeText(s: string): number {
  // Ensure buffer has room (worst case: 4 bytes per char for emoji)
  const needed = s.length * 4;
  if (textWriteOffset + needed > textBuffer.length) {
    const newSize = Math.max(textBuffer.length * 2, textWriteOffset + needed);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(textBuffer.subarray(0, textWriteOffset));
    textBuffer = newBuffer;
  }

  const { written } = textEncoder.encodeInto(
    s,
    textBuffer.subarray(textWriteOffset),
  );
  textWriteOffset += written;
  return written; // this IS the byte length
}
```

Then in serialize():

```ts
// Reset at frame start
textWriteOffset = 0;

// For each node:
const textLength = textContent ? writeText(textContent) : 0;

// At the end:
const textData = textBuffer.subarray(0, textWriteOffset); // no copy, just a view
```

**Result**: One encode pass, no intermediate arrays, no join, no per-node allocations.

---

## Problem 2: Rust Allocates Strings That Get Cloned

### Current Code (lib.rs)

**Step 1 - parse_node() allocates a String (lines 346-354):**

```rust
let text = if text_len > 0 {
    let s = std::str::from_utf8(&text_data[*text_offset..*text_offset + text_len])
        .unwrap_or("")
        .to_string();  // <-- ALLOCATION: copies bytes into owned String
    *text_offset += text_len;
    s
} else {
    String::new()
};
```

**Step 2 - Node stores that String (lines 301-318):**

```rust
struct Node {
    // ...
    text: String,  // <-- owned String per node
    // ...
}
```

**Step 3 - node_type_to_context() clones it again (lines 439-457):**

```rust
NodeType::Text => NodeContext::Text {
    content: node.text.clone(),  // <-- CLONE: another allocation
    // ...
},
NodeType::Button => NodeContext::Button {
    label: node.text.clone(),    // <-- CLONE
    // ...
},
NodeType::Input => NodeContext::Input {
    content: node.text.clone(),  // <-- CLONE
    // ...
},
```

**Step 4 - NodeContext also stores owned Strings (lines 498-530):**

```rust
enum NodeContext {
    Text {
        content: String,  // <-- owned String
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,    // <-- owned String
        // ...
    },
    // ...
}
```

### What's Wrong

Every frame, for every text node:

1. `to_string()` allocates and copies UTF-8 bytes into a `String`
2. `clone()` allocates and copies that `String` again into `NodeContext`

That's 2 heap allocations per text node per frame. For a UI with 50 text elements at 60fps, that's 6000 allocations/second just for text.

### The Fix: Store Ranges, Decode On Demand

Instead of copying text into owned Strings, just remember where the text lives in `text_data`:

**Node stores a range:**

```rust
struct Node {
    // ...
    text_start: u32,  // offset into text_data
    text_len: u32,    // byte length
    // ...
}
```

**NodeContext stores a range:**

```rust
enum NodeContext {
    Text {
        text_start: u32,
        text_len: u32,
        fg: u32,
        bg: u32,
    },
    // ...
}
```

**Helper to decode when needed:**

```rust
fn get_text<'a>(text_data: &'a [u8], start: u32, len: u32) -> &'a str {
    if len == 0 { return ""; }
    std::str::from_utf8(&text_data[start as usize..(start + len) as usize]).unwrap_or("")
}
```

**parse_node() just tracks offsets:**

```rust
let text_start = *text_offset as u32;
let text_len = node_data[base + 11] as u32;
*text_offset += text_len as usize;
// No to_string()!
```

**node_type_to_context() passes ranges:**

```rust
NodeType::Text => NodeContext::Text {
    text_start: node.text_start,
    text_len: node.text_len,
    // No clone()!
    fg: node.fg,
    bg: node.bg,
},
```

**measure_function and paint decode on demand:**

```rust
// In measure_function, text_data is captured by the closure
let text = get_text(text_data, *text_start, *text_len);
let width = text.chars().count() as f32;
```

**Result**: Zero String allocations per frame. Text is decoded from the original `text_data` buffer only when actually needed for measuring or painting.

---

## Summary

| Where                     | Problem                                  | Fix                                   |
| ------------------------- | ---------------------------------------- | ------------------------------------- |
| TS serialize              | Encodes text twice; per-node allocations | Use `encodeInto` with reusable buffer |
| Rust parse_node           | `to_string()` allocates per node         | Store `(start, len)` range instead    |
| Rust node_type_to_context | `clone()` allocates again                | Pass range, no clone needed           |
| Rust measure/paint        | N/A (already uses `&str`)                | Decode on demand via `get_text()`     |

**Expected wins:**

- Lower GC pressure in TS
- Zero allocator calls in Rust hot path
- Same wire format, same API, just faster
