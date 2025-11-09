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
use serde::Deserialize;
use std::{
    io::{Write, stdout},
    os::raw::c_int,
    slice,
    sync::Mutex,
};
use taffy::prelude::*;

static MAX_BUFFER_SIZE: usize = 2_000_000;
static LAST_BUFFER: Mutex<Option<Box<[u64; MAX_BUFFER_SIZE]>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Box<[u64; MAX_BUFFER_SIZE]>>> = Mutex::new(None);
static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));
static FRAMES: Mutex<Option<Vec<f32>>> = Mutex::new(None);

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

#[derive(Deserialize, Debug)]
struct Node {
    #[serde(rename = "type")]
    node_type: String,
    gap: f32,
    #[serde(rename = "paddingX")]
    padding_x: f32,
    #[serde(rename = "paddingY")]
    padding_y: f32,
    border: f32,
    text: String,
    children: Vec<Node>,
}

#[derive(Deserialize, Debug)]
struct Tree {
    node: Node,
    width: f32,
    height: f32,
}

fn get_styles(node: &Node) -> Style {
    Style {
        gap: Size {
            width: length(node.gap),
            height: zero(),
        },
        padding: Rect {
            left: length(node.padding_x),
            right: length(node.padding_x),
            top: length(node.padding_y),
            bottom: length(node.padding_y),
        },
        border: Rect {
            left: length(node.border),
            right: length(node.border),
            top: length(node.border),
            bottom: length(node.border),
        },
        ..Default::default()
    }
}

fn build_taffy_tree(taffy: &mut TaffyTree<()>, taffy_root: &NodeId, tree_node: &Node) {
    for child in &tree_node.children {
        let mut child_styles = get_styles(child);

        let flex_direction: Option<FlexDirection> = match child.node_type.as_str() {
            "column" => Some(FlexDirection::Column),
            "row" => Some(FlexDirection::Row),
            _ => None,
        };
        if let Some(fd) = flex_direction {
            child_styles.flex_direction = fd;
        };

        let taffy_child = taffy.new_leaf(child_styles).unwrap();
        taffy.add_child(*taffy_root, taffy_child).unwrap();

        build_taffy_tree(taffy, &taffy_child, child);
    }
}

fn build_frames_array(
    taffy: &mut TaffyTree<()>,
    node: NodeId,
    out: &mut Vec<f32>,
    offset_x: f32,
    offset_y: f32,
) -> taffy::TaffyResult<()> {
    let layout = taffy.layout(node).unwrap();

    let absolute_x = offset_x + layout.location.x;
    let absolute_y = offset_y + layout.location.y;

    out.extend([
        absolute_x,
        absolute_y,
        layout.size.width,
        layout.size.height,
    ]);

    let children = taffy.children(node).unwrap();
    for child in children {
        build_frames_array(taffy, child, out, absolute_x, absolute_y)?;
    }

    Ok(())
}

#[unsafe(no_mangle)]
pub extern "C" fn calculate_layout(p: *const u8, l: u32) -> c_int {
    let json_bytes = unsafe { slice::from_raw_parts(p, l as usize) };
    let tree = serde_json::from_slice::<Tree>(json_bytes).unwrap();

    let mut taffy: TaffyTree<()> = TaffyTree::new();

    let node = &tree.node;

    let flex_direction: Option<FlexDirection> = match node.node_type.as_str() {
        "column" => Some(FlexDirection::Column),
        "row" => Some(FlexDirection::Row),
        _ => None,
    };

    let mut root_styles = get_styles(node);
    if let Some(fd) = flex_direction {
        root_styles.flex_direction = fd;
    };
    let root = taffy.new_leaf(root_styles).unwrap();

    build_taffy_tree(&mut taffy, &root, &tree.node);

    let _ = taffy.compute_layout(
        root,
        Size {
            width: length(tree.width),
            height: length(tree.height),
        },
    );
    // taffy.print_tree(root);

    let mut frames: Vec<f32> = Vec::new();

    build_frames_array(&mut taffy, root, &mut frames, 0.0, 0.0).unwrap();

    *FRAMES.lock().unwrap() = Some(frames);
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_ptr() -> *const f32 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.as_ptr(),
        None => std::ptr::null(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn get_frames_len() -> u64 {
    let frames = FRAMES.lock().unwrap();
    match *frames {
        Some(ref vec) => vec.len() as u64,
        None => 0,
    }
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
