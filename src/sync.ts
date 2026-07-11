/**
 * Sent-tree snapshot and diff preparation for runtime sync.
 *
 * Data flow:
 *   component tree -> sent tree snapshot -> diff against previous snapshot -> queued ops
 */

import {
  EMITTED_STYLE_PROPS,
  OpQueue,
  getDeleteTextRangeOpSize,
  getSetTextOpSize,
  type StylePropName,
  type StylePropValue,
} from "./ops.ts";
import { NODE_TYPE, type Node, type NodeKind, type NormalizedStyledText } from "./types.ts";

/**
 * Builds the next sent-tree snapshot and queues the required native ops.
 */
export function prepareRenderTreeSync(
  root: Node,
  previousTree: SentNodeState | null,
  ops: OpQueue,
): RenderTreeSync {
  const sentTree = buildSentNodeState(root);
  const textStats: TextOpStats = { opCount: 0, byteCount: 0 };

  if (!previousTree || !hasSameNodeShape(previousTree, sentTree)) {
    queueFullTreeInsert(sentTree, textStats, ops);
    ops.setRoot(sentTree.id);

    return {
      sentTree,
      textStats,
      requiresTreeReset: true,
    };
  }

  syncRenderTree(previousTree, sentTree, textStats, ops);

  return {
    sentTree,
    textStats,
    requiresTreeReset: false,
  };
}

export type RenderTreeSync = {
  sentTree: SentNodeState;
  textStats: TextOpStats;
  requiresTreeReset: boolean;
};

export type SentNodeState = {
  id: number;
  type: NodeKind;
  style: SentStyleState;
  text: string;
  styledText: NormalizedStyledText | undefined;
  children: SentNodeState[];
};

export type TextOpStats = {
  opCount: number;
  byteCount: number;
};

type SentStyleState = Partial<Record<StylePropName, StylePropValue>>;

type ResolvedBorderState = {
  topWidth?: 1;
  rightWidth?: 1;
  bottomWidth?: 1;
  leftWidth?: 1;
  topColor?: number;
  rightColor?: number;
  bottomColor?: number;
  leftColor?: number;
  style?: "square" | "rounded";
};

function buildSentNodeState(node: Node): SentNodeState {
  const text =
    node.type === NODE_TYPE.Text || node.type === NODE_TYPE.Input || node.type === NODE_TYPE.Button
      ? ((node.props as any).text?.() ?? "")
      : "";
  const styledText = node.type === NODE_TYPE.Text ? (node.props as any).styledText?.() : undefined;
  const children = node.children?.() ?? [];

  return {
    id: node.id,
    type: node.type,
    style: readSentStyleState(node),
    text,
    styledText,
    children: children.map(buildSentNodeState),
  };
}

