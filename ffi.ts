import { dlopen, FFIType, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const filename = `${prefix}letui_ffi.${suffix}`;

// Logic to find the binary:
// 1. Check if we are running in dev mode (local target/release)
// 2. Check node_modules for the platform-specific package

function getLibraryPath(): string {
  const { platform, arch } = process;
  
  // Map nodejs platform/arch to our package naming convention
  // We use the same names as node (darwin, linux, win32) and (x64, arm64)
  const pkgName = `@frixaco/letui-${platform}-${arch}`;
  
  try {
    // Try to resolve the binary from the installed package
    // @ts-ignore - expecting this to be available at runtime
    const pkgPath = import.meta.resolveSync(`${pkgName}/${filename}`);
    return pkgPath;
  } catch (e) {
    // Fallback to local development path
    return new URL(`./letui-ffi/target/release/${filename}`, import.meta.url).pathname;
  }
}

const path = getLibraryPath();

const { symbols: api } = dlopen(path, {
  init_letui: {
    args: [],
    returns: "i32",
  },
  deinit_letui: {
    args: [],
    returns: "i32",
  },
  init_buffer: {
    args: [],
    returns: "i32",
  },
  get_buffer_ptr: {
    args: [],
    returns: "pointer",
  },
  get_buffer_len: {
    args: [],
    returns: "u64",
  },
  calculate_layout: {
    args: ["pointer", "u32", "pointer", "u32", "f32", "f32"],
    returns: "i32",
  },
  get_frames_ptr: {
    args: [],
    returns: "pointer",
  },
  get_frames_len: {
    args: [],
    returns: "u64",
  },
  get_width: {
    args: [],
    returns: "u16",
  },
  get_height: {
    args: [],
    returns: "u16",
  },
  free_buffer: {
    args: [],
    returns: "i32",
  },
  debug_buffer: {
    args: ["u64"],
    returns: "u64",
  },
  flush: {
    args: [],
    returns: "i32",
  },
  update_terminal_size: {
    args: [],
    returns: "i32",
  },
});

export default api;
