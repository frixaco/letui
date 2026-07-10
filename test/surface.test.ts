import { describe, expect, test } from "bun:test";
import {
  CellBuffer,
  CONTINUATION_CELL,
  RESET_COLOR,
  Surface,
  TEXT_ATTR_BOLD,
  inheritedStyle,
  intersectRects,
} from "../src/surface.ts";
import { diffFrame, firstFrame } from "../src/terminal.ts";

describe("Surface", () => {
  test("clips negative rectangles", () => {
    expect(
      intersectRects({ x: -2, y: -1, width: 5, height: 4 }, { x: 0, y: 0, width: 10, height: 10 }),
    ).toEqual({ x: 0, y: 0, width: 3, height: 3 });
  });

  test("does not paint a wide grapheme clipped at either edge", () => {
    const left = new CellBuffer(4, 1);
    new Surface(left).drawText(
      { x: 0, y: 0, width: 3, height: 1 },
      { x: 1, y: 0, width: 2, height: 1 },
      "界a",
      { foreground: RESET_COLOR, background: 0, attrs: 0 },
      [],
    );
    expect([...left.chars]).toEqual([32, 32, 97, 32]);

    const right = new CellBuffer(4, 1);
    new Surface(right).drawText(
      { x: 0, y: 0, width: 3, height: 1 },
      { x: 0, y: 0, width: 2, height: 1 },
      "a界",
      { foreground: RESET_COLOR, background: 0, attrs: 0 },
      [],
    );
    expect([...right.chars]).toEqual([97, 32, 32, 32]);
  });

  test("inherits reset colors but preserves explicit black", () => {
    expect(inheritedStyle(undefined, undefined, 0xabcdef, 0x123456)).toMatchObject({
      foreground: 0xabcdef,
      background: 0x123456,
    });
    expect(inheritedStyle(0, 0, 0xabcdef, 0x123456)).toMatchObject({
      foreground: 0,
      background: 0,
    });
  });

  test("preserves rounded corners for an explicit black border", () => {
    const buffer = new CellBuffer(4, 3);
    new Surface(buffer).drawBorder(
      { x: 0, y: 0, width: 4, height: 3 },
      { x: 0, y: 0, width: 4, height: 3 },
      {
        top: { width: 1, color: 0 },
        right: { width: 1, color: 0 },
        bottom: { width: 1, color: 0 },
        left: { width: 1, color: 0 },
        style: "rounded",
      },
      0xffffff,
    );
    expect(String.fromCodePoint(buffer.chars[0]!)).toBe("╭");
  });
});

test("terminal diff emits only changed cells", () => {
  const previous = new CellBuffer(3, 1);
  const current = new CellBuffer(3, 1);
  current.chars[1] = "x".codePointAt(0)!;
  expect(diffFrame(current, previous)).toContain("\x1b[1;2Hx");
});

test("terminal output preserves black, attributes, and wide-cell continuations", () => {
  const previous = new CellBuffer(2, 1);
  const current = new CellBuffer(2, 1);
  current.chars[0] = "界".codePointAt(0)!;
  current.chars[1] = CONTINUATION_CELL;
  current.foreground.fill(0);
  current.attrs.fill(TEXT_ATTR_BOLD);

  const first = firstFrame(current);
  expect(first).toContain("\x1b[38;2;0;0;0m");
  expect(first).toContain("\x1b[1m");
  expect(first.match(/界/g)).toHaveLength(1);

  current.attrs.fill(0);
  expect(diffFrame(current, previous)).not.toContain("\x1b[1m");
});
