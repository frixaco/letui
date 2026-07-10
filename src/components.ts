/**
 * Component constructors, focus state, and focus management for the TS wrapper.
 */

import { $, type Signal } from "./signals.ts";
import { normalizeStyledText, prepareTextInput } from "./text.ts";
import { NODE_TYPE } from "./types.ts";
import type {
  Frame,
  Node,
  BoxNode,
  ColumnNode,
  BoxProps,
  ScrollViewNode,
  ScrollViewProps,
  TextNode,
  TextProps,
  InputNode,
  InputProps,
  ButtonNode,
  ButtonProps,
  StyleProps,
  BoxKind,
  Direction,
  StyledText,
  NormalizedStyledText,
  TextWrap,
  Overflow,
  _StyleProps,
  _BoxProps,
  _ScrollViewProps,
  _TextProps,
  _InputProps,
  _ButtonProps,
} from "./types.ts";

export function Box(input: BoxProps, children: Node[]): BoxNode {
  const revision = createNodeRevision();
  const props = createBoxSignals(input, revision.mark);
  const childrenSignal = $(children, revision.mark);
  const frameWidth = $(0);
  const frameHeight = $(0);
  const initialType = directionToBoxKind(input.direction);
  const setStyleSignals = makeSetStyle(props);

  const node: BoxNode = {
    type: initialType,
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: (newProps) => {
      if (newProps.direction !== undefined) {
        node.type = directionToBoxKind(newProps.direction);
      }
      setStyleSignals(newProps);
    },
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  revision.register(node);
  return node;
}

export function ScrollView(input: ScrollViewProps, children: Node[]): ScrollViewNode {
  const revision = createNodeRevision();
  const { onScroll, ...styleInput } = input;
  const props = createScrollViewSignals(styleInput, revision.mark);
  const childrenSignal = $(children, revision.mark);
  const frameWidth = $(0);
  const frameHeight = $(0);
  const viewportHeight = $(0);
  const contentHeight = $(0);
  const maxScrollY = $(0);
  const setStyleSignals = makeSetStyle(props);

  const node: ScrollViewNode = {
    type: NODE_TYPE.Column,
    id: generateId(),
    props,
    handlers: { onScroll },
    frame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: (newProps) => {
      const { scrollY, ...nextStyle } = newProps;
      if (scrollY !== undefined) {
        setScrollPosition(node, scrollY);
      }
      setStyleSignals(nextStyle);
    },
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
    scrollTo: (y) => setScrollPosition(node, y),
    scrollBy: (deltaY) => setScrollPosition(node, node.scrollY() + deltaY),
    scrollToStart: () => setScrollPosition(node, 0),
    scrollToEnd: () => setScrollPosition(node, node.maxScrollY()),
    scrollNodeIntoView: (target) => scrollNodeIntoView(node, target),
    scrollY: props.scrollY,
    viewportHeight,
    contentHeight,
    maxScrollY,
  };

  revision.register(node);
  return node;
}

export function Column(props: Omit<BoxProps, "direction">, children: Node[]): ColumnNode {
  const input: BoxProps = { ...props, direction: "column" };

  return Box(input, children) as ColumnNode;
}

export function Row(props: Omit<BoxProps, "direction">, children: Node[]): BoxNode {
  return Box({ ...props, direction: "row" }, children);
}

export function Text(input: TextProps): TextNode {
  const revision = createNodeRevision();
  const props = createTextSignals(input, revision.mark);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: TextNode = {
    type: NODE_TYPE.Text,
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
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

  revision.register(node);
  return node;
}

export function Input(input: InputProps): InputNode {
  const revision = createNodeRevision();
  const { onChange, onSubmit, onFocus, onBlur, ...styleInput } = input;
  const props = createInputSignals(styleInput, revision.mark);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: InputNode = {
    type: NODE_TYPE.Input,
    id: generateId(),
    props,
    handlers: { onChange, onSubmit, onFocus, onBlur },
    frame: getInitialFrame(),
    contentFrame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(prepareTextInput(v).text),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  revision.register(node);
  return node;
}

export function Button(input: ButtonProps, children: Node[] = []): ButtonNode {
  const revision = createNodeRevision();
  const { onClick, onKeyDown, onFocus, onBlur, ...styleInput } = input;
  const props = createButtonSignals(styleInput, revision.mark);
  const childrenSignal = $(children, revision.mark);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: ButtonNode = {
    type: NODE_TYPE.Button,
    id: generateId(),
    props,
    handlers: { onClick, onKeyDown, onFocus, onBlur },
    frame: getInitialFrame(),
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

  revision.register(node);
  return node;
}

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
    markNodeDirty(prev);
    focusVersion(focusVersion() + 1);
    const handler = (prev.handlers as any).onBlur;
    if (handler) handler(prev);
  }

  focusedNode = node;
  markNodeDirty(node);
  focusVersion(focusVersion() + 1);
  const handler = (node.handlers as any).onFocus;
  if (handler) handler(node);
}

function createStyleSignals(input: StyleProps, onChange: () => void): _StyleProps {
  return {
    border: $(input.border, onChange),
    borderTop: $(input.borderTop, onChange),
    borderRight: $(input.borderRight, onChange),
    borderBottom: $(input.borderBottom, onChange),
    borderLeft: $(input.borderLeft, onChange),
    padding: $(input.padding, onChange),
    paddingX: $(input.paddingX, onChange),
    paddingY: $(input.paddingY, onChange),
    background: $(input.background, onChange),
    foreground: $(input.foreground, onChange),
    flexGrow: $(input.flexGrow, onChange),
    width: $(input.width, onChange),
    height: $(input.height, onChange),
    minWidth: $(input.minWidth, onChange),
    minHeight: $(input.minHeight, onChange),
    maxWidth: $(input.maxWidth, onChange),
    maxHeight: $(input.maxHeight, onChange),
    margin: $(input.margin, onChange),
    marginX: $(input.marginX, onChange),
    marginY: $(input.marginY, onChange),
    alignItems: $(input.alignItems, onChange),
    justifyContent: $(input.justifyContent, onChange),
    alignSelf: $(input.alignSelf, onChange),
    flexShrink: $(input.flexShrink, onChange),
    flexBasis: $(input.flexBasis, onChange),
    flexWrap: $(input.flexWrap, onChange),
    boxSizing: $(input.boxSizing, onChange),
  };
}

function createBoxSignals(input: BoxProps, onChange: () => void): _BoxProps {
  return {
    ...createStyleSignals(input, onChange),
    gap: $(input.gap, onChange),
    direction: $(input.direction, onChange),
  };
}

function createScrollViewSignals(
  input: Omit<ScrollViewProps, "onScroll">,
  onChange: () => void,
): _ScrollViewProps {
  return {
    ...createBoxSignals({ ...input, direction: "column" }, onChange),
    overflow: $("scroll" as Overflow | undefined, onChange),
    scrollY: $(normalizeScrollValue(input.scrollY), onChange),
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

function createTextSignals(input: TextProps, onChange: () => void): _TextProps {
  const resolved = resolveTextValue(input.text);

  return {
    ...createStyleSignals(input, onChange),
    text: $(resolved.text, onChange),
    styledText: $(resolved.styledText, onChange),
    wrap: $(input.wrap, onChange),
    textOverflow: $(input.textOverflow, onChange),
  };
}

function createInputSignals(
  input: {
    placeholder?: string;
    multiline?: boolean;
    wrap?: TextWrap;
  } & StyleProps,
  onChange: () => void,
): _InputProps {
  return {
    ...createStyleSignals(input, onChange),
    text: $("", onChange),
    placeholder: $(input.placeholder, onChange),
    multiline: $(input.multiline, onChange),
    wrap: $(input.wrap, onChange),
  };
}

function createButtonSignals(
  input: { text: string } & StyleProps,
  onChange: () => void,
): _ButtonProps {
  return {
    ...createStyleSignals(input, onChange),
    text: $(prepareTextInput(input.text).text, onChange),
  };
}

const generateId = (() => {
  let counter = 1;
  return () => counter++;
})();

let focusedNode: Node | null = null;
const focusVersion = $(0);

function getInitialFrame(): Frame {
  return { x: 0, y: 0, width: 0, height: 0 };
}

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
        const signal = (props as any)[key] as Signal<unknown>;
        if (!shallowEqual(signal.peek(), value)) signal(value);
      }
    }
  };
}

