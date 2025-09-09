use std::os::raw::{c_int, c_ulong};

static mut BUFFER: Option<Vec<u64>> = None;

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer(len: c_ulong) -> c_int {
    unsafe {
        BUFFER = Some(vec![0u64; len as usize]);
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer(ptr_out: *mut *const u64, len_out: *mut c_ulong) -> c_int {
    unsafe {
        if let Some(ref buf) = BUFFER {
            *ptr_out = buf.as_ptr();
            *len_out = buf.len() as c_ulong;
            return 1;
        }
    }
    0
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer() -> c_int {
    unsafe {
        BUFFER = None;
    }
    1
}
