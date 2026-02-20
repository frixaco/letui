import { COLORS } from "./colors";
import type { Node, AxisSpacing } from "./types";
import {
  NODE_TYPE_BUTTON,
  NODE_TYPE_COLUMN,
  NODE_TYPE_INPUT,
  NODE_TYPE_ROW,
  NODE_TYPE_TEXT,
  STYLE_FIELD_ALIGN_ITEMS,
  STYLE_FIELD_ALIGN_SELF,
  STYLE_FIELD_BACKGROUND,
  STYLE_FIELD_BORDER_COLOR,
  STYLE_FIELD_BORDER_STYLE,
  STYLE_FIELD_BORDER_WIDTH,
  STYLE_FIELD_COLUMN_GAP,
  STYLE_FIELD_FLEX_BASIS,
  STYLE_FIELD_FLEX_GROW,
  STYLE_FIELD_FLEX_SHRINK,
  STYLE_FIELD_FOREGROUND,
  STYLE_FIELD_HEIGHT,
  STYLE_FIELD_JUSTIFY_CONTENT,
  STYLE_FIELD_MARGIN_X,
  STYLE_FIELD_MARGIN_Y,
  STYLE_FIELD_MAX_HEIGHT,
  STYLE_FIELD_MAX_WIDTH,
  STYLE_FIELD_MIN_HEIGHT,
  STYLE_FIELD_MIN_WIDTH,
  STYLE_FIELD_OVERFLOW_X,
  STYLE_FIELD_OVERFLOW_Y,
  STYLE_FIELD_PADDING_X,
  STYLE_FIELD_PADDING_Y,
  STYLE_FIELD_ROW_GAP,
  STYLE_FIELD_WIDTH,
  STYLE_FIELDS_PER_RECORD,
  STYLE_OP_DELETE,
  STYLE_OP_UPSERT,
  encodeAlign,
  encodeBorderStyle,
  encodeJustifyContent,
  encodeOverflow,
} from "./style-schema";

function toSchemaNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function toSchemaNonNegative(value: unknown): number {
  const num = toSchemaNumber(value);
  return Number.isFinite(num) ? Math.max(0, num) : Number.NaN;
}

function toSchemaColor(value: unknown): number {
  const num = toSchemaNumber(value);
  return Number.isFinite(num)
    ? Math.min(0xffffff, Math.max(0, Math.trunc(num)))
    : Number.NaN;
}

function parseAxisSpacing(value: AxisSpacing | undefined): [number, number] {
  if (typeof value === "number") {
    const size = toSchemaNonNegative(value);
    return [size, size];
  }

  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 2) {
      return [Number.NaN, Number.NaN];
    }
    const x = toSchemaNonNegative(Number(parts[0]));
    const y = toSchemaNonNegative(Number(parts[1]));
    return [x, y];
  }

  return [Number.NaN, Number.NaN];
}

export function encodeNodeType(node: Node): number {
  if (node.type === "box") {
    return node.props.direction?.() === "row" ? NODE_TYPE_ROW : NODE_TYPE_COLUMN;
  }
  if (node.type === "button") return NODE_TYPE_BUTTON;
  if (node.type === "input") return NODE_TYPE_INPUT;
  return NODE_TYPE_TEXT;
}

