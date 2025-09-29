/*
* Rust backend for my TUI library
* that exposes core methods to be calling in TypeScript using Bun's FFI module
*/

use crossterm::{
    cursor::{Hide, MoveTo},
    event::EnableMouseCapture,
    execute, queue,
    style::{Color, Print, SetBackgroundColor, SetForegroundColor},
    terminal::{
        Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen, enable_raw_mode, size,
    },
};
use std::{
    io::{Write, stdout},
    os::raw::c_int,
    sync::Mutex,
};

static MAX_BUFFER_SIZE: usize = 2_000_000;
static LAST_BUFFER: Mutex<Option<Box<[u64; MAX_BUFFER_SIZE]>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Box<[u64; MAX_BUFFER_SIZE]>>> = Mutex::new(None);
static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();

    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = (w, h);

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(Box::new([0u64; MAX_BUFFER_SIZE]));
    let mut lb = LAST_BUFFER.lock().unwrap();

    if let Some(ref buf) = *cb {
        *lb = Some(buf.clone());
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn init_letui() -> c_int {
    execute!(
        stdout(),
        EnterAlternateScreen,
        EnableMouseCapture,
        Clear(ClearType::All),
        Hide
    )
    .unwrap();
    enable_raw_mode().unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn deinit_letui() -> c_int {
    execute!(stdout(), LeaveAlternateScreen).unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_width() -> u16 {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    term_size.0
}

#[unsafe(no_mangle)]
pub extern "C" fn get_height() -> u16 {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    term_size.1
}

#[unsafe(no_mangle)]
pub extern "C" fn flush() -> c_int {
    let cb = CURRENT_BUFFER.lock().unwrap();
    let mut lb = LAST_BUFFER.lock().unwrap();
    match *cb {
        Some(ref buf) => match *lb {
            Some(ref last_buf) => {
                let mut stdout = stdout();
                let term_size = TERMINAL_SIZE.lock().unwrap();
                let (w, h) = *term_size;
                let used_cells = (w as usize) * (h as usize);

                for (cell_idx, (new, old)) in buf[0..used_cells * 3]
                    .chunks_exact(3)
                    .zip(last_buf[0..used_cells * 3].chunks_exact(3))
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
                if let Some(ref buf) = *cb {
                    *lb = Some(buf.clone());
                }
            }
            None => (),
        },
        None => (),
    }
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer_ptr() -> *mut u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    match *cb {
        Some(ref buf) => buf.as_ptr() as *mut u64,
        None => std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_buffer_len() -> u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    match *cb {
        Some(ref buf) => buf.len() as u64,
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn free_buffer() -> c_int {
    *CURRENT_BUFFER.lock().unwrap() = None;
    *LAST_BUFFER.lock().unwrap() = None;

    execute!(
        stdout(),
        SetBackgroundColor(Color::Reset),
        SetForegroundColor(Color::Reset),
        Clear(ClearType::All)
    )
    .unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn update_terminal_size() -> c_int {
    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = size().unwrap();
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn debug_buffer(idx: u64) -> u64 {
    let cb = CURRENT_BUFFER.lock().unwrap();
    if let Some(ref buf) = *cb {
        if buf.len() < idx as usize {
            return 0;
        }
        println!("{}", buf[idx as usize]);
        return buf[idx as usize];
    } else {
        0
    }
}

// fn print_events() -> io::Result<bool> {
//     loop {
//         if poll(Duration::from_millis(100))? {
//             // It's guaranteed that `read` won't block, because `poll` returned
//             // `Ok(true)`.
//             println!("{:?}", read()?);
//         } else {
//             // Timeout expired, no `Event` is available
//         }
//     }
// }
