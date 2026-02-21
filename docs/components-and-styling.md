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
- required: `text`
- optional: all `StyleProps`

- `InputProps`
- optional: `placeholder`, `onChange`, `onSubmit`, `onFocus`, `onBlur`
- optional: all `StyleProps`

- `ButtonProps`
- required: `text`, `onClick`
- optional: `onKeyDown`, `onFocus`, `onBlur`
- optional: all `StyleProps`

- `BoxProps`
- optional: `direction` (`"row" | "column"`)
- optional: all `StyleProps`

## Shared style fields (`StyleProps`)

- `border`: `{ color: number; style: "square" | "rounded" }`
- `padding`, `margin`: number or string pair (`"topBottom leftRight"`)
- `rowGap`, `columnGap`
- `background`, `foreground` (number colors)
- `flexGrow`, `flexShrink`, `flexBasis` (`number | "auto"`)
- `justifyContent`: `"start" | "end" | "flex-start" | "flex-end" | "center" | "stretch" | "space-between" | "space-around" | "space-evenly"`
- `alignItems`, `alignSelf`: `"start" | "end" | "flex-start" | "flex-end" | "center" | "baseline" | "stretch"`
- `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
- `overflow`, `overflowX`, `overflowY`: `"visible" | "hidden"`

## Colors

Use `COLORS` from the library.

```ts
import { COLORS } from "../index.ts";

const fg = COLORS.default.fg;
const bg = COLORS.default.bg;
```

Rule: pass numeric hex colors (`0xRRGGBB`), not CSS strings.

## Node methods exposed by constructors

- `setStyle(partialStyle)`
- `setText(nextText)` on `Text`, `Input`, `Button`
- `setChildren(nextChildren)` on `Box`, `Button`
- `focus()`, `blur()`, `isFocused()` on all nodes

## Practical pattern

- Build containers with `Row` and `Column`
- Keep leaf nodes (`Text`, `Input`, `Button`) referenced so you can call `setText`/`setStyle`
- Update via signals + `ff`, not manual redraw loops
