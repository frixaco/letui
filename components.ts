import { ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors.ts";
import api from "./ffi.ts";
import { $, ff, type Signal } from "./signals";

function randomString(length = 6) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function getNodeFrame(node: Node) {
  const { padding = 0, border = "none" } = node.props;
  let borderSize = border !== "none" ? 1 : 0;
  let paddingX = padding as number;
  let paddingY = padding as number;
  if (typeof padding === "string") {
    [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
  }

  let gap = 0;
  if ("gap" in node.props) {
    gap = node.props.gap || 0;
  }

  return {
    borderSize,
    paddingX,
    paddingY,
    gap,
  };
}

export function run(node: Node) {
  api.init_buffer();
  api.init_letui();
  process.stdin.resume();

  let pressedComponentId = $("");
  let focusedComponentId = $("");

  let spatialLookup: (Node | undefined)[];

  function getComponentAt(x: number, y: number): Node | undefined {
    return spatialLookup[y * terminalWidth() + x];
  }

  function registerHit(n: Node) {
    const { x, y, width, height } = n.frame;
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        // TODO: don't like storing the node
        spatialLookup[row * terminalWidth() + col] = n;
      }
    }
  }

  function setFocus(newId: string) {
    const oldId = focusedComponentId();
    if (oldId === newId) return;
    const oldNode = getNodeById(oldId);
    const newNode = getNodeById(newId);
    if (oldNode?.type === "input") {
      (oldNode.props as InputBoxProps).onBlur();
    }
    if (newNode?.type === "input") {
      (newNode.props as InputBoxProps).onFocus();
    }
    focusedComponentId(newId);
  }

  function clearFocus() {
    const oldId = focusedComponentId();
    const oldNode = getNodeById(oldId);
    if (oldNode?.type === "input") {
      (oldNode.props as InputBoxProps).onBlur();
    }
    focusedComponentId("");
  }

  function getNodeById(id: string): Node | undefined {
    return spatialLookup.find((n) => n?.id === id);
  }

  function handleKeyboardEvent(d: string) {
    // TODO: there could be better way
    const focused = getNodeById(focusedComponentId());
    if (!focused) return;

    if (focused.type === "button") {
      if (d === "\r" || d === " ") {
        (focused.props as ButtonProps).onClick();
        api.flush();
      }
      return;
    }

    if (focused.type === "input") {
      const props = focused.props as InputBoxProps;
      const curr = props.text() ?? "";

      if (d === "\x7f") {
        props.onType(curr.slice(0, -1));
      } else if (d === "\r") {
        clearFocus();
      } else if (d.length === 1) {
        const code = d.charCodeAt(0);
        if (code >= 32 && code <= 126) {
          props.onType(curr + d);
        }
      }
      api.flush();
      return;
    }
  }

  function handleMouseEvent(d: string) {
    const i = d.indexOf("<") + 1;
    const j = d.length - 1;
    const parts = d.slice(i, j).split(";");
    const isPress = d.endsWith("M");
    const isRelease = d.endsWith("m");
    const cb = Number(parts[0]);
    const x = Number(parts[1]) - 1;
    const y = Number(parts[2]) - 1;

    const btn = cb & 0b11;
    const isLeftPress = isPress && btn === 0;

    const target = getComponentAt(x, y);

    if (isLeftPress) {
      if (target) {
        pressedComponentId(target.id);
        setFocus(target.id);
      } else {
        pressedComponentId("");
        clearFocus();
      }
      api.flush();
      return;
    }

    if (isRelease) {
      const pressed = getNodeById(pressedComponentId());
      if (pressed && target && target.id === pressed.id) {
        if (pressed.type === "button") {
          (pressed.props as ButtonProps).onClick();
        }
      }
      pressedComponentId("");
      api.flush();
      return;
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

  process.stdout.on("resize", () => {
    api.update_terminal_size();

    terminalWidth(api.get_width());
    terminalHeight(api.get_height());

    api.free_buffer();
    api.init_buffer();

    buffer = getBuffer();
  });

  function serializeNodes(node: Node) {
    let nodeCount = 0;
    function toTree(n: Node): Record<string, any> {
      nodeCount++;

      let paddingX = 0;
      let paddingY = 0;

      const { padding = 0 } = n.props;
      if (typeof padding === "number") {
        paddingX = padding;
        paddingY = padding;
      } else {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }

      return {
        type: n.type,
        gap: (n.props as any).gap || 0,
        paddingX,
        paddingY,
        border: (n.props as any).border !== "none" ? 1 : 0,
        text: (n.props as any).text ? (n.props as any).text() : "",
        children: n.children.map(toTree),
      };
    }

    return {
      tree: toTree(node),
      nodeCount,
    };
  }

  function layout(node: Node) {
    let { tree } = serializeNodes(node);

    let jsonTree = JSON.stringify({
      node: tree,
      width: terminalWidth(),
      height: terminalHeight(),
    });
    Bun.write("tree.json", jsonTree);
    let jsonBytes = Buffer.from(jsonTree, "utf-8");
    api.calculate_layout(ptr(jsonBytes), jsonBytes.byteLength);

    const framesPtr = api.get_frames_ptr()!;
    const framesLen = Number(api.get_frames_len()!);

    let frameArray = new Float32Array(
      toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4),
    );

    let idx = 0;
    function updateFrames(n: Node) {
      n.frame.x = frameArray![idx++]!;
      n.frame.y = frameArray![idx++]!;
      n.frame.width = frameArray![idx++]!;
      n.frame.height = frameArray![idx++]!;
      n.children.forEach(updateFrames);
    }
    updateFrames(node);
  }

  function paint(node: Node, overrideBg: number = COLORS.default.bg) {
    if (node.type === "column") {
      let { bg = overrideBg } = node.props as ColumnProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);
    }

    if (node.type === "row") {
      let { bg = overrideBg } = node.props as RowProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);
    }

    if (node.type === "text") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        padding,
        text,
      } = node.props as TextProps;

      drawBackground(buffer, node, bg, terminalWidth);
      drawBorder(buffer, node, terminalWidth);

      let paddingX = padding as number;
      let paddingY = padding as number;
      if (typeof padding === "string") {
        [paddingX, paddingY] = padding.split(" ").map(Number) as [
          number,
          number,
        ];
      }
      let cells: bigint[] = [];
      for (const c of text()) {
        cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let textBuffer = new BigUint64Array(cells);
      let offset =
        (node.frame.y + paddingY + (border !== "none" ? 1 : 0)) *
          terminalWidth() +
        node.frame.x +
        paddingX +
        (border !== "none" ? 1 : 0);
      buffer.set(textBuffer, offset * 3);
    }

    if (node.type === "button") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        padding,
        text: buttonText,
      } = node.props as ButtonProps;

      let isPressed = pressedComponentId() === node.id;

      drawBackground(buffer, node, isPressed ? fg : bg, terminalWidth);

      if (border !== "none") {
        drawBorder(buffer, node, terminalWidth, undefined, isPressed ? fg : bg);
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

      registerHit(node);
    }

    if (node.type === "input") {
      let {
        fg = COLORS.default.fg,
        bg = overrideBg,
        border = "none",
        text: inputText,
        padding = 0,
      } = node.props as InputBoxProps;

      let isFocused = focusedComponentId() === node.id;

      drawBackground(buffer, node, bg, terminalWidth);

      if (border !== "none") {
        drawBorder(
          buffer,
          node,
          terminalWidth,
          isFocused ? COLORS.default.grey : COLORS.default.fg,
          bg,
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
      for (const c of inputText()) {
        cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
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

      registerHit(node);
    }

    for (let child of node.children) {
      paint(child, node.props.bg);
    }
  }

  ff(() => {
    pressedComponentId();
    focusedComponentId();
    terminalWidth();
    terminalHeight();

    spatialLookup = new Array(terminalWidth() * terminalHeight());

    layout(node);
    paint(node, node.props.bg);

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

function getContainerCorners(node: Node, tw: number) {
  let topLeft = node.frame.y * tw + node.frame.x;
  let bottomLeft = topLeft + (node.frame.height - 1) * tw;
  let topRight = topLeft + node.frame.width - 1;
  let bottomRight = bottomLeft + node.frame.width - 1;
  return { topLeft, bottomLeft, topRight, bottomRight };
}

function drawBorder(
  buffer: BigUint64Array<ArrayBuffer>,
  node: Node,
  terminalWidth: Signal<number>,
  overrideFg?: number,
  overrideBg?: number,
) {
  let border = (node.props?.border as BorderProps) || "none";
  if (border === "none") return;

  let { width, height } = node.frame;
  let style = border.style;

  let fg = overrideFg || border.color || COLORS.default.fg;
  let bg = overrideBg || node.props.bg || COLORS.default.bg;

  let { topLeft, bottomLeft, topRight, bottomRight } = getContainerCorners(
    node,
    terminalWidth(),
  );

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

export function Column(props: ColumnProps, children: Array<Node>): Node {
  return {
    id: randomString(),
    type: "column",
    props,
    frame: getInitialFrame(),
    children,
  };
}

export function Row(props: RowProps, children: Array<Node>): Node {
  return {
    id: randomString(),
    type: "row",
    props,
    frame: getInitialFrame(),
    children,
  };
}

export function Text(props: TextProps): Node {
  return {
    id: randomString(),
    type: "text",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

export function Button(props: ButtonProps): Node {
  return {
    id: randomString(),
    type: "button",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

export function InputBox(props: InputBoxProps): Node {
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

// I need to handle two types of mouse/keyboard events
// 1. On action, something USER WANTS runs - make API call
// 2. On cation, something TUI WANTS happens - change background color

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ComponentType = "column" | "row" | "input" | "button" | "text";

export type Node = {
  id: string;
  type: ComponentType;
  children: Array<Node>;
  props: ColumnProps | RowProps | InputBoxProps | ButtonProps | TextProps;
  frame: Frame;
};

export type CommonProps = {
  padding?: number | `${number} ${number}`;
  border?: BorderProps;
};

export type ColumnProps = CommonProps & {
  gap?: number;
  bg?: number;
};

export type RowProps = CommonProps & {
  gap?: number;
  bg?: number;
};

export type TextProps = CommonProps & {
  fg?: number;
  bg?: number;
  text: Signal<string>;
};

export type BorderStyle = "square" | "rounded";

export type BorderProps =
  | {
      color: number;
      style: BorderStyle;
    }
  | "none";

export type ButtonProps = CommonProps & {
  fg?: number;
  bg?: number;
  text: Signal<string>;
  onClick: () => void | Promise<void>;
};

export type InputBoxProps = CommonProps & {
  fg?: number;
  bg?: number;
  text: Signal<string>;
  onBlur: () => void;
  onFocus: () => void;
  onType: (value: string) => void;
};

