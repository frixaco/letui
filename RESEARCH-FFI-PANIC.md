# Research: FFI Panic Issue with Published NPM Packages

## Problem Statement

When using published `@frixaco/anitrack` via `bunx @frixaco/anitrack`, a Rust panic occurs:

```
thread '<unnamed>' (27240) panicked at src\lib.rs:365:59:
called `Result::unwrap()` on an `Err` value: Error("expected value", line: 1, column: 1)
```

**Key observation**: Works locally on both Windows and Unix, but fails when using published npm packages.

---

## Package Structure

### Main Packages
- `@frixaco/anitrack@0.0.3` - TUI torrent search app
- `@frixaco/letui@0.0.8` - TUI framework with Rust FFI backend

### Binary Packages (optional dependencies of letui)
- `@frixaco/letui-darwin-arm64@0.0.8`
- `@frixaco/letui-darwin-x64@0.0.8` (NOT built by CI - see issues below)
- `@frixaco/letui-linux-x64@0.0.8`
- `@frixaco/letui-win32-x64@0.0.8`

---

## Verified Working

1. **Binary packages are correctly published**
   - Linux: `libletui_ffi.so` (984KB) 
   - Windows: `letui_ffi.dll` (541KB)
   - Verified with `npm pack --dry-run`

2. **FFI loading works**
   ```bash
   # This works:
   bun -e "
   import { dlopen } from 'bun:ffi';
   const { symbols } = dlopen('/path/to/libletui_ffi.so', {
     init_buffer: { args: [], returns: 'i32' },
   });
   console.log(symbols.init_buffer()); // Returns 1
   "
   ```

3. **Path resolution works**
   ```bash
   Bun.resolveSync('@frixaco/letui-linux-x64/libletui_ffi.so', '.')
   # Returns correct path
   ```

4. **Cargo.lock is committed** - Dependencies should be consistent

---

## Stack Backtrace Analysis

```
stack backtrace:
   0-11: update_terminal_size (symbol resolution broken due to release build)
   12:   calculate_layout    <-- PANIC HAPPENS IN THIS CALL CHAIN
   13:   <unknown>
   14:   v8::Number::Value
```

The panic occurs inside `calculate_layout` FFI function.

---

## Error Analysis

### Error Format
```
Error("expected value", line: 1, column: 1)
```

This is the **Debug format of `serde_json::Error`** - specifically what you get when trying to deserialize empty or invalid JSON.

### The Mystery
- `letui-ffi` Rust code does NOT use serde_json directly
- `serde_json` is NOT in Cargo.lock
- BUT taffy (layout engine) depends on `serde`:

```
# From Cargo.lock
[[package]]
name = "taffy"
version = "0.9.1"
dependencies = [
  "arrayvec",
  "grid",
  "serde",      <-- HAS SERDE DEPENDENCY
  "slotmap",
]
```

### Line Number Mismatch
- Error says `src\lib.rs:365:59`
- letui-ffi's lib.rs has 614 lines
- Line 365 in letui-ffi is: `width: length(node.gap),` - NO unwrap() there
- **Conclusion**: The `lib.rs:365` is from a DEPENDENCY, not letui-ffi

---

## Potential Causes

### 1. CI Build Differences (Most Likely)
The CI workflow uses:
```yaml
- name: Install Rust
  uses: dtolnay/rust-toolchain@stable  # No version pinning!

- name: Build Rust (Release)
  run: |
    cd letui-ffi
    cargo build --release  # No --locked flag!
```

**Issues**:
- No pinned Rust version - different runners may have different rustc versions
- No `--locked` flag - Cargo might update dependencies
- Different system libraries on CI vs local

### 2. Rust Edition 2024
```toml
# Cargo.toml
edition = "2024"
```
Rust 2024 edition is very new (stabilized in Rust 1.85). CI runners might have issues.

### 3. Missing darwin-x64 Build
CI workflow only builds:
- darwin-arm64 (macos-14)
- linux-x64 (ubuntu-latest)  
- win32-x64 (windows-latest)

But package.json lists `@frixaco/letui-darwin-x64` as optional dependency - this package is NEVER published!

### 4. ABI/Memory Issues
The FFI data passing could have issues:
```typescript
// runtime.ts - layout function
const safeTextData = textData.length > 0 ? textData : new Uint8Array(1);

api.calculate_layout(
  ptr(nodeData),
  nodeData.length,
  ptr(safeTextData),
  textData.length,  // Original length (0), not safeTextData.length (1)
  terminalWidth(),
  terminalHeight(),
);
```
This is intentional but worth noting.

