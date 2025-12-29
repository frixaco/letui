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
        BeginSynchronizedUpdate, Clear, ClearType, EndSynchronizedUpdate, EnterAlternateScreen,
        LeaveAlternateScreen, enable_raw_mode, size,
    },
};
use std::{
    io::{Stdout, Write, stdout},
    os::raw::c_int,
    slice,
    sync::Mutex,
};
use taffy::{Overflow, Point, prelude::*};

static LAST_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));
static FRAMES: Mutex<Option<Vec<f32>>> = Mutex::new(None);
static FIRST_DIFF: Mutex<bool> = Mutex::new(true);

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    let buffer_size = (w as usize) * (h as usize) * 3;

    let mut term_size = TERMINAL_SIZE.lock().unwrap();
    *term_size = (w, h);

    let mut cb = CURRENT_BUFFER.lock().unwrap();
    *cb = Some(vec![0u64; buffer_size]);
    let mut lb = LAST_BUFFER.lock().unwrap();
    *lb = Some(vec![0u64; buffer_size]);

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

fn hex_to_color(hex: u64) -> Color {
    Color::Rgb {
        r: ((hex >> 16) & 0xFF) as u8,
        g: ((hex >> 8) & 0xFF) as u8,
        b: (hex & 0xFf) as u8,
    }
}

fn first_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64]) {
    let mut char_seq = String::with_capacity(w as usize);

    for y in 0..h {
        queue!(stdout, MoveTo(0, y)).unwrap();

        let first_idx = (w * y) as usize * 3;
        let mut prev_fg = buf[first_idx + 1];
        let mut prev_bg = buf[first_idx + 2];
        char_seq.clear();
        queue!(
            stdout,
            SetForegroundColor(hex_to_color(prev_fg)),
            SetBackgroundColor(hex_to_color(prev_bg))
        )
        .unwrap();

        for x in 0..w {
            let idx = (w * y + x) as usize * 3;
            let curr_char = char::from_u32(buf[idx] as u32).unwrap();
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];

            if curr_fg == prev_fg && curr_bg == prev_bg {
                char_seq.push(curr_char);
                continue;
            }
            queue!(stdout, Print(&char_seq)).unwrap();
            if curr_fg != prev_fg {
                let fg_code = hex_to_color(curr_fg);
                queue!(stdout, SetForegroundColor(fg_code)).unwrap();
                prev_fg = curr_fg;
            }
            if curr_bg != prev_bg {
                let bg_code = hex_to_color(curr_bg);
                queue!(stdout, SetBackgroundColor(bg_code)).unwrap();
                prev_bg = curr_bg;
            }
            char_seq.clear();
            char_seq.push(curr_char);
        }
        queue!(stdout, Print(&char_seq)).unwrap();
    }
}

fn next_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64], last_buf: &[u64]) {
    let mut prev_fg = u64::MAX;
    let mut prev_bg = u64::MAX;

    for y in 0..h {
        let mut char_seq = String::with_capacity(w as usize);
        let mut batch_start_x = 0;

        for x in 0..w {
            let idx = (w * y + x) as usize * 3;
            let curr_char = char::from_u32(buf[idx] as u32).unwrap();
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];

            if buf[idx] == last_buf[idx]
                && buf[idx + 1] == last_buf[idx + 1]
                && buf[idx + 2] == last_buf[idx + 2]
            {
                continue;
            }

            if !char_seq.is_empty() && x != batch_start_x + char_seq.len() as u16 {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
                char_seq.clear();
                batch_start_x = x;
            }

            if curr_fg == prev_fg && curr_bg == prev_bg {
                if char_seq.is_empty() {
                    batch_start_x = x;
                }
                char_seq.push(curr_char);
                continue;
            }
            if curr_fg != prev_fg || curr_bg != prev_bg {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
                char_seq.clear();
                char_seq.push(curr_char);
                batch_start_x = x;

                if curr_fg != prev_fg {
                    queue!(stdout, SetForegroundColor(hex_to_color(curr_fg))).unwrap();
                    prev_fg = curr_fg;
                }

                if curr_bg != prev_bg {
                    queue!(stdout, SetBackgroundColor(hex_to_color(curr_bg))).unwrap();
                    prev_bg = curr_bg;
                }
            }
        }
        queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
    }
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

#[derive(Debug, Clone, Copy, PartialEq)]
enum NodeType {
    Row = 1,
    Column = 2,
    Button = 3,
    Input = 4,
    Text = 5,
}

impl NodeType {
    fn from_f32(v: f32) -> Self {
        match v as u32 {
            1 => NodeType::Row,
            2 => NodeType::Column,
            3 => NodeType::Button,
            4 => NodeType::Input,
            5 => NodeType::Text,
            _ => NodeType::Column,
        }
    }
}

#[derive(Debug)]
struct Node {
    node_type: NodeType,
    gap: f32,
    padding_x: f32,
    padding_y: f32,
    border: f32,
    text: String,
    children: Vec<Node>,
}

const FIELDS_PER_NODE: usize = 7;

