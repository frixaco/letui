use std::os::raw::c_int;

static mut BUFFER: Option<Vec<u64>> = None;

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer(len: u64) -> c_int {
    unsafe {
        BUFFER = Some(vec![0u64; len as usize]);
    }
    1
}

#[repr(C)]
pub struct Buffer {
    ptr: *const u64, // cuz ptr types are already FFI-safe
    len: u64,
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer(ptr: *mut *const u64, len: *mut u64) -> c_int {
    unsafe {
        match BUFFER {
            Some(ref buf) => {
                *ptr = buf.as_ptr();
                *len = buf.len() as u64;
                1
            }
            None => 0,
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer() -> c_int {
    unsafe {
        BUFFER = None;
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn debug_buffer(idx: u64) -> u64 {
    unsafe {
        if let Some(ref buf) = BUFFER {
            if buf.len() < idx as usize {
                return 0;
            }
            println!("{}", buf[idx as usize]);
            return buf[idx as usize];
        } else {
            0
        }
    }
}
