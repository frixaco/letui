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
        BeginSynchronizedUpdate, Clear, ClearType, EndSynchronizedUpdate, EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode, size
    },
};
use std::{
    io::{Stdout, Write, stdout},
    os::raw::c_int,
    slice,
    sync::Mutex,
};
use taffy::{Overflow, Point, prelude::*};

mod colors;

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
    disable_raw_mode().unwrap();
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
    *FIRST_DIFF.lock().unwrap() = true;

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

#[derive(Debug, Clone, Copy, PartialEq)]
enum BorderStyle {
    None = 0,
    Rounded = 1,
    Squared = 2,
}

impl BorderStyle {
    fn from_f32(v: f32) -> Self {
        match v as u32 {
            1 => BorderStyle::Rounded,
            2 => BorderStyle::Squared,
            _ => BorderStyle::None,
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
    flex_grow: f32,
    text: String,
    children: Vec<Node>,
    bg: u32,
    fg: u32,
    border_color: u32,
    border_style: BorderStyle,
    node_id: u32,
    // TODO: want u32, see TODO below
    text_len: usize,
}

const FIELDS_PER_NODE: usize = 13;

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
    let bg = node_data[base + 6] as u32;
    let fg = node_data[base + 7] as u32;
    let border_color = node_data[base + 8] as u32;
    let border_style = BorderStyle::from_f32(node_data[base + 9]);
    let node_id = node_data[base + 10] as u32;
    // TODO: I need this to be u32, not usize
    let text_len = node_data[base + 11] as usize;
    let flex_grow = node_data[base + 12];

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
        flex_grow,
        text,
        children,
        bg,
        fg,
        border_color,
        border_style,
        node_id,
        text_len,
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
        flex_grow: node.flex_grow,
        ..Default::default()
    };

    match node.node_type {
        NodeType::Column => {
            style.flex_direction = FlexDirection::Column;
            style.align_items = Some(AlignItems::Stretch);
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
            if node.flex_grow == 0.0 {
                style.flex_grow = 1.0;
            }
        }
        _ => {}
    }

    style
}

