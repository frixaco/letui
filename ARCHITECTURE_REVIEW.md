# LeTUI Architecture Review

**Goal**: Achieve <8ms (120Hz) response time  
**Focus**: Performance optimization and code quality improvements

---

## 🎯 Executive Summary

The current architecture has solid fundamentals with a Rust backend for performance and TypeScript wrapper via Bun FFI. However, several critical performance bottlenecks prevent achieving the 120Hz target:

1. **Rust buffer cloning** - copying 16MB+ each frame
2. **Per-cell allocations** - creating BigUint64Array for every cell write
3. **Multiple flush calls** - redundant terminal I/O per component
4. **Debug logging** - file I/O on every input event
5. **Inefficient hit-testing** - Map-based lookups instead of typed arrays

**Recommended fixes can achieve the <8ms target with moderate effort.**

---

## 🔴 Critical Performance Issues

### 1. **Rust Buffer Cloning (HIGHEST IMPACT)**

**Problem**: `flush()` copies the entire `MAX_BUFFER_SIZE` (2M * 8 bytes = 16MB) every frame.

```rust
// Current (SLOW):
if let Some(ref buf) = *cb {
    *lb = Some(buf.clone()); // Clones entire 16MB array!
}
```

**Solution**: Use dynamically-sized `Vec<u64>` and copy only used portion.

```rust
// In init_buffer and update_terminal_size:
let (w, h) = size().unwrap();
let size = (w as usize) * (h as usize) * 3;

*CURRENT_BUFFER.lock().unwrap() = Some(vec![0u64; size]);
*LAST_BUFFER.lock().unwrap() = Some(vec![0u64; size]);

// In flush:
let used = (w as usize) * (h as usize) * 3;
// ... after diffing ...
lb_mut[..used].copy_from_slice(&cb[..used]); // Only copy used cells
```

**Impact**: Reduces memory operations from 16MB to ~500KB on typical terminal (200x50 * 3 * 8 bytes).

---

### 2. **JavaScript Per-Cell Allocations (HIGH IMPACT)**

**Problem**: Every cell write allocates new BigUint64Array objects.

```typescript
// Current (creates 3 allocations per cell):
buffer.set(
  new BigUint64Array([
    BigInt(" ".codePointAt(0)!),
    BigInt(this.active_fg),
    BigInt(this.active_bg),
  ]),
  (terminalWidth * cy + cx) * 3,
);
```

**Solution**: Write directly to buffer with pre-converted BigInts.

```typescript
// Cache constants:
const CP_SPACE = BigInt(32);
const fgB = BigInt(this.active_fg);
const bgB = BigInt(this.active_bg);

// Direct writes (zero allocations):
const off = (terminalWidth * cy + cx) * 3;
buffer[off] = CP_SPACE;
buffer[off + 1] = fgB;
buffer[off + 2] = bgB;
```

**Impact**: Eliminates thousands of allocations per frame. Reduces GC pressure significantly.

---

### 3. **Multiple Flush Calls (HIGH IMPACT)**

**Problem**: Components call `flush()` independently, causing redundant terminal I/O.

```typescript
// Found in: Button.press(), Input.render(), etc.
flush(); // Multiple syscalls per frame!
```

**Solution**: Flush exactly once per frame in `View.render()`.

```typescript
// For interactive feedback, use batched flush:
let needsFlush = false;

function requestFlush() {
  if (needsFlush) return;
  needsFlush = true;
  queueMicrotask(() => {
    needsFlush = false;
    flush();
  });
}

// Remove all flush() calls from components
// Only View.render() should call flush()
```

**Impact**: Reduces syscalls from N (per component) to 1 per frame.

---

### 4. **Debug Logging (MEDIUM-HIGH IMPACT)**

**Problem**: File I/O on every input event will regularly blow the 8ms budget.

```typescript
// Current (SLOW):
await appendFile(debugLogPath, `parsed: ${JSON.stringify(c)}\n`);
await appendFile(debugLogPath, `mouse left button at (${x}, ${y})\n`);
```

**Solution**: Wrap behind feature flag or remove entirely.

```typescript
const DEBUG = false;

if (DEBUG) {
  await appendFile(debugLogPath, `parsed: ${JSON.stringify(c)}\n`);
}
```

**Impact**: Eliminates 1-5ms+ per input event.

---

### 5. **Hit-Testing with Map (MEDIUM IMPACT)**

**Problem**: `Map<number, number>` lookups are slower than typed array access.

