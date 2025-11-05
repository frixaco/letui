import { dlopen, FFIType, suffix } from "bun:ffi";

const prefix = process.platform === "win32" ? "" : "lib";
const path = `./letui-ffi/target/release/${prefix}letui_ffi.${suffix}`;

const { symbols: api } = dlopen(path, {
  init_letui: {
    args: [],
    returns: FFIType.i32,
  },
  deinit_letui: {
    args: [],
    returns: FFIType.i32,
  },
  init_buffer: {
    args: [],
    returns: FFIType.i32,
  },
  get_buffer_ptr: {
    args: [],
    returns: FFIType.pointer,
  },
  get_buffer_len: {
    args: [],
    returns: FFIType.u64,
  },
  get_width: {
    args: [],
    returns: FFIType.u16,
  },
  get_height: {
    args: [],
    returns: FFIType.u16,
  },
  free_buffer: {
    args: [],
    returns: FFIType.i32,
  },
  debug_buffer: {
    args: [FFIType.u64],
    returns: FFIType.u64,
  },
  flush: {
    args: [],
    returns: FFIType.i32,
  },
  update_terminal_size: {
    args: [],
    returns: FFIType.i32,
  },
});

export default api;