function readSentStyleState(node: Node): SentStyleState {
  const style: SentStyleState = {};
  const props = node.props as any;

  const gap = props.gap?.();
  if (gap !== undefined && gap !== 0) {
    style.gap = gap;
  }

  const padding = props.padding?.();
  if (padding !== undefined && padding !== 0) {
    style.padding = padding;
  }

  const paddingX = props.paddingX?.();
  if (paddingX !== undefined && paddingX !== 0) {
    style.paddingX = paddingX;
  }

  const paddingY = props.paddingY?.();
  if (paddingY !== undefined && paddingY !== 0) {
    style.paddingY = paddingY;
  }

  const border = resolveBorderState(props);
  if (border.topWidth !== undefined) {
    style.borderTopWidth = border.topWidth;
  }
  if (border.rightWidth !== undefined) {
    style.borderRightWidth = border.rightWidth;
  }
  if (border.bottomWidth !== undefined) {
    style.borderBottomWidth = border.bottomWidth;
  }
  if (border.leftWidth !== undefined) {
    style.borderLeftWidth = border.leftWidth;
  }
  if (border.topColor !== undefined) {
    style.borderTopColor = border.topColor;
  }
  if (border.rightColor !== undefined) {
    style.borderRightColor = border.rightColor;
  }
  if (border.bottomColor !== undefined) {
    style.borderBottomColor = border.bottomColor;
  }
  if (border.leftColor !== undefined) {
    style.borderLeftColor = border.leftColor;
  }
  if (border.style !== undefined) {
    style.borderStyle = border.style;
  }

  const background = props.background?.();
  if (background !== undefined) {
    style.background = background;
  }

  const foreground = props.foreground?.();
  if (foreground !== undefined) {
    style.foreground = foreground;
  }

  const flexGrow = props.flexGrow?.();
  if (flexGrow !== undefined && flexGrow !== 0) {
    style.flexGrow = flexGrow;
  }

  const position = props.position?.();
  if (position !== undefined && position !== "relative") {
    style.position = position;
  }

  const right = props.right?.();
  if (right !== undefined) {
    style.right = right;
  }

  const bottom = props.bottom?.();
  if (bottom !== undefined) {
    style.bottom = bottom;
  }

  const direction = props.direction?.();
  if (
    direction !== undefined &&
    !(
      (node.type === NODE_TYPE.Row && direction === "row") ||
      (node.type === NODE_TYPE.Column && direction === "column")
    )
  ) {
    style.direction = direction;
  }

  const width = props.width?.();
  if (width !== undefined) {
    style.width = width;
  }

  const height = props.height?.();
  if (height !== undefined) {
    style.height = height;
  }

  const minWidth = props.minWidth?.();
  if (minWidth !== undefined) {
    style.minWidth = minWidth;
  }

  const minHeight = props.minHeight?.();
  if (minHeight !== undefined) {
    style.minHeight = minHeight;
  }

  const maxWidth = props.maxWidth?.();
  if (maxWidth !== undefined) {
    style.maxWidth = maxWidth;
  }

  const maxHeight = props.maxHeight?.();
  if (maxHeight !== undefined) {
    style.maxHeight = maxHeight;
  }

  const margin = props.margin?.();
  if (margin !== undefined && margin !== 0) {
    style.margin = margin;
  }

  const marginX = props.marginX?.();
  if (marginX !== undefined && marginX !== 0) {
    style.marginX = marginX;
  }

  const marginY = props.marginY?.();
  if (marginY !== undefined && marginY !== 0) {
    style.marginY = marginY;
  }

  const alignItems = props.alignItems?.();
  if (alignItems !== undefined) {
    style.alignItems = alignItems;
  }

  const justifyContent = props.justifyContent?.();
  if (justifyContent !== undefined) {
    style.justifyContent = justifyContent;
  }

  const alignSelf = props.alignSelf?.();
  if (alignSelf !== undefined) {
    style.alignSelf = alignSelf;
  }

  const flexShrink = props.flexShrink?.();
  if (flexShrink !== undefined && flexShrink !== 1) {
    style.flexShrink = flexShrink;
  }

  const flexBasis = props.flexBasis?.();
  if (flexBasis !== undefined) {
    style.flexBasis = flexBasis;
  }

  const flexWrap = props.flexWrap?.();
  if (flexWrap !== undefined && flexWrap !== "noWrap") {
    style.flexWrap = flexWrap;
  }

  const boxSizing = props.boxSizing?.();
  if (boxSizing !== undefined) {
    style.boxSizing = boxSizing;
  }

  const wrap = props.wrap?.();
  if (wrap !== undefined) {
    style.wrap = wrap;
  }

  if (node.type === NODE_TYPE.Column) {
    const overflow = props.overflow?.();
    if (overflow === true || overflow === "scroll") {
      style.overflow = "scroll";
    }

    const scrollY = props.scrollY?.();
    if (scrollY !== undefined) {
      style.scrollY = Number.isNaN(scrollY) ? 0 : scrollY;
    }
  }

  const textOverflow = props.textOverflow?.();
  if (textOverflow !== undefined) {
    style.textOverflow = textOverflow;
  }

  if (node.type === NODE_TYPE.Input && node.isFocused()) {
    style.cursorVisible = 1;
  }

  return style;
}

function hasSameNodeShape(previous: SentNodeState, current: SentNodeState): boolean {
  if (previous.id !== current.id || previous.type !== current.type) {
    return false;
  }

  if (previous.children.length !== current.children.length) {
    return false;
  }

  for (let i = 0; i < previous.children.length; i++) {
    const previousChild = previous.children[i];
    const currentChild = current.children[i];
    if (!previousChild || !currentChild) {
      return false;
    }
    if (!hasSameNodeShape(previousChild, currentChild)) {
      return false;
    }
  }

  return true;
}

function queueFullTreeInsert(node: SentNodeState, textStats: TextOpStats, ops: OpQueue): void {
  ops.addNode(node.id, node.type);

  for (const prop of EMITTED_STYLE_PROPS) {
    const value = node.style[prop];
    if (value !== undefined) {
      ops.updateStyle(node.id, prop, value);
    }
  }

  if (node.text.length > 0) {
    ops.setText(node.id, node.text);
    recordTextSet(textStats, node.text);
  }

  if (node.type === NODE_TYPE.Text && node.styledText !== undefined) {
    ops.setTextSpans(node.id, node.styledText.spans);
  }

  for (const child of node.children) {
    queueFullTreeInsert(child, textStats, ops);
    ops.appendChild(child.id, node.id);
  }
}

function syncRenderTree(
  previous: SentNodeState,
  current: SentNodeState,
  textStats: TextOpStats,
  ops: OpQueue,
): void {
  syncNodeStyle(current.id, previous.style, current.style, ops);
  syncNodeText(current.id, previous.text, current.text, textStats, ops);
  syncNodeTextSpans(current, previous.styledText, current.styledText, ops);

  for (let i = 0; i < current.children.length; i++) {
    const previousChild = previous.children[i];
    const currentChild = current.children[i];
    if (!previousChild || !currentChild) {
      continue;
    }
    syncRenderTree(previousChild, currentChild, textStats, ops);
  }
}

