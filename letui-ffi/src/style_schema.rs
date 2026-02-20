use taffy::{Overflow, Point, prelude::*};

pub const NODE_FIELDS_PER_NODE: usize = 4;

pub const STYLE_OP_UPSERT: u32 = 1;
pub const STYLE_OP_DELETE: u32 = 2;

pub const STYLE_FIELDS_PER_RECORD: usize = 25;
pub const STYLE_OP_FIELDS_PER_RECORD: usize = 2 + STYLE_FIELDS_PER_RECORD;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum BorderStyle {
    #[default]
    None = 0,
    Rounded = 1,
    Squared = 2,
}

impl BorderStyle {
    pub fn from_f32(v: f32) -> Self {
        match v as u32 {
            1 => BorderStyle::Rounded,
            2 => BorderStyle::Squared,
            _ => BorderStyle::None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct StyleRecord {
    pub padding_x: Option<f32>,
    pub padding_y: Option<f32>,
    pub margin_x: Option<f32>,
    pub margin_y: Option<f32>,
    pub row_gap: Option<f32>,
    pub column_gap: Option<f32>,
    pub background: Option<u32>,
    pub foreground: Option<u32>,
    pub border_width: Option<f32>,
    pub border_color: Option<u32>,
    pub border_style: BorderStyle,
    pub flex_grow: Option<f32>,
    pub flex_shrink: Option<f32>,
    pub flex_basis: Option<f32>,
    pub justify_content: Option<JustifyContent>,
    pub align_items: Option<AlignItems>,
    pub align_self: Option<AlignSelf>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub min_width: Option<f32>,
    pub min_height: Option<f32>,
    pub max_width: Option<f32>,
    pub max_height: Option<f32>,
    pub overflow_x: Option<Overflow>,
    pub overflow_y: Option<Overflow>,
}

impl StyleRecord {
    pub fn from_payload(payload: &[f32]) -> Self {
        let mut cursor = 0usize;

        let padding_x = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let padding_y = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let margin_x = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let margin_y = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let row_gap = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let column_gap = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let background = decode_opt_u32(payload[cursor]);
        cursor += 1;
        let foreground = decode_opt_u32(payload[cursor]);
        cursor += 1;
        let border_width = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let border_color = decode_opt_u32(payload[cursor]);
        cursor += 1;
        let border_style = decode_opt_border_style(payload[cursor]).unwrap_or(BorderStyle::None);
        cursor += 1;
        let flex_grow = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let flex_shrink = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let flex_basis = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let justify_content = decode_opt_justify_content(payload[cursor]);
        cursor += 1;
        let align_items = decode_opt_align_items(payload[cursor]);
        cursor += 1;
        let align_self = decode_opt_align_items(payload[cursor]);
        cursor += 1;
        let width = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let height = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let min_width = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let min_height = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let max_width = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let max_height = decode_opt_non_negative(payload[cursor]);
        cursor += 1;
        let overflow_x = decode_opt_overflow(payload[cursor]);
        cursor += 1;
        let overflow_y = decode_opt_overflow(payload[cursor]);

        let effective_border_style = if border_width.unwrap_or(0.0) > 0.0 {
            border_style
        } else {
            BorderStyle::None
        };

        StyleRecord {
            padding_x,
            padding_y,
            margin_x,
            margin_y,
            row_gap,
            column_gap,
            background,
            foreground,
            border_width,
            border_color,
            border_style: effective_border_style,
            flex_grow,
            flex_shrink,
            flex_basis,
            justify_content,
            align_items,
            align_self,
            width,
            height,
            min_width,
            min_height,
            max_width,
            max_height,
            overflow_x,
            overflow_y,
        }
    }

    pub fn apply_to_taffy(&self, style: &mut Style) {
        style.gap = Size {
            width: length(self.column_gap.unwrap_or(0.0)),
            height: length(self.row_gap.unwrap_or(0.0)),
        };

        style.padding = Rect {
            left: length(self.padding_x.unwrap_or(0.0)),
            right: length(self.padding_x.unwrap_or(0.0)),
            top: length(self.padding_y.unwrap_or(0.0)),
            bottom: length(self.padding_y.unwrap_or(0.0)),
        };

        style.margin = Rect {
            left: length(self.margin_x.unwrap_or(0.0)),
            right: length(self.margin_x.unwrap_or(0.0)),
            top: length(self.margin_y.unwrap_or(0.0)),
            bottom: length(self.margin_y.unwrap_or(0.0)),
        };

        let border_width = self.border_width.unwrap_or(0.0);
        style.border = Rect {
            left: length(border_width),
            right: length(border_width),
            top: length(border_width),
            bottom: length(border_width),
        };

        if let Some(flex_grow) = self.flex_grow {
            style.flex_grow = flex_grow;
        }
        if let Some(flex_shrink) = self.flex_shrink {
            style.flex_shrink = flex_shrink;
        }
        if let Some(flex_basis) = self.flex_basis {
            style.flex_basis = length(flex_basis);
        }

        if self.justify_content.is_some() {
            style.justify_content = self.justify_content;
        }
        if self.align_items.is_some() {
            style.align_items = self.align_items;
        }
        if self.align_self.is_some() {
            style.align_self = self.align_self;
        }

        if let Some(width) = self.width {
            style.size.width = length(width);
        }
        if let Some(height) = self.height {
            style.size.height = length(height);
        }
        if let Some(min_width) = self.min_width {
            style.min_size.width = length(min_width);
        }
        if let Some(min_height) = self.min_height {
            style.min_size.height = length(min_height);
        }
        if let Some(max_width) = self.max_width {
            style.max_size.width = length(max_width);
        }
        if let Some(max_height) = self.max_height {
            style.max_size.height = length(max_height);
        }

        style.overflow = Point {
            x: self.overflow_x.unwrap_or(Overflow::Visible),
            y: self.overflow_y.unwrap_or(Overflow::Visible),
        };
    }
}

fn decode_opt_f32(v: f32) -> Option<f32> {
    if v.is_finite() {
        Some(v)
    } else {
        None
    }
}

fn decode_opt_non_negative(v: f32) -> Option<f32> {
    decode_opt_f32(v).map(|n| n.max(0.0))
}

fn decode_opt_u32(v: f32) -> Option<u32> {
    decode_opt_f32(v).map(|n| n.max(0.0).min(0xFFFFFF as f32) as u32)
}

fn decode_opt_border_style(v: f32) -> Option<BorderStyle> {
    decode_opt_f32(v).map(BorderStyle::from_f32)
}

fn decode_opt_overflow(v: f32) -> Option<Overflow> {
    let raw = decode_opt_f32(v)? as u32;
    match raw {
        1 => Some(Overflow::Visible),
        2 => Some(Overflow::Hidden),
        _ => None,
    }
}

fn decode_opt_align_items(v: f32) -> Option<AlignItems> {
    let raw = decode_opt_f32(v)? as u32;
    match raw {
        1 => Some(AlignItems::Start),
        2 => Some(AlignItems::End),
        3 => Some(AlignItems::FlexStart),
        4 => Some(AlignItems::FlexEnd),
        5 => Some(AlignItems::Center),
        6 => Some(AlignItems::Baseline),
        7 => Some(AlignItems::Stretch),
        _ => None,
    }
}

fn decode_opt_justify_content(v: f32) -> Option<JustifyContent> {
    let raw = decode_opt_f32(v)? as u32;
    match raw {
        1 => Some(JustifyContent::Start),
        2 => Some(JustifyContent::End),
        3 => Some(JustifyContent::FlexStart),
        4 => Some(JustifyContent::FlexEnd),
        5 => Some(JustifyContent::Center),
        6 => Some(JustifyContent::Stretch),
        7 => Some(JustifyContent::SpaceBetween),
        8 => Some(JustifyContent::SpaceAround),
        9 => Some(JustifyContent::SpaceEvenly),
        _ => None,
    }
}
