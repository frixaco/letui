/**
 * Wrapper for the Rust backend of my TUI library
 * that exposes composable components for UI
 */

import {
  dlopen,
  FFIType,
  ptr,
  suffix,
  toArrayBuffer,
  type Pointer,
} from "bun:ffi";
import { COLORS } from "./colors";
import { appendFile } from "node:fs/promises";

const cl = COLORS.default;

const prefix = process.platform === "win32" ? "" : "lib";
const path = `./letui-ffi/target/release/${prefix}letui_ffi.${suffix}`;

const {
  symbols: {
    init_buffer,
    get_buffer_ptr,
    get_buffer_len,
    get_width,
    get_height,
    free_buffer,
    debug_buffer,
    init_letui,
    deinit_letui,
    flush,
    update_terminal_size,
  },
} = dlopen(path, {
  init_letui: {
    args: [],
    returns: FFIType.i32,
  },
  deinit_letui: {
    args: [],
    returns: FFIType.i32,
  },
  init_buffer: {
    args: [],
    returns: FFIType.i32,
  },
  get_buffer_ptr: {
    args: [],
    returns: FFIType.pointer,
  },
  get_buffer_len: {
    args: [],
    returns: FFIType.u64,
  },
  get_width: {
    args: [],
    returns: FFIType.u16,
  },
  get_height: {
    args: [],
    returns: FFIType.u16,
  },
  free_buffer: {
    args: [],
    returns: FFIType.i32,
  },
  debug_buffer: {
    args: [FFIType.u64],
    returns: FFIType.u64,
  },
  flush: {
    args: [],
    returns: FFIType.i32,
  },
  update_terminal_size: {
    args: [],
    returns: FFIType.i32,
  },
});

init_buffer();

const getBuffer = () => {
  const bufPtr = get_buffer_ptr()!;
  const bufLen = Number(get_buffer_len()!);

  return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
};

let buffer = getBuffer();

let canQuit = true;

let terminalWidth = get_width();
let terminalHeight = get_height();

const debugLogPath = "./logs.txt";

const MOUSE_EVENT_PREFIX = "\u001b[<";
const isMouseEvent = (d: string) => {
  if (d.startsWith(MOUSE_EVENT_PREFIX)) {
    return true;
  }
  return false;
};

let hitIdCounter = 0;
const componentMap = new Map<number, Button | Input>();
const hitMap = new Map<number, number>();
const getHitComponent = (x: number, y: number): Button | Input => {
  const component = componentMap.get(hitMap.get(y * terminalWidth + x)!);
  return component!;
};

const handleMouseEvent = async (d: string) => {
  const i = d.indexOf("<") + 1;
  const j = d.length - 1;
  const c = d.slice(i, j).split(";");
  await appendFile(debugLogPath, `parsed: ${JSON.stringify(c)}\n`);
  const isPress = d[d.length - 1] === "M";
  const isRelease = d[d.length - 1] === "m";
  const x = Number(c[1]!) - 1;
  const y = Number(c[2]!) - 1;

  if (c[0] == "0") {
    await appendFile(debugLogPath, `mouse left button at (${x}, ${y})\n`);
    await appendFile(debugLogPath, `hitMap key: ${y * terminalWidth + x}\n`);
    await appendFile(
      debugLogPath,
      `hitMap has key: ${hitMap.has(y * terminalWidth + x)}\n`,
    );

    const hitComponent: Button | Input = getHitComponent(x, y);
    if (hitComponent instanceof Button) {
      if (isPress) {
        await appendFile(debugLogPath, "pressed\n");
        hitComponent?.press();
      }
      if (isRelease) {
        await appendFile(debugLogPath, "released\n");
        hitComponent?.release();
      }
    }
    if (hitComponent instanceof Input) {
      canType = hitComponent.id;
    }
  }
};

let canType = 0;

const handleKeyboardEvent = (d: string) => {
  if (canType === 0) return;

  let input = componentMap.get(canType)! as Input;
  input.setText(d);
};