export function buildStyleSnapshot(node: Node): Float32Array {
  const snapshot = new Float32Array(STYLE_FIELDS_PER_RECORD);
  snapshot.fill(Number.NaN);

  const [paddingX, paddingY] = parseAxisSpacing(node.props.padding?.());
  const [marginX, marginY] = parseAxisSpacing(node.props.margin?.());
  const rowGap = toSchemaNonNegative(node.props.rowGap?.());
  const columnGap = toSchemaNonNegative(node.props.columnGap?.());

  const background = toSchemaColor(node.props.background?.() ?? COLORS.default.bg);
  const foreground = toSchemaColor(node.props.foreground?.() ?? COLORS.default.fg);

  const border = node.props.border?.();
  const hasBorder = !!border;
  const borderWidth = hasBorder ? 1 : 0;
  const borderColor = hasBorder ? toSchemaColor(border.color) : Number.NaN;
  const borderStyle = encodeBorderStyle(border?.style, hasBorder);

  const flexGrow = toSchemaNonNegative(node.props.flexGrow?.());
  const flexShrink = toSchemaNonNegative(node.props.flexShrink?.());
  const flexBasisValue = node.props.flexBasis?.();
  const flexBasis =
    flexBasisValue === undefined || flexBasisValue === "auto"
      ? Number.NaN
      : toSchemaNonNegative(flexBasisValue);

  const justifyContent = encodeJustifyContent(node.props.justifyContent?.());
  const alignItems = encodeAlign(node.props.alignItems?.());
  const alignSelf = encodeAlign(node.props.alignSelf?.());

  const width = toSchemaNonNegative(node.props.width?.());
  const height = toSchemaNonNegative(node.props.height?.());
  const minWidth = toSchemaNonNegative(node.props.minWidth?.());
  const minHeight = toSchemaNonNegative(node.props.minHeight?.());
  const maxWidth = toSchemaNonNegative(node.props.maxWidth?.());
  const maxHeight = toSchemaNonNegative(node.props.maxHeight?.());

  const overflowX = encodeOverflow(
    node.props.overflowX?.() ?? node.props.overflow?.(),
  );
  const overflowY = encodeOverflow(
    node.props.overflowY?.() ?? node.props.overflow?.(),
  );

  snapshot[STYLE_FIELD_PADDING_X] = paddingX;
  snapshot[STYLE_FIELD_PADDING_Y] = paddingY;
  snapshot[STYLE_FIELD_MARGIN_X] = marginX;
  snapshot[STYLE_FIELD_MARGIN_Y] = marginY;
  snapshot[STYLE_FIELD_ROW_GAP] = rowGap;
  snapshot[STYLE_FIELD_COLUMN_GAP] = columnGap;
  snapshot[STYLE_FIELD_BACKGROUND] = background;
  snapshot[STYLE_FIELD_FOREGROUND] = foreground;
  snapshot[STYLE_FIELD_BORDER_WIDTH] = borderWidth;
  snapshot[STYLE_FIELD_BORDER_COLOR] = borderColor;
  snapshot[STYLE_FIELD_BORDER_STYLE] = borderStyle;
  snapshot[STYLE_FIELD_FLEX_GROW] = flexGrow;
  snapshot[STYLE_FIELD_FLEX_SHRINK] = flexShrink;
  snapshot[STYLE_FIELD_FLEX_BASIS] = flexBasis;
  snapshot[STYLE_FIELD_JUSTIFY_CONTENT] = justifyContent;
  snapshot[STYLE_FIELD_ALIGN_ITEMS] = alignItems;
  snapshot[STYLE_FIELD_ALIGN_SELF] = alignSelf;
  snapshot[STYLE_FIELD_WIDTH] = width;
  snapshot[STYLE_FIELD_HEIGHT] = height;
  snapshot[STYLE_FIELD_MIN_WIDTH] = minWidth;
  snapshot[STYLE_FIELD_MIN_HEIGHT] = minHeight;
  snapshot[STYLE_FIELD_MAX_WIDTH] = maxWidth;
  snapshot[STYLE_FIELD_MAX_HEIGHT] = maxHeight;
  snapshot[STYLE_FIELD_OVERFLOW_X] = overflowX;
  snapshot[STYLE_FIELD_OVERFLOW_Y] = overflowY;

  return snapshot;
}

export function styleSnapshotsEqual(
  a: Float32Array,
  b: Float32Array,
): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }

  return true;
}

export function queueStyleUpsertOp(
  target: number[],
  styleId: number,
  snapshot: Float32Array,
): void {
  target.push(STYLE_OP_UPSERT, styleId >>> 0);
  for (let i = 0; i < snapshot.length; i++) {
    target.push(snapshot[i] ?? Number.NaN);
  }
}

export function queueStyleDeleteOp(target: number[], styleId: number): void {
  target.push(STYLE_OP_DELETE, styleId >>> 0);
  for (let i = 0; i < STYLE_FIELDS_PER_RECORD; i++) {
    target.push(Number.NaN);
  }
}
