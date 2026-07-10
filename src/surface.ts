/** Packed terminal cell surface used by layout painting and ANSI diff output. */

import { textWidth } from "./text-layout.ts";
import type { NormalizedTextSpan } from "./types.ts";

export const RESET_COLOR = 0xffffffff;
export const CONTINUATION_CELL = 0;
export const TEXT_ATTR_BOLD = 1 << 0;
export const TEXT_ATTR_ITALIC = 1 << 1;
export const TEXT_ATTR_UNDERLINE = 1 << 2;
export const TEXT_ATTR_ALL = TEXT_ATTR_BOLD | TEXT_ATTR_ITALIC | TEXT_ATTR_UNDERLINE;

export type CellStyle = {
  foreground: number;
  background: number;
  attrs: number;
};

export type SurfaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BorderSide = {
  width: number;
  color: number;
};

export type ResolvedBorder = {
  top: BorderSide;
  right: BorderSide;
  bottom: BorderSide;
  left: BorderSide;
  style: "none" | "square" | "rounded";
};

type SurfaceBounds = {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
};

export class CellBuffer {
  readonly chars: Uint32Array;
  readonly foreground: Uint32Array;
  readonly background: Uint32Array;
  readonly attrs: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const size = width * height;
    this.chars = new Uint32Array(size);
    this.foreground = new Uint32Array(size);
    this.background = new Uint32Array(size);
    this.attrs = new Uint8Array(size);
    this.clear();
  }

  clear(): void {
    this.chars.fill(32);
    this.foreground.fill(RESET_COLOR);
    this.background.fill(RESET_COLOR);
    this.attrs.fill(0);
  }

  copyFrom(other: CellBuffer): void {
    this.chars.set(other.chars);
    this.foreground.set(other.foreground);
    this.background.set(other.background);
    this.attrs.set(other.attrs);
  }

  sameCell(index: number, other: CellBuffer): boolean {
    return (
      this.chars[index] === other.chars[index] &&
      this.foreground[index] === other.foreground[index] &&
      this.background[index] === other.background[index] &&
      this.attrs[index] === other.attrs[index]
    );
  }
}

export class Surface {
  constructor(readonly buffer: CellBuffer) {}

  drawBackground(rect: SurfaceRect, viewport: SurfaceRect, color: number): void {
    const bounds = fillBounds(
      intersectRects(rect, viewport),
      this.buffer.width,
      this.buffer.height,
    );
    if (!bounds) return;
    const style = { foreground: RESET_COLOR, background: color, attrs: 0 };
    for (let row = bounds.yStart; row < bounds.yEnd; row += 1) {
      for (let col = bounds.xStart; col < bounds.xEnd; col += 1) {
        this.setCell(col, row, " ", style);
      }
    }
  }

  drawBorder(
    rect: SurfaceRect,
    viewport: SurfaceRect,
    border: ResolvedBorder,
    background: number,
  ): void {
    if (!hasVisibleBorder(border)) return;
    const bounds = borderBounds(rect, this.buffer.width, this.buffer.height);
    const clip = fillBounds(viewport, this.buffer.width, this.buffer.height);
    if (!bounds || !clip) return;

    const uniform = uniformBorder(border);
    if (uniform !== null) {
      this.drawUniformBorder(bounds, clip, border.style, uniform, background);
      return;
    }
    this.drawMixedBorder(bounds, clip, border, background);
  }

  drawText(
    rect: SurfaceRect,
    clipRect: SurfaceRect,
    text: string,
    style: CellStyle,
    spans: readonly NormalizedTextSpan[],
  ): void {
    const maxWidth = Math.max(0, Math.floor(rect.width));
    if (maxWidth === 0) return;
    const visibleRect = intersectRects(intersectRects(rect, clipRect), terminalRect(this.buffer));
    const visible = fillBounds(visibleRect, this.buffer.width, this.buffer.height);
    if (!visibleRect || !visible) return;

    const clipLeft = Math.floor(Math.max(0, visibleRect.x - rect.x));
    const visibleWidth = Math.ceil(Math.max(0, visibleRect.width));
    const clipRight = clipLeft + visibleWidth;
    let colOffset = 0;
    let byteOffset = 0;
    let spanIndex = 0;

    for (const item of graphemeSegmenter.segment(text)) {
      const grapheme = item.segment;
      const width = textWidth(grapheme);
      const byteEnd = byteOffset + Buffer.byteLength(grapheme);
      if (width === 0) {
        byteOffset = byteEnd;
        continue;
      }
      if (colOffset >= maxWidth) break;
      if (colOffset + width <= clipLeft) {
        colOffset += width;
        byteOffset = byteEnd;
        continue;
      }
      if (colOffset >= clipRight || colOffset + width > maxWidth) break;
      if (colOffset < clipLeft || colOffset + width > clipRight) {
        colOffset += width;
        byteOffset = byteEnd;
        continue;
      }

      while (spanIndex < spans.length && spans[spanIndex]!.endByte <= byteOffset) spanIndex += 1;
      const span = spans[spanIndex];
      const cellStyle =
        span && span.startByte < byteEnd && span.endByte > byteOffset
          ? applySpan(style, span)
          : style;
      const col = visible.xStart + colOffset - clipLeft;
      this.setCell(col, visible.yStart, printableGrapheme(grapheme), cellStyle);
      for (let continuation = 1; continuation < width; continuation += 1) {
        this.setCellCode(col + continuation, visible.yStart, CONTINUATION_CELL, cellStyle, visible);
      }
      colOffset += width;
      byteOffset = byteEnd;
    }
  }

