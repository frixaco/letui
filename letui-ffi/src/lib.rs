/*
* Rust backend for my TUI library
* that exposes core methods to be calling in TypeScript using Bun's FFI module
*/

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
    cell::RefCell,
    collections::HashMap,
    io::{Stdout, Write, stdout},
    os::raw::c_int,
    slice,
    sync::{LazyLock, Mutex},
};
use taffy::{Overflow, Point, prelude::*};

static LAST_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static CURRENT_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));
static FRAMES: Mutex<Option<Vec<f32>>> = Mutex::new(None);
static FIRST_DIFF: Mutex<bool> = Mutex::new(true);

thread_local! {
    static TREE: RefCell<TaffyTree<NodeContext>> = RefCell::new(TaffyTree::new());
}

const DEFAULT_BG: u32 = 0x16181a;
const DEFAULT_FG: u32 = 0xffffff;
// Each terminal cell stores: <char><fg><bg><attrs>.
const CELL_STRIDE: usize = 4;
// Text attrs are packed into one byte so flush can cheaply diff/toggle ANSI state.
const TEXT_ATTR_BOLD: u8 = 1 << 0;
const TEXT_ATTR_ITALIC: u8 = 1 << 1;
const TEXT_ATTR_UNDERLINE: u8 = 1 << 2;
const TEXT_ATTR_ALL: u8 = TEXT_ATTR_BOLD | TEXT_ATTR_ITALIC | TEXT_ATTR_UNDERLINE;
// Separate bitfield for optional span colors; values may be zero, so presence must
// be tracked independently from the color payload itself.
const TEXT_SPAN_COLOR_FOREGROUND: u8 = 1 << 0;
const TEXT_SPAN_COLOR_BACKGROUND: u8 = 1 << 1;

const STYLE_VALUE_RESET: u8 = 0;
const STYLE_VALUE_NUMBER: u8 = 1;
const STYLE_VALUE_STRING: u8 = 2;

