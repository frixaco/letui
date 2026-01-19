import { dlopen, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const filename = `${prefix}letui_ffi.${suffix}`;

import { fileURLToPath } from "url";

function getLibraryPath(): string {
  const { platform, arch } = process;

  const localPath = fileURLToPath(
    new URL(`./letui-ffi/target/release/${filename}`, import.meta.url),
  );

  console.log("Attempting to load local build from:", localPath);

  try {
    if (Bun.file(localPath).size > 0) {
      console.log("Found local build!");
      return localPath;
    }
  } catch (e) {
    console.log("Local build check failed:", e);
  }

  const pkgName = `@frixaco/letui-${platform}-${arch}`;
  console.log("Falling back to package:", pkgName);
  return Bun.resolveSync(`${pkgName}/${filename}`, import.meta.dir);
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

  paint: {
    args: ["pointer", "u32", "pointer", "u32"],
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