function syncNodeStyle(
  id: number,
  previous: SentStyleState,
  current: SentStyleState,
  ops: OpQueue,
): void {
  for (const prop of EMITTED_STYLE_PROPS) {
    if (!sameStyleValue(previous[prop], current[prop])) {
      ops.updateStyle(id, prop, current[prop]);
    }
  }
}

function syncNodeText(
  id: number,
  previous: string,
  current: string,
  textStats: TextOpStats,
  ops: OpQueue,
): void {
  if (previous === current) {
    return;
  }

  const previousChars = Array.from(previous);
  const currentChars = Array.from(current);

  let prefixLength = 0;
  while (
    prefixLength < previousChars.length &&
    prefixLength < currentChars.length &&
    previousChars[prefixLength] === currentChars[prefixLength]
  ) {
    prefixLength++;
  }

  const sharedPrefix = previousChars.slice(0, prefixLength).join("");
  const previousTail = previousChars.slice(prefixLength).join("");
  const currentTail = currentChars.slice(prefixLength).join("");

  if (previousTail.length > 0) {
    const startByte = textEncoder.encode(sharedPrefix).length;
    const endByte = startByte + textEncoder.encode(previousTail).length;
    ops.deleteTextRange(id, startByte, endByte);
    recordTextDelete(textStats);
  }

  if (currentTail.length > 0) {
    ops.setText(id, currentTail);
    recordTextSet(textStats, currentTail);
  }
}

function syncNodeTextSpans(
  node: SentNodeState,
  previous: NormalizedStyledText | undefined,
  current: NormalizedStyledText | undefined,
  ops: OpQueue,
): void {
  if (node.type !== NODE_TYPE.Text) {
    return;
  }

  if (hasSameStyledText(previous, current)) {
    return;
  }

  ops.setTextSpans(node.id, current?.spans ?? []);
}

function hasSameStyledText(
  previous: NormalizedStyledText | undefined,
  current: NormalizedStyledText | undefined,
): boolean {
  if (previous === current) {
    return true;
  }

  if (previous === undefined || current === undefined) {
    return false;
  }

  if (
    previous.text !== current.text ||
    previous.length !== current.length ||
    previous.byteLength !== current.byteLength ||
    previous.spans.length !== current.spans.length
  ) {
    return false;
  }

  for (let i = 0; i < previous.spans.length; i++) {
    const left = previous.spans[i];
    const right = current.spans[i];
    if (
      !left ||
      !right ||
      left.start !== right.start ||
      left.end !== right.end ||
      left.startByte !== right.startByte ||
      left.endByte !== right.endByte ||
      left.foreground !== right.foreground ||
      left.background !== right.background ||
      left.bold !== right.bold ||
      left.italic !== right.italic ||
      left.underline !== right.underline
    ) {
      return false;
    }
  }

  return true;
}

function resolveBorderState(props: any): ResolvedBorderState {
  const border = props.border?.();
  const borderTop = props.borderTop?.();
  const borderRight = props.borderRight?.();
  const borderBottom = props.borderBottom?.();
  const borderLeft = props.borderLeft?.();

  const topColor = borderTop?.color ?? border?.color;
  const rightColor = borderRight?.color ?? border?.color;
  const bottomColor = borderBottom?.color ?? border?.color;
  const leftColor = borderLeft?.color ?? border?.color;

  const hasAnySide =
    topColor !== undefined ||
    rightColor !== undefined ||
    bottomColor !== undefined ||
    leftColor !== undefined;
  const hasSideOverride =
    borderTop !== undefined ||
    borderRight !== undefined ||
    borderBottom !== undefined ||
    borderLeft !== undefined;
  const fullBorderStyle =
    border !== undefined && !hasSideOverride
      ? border.style === "rounded"
        ? "rounded"
        : "square"
      : undefined;

  return {
    topWidth: topColor !== undefined ? 1 : undefined,
    rightWidth: rightColor !== undefined ? 1 : undefined,
    bottomWidth: bottomColor !== undefined ? 1 : undefined,
    leftWidth: leftColor !== undefined ? 1 : undefined,
    topColor,
    rightColor,
    bottomColor,
    leftColor,
    style: hasAnySide ? fullBorderStyle : undefined,
  };
}

function recordTextSet(stats: TextOpStats, text: string): void {
  stats.opCount++;
  stats.byteCount += getSetTextOpSize(text);
}

function recordTextDelete(stats: TextOpStats): void {
  stats.opCount++;
  stats.byteCount += getDeleteTextRangeOpSize();
}

function sameStyleValue(left: StylePropValue, right: StylePropValue): boolean {
  if (left === right) return true;
  return (
    typeof left === "number" &&
    typeof right === "number" &&
    Number.isNaN(left) &&
    Number.isNaN(right)
  );
}

const textEncoder = new TextEncoder();