#[unsafe(no_mangle)]
pub extern "C" fn init_buffer() -> c_int {
    let (w, h) = size().unwrap();
    let buffer_size = (w as usize) * (h as usize) * CELL_STRIDE;

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

fn hex_to_color(hex: u64) -> Color {
    Color::Rgb {
        r: ((hex >> 16) & 0xFF) as u8,
        g: ((hex >> 8) & 0xFF) as u8,
        b: (hex & 0xFf) as u8,
    }
}

fn queue_text_attribute_delta(stdout: &mut Stdout, previous: u8, current: u8) {
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

fn first_flush(w: u16, h: u16, stdout: &mut Stdout, buf: &[u64]) {
    if w == 0 || h == 0 {
        return;
    }

    let mut char_seq = String::with_capacity(w as usize);

    for y in 0..h {
        let row_start = (w * y) as usize * CELL_STRIDE;
        let first_idx = row_start;
        let mut prev_fg = buf[first_idx + 1];
        let mut prev_bg = buf[first_idx + 2];
        let mut prev_attrs = buf[first_idx + 3] as u8;
        char_seq.clear();
        queue!(
            stdout,
            MoveTo(0, y),
            SetAttribute(Attribute::Reset),
            SetForegroundColor(hex_to_color(prev_fg)),
            SetBackgroundColor(hex_to_color(prev_bg))
        )
        .unwrap();
        queue_text_attribute_delta(stdout, 0, prev_attrs);

        for x in 0..w {
            let idx = row_start + x as usize * CELL_STRIDE;
            let curr_char = char::from_u32(buf[idx] as u32).unwrap();
            let curr_fg = buf[idx + 1];
            let curr_bg = buf[idx + 2];
            let curr_attrs = buf[idx + 3] as u8;

            if curr_fg == prev_fg && curr_bg == prev_bg && curr_attrs == prev_attrs {
                char_seq.push(curr_char);
                continue;
            }

            let fg_changed = curr_fg != prev_fg;
            let bg_changed = curr_bg != prev_bg;

            match (fg_changed, bg_changed) {
                (true, true) => {
                    queue!(
                        stdout,
                        Print(&char_seq),
                        SetForegroundColor(hex_to_color(curr_fg)),
                        SetBackgroundColor(hex_to_color(curr_bg))
                    )
                    .unwrap();
                }
                (true, false) => {
                    queue!(stdout, Print(&char_seq), SetForegroundColor(hex_to_color(curr_fg)))
                        .unwrap();
                }
                (false, true) => {
                    queue!(stdout, Print(&char_seq), SetBackgroundColor(hex_to_color(curr_bg)))
                        .unwrap();
                }
                (false, false) => {
                    queue!(stdout, Print(&char_seq)).unwrap();
                }
            }

            queue_text_attribute_delta(stdout, prev_attrs, curr_attrs);

            prev_fg = curr_fg;
            prev_bg = curr_bg;
            prev_attrs = curr_attrs;

            char_seq.clear();
            char_seq.push(curr_char);
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
            let idx = (w * y + x) as usize * CELL_STRIDE;
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
                char_seq.push(curr_char);
                batch_cells = batch_cells.saturating_add(1);
                continue;
            }

            if !char_seq.is_empty() {
                queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
            }

            let fg_changed = curr_fg != prev_fg;
            let bg_changed = curr_bg != prev_bg;

            match (fg_changed, bg_changed) {
                (true, true) => {
                    queue!(
                        stdout,
                        SetForegroundColor(hex_to_color(curr_fg)),
                        SetBackgroundColor(hex_to_color(curr_bg))
                    )
                    .unwrap();
                }
                (true, false) => {
                    queue!(stdout, SetForegroundColor(hex_to_color(curr_fg))).unwrap();
                }
                (false, true) => {
                    queue!(stdout, SetBackgroundColor(hex_to_color(curr_bg))).unwrap();
                }
                (false, false) => {}
            }

            queue_text_attribute_delta(stdout, prev_attrs, curr_attrs);

            prev_fg = curr_fg;
            prev_bg = curr_bg;
            prev_attrs = curr_attrs;

            char_seq.clear();
            char_seq.push(curr_char);
            batch_start_x = x;
            batch_cells = 1;
        }
        if !char_seq.is_empty() {
            queue!(stdout, MoveTo(batch_start_x, y), Print(&char_seq)).unwrap();
        }
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
pub extern "C" fn clear_tree_state() -> c_int {
    let mut state = TREE_STATE.lock().unwrap();
    state.root_id = None;
    state.nodes.clear();
    1
}

#[derive(Debug, Default)]
struct TreeState {
    root_id: Option<u32>,
    nodes: HashMap<u32, NodeData>,
}

#[derive(Debug, Clone)]
struct TextSpanData {
    // Stored in byte offsets because Rust string slicing / validation is byte-based.
    start_byte: usize,
    end_byte: usize,
    foreground: Option<u32>,
    background: Option<u32>,
    bold: bool,
    italic: bool,
    underline: bool,
}

impl TextSpanData {
    fn attr_flags(&self) -> u8 {
        let mut flags = 0;
        if self.bold {
            flags |= TEXT_ATTR_BOLD;
        }
        if self.italic {
            flags |= TEXT_ATTR_ITALIC;
        }
        if self.underline {
            flags |= TEXT_ATTR_UNDERLINE;
        }
        flags
    }
}

#[derive(Debug, Clone)]
struct NodeData {
    kind: NodeType,
    parent: Option<u32>,
    children: Vec<u32>,
    text: String,
    text_spans: Vec<TextSpanData>,
    style: NodeStyle,
}

#[derive(Debug, Clone, Copy)]
struct BorderSide {
    width: f32,
    color: u32,
}

impl BorderSide {
    const fn none() -> Self {
        Self {
            width: 0.0,
            color: DEFAULT_BG,
        }
    }

    fn is_visible(&self) -> bool {
        self.width > 0.0
    }
}

#[derive(Debug, Clone, Copy)]
struct ResolvedBorder {
    top: BorderSide,
    right: BorderSide,
    bottom: BorderSide,
    left: BorderSide,
    style: BorderStyle,
}

impl ResolvedBorder {
    const fn none() -> Self {
        Self {
            top: BorderSide::none(),
            right: BorderSide::none(),
            bottom: BorderSide::none(),
            left: BorderSide::none(),
            style: BorderStyle::None,
        }
    }

    fn has_any_visible_side(&self) -> bool {
        self.top.is_visible()
            || self.right.is_visible()
            || self.bottom.is_visible()
            || self.left.is_visible()
    }

    fn is_uniform_full_box(&self) -> Option<(u32, BorderStyle)> {
        if !self.top.is_visible()
            || !self.right.is_visible()
            || !self.bottom.is_visible()
            || !self.left.is_visible()
        {
            return None;
        }

        if self.style == BorderStyle::None {
            return None;
        }

        let color = self.top.color;
        if self.right.color != color || self.bottom.color != color || self.left.color != color {
            return None;
        }

        Some((color, self.style))
    }
}

#[derive(Debug, Clone)]
struct NodeStyle {
    gap: f32,
    padding_x: f32,
    padding_y: f32,
    border: ResolvedBorder,
    bg: u32,
    fg: u32,
    flex_grow: f32,
    direction: Direction,
    width: StyleDimension,
    height: StyleDimension,
    min_width: StyleDimension,
    min_height: StyleDimension,
    max_width: StyleDimension,
    max_height: StyleDimension,
    margin_x: f32,
    margin_y: f32,
    align_items: Option<AlignItems>,
    justify_content: Option<AlignContent>,
    align_self: Option<AlignItems>,
    flex_shrink: f32,
    flex_basis: StyleDimension,
    flex_wrap: FlexWrap,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum StyleDimension {
    Auto,
    Points(f32),
}

impl NodeStyle {
    fn default_for_kind(kind: NodeType) -> Self {
        Self {
            gap: 0.0,
            padding_x: 0.0,
            padding_y: 0.0,
            border: ResolvedBorder::none(),
            bg: DEFAULT_BG,
            fg: DEFAULT_FG,
            flex_grow: 0.0,
            direction: Direction::from_node_type(kind),
            width: StyleDimension::Auto,
            height: StyleDimension::Auto,
            min_width: StyleDimension::Auto,
            min_height: StyleDimension::Auto,
            max_width: StyleDimension::Auto,
            max_height: StyleDimension::Auto,
            margin_x: 0.0,
            margin_y: 0.0,
            align_items: None,
            justify_content: None,
            align_self: None,
            flex_shrink: 1.0,
            flex_basis: StyleDimension::Auto,
            flex_wrap: FlexWrap::NoWrap,
        }
    }
}

static TREE_STATE: LazyLock<Mutex<TreeState>> = LazyLock::new(|| Mutex::new(TreeState::default()));

#[derive(Debug, Clone, Copy, PartialEq)]
enum OpType {
    SetText = 1,
    DeleteTextRange = 2,
    AddNode = 3,
    DeleteNode = 4,
    UpdateStyle = 5,
    SetRoot = 6,
    AppendChild = 7,
    // Replaces the full span table for a Text node; text bytes still flow through
    // SetText/DeleteTextRange ops.
    SetTextSpans = 8,
}

const OP_SIZE: usize = 1;
const ID_SIZE: usize = 4;
const KIND_SIZE: usize = 1;
const LEN_SIZE: usize = 4;
const RECORD_HEADER_SIZE: usize = OP_SIZE + ID_SIZE + LEN_SIZE;
// Serialized span payload layout:
// <count:u32><startByte:u32><endByte:u32><attrFlags:u8><colorFlags:u8><fg:u32><bg:u32>...
const TEXT_SPAN_COUNT_SIZE: usize = 4;
const TEXT_SPAN_ATTR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_COLOR_FLAGS_SIZE: usize = 1;
const TEXT_SPAN_RECORD_SIZE: usize =
    ID_SIZE * 2 + TEXT_SPAN_ATTR_FLAGS_SIZE + TEXT_SPAN_COLOR_FLAGS_SIZE + ID_SIZE * 2;

impl OpType {
    fn from_u8(value: u8) -> Option<Self> {
        match value {
            1 => Some(OpType::SetText),
            2 => Some(OpType::DeleteTextRange),
            3 => Some(OpType::AddNode),
            4 => Some(OpType::DeleteNode),
            5 => Some(OpType::UpdateStyle),
            6 => Some(OpType::SetRoot),
            7 => Some(OpType::AppendChild),
            8 => Some(OpType::SetTextSpans),
            _ => None,
        }
    }
}

fn remove_subtree(state: &mut TreeState, node_id: u32) {
    let children = match state.nodes.get(&node_id) {
        Some(node) => node.children.clone(),
        None => return,
    };

    for child_id in children {
        remove_subtree(state, child_id);
    }

    state.nodes.remove(&node_id);
}

fn parse_style_number(payload: &[u8]) -> Option<f64> {
    let bytes: [u8; 8] = payload.try_into().ok()?;
    Some(f64::from_le_bytes(bytes))
}

fn parse_style_string(payload: &[u8]) -> Option<&str> {
    let string_len = *payload.first()? as usize;
    if payload.len() != 1 + string_len {
        return None;
    }

    std::str::from_utf8(&payload[1..]).ok()
}

fn parse_axis_pair(value: &str) -> Option<(f32, f32)> {
    let (first, second) = value.split_once(' ')?;
    let first = first.trim().parse::<f32>().ok()?;
    let second = second.trim().parse::<f32>().ok()?;
    Some((first, second))
}

fn parse_align_items(value: &str) -> Option<AlignItems> {
    match value {
        "start" => Some(AlignItems::Start),
        "end" => Some(AlignItems::End),
        "flexStart" => Some(AlignItems::FlexStart),
        "flexEnd" => Some(AlignItems::FlexEnd),
        "center" => Some(AlignItems::Center),
        "baseline" => Some(AlignItems::Baseline),
        "stretch" => Some(AlignItems::Stretch),
        _ => None,
    }
}

fn parse_justify_content(value: &str) -> Option<AlignContent> {
    match value {
        "start" => Some(AlignContent::Start),
        "end" => Some(AlignContent::End),
        "flexStart" => Some(AlignContent::FlexStart),
        "flexEnd" => Some(AlignContent::FlexEnd),
        "center" => Some(AlignContent::Center),
        "stretch" => Some(AlignContent::Stretch),
        "spaceBetween" => Some(AlignContent::SpaceBetween),
        "spaceEvenly" => Some(AlignContent::SpaceEvenly),
        "spaceAround" => Some(AlignContent::SpaceAround),
        _ => None,
    }
}

fn parse_flex_wrap(value: &str) -> Option<FlexWrap> {
    match value {
        "noWrap" => Some(FlexWrap::NoWrap),
        "wrap" => Some(FlexWrap::Wrap),
        "wrapReverse" => Some(FlexWrap::WrapReverse),
        _ => None,
    }
}

fn parse_direction(value: &str) -> Option<Direction> {
    match value {
        "row" => Some(Direction::Row),
        "column" => Some(Direction::Column),
        "rowReverse" => Some(Direction::RowReverse),
        "columnReverse" => Some(Direction::ColumnReverse),
        _ => None,
    }
}

fn parse_border_style(value: &str) -> Option<BorderStyle> {
    match value {
        "none" => Some(BorderStyle::None),
        "rounded" => Some(BorderStyle::Rounded),
        "square" => Some(BorderStyle::Squared),
        _ => None,
    }
}

fn parse_style_f32(value: f64) -> Option<f32> {
    if value.is_finite() && value >= f32::MIN as f64 && value <= f32::MAX as f64 {
        Some(value as f32)
    } else {
        None
    }
}

fn parse_style_u32(value: f64) -> Option<u32> {
    if value.is_finite() && value >= 0.0 && value <= u32::MAX as f64 {
        Some(value as u32)
    } else {
        None
    }
}

fn parse_text_spans(payload: &[u8], text: &str) -> Option<Vec<TextSpanData>> {
    // JS already normalized spans, but Rust still validates the binary payload and
    // byte ranges before accepting it into persistent tree state.
    let count_bytes: [u8; TEXT_SPAN_COUNT_SIZE] =
        payload.get(..TEXT_SPAN_COUNT_SIZE)?.try_into().ok()?;
    let count = u32::from_le_bytes(count_bytes) as usize;
    let expected_len = TEXT_SPAN_COUNT_SIZE + count * TEXT_SPAN_RECORD_SIZE;
    if payload.len() != expected_len {
        return None;
    }

    let mut spans = Vec::with_capacity(count);
    let mut previous_end = 0usize;
    let mut offset = TEXT_SPAN_COUNT_SIZE;

    for _ in 0..count {
        let start_byte =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?) as usize;
        offset += ID_SIZE;
        let end_byte =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?) as usize;
        offset += ID_SIZE;

        let attr_flags = payload[offset];
        offset += TEXT_SPAN_ATTR_FLAGS_SIZE;
        if attr_flags & !TEXT_ATTR_ALL != 0 {
            return None;
        }

        let color_flags = payload[offset];
        offset += TEXT_SPAN_COLOR_FLAGS_SIZE;
        if color_flags & !(TEXT_SPAN_COLOR_FOREGROUND | TEXT_SPAN_COLOR_BACKGROUND) != 0 {
            return None;
        }

        let foreground_value =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?);
        offset += ID_SIZE;
        let background_value =
            u32::from_le_bytes(payload[offset..offset + ID_SIZE].try_into().ok()?);
        offset += ID_SIZE;

        if start_byte > end_byte || end_byte > text.len() {
            return None;
        }
        if start_byte < previous_end {
            return None;
        }
        if !text.is_char_boundary(start_byte) || !text.is_char_boundary(end_byte) {
            return None;
        }

        spans.push(TextSpanData {
            start_byte,
            end_byte,
            foreground: if (color_flags & TEXT_SPAN_COLOR_FOREGROUND) != 0 {
                Some(foreground_value)
            } else {
                None
            },
            background: if (color_flags & TEXT_SPAN_COLOR_BACKGROUND) != 0 {
                Some(background_value)
            } else {
                None
            },
            bold: (attr_flags & TEXT_ATTR_BOLD) != 0,
            italic: (attr_flags & TEXT_ATTR_ITALIC) != 0,
            underline: (attr_flags & TEXT_ATTR_UNDERLINE) != 0,
        });

        previous_end = end_byte;
    }

    Some(spans)
}

fn apply_style_reset(node: &mut NodeData, prop_name: &str) -> bool {
    match prop_name {
        "gap" => node.style.gap = 0.0,
        "padding" => {
            node.style.padding_x = 0.0;
            node.style.padding_y = 0.0;
        }
        "paddingX" => node.style.padding_x = 0.0,
        "paddingY" => node.style.padding_y = 0.0,
        "borderTopWidth" => node.style.border.top.width = 0.0,
        "borderRightWidth" => node.style.border.right.width = 0.0,
        "borderBottomWidth" => node.style.border.bottom.width = 0.0,
        "borderLeftWidth" => node.style.border.left.width = 0.0,
        "background" => node.style.bg = DEFAULT_BG,
        "foreground" => node.style.fg = DEFAULT_FG,
        "borderTopColor" => node.style.border.top.color = DEFAULT_BG,
        "borderRightColor" => node.style.border.right.color = DEFAULT_BG,
        "borderBottomColor" => node.style.border.bottom.color = DEFAULT_BG,
        "borderLeftColor" => node.style.border.left.color = DEFAULT_BG,
        "borderStyle" => node.style.border.style = BorderStyle::None,
        "flexGrow" => node.style.flex_grow = 0.0,
        "direction" => {
            if !node.kind.is_box() {
                return false;
            }
            node.style.direction = Direction::from_node_type(node.kind);
        }
        "width" => node.style.width = StyleDimension::Auto,
        "height" => node.style.height = StyleDimension::Auto,
        "minWidth" => node.style.min_width = StyleDimension::Auto,
        "minHeight" => node.style.min_height = StyleDimension::Auto,
        "maxWidth" => node.style.max_width = StyleDimension::Auto,
        "maxHeight" => node.style.max_height = StyleDimension::Auto,
        "margin" => {
            node.style.margin_x = 0.0;
            node.style.margin_y = 0.0;
        }
        "marginX" => node.style.margin_x = 0.0,
        "marginY" => node.style.margin_y = 0.0,
        "alignItems" => node.style.align_items = None,
        "justifyContent" => node.style.justify_content = None,
        "alignSelf" => node.style.align_self = None,
        "flexShrink" => node.style.flex_shrink = 1.0,
        "flexBasis" => node.style.flex_basis = StyleDimension::Auto,
        "flexWrap" => node.style.flex_wrap = FlexWrap::NoWrap,
        _ => return false,
    }

    true
}

fn apply_style_number(node: &mut NodeData, prop_name: &str, value: f64) -> bool {
    match prop_name {
        "gap" => match parse_style_f32(value) {
            Some(value) => node.style.gap = value,
            None => return false,
        },
        "padding" => match parse_style_f32(value) {
            Some(value) => {
                node.style.padding_x = value;
                node.style.padding_y = value;
            }
            None => return false,
        },
        "paddingX" => match parse_style_f32(value) {
            Some(value) => node.style.padding_x = value,
            None => return false,
        },
        "paddingY" => match parse_style_f32(value) {
            Some(value) => node.style.padding_y = value,
            None => return false,
        },
        "borderTopWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.top.width = value,
            None => return false,
        },
        "borderRightWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.right.width = value,
            None => return false,
        },
        "borderBottomWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.bottom.width = value,
            None => return false,
        },
        "borderLeftWidth" => match parse_style_f32(value) {
            Some(value) => node.style.border.left.width = value,
            None => return false,
        },
        "background" => match parse_style_u32(value) {
            Some(value) => node.style.bg = value,
            None => return false,
        },
        "foreground" => match parse_style_u32(value) {
            Some(value) => node.style.fg = value,
            None => return false,
        },
        "borderTopColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.top.color = value,
            None => return false,
        },
        "borderRightColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.right.color = value,
            None => return false,
        },
        "borderBottomColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.bottom.color = value,
            None => return false,
        },
        "borderLeftColor" => match parse_style_u32(value) {
            Some(value) => node.style.border.left.color = value,
            None => return false,
        },
        "flexGrow" => match parse_style_f32(value) {
            Some(value) => node.style.flex_grow = value,
            None => return false,
        },
        "width" => match parse_style_f32(value) {
            Some(value) => node.style.width = StyleDimension::Points(value),
            None => return false,
        },
        "height" => match parse_style_f32(value) {
            Some(value) => node.style.height = StyleDimension::Points(value),
            None => return false,
        },
        "minWidth" => match parse_style_f32(value) {
            Some(value) => node.style.min_width = StyleDimension::Points(value),
            None => return false,
        },
        "minHeight" => match parse_style_f32(value) {
            Some(value) => node.style.min_height = StyleDimension::Points(value),
            None => return false,
        },
        "maxWidth" => match parse_style_f32(value) {
            Some(value) => node.style.max_width = StyleDimension::Points(value),
            None => return false,
        },
        "maxHeight" => match parse_style_f32(value) {
            Some(value) => node.style.max_height = StyleDimension::Points(value),
            None => return false,
        },
        "margin" => match parse_style_f32(value) {
            Some(value) => {
                node.style.margin_x = value;
                node.style.margin_y = value;
            }
            None => return false,
        },
        "marginX" => match parse_style_f32(value) {
            Some(value) => node.style.margin_x = value,
            None => return false,
        },
        "marginY" => match parse_style_f32(value) {
            Some(value) => node.style.margin_y = value,
            None => return false,
        },
        "flexShrink" => match parse_style_f32(value) {
            Some(value) => node.style.flex_shrink = value,
            None => return false,
        },
        "flexBasis" => match parse_style_f32(value) {
            Some(value) => node.style.flex_basis = StyleDimension::Points(value),
            None => return false,
        },
        _ => return false,
    }

    true
}

