import { resetInputEditorText } from "./input-editor";
import { $, type Signal } from "./signals";
import { normalizeStyledText, prepareTextInput } from "./text-spans";
import { NODE_TYPE } from "./types";
import type {
  Frame,
  Node,
  BoxNode,
  BoxProps,
  BoxEventProps,
  WheelEvent,
  ScrollState,
  TextNode,
  TextProps,
  InputNode,
  InputProps,
  ButtonNode,
  ButtonProps,
  ScrollViewNode,
  ScrollViewProps,
  StyleProps,
  BoxKind,
  Direction,
  StyledText,
  NormalizedStyledText,
  ScrollAxis,
  TextWrap,
  TextOverflow,
  _StyleProps,
  _BoxProps,
  _TextProps,
  _InputProps,
  _ButtonProps,
  _ScrollViewProps,
} from "./types";

// Re-export types for convenience
export type {
  Frame,
  Node,
  BoxProps,
  BoxEventProps,
  WheelEvent,
  TextProps,
  InputProps,
  ButtonProps,
  ScrollViewProps,
  StyleProps,
  AxisPair,
  Direction,
  AlignItems,
  JustifyContent,
  FlexWrap,
  ScrollAxis,
  ScrollSticky,
  TextWrap,
  TextOverflow,
  BorderStyle,
  BorderProps,
  BorderSideProps,
  TextSpan,
  StyledText,
  NormalizedTextSpan,
  NormalizedStyledText,
  ScrollState,
} from "./types";
export { NODE_TYPE } from "./types";

// =============================================================================
// INTERNALS
// =============================================================================

const generateId = (() => {
  let counter = 1;
  return () => counter++;
})();

const DEFAULT_SCROLL_WHEEL_STEP = 2;

