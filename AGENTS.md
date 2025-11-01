# Project information

This is a fast, simple and minimal TUI library written using Rust and TypeScript.

The backend for the library is written in Rust for following reasons:

**Performance Benefits**
• Memory Operations
• SIMD Vectorization: Native code can use SIMD instructions for parallel operations
• Direct Memory Access
• Zero-Copy Operations

**Memory Management**
• Arena Allocation: Batch allocations reduce overhead
• Manual Memory Control: Precise control over allocation/deallocation patterns
• Memory Pooling: Efficient reuse of memory blocks for frequently allocated objects like grapheme clusters

**Threading and Concurrency**
• True Parallelism: Native threads can run concurrently
• Non-blocking I/O: Background threads can handle I/O operations without blocking the main application
• Synchronization Primitives: Access to mutexes, condition variables, and other low-level synchronization tools

**System Integration**
• Platform-Specific Optimizations: Can leverage platform-specific APIs and optimizations
• Direct System Calls
• Hardware Features: Access to CPU-specific instructions and hardware acceleration

**Data Processing**
• Efficient String/Text Processing
• Binary Data Manipulation: Direct byte-level operations
• Mathematical Operations: Native floating-point operations

The API/wrapper for the library is written in TypeScript and communication with Rust backend is achieved thanks to Bun's FFI support

TypeScript wrapper exposes component API to build UI elements.

**Performance goal**: Achieve <8ms or 120hz response time

# Runtime and environment

Default to using Bun instead of Node.js.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

# Status

Current huge refactoring is going on.

- TypeScript wrapper will signals/reactivity for updates and state management. Primitives are mostly done and finished in ./signals.ts
- API for components is NOT ready yet and needs to be worked on. It's in ./components.ts
- Old TypeScript code that was done for learning and PoC purposes is very messy and is in ./index.ts
- Old Rust code that was done for learning and PoC purposes is working but might change during refactoring. It is in ./letui-ffi/src/lib.rs
- Both TypeScript wrapper and Rust core basically need a clean, proper rewrite.

# General

- Include some sarcasm here and there. Don't go overboard, keep sarcasm minimal.
