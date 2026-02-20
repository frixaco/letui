import type { Align, BorderStyle, JustifyContent, Overflow } from "./types";

export const NODE_FIELDS_PER_NODE = 4;

export const NODE_TYPE_ROW = 1;
export const NODE_TYPE_COLUMN = 2;
export const NODE_TYPE_BUTTON = 3;
export const NODE_TYPE_INPUT = 4;
export const NODE_TYPE_TEXT = 5;

export const STYLE_OP_UPSERT = 1;
export const STYLE_OP_DELETE = 2;

export const STYLE_FIELD_PADDING_X = 0;
export const STYLE_FIELD_PADDING_Y = 1;
export const STYLE_FIELD_MARGIN_X = 2;
export const STYLE_FIELD_MARGIN_Y = 3;
export const STYLE_FIELD_ROW_GAP = 4;
export const STYLE_FIELD_COLUMN_GAP = 5;
export const STYLE_FIELD_BACKGROUND = 6;
export const STYLE_FIELD_FOREGROUND = 7;
export const STYLE_FIELD_BORDER_WIDTH = 8;
export const STYLE_FIELD_BORDER_COLOR = 9;
export const STYLE_FIELD_BORDER_STYLE = 10;
export const STYLE_FIELD_FLEX_GROW = 11;
export const STYLE_FIELD_FLEX_SHRINK = 12;
export const STYLE_FIELD_FLEX_BASIS = 13;
export const STYLE_FIELD_JUSTIFY_CONTENT = 14;
export const STYLE_FIELD_ALIGN_ITEMS = 15;
export const STYLE_FIELD_ALIGN_SELF = 16;
export const STYLE_FIELD_WIDTH = 17;
export const STYLE_FIELD_HEIGHT = 18;
export const STYLE_FIELD_MIN_WIDTH = 19;
export const STYLE_FIELD_MIN_HEIGHT = 20;
export const STYLE_FIELD_MAX_WIDTH = 21;
export const STYLE_FIELD_MAX_HEIGHT = 22;
export const STYLE_FIELD_OVERFLOW_X = 23;
export const STYLE_FIELD_OVERFLOW_Y = 24;

export const STYLE_FIELDS_PER_RECORD = 25;
export const STYLE_OP_FIELDS_PER_RECORD = 2 + STYLE_FIELDS_PER_RECORD;

const BORDER_STYLE_NONE = 0;
const BORDER_STYLE_ROUNDED = 1;
const BORDER_STYLE_SQUARED = 2;

const JUSTIFY_START = 1;
const JUSTIFY_END = 2;
const JUSTIFY_FLEX_START = 3;
const JUSTIFY_FLEX_END = 4;
const JUSTIFY_CENTER = 5;
const JUSTIFY_STRETCH = 6;
const JUSTIFY_SPACE_BETWEEN = 7;
const JUSTIFY_SPACE_AROUND = 8;
const JUSTIFY_SPACE_EVENLY = 9;

const ALIGN_START = 1;
const ALIGN_END = 2;
const ALIGN_FLEX_START = 3;
const ALIGN_FLEX_END = 4;
const ALIGN_CENTER = 5;
const ALIGN_BASELINE = 6;
const ALIGN_STRETCH = 7;

const OVERFLOW_VISIBLE = 1;
const OVERFLOW_HIDDEN = 2;

export function encodeBorderStyle(
  style: BorderStyle | undefined,
  hasBorder: boolean,
): number {
  if (!hasBorder || !style) return BORDER_STYLE_NONE;
  return style === "rounded" ? BORDER_STYLE_ROUNDED : BORDER_STYLE_SQUARED;
}

export function encodeJustifyContent(
  value: JustifyContent | undefined,
): number {
  switch (value) {
    case "start":
      return JUSTIFY_START;
    case "end":
      return JUSTIFY_END;
    case "flex-start":
      return JUSTIFY_FLEX_START;
    case "flex-end":
      return JUSTIFY_FLEX_END;
    case "center":
      return JUSTIFY_CENTER;
    case "stretch":
      return JUSTIFY_STRETCH;
    case "space-between":
      return JUSTIFY_SPACE_BETWEEN;
    case "space-around":
      return JUSTIFY_SPACE_AROUND;
    case "space-evenly":
      return JUSTIFY_SPACE_EVENLY;
    default:
      return Number.NaN;
  }
}

export function encodeAlign(value: Align | undefined): number {
  switch (value) {
    case "start":
      return ALIGN_START;
    case "end":
      return ALIGN_END;
    case "flex-start":
      return ALIGN_FLEX_START;
    case "flex-end":
      return ALIGN_FLEX_END;
    case "center":
      return ALIGN_CENTER;
    case "baseline":
      return ALIGN_BASELINE;
    case "stretch":
      return ALIGN_STRETCH;
    default:
      return Number.NaN;
  }
}

export function encodeOverflow(value: Overflow | undefined): number {
  switch (value) {
    case "visible":
      return OVERFLOW_VISIBLE;
    case "hidden":
      return OVERFLOW_HIDDEN;
    default:
      return Number.NaN;
  }
}
