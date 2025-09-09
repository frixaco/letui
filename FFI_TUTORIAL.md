# Rust-TypeScript FFI: A Complete Guide from First Principles

## Table of Contents

1. [Introduction to FFI](#introduction-to-ffi)
2. [Memory Management Fundamentals](#memory-management-fundamentals)
3. [Setting Up the Environment](#setting-up-the-environment)
4. [Understanding C ABI](#understanding-c-abi)
5. [Building the Rust Library](#building-the-rust-library)
6. [TypeScript FFI with Bun](#typescript-ffi-with-bun)
7. [Pointer Management and Memory Safety](#pointer-management-and-memory-safety)
8. [Advanced Patterns and Best Practices](#advanced-patterns-and-best-practices)
9. [Common Pitfalls and Debugging](#common-pitfalls-and-debugging)
10. [Performance Considerations](#performance-considerations)

## Introduction to FFI

**Foreign Function Interface (FFI)** is a mechanism that allows code written in one programming language to call functions written in another language. It's the bridge that enables different programming languages to work together in the same program.

### Why Use FFI?

1. **Performance**: Rust provides zero-cost abstractions and memory safety without garbage collection
2. **Legacy Integration**: Reuse existing libraries without rewriting them
3. **Specialization**: Use the best tool for each part of your system
4. **Ecosystem Access**: Leverage libraries from different language ecosystems

### The Challenge

The main challenge with FFI is that different languages have different:

- **Memory models** (garbage collected vs manual vs ownership-based)
- **Data representations** (how numbers, strings, and structures are stored in memory)
- **Calling conventions** (how functions pass parameters and return values)
- **Error handling** (exceptions vs return codes vs panics)

## Memory Management Fundamentals

Before diving into implementation, it's crucial to understand how different languages manage memory:

### JavaScript/TypeScript Memory Model

JavaScript uses **garbage collection**:

```javascript
let data = [1, 2, 3, 4, 5]; // Memory allocated automatically
// Memory is freed automatically when `data` is no longer referenced
```

Key characteristics:

- Memory allocation is automatic
- Memory deallocation is automatic (but unpredictable timing)
- No direct memory addresses accessible to the programmer
- Memory layout is managed by the JavaScript engine

### Rust Memory Model

Rust uses **ownership and borrowing**:

```rust
fn main() {
    let data = vec![1, 2, 3, 4, 5]; // Memory allocated
    // Memory freed automatically when `data` goes out of scope
} // <- `data` is dropped here, memory is freed
```

Key characteristics:

- Memory allocation and deallocation are deterministic
- The compiler ensures memory safety at compile time
- Direct access to memory addresses is possible (in `unsafe` blocks)
- Zero-cost abstractions with predictable performance

### The FFI Bridge

When bridging these two worlds, we need to:

1. **Expose Rust memory** to JavaScript in a safe way
2. **Manage lifetime** of shared memory carefully
3. **Handle data conversion** between different representations
4. **Ensure thread safety** if needed

## Setting Up the Environment

### Project Structure

```
letui/
├── letui-ffi/          # Rust library
│   ├── src/
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── target/
├── index.ts            # TypeScript/Bun code
├── package.json
└── tsconfig.json
```

### Rust Configuration (Cargo.toml)

```toml
[package]
name = "letui_ffi"
version = "0.1.0"
edition = "2021"

[lib]
name = "letui_ffi"
crate-type = ["cdylib"]  # Create a C-compatible dynamic library

[dependencies]
# Add any dependencies you need
```

**Key points:**

- `crate-type = ["cdylib"]` tells Rust to compile as a C-compatible dynamic library
- This generates `.so` (Linux), `.dylib` (macOS), or `.dll` (Windows) files
- The library name affects the generated filename

### TypeScript/Bun Configuration

```json
// package.json
{
  "name": "letui",
  "version": "1.0.0",
  "dependencies": {
    "bun-types": "latest"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"]
  }
}
```

## Understanding C ABI

The **Application Binary Interface (ABI)** defines how functions are called at the binary level. Since both Rust and JavaScript can interface with C, we use C ABI as our common ground.

### C Data Types and Their Sizes

```c
// Integer types
int8_t   -> 1 byte  (i8 in Rust)
int16_t  -> 2 bytes (i16 in Rust)
int32_t  -> 4 bytes (i32 in Rust)
int64_t  -> 8 bytes (i64 in Rust)

// Unsigned variants
uint8_t  -> 1 byte  (u8 in Rust)
uint16_t -> 2 bytes (u16 in Rust)
uint32_t -> 4 bytes (u32 in Rust)
uint64_t -> 8 bytes (u64 in Rust)

// Floating point
float    -> 4 bytes (f32 in Rust)
double   -> 8 bytes (f64 in Rust)

// Pointers
void*    -> 8 bytes on 64-bit systems (usize in Rust)
```

### Function Calling Convention

When calling a C function:

1. **Parameters** are passed in registers or on the stack
2. **Return value** is passed in a specific register or memory location
3. **Caller** is responsible for cleaning up the stack (in most conventions)

## Building the Rust Library

### Step 1: Understanding the Problem

We want to:

1. Create a buffer of `u64` values in Rust
2. Allow JavaScript to read and write to this buffer
3. Manage the buffer's lifetime from Rust

### Step 2: Designing the API

```rust
// Initialize a buffer of specified length
pub extern "C" fn init_buffer(len: c_ulong) -> c_int;

// Get pointer and length of the buffer
pub extern "C" fn get_buffer(ptr_out: *mut *const u64, len_out: *mut c_ulong) -> c_int;

// Free the buffer
pub extern "C" fn free_buffer() -> c_int;
```

**Key design decisions:**

1. **Return codes**: Use `c_int` to return success/failure (1/0)
2. **Out parameters**: Use pointers to return multiple values (`ptr_out`, `len_out`)
3. **C types**: Use `c_ulong` for sizes to ensure ABI compatibility
4. **Global state**: Use static storage to maintain buffer between calls

### Step 3: Implementation Details

```rust
use std::os::raw::{c_int, c_ulong};

// Global static storage for our buffer
static mut BUFFER: Option<Vec<u64>> = None;

#[no_mangle]
pub extern "C" fn init_buffer(len: c_ulong) -> c_int {
    unsafe {
        // Create a vector with `len` elements, all initialized to 0
        BUFFER = Some(vec![0u64; len as usize]);
    }
    1 // Return success
}
```

**Breaking down `init_buffer`:**

- `#[no_mangle]`: Prevents Rust from changing the function name during compilation
- `extern "C"`: Uses C calling convention and ABI
- `unsafe`: Required because we're accessing mutable static data
- `vec![0u64; len as usize]`: Creates vector with `len` zero-initialized elements
- `len as usize`: Converts C-compatible `c_ulong` to Rust's `usize`

```rust
#[no_mangle]
pub extern "C" fn get_buffer(ptr_out: *mut *const u64, len_out: *mut c_ulong) -> c_int {
    unsafe {
        if let Some(ref buf) = BUFFER {
            // Write the buffer's pointer to ptr_out
            *ptr_out = buf.as_ptr();
            // Write the buffer's length to len_out
            *len_out = buf.len() as c_ulong;
            return 1; // Success
        }
    }
    0 // Failure - buffer not initialized
}
```

**Breaking down `get_buffer`:**

- **Double pointers**: `*mut *const u64` is a mutable pointer to a const pointer to u64
- **Out parameters**: JavaScript passes pointers to where we should write results
- `buf.as_ptr()`: Gets raw pointer to vector's data
- `*ptr_out = ...`: Dereferences the output pointer and writes our data pointer
- **Return values**: Two values returned via out parameters, success/failure via return

### Step 4: Memory Layout Understanding

```
JavaScript Memory:        Rust Memory:

ptrBuffer: [........]    BUFFER: Some(Vec<u64>)
lenBuffer: [........]             ↓
                                 heap: [0,0,0,0,0,0,0,0,0,0] (10 × u64)
                                        ↑
After get_buffer():              ptr points here

ptrBuffer: [ptr_addr]
lenBuffer: [   10   ]
```

## TypeScript FFI with Bun

### Step 1: Loading the Dynamic Library

```typescript
import { dlopen, FFIType, ptr, suffix, toArrayBuffer } from "bun:ffi";

// Construct path to the compiled Rust library
const libPath = `./letui-ffi/target/release/libletui_ffi.${suffix}`;

const { symbols } = dlopen(libPath, {
  init_buffer: { args: [FFIType.u64], returns: FFIType.i32 },
  get_buffer: {
    args: [FFIType.pointer, FFIType.pointer],
    returns: FFIType.i32,
  },
  free_buffer: { returns: FFIType.i32 },
});
```

**Breaking down `dlopen`:**

- `dlopen`: Loads a dynamic library and returns its symbols
- `suffix`: Automatically resolves to `.so`, `.dylib`, or `.dll` based on platform
- **Type mapping**:
  - `c_ulong` → `FFIType.u64`
  - `c_int` → `FFIType.i32`
  - `*mut T` → `FFIType.pointer`

### Step 2: Understanding Bun's FFI Types

```typescript
// Bun FFI Type System
FFIType.i8; // int8_t   (1 byte signed)
FFIType.u8; // uint8_t  (1 byte unsigned)
FFIType.i16; // int16_t  (2 bytes signed)
FFIType.u16; // uint16_t (2 bytes unsigned)
FFIType.i32; // int32_t  (4 bytes signed)
FFIType.u32; // uint32_t (4 bytes unsigned)
FFIType.i64; // int64_t  (8 bytes signed)
FFIType.u64; // uint64_t (8 bytes unsigned)
FFIType.f32; // float    (4 bytes)
FFIType.f64; // double   (8 bytes)
FFIType.pointer; // void*   (8 bytes on 64-bit)
FFIType.cstring; // char*   (null-terminated string)
```

### Step 3: Handling Pointers and Out Parameters

The tricky part is handling Rust's out parameters. We need to:

1. Allocate memory in JavaScript for Rust to write to
2. Pass pointers to that memory to Rust
3. Read the results from that memory

```typescript
// Create buffers to hold the output values
const ptrBuffer = new ArrayBuffer(8); // 8 bytes for pointer (64-bit)
const lenBuffer = new ArrayBuffer(8); // 8 bytes for length

// Call get_buffer, passing pointers to our buffers
const result = symbols.get_buffer(ptr(ptrBuffer), ptr(lenBuffer));
```

**Why `ArrayBuffer`?**

- `ArrayBuffer` represents raw binary data
- `ptr(arrayBuffer)` gives us a pointer to that memory
- Rust can write directly to this memory

**Reading the results:**

```typescript
if (result === 1) {
  // Convert ArrayBuffers to typed arrays to read the values
  const bufferPtr = new BigUint64Array(ptrBuffer)[0];
  const bufferLen = Number(new BigUint64Array(lenBuffer)[0]);

  // Now we have the pointer and length!
}
```

### Step 4: Creating ArrayBuffer from Rust Memory

```typescript
// Create ArrayBuffer that maps to Rust's memory
const arrayBuffer = toArrayBuffer(Number(bufferPtr), 0, bufferLen * 8);
const view = new BigUint64Array(arrayBuffer);
```

**Breaking down `toArrayBuffer`:**

- **Parameter 1** (`Number(bufferPtr)`): Memory address as number
- **Parameter 2** (`0`): Byte offset from the address
- **Parameter 3** (`bufferLen * 8`): Total bytes to map (10 elements × 8 bytes each)

**Why `BigUint64Array`?**

- Rust's `u64` is 64-bit unsigned integer
- JavaScript's `BigUint64Array` handles 64-bit integers correctly
- Regular `Number` in JavaScript can only safely represent integers up to 2^53

## Pointer Management and Memory Safety

### The Shared Memory Model

```
                    ┌─────────────────┐
                    │   JavaScript    │
                    │   Environment   │
                    └─────────┬───────┘
                              │
                              │ FFI Bridge
                              │
                    ┌─────────▼───────┐
                    │  Rust Library   │
                    │                 │
                    │  ┌───────────┐  │
                    │  │  BUFFER   │  │ ◄─── Static storage
                    │  │ Vec<u64>  │  │
                    │  └─────┬─────┘  │
                    └────────┼────────┘
                             │
                    ┌────────▼────────┐
                    │   Heap Memory   │
                    │ [0,0,0,0,0,0,0] │ ◄─── Actual data
                    └─────────────────┘
```

### Memory Lifetime Management

**The Challenge:**

- Rust wants to manage memory lifecycle
- JavaScript has garbage collection
- We need shared access to the same memory

**Our Solution:**

1. **Rust owns the memory**: The `Vec<u64>` is stored in Rust's static storage
2. **JavaScript maps the memory**: Uses `toArrayBuffer` to create a view
3. **Explicit cleanup**: JavaScript calls `free_buffer()` when done

### Safety Considerations

**What could go wrong?**

1. **Use after free**: JavaScript accessing memory after `free_buffer()`
2. **Double free**: Calling `free_buffer()` multiple times
3. **Buffer overflow**: JavaScript writing beyond buffer boundaries
4. **Race conditions**: Multiple threads accessing the buffer simultaneously

**Our mitigations:**

- Static storage in Rust prevents premature deallocation
- Return codes indicate success/failure of operations
- Length information prevents bounds errors
- Single-threaded access (no explicit synchronization needed)

### Alternative Approaches

**Approach 1: Pass ownership to JavaScript**

```rust
// Return the vector and let JavaScript manage it
pub extern "C" fn create_buffer(len: c_ulong) -> *mut Vec<u64> {
    let boxed = Box::new(vec![0u64; len as usize]);
    Box::into_raw(boxed)
}

pub extern "C" fn free_buffer(ptr: *mut Vec<u64>) {
    unsafe {
        Box::from_raw(ptr); // Reconstructs Box and drops it
    }
}
```

**Approach 2: Reference counting**

```rust
use std::sync::Arc;
use std::sync::Mutex;

static mut BUFFER: Option<Arc<Mutex<Vec<u64>>>> = None;
```

**Approach 3: Arena allocation**

```rust
// Allocate from a pre-allocated arena
// Never free individual buffers, only the entire arena
```

## Advanced Patterns and Best Practices

### Pattern 1: Error Handling

Instead of just returning 1/0, we can use more descriptive error codes:

```rust
#[repr(C)]
pub enum BufferError {
    Success = 0,
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidLength = 3,
    NullPointer = 4,
}

#[no_mangle]
pub extern "C" fn init_buffer(len: c_ulong) -> BufferError {
    if len == 0 {
        return BufferError::InvalidLength;
    }

    unsafe {
        if BUFFER.is_some() {
            return BufferError::AlreadyInitialized;
        }
        BUFFER = Some(vec![0u64; len as usize]);
    }
    BufferError::Success
}
```

### Pattern 2: Type-Safe Wrappers

Create TypeScript classes that encapsulate the FFI operations:

```typescript
class RustBuffer {
  private ptr: bigint | null = null;
  private length: number = 0;
  private view: BigUint64Array | null = null;

  constructor(length: number) {
    const result = symbols.init_buffer(length);
    if (result !== 0) {
      throw new Error(`Failed to initialize buffer: ${result}`);
    }

    this.loadBuffer();
  }

  private loadBuffer() {
    const ptrBuffer = new ArrayBuffer(8);
    const lenBuffer = new ArrayBuffer(8);

    const result = symbols.get_buffer(ptr(ptrBuffer), ptr(lenBuffer));
    if (result !== 1) {
      throw new Error("Failed to get buffer");
    }

    this.ptr = new BigUint64Array(ptrBuffer)[0];
    this.length = Number(new BigUint64Array(lenBuffer)[0]);

    const arrayBuffer = toArrayBuffer(Number(this.ptr), 0, this.length * 8);
    this.view = new BigUint64Array(arrayBuffer);
  }

  get(index: number): bigint {
    if (!this.view) throw new Error("Buffer not initialized");
    if (index < 0 || index >= this.length) {
      throw new Error("Index out of bounds");
    }
    return this.view[index];
  }

  set(index: number, value: bigint) {
    if (!this.view) throw new Error("Buffer not initialized");
    if (index < 0 || index >= this.length) {
      throw new Error("Index out of bounds");
    }
    this.view[index] = value;
  }

  dispose() {
    symbols.free_buffer();
    this.ptr = null;
    this.length = 0;
    this.view = null;
  }
}

// Usage
const buffer = new RustBuffer(10);
buffer.set(0, 42n);
console.log(buffer.get(0)); // 42n
buffer.dispose();
```

### Pattern 3: Async Operations

For long-running operations, we can use callbacks or promises:

```rust
use std::thread;
use std::time::Duration;

// Function pointer type for callbacks
type CallbackFn = extern "C" fn(result: c_int);

#[no_mangle]
pub extern "C" fn process_async(callback: CallbackFn) {
    thread::spawn(move || {
        // Simulate some work
        thread::sleep(Duration::from_secs(1));
        // Call the callback with result
        callback(42);
    });
}
```

```typescript
// TypeScript side
const callback = (result: number) => {
  console.log("Async operation completed with result:", result);
};

symbols.process_async(callback);
```

### Pattern 4: Complex Data Structures

For more complex data, we can serialize/deserialize:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct ComplexData {
    name: String,
    values: Vec<f64>,
    metadata: HashMap<String, String>,
}

#[no_mangle]
pub extern "C" fn process_json(json_str: *const c_char) -> *mut c_char {
    unsafe {
        let c_str = CStr::from_ptr(json_str);
        let json_str = c_str.to_str().unwrap();

        let data: ComplexData = serde_json::from_str(json_str).unwrap();

        // Process the data...

        let result_json = serde_json::to_string(&data).unwrap();
        let c_string = CString::new(result_json).unwrap();
        c_string.into_raw()
    }
}
```

## Common Pitfalls and Debugging

### Pitfall 1: Pointer Arithmetic Errors

**Problem:**

```typescript
// Wrong - treating pointer as array index
const arrayBuffer = toArrayBuffer(Number(bufferPtr), 0, bufferLen);
```

**Solution:**

```typescript
// Correct - byte size calculation
const arrayBuffer = toArrayBuffer(Number(bufferPtr), 0, bufferLen * 8);
```

### Pitfall 2: Endianness Issues

**Problem:** Different platforms store multi-byte values differently.

**Solution:** Use explicit endianness handling:

```rust
// Rust side - use platform-native byte order
let value: u64 = 0x0123456789ABCDEF;
buffer[0] = value.to_ne_bytes(); // Native endian
```

### Pitfall 3: Memory Alignment

**Problem:** Some platforms require aligned memory access.

**Solution:**

```rust
// Use repr(C) for predictable layout
#[repr(C)]
struct AlignedData {
    field1: u64,  // 8 bytes, 8-byte aligned
    field2: u32,  // 4 bytes, 4-byte aligned
    field3: u32,  // 4 bytes, 4-byte aligned (padding added automatically)
}
```

### Pitfall 4: String Handling

**Problem:** Strings have different representations.

**Rust strings:**

```rust
String       // UTF-8, owned, length-prefixed
&str         // UTF-8, borrowed, length-prefixed
CString      // Null-terminated, owned
CStr         // Null-terminated, borrowed
```

**JavaScript strings:**

```typescript
string; // UTF-16, garbage-collected
```

**Solution:**

```rust
use std::ffi::{CString, CStr};
use std::os::raw::c_char;

#[no_mangle]
pub extern "C" fn process_string(input: *const c_char) -> *mut c_char {
    unsafe {
        // Convert C string to Rust string
        let c_str = CStr::from_ptr(input);
        let rust_str = c_str.to_str().unwrap();

        // Process the string
        let result = format!("Processed: {}", rust_str);

        // Convert back to C string
        let c_string = CString::new(result).unwrap();
        c_string.into_raw()
    }
}

#[no_mangle]
pub extern "C" fn free_string(s: *mut c_char) {
    unsafe {
        if s.is_null() { return; }
        CString::from_raw(s);
    }
}
```

### Debugging Techniques

**1. Logging from Rust:**

```rust
// Add to Cargo.toml: log = "0.4"
use log::info;

#[no_mangle]
pub extern "C" fn debug_function() {
    info!("Function called");
}
```

**2. Memory debugging:**

```bash
# Use Valgrind (Linux) or similar tools
valgrind --tool=memcheck bun run index.ts

# Use AddressSanitizer
export RUSTFLAGS="-Zsanitizer=address"
cargo build --target x86_64-unknown-linux-gnu
```

**3. FFI debugging:**

```typescript
// Log all FFI calls
const originalSymbols = symbols;
const debugSymbols = new Proxy(symbols, {
  get(target, prop) {
    const fn = target[prop];
    return (...args: any[]) => {
      console.log(`Calling ${String(prop)} with:`, args);
      const result = fn(...args);
      console.log(`Result:`, result);
      return result;
    };
  },
});
```

## Performance Considerations

### Memory Copy vs. Memory Mapping

**Memory Copy (slower but safer):**

```typescript
// Data is copied from Rust memory to JavaScript memory
const jsArray = new BigUint64Array(rustArray.length);
for (let i = 0; i < rustArray.length; i++) {
  jsArray[i] = rustArray[i];
}
```

**Memory Mapping (faster but requires careful management):**

```typescript
// JavaScript directly accesses Rust memory
const view = new BigUint64Array(toArrayBuffer(ptr, 0, length * 8));
```

### Batch Operations

**Inefficient:**

```typescript
// Multiple FFI calls
for (let i = 0; i < 1000; i++) {
  symbols.process_single_item(i);
}
```

**Efficient:**

```typescript
// Single FFI call
symbols.process_items_batch(itemsPtr, 1000);
```

### Memory Layout Optimization

**Structure of Arrays (SoA) vs Array of Structures (AoS):**

```rust
// AoS - worse cache locality
struct Point { x: f64, y: f64, z: f64 }
let points: Vec<Point> = vec![];

// SoA - better cache locality for operations on single components
struct Points {
    x: Vec<f64>,
    y: Vec<f64>,
    z: Vec<f64>,
}
```

### Measurement and Profiling

```typescript
// Measure FFI call overhead
const start = performance.now();
for (let i = 0; i < 10000; i++) {
  symbols.fast_function();
}
const end = performance.now();
console.log(`Average call time: ${(end - start) / 10000}ms`);
```

```rust
// Rust profiling
// Add to Cargo.toml: criterion = "0.4"
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_buffer_access(c: &mut Criterion) {
    c.bench_function("buffer_access", |b| {
        b.iter(|| {
            // Your code here
            black_box(expensive_operation());
        });
    });
}
```

## Conclusion

FFI between Rust and TypeScript opens up powerful possibilities:

1. **Performance-critical code** can be implemented in Rust
2. **Complex algorithms** can benefit from Rust's zero-cost abstractions
3. **Memory-intensive operations** can avoid garbage collection overhead
4. **Existing Rust libraries** can be used from JavaScript applications

**Key takeaways:**

- **Memory management** is the most critical aspect of FFI
- **Type safety** must be maintained across the language boundary
- **Error handling** should be explicit and comprehensive
- **Performance optimization** requires understanding both memory models
- **Debugging tools** are essential for complex FFI applications

**Next steps for learning:**

1. Experiment with different data types (strings, structs, enums)
2. Implement error handling and recovery mechanisms
3. Explore async/await patterns across the FFI boundary
4. Build a real application that benefits from Rust's performance
5. Learn about advanced topics like shared memory and lock-free data structures

The combination of Rust's performance and safety with JavaScript's flexibility and ecosystem creates a powerful development platform for modern applications.
