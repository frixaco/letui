import { dlopen, FFIType, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const path = `./letui-ffi/target/release/${prefix}letui_ffi.${suffix}`;

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
    args: ["pointer", "u64"],
    returns: "pointer",
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
