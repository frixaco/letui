import { dlopen, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const filename = `${prefix}letui_ffi.${suffix}`;

function getLibraryPath(): string {
  const { platform, arch } = process;

  const localPath = new URL(
    `./letui-ffi/target/release/${filename}`,
    import.meta.url,
  ).pathname;

  try {
    if (Bun.file(localPath).size > 0) {
      return localPath;
    }
  } catch {
    // Local build doesn't exist, continue to package lookup
  }

  const pkgName = `@frixaco/letui-${platform}-${arch}`;
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
