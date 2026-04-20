/** Public component, style, and node types shared by the TypeScript wrapper. */

import type { Signal } from "./signals.ts";

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Appearance = "light" | "dark" | "unknown";
export type AppearanceMode = Appearance | "auto";

export type BorderStyle = "square" | "rounded";

export type BorderProps = {
  color: number;
  style: BorderStyle;
};

export type BorderSideProps = {
  color: number;
};

export type AxisPair = number | `${number} ${number}`;
export type Direction = "row" | "column" | "rowReverse" | "columnReverse";
export type AlignItems =
  | "start"
  | "end"
  | "flexStart"
  | "flexEnd"
  | "center"
  | "baseline"
  | "stretch";
export type JustifyContent =
  | "start"
  | "end"
  | "flexStart"
  | "flexEnd"
  | "center"
  | "stretch"
  | "spaceBetween"
  | "spaceEvenly"
  | "spaceAround";
export type FlexWrap = "noWrap" | "wrap" | "wrapReverse";
export type TextWrap = "none" | "word" | "char";
export type TextOverflow = "clip" | "ellipsis";
export type Overflow = boolean | "scroll";

export type TextSpan = {
  start: number;
  end: number;
  foreground?: number;
  background?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type StyledText = {
  text: string;
  spans: readonly TextSpan[];
};

export type NormalizedTextSpan = TextSpan & {
  startByte: number;
  endByte: number;
};

export type NormalizedStyledText = {
  text: string;
  spans: readonly NormalizedTextSpan[];
  length: number;
  byteLength: number;
};


export type _StyleProps = {
  border: Signal<BorderProps | undefined>;
  borderTop: Signal<BorderSideProps | undefined>;
  borderRight: Signal<BorderSideProps | undefined>;
  borderBottom: Signal<BorderSideProps | undefined>;
  borderLeft: Signal<BorderSideProps | undefined>;
  padding: Signal<AxisPair | undefined>;
  paddingX: Signal<number | undefined>;
  paddingY: Signal<number | undefined>;
  background: Signal<number | undefined>;
  foreground: Signal<number | undefined>;
  flexGrow: Signal<number | undefined>;
  width: Signal<number | undefined>;
  height: Signal<number | undefined>;
  minWidth: Signal<number | undefined>;
  minHeight: Signal<number | undefined>;
  maxWidth: Signal<number | undefined>;
  maxHeight: Signal<number | undefined>;
  margin: Signal<AxisPair | undefined>;
  marginX: Signal<number | undefined>;
  marginY: Signal<number | undefined>;
  alignItems: Signal<AlignItems | undefined>;
  justifyContent: Signal<JustifyContent | undefined>;
  alignSelf: Signal<AlignItems | undefined>;
  flexShrink: Signal<number | undefined>;
  flexBasis: Signal<number | undefined>;
  flexWrap: Signal<FlexWrap | undefined>;
  boxSizing: Signal<"borderBox" | "contentBox" | undefined>;
};

export type _BoxProps = _StyleProps & {
  gap: Signal<number | undefined>;
  direction: Signal<Direction | undefined>;
};

export type _ScrollViewProps = _BoxProps & {
  overflow: Signal<Overflow | undefined>;
  scrollY: Signal<number>;
};

export type _TextProps = _StyleProps & {
  text: Signal<string>;
  styledText: Signal<NormalizedStyledText | undefined>;
  wrap: Signal<TextWrap | undefined>;
  textOverflow: Signal<TextOverflow | undefined>;
};

export type _InputProps = _StyleProps & {
  text: Signal<string>;
  placeholder: Signal<string | undefined>;
  multiline: Signal<boolean | undefined>;
  wrap: Signal<TextWrap | undefined>;
};

export type _ButtonProps = _StyleProps & {
  text: Signal<string>;
};


export type StyleProps = {
  border?: BorderProps;
  borderTop?: BorderSideProps;
  borderRight?: BorderSideProps;
  borderBottom?: BorderSideProps;
  borderLeft?: BorderSideProps;
  padding?: AxisPair;
  paddingX?: number;
  paddingY?: number;
  background?: number;
  foreground?: number;
  flexGrow?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  margin?: AxisPair;
  marginX?: number;
  marginY?: number;
  alignItems?: AlignItems;
  justifyContent?: JustifyContent;
  alignSelf?: AlignItems;
  flexShrink?: number;
  flexBasis?: number;
  flexWrap?: FlexWrap;
  boxSizing?: "borderBox" | "contentBox";
};

export type BoxProps = StyleProps & {
  gap?: number;
  direction?: Direction;
};

export type ScrollViewProps = Omit<BoxProps, "direction"> & {
  overflow?: never;
  scrollY?: number;
  onScroll?: (event: ScrollEvent) => void;
};

export type TextProps = StyleProps & {
  text: string | StyledText;
  wrap?: TextWrap;
  textOverflow?: TextOverflow;
};

export type InputProps = StyleProps & {
  placeholder?: string;
  multiline?: boolean;
  wrap?: TextWrap;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonProps = StyleProps & {
  text: string;
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => boolean | void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};


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


export type BoxHandlers = {};

export type ScrollViewHandlers = {
  onScroll?: (event: ScrollEvent) => void;
};

export type TextHandlers = {};

export type InputHandlers = {
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};

export type ButtonHandlers = {
  onClick: () => void | Promise<void>;
  onKeyDown?: (key: string) => boolean | void;
  onFocus?: (self: Node) => void;
  onBlur?: (self: Node) => void;
};


type CommonFields = {
  id: number;
  frame: Frame;
  contentFrame: Frame;
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
    setStyle: (
      p: Partial<StyleProps & { wrap?: TextWrap; textOverflow?: TextOverflow }>,
    ) => void;
    setText: (v: string | StyledText) => void;
  };

export type InputNode = NodeBase<typeof NODE_TYPE.Input> &
  LeafNode & {
    props: _InputProps;
    handlers: InputHandlers;
    setStyle: (
      p: Partial<
        StyleProps & {
          placeholder?: string;
          multiline?: boolean;
          wrap?: TextWrap;
        }
      >,
    ) => void;
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

export type ScrollViewNode = NodeBase<typeof NODE_TYPE.Column> &
  ContainerNode & {
    props: _ScrollViewProps;
    handlers: ScrollViewHandlers;
    setStyle: (p: Partial<Omit<ScrollViewProps, "onScroll">>) => void;
    scrollTo: (y: number) => void;
    scrollBy: (deltaY: number) => void;
    scrollToStart: () => void;
    scrollToEnd: () => void;
    scrollNodeIntoView: (node: Node) => void;
    scrollY: Signal<number>;
    viewportHeight: Signal<number>;
    contentHeight: Signal<number>;
    maxScrollY: Signal<number>;
  };

export type RowNode = Omit<BoxNode, "type" | "setStyle"> & {
  type: typeof NODE_TYPE.Row;
  setStyle: (p: Partial<Omit<BoxProps, "direction">>) => void;
};

export type ColumnNode = Omit<BoxNode, "type" | "setStyle"> & {
  type: typeof NODE_TYPE.Column;
  setStyle: (p: Partial<Omit<BoxProps, "direction">>) => void;
};

export type Node =
  | TextNode
  | InputNode
  | ButtonNode
  | ScrollViewNode
  | RowNode
  | ColumnNode
  | BoxNode;

export type ScrollEvent = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  target: Node | undefined;
};
