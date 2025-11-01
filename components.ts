import { toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors.ts";
import api from "./index.ts";
import { $, ff, type Signal } from "./signals";

let text = $("Hello World");

run(
  Column(
    {
      border: {
        style: "square",
      },
      gap: 2,
      padding: 0,
    },
    [
      Text({
        border: {
          style: "square",
        },
        text: text,
        fg: COLORS.default.orange,
      }),
    ],
  ),
);

function paintRectangle() {}

function drawBorder(
  i: number,
  { x, y, width, height }: Frame,
  tw: number,
  th: number,
) {}

function updateBuffer(idx: number, value: bigint) {}

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
    node.frame.x = 0;
    node.frame.y = 0;
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

      for (let child of node.children) {
        child.frame.x = borderSize + paddingX;
        child.frame.y = currentY;

        layout(child, contentWidth, contentHeight);

        currentY += child.frame.height + gap;
      }

      node.frame.height = currentY - gap + paddingY + borderSize;
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
    if (node.type === "column") {
      let { bg, border = "none" } = node.props as ColumnProps;
      // TODO:
    }
    if (node.type === "text") {
      let {
        fg = COLORS.default.fg,
        bg = COLORS.default.bg,
        border = "none",
        text,
      } = node.props as TextProps;
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

      let topLeft = node.frame.y * terminalWidth() + node.frame.x;
      let bottomLeft = topLeft + (node.frame.height - 1) * terminalWidth();
      let topRight = topLeft + node.frame.width - 1;
      let bottomRight = bottomLeft + node.frame.width - 1;

      if (border !== "none") {
        buffer.set(
          new BigUint64Array([
            border.style === "square"
              ? BigInt("┌".codePointAt(0)!)
              : BigInt("╭".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          topLeft * 3,
        );
        buffer.set(
          new BigUint64Array([
            border.style === "square"
              ? BigInt("└".codePointAt(0)!)
              : BigInt("╰".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          bottomLeft * 3,
        );

        buffer.set(
          new BigUint64Array([
            border.style === "square"
              ? BigInt("┐".codePointAt(0)!)
              : BigInt("╮".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          topRight * 3,
        );
        buffer.set(
          new BigUint64Array([
            border.style === "square"
              ? BigInt("┘".codePointAt(0)!)
              : BigInt("╯".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          bottomRight * 3,
        );

        // Side lines
        for (let i = 1; i < node.frame.height - 1; i++) {
          buffer.set(
            new BigUint64Array([
              BigInt("│".codePointAt(0)!),
              BigInt(fg),
              BigInt(bg),
            ]),
            (topLeft + i * terminalWidth()) * 3,
          );
          buffer.set(
            new BigUint64Array([
              BigInt("│".codePointAt(0)!),
              BigInt(fg),
              BigInt(bg),
            ]),
            (topRight + i * terminalWidth()) * 3,
          );
        }

        // Top/bottom lines
        for (let i = 1; i < node.frame.width - 1; i++) {
          buffer.set(
            new BigUint64Array([
              BigInt("─".codePointAt(0)!),
              BigInt(fg),
              BigInt(bg),
            ]),
            (topLeft + i) * 3,
          );
          buffer.set(
            new BigUint64Array([
              BigInt("─".codePointAt(0)!),
              BigInt(fg),
              BigInt(bg),
            ]),
            (bottomLeft + i) * 3,
          );
        }
      }
    }
    // if node has bg, paint it
    // if node has border, paint it
    // if node has fg, paint it
    // for each children call paint
    //
    // draw top, bottom, left and right borders at rectangle edges

    for (let child of node.children) {
      paint(child);
    }

    api.flush();
  }

  ff(() => {
    layout(node, terminalWidth(), terminalHeight());
    paint(node);
  });
}

function Column(props: ColumnProps, children: Array<Node>): Node {
  return {
    type: "column",
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
type BorderProps =
  | {
      color?: number;
      style: "square" | "rounded";
    }
  | "none";

function Row(opts: RowProps, children: Node[]) {}
function Button(opts: ButtonProps) {}
function InputBox(opts: InputBoxProps) {}
type RowProps = {};
type ButtonProps = {};
type InputBoxProps = {
  text: string;
  border: BorderProps;
  onBlur: () => void;
  onFocus: () => void;
  onType: () => void;
};
