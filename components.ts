import { toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors.ts";
import api from "./index.ts";
import { $, ff, type Signal } from "./signals";

let text = $("Hello World");
let text2 = $("Hello World");

run(
  Column(
    {
      bg: COLORS.default.green,
      border: {
        color: COLORS.default.fg,
        style: "square",
      },
      gap: 1,
      padding: 0,
    },
    [
      Row(
        {
          bg: COLORS.default.blue,
          border: {
            color: COLORS.default.fg,
            style: "square",
          },
          gap: 4,
          padding: 0,
        },
        [
          Text({
            fg: COLORS.default.orange,
            bg: COLORS.default.grey,
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            text: text,
          }),
          Text({
            fg: COLORS.default.magenta,
            bg: COLORS.default.fg,
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            text: text2,
          }),
        ],
      ),

      Row(
        {
          bg: COLORS.default.red,
          border: {
            color: COLORS.default.fg,
            style: "square",
          },
          gap: 4,
          padding: 0,
        },
        [
          Text({
            fg: COLORS.default.orange,
            bg: COLORS.default.grey,
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            text: text2,
          }),
          Text({
            fg: COLORS.default.yellow,
            bg: COLORS.default.cyan,
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            text: text2,
          }),
        ],
      ),
    ],
  ),
);

function run(node: Node) {
  api.init_buffer();
  api.init_letui();
  process.stdin.resume();

  process.stdin.on("data", async (data) => {
    const d = data.toString();

    if (d === "\u0011") {
      api.free_buffer();
      api.deinit_letui();
      process.exit(0);
    }
  });

  let getBuffer = () => {
    const bufPtr = api.get_buffer_ptr()!;
    const bufLen = Number(api.get_buffer_len()!);

    return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
  };
  let buffer = getBuffer();

  let terminalWidth = $(api.get_width());
  let terminalHeight = $(api.get_height());

  process.stdout.on("resize", () => {
    api.update_terminal_size();

    terminalWidth(api.get_width());
    terminalHeight(api.get_height());

    api.free_buffer();
    api.init_buffer();

    buffer = getBuffer();
  });

  function layout(node: Node, parentWidth: number, parentHeight: number) {
    node.frame.width = parentWidth;
    node.frame.height = parentHeight;

    let contentWidth = 0;
    let contentHeight = 0;

    if (node.type === "column") {
      let { border = "none", padding = 0, gap = 0 } = node.props as ColumnProps;
      let borderSize = border !== "none" ? 1 : 0;

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      contentWidth = parentWidth - 2 * borderSize - 2 * paddingX;
      contentHeight = parentHeight - 2 * borderSize - 2 * paddingY;

      let currentY = borderSize + paddingY;
      let maxChildWidth = 0;

      for (let child of node.children) {
        child.frame.x = node.frame.x + borderSize + paddingX;
        child.frame.y = node.frame.y + currentY;
        layout(child, contentWidth, contentHeight);

        currentY += child.frame.height + gap;
        maxChildWidth = Math.max(maxChildWidth, child.frame.width);
      }

      node.frame.height = currentY - gap + paddingY + borderSize;
      node.frame.width = maxChildWidth + 2 * paddingX + 2 * borderSize;
    }

    if (node.type === "row") {
      let { border = "none", padding = 0, gap = 0 } = node.props as RowProps;
      let borderSize = border !== "none" ? 1 : 0;

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      contentWidth = parentWidth - 2 * borderSize - 2 * paddingX;
      contentHeight = parentHeight - 2 * borderSize - 2 * paddingY;

      let currentX = borderSize + paddingX;
      let maxChildHeight = 0;

      for (let child of node.children) {
        child.frame.x = node.frame.x + currentX;
        child.frame.y = node.frame.y + borderSize + paddingY;
        layout(child, contentWidth, contentHeight);

        currentX += child.frame.width + gap;
        maxChildHeight = Math.max(maxChildHeight, child.frame.height);
      }

      node.frame.width = currentX - gap + paddingX + borderSize;
      node.frame.height = maxChildHeight + 2 * paddingY + 2 * borderSize;
    }

    if (node.type === "text") {
      const { text, border = "none" } = node.props as TextProps;
      node.frame.width = [...text()].length;
      node.frame.height = 1;

      if (border && border !== "none") {
        node.frame.width += 2;
        node.frame.height += 2;
      }
    }
  }

  function paint(node: Node) {
    let topLeft = node.frame.y * terminalWidth() + node.frame.x;
    let bottomLeft = topLeft + (node.frame.height - 1) * terminalWidth();
    let topRight = topLeft + node.frame.width - 1;
    let bottomRight = bottomLeft + node.frame.width - 1;

    if (node.type === "column") {
      let { bg = COLORS.default.bg, border = "none" } =
        node.props as ColumnProps;

      drawBackground(buffer, node, bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          terminalHeight,
          border.color || COLORS.default.fg,
          bg,
          topLeft,
          bottomLeft,
          topRight,
          bottomRight,
        );
      }
    }

    if (node.type === "row") {
      let { bg = COLORS.default.bg, border = "none" } = node.props as RowProps;

      drawBackground(buffer, node, bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          terminalHeight,
          border.color || COLORS.default.fg,
          bg,
          topLeft,
          bottomLeft,
          topRight,
          bottomRight,
        );
      }
    }

    if (node.type === "text") {
      let {
        fg = COLORS.default.fg,
        bg = COLORS.default.bg,
        border = "none",
        text,
      } = node.props as TextProps;

      drawBackground(buffer, node, bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          terminalHeight,
          border.color || COLORS.default.fg,
          bg,
          topLeft,
          bottomLeft,
          topRight,
          bottomRight,
        );
      }

      let cells: bigint[] = [];
      for (const c of text()) {
        cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let textBuffer = new BigUint64Array(cells);
      buffer.set(
        textBuffer,
        ((node.frame.y + (border !== "none" ? 1 : 0)) * terminalWidth() +
          node.frame.x +
          (border !== "none" ? 1 : 0)) *
          3,
      );
    }

    for (let child of node.children) {
      // TODO: pass as param to paint()
      child.props.bg = child.props.bg || node.props.bg;

      paint(child);
    }
  }

  ff(() => {
    layout(node, terminalWidth(), terminalHeight());
    paint(node);
    api.flush();
  });
}