  drawCursor(rect: SurfaceRect, clipRect: SurfaceRect, textLength: number, style: CellStyle): void {
    const visible = fillBounds(
      intersectRects({ x: rect.x + textLength, y: rect.y, width: 1, height: 1 }, clipRect),
      this.buffer.width,
      this.buffer.height,
    );
    if (visible) this.setCell(visible.xStart, visible.yStart, "█", style);
  }

  setCell(col: number, row: number, value: string, style: CellStyle): void {
    this.setCellCode(col, row, value.codePointAt(0) ?? 32, style);
  }

  private setCellCode(
    col: number,
    row: number,
    code: number,
    style: CellStyle,
    clip?: SurfaceBounds,
  ): void {
    if (clip && !cellInBounds(col, row, clip)) return;
    if (col < 0 || row < 0 || col >= this.buffer.width || row >= this.buffer.height) return;
    const index = row * this.buffer.width + col;
    this.buffer.chars[index] = code;
    this.buffer.foreground[index] = style.foreground;
    this.buffer.background[index] = style.background;
    this.buffer.attrs[index] = style.attrs;
  }

  private drawUniformBorder(
    bounds: SurfaceBounds,
    clip: SurfaceBounds,
    borderStyle: ResolvedBorder["style"],
    foreground: number,
    background: number,
  ): void {
    if (borderStyle === "none") return;
    const glyphs = borderStyle === "rounded" ? "╭╮╰╯─│" : "┌┐└┘─│";
    const style = { foreground, background, attrs: 0 };
    const { xStart, xEnd, yStart, yEnd } = bounds;
    this.setCellCode(xStart, yStart, glyphs.codePointAt(0)!, style, clip);
    this.setCellCode(xEnd, yStart, glyphs.codePointAt(1)!, style, clip);
    this.setCellCode(xStart, yEnd, glyphs.codePointAt(2)!, style, clip);
    this.setCellCode(xEnd, yEnd, glyphs.codePointAt(3)!, style, clip);
    for (let col = xStart + 1; col < xEnd; col += 1) {
      this.setCellCode(col, yStart, glyphs.codePointAt(4)!, style, clip);
      this.setCellCode(col, yEnd, glyphs.codePointAt(4)!, style, clip);
    }
    for (let row = yStart + 1; row < yEnd; row += 1) {
      this.setCellCode(xStart, row, glyphs.codePointAt(5)!, style, clip);
      this.setCellCode(xEnd, row, glyphs.codePointAt(5)!, style, clip);
    }
  }

  private drawMixedBorder(
    bounds: SurfaceBounds,
    clip: SurfaceBounds,
    border: ResolvedBorder,
    background: number,
  ): void {
    const { xStart, xEnd, yStart, yEnd } = bounds;
    const style: CellStyle = { foreground: RESET_COLOR, background, attrs: 0 };
    if (border.top.width > 0) {
      style.foreground = border.top.color;
      for (let col = xStart; col <= xEnd; col += 1)
        this.setCellCode(col, yStart, 0x2500, style, clip);
    }
    if (border.bottom.width > 0) {
      style.foreground = border.bottom.color;
      for (let col = xStart; col <= xEnd; col += 1)
        this.setCellCode(col, yEnd, 0x2500, style, clip);
    }
    if (border.left.width > 0) {
      style.foreground = border.left.color;
      for (let row = yStart; row <= yEnd; row += 1)
        this.setCellCode(xStart, row, 0x2502, style, clip);
    }
    if (border.right.width > 0) {
      style.foreground = border.right.color;
      for (let row = yStart; row <= yEnd; row += 1)
        this.setCellCode(xEnd, row, 0x2502, style, clip);
    }
    if (border.top.width > 0 && border.left.width > 0)
      this.setCellCode(xStart, yStart, 0x250c, { ...style, foreground: border.top.color }, clip);
    if (border.top.width > 0 && border.right.width > 0)
      this.setCellCode(xEnd, yStart, 0x2510, { ...style, foreground: border.top.color }, clip);
    if (border.bottom.width > 0 && border.left.width > 0)
      this.setCellCode(xStart, yEnd, 0x2514, { ...style, foreground: border.bottom.color }, clip);
    if (border.bottom.width > 0 && border.right.width > 0)
      this.setCellCode(xEnd, yEnd, 0x2518, { ...style, foreground: border.bottom.color }, clip);
  }
}