export function getNodeRenderVersion(node: Node): number {
  return nodeRevisions.get(node)?.() ?? 0;
}

function createNodeRevision(): { mark: () => void; register: (node: Node) => void } {
  let version = 0;
  const revision = $(version);
  const mark = () => revision(++version);
  return {
    mark,
    register: (node) => {
      nodeRevisions.set(node, revision);
      nodeDirtyMarkers.set(node, mark);
    },
  };
}

function markNodeDirty(node: Node): void {
  nodeDirtyMarkers.get(node)?.();
}

function shallowEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => Object.is(value, (right as Record<string, unknown>)[key]))
  );
}

const nodeRevisions = new WeakMap<Node, Signal<number>>();
const nodeDirtyMarkers = new WeakMap<Node, () => void>();

function directionToBoxKind(direction: Direction | undefined): BoxKind {
  return direction?.startsWith("row") ? NODE_TYPE.Row : NODE_TYPE.Column;
}

type ScrollViewInternal = ScrollViewNode & {
  scrollMeasured?: boolean;
};

export function syncScrollViewMetrics(
  node: ScrollViewNode,
  metrics: {
    viewportHeight: number;
    maxScrollY: number;
  },
): void {
  const internal = node as ScrollViewInternal;
  const viewportHeight = Math.max(0, Math.floor(metrics.viewportHeight));
  const maxScrollY = Math.max(0, Math.floor(metrics.maxScrollY));
  node.viewportHeight(viewportHeight);
  node.contentHeight(viewportHeight + maxScrollY);
  node.maxScrollY(maxScrollY);
  internal.scrollMeasured = true;
  setScrollPosition(node, node.scrollY());
}

