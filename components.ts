import { toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors.ts";
import api from "./index.ts";
import { $, ff, type Signal } from "./signals";

function randomString(length = 6) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

let text = $("Search");
let text2 = $("How are you?");
let text3 = $("prev");
let text4 = $("next");

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
          gap: 4,
          padding: 0,
        },
        [
          InputBox({
            fg: COLORS.default.fg,
            bg: COLORS.default.bg,
            border: {
              color: COLORS.default.fg,
              style: "square",
            },
            text: text4,
            onType: (value: string) => {
              text4(value);
            },
            onFocus: () => {
              // set border color
            },
            onBlur: () => {
              // reset border color
            },
          }),

          Button({
            fg: COLORS.default.fg,
            bg: COLORS.default.bg,
            padding: "4 1",
            text: text,
            onClick: () => {},
          }),
        ],
      ),

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
              bg: COLORS.default.red,
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

      Row(
        {
          bg: COLORS.default.red,
          gap: 4,
          padding: 0,
        },
        [
          Button({
            fg: COLORS.default.fg,
            bg: COLORS.default.bg,
            padding: "4 1",
            text: text3,
            onClick: () => {},
          }),

          Button({
            fg: COLORS.default.fg,
            bg: COLORS.default.bg,
            padding: "4 1",
            text: text4,
            onClick: () => {},
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

  let canType = "";
  let pressedComponentId = $("");
  let focusedComponentId = $("");

  function handleKeyboardEvent(d: string) {
    if (canType === "") return;

    if (d === "\x7f") {
      text4(text4().slice(0, -1));
    } else if (
      d.length === 1 &&
      d.charCodeAt(0) >= 32 &&
      d.charCodeAt(0) <= 126
    ) {
      text4(text4() + d);
    } else if (d === "\r") {
      // submit
    } else {
    }
  }

  function handleMouseEvent(d: string) {
    const i = d.indexOf("<") + 1;
    const j = d.length - 1;
    const c = d.slice(i, j).split(";");
    const isPress = d[d.length - 1] === "M";
    const isRelease = d[d.length - 1] === "m";
    const x = Number(c[1]!) - 1;
    const y = Number(c[2]!) - 1;

    if (c[0] == "0") {
      if (isPress) {
        focusedComponentId("");
        api.flush();
      }

      for (let item of hitMap) {
        if (
          x >= item.x &&
          x < item.x + item.width &&
          y >= item.y &&
          y < item.y + item.height
        ) {
          if (isPress) {
            pressedComponentId(item.id);
            focusedComponentId(item.id);
            if (item.type === "input") {
              canType = item.id;
            }
            api.flush();
          }
          if (isRelease) {
            pressedComponentId("");
            item.onHit();
            api.flush();
          }
        }
      }
    }
  }

  const MOUSE_EVENT_PREFIX = "\u001b[<";
  const isMouseEvent = (d: string) => {
    if (d.startsWith(MOUSE_EVENT_PREFIX)) {
      return true;
    }
    return false;
  };

  process.stdin.on("data", (data) => {
    const d = data.toString();

    if (d === "\u0011") {
      api.free_buffer();
      api.deinit_letui();
      process.exit(0);
    }

    if (isMouseEvent(d)) {
      handleMouseEvent(d);
      return;
    }

    handleKeyboardEvent(d);
  });

  let getBuffer = () => {
    const bufPtr = api.get_buffer_ptr()!;
    const bufLen = Number(api.get_buffer_len()!);

    return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
  };
  let buffer = getBuffer();

  let terminalWidth = $(api.get_width());
  let terminalHeight = $(api.get_height());

  let hitMap: Array<HitMapItem> = [];

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

      let fixedWidth: number[] = [];
      let fixedHeight: number[] = [];
      let flexWidth: number[] = [];
      let flexHeight: number[] = [];

      for (let child of node.children) {
        if (child.type === "text") {
          const {
            text: inputText,
            border = "none",
            padding = 0,
          } = child.props as InputBoxProps;
          let borderSize = border !== "none" ? 1 : 0;
          let paddingX = padding as number;
          let paddingY = padding as number;
          if (typeof padding === "string") {
            [paddingX, paddingY] = padding.split(" ").map(Number) as [
              number,
              number,
            ];
          }

          let w = [...inputText()].length + 2 * (borderSize + paddingX);
          let h = 1 + 2 * (borderSize + paddingX); // TODO: handle multiline
          fixedWidth.push(w);
          fixedHeight.push(h);
        }

        if (child.type === "button") {
          const {
            text: buttonText,
            border = "none",
            padding = 0,
          } = node.props as ButtonProps;
          let borderSize = border !== "none" ? 1 : 0;
          let paddingX = padding as number;
          let paddingY = padding as number;
          if (typeof padding === "string") {
            [paddingX, paddingY] = padding.split(" ").map(Number) as [
              number,
              number,
            ];
          }

          let w = [...buttonText()].length + 2 * (paddingX + borderSize);
          let h = 1 + 2 * (borderSize + paddingX);
          fixedWidth.push(w);
          fixedHeight.push(h);
        }

        if (child.type === "column") {
          flexWidth.push(node.frame.width);
          flexHeight.push(node.frame.height);
        }

        if (child.type === "row") {
          flexWidth.push(node.frame.width);
          flexHeight.push(node.frame.height);
        }
      }

      for (let i = 0; i < node.children.length; i++) {
        let child = node.children[i] as Node;
        child.frame.x = node.frame.x + borderSize + paddingX;
        child.frame.y = node.frame.y + currentY;

        layout(child, availableWidth, availableHeight);

        currentY += child.frame.height + gap;
        maxChildWidth = Math.max(maxChildWidth, child.frame.width);
      }
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
        layout(
          child,
          parentWidth - borderSize - paddingX - currentX,
          contentHeight,
        );

        currentX += child.frame.width + gap;
        maxChildHeight = Math.max(maxChildHeight, child.frame.height);
      }

      // node.frame.width = currentX - gap + paddingX + borderSize;
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

    if (node.type === "button") {
      const {
        text: buttonText,
        border = "none",
        padding = 0,
      } = node.props as ButtonProps;
      let borderSize = border !== "none" ? 1 : 0;

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      node.frame.width =
        [...buttonText()].length + 2 * paddingX + 2 * borderSize;
      node.frame.height = 1 + 2 * paddingY + 2 * borderSize;

      hitMap.push({
        id: node.id,
        type: node.type,
        ...node.frame,
        onHit: (node.props as ButtonProps).onClick,
      });
    }

    if (node.type === "input") {
      const {
        text: inputText,
        border = "none",
        padding = 0,
      } = node.props as InputBoxProps;
      let borderSize = border !== "none" ? 1 : 0;

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      let contentWidth = node.frame.width - 2 * paddingX - 2 * borderSize;
      let contentHeight = node.frame.height - 2 * paddingY - 2 * borderSize;

      // node.frame.width =
      //   ([...inputText()].length || 6) + 2 * paddingX + 2 * borderSize; // min width
      // node.frame.width = contentWidth + borderSize + paddingX;
      node.frame.height = 1 + 2 * paddingY + 2 * borderSize; // min height

      hitMap.push({
        id: node.id,
        type: node.type,
        ...node.frame,
        onHit: () => {
          canType = node.id;
          (node.props as InputBoxProps).onFocus();
        },
      });
    }
  }

  function paint(node: Node) {
    function getContainerCorners(n: Node) {
      let topLeft = n.frame.y * terminalWidth() + n.frame.x;
      let bottomLeft = topLeft + (n.frame.height - 1) * terminalWidth();
      let topRight = topLeft + n.frame.width - 1;
      let bottomRight = bottomLeft + n.frame.width - 1;
      return { topLeft, bottomLeft, topRight, bottomRight };
    }

    if (node.type === "column") {
      let { bg = COLORS.default.bg, border = "none" } =
        node.props as ColumnProps;

      let { topLeft, bottomLeft, topRight, bottomRight } =
        getContainerCorners(node);

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
      let { topLeft, bottomLeft, topRight, bottomRight } =
        getContainerCorners(node);

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

      let { topLeft, bottomLeft, topRight, bottomRight } =
        getContainerCorners(node);

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

    if (node.type === "button") {
      let {
        fg = COLORS.default.fg,
        bg = COLORS.default.bg,
        border = "none",
        text: buttonText,
        padding,
      } = node.props as ButtonProps;

      let { topLeft, bottomLeft, topRight, bottomRight } =
        getContainerCorners(node);

      let isPressed = pressedComponentId() === node.id;

      if (isPressed) {
        drawBackground(buffer, node, fg, terminalWidth);
      } else {
        drawBackground(buffer, node, bg, terminalWidth);
      }

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

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }
      let cells: bigint[] = [];
      for (const c of buttonText()) {
        cells.push(
          BigInt(c.codePointAt(0)!),
          BigInt(isPressed ? bg : fg),
          BigInt(isPressed ? fg : bg),
        );
      }
      let textBuffer = new BigUint64Array(cells);
      buffer.set(
        textBuffer,
        ((node.frame.y + paddingY + (border !== "none" ? 1 : 0)) *
          terminalWidth() +
          node.frame.x +
          paddingX +
          (border !== "none" ? 1 : 0)) *
          3,
      );
    }

    if (node.type === "input") {
      let {
        fg = COLORS.default.fg,
        bg = COLORS.default.bg,
        border = "none",
        text: buttonText,
        padding = 0,
      } = node.props as InputBoxProps;

      let { topLeft, bottomLeft, topRight, bottomRight } =
        getContainerCorners(node);

      let isPressed = pressedComponentId() === node.id;
      let isFocused = focusedComponentId() === node.id;

      if (isPressed) {
        drawBackground(buffer, node, fg, terminalWidth);
      } else {
        drawBackground(buffer, node, bg, terminalWidth);
      }

      if (border !== "none") {
        if (isFocused) {
          drawBorder(
            buffer,
            node,
            terminalWidth,
            terminalHeight,
            bg,
            border.color || COLORS.default.fg,
            topLeft,
            bottomLeft,
            topRight,
            bottomRight,
          );
        } else {
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

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }
      let cells: bigint[] = [];
      for (const c of buttonText()) {
        cells.push(
          BigInt(c.codePointAt(0)!),
          BigInt(isPressed ? bg : fg),
          BigInt(isPressed ? fg : bg),
        );
      }
      let textBuffer = new BigUint64Array(cells);
      buffer.set(
        textBuffer,
        ((node.frame.y + paddingY + (border !== "none" ? 1 : 0)) *
          terminalWidth() +
          node.frame.x +
          paddingX +
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
    pressedComponentId();
    focusedComponentId();
    hitMap = [];
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
  buffer[offset] = BigInt(char.codePointAt(0)!);
  buffer[offset + 1] = BigInt(fg);
  buffer[offset + 2] = BigInt(bg);
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
    id: randomString(),
    type: "column",
    props,
    frame: getInitialFrame(),
    children,
  };
}

function Row(props: RowProps, children: Array<Node>): Node {
  return {
    id: randomString(),
    type: "row",
    props,
    frame: getInitialFrame(),
    children,
  };
}

function Text(props: TextProps): Node {
  return {
    id: randomString(),
    type: "text",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

function Button(props: ButtonProps): Node {
  return {
    id: randomString(),
    type: "button",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

function InputBox(props: InputBoxProps): Node {
  return {
    id: randomString(),
    type: "input",
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

type HitMapItem = Frame & {
  id: string;
  type: ComponentType;
  onHit: () => void;
};

type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ComponentType = "column" | "row" | "input" | "button" | "text";

type Node = {
  id: string;
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

type RowProps = {
  padding?: number | `${number} ${number}`;
  gap?: number;
  border?: BorderProps;
  bg?: number;
};

type ButtonProps = {
  fg?: number;
  bg?: number;
  border?: BorderProps;
  padding?: number | `${number} ${number}`;
  text: Signal<string>;
  onClick: () => void | Promise<void>;
};

type InputBoxProps = {
  fg?: number;
  bg?: number;
  text: Signal<string>;
  border?: BorderProps;
  padding?: number | `${number} ${number}`;
  onBlur: () => void;
  onFocus: () => void;
  onType: (value: string) => void;
};