fn apply_style_string(node: &mut NodeData, prop_name: &str, value: &str) -> bool {
    match prop_name {
        "padding" => match parse_axis_pair(value) {
            Some((x, y)) => {
                node.style.padding_x = x;
                node.style.padding_y = y;
            }
            None => return false,
        },
        "margin" => match parse_axis_pair(value) {
            Some((x, y)) => {
                node.style.margin_x = x;
                node.style.margin_y = y;
            }
            None => return false,
        },
        "borderStyle" => match parse_border_style(value) {
            Some(value) => node.style.border.style = value,
            None => return false,
        },
        "direction" => {
            if !node.kind.is_box() {
                return false;
            }

            node.style.direction = match parse_direction(value) {
                Some(value) => value,
                None => return false,
            };
        }
        "alignItems" => match parse_align_items(value) {
            Some(value) => node.style.align_items = Some(value),
            None => return false,
        },
        "justifyContent" => match parse_justify_content(value) {
            Some(value) => node.style.justify_content = Some(value),
            None => return false,
        },
        "alignSelf" => match parse_align_items(value) {
            Some(value) => node.style.align_self = Some(value),
            None => return false,
        },
        "flexWrap" => match parse_flex_wrap(value) {
            Some(value) => node.style.flex_wrap = value,
            None => return false,
        },
        _ => return false,
    }

    true
}