function setScrollPosition(node: ScrollViewNode, nextScrollY: number): void {
  const internal = node as ScrollViewInternal;
  const normalized = normalizeScrollValue(nextScrollY);
  const clamped =
    internal.scrollMeasured === true
      ? clamp(0, normalized, node.maxScrollY())
      : Math.max(0, normalized);
  if (node.scrollY() !== clamped) {
    node.scrollY(clamped);
  }
}

function scrollNodeIntoView(viewport: ScrollViewNode, target: Node): void {
  const viewportHeight = Math.max(0, Math.floor(viewport.contentFrame.height));
  const targetHeight = Math.max(0, Math.ceil(target.frame.height));
  if (viewportHeight === 0 || targetHeight === 0) return;

  const targetTop = Math.floor(target.frame.y - viewport.contentFrame.y);
  const targetBottom = targetTop + targetHeight;
  const currentTop = viewport.scrollY();
  const currentBottom = currentTop + viewportHeight;

  if (targetTop < currentTop) {
    setScrollPosition(viewport, targetTop);
    return;
  }

  if (targetBottom > currentBottom) {
    setScrollPosition(viewport, targetBottom - viewportHeight);
  }
}

function normalizeScrollValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(Math.max(0, value)) : 0;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function blurNode(node: Node): void {
  if (focusedNode !== node) return;
  focusedNode = null;
  focusVersion(focusVersion() + 1);
  const handler = (node.handlers as any).onBlur;
  if (handler) handler(node);
}