function getInitialFrame(): Frame {
  return { x: 0, y: 0, width: 0, height: 0 };
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeScrollValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

// --- Props-to-Signals Converters ---

function createStyleSignals(input: StyleProps): _StyleProps {
  return {
    border: $(input.border),
    borderTop: $(input.borderTop),
    borderRight: $(input.borderRight),
    borderBottom: $(input.borderBottom),
    borderLeft: $(input.borderLeft),
    padding: $(input.padding),
    paddingX: $(input.paddingX),
    paddingY: $(input.paddingY),
    background: $(input.background),
    foreground: $(input.foreground),
    flexGrow: $(input.flexGrow),
    width: $(input.width),
    height: $(input.height),
    minWidth: $(input.minWidth),
    minHeight: $(input.minHeight),
    maxWidth: $(input.maxWidth),
    maxHeight: $(input.maxHeight),
    margin: $(input.margin),
    marginX: $(input.marginX),
    marginY: $(input.marginY),
    alignItems: $(input.alignItems),
    justifyContent: $(input.justifyContent),
    alignSelf: $(input.alignSelf),
    flexShrink: $(input.flexShrink),
    flexBasis: $(input.flexBasis),
    flexWrap: $(input.flexWrap),
  };
}

function createBoxSignals(input: BoxProps): _BoxProps {
  return {
    ...createStyleSignals(input),
    gap: $(input.gap),
    direction: $(input.direction),
  };
}

function resolveTextValue(input: string | StyledText): {
  text: string;
  styledText: NormalizedStyledText | undefined;
} {
  if (typeof input === "string") {
    return {
      text: prepareTextInput(input).text,
      styledText: undefined,
    };
  }

  const styledText = normalizeStyledText(input);
  return {
    text: styledText.text,
    styledText,
  };
}

function setTextSignals(props: _TextProps, input: string | StyledText): void {
  if (typeof input === "string") {
    props.text(prepareTextInput(input).text);
    props.styledText(undefined);
    return;
  }

  const styledText = normalizeStyledText(input);
  props.text(styledText.text);
  props.styledText(styledText);
}

function createTextSignals(input: TextProps): _TextProps {
  const resolved = resolveTextValue(input.text);

  return {
    ...createStyleSignals(input),
    text: $(resolved.text),
    styledText: $(resolved.styledText),
    wrap: $(input.wrap),
    textOverflow: $(input.textOverflow),
  };
}

function createInputSignals(
  input: {
    placeholder?: string;
    multiline?: boolean;
    wrap?: Exclude<TextWrap, "none">;
  } & StyleProps,
): _InputProps {
  return {
    ...createStyleSignals(input),
    text: $(""),
    placeholder: $(input.placeholder),
    multiline: $(input.multiline),
    wrap: $(input.wrap),
  };
}

function createButtonSignals(
  input: { text: string } & StyleProps,
): _ButtonProps {
  return {
    ...createStyleSignals(input),
    text: $(prepareTextInput(input.text).text),
  };
}

function createScrollViewSignals(input: ScrollViewProps): _ScrollViewProps {
  return {
    ...createStyleSignals(input),
    scrollX: $(0),
    scrollY: $(0),
    axis: $(input.axis),
    sticky: $(input.sticky),
    wheelStep: $(input.wheelStep),
    keyboard: $(input.keyboard),
  };
}

// --- Generic setStyle ---

function makeSetStyle<T extends Record<string, Signal<any>>>(
  props: T,
): (
  newProps: Partial<{
    [K in keyof T]: T[K] extends Signal<infer V> ? V : never;
  }>,
) => void {
  return (newProps) => {
    for (const [key, value] of Object.entries(newProps)) {
      if (key in props) {
        (props as any)[key](value);
      }
    }
  };
}

function directionToBoxKind(direction: Direction | undefined): BoxKind {
  return direction?.startsWith("row") ? NODE_TYPE.Row : NODE_TYPE.Column;
}

function resolvedScrollAxis(node: ScrollViewNode): ScrollAxis {
  return node.props.axis() ?? "y";
}

function getScrollState(node: ScrollViewNode): ScrollState {
  return {
    scrollX: node.scrollX(),
    scrollY: node.scrollY(),
    maxScrollX: node.maxScrollX(),
    maxScrollY: node.maxScrollY(),
    viewportWidth: node.viewportWidth(),
    viewportHeight: node.viewportHeight(),
    contentWidth: node.contentWidth(),
    contentHeight: node.contentHeight(),
  };
}

function setScrollPosition(node: ScrollViewNode, x: number, y: number): void {
  const internal = node as ScrollViewInternal;
  const axis = resolvedScrollAxis(node);
  const nextX =
    axis === "y" ? 0 : clamp(0, normalizeScrollValue(x), node.maxScrollX());
  const nextY =
    axis === "x" ? 0 : clamp(0, normalizeScrollValue(y), node.maxScrollY());

  if (node.scrollX() !== nextX) {
    node.scrollX(nextX);
  }
  if (node.scrollY() !== nextY) {
    node.scrollY(nextY);
  }

  internal._stickyEndPinned =
    node.props.sticky() === "end" && nextY >= node.maxScrollY();
}

function setContentAlignment(node: ScrollViewNode): void {
  const axis = resolvedScrollAxis(node);
  node.content.setStyle({
    alignSelf: axis === "y" ? "stretch" : "start",
  });
}

// =============================================================================
// FOCUS MANAGEMENT
// =============================================================================

let focusedNode: Node | null = null;
const focusVersion = $(0);

export function getFocusedNode(): Node | null {
  return focusedNode;
}

export function getFocusVersion(): number {
  return focusVersion();
}

export function focusNode(node: Node): void {
  if (focusedNode === node) return;

  if (focusedNode) {
    const prev = focusedNode;
    focusedNode = null;
    focusVersion(focusVersion() + 1);
    const handler = (prev.handlers as any).onBlur;
    if (handler) handler(prev);
  }

  focusedNode = node;
  focusVersion(focusVersion() + 1);
  const handler = (node.handlers as any).onFocus;
  if (handler) handler(node);
}

function blurNode(node: Node): void {
  if (focusedNode !== node) return;
  focusedNode = null;
  focusVersion(focusVersion() + 1);
  const handler = (node.handlers as any).onBlur;
  if (handler) handler(node);
}

// =============================================================================
// CONSTRUCTORS
// =============================================================================

export function Box(input: BoxProps & BoxEventProps, children: Node[]): BoxNode {
  const { onWheel, ...styleInput } = input;
  const props = createBoxSignals(styleInput);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);
  const initialType = directionToBoxKind(styleInput.direction);
  const setStyleSignals = makeSetStyle(props);

  const node: BoxNode = {
    type: initialType,
    id: generateId(),
    props,
    handlers: { onWheel },
    frame: getInitialFrame(),
    visibleFrame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: (newProps) => {
      if (Object.prototype.hasOwnProperty.call(newProps, "onWheel")) {
        node.handlers.onWheel = newProps.onWheel;
      }
      if (newProps.direction !== undefined) {
        node.type = directionToBoxKind(newProps.direction);
      }
      setStyleSignals(newProps);
    },
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Column(
  props: Omit<BoxProps, "direction"> & BoxEventProps,
  children: Node[],
): BoxNode {
  return Box({ ...props, direction: "column" }, children);
}

export function Row(
  props: Omit<BoxProps, "direction"> & BoxEventProps,
  children: Node[],
): BoxNode {
  return Box({ ...props, direction: "row" }, children);
}

export function Text(input: TextProps): TextNode {
  const props = createTextSignals(input);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: TextNode = {
    type: NODE_TYPE.Text,
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
    visibleFrame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => setTextSignals(props, v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Input(input: InputProps): InputNode {
  const { onChange, onSubmit, onFocus, onBlur, ...styleInput } = input;
  const props = createInputSignals(styleInput);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: InputNode = {
    type: NODE_TYPE.Input,
    id: generateId(),
    props,
    handlers: { onChange, onSubmit, onFocus, onBlur },
    frame: getInitialFrame(),
    visibleFrame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => resetInputEditorText(node, v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  resetInputEditorText(node, "");
  return node;
}

export function Button(input: ButtonProps, children: Node[] = []): ButtonNode {
  const { onClick, onKeyDown, onFocus, onBlur, ...styleInput } = input;
  const props = createButtonSignals(styleInput);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: ButtonNode = {
    type: NODE_TYPE.Button,
    id: generateId(),
    props,
    handlers: { onClick, onKeyDown, onFocus, onBlur },
    frame: getInitialFrame(),
    visibleFrame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(prepareTextInput(v).text),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function ScrollView(
  input: ScrollViewProps,
  children: Node[],
): ScrollViewNode {
  const { onScroll, ...styleInput } = input;
  const props = createScrollViewSignals(styleInput);
  const frameWidth = $(0);
  const frameHeight = $(0);
  const viewportChildren = $([] as Node[]);
  const viewportWidth = $(0);
  const viewportHeight = $(0);
  const contentWidth = $(0);
  const contentHeight = $(0);
  const maxScrollX = $(0);
  const maxScrollY = $(0);
  const content = Column(
    {
      gap: 0,
      flexShrink: 0,
      alignSelf: (input.axis ?? "y") === "y" ? "stretch" : "start",
    },
    children,
  );

  const node: ScrollViewNode = {
    type: NODE_TYPE.ScrollView,
    id: generateId(),
    props,
    handlers: { onScroll },
    frame: getInitialFrame(),
    visibleFrame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: viewportChildren,
    setChildren: (nodes) => content.setChildren(nodes),
    setStyle: (newProps) => {
      if (Object.prototype.hasOwnProperty.call(newProps, "onScroll")) {
        node.handlers.onScroll = newProps.onScroll;
      }
      const { onScroll: _ignored, ...nextStyle } = newProps;
      for (const [key, value] of Object.entries(nextStyle)) {
        if (key in props) {
          (props as any)[key](value);
        }
      }
      setContentAlignment(node);
    },
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
    content,
    scrollTo: (x, y) => setScrollPosition(node, x, y),
    scrollBy: (dx, dy) => setScrollPosition(node, node.scrollX() + dx, node.scrollY() + dy),
    scrollToStart: () => {
      const axis = resolvedScrollAxis(node);
      setScrollPosition(
        node,
        axis === "both" || axis === "x" ? 0 : node.scrollX(),
        axis === "both" || axis === "y" ? 0 : node.scrollY(),
      );
    },
    scrollToEnd: () => {
      const axis = resolvedScrollAxis(node);
      setScrollPosition(
        node,
        axis === "both" || axis === "x" ? node.maxScrollX() : node.scrollX(),
        axis === "both" || axis === "y" ? node.maxScrollY() : node.scrollY(),
      );
    },
    ensureVisible: (child, align = "nearest") => {
      const viewport = node.contentFrame;
      const childStartX = child.frame.x - viewport.x;
      const childEndX = childStartX + child.frame.width;
      const childStartY = child.frame.y - viewport.y;
      const childEndY = childStartY + child.frame.height;

      let nextX = node.scrollX();
      let nextY = node.scrollY();

      if (resolvedScrollAxis(node) !== "y") {
        if (align === "start") {
          nextX = childStartX;
        } else if (align === "end") {
          nextX = childEndX - node.viewportWidth();
        } else {
          if (childStartX < node.scrollX()) {
            nextX = childStartX;
          } else if (childEndX > node.scrollX() + node.viewportWidth()) {
            nextX = childEndX - node.viewportWidth();
          }
        }
      }

      if (resolvedScrollAxis(node) !== "x") {
        if (align === "start") {
          nextY = childStartY;
        } else if (align === "end") {
          nextY = childEndY - node.viewportHeight();
        } else {
          if (childStartY < node.scrollY()) {
            nextY = childStartY;
          } else if (childEndY > node.scrollY() + node.viewportHeight()) {
            nextY = childEndY - node.viewportHeight();
          }
        }
      }

      setScrollPosition(node, nextX, nextY);
    },
    scrollX: props.scrollX,
    scrollY: props.scrollY,
    maxScrollX,
    maxScrollY,
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
  };

  viewportChildren([content]);
  setContentAlignment(node);
  return node;
}

type ScrollViewInternal = ScrollViewNode & {
  _lastPublishedScrollState?: ScrollState;
  _stickyEndPinned?: boolean;
};

function sameScrollState(left: ScrollState | undefined, right: ScrollState): boolean {
  return left !== undefined &&
    left.scrollX === right.scrollX &&
    left.scrollY === right.scrollY &&
    left.maxScrollX === right.maxScrollX &&
    left.maxScrollY === right.maxScrollY &&
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    left.contentWidth === right.contentWidth &&
    left.contentHeight === right.contentHeight;
}

export function isScrollViewNode(node: Node): node is ScrollViewNode {
  return node.type === NODE_TYPE.ScrollView;
}

export function syncScrollViewMetrics(
  node: ScrollViewNode,
  metrics: {
    viewportWidth: number;
    viewportHeight: number;
    contentWidth: number;
    contentHeight: number;
  },
): void {
  const internal = node as ScrollViewInternal;
  node.viewportWidth(metrics.viewportWidth);
  node.viewportHeight(metrics.viewportHeight);
  node.contentWidth(metrics.contentWidth);
  node.contentHeight(metrics.contentHeight);

  const nextMaxScrollX = Math.max(0, metrics.contentWidth - metrics.viewportWidth);
  const nextMaxScrollY = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
  const wasPinnedToEnd =
    internal._stickyEndPinned === true ||
    (node.maxScrollY() > 0 && node.scrollY() >= node.maxScrollY());

  node.maxScrollX(nextMaxScrollX);
  node.maxScrollY(nextMaxScrollY);

  let nextX = clamp(0, node.scrollX(), nextMaxScrollX);
  let nextY = clamp(0, node.scrollY(), nextMaxScrollY);
  if (node.props.sticky() === "end" && wasPinnedToEnd) {
    nextY = nextMaxScrollY;
  }

  setScrollPosition(node, nextX, nextY);
  internal._stickyEndPinned =
    node.props.sticky() === "end" && node.scrollY() >= node.maxScrollY();

  const state = getScrollState(node);
  if (sameScrollState(internal._lastPublishedScrollState, state)) {
    return;
  }

  internal._lastPublishedScrollState = state;
  node.handlers.onScroll?.(state);
}

export function scrollViewConsumesWheel(
  node: ScrollViewNode,
  event: WheelEvent,
): boolean {
  const axis = resolvedScrollAxis(node);
  const step = Math.max(1, Math.floor(node.props.wheelStep() ?? DEFAULT_SCROLL_WHEEL_STEP));
  let dx = event.deltaX;
  let dy = event.deltaY;

  if (event.shift && dx === 0 && axis !== "y") {
    dx = dy;
    dy = 0;
  }

  if (axis === "x") {
    dy = 0;
  } else if (axis === "y") {
    dx = 0;
  }

  const nextX = node.scrollX() + dx * step;
  const nextY = node.scrollY() + dy * step;
  const beforeX = node.scrollX();
  const beforeY = node.scrollY();
  setScrollPosition(node, nextX, nextY);
  return beforeX !== node.scrollX() || beforeY !== node.scrollY();
}

export function scrollViewConsumesKey(
  node: ScrollViewNode,
  key: string,
): boolean {
  if (node.props.keyboard() === false) {
    return false;
  }

  const verticalPage = Math.max(1, node.viewportHeight());
  const horizontalPage = Math.max(1, node.viewportWidth());
  const axis = resolvedScrollAxis(node);
  const beforeX = node.scrollX();
  const beforeY = node.scrollY();

  switch (key) {
    case "\x1b[A":
      if (axis !== "x") node.scrollBy(0, -1);
      break;
    case "\x1b[B":
      if (axis !== "x") node.scrollBy(0, 1);
      break;
    case "\x1b[D":
      if (axis !== "y") node.scrollBy(-1, 0);
      break;
    case "\x1b[C":
      if (axis !== "y") node.scrollBy(1, 0);
      break;
    case "\x1b[5~":
      if (axis !== "x") node.scrollBy(0, -verticalPage);
      break;
    case "\x1b[6~":
      if (axis !== "x") node.scrollBy(0, verticalPage);
      break;
    case "\x1b[H":
    case "\x1bOH":
      if (axis === "x") {
        node.scrollTo(0, node.scrollY());
      } else {
        node.scrollTo(node.scrollX(), 0);
      }
      break;
    case "\x1b[F":
    case "\x1bOF":
      if (axis === "x") {
        node.scrollTo(node.maxScrollX(), node.scrollY());
      } else {
        node.scrollTo(node.scrollX(), node.maxScrollY());
      }
      break;
    case "\x1b[1;2D":
      if (axis !== "y") node.scrollBy(-horizontalPage, 0);
      break;
    case "\x1b[1;2C":
      if (axis !== "y") node.scrollBy(horizontalPage, 0);
      break;
    default:
      return false;
  }

  return beforeX !== node.scrollX() || beforeY !== node.scrollY();
}

export { normalizeStyledText, prepareTextInput } from "./text-spans";

// Re-export runtime
export { run, onKey } from "./runtime";