function drawBackground(
  buffer: BigUint64Array<ArrayBuffer>,
  node: Node,
  bg: number,
  terminalWidth: Signal<number>,
) {
  for (let j = node.frame.y; j < node.frame.y + node.frame.height; j++) {
    for (let i = node.frame.x; i < node.frame.x + node.frame.width; i++) {
      buffer.set(
        new BigUint64Array([
          BigInt(" ".codePointAt(0)!),
          BigInt(COLORS.default.bg),
          BigInt(bg),
        ]),
        (j * terminalWidth() + i) * 3,
      );
    }
  }
}

function setCell(
  buffer: BigUint64Array<ArrayBuffer>,
  offset: number,
  char: string,
  fg: number,
  bg: number,
) {
  buffer.set(
    new BigUint64Array([BigInt(char.codePointAt(0)!), BigInt(fg), BigInt(bg)]),
    offset,
  );
}

function drawBorder(
  buffer: BigUint64Array<ArrayBuffer>,
  node: Node,
  terminalWidth: Signal<number>,
  terminalHeight: Signal<number>,
  fg: number,
  bg: number,
  topLeft: number,
  bottomLeft: number,
  topRight: number,
  bottomRight: number,
) {
  let { width, height } = node.frame;
  let border = node.props.border as BorderProps;
  if (border === "none") return;
  let style = border.style;

  setCell(buffer, topLeft * 3, style === "square" ? "┌" : "╭", fg, bg);
  setCell(buffer, bottomLeft * 3, style === "square" ? "└" : "╰", fg, bg);

  setCell(buffer, topRight * 3, style === "square" ? "┐" : "╮", fg, bg);
  setCell(buffer, bottomRight * 3, style === "square" ? "┘" : "╯", fg, bg);

  for (let i = 1; i < height - 1; i++) {
    setCell(buffer, (topLeft + i * terminalWidth()) * 3, "│", fg, bg);
    setCell(buffer, (topRight + i * terminalWidth()) * 3, "│", fg, bg);
  }

  for (let i = 1; i < width - 1; i++) {
    setCell(buffer, (topLeft + i) * 3, "─", fg, bg);
    setCell(buffer, (bottomLeft + i) * 3, "─", fg, bg);
  }
}

function Column(props: ColumnProps, children: Array<Node>): Node {
  return {
    type: "column",
    props,
    frame: getInitialFrame(),
    children,
  };
}

function Row(props: RowProps, children: Array<Node>): Node {
  return {
    type: "row",
    props,
    frame: getInitialFrame(),
    children,
  };
}

function Text(props: TextProps): Node {
  return {
    type: "text",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

function getInitialFrame(): Frame {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ComponentType = "column" | "row" | "input" | "button" | "text";

type Node = {
  type: ComponentType;
  children: Array<Node>;
  props: ColumnProps | RowProps | InputBoxProps | ButtonProps | TextProps;
  frame: Frame;
};

type ColumnProps = {
  padding?: number | `${number} ${number}`;
  gap?: number;
  border?: BorderProps;
  bg?: number;
};
type TextProps = {
  text: Signal<string>;
  fg?: number;
  bg?: number;
  border?: BorderProps;
};
type BorderStyle = "square" | "rounded";
type BorderProps =
  | {
      color: number;
      style: BorderStyle;
    }
  | "none";

function Button(opts: ButtonProps) {}
function InputBox(opts: InputBoxProps) {}
type RowProps = {
  padding?: number | `${number} ${number}`;
  gap?: number;
  border?: BorderProps;
  bg?: number;
};
type ButtonProps = {
  bg?: number;
  border?: BorderProps;
};
type InputBoxProps = {
  bg?: number;
  text: string;
  border: BorderProps;
  onBlur: () => void;
  onFocus: () => void;
  onType: () => void;
};
