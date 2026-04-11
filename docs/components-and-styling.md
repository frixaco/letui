# components and styling

## Constructors

```ts
Box(input: BoxProps, children: Node[]): Node
Column(input: ColumnProps, children: Node[]): Node
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
  - behavior note: explicit newlines always start a new visual row before wrapping

- `InputProps`
  - optional: `placeholder` (`string`)
  - optional: `multiline` (`boolean`)
  - optional: `wrap` (`"word" | "char"`) — note: `"none"` not allowed for inputs
  - optional: `onChange`, `onSubmit`, `onFocus`, `onBlur`
  - optional: all `StyleProps`
  - current behavior note: `multiline` lets Enter insert `\n`, but `Input` is still append-only today
  - current limitation: `placeholder` is accepted by props but is not rendered yet

- `ButtonProps`
  - required: `text`, `onClick`
  - optional: `onKeyDown`, `onFocus`, `onBlur`
  - optional: all `StyleProps`

- `BoxProps`
  - optional: `gap` (`number`)
  - optional: `direction` (`"row" | "column" | "rowReverse" | "columnReverse"`)
  - optional: all `StyleProps`

- `ScrollViewProps`
  - optional: all `Omit<BoxProps, "direction">`
  - optional: `scrollY` (`number`)
  - behavior note: `ScrollView` always uses vertical scrolling
  - behavior note: `scrollY` is vertical-only and interpreted in row units

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

## ScrollView Scrolling

- `ScrollView` is the only public scrolling container in v1
- scrolling is vertical-only in v1
- `scrollY` is paint-time state, not tree-shape state, so updates stay on the style-diff path
- Rust clamps `scrollY`, floors fractional values to whole rows, and decides final visible hit-testing
- `Row`, `Column`, and `Box` do not expose scrolling props in v1

## Current scope

- Public styling/layout surface is the exported `StyleProps` + `BoxProps` above.
- `ScrollViewProps` adds the only public scrolling surface in v1: `scrollY`.
- Prefer `Row` / `Column` for common cases; use `Box` when you need explicit `direction`, including reverse directions.
- `Text` wrapping and overflow are renderer-owned behaviors; do not expect JS-side wrapping helpers to be the source of truth.
- `Input` supports wrapped rendering for its current text, but full editor behavior is still out of scope.

## Colors

Bring your own palette. letui only accepts numeric RGB values; it does not ship a theme.

```ts
const palette = {
  fg: 0xf5f7fa,
  surface: 0x16181a,
} as const;
```

Rule: pass numeric hex colors (`0xRRGGBB`), not CSS strings.

If you want the app palette to follow the terminal theme, use the runtime `appearance()` helper inside `ff(...)` and switch your numeric palette there.

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
