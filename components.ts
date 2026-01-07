import { $, type Signal } from "./signals";
import type {
  Frame,
  Node,
  BoxProps,
  TextProps,
  InputProps,
  ButtonProps,
  StyleProps,
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
  BorderStyle,
  BorderProps,
} from "./types";

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
    padding: $(input.padding),
    background: $(input.background),
    foreground: $(input.foreground),
    flexGrow: $(input.flexGrow),
  };
}

function createBoxSignals(input: BoxProps): _BoxProps {
  return {
    ...createStyleSignals(input),
    gap: $(input.gap),
    direction: $(input.direction),
  };
}

function createTextSignals(input: TextProps): _TextProps {
  return {
    ...createStyleSignals(input),
    text: $(input.text),
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

export function Box(input: BoxProps, children: Node[]): Node {
  const props = createBoxSignals(input);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "box",
    id: generateId(),
    props,
    handlers: {},
    frame: getInitialFrame(),
    frameWidth,
    frameHeight,
    children: childrenSignal,
    setChildren: (nodes) => childrenSignal(nodes),
    setStyle: makeSetStyle(props),
    focus: () => focusNode(node),
    blur: () => blurNode(node),
    isFocused: () => focusedNode === node,
  };

  return node;
}

export function Column(
  props: Omit<BoxProps, "direction">,
  children: Node[],
): Node {
  return Box({ ...props, direction: "column" }, children);
}

export function Row(
  props: Omit<BoxProps, "direction">,
  children: Node[],
): Node {
  return Box({ ...props, direction: "row" }, children);
}

export function Text(input: TextProps): Node {
  const props = createTextSignals(input);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "text",
    id: generateId(),
    props,
    handlers: {},
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

export function Input(input: InputProps): Node {
  const { onChange, onSubmit, onFocus, onBlur, ...styleInput } = input;
  const props = createInputSignals(styleInput);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "input",
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

export function Button(input: ButtonProps, children: Node[] = []): Node {
  const { onClick, onKeyDown, onFocus, onBlur, ...styleInput } = input;
  const props = createButtonSignals(styleInput);
  const childrenSignal = $(children);
  const frameWidth = $(0);
  const frameHeight = $(0);

  const node: Node = {
    type: "button",
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

// Re-export runtime
export { run, onKey } from "./runtime";