```typescript
// Current:
const hitMap = new Map<number, number>();
const component = componentMap.get(hitMap.get(y * terminalWidth + x)!);
```

**Solution**: Use typed array sized to terminal.

```typescript
let hitMap: Int32Array; // Allocated on init/resize

// On resize:
hitMap = new Int32Array(terminalWidth * terminalHeight);

// Update:
hitMap[cy * terminalWidth + cx] = this.id;

// Lookup:
const id = hitMap[y * terminalWidth + x] | 0;
if (id) {
  const component = componentMap.get(id);
}
```

**Impact**: Faster lookups, better cache locality.

---

## ⚡ Advanced Optimization: Batched Terminal Writes

### Problem: One syscall per changed cell

Current Rust code queues operations per cell, which creates overhead from repeated `MoveTo`, `SetForegroundColor`, `SetBackgroundColor` calls.

### Solution: Batch contiguous cells with same colors

```rust
for y in 0..h as usize {
    let mut x = 0;
    while x < w as usize {
        let idx = (y * w as usize + x) * 3;
        let new = &cb[idx..idx+3];
        let old = &lb_mut[idx..idx+3];
        
        if new != old {
            let fg = new[1];
            let bg = new[2];
            let start_x = x;
            let mut text = String::new();

            // Collect contiguous cells with same fg/bg
            while x < w as usize {
                let i = (y * w as usize + x) * 3;
                let n = &cb[i..i+3];
                let o = &lb_mut[i..i+3];
                
                if n == o || n[1] != fg || n[2] != bg {
                    break;
                }
                
                text.push(char::from_u32(n[0] as u32).unwrap_or(' '));
                x += 1;
            }

            // Single queue for entire run
            queue!(
                stdout,
                MoveTo(start_x as u16, y as u16),
                SetForegroundColor(Color::Rgb {
                    r: ((fg >> 16) & 0xFF) as u8,
                    g: ((fg >> 8) & 0xFF) as u8,
                    b: (fg & 0xFF) as u8
                }),
                SetBackgroundColor(Color::Rgb {
                    r: ((bg >> 16) & 0xFF) as u8,
                    g: ((bg >> 8) & 0xFF) as u8,
                    b: (bg & 0xFF) as u8
                }),
                Print(text)
            )?;
        } else {
            x += 1;
        }
    }
}
stdout.flush()?;
```

**Impact**: Reduces terminal control sequences by 10-100x depending on UI complexity.

---

## 🏗️ Architectural Improvements

### 1. **Separate Layout, Render, and I/O Phases**

**Current**: Components interleave computation and I/O.

**Recommended**:
```typescript
class View {
  render() {
    // Phase 1: Layout (compute sizes/positions)
    for (const child of this.children) {
      child.layout(x, y, { w: terminalWidth, h: terminalHeight });
    }
    
    // Phase 2: Render (write to buffer)
    for (const child of this.children) {
      child.renderToBuffer(buffer);
    }
    
    // Phase 3: I/O (single flush)
    flush();
  }
}
```

**Benefits**: Cleaner separation, easier to optimize, predictable performance.

---

### 2. **Cache Commonly Used BigInt Constants**

```typescript
// At module level:
const GLYPHS = {
  SPACE: BigInt(32),
  HLINE: BigInt("─".codePointAt(0)!),
  VLINE: BigInt("│".codePointAt(0)!),
  TL_SQUARE: BigInt("┌".codePointAt(0)!),
  TL_ROUND: BigInt("╭".codePointAt(0)!),
  // ... etc
} as const;

// In render:
buffer[off] = GLYPHS.HLINE; // No conversion needed
```

**Impact**: Reduces BigInt conversions in hot paths.

---

### 3. **Improve Input Handling**

**Problem**: Raw input appended without handling control characters.

```typescript
// Current (INCORRECT):
setText(v: string) {
  this.text += v; // Appends escape sequences!
}
```

**Solution**: Parse input properly.

```typescript
handleKeyboardEvent(d: string) {
  if (canType === 0) return;
  
  const input = componentMap.get(canType)! as Input;
  
  if (d === "\u0008" || d === "\u007F") {
    input.backspace();
  } else if (d === "\r" || d === "\n") {
    input.submit();
  } else if (d.startsWith("\u001b")) {
    // Handle arrows or ignore escape sequences
  } else {
    input.insertText(d);
  }
}
```

---

### 4. **Improve Error Handling**

**Problem**: `getHitComponent()` can throw if no component at position.

