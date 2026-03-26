# components and styling

## Constructors

```ts
Box(input: BoxProps & BoxEventProps, children: Node[]): Node
Column(input: Omit<BoxProps, "direction"> & BoxEventProps, children: Node[]): Node
Row(input: Omit<BoxProps, "direction"> & BoxEventProps, children: Node[]): Node
ScrollView(input: ScrollViewProps, children: Node[]): Node
Text(input: TextProps): Node
Input(input: InputProps): Node
Button(input: ButtonProps, children?: Node[]): Node
VirtualList(input: FixedVirtualListOptions<TItem, TRow>): Node
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

- `ScrollViewProps`
  - optional: `axis` (`"y" | "x" | "both"`)
  - optional: `sticky` (`"start" | "end"`)
  - optional: `wheelStep` (`number`)
  - optional: `keyboard` (`boolean`)
  - optional: `onScroll(state)`
  - optional: all `StyleProps`

- `BoxProps`
  - optional: `gap` (`number`)
  - optional: `direction` (`"row" | "column" | "rowReverse" | "columnReverse"`)
  - optional: all `StyleProps`

- `BoxEventProps`
  - optional: `onWheel(event)` for custom wheel handling on `Box` / `Row` / `Column`
  - `event`: `{ x, y, deltaX, deltaY, shift, alt, ctrl, raw }`
  - return `true` to consume and stop bubbling; return `false`/`void` to bubble to parent container

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

- Public styling/layout surface is the exported `StyleProps`, `BoxProps`, and `ScrollViewProps` above.
- `overflow` remains internal; public scrolling uses `ScrollView`.
- Prefer `Row` / `Column` for common cases; use `Box` when you need explicit `direction`, including reverse directions.

## Wheel Routing

- wheel routing targets the deepest `ScrollView` or box with `onWheel` under the cursor
- events bubble up through parent containers until one handler consumes the event
- wheel events now carry both `deltaX` and `deltaY`
- `Shift+wheel` maps vertical wheel to horizontal scroll inside `ScrollView`

## Virtual List Notes

- `VirtualList(...)` is fixed-row virtualization only
- rows are created once with `createRow(...)`, then rebound with `bindRow(...)`
- wrapped content should be flattened into visual rows before virtualization
- `createVirtualListController(...)` is legacy compatibility surface

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
- `scrollTo`, `scrollBy`, `scrollToStart`, `scrollToEnd`, `ensureVisible` on `ScrollView`
- `scrollToIndex`, `ensureIndexVisible` on `VirtualList`
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
