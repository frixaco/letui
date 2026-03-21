use std::sync::Mutex;

pub(crate) static LAST_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
pub(crate) static CURRENT_BUFFER: Mutex<Option<Vec<u64>>> = Mutex::new(None);
pub(crate) static TERMINAL_SIZE: Mutex<(u16, u16)> = Mutex::new((0, 0));
pub(crate) static FRAMES: Mutex<Option<Vec<f32>>> = Mutex::new(None);
pub(crate) static FIRST_DIFF: Mutex<bool> = Mutex::new(true);

pub(crate) const DEFAULT_BG: u32 = 0x16181a;
pub(crate) const DEFAULT_FG: u32 = 0xffffff;
pub(crate) const CONTINUATION_CELL: char = '\0';
// Each terminal cell stores: <char><fg><bg><attrs>.
pub(crate) const CELL_STRIDE: usize = 4;
// Text attrs are packed into one byte so flush can cheaply diff/toggle ANSI state.
pub(crate) const TEXT_ATTR_BOLD: u8 = 1 << 0;
pub(crate) const TEXT_ATTR_ITALIC: u8 = 1 << 1;
pub(crate) const TEXT_ATTR_UNDERLINE: u8 = 1 << 2;
pub(crate) const TEXT_ATTR_ALL: u8 = TEXT_ATTR_BOLD | TEXT_ATTR_ITALIC | TEXT_ATTR_UNDERLINE;
