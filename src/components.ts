import { $, type Signal } from "./signals";
import { normalizeStyledText } from "./text-spans";
import { NODE_TYPE } from "./types";
import type {
  Frame,
  Node,
  BoxNode,
  BoxProps,
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
  _StyleProps,
  _BoxProps,
  _TextProps,
  _InputProps,
  _ButtonProps,
} from "./types";

// Re-export types for convenience
export type {
  Frame,
  Node,
  BoxProps,
  TextProps,
  InputProps,
  ButtonProps,
  StyleProps,
  AxisPair,
  Direction,
  AlignItems,
  JustifyContent,
  FlexWrap,
  BorderStyle,
  BorderProps,
  BorderSideProps,
  TextSpan,
  StyledText,
  NormalizedTextSpan,
  NormalizedStyledText,
} from "./types";
export { NODE_TYPE } from "./types";

// =============================================================================
// INTERNALS
// =============================================================================

const generateId = (() => {
  let counter = 1;
  return () => counter++;
})();

function getInitialFrame(): Frame {
  return { x: 0, y: 0, width: 0, height: 0 };
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
      text: input,
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
    props.text(input);
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
  };
}

function createInputSignals(
  input: { placeholder?: string } & StyleProps,
): _InputProps {
  return {
    ...createStyleSignals(input),
    text: $(""),
    placeholder: $(input.placeholder),
  };
}

function createButtonSignals(
  input: { text: string } & StyleProps,
): _ButtonProps {
  return {
    ...createStyleSignals(input),
    text: $(input.text),
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

// =============================================================================
// FOCUS MANAGEMENT
// =============================================================================

let focusedNode: Node | null = null;

export function getFocusedNode(): Node | null {
  return focusedNode;
}

export function focusNode(node: Node): void {
  if (focusedNode === node) return;

  if (focusedNode) {
    const prev = focusedNode;
    focusedNode = null;
    const handler = (prev.handlers as any).onBlur;
    if (handler) handler(prev);
  }

  focusedNode = node;
  const handler = (node.handlers as any).onFocus;
  if (handler) handler(node);
}

function blurNode(node: Node): void {
  if (focusedNode !== node) return;
  focusedNode = null;
  const handler = (node.handlers as any).onBlur;
  if (handler) handler(node);
}

// =============================================================================
// CONSTRUCTORS
// =============================================================================

export function Box(input: BoxProps, children: Node[]): BoxNode {
  const props = createBoxSignals(input);
  const childrenSignal = $(children);
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

  return node;
}

export function Column(
  props: Omit<BoxProps, "direction">,
  children: Node[],
): BoxNode {
  return Box({ ...props, direction: "column" }, children);
}

export function Row(
  props: Omit<BoxProps, "direction">,
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
    frameWidth,
    frameHeight,
    children: undefined,
    setChildren: undefined,
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

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
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: makeSetStyle(props),
    setText: (v) => props.text(v),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export { normalizeStyledText } from "./text-spans";

// Re-export runtime
export { run, onKey } from "./runtime";