export function inheritedStyle(
  foreground: number | undefined,
  background: number | undefined,
  parentForeground: number,
  parentBackground: number,
): CellStyle {
  return {
    foreground: foreground ?? parentForeground,
    background: background ?? parentBackground,
    attrs: 0,
  };
}

export function intersectRects(
  left: SurfaceRect | null,
  right: SurfaceRect | null,
): SurfaceRect | null {
  if (!left || !right || isEmptyRect(left) || isEmptyRect(right)) return null;
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const xEnd = Math.min(left.x + left.width, right.x + right.width);
  const yEnd = Math.min(left.y + left.height, right.y + right.height);
  if (xEnd <= x || yEnd <= y) return null;
  return { x, y, width: xEnd - x, height: yEnd - y };
}

export function isEmptyRect(rect: SurfaceRect): boolean {
  return (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  );
}

export function fillHitmap(
  hitmap: Uint32Array,
  width: number,
  height: number,
  rect: SurfaceRect,
  nodeId: number,
): void {
  const bounds = fillBounds(rect, width, height);
  if (!bounds) return;
  for (let row = bounds.yStart; row < bounds.yEnd; row += 1) {
    hitmap.fill(nodeId, row * width + bounds.xStart, row * width + bounds.xEnd);
  }
}

function fillBounds(rect: SurfaceRect | null, width: number, height: number): SurfaceBounds | null {
  const visible = intersectRects(rect, { x: 0, y: 0, width, height });
  if (!visible) return null;
  const bounds = {
    xStart: Math.max(0, Math.floor(visible.x)),
    xEnd: Math.min(width, Math.ceil(visible.x + visible.width)),
    yStart: Math.max(0, Math.floor(visible.y)),
    yEnd: Math.min(height, Math.ceil(visible.y + visible.height)),
  };
  return bounds.xStart < bounds.xEnd && bounds.yStart < bounds.yEnd ? bounds : null;
}

function borderBounds(rect: SurfaceRect, width: number, height: number): SurfaceBounds | null {
  if (isEmptyRect(rect)) return null;
  const bounds = {
    xStart: Math.max(0, Math.floor(rect.x)),
    xEnd: Math.min(width - 1, Math.ceil(rect.x + rect.width) - 1),
    yStart: Math.max(0, Math.floor(rect.y)),
    yEnd: Math.min(height - 1, Math.ceil(rect.y + rect.height) - 1),
  };
  return bounds.xStart <= bounds.xEnd && bounds.yStart <= bounds.yEnd ? bounds : null;
}

function terminalRect(buffer: CellBuffer): SurfaceRect {
  return { x: 0, y: 0, width: buffer.width, height: buffer.height };
}

function hasVisibleBorder(border: ResolvedBorder): boolean {
  return (
    border.top.width > 0 ||
    border.right.width > 0 ||
    border.bottom.width > 0 ||
    border.left.width > 0
  );
}

function uniformBorder(border: ResolvedBorder): number | null {
  if (
    border.style === "none" ||
    border.top.width <= 0 ||
    border.right.width <= 0 ||
    border.bottom.width <= 0 ||
    border.left.width <= 0
  )
    return null;
  const color = border.top.color;
  return border.right.color === color &&
    border.bottom.color === color &&
    border.left.color === color
    ? color
    : null;
}

function applySpan(style: CellStyle, span: NormalizedTextSpan): CellStyle {
  return {
    foreground: span.foreground ?? style.foreground,
    background: span.background ?? style.background,
    attrs:
      style.attrs |
      (span.bold ? TEXT_ATTR_BOLD : 0) |
      (span.italic ? TEXT_ATTR_ITALIC : 0) |
      (span.underline ? TEXT_ATTR_UNDERLINE : 0),
  };
}

function printableGrapheme(grapheme: string): string {
  for (const char of grapheme) {
    if (!/^\p{Cc}$/u.test(char)) return char;
  }
  return " ";
}

function cellInBounds(col: number, row: number, bounds: SurfaceBounds): boolean {
  return col >= bounds.xStart && col < bounds.xEnd && row >= bounds.yStart && row < bounds.yEnd;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
