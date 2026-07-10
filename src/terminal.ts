/** Terminal lifecycle and cell-diff flushing using direct ANSI control sequences. */

import process from "node:process";
import {
  CellBuffer,
  CONTINUATION_CELL,
  RESET_COLOR,
  TEXT_ATTR_ALL,
  TEXT_ATTR_BOLD,
  TEXT_ATTR_ITALIC,
  TEXT_ATTR_UNDERLINE,
} from "./surface.ts";

const ENTER_TERMINAL = "\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[2J\x1b[?25l";
const LEAVE_TERMINAL =
  "\x1b[?2026l\x1b[?25h\x1b[?1006l\x1b[?1000l\x1b[0m\x1b[39m\x1b[49m\x1b[?1049l";
const BEGIN_UPDATE = "\x1b[?2026h";
const END_UPDATE = "\x1b[?2026l";

export class Terminal {
  width = 0;
  height = 0;
  current = new CellBuffer(0, 0);
  previous = new CellBuffer(0, 0);
  private firstFlush = true;
  private active = false;

  init(): void {
    this.resize();
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("letui requires an interactive terminal");
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(ENTER_TERMINAL);
    this.active = true;
  }

  resize(): void {
    this.width = process.stdout.columns ?? 80;
    this.height = process.stdout.rows ?? 24;
    this.current = new CellBuffer(this.width, this.height);
    this.previous = new CellBuffer(this.width, this.height);
    this.firstFlush = true;
  }

  flush(): void {
    const output =
      BEGIN_UPDATE +
      (this.firstFlush ? firstFrame(this.current) : diffFrame(this.current, this.previous)) +
      END_UPDATE;
    process.stdout.write(output);
    this.previous.copyFrom(this.current);
    this.firstFlush = false;
  }

  deinit(): void {
    if (!this.active) return;
    this.active = false;
    process.stdout.write(LEAVE_TERMINAL);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

export function firstFrame(buffer: CellBuffer): string {
  if (buffer.width === 0 || buffer.height === 0) return "";
  let output = "";
  for (let y = 0; y < buffer.height; y += 1) {
    const rowStart = y * buffer.width;
    let foreground = buffer.foreground[rowStart]!;
    let background = buffer.background[rowStart]!;
    let attrs = buffer.attrs[rowStart]!;
    output += moveTo(0, y) + "\x1b[0m" + foregroundAnsi(foreground) + backgroundAnsi(background);
    output += attrsAnsi(0, attrs);
    let chars = "";
    for (let x = 0; x < buffer.width; x += 1) {
      const index = rowStart + x;
      const nextForeground = buffer.foreground[index]!;
      const nextBackground = buffer.background[index]!;
      const nextAttrs = buffer.attrs[index]!;
      if (nextForeground !== foreground || nextBackground !== background || nextAttrs !== attrs) {
        output += chars + colorDiffAnsi(foreground, background, nextForeground, nextBackground);
        output += attrsAnsi(attrs, nextAttrs);
        chars = "";
        foreground = nextForeground;
        background = nextBackground;
        attrs = nextAttrs;
      }
      chars += renderChar(buffer.chars[index]!);
    }
    output += chars;
  }
  return output;
}

export function diffFrame(buffer: CellBuffer, previous: CellBuffer): string {
  let output = "\x1b[0m";
  let foreground = -1;
  let background = -1;
  let attrs = 0;

  for (let y = 0; y < buffer.height; y += 1) {
    let chars = "";
    let batchStart = 0;
    let batchCells = 0;
    for (let x = 0; x < buffer.width; x += 1) {
      const index = y * buffer.width + x;
      if (buffer.sameCell(index, previous)) continue;

      const nextForeground = buffer.foreground[index]!;
      const nextBackground = buffer.background[index]!;
      const nextAttrs = buffer.attrs[index]!;
      if (chars && x !== batchStart + batchCells) {
        output += moveTo(batchStart, y) + chars;
        chars = "";
        batchCells = 0;
      }
      if (nextForeground !== foreground || nextBackground !== background || nextAttrs !== attrs) {
        if (chars) output += moveTo(batchStart, y) + chars;
        output += colorDiffAnsi(foreground, background, nextForeground, nextBackground);
        output += attrsAnsi(attrs, nextAttrs);
        chars = "";
        foreground = nextForeground;
        background = nextBackground;
        attrs = nextAttrs;
        batchCells = 0;
      }
      if (!chars) batchStart = x;
      chars += renderChar(buffer.chars[index]!);
      batchCells += 1;
    }
    if (chars) output += moveTo(batchStart, y) + chars;
  }
  return output;
}

function moveTo(x: number, y: number): string {
  return `\x1b[${y + 1};${x + 1}H`;
}

function foregroundAnsi(color: number): string {
  return color === RESET_COLOR
    ? "\x1b[39m"
    : `\x1b[38;2;${red(color)};${green(color)};${blue(color)}m`;
}

function backgroundAnsi(color: number): string {
  return color === RESET_COLOR
    ? "\x1b[49m"
    : `\x1b[48;2;${red(color)};${green(color)};${blue(color)}m`;
}

function colorDiffAnsi(
  previousForeground: number,
  previousBackground: number,
  foreground: number,
  background: number,
): string {
  return (
    (foreground !== previousForeground ? foregroundAnsi(foreground) : "") +
    (background !== previousBackground ? backgroundAnsi(background) : "")
  );
}

function attrsAnsi(previous: number, current: number): string {
  previous &= TEXT_ATTR_ALL;
  current &= TEXT_ATTR_ALL;
  if (previous === current) return "";
  let output = "";
  if (previous & TEXT_ATTR_BOLD && !(current & TEXT_ATTR_BOLD)) output += "\x1b[22m";
  if (previous & TEXT_ATTR_ITALIC && !(current & TEXT_ATTR_ITALIC)) output += "\x1b[23m";
  if (previous & TEXT_ATTR_UNDERLINE && !(current & TEXT_ATTR_UNDERLINE)) output += "\x1b[24m";
  if (!(previous & TEXT_ATTR_BOLD) && current & TEXT_ATTR_BOLD) output += "\x1b[1m";
  if (!(previous & TEXT_ATTR_ITALIC) && current & TEXT_ATTR_ITALIC) output += "\x1b[3m";
  if (!(previous & TEXT_ATTR_UNDERLINE) && current & TEXT_ATTR_UNDERLINE) output += "\x1b[4m";
  return output;
}

function renderChar(code: number): string {
  return code === CONTINUATION_CELL ? "" : String.fromCodePoint(code || 32);
}

function red(color: number): number {
  return (color >>> 16) & 0xff;
}
function green(color: number): number {
  return (color >>> 8) & 0xff;
}
function blue(color: number): number {
  return color & 0xff;
}
