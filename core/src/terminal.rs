//! Terminal lifecycle and flush routines exposed over the Rust FFI boundary.

use crate::shared::{
    CONTINUATION_CELL, CURRENT_BUFFER, FIELDS_PER_CELL, FIRST_DIFF, HITMAP, LAST_BUFFER,
    RESET_COLOR, TERMINAL_SIZE, TEXT_ATTR_ALL, TEXT_ATTR_BOLD, TEXT_ATTR_ITALIC,
    TEXT_ATTR_UNDERLINE,
};
use crossterm::{
    cursor::{Hide, MoveTo, Show},
    event::{DisableMouseCapture, EnableMouseCapture},
    execute, queue,
    style::{Attribute, Color, Print, SetAttribute, SetBackgroundColor, SetForegroundColor},
    terminal::{
        BeginSynchronizedUpdate, Clear, ClearType, EndSynchronizedUpdate, EnterAlternateScreen,
        LeaveAlternateScreen, disable_raw_mode, enable_raw_mode, size,
    },
};
use std::{
    io::{Stdout, Write, stdout},
    os::raw::c_int,
};

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    let buffer_size = (w as usize) * (h as usize) * FIELDS_PER_CELL;

    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = (w, h);

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(vec![0u64; buffer_size]);
    let mut lb = LAST_BUFFER.lock().unwrap();
    *lb = Some(vec![0u64; buffer_size]);
    let mut hitmap = HITMAP.lock().unwrap();
    *hitmap = Some(vec![0u32; (w as usize) * (h as usize)]);

    1
}

#[unsafe(no_mangle)]
pub extern "C" fn init_letui() -> c_int {
    if enable_raw_mode().is_err() {
        return 0;
    }

    if execute!(
        stdout(),
        EnterAlternateScreen,
        EnableMouseCapture,
        Clear(ClearType::All),
        Hide
    )
    .is_err()
    {
        let _ = disable_raw_mode();
        return 0;
    }

    1
}

#[unsafe(no_mangle)]
pub extern "C" fn deinit_letui() -> c_int {
    let _ = disable_raw_mode();

    if execute!(
        stdout(),
        EndSynchronizedUpdate,
        Show,
        DisableMouseCapture,
        SetAttribute(Attribute::Reset),
        SetBackgroundColor(Color::Reset),
        SetForegroundColor(Color::Reset),
        LeaveAlternateScreen
    )
    .is_err()
    {
        return 0;
    }

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
    let term_size = TERMINAL_SIZE.lock().unwrap();
    let (w, h) = *term_size;
    let mut stdout = stdout();

    let Some(ref buf) = *cb else {
        return 1;
    };
    let Some(ref mut last_buf) = *lb else {
        return 1;
    };

    queue!(stdout, BeginSynchronizedUpdate).unwrap();

    let mut first_diff = FIRST_DIFF.lock().unwrap();

    if *first_diff {
        first_flush(w, h, &mut stdout, buf);
        *first_diff = false;
    } else {
        next_flush(w, h, &mut stdout, buf, last_buf);
    }
    queue!(stdout, EndSynchronizedUpdate).unwrap();
    stdout.flush().unwrap();

    last_buf.copy_from_slice(buf);

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
    *HITMAP.lock().unwrap() = None;
    *FIRST_DIFF.lock().unwrap() = true;

    execute!(
        stdout(),
        SetAttribute(Attribute::Reset),
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
        buf[idx as usize]
    } else {
        0
    }
}

fn first_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64]) {
    if w == 0 || h == 0 {
        return;
    }

    let mut char_seq = String::with_capacity(w as usize);

    for y in 0..h {
        let row_start = (w * y) as usize * FIELDS_PER_CELL;
        let first_idx = row_start;
        let mut prev_fg = buf[first_idx + 1];
        let mut prev_bg = buf[first_idx + 2];
        let mut prev_attrs = buf[first_idx + 3] as u8;
        char_seq.clear();
        queue!(
            stdout,
            MoveTo(0, y),
            SetAttribute(Attribute::Reset),
            SetForegroundColor(terminal_color(prev_fg)),
            SetBackgroundColor(terminal_color(prev_bg))
        )
        .unwrap();

        queue_text_attr_update(stdout, 0, prev_attrs);

        for x in 0..w {
            let idx = row_start + x as usize * FIELDS_PER_CELL;
            let curr_char = char::from_u32(buf[idx] as u32).unwrap();
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];
            let curr_attrs = buf[idx + 3] as u8;

            if curr_fg == prev_fg && curr_bg == prev_bg && curr_attrs == prev_attrs {
                push_render_char(&mut char_seq, curr_char);
                continue;
            }

            if !char_seq.is_empty() {
                queue!(stdout, Print(&char_seq)).unwrap();
            }

            queue_color_update(stdout, (prev_fg, prev_bg), (curr_fg, curr_bg));
            queue_text_attr_update(stdout, prev_attrs, curr_attrs);

            prev_fg = curr_fg;
            prev_bg = curr_bg;
            prev_attrs = curr_attrs;

            char_seq.clear();
            push_render_char(&mut char_seq, curr_char);
        }
        queue!(stdout, Print(&char_seq)).unwrap();
    }
}

