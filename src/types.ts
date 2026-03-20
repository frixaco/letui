import type { Signal } from "./signals";

// =============================================================================
// CORE TYPES
// =============================================================================

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BorderStyle = "square" | "rounded";

export type BorderProps = {
  color: number;
  style: BorderStyle;
};

// =============================================================================
// INTERNAL PROP TYPES (signal-based, used inside nodes)
// =============================================================================

export type _StyleProps = {
  border: Signal<BorderProps | undefined>;
  padding: Signal<number | `${number} ${number}` | undefined>;
  background: Signal<number | undefined>;
  foreground: Signal<number | undefined>;
  flexGrow: Signal<number | undefined>;
};

export type _BoxProps = _StyleProps & {
  gap: Signal<number | undefined>;
  direction: Signal<"row" | "column" | undefined>;
};

export type _TextProps = _StyleProps & {
  text: Signal<string>;
};

export type _InputProps = _StyleProps & {
  text: Signal<string>;
  placeholder: Signal<string | undefined>;
};

export type _ButtonProps = _StyleProps & {
  text: Signal<string>;
};

// =============================================================================
// USER-FACING PROP TYPES (plain values, passed to constructors)
// =============================================================================

export type StyleProps = {
  border?: BorderProps;
  padding?: number | `${number} ${number}`;
  background?: number;
  foreground?: number;
  flexGrow?: number;
};

export type BoxProps = StyleProps & {
  gap?: number;
  direction?: "row" | "column";
};

export type TextProps = StyleProps & {
  text: string;
};

export type InputProps = StyleProps & {
  placeholder?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonProps = StyleProps & {
  text: string;
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

// =============================================================================
// NODE KIND
// =============================================================================

export const NODE_TYPE = {
  Row: "Row",
  Column: "Column",
  Button: "Button",
  Input: "Input",
  Text: "Text",
} as const;

export type NodeKind = (typeof NODE_TYPE)[keyof typeof NODE_TYPE];
export type BoxKind = (typeof NODE_TYPE)[keyof Pick<
  typeof NODE_TYPE,
  "Row" | "Column"
>];

export const NODE_KIND_ID: Record<NodeKind, number> = {
  [NODE_TYPE.Row]: 1,
  [NODE_TYPE.Column]: 2,
  [NODE_TYPE.Button]: 3,
  [NODE_TYPE.Input]: 4,
  [NODE_TYPE.Text]: 5,
} as const;

export type NodeKindNum = (typeof NODE_KIND_ID)[NodeKind];

// =============================================================================
// HANDLER TYPES (plain functions, not reactive)
// =============================================================================

export type BoxHandlers = {};

export type TextHandlers = {};

export type InputHandlers = {
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonHandlers = {
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

// =============================================================================
// NODE TYPE
// =============================================================================

type CommonFields = {
  id: number;
  frame: Frame;
  frameWidth: Signal<number>;
  frameHeight: Signal<number>;
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
};

type ContainerNode = {
  children: Signal<Node[]>;
  setChildren: (nodes: Node[]) => void;
};

type LeafNode = {
  children: undefined;
  setChildren: undefined;
};

type NodeBase<K extends NodeKind> = CommonFields & {
  type: K;
};

export type TextNode = NodeBase<typeof NODE_TYPE.Text> &
  LeafNode & {
    props: _TextProps;
    handlers: TextHandlers;
    setStyle: (p: Partial<StyleProps>) => void;
    setText: (v: string) => void;
  };

export type InputNode = NodeBase<typeof NODE_TYPE.Input> &
  LeafNode & {
    props: _InputProps;
    handlers: InputHandlers;
    setStyle: (p: Partial<StyleProps & { placeholder?: string }>) => void;
    setText: (v: string) => void;
  };

export type ButtonNode = NodeBase<typeof NODE_TYPE.Button> &
  ContainerNode & {
    props: _ButtonProps;
    handlers: ButtonHandlers;
    setStyle: (p: Partial<StyleProps & { text?: string }>) => void;
    setText: (v: string) => void;
  };

export type BoxNode = NodeBase<BoxKind> &
  ContainerNode & {
    props: _BoxProps;
    handlers: BoxHandlers;
    setStyle: (p: Partial<BoxProps>) => void;
  };

export type Node = TextNode | InputNode | ButtonNode | BoxNode;
