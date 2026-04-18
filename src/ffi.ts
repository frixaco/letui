/** Native FFI loader that resolves the Rust shared library for letui. */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const prefix = process.platform === "win32" ? "" : "lib";
const suffix = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so";
const filename = `${prefix}letui_core.${suffix}`;

function debugLog(...args: unknown[]): void {
  if (process.env.LETUI_DEBUG_FFI === "1") {
    console.error("[letui:ffi]", ...args);
  }
}

function getLibraryPath(): string {
  const { platform, arch } = process;

  const localPath = fileURLToPath(new URL(`../core/target/release/${filename}`, import.meta.url));

  try {
    if (existsSync(localPath)) {
      debugLog("using local build", localPath);
      return localPath;
    }
  } catch (error) {
    debugLog("local build probe failed", error);
  }

  const pkgName = `@frixaco/letui-${platform}-${arch}`;

  try {
    const resolved = require.resolve(`${pkgName}/${filename}`);
    debugLog("using packaged binary", resolved);
    return resolved;
  } catch {
    throw new Error(
      `Failed to load letui native library. Tried local build at ${localPath} and optional package ${pkgName}. Run deno task build-ffi or install the matching optional package.`,
    );
  }
}

const path = getLibraryPath();

const library = Deno.dlopen(path, {
  init_letui: {
    parameters: [],
    result: "i32",
  },
  deinit_letui: {
    parameters: [],
    result: "i32",
  },
  init_buffer: {
    parameters: [],
    result: "i32",
  },
  get_buffer_ptr: {
    parameters: [],
    result: "pointer",
  },
  get_buffer_len: {
    parameters: [],
    result: "u64",
  },
  apply_ops: {
    parameters: ["buffer", "u32"],
    result: "i32",
  },
  render: {
    parameters: [],
    result: "i32",
  },
  clear_tree_state: {
    parameters: [],
    result: "i32",
  },
  get_frames_ptr: {
    parameters: [],
    result: "pointer",
  },
  get_frames_len: {
    parameters: [],
    result: "u64",
  },
  get_hitmap_ptr: {
    parameters: [],
    result: "pointer",
  },
  get_hitmap_len: {
    parameters: [],
    result: "u64",
  },
  get_scroll_hitmap_ptr: {
    parameters: [],
    result: "pointer",
  },
  get_scroll_hitmap_len: {
    parameters: [],
    result: "u64",
  },
  get_width: {
    parameters: [],
    result: "u16",
  },
  get_height: {
    parameters: [],
    result: "u16",
  },
  free_buffer: {
    parameters: [],
    result: "i32",
  },
  debug_buffer: {
    parameters: ["u64"],
    result: "u64",
  },
  flush: {
    parameters: [],
    result: "i32",
  },
  update_terminal_size: {
    parameters: [],
    result: "i32",
  },
} as const);

export default library.symbols;