fn next_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64], last_buf: &[u64]) {
    let mut prev_fg = u64::MAX;
    let mut prev_bg = u64::MAX;
    let mut prev_attrs = 0u8;

    queue!(stdout, SetAttribute(Attribute::Reset)).unwrap();

    for y in 0..h {
        let mut char_seq = String::with_capacity(w as usize);
        let mut batch_start_x = 0;
        // Track terminal cells, not UTF-8 byte length. `String::len()` breaks adjacency
        // for multibyte glyphs (e.g. box-drawing chars), causing unnecessary batch splits.
        let mut batch_cells = 0u16;

        for x in 0..w {
            let idx = (w * y + x) as usize * FIELDS_PER_CELL;
            let curr_code = buf[idx];
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];
            let curr_attrs = buf[idx + 3] as u8;

            if buf[idx] == last_buf[idx]
                && buf[idx + 1] == last_buf[idx + 1]
                && buf[idx + 2] == last_buf[idx + 2]
                && buf[idx + 3] == last_buf[idx + 3]
            {
                continue;
            }

            let curr_char = char::from_u32(curr_code as u32).unwrap();

            if !char_seq.is_empty() && x != batch_start_x + batch_cells {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
                char_seq.clear();
                batch_cells = 0;
                batch_start_x = x;
            }

            if curr_fg == prev_fg && curr_bg == prev_bg && curr_attrs == prev_attrs {
                if char_seq.is_empty() {
                    batch_start_x = x;
                }
                push_render_char(&mut char_seq, curr_char);
                batch_cells = batch_cells.saturating_add(1);
                continue;
            }

            if !char_seq.is_empty() {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
            }

            queue_color_update(stdout, (prev_fg, prev_bg), (curr_fg, curr_bg));
            queue_text_attr_update(stdout, prev_attrs, curr_attrs);

            prev_fg = curr_fg;
            prev_bg = curr_bg;
            prev_attrs = curr_attrs;

            char_seq.clear();
            push_render_char(&mut char_seq, curr_char);
            batch_start_x = x;
            batch_cells = 1;
        }
        if !char_seq.is_empty() {
            queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
        }
    }
}

fn rgb_to_color(hex: u64) -> Color {
    Color::Rgb {
        r: ((hex >> 16) & 0xFF) as u8,
        g: ((hex >> 8) & 0xFF) as u8,
        b: (hex & 0xFF) as u8,
    }
}

fn terminal_color(hex: u64) -> Color {
    if hex == u64::from(RESET_COLOR) {
        Color::Reset
    } else {
        rgb_to_color(hex)
    }
}

fn queue_color_update(
    stdout: &mut Stdout,
    (previous_fg, previous_bg): (u64, u64),
    (current_fg, current_bg): (u64, u64),
) {
    let fg_changed = current_fg != previous_fg;
    let bg_changed = current_bg != previous_bg;

    match (fg_changed, bg_changed) {
        (true, true) => {
            queue!(
                stdout,
                SetForegroundColor(terminal_color(current_fg)),
                SetBackgroundColor(terminal_color(current_bg))
            )
            .unwrap();
        }
        (true, false) => {
            queue!(stdout, SetForegroundColor(terminal_color(current_fg))).unwrap();
        }
        (false, true) => {
            queue!(stdout, SetBackgroundColor(terminal_color(current_bg))).unwrap();
        }
        (false, false) => {}
    }
}

fn queue_text_attr_update(stdout: &mut Stdout, previous: u8, current: u8) {
    // Terminal attrs are sticky state. Diff the previous/current bitfields and emit
    // only the ANSI toggles needed to reach the next style.
    let previous = previous & TEXT_ATTR_ALL;
    let current = current & TEXT_ATTR_ALL;

    if previous == current {
        return;
    }

    if (previous & TEXT_ATTR_BOLD) != 0 && (current & TEXT_ATTR_BOLD) == 0 {
        queue!(stdout, SetAttribute(Attribute::NormalIntensity)).unwrap();
    }
    if (previous & TEXT_ATTR_ITALIC) != 0 && (current & TEXT_ATTR_ITALIC) == 0 {
        queue!(stdout, SetAttribute(Attribute::NoItalic)).unwrap();
    }
    if (previous & TEXT_ATTR_UNDERLINE) != 0 && (current & TEXT_ATTR_UNDERLINE) == 0 {
        queue!(stdout, SetAttribute(Attribute::NoUnderline)).unwrap();
    }

    if (previous & TEXT_ATTR_BOLD) == 0 && (current & TEXT_ATTR_BOLD) != 0 {
        queue!(stdout, SetAttribute(Attribute::Bold)).unwrap();
    }
    if (previous & TEXT_ATTR_ITALIC) == 0 && (current & TEXT_ATTR_ITALIC) != 0 {
        queue!(stdout, SetAttribute(Attribute::Italic)).unwrap();
    }
    if (previous & TEXT_ATTR_UNDERLINE) == 0 && (current & TEXT_ATTR_UNDERLINE) != 0 {
        queue!(stdout, SetAttribute(Attribute::Underlined)).unwrap();
    }
}

fn push_render_char(char_seq: &mut String, ch: char) {
    if ch != CONTINUATION_CELL {
        char_seq.push(ch);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_color_maps_to_terminal_reset() {
        assert_eq!(terminal_color(u64::from(RESET_COLOR)), Color::Reset);
    }

    #[test]
    fn explicit_black_color_stays_rgb_black() {
        assert_eq!(terminal_color(0), Color::Rgb { r: 0, g: 0, b: 0 });
    }
}