---

## Suggested Fixes

### Fix 1: Pin Rust Version and Use --locked

```yaml
# .github/workflows/release.yml
- name: Install Rust
  uses: dtolnay/rust-toolchain@stable
  with:
    toolchain: 1.85.0  # Pin specific version

- name: Build Rust (Release)
  run: |
    cd letui-ffi
    cargo build --release --locked  # Use --locked flag
```

### Fix 2: Add darwin-x64 Build
```yaml
matrix:
  include:
    - os: macos-14
      platform: darwin
      arch: arm64
    - os: macos-13        # ADD THIS for Intel Macs
      platform: darwin
      arch: x64
    # ... rest
```

### Fix 3: Better Error Handling in Rust
Replace `.unwrap()` calls with proper error handling:
```rust
// Instead of:
let (w, h) = size().unwrap();

// Use:
let (w, h) = match size() {
    Ok(s) => s,
    Err(e) => {
        eprintln!("Failed to get terminal size: {}", e);
        return -1;
    }
};
```

### Fix 4: Add Debug Logging to ffi.ts
```typescript
function getLibraryPath(): string {
  const { platform, arch } = process;
  
  console.log(`[letui-ffi] Platform: ${platform}, Arch: ${arch}`);
  
  // ... existing code ...
  
  const binaryPath = Bun.resolveSync(`${pkgName}/${filename}`, import.meta.dir);
  console.log(`[letui-ffi] Resolved binary path: ${binaryPath}`);
  console.log(`[letui-ffi] Binary exists: ${Bun.file(binaryPath).size > 0}`);
  
  return binaryPath;
}
```

### Fix 5: More Robust Path Resolution
```typescript
import { dirname, join } from "path";

function getLibraryPath(): string {
  // ... local path check ...

  const pkgName = `@frixaco/letui-${platform}-${arch}`;
  
  try {
    // Resolve package.json first, then construct binary path
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    const pkgDir = dirname(pkgJsonPath);
    const binaryPath = join(pkgDir, filename);
    
    // Verify binary exists and has content
    const file = Bun.file(binaryPath);
    if (file.size > 0) {
      return binaryPath;
    }
    throw new Error(`Binary file empty or missing: ${binaryPath}`);
  } catch (e) {
    console.error(`[letui-ffi] Failed to resolve ${pkgName}:`, e);
    throw e;
  }
}
```

---

## Next Steps to Debug

1. **Get verbose output on failure**:
   ```powershell
   # Windows
   $env:RUST_BACKTRACE="full"; bunx @frixaco/anitrack
   ```
   ```bash
   # Unix
   RUST_BACKTRACE=full bunx @frixaco/anitrack
   ```

2. **Compare local vs CI binaries**:
   - Check file sizes
   - Check rustc version used
   - Check linked libraries: `ldd libletui_ffi.so` (Linux) or `otool -L` (macOS)

3. **Test with locally built binary in npm package structure**:
   - Build locally
   - Copy to a fake npm package structure
   - Test if it works

4. **Check if serde feature is being enabled differently**:
   - Compare `cargo tree` output locally vs on CI

---

## Files Analyzed

- `/home/frixa/Documents/letui/package.json`
- `/home/frixa/Documents/letui/ffi.ts`
- `/home/frixa/Documents/letui/runtime.ts`
- `/home/frixa/Documents/letui/components.ts`
- `/home/frixa/Documents/letui/letui-ffi/Cargo.toml`
- `/home/frixa/Documents/letui/letui-ffi/Cargo.lock`
- `/home/frixa/Documents/letui/letui-ffi/src/lib.rs`
- `/home/frixa/Documents/letui/scripts/build-npm.ts`
- `/home/frixa/Documents/letui/.github/workflows/release.yml`
- `/home/frixa/Documents/anitrack/package.json`
- `/home/frixa/Documents/anitrack/index.ts`

---

## Key Insight

The root cause is likely that **CI-built binaries behave differently than locally-built binaries**. The exact reason is unclear but possibilities include:
1. Different Rust compiler version
2. Different dependency resolution (no --locked)
3. Different system libraries
4. Some taffy/serde interaction that differs between builds

The serde JSON parsing error suggests something is trying to deserialize data that is empty or invalid, but this code path shouldn't be hit during normal layout computation.
