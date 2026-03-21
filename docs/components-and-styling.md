# components and styling

## Constructors

```ts
Box(input: BoxProps, children: Node[]): Node
Column(input: Omit<BoxProps, "direction">, children: Node[]): Node
Row(input: Omit<BoxProps, "direction">, children: Node[]): Node
Text(input: TextProps): Node
Input(input: InputProps): Node
Button(input: ButtonProps, children?: Node[]): Node
```

## Required vs optional props

- `TextProps`
  - required: `text` (`string | StyledText`)
  - optional: `wrap` (`"none" | "word" | "char"`)
  - optional: `textOverflow` (`"clip" | "ellipsis"`)
  - optional: all `StyleProps`

- `InputProps`
  - optional: `placeholder` (`string`)
  - optional: `multiline` (`boolean`)
  - optional: `wrap` (`"word" | "char"`) — note: `"none"` not allowed for inputs
  - optional: `onChange`, `onSubmit`, `onFocus`, `onBlur`
  - optional: all `StyleProps`

- `ButtonProps`
  - required: `text`, `onClick`
  - optional: `onKeyDown`, `onFocus`, `onBlur`
  - optional: all `StyleProps`

- `BoxProps`
  - optional: `gap` (`number`)
  - optional: `direction` (`"row" | "column" | "rowReverse" | "columnReverse"`)
  - optional: all `StyleProps`

## Shared style fields (`StyleProps`)

- `border`: `{ color: number; style: "square" | "rounded" }`
- `borderTop`, `borderRight`, `borderBottom`, `borderLeft`: `{ color: number }`
- `padding`: number or string pair (`"horizontal vertical"`)
- `paddingX`, `paddingY`
- `background`, `foreground` (number colors)
- `flexGrow`
- `width`, `height`
- `minWidth`, `minHeight`
- `maxWidth`, `maxHeight`
- `margin`: number or string pair (`"horizontal vertical"`)
- `marginX`, `marginY`
- `alignItems`
- `justifyContent`
- `alignSelf`
- `flexShrink`
- `flexBasis`
- `flexWrap`

## Box layout fields (`BoxProps`)

- `gap`
- `direction`: `"row" | "column" | "rowReverse" | "columnReverse"`

## Current scope

- Public styling/layout surface is the exported `StyleProps` + `BoxProps` above.
- `overflow`, scrolling, and other non-exported props are not part of the public API.
- Prefer `Row` / `Column` for common cases; use `Box` when you need explicit `direction`, including reverse directions.

## Colors

Use `COLORS` from the library.

```ts
import { COLORS } from "../index.ts";

const fg = COLORS.default.fg;
const bg = COLORS.default.bg;
```

Rule: pass numeric hex colors (`0xRRGGBB`), not CSS strings.

## Node methods exposed by constructors

- `setStyle(partialStyle)` on all nodes
- `setText(nextText)` on `Text`, `Input`, `Button`
- `setChildren(nextChildren)` on `Box`, `Button`
- `focus()`, `blur()`, `isFocused()` on all nodes

## Text styling with `StyledText`

For rich text with multiple colors and styles within a single `Text` node, use `StyledText`:

```ts
import type { StyledText, TextSpan } from "@frixaco/letui";

const styled: StyledText = {
  text: "bold red text and normal text",
  spans: [
    { start: 0, end: 14, foreground: 0xff0000, bold: true },
    { start: 19, end: 30, foreground: 0xcccccc },
  ],
};

const node = Text({ text: styled });
```

Each `TextSpan` supports:
- `start`, `end`: character positions in the text
- `foreground?: number` — text color (hex)
- `background?: number` — background color (hex)
- `bold?: boolean`
- `italic?: boolean`
- `underline?: boolean`

## Practical pattern

- Build containers with `Row` and `Column`
- Keep leaf nodes (`Text`, `Input`, `Button`) referenced so you can call `setText`/`setStyle`
- Update via signals + `ff`, not manual redraw loops
- If prop meaning is unclear, check exported types in `src/types.ts`
