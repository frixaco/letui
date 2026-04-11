/** Public package surface for letui. */

// --- Public API ---
export * from "./src/components";
export * from "./src/colors";
export * from "./src/signals";
export * from "./src/runtime";
export * from "./src/text";
export { NODE_TYPE, NODE_KIND_ID } from "./src/types";
export type {
  Frame,
  Node,
  BoxProps,
  ScrollViewProps,
  TextProps,
  InputProps,
  ButtonProps,
  StyleProps,
  AxisPair,
  Direction,
  AlignItems,
  JustifyContent,
  FlexWrap,
  TextWrap,
  TextOverflow,
  Overflow,
  BorderStyle,
  BorderProps,
  BorderSideProps,
  TextSpan,
  StyledText,
  NormalizedTextSpan,
  NormalizedStyledText,
} from "./src/types";

// TODO: expose the raw FFI surface for low-level use cases?
