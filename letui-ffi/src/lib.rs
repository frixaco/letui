use crossterm::{
    cursor::{Hide, MoveTo},
    execute, queue,
    style::{Color, Print, SetBackgroundColor, SetForegroundColor},
    terminal::{
        Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen, enable_raw_mode, size,
    },
};
use std::{
    io::{Write, stdout},
    os::raw::c_int,
};

static mut LAST_BUFFER: Option<Vec<u64>> = None;
static mut CURRENT_BUFFER: Option<Vec<u64>> = None;

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    unsafe {
        CURRENT_BUFFER = Some(vec![0u64; (w * h * 3) as usize]);
        if let Some(ref buf) = CURRENT_BUFFER {
            LAST_BUFFER = Some(buf.clone());
        }
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn init_letui() -> c_int {
    execute!(stdout(), EnterAlternateScreen, Clear(ClearType::All), Hide).unwrap();
    // stdout().flush().unwrap();
    enable_raw_mode().unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn deinit_letui() -> c_int {
    execute!(stdout(), LeaveAlternateScreen).unwrap();
    // disable_raw_mode();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_size(w: *mut u16, h: *mut u16) -> c_int {
    unsafe {
        (*w, *h) = size().unwrap();
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn render() -> c_int {
    unsafe {
        match CURRENT_BUFFER {
            Some(ref buf) => match LAST_BUFFER {
                Some(ref last_buf) => {
                    let mut stdout = stdout();
                    let (w, _h) = size().unwrap();

                    for (cell_idx, (new, old)) in buf
                        .chunks_exact(3)
                        .zip(last_buf.chunks_exact(3))
                        .enumerate()
                    {
                        if new != old {
                            let codepoint_code = char::from_u32(new[0] as u32).unwrap();
                            let fg = new[1];
                            let fg_code = Color::Rgb {
                                r: ((fg >> 16) & 0xFF) as u8,
                                g: ((fg >> 8) & 0xFF) as u8,
                                b: (fg & 0xFf) as u8,
                            };
                            let bg = new[2];
                            let bg_code = Color::Rgb {
                                r: ((bg >> 16) & 0xFF) as u8,
                                g: ((bg >> 8) & 0xFF) as u8,
                                b: (bg & 0xFf) as u8,
                            };

                            let x = cell_idx % w as usize;
                            let y = cell_idx / w as usize;

                            queue!(
                                stdout,
                                MoveTo(x as u16, y as u16),
                                SetForegroundColor(fg_code),
                                SetBackgroundColor(bg_code),
                                Print(codepoint_code)
                            )
                            .unwrap();
                        }
                    }
                    stdout.flush().unwrap();
                    if let Some(ref buf) = CURRENT_BUFFER {
                        LAST_BUFFER = Some(buf.clone());
                    }
                }
                None => (),
            },
            None => (),
        }
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer(ptr: *mut *const u64, len: *mut u64) -> c_int {
    unsafe {
        match CURRENT_BUFFER {
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
        CURRENT_BUFFER = None;
        LAST_BUFFER = None;
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn debug_buffer(idx: u64) -> u64 {
    unsafe {
        if let Some(ref buf) = CURRENT_BUFFER {
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
