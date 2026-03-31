import { dlopen, suffix } from "bun:ffi";
import { fileURLToPath } from "url";

const prefix = process.platform === "win32" ? "" : "lib";
const filename = `${prefix}letui_core.${suffix}`;

function debugLog(...args: unknown[]): void {
  if (process.env.LETUI_DEBUG_FFI === "1") {
    console.error("[letui:ffi]", ...args);
  }
}

function getLibraryPath(): string {
  const { platform, arch } = process;

  const localPath = fileURLToPath(
    new URL(`../core/target/release/${filename}`, import.meta.url),
  );

  try {
    if (Bun.file(localPath).size > 0) {
      debugLog("using local build", localPath);
      return localPath;
    }
  } catch (error) {
    debugLog("local build probe failed", error);
  }

  const pkgName = `@frixaco/letui-${platform}-${arch}`;

  try {
    const resolved = Bun.resolveSync(`${pkgName}/${filename}`, import.meta.dir);
    debugLog("using packaged binary", resolved);
    return resolved;
  } catch {
    throw new Error(
      `Failed to load letui native library. Tried local build at ${localPath} and optional package ${pkgName}. Run bun run build-ffi or install the matching optional package.`,
    );
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
  apply_ops: {
    args: ["buffer", "u32"],
    returns: "i32",
  },
  render: {
    args: [],
    returns: "i32",
  },
  clear_tree_state: {
    args: [],
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