```typescript
// Current (UNSAFE):
const getHitComponent = (x: number, y: number): Button | Input => {
  const component = componentMap.get(hitMap.get(y * terminalWidth + x)!);
  return component!; // Can be undefined!
};
```

**Solution**: Return nullable or handle missing components.

```typescript
const getHitComponent = (x: number, y: number): Button | Input | undefined => {
  const id = hitMap.get(y * terminalWidth + x);
  if (id === undefined) return undefined;
  return componentMap.get(id);
};

// In handleMouseEvent:
const hitComponent = getHitComponent(x, y);
if (!hitComponent) return;
```

---

## 📊 Implementation Priority

### 🔥 Quick Wins (< 1 hour)
1. ✅ Remove/disable debug logging
2. ✅ Change to direct buffer writes (no BigUint64Array allocations)
3. ✅ Remove flush() from components (single flush in View)
4. ✅ Replace hitMap with Int32Array

**Expected improvement**: ~50-70% performance gain

---

### ⚡ High Impact (1-3 hours each)
5. ✅ Rust: Use `Vec<u64>` sized to terminal instead of fixed array
6. ✅ Rust: Copy only used slice, not entire buffer
7. ✅ Rust: Batch terminal writes by runs with same colors

**Expected improvement**: ~80-90% total performance gain

---

### 🎨 Polish (Optional, if still not meeting target)
8. ⚪ Separate layout/render/IO phases
9. ⚪ Cache BigInt glyph constants
10. ⚪ Fix input handling (backspace, enter, arrows)
11. ⚪ Improve error handling

---

## 🚀 Alternative Path: Uint32 Migration

If the above optimizations still don't hit <8ms:

**Trade-off**: Use `Uint32Array` instead of `BigUint64Array` to avoid BigInt overhead entirely.

**Required changes**:
- Rust: Change buffer to `u32` fields
- Pack colors differently or use separate buffers for char/fg/bg
- JS: Direct `Uint32Array` writes (faster than BigInt)

**Effort**: Medium-Large (1-2 days)  
**Gain**: 20-30% additional JS-side speed

---

## 🧪 Measuring Success

### Benchmarking approach:
```typescript
const start = performance.now();
v.render();
const elapsed = performance.now() - start;
console.log(`Render: ${elapsed.toFixed(2)}ms`);
```

### Target metrics:
- ✅ Render: <8ms (120Hz)
- ✅ Input response: <4ms
- ✅ Resize handling: <16ms (acceptable, not frequent)

---

## 🛡️ Risks and Guardrails

1. **Buffer reallocation**: Ensure JS view is refreshed after Rust reallocates
   - Already handled in resize handler ✅

2. **Invalid codepoints**: Use `.unwrap_or(' ')` when converting to char
   ```rust
   char::from_u32(new[0] as u32).unwrap_or(' ')
   ```

3. **Color 0 handling**: Black (0x000000) vs Reset
   - Explicitly set colors; 0 = black is fine

4. **LAST_BUFFER/CURRENT_BUFFER None states**: Always initialize both together

---

## 📈 Next Steps

### Immediate (Week 1):
1. Implement quick wins (#1-4)
2. Measure baseline vs new performance
3. Verify <8ms on target terminal sizes

### Short-term (Week 2):
4. Implement Rust buffer optimizations (#5-6)
5. Add run batching to flush (#7)
6. Comprehensive performance testing

### Future:
- Consider Uint32 migration if needed
- Explore SIMD for diff operations (only if flush is still bottleneck)
- Move input handling to Rust (only if significant improvement needed)

---

## 💡 Code Quality Notes

### Type Safety
- Add proper null checks for `getHitComponent()`
- Handle `None` cases in Rust FFI functions
- Validate terminal size before buffer operations

### Organization
- Extract constants (glyphs, colors) to separate module
- Create proper abstractions for buffer operations
- Consider component lifecycle methods (mount, unmount, update)

### Documentation
- Document the buffer layout format (codepoint, fg, bg)
- Explain coordinate system and hit-testing
- Add performance considerations to component docs

---

## 🎯 Conclusion

The current architecture is fundamentally sound. The identified issues are **implementation-level optimizations** rather than architectural flaws. 

**Key takeaway**: The combination of eliminating buffer clones, removing allocations in hot paths, and batching I/O operations should comfortably achieve the <8ms target.

Start with quick wins to validate the approach, then proceed to Rust optimizations for maximum impact.