init_letui();
process.stdin.resume();
Bun.write(debugLogPath, "");
process.stdin.on("data", async (data) => {
  // hex notation
  // await appendFile(
  //   debugLogPath,
  //   Array.from(data)
  //     .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
  //     .join(" ") + "\n",
  // );
  // unicode escape sequence (code point)
  await appendFile(debugLogPath, JSON.stringify(data.toString()) + "\n\n");

  const d = data.toString();

  if (isMouseEvent(d)) {
    await appendFile(debugLogPath, "isMouseEvent\n");
    await handleMouseEvent(d);
    return;
  }

  if (d === "\u0011" && canQuit) {
    free_buffer();
    deinit_letui();
    process.exit(0);
  }

  handleKeyboardEvent(d);
});

process.stdout.on("resize", () => {
  update_terminal_size();
  terminalWidth = get_width();
  terminalHeight = get_height();

  free_buffer();
  init_buffer();
  buffer = getBuffer();

  v.render();
});

type Border = "none" | "square" | "rounded";
type Justify = "start" | "end";

class View {
  children: (Column | Row | Text | Button)[] = [];

  constructor() {}

  add(child: Column | Row | Text | Button) {
    this.children.push(child);

    return this;
  }

  render() {
    let x = 0;
    let y = 0;
    for (const child of this.children) {
      child.render(x, y, { w: terminalWidth, h: terminalHeight });
      y += child.size().h;
      x = child.size().w > x ? child.size().w : x;
    }

    flush();
  }
}

class Row {
  id: number;
  children: (Column | Row | Text)[] = [];

  border: Border = "none";
  justify: Justify = "start";

  constructor(border: Border = "none", justify: Justify = "start") {
    this.border = border;
    this.justify = justify;
    this.id = hitIdCounter++;
  }

  add(child: Column | Row | Text) {
    this.children.push(child);
    return this;
  }

  size() {
    let w = 0;
    let h = 0;

    for (const c of this.children) {
      w += c.size().w;
      h = c.size().h > h ? c.size().h : h;
    }

    return {
      w: w + (this.border !== "none" ? 2 : 0),
      h: h + (this.border !== "none" ? 2 : 0),
    };
  }

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft =
        yo * terminalWidth + xo + terminalWidth * (this.size().h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      let middleLeft = topLeft + terminalWidth;
      let topRight = topLeft + w - 1;
      let middleRight = topRight + terminalWidth;
      let bottomRight = middleRight + terminalWidth;

      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleLeft * 3,
      );

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    let pad = 0;
    if (this.justify === "end") {
      pad = w - this.size().w;
    }
    let cx = pad + (this.border !== "none" ? 1 : 0);
    for (const c of this.children) {
      c.render(cx + xo, yo + (this.border !== "none" ? 1 : 0), {
        w: w - (this.border !== "none" ? 2 : 0),
        h: h - (this.border !== "none" ? 2 : 0),
      });
      cx += c.size().w;
    }
  }
}

class Column {
  id: number;
  children: (Column | Row | Text | Button | Input)[] = [];

  border: Border = "none";
  justify: Justify = "start";

  constructor(border: Border = "none", justify: Justify = "start") {
    this.border = border;
    this.justify = justify;
    this.id = hitIdCounter++;
  }

  add(child: Column | Row | Text | Button | Input) {
    this.children.push(child);
    return this;
  }

  size() {
    let w = 0;
    let h = 0;

    for (const c of this.children) {
      w = c.size().w > w ? c.size().w : w;
      h += c.size().h;
    }

    return {
      w: w + (this.border !== "none" ? 2 : 0),
      h: h + (this.border !== "none" ? 2 : 0),
    };
  }

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft = yo * terminalWidth + xo + terminalWidth * (h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      for (let i = 1; i < h - 1; i++) {
        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          (topLeft + i * terminalWidth) * 3,
        );
      }