#[unsafe(no_mangle)]
pub extern "C" fn apply_ops(ops_ptr: *const u8, ops_len: u32) -> c_int {
    if ops_len > 0 && ops_ptr.is_null() {
        return 0;
    }

    let ops_bytes: &[u8] = if ops_len == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(ops_ptr, ops_len as usize) }
    };

    if ops_bytes.is_empty() {
        return 1;
    }

    let mut state = TREE_STATE.lock().unwrap();
    let mut offset = 0usize;
    while offset < ops_bytes.len() {
        // Record layout: <op><node_id><payload_len><payload>
        let header = match ops_bytes.get(offset..offset + RECORD_HEADER_SIZE) {
            Some(header) => header,
            None => return 0,
        };

        let op = match OpType::from_u8(header[0]) {
            Some(op) => op,
            None => return 0,
        };

        let node_id = match header[OP_SIZE..OP_SIZE + ID_SIZE].try_into().ok() {
            Some(bytes) => u32::from_le_bytes(bytes),
            None => return 0,
        };

        let payload_len = match header[OP_SIZE + ID_SIZE..RECORD_HEADER_SIZE]
            .try_into()
            .ok()
        {
            Some(bytes) => u32::from_le_bytes(bytes) as usize,
            None => return 0,
        };

        offset += RECORD_HEADER_SIZE;

        let payload = match ops_bytes.get(offset..offset + payload_len) {
            Some(payload) => payload,
            None => return 0,
        };

        match op {
            OpType::AddNode => {
                if payload.len() != KIND_SIZE {
                    return 0;
                }
                if state.nodes.contains_key(&node_id) {
                    return 0;
                }

                let kind = match NodeType::from_u8(payload[0]) {
                    Some(kind) => kind,
                    None => return 0,
                };

                state.nodes.insert(
                    node_id,
                    NodeData {
                        kind,
                        parent: None,
                        children: Vec::new(),
                        text: String::new(),
                        text_spans: Vec::new(),
                        style: NodeStyle::default_for_kind(kind),
                    },
                );
            }
            OpType::SetText => {
                let appended_text = match std::str::from_utf8(payload) {
                    Ok(text) => text,
                    Err(_) => return 0,
                };

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if !node.kind.supports_text() {
                    return 0;
                }

                node.text.push_str(appended_text);
            }
            OpType::DeleteTextRange => {
                if payload.len() != ID_SIZE * 2 {
                    return 0;
                }

                let start_byte = match payload[0..ID_SIZE].try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes) as usize,
                    None => return 0,
                };

                let end_byte = match payload[ID_SIZE..ID_SIZE * 2].try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes) as usize,
                    None => return 0,
                };

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if !node.kind.supports_text() {
                    return 0;
                }

                if start_byte > end_byte || end_byte > node.text.len() {
                    return 0;
                }

                if !node.text.is_char_boundary(start_byte) || !node.text.is_char_boundary(end_byte)
                {
                    return 0;
                }

                node.text.replace_range(start_byte..end_byte, "");
            }
            OpType::SetTextSpans => {
                // Span metadata is stored separately from the text buffer so compatible
                // frames can diff text bytes and styling independently.
                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                if node.kind != NodeType::Text {
                    return 0;
                }

                let spans = match parse_text_spans(payload, &node.text) {
                    Some(spans) => spans,
                    None => return 0,
                };

                node.text_spans = spans;
            }
            OpType::SetRoot => {
                if !payload.is_empty() || !state.nodes.contains_key(&node_id) {
                    return 0;
                }
                state.root_id = Some(node_id);
            }
            OpType::DeleteNode => {
                if !payload.is_empty() || !state.nodes.contains_key(&node_id) {
                    return 0;
                }

                let deleted_node_parent_id = state.nodes.get(&node_id).and_then(|node| node.parent);
                if let Some(parent_id) = deleted_node_parent_id {
                    if let Some(parent) = state.nodes.get_mut(&parent_id) {
                        parent.children.retain(|child_id| *child_id != node_id);
                    }
                }

                if state.root_id == Some(node_id) {
                    state.root_id = None;
                }

                remove_subtree(&mut state, node_id);
            }
            OpType::AppendChild => {
                if payload.len() != ID_SIZE {
                    return 0;
                }

                let parent_id = node_id;
                let child_id = match payload.try_into().ok() {
                    Some(bytes) => u32::from_le_bytes(bytes),
                    None => return 0,
                };

                if parent_id == child_id {
                    return 0;
                }

                if !state.nodes.contains_key(&parent_id) || !state.nodes.contains_key(&child_id) {
                    return 0;
                }

                let child_parent_id = match state.nodes.get(&child_id) {
                    Some(child) => child.parent,
                    None => return 0,
                };
                if child_parent_id.is_some() {
                    return 0;
                }

                // Walk upward from the proposed parent. If we ever reach the child,
                // attaching here would create a cycle.
                let mut current_parent_id = Some(parent_id);
                while let Some(parent_id_in_chain) = current_parent_id {
                    if parent_id_in_chain == child_id {
                        return 0;
                    }
                    current_parent_id = state
                        .nodes
                        .get(&parent_id_in_chain)
                        .and_then(|node| node.parent);
                }

                // Store the relationship in both directions.
                if let Some(parent) = state.nodes.get_mut(&parent_id) {
                    parent.children.push(child_id);
                } else {
                    return 0;
                }

                if let Some(child) = state.nodes.get_mut(&child_id) {
                    child.parent = Some(parent_id);
                } else {
                    return 0;
                }
            }
            OpType::UpdateStyle => {
                if payload.len() < 2 {
                    return 0;
                }

                let prop_name_len = payload[0] as usize;
                if prop_name_len == 0 || payload.len() < 1 + prop_name_len + 1 {
                    return 0;
                }

                let prop_name_end = 1 + prop_name_len;
                let prop_name = match std::str::from_utf8(&payload[1..prop_name_end]) {
                    Ok(prop_name) => prop_name,
                    Err(_) => return 0,
                };

                let value_kind = payload[prop_name_end];
                let value_payload = &payload[prop_name_end + 1..];

                let node = match state.nodes.get_mut(&node_id) {
                    Some(node) => node,
                    None => return 0,
                };

                let success = match value_kind {
                    STYLE_VALUE_RESET => {
                        if !value_payload.is_empty() {
                            return 0;
                        }
                        apply_style_reset(node, prop_name)
                    }
                    STYLE_VALUE_NUMBER => {
                        let value = match parse_style_number(value_payload) {
                            Some(value) => value,
                            None => return 0,
                        };
                        apply_style_number(node, prop_name, value)
                    }
                    STYLE_VALUE_STRING => {
                        let value = match parse_style_string(value_payload) {
                            Some(value) => value,
                            None => return 0,
                        };
                        apply_style_string(node, prop_name, value)
                    }
                    _ => return 0,
                };

                if !success {
                    return 0;
                }
            }
        }

        offset += payload_len;
    }

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
    fn from_u8(v: u8) -> Option<Self> {
        match v {
            1 => Some(NodeType::Row),
            2 => Some(NodeType::Column),
            3 => Some(NodeType::Button),
            4 => Some(NodeType::Input),
            5 => Some(NodeType::Text),
            _ => None,
        }
    }

    fn supports_text(self) -> bool {
        matches!(self, NodeType::Text | NodeType::Button | NodeType::Input)
    }

    fn is_box(self) -> bool {
        matches!(self, NodeType::Row | NodeType::Column)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Direction {
    Row = 1,
    Column = 2,
    RowReverse = 3,
    ColumnReverse = 4,
}

impl Direction {
    fn from_node_type(kind: NodeType) -> Self {
        match kind {
            NodeType::Row => Direction::Row,
            NodeType::Column => Direction::Column,
            _ => Direction::Column,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum BorderStyle {
    None = 0,
    Rounded = 1,
    Squared = 2,
}

impl BorderStyle {}

fn style_dimension_to_taffy(dim: StyleDimension) -> Dimension {
    match dim {
        StyleDimension::Auto => Dimension::auto(),
        StyleDimension::Points(v) => Dimension::length(v),
    }
}

fn node_data_to_style(data: &NodeData) -> Style {
    let s = &data.style;
    let mut style = Style {
        gap: Size {
            width: length(s.gap),
            height: zero(),
        },
        padding: Rect {
            left: length(s.padding_x),
            right: length(s.padding_x),
            top: length(s.padding_y),
            bottom: length(s.padding_y),
        },
        border: Rect {
            left: length(s.border.left.width),
            right: length(s.border.right.width),
            top: length(s.border.top.width),
            bottom: length(s.border.bottom.width),
        },
        margin: Rect {
            left: length(s.margin_x),
            right: length(s.margin_x),
            top: length(s.margin_y),
            bottom: length(s.margin_y),
        },
        flex_grow: s.flex_grow,
        flex_shrink: s.flex_shrink,
        size: Size {
            width: style_dimension_to_taffy(s.width),
            height: style_dimension_to_taffy(s.height),
        },
        min_size: Size {
            width: style_dimension_to_taffy(s.min_width),
            height: style_dimension_to_taffy(s.min_height),
        },
        max_size: Size {
            width: style_dimension_to_taffy(s.max_width),
            height: style_dimension_to_taffy(s.max_height),
        },
        flex_basis: style_dimension_to_taffy(s.flex_basis),
        flex_wrap: s.flex_wrap,
        align_items: s.align_items,
        justify_content: s.justify_content,
        align_self: s.align_self,
        ..Default::default()
    };

    match s.direction {
        Direction::Row => style.flex_direction = FlexDirection::Row,
        Direction::Column => style.flex_direction = FlexDirection::Column,
        Direction::RowReverse => style.flex_direction = FlexDirection::RowReverse,
        Direction::ColumnReverse => style.flex_direction = FlexDirection::ColumnReverse,
    }

    match data.kind {
        NodeType::Column => {
            if s.align_items.is_none() {
                style.align_items = Some(AlignItems::Stretch);
            }
            style.overflow = Point {
                x: Overflow::Hidden,
                y: Overflow::Hidden,
            };
        }
        NodeType::Input => {
            if s.flex_grow == 0.0 {
                style.flex_grow = 1.0;
            }
        }
        _ => {}
    }

    style
}

fn node_data_to_context(data: &NodeData) -> NodeContext {
    let s = &data.style;
    match data.kind {
        NodeType::Column => NodeContext::Column {
            bg: s.bg,
            fg: s.fg,
            border: s.border,
        },
        NodeType::Row => NodeContext::Row {
            bg: s.bg,
            fg: s.fg,
            border: s.border,
        },
        NodeType::Text => NodeContext::Text {
            content: data.text.clone(),
            spans: data.text_spans.clone(),
            fg: s.fg,
            bg: s.bg,
        },
        NodeType::Button => NodeContext::Button {
            label: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
        },
        NodeType::Input => NodeContext::Input {
            content: data.text.clone(),
            fg: s.fg,
            bg: s.bg,
            border: s.border,
        },
    }
}

fn build_taffy_from_state(
    taffy: &mut TaffyTree<NodeContext>,
    state: &TreeState,
    node_id: u32,
    taffy_parent: Option<NodeId>,
) -> Option<NodeId> {
    let data = state.nodes.get(&node_id)?;
    let style = node_data_to_style(data);
    let context = node_data_to_context(data);
    let taffy_node = taffy.new_leaf_with_context(style, context).unwrap();

    if let Some(parent) = taffy_parent {
        taffy.add_child(parent, taffy_node).unwrap();
    }

    for &child_id in &data.children {
        build_taffy_from_state(taffy, state, child_id, Some(taffy_node));
    }

    Some(taffy_node)
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
        spans: Vec<TextSpanData>,
        fg: u32,
        bg: u32,
    },
    Button {
        label: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
    },
    Input {
        content: String,
        fg: u32,
        bg: u32,
        border: ResolvedBorder,
    },
    Row {
        bg: u32,
        fg: u32,
        border: ResolvedBorder,
    },
    Column {
        bg: u32,
        fg: u32,
        border: ResolvedBorder,
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

fn set_buffer_cell(
    buf: &mut [u64],
    col: u16,
    row: u16,
    ch: char,
    fg: u32,
    bg: u32,
    attrs: u8,
    tw: u16,
    th: u16,
) {
    // Single write path for the 4-slot cell layout: char + fg + bg + text attrs.
    if col >= tw || row >= th {
        return;
    }

    let idx = (tw * row + col) as usize * CELL_STRIDE;
    if idx + (CELL_STRIDE - 1) >= buf.len() {
        return;
    }

    buf[idx] = ch as u64;
    buf[idx + 1] = fg as u64;
    buf[idx + 2] = bg as u64;
    buf[idx + 3] = attrs as u64;
}

fn draw_background_at(buf: &mut [u64], x: f32, y: f32, w: f32, h: f32, bg: u32, tw: u16, th: u16) {
    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = (x + w).min(tw as f32) as u16;
    let y_end = (y + h).min(th as f32) as u16;

    for row in y_start..y_end {
        for col in x_start..x_end {
            set_buffer_cell(buf, col, row, ' ', DEFAULT_FG, bg, 0, tw, th);
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
        set_buffer_cell(buf, col, y_row, ch, fg, bg, 0, tw, th);
    }
}

fn draw_styled_text_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    text: &str,
    spans: &[TextSpanData],
    fg: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    // Spans are pre-sorted/non-overlapping, so painting can walk text once with a
    // single forward-moving span pointer.
    let x_start = x as u16;
    let y_row = y as u16;

    if y_row >= th {
        return;
    }

    let mut span_index = 0usize;
    for (char_index, (byte_start, ch)) in text.char_indices().enumerate() {
        let col = x_start + char_index as u16;
        if col >= tw {
            break;
        }

        while span_index < spans.len() && spans[span_index].end_byte <= byte_start {
            span_index += 1;
        }

        let mut resolved_fg = fg;
        let mut resolved_bg = bg;
        let mut attrs = 0u8;

        if let Some(span) = spans.get(span_index) {
            if byte_start >= span.start_byte && byte_start < span.end_byte {
                resolved_fg = span.foreground.unwrap_or(fg);
                resolved_bg = span.background.unwrap_or(bg);
                attrs = span.attr_flags();
            }
        }

        set_buffer_cell(buf, col, y_row, ch, resolved_fg, resolved_bg, attrs, tw, th);
    }
}

fn set_border_cell(
    buf: &mut [u64],
    col: u16,
    row: u16,
    ch: char,
    color: u32,
    bg: u32,
    tw: u16,
    th: u16,
) {
    set_buffer_cell(buf, col, row, ch, color, bg, 0, tw, th);
}

fn draw_uniform_border_at(
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

    set_border_cell(buf, x_start, y_start, tl, color, bg, tw, th);
    set_border_cell(buf, x_end, y_start, tr, color, bg, tw, th);
    set_border_cell(buf, x_start, y_end, bl, color, bg, tw, th);
    set_border_cell(buf, x_end, y_end, br, color, bg, tw, th);

    for col in (x_start + 1)..x_end {
        set_border_cell(buf, col, y_start, h_line, color, bg, tw, th);
        set_border_cell(buf, col, y_end, h_line, color, bg, tw, th);
    }
    for row in (y_start + 1)..y_end {
        set_border_cell(buf, x_start, row, v_line, color, bg, tw, th);
        set_border_cell(buf, x_end, row, v_line, color, bg, tw, th);
    }
}

fn draw_resolved_border_at(
    buf: &mut [u64],
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    border: ResolvedBorder,
    bg: u32,
    tw: u16,
    th: u16,
) {
    if !border.has_any_visible_side() {
        return;
    }

    if let Some((color, style)) = border.is_uniform_full_box() {
        draw_uniform_border_at(buf, x, y, w, h, color, bg, style, tw, th);
        return;
    }

    let x_start = x as u16;
    let y_start = y as u16;
    let x_end = ((x + w) as u16).saturating_sub(1).min(tw.saturating_sub(1));
    let y_end = ((y + h) as u16).saturating_sub(1).min(th.saturating_sub(1));

    let top = border.top.is_visible();
    let right = border.right.is_visible();
    let bottom = border.bottom.is_visible();
    let left = border.left.is_visible();

    if top {
        for col in x_start..=x_end {
            set_border_cell(buf, col, y_start, '─', border.top.color, bg, tw, th);
        }
    }
    if bottom {
        for col in x_start..=x_end {
            set_border_cell(buf, col, y_end, '─', border.bottom.color, bg, tw, th);
        }
    }
    if left {
        for row in y_start..=y_end {
            set_border_cell(buf, x_start, row, '│', border.left.color, bg, tw, th);
        }
    }
    if right {
        for row in y_start..=y_end {
            set_border_cell(buf, x_end, row, '│', border.right.color, bg, tw, th);
        }
    }

    if top && left {
        set_border_cell(buf, x_start, y_start, '┌', border.top.color, bg, tw, th);
    }
    if top && right {
        set_border_cell(buf, x_end, y_start, '┐', border.top.color, bg, tw, th);
    }
    if bottom && left {
        set_border_cell(buf, x_start, y_end, '└', border.bottom.color, bg, tw, th);
    }
    if bottom && right {
        set_border_cell(buf, x_end, y_end, '┘', border.bottom.color, bg, tw, th);
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

    set_buffer_cell(buf, col, row, '█', fg, bg, 0, tw, th);
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
        Some(NodeContext::Text {
            content,
            spans,
            fg,
            bg,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_styled_text_at(buf, content_x, content_y, content, spans, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Button {
            label,
            fg,
            bg,
            border,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
            draw_text_at(buf, content_x, content_y, label, fg, bg, tw, th);
            (fg, bg)
        }
        Some(NodeContext::Input {
            content,
            fg,
            bg,
            border,
        }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
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
        Some(NodeContext::Row { fg, bg, border })
        | Some(NodeContext::Column { fg, bg, border }) => {
            let fg = if *fg != 0 { *fg } else { parent_fg };
            let bg = if *bg != 0 { *bg } else { parent_bg };
            draw_background_at(buf, x, y, w, h, bg, tw, th);
            draw_resolved_border_at(buf, x, y, w, h, *border, bg, tw, th);
            (fg, bg)
        }
        None => (parent_fg, parent_bg),
    };

    for child in taffy.children(node_id).unwrap() {
        paint_taffy_node(taffy, child, buf, x, y, fg, bg, tw, th);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn render() -> c_int {
    let state = TREE_STATE.lock().unwrap();
    let root_id = match state.root_id {
        Some(id) => id,
        None => return 0,
    };

    TREE.with_borrow_mut(|taffy| {
        let term_size = TERMINAL_SIZE.lock().unwrap();
        let (tw, th) = *term_size;
        drop(term_size);

        let taffy_root = match build_taffy_from_state(taffy, &state, root_id, None) {
            Some(id) => id,
            None => return 0,
        };

        // Force root to fill terminal
        let mut root_style = taffy.style(taffy_root).unwrap().clone();
        root_style.size = Size {
            width: length(tw),
            height: length(th),
        };
        taffy.set_style(taffy_root, root_style).unwrap();

        let _ = taffy.compute_layout_with_measure(
            taffy_root,
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
        build_frames_array(taffy, taffy_root, frames_vec, 0.0, 0.0);
        drop(frame_lock);

        let root_data = state.nodes.get(&root_id);
        let parent_fg = root_data.map_or(DEFAULT_FG, |d| d.style.fg);
        let parent_bg = root_data.map_or(DEFAULT_BG, |d| d.style.bg);

        let mut cb = CURRENT_BUFFER.lock().unwrap();
        if let Some(ref mut buf) = *cb {
            paint_taffy_node(
                taffy, taffy_root, buf, 0.0, 0.0, parent_fg, parent_bg, tw, th,
            );
        }

        taffy.clear();
        1
    })
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