fn node_type_to_context(node: &Node) -> NodeContext {
    match node.node_type {
        NodeType::Column => NodeContext::Column {
            bg: node.bg,
            fg: node.fg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Row => NodeContext::Row {
            bg: node.bg,
            fg: node.fg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Text => NodeContext::Text {
            content: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
        },
        NodeType::Button => NodeContext::Button {
            label: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
        NodeType::Input => NodeContext::Input {
            content: node.text.clone(),
            fg: node.fg,
            bg: node.bg,
            border_color: node.border_color,
            border_style: node.border_style,
        },
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
    Text {
        content: String,
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,
        fg: u32,
        bg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Input {
        content: String,
        fg: u32,
        bg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Row {
        bg: u32,
        fg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
    Column {
        bg: u32,
        fg: u32,
        border_color: u32,
        border_style: BorderStyle,
    },
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

    let text = match node_context {
        Some(NodeContext::Text { content, .. }) => content.as_str(),
        Some(NodeContext::Button { label, .. }) => label.as_str(),
        Some(NodeContext::Input { content, .. }) => content.as_str(),
        Some(NodeContext::Row { .. }) | Some(NodeContext::Column { .. }) => return Size::ZERO,
        None => return Size::ZERO,
    };

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

fn draw_background_at(buf: &mut [u64], x: f32, y: f32, w: f32, h: f32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = (x + w).min(tw as f32) as u16;
    let y_end = (y + h).min(th as f32) as u16;

    for row in y_start..y_end {
        for col in x_start..x_end {
            let idx = (tw * row + col) as usize * 3;
            if idx + 2 < buf.len() {
                buf[idx] = ' ' as u64;
                buf[idx + 2] = bg as u64;
            }
        }
    }
}

fn draw_text_at(buf: &mut [u64], x: f32, y: f32, text: &str, fg: u32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_row = y as u16;

    if y_row >= th {
        return;
    }

    for (i, ch) in text.chars().enumerate() {
        let col = x_start + i as u16;
        if col >= tw {
            break;
        }
        let idx = (tw * y_row + col) as usize * 3;
        buf[idx] = ch as u64;
        buf[idx + 1] = fg as u64;
        buf[idx + 2] = bg as u64;
    }
}

fn draw_border_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    color: u32,
    bg: u32,
    style: BorderStyle,
    tw: u16,
    th: u16,
) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = ((x + w) as u16).saturating_sub(1).min(tw.saturating_sub(1));
    let y_end = ((y + h) as u16).saturating_sub(1).min(th.saturating_sub(1));

    let (tl, tr, bl, br, h_line, v_line) = match style {
        BorderStyle::Rounded => ('╭', '╮', '╰', '╯', '─', '│'),
        BorderStyle::Squared => ('┌', '┐', '└', '┘', '─', '│'),
        BorderStyle::None => return,
    };

    let set_cell = |buf: &mut [u64], col: u16, row: u16, ch: char| {
        if col < tw && row < th {
            let idx = (tw * row + col) as usize * 3;
            buf[idx] = ch as u64;
            buf[idx + 1] = color as u64;
            buf[idx + 2] = bg as u64;
        }
    };

    set_cell(buf, x_start, y_start, tl);
    set_cell(buf, x_end, y_start, tr);
    set_cell(buf, x_start, y_end, bl);
    set_cell(buf, x_end, y_end, br);

    for col in (x_start + 1)..x_end {
        set_cell(buf, col, y_start, h_line);
        set_cell(buf, col, y_end, h_line);
    }
    for row in (y_start + 1)..y_end {
        set_cell(buf, x_start, row, v_line);
        set_cell(buf, x_end, row, v_line);
    }
}

fn draw_cursor_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    text_len: f32,
    fg: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    let col = (x + text_len) as u16;
    let row = y as u16;

    if col < tw && row < th {
        let idx = (tw * row + col) as usize * 3;
        if idx + 2 < buf.len() {
            buf[idx] = '█' as u64;
            buf[idx + 1] = fg as u64;
            buf[idx + 2] = bg as u64;
        }
    }
}

fn paint_taffy_node(
    taffy: &TaffyTree<NodeContext>,
    node_id: NodeId,
    buf: &mut [u64],
    abs_x: f32,
    abs_y: f32,
    parent_fg: u32,
    parent_bg: u32,
    tw: u16,
    th: u16,
) {
    let layout = taffy.layout(node_id).unwrap();
    let x = abs_x + layout.location.x;
    let y = abs_y + layout.location.y;
    let w = layout.size.width;
    let h = layout.size.height;

    // Content box position (inside border + padding)
    let content_x = abs_x + layout.content_box_x();
    let content_y = abs_y + layout.content_box_y();

    let (fg, bg) = match taffy.get_node_context(node_id) {
        Some(NodeContext::Text { content, fg, bg }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_text_at(buf, content_x, content_y, content, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            draw_text_at(buf, content_x, content_y, label, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            draw_text_at(buf, content_x, content_y, content, fg, bg, tw, th);
            draw_cursor_at(
                buf,
                content_x,
                content_y,
                content.chars().count() as f32,
                fg,
                bg,
                tw,
                th,
            );
            (fg, bg)
        }
        Some(NodeContext::Row {
            fg,
            bg,
            border_color,
            border_style,
        })
        | Some(NodeContext::Column {
            fg,
            bg,
            border_color,
            border_style,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            if *border_style != BorderStyle::None {
                draw_border_at(buf, x, y, w, h, *border_color, bg, *border_style, tw, th);
            }
            (fg, bg)
        }
        None => (parent_fg, parent_bg),
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, buf, x, y, fg, bg, tw, th);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn paint(pn: *const f32, ln: u32, pt: *const u8, lt: u32) -> c_int {
    let term_size = TERMINAL_SIZE.lock().unwrap();
    let (tw, th) = *term_size;
    drop(term_size); // Release early

    let node_data = unsafe { slice::from_raw_parts(pn, ln as usize) };
    let text_data = unsafe { slice::from_raw_parts(pt, lt as usize) };

    let mut node_offset = 0usize;
    let mut text_offset = 0usize;
    let root_node = parse_node(node_data, &mut node_offset, text_data, &mut text_offset);

    let mut taffy: TaffyTree<NodeContext> = TaffyTree::new();

    let mut root_styles = get_styles(&root_node);
    root_styles.size = Size {
        width: length(tw),
        height: length(th),
    };

    let context = node_type_to_context(&root_node);
    let root = taffy.new_leaf_with_context(root_styles, context).unwrap();

    build_taffy_tree(&mut taffy, &root, &root_node);

    let _ = taffy.compute_layout_with_measure(
        root,
        Size {
            width: length(tw),
            height: length(th),
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
    drop(frame_lock);

    let parent_fg = colors::DEFAULT.fg;
    let parent_bg = colors::DEFAULT.bg;

    // Single lock for entire paint phase
    let mut cb = CURRENT_BUFFER.lock().unwrap();
    if let Some(ref mut buf) = *cb {
        paint_taffy_node(&taffy, root, buf, 0.0, 0.0, parent_fg, parent_bg, tw, th);
    }

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