      let topRight = topLeft + w - 1;
      let bottomRight = topRight + (h - 1) * terminalWidth;
      for (let i = 1; i < h - 1; i++) {
        buffer.set(
          new BigUint64Array([
            BigInt("│".codePointAt(0)!),
            BigInt(fg),
            BigInt(bg),
          ]),
          (topRight + i * terminalWidth) * 3,
        );
      }

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    let cy = this.border !== "none" ? 1 : 0;
    if (this.justify === "end") {
      cy += h - this.size().h;
    }

    for (const c of this.children) {
      c.render(xo + this.border === "none" ? 0 : 1, cy + yo, {
        w: w - (this.border !== "none" ? 2 : 0),
        h: h - (this.border !== "none" ? 2 : 0),
      });
      cy += c.size().h;
    }
  }
}

class Text {
  id: number;
  text: string;
  fg: number;
  bg: number;

  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();

  width: number;
  height: number;

  constructor(text: string, fg: number, bg: number, border: Border = "none") {
    this.border = border;
    this.width = [...text].length + (border !== "none" ? 2 : 0);
    this.height = 1;

    this.text = text;
    this.fg = fg;
    this.bg = bg;

    this.id = hitIdCounter++;

    this.prerender();
  }

  prerender() {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(BigInt(c.codePointAt(0)!), BigInt(this.fg), BigInt(this.bg));
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  size() {
    return { w: this.width, h: this.height };
  }

  render(xo: number, yo: number) {
    const cursor = terminalWidth * yo + xo;
    buffer.set(this.prebuilt.subarray(0), cursor * 3);
  }
}

type RGB = { r: number; g: number; b: number };
const hexToRgb = (hex: number) => ({
  r: (hex >> 16) & 0xff,
  g: (hex >> 8) & 0xff,
  b: hex & 0xff,
});
const rgbToHex = ({ r, g, b }: RGB) => {
  return (r << 16) | (g << 8) | b;
};

const lightenRgb = ({ r, g, b }: RGB, amount: number = 8) => ({
  r: Math.min(r + amount, 255),
  g: Math.min(g + amount, 255),
  b: Math.min(b + amount, 255),
});

class Button {
  id: number;
  px = 4;
  py = 1;
  text: string;
  fg: number;
  active_fg: number;
  bg: number;
  active_bg: number;

  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();

  width: number;
  height: number;

  constructor(
    text: string,
    fg: number,
    bg: number,
    border: Border = "none",
    active_fg?: number,
    active_bg?: number,
  ) {
    this.border = border;
    this.width = [...text].length + (border !== "none" ? 2 : 0);
    this.height = 1;

    this.text = text;
    this.fg = fg;
    this.bg = bg;

    this.active_fg = active_fg || rgbToHex(lightenRgb(hexToRgb(fg)));
    this.active_bg = active_bg || rgbToHex(lightenRgb(hexToRgb(bg)));

    this.id = hitIdCounter++;
    componentMap.set(this.id, this);
  }

  prerender(active: boolean = false) {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(
        BigInt(c.codePointAt(0)!),
        BigInt(active ? this.active_fg : this.fg),
        BigInt(active ? this.active_bg : this.bg),
      );
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  size() {
    return { w: this.width + 2 * this.px, h: this.height + 2 * this.py };
  }

  xo: number = 0;
  yo: number = 0;
  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;

    this.prerender();

    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.fg),
              BigInt(this.bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );

    this.updateHitMap(xo, yo);
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  release() {
    const xo = this.xo;
    const yo = this.yo;

    this.prerender();

    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.fg),
              BigInt(this.bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );
    flush();
  }

  press() {
    const xo = this.xo;
    const yo = this.yo;

    this.prerender(true);

    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.active_fg),
            BigInt(this.active_bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.active_fg),
            BigInt(this.active_bg),
          ]),
          (terminalWidth * cy + cx) * 3,
        );
      }
    }

    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.active_fg),
              BigInt(this.active_bg),
            ]),
            (terminalWidth * cy + cx) * 3,
          );
        }
      }
    }

    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3,
    );
    flush();
  }
}