fn parse_node(
    node_data: &[f32],
    node_offset: &mut usize,
    text_data: &[u8],
    text_offset: &mut usize,
) -> Node {
    let base = *node_offset;
    let node_type = NodeType::from_f32(node_data[base]);
    let gap = node_data[base + 1];
    let padding_x = node_data[base + 2];
    let padding_y = node_data[base + 3];
    let border = node_data[base + 4];
    let child_count = node_data[base + 5] as usize;
    let text_len = node_data[base + 6] as usize;

    *node_offset += FIELDS_PER_NODE;

    let text = if text_len > 0 {
        let s = std::str::from_utf8(&text_data[*text_offset..*text_offset + text_len])
            .unwrap_or("")
            .to_string();
        *text_offset += text_len;
        s
    } else {
        String::new()
    };

    let mut children = Vec::with_capacity(child_count);
    for _ in 0..child_count {
        children.push(parse_node(node_data, node_offset, text_data, text_offset));
    }

    Node {
        node_type,
        gap,
        padding_x,
        padding_y,
        border,
        text,
        children,
    }
}

fn get_styles(node: &Node) -> Style {
    let mut style = Style {
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
    };

    match node.node_type {
        NodeType::Column => {
            style.flex_direction = FlexDirection::Column;
            style.align_items = Some(AlignItems::Stretch);
            style.flex_grow = 1.0;
            style.overflow = Point {
                x: Overflow::Hidden,
                y: Overflow::Hidden,
            };
        }
        NodeType::Row => {
            style.flex_direction = FlexDirection::Row;
        }
        NodeType::Input => {
            style.flex_direction = FlexDirection::Row;
            style.flex_grow = 1.0;
        }
        _ => {}
    }

    style
}

fn node_type_to_context(node: &Node) -> NodeContext {
    match node.node_type {
        NodeType::Column => NodeContext::Column,
        NodeType::Row => NodeContext::Row,
        NodeType::Text => NodeContext::Text(node.text.clone()),
        NodeType::Button => NodeContext::Button(node.text.clone()),
        NodeType::Input => NodeContext::InputBox(node.text.clone()),
    }
}

fn build_taffy_tree(taffy: &mut TaffyTree<NodeContext>, taffy_root: &NodeId, tree_node: &Node) {
    for child in &tree_node.children {
        let child_styles = get_styles(child);
        let context = node_type_to_context(child);

        let taffy_child = taffy.new_leaf_with_context(child_styles, context).unwrap();
        taffy.add_child(*taffy_root, taffy_child).unwrap();

        build_taffy_tree(taffy, &taffy_child, child);
    }
}

fn build_frames_array(
    taffy: &mut TaffyTree<NodeContext>,
    node: NodeId,
    out: &mut Vec<f32>,
    offset_x: f32,
    offset_y: f32,
) -> () {
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
        build_frames_array(taffy, child, out, absolute_x, absolute_y);
    }
}

enum NodeContext {
    Text(String),
    Button(String),
    Row,
    Column,
    InputBox(String),
}

fn measure_function(
    known_dimensions: Size<Option<f32>>,
    available_space: Size<AvailableSpace>,
    _node_id: NodeId,
    node_context: Option<&mut NodeContext>,
    _style: &Style,
) -> Size<f32> {
    if let Size {
        width: Some(width),
        height: Some(height),
    } = known_dimensions
    {
        return Size { width, height };
    }

    match node_context {
        Some(NodeContext::Text(text))
        | Some(NodeContext::Button(text))
        | Some(NodeContext::InputBox(text)) => {
            let text_width = text.chars().count() as f32;

            let max_width = match available_space.width {
                AvailableSpace::Definite(w) => w,
                _ => text_width,
            };

            if text_width <= max_width {
                return Size {
                    width: text_width,
                    height: 1.0,
                };
            }

            let words: Vec<&str> = text.split_whitespace().collect();
            let mut lines = 1;
            let mut current_width: f32 = 0.0;
            let mut max_line_width: f32 = 0.0;

            for word in words {
                let word_width = word.chars().count() as f32;
                let needed_width = if current_width == 0.0 {
                    word_width
                } else {
                    current_width + 1.0 + word_width
                };

                if needed_width > max_width {
                    lines += 1;
                    max_line_width = max_line_width.max(current_width);
                    current_width = word_width;
                } else {
                    current_width = needed_width;
                }
            }

            Size {
                width: max_line_width.max(max_width),
                height: lines as f32,
            }
        }
        Some(NodeContext::Column) | Some(NodeContext::Row) => Size::ZERO,
        _ => Size::ZERO,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn calculate_layout(
    pn: *const f32,
    ln: u32,
    pt: *const u8,
    lt: u32,
    width: f32,
    height: f32,
) -> c_int {
    let node_data = unsafe { slice::from_raw_parts(pn, ln as usize) };
    let text_data = unsafe { slice::from_raw_parts(pt, lt as usize) };

    let mut node_offset = 0usize;
    let mut text_offset = 0usize;
    let root_node = parse_node(node_data, &mut node_offset, text_data, &mut text_offset);

    let mut taffy: TaffyTree<NodeContext> = TaffyTree::new();

    let mut root_styles = get_styles(&root_node);
    root_styles.size = Size {
        width: length(width),
        height: length(height),
    };

    let context = node_type_to_context(&root_node);
    let root = taffy.new_leaf_with_context(root_styles, context).unwrap();

    build_taffy_tree(&mut taffy, &root, &root_node);

    let _ = taffy.compute_layout_with_measure(
        root,
        Size {
            width: length(width),
            height: length(height),
        },
        |known_dimensions, available_space, node_id, node_context, style| {
            measure_function(
                known_dimensions,
                available_space,
                node_id,
                node_context,
                style,
            )
        },
    );

    let mut frame_lock = FRAMES.lock().unwrap();
    let frames_vec = frame_lock.get_or_insert_with(Vec::new);
    frames_vec.clear();

    build_frames_array(&mut taffy, root, frames_vec, 0.0, 0.0);

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