class Input {
  id: number;
  text: string = "";
  fg: number;
  bg: number;
  multiline: boolean;
  border: Border;

  constructor(
    fg: number,
    bg: number,
    border: Border,
    multiline: boolean = false,
  ) {
    this.multiline = multiline;
    this.border = border;

    this.fg = fg;
    this.bg = bg;

    this.id = hitIdCounter++;
    componentMap.set(this.id, this);

    this.prerender();
  }

  getMultilineTextHeight() {
    return 1;
  }

  size() {
    return {
      w: [...this.text].length + (this.border !== "none" ? 2 : 0),
      h: this.multiline
        ? this.getMultilineTextHeight()
        : 1 + (this.border !== "none" ? 2 : 0),
    };
  }

  prebuilt: BigUint64Array = new BigUint64Array();
  prerender() {
    const cells: bigint[] = [];
    for (const c of this.text) {
      cells.push(BigInt(c.codePointAt(0)!), BigInt(this.fg), BigInt(this.bg));
    }
    this.prebuilt = new BigUint64Array(cells);
  }

  xo: number = 0;
  yo: number = 0;
  containerSize: { w: number; h: number } = { w: 0, h: 0 };
  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;
    this.containerSize = { w, h };

    if (this.border !== "none") {
      let topLeft = yo * terminalWidth + xo + 1;
      let fg = cl.fg;
      let bg = cl.bg;

      let cells: bigint[] = [];
      for (let i = 0; i < w - 2; i++) {
        cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
      }
      let prebuilt = new BigUint64Array(cells);

      buffer.set(prebuilt, topLeft * 3);

      let bottomLeft =
        yo * terminalWidth + xo + terminalWidth * (this.size().h - 1) + 1;
      buffer.set(prebuilt, bottomLeft * 3);

      topLeft -= 1;
      bottomLeft -= 1;
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┌".codePointAt(0)!)
            : BigInt("╭".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topLeft * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("└".codePointAt(0)!)
            : BigInt("╰".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomLeft * 3,
      );

      let middleLeft = topLeft + terminalWidth;
      let topRight = topLeft + w - 1;
      let middleRight = topRight + terminalWidth;
      let bottomRight = middleRight + terminalWidth;

      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleLeft * 3,
      );

      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┐".codePointAt(0)!)
            : BigInt("╮".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        topRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          BigInt("│".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        middleRight * 3,
      );
      buffer.set(
        new BigUint64Array([
          this.border === "square"
            ? BigInt("┘".codePointAt(0)!)
            : BigInt("╯".codePointAt(0)!),
          BigInt(fg),
          BigInt(bg),
        ]),
        bottomRight * 3,
      );
    }

    const cursor =
      terminalWidth * (this.border === "none" ? yo : yo + 1) +
      xo +
      (this.border === "none" ? 2 : 1);
    buffer.set(this.prebuilt.subarray(0), cursor * 3);

    this.updateHitMap(xo, yo);

    flush();
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.containerSize.w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  press() {}

  release() {}

  setText(v: string) {
    this.text += v;
    this.prerender();
    this.render(this.xo, this.yo, this.containerSize);
  }
}

const v = new View();
const c = new Column("square", "end");
const b1 = new Button("button", cl.bg, cl.green, "none", cl.cyan, cl.yellow);
c.add(b1);

const r1 = new Row("rounded", "end");
r1.add(new Text("Hello", cl.cyan, cl.yellow));
r1.add(new Text(" World", cl.cyan, cl.yellow));

c.add(r1);

const r2 = new Row();
r2.add(new Text("Le", cl.red, cl.blue));
r2.add(new Text("Tui", cl.grey, cl.magenta));
c.add(r2);

const i1 = new Input(cl.magenta, cl.bg, "square", false);
c.add(i1);

v.add(c);
v.render();
