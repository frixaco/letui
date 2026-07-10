import { describe, expect, test } from "bun:test";
import { wrapText } from "../src/text-layout.ts";

describe("wrapText", () => {
  const cases = [
    ["", 10, 10, "word", "clip", [""]],
    ["hello world", 5, 0, "char", "ellipsis", []],
    ["hello world", 0, 5, "word", "clip", []],
    ["hello", 10, 2, "none", "clip", ["hello"]],
    ["abcdef", 4, 2, "none", "clip", ["abcd"]],
    ["abcdef", 4, 2, "none", "ellipsis", ["abc…"]],
    ["abcdef", 2, 10, "char", "clip", ["ab", "cd", "ef"]],
    ["ab cd", 3, 10, "char", "clip", ["ab ", "cd"]],
    ["e\u0301x", 1, 10, "char", "clip", ["e\u0301", "x"]],
    ["界ab", 2, 10, "char", "clip", ["界", "ab"]],
    ["abcdefg", 3, 2, "char", "ellipsis", ["abc", "de…"]],
    ["abcdefg", 3, 2, "char", "clip", ["abc", "def"]],
    ["hello world", 8, 10, "word", "clip", ["hello ", "world"]],
    ["ab cd ef", 5, 10, "word", "clip", ["ab cd", " ef"]],
    ["ab cd", 3, 10, "word", "clip", ["ab ", "cd"]],
    ["alphabet", 3, 10, "word", "clip", ["alp", "hab", "et"]],
    ["a alphabet", 3, 10, "word", "clip", ["a ", "alp", "hab", "et"]],
    ["one two three", 4, 2, "word", "ellipsis", ["one ", "two…"]],
    ["alpha\nbeta", 10, 10, "word", "clip", ["alpha", "beta"]],
    ["alpha\n\nbeta\n", 10, 10, "word", "clip", ["alpha", "", "beta", ""]],
    ["abcdef", 1, 1, "none", "ellipsis", ["…"]],
    ["e\u0301\nx", 1, 1, "char", "ellipsis", ["…"]],
  ] as const;

  test.each(cases)("wraps %p", (text, width, height, wrap, overflow, expected) => {
    const result = wrapText(text, [], width, height, wrap, overflow);
    expect(result.lines.map((line) => line.text)).toEqual(expected);
  });

  test("preserves styled byte ranges across wrapping", () => {
    const result = wrapText(
      "hello\nworld",
      [{ start: 3, end: 8, startByte: 3, endByte: 8, bold: true }],
      10,
      10,
      "word",
      "clip",
    );
    expect(
      result.lines.map((line) => line.spans.map(({ startByte, endByte }) => [startByte, endByte])),
    ).toEqual([[[3, 5]], [[0, 2]]]);
  });

  test("trims styled byte ranges to an ellipsized prefix", () => {
    const result = wrapText(
      "abcdef",
      [{ start: 1, end: 5, startByte: 1, endByte: 5, underline: true }],
      4,
      2,
      "none",
      "ellipsis",
    );
    expect(result.lines[0]?.text).toBe("abc…");
    expect(result.lines[0]?.spans[0]).toMatchObject({ startByte: 1, endByte: 3, underline: true });
  });
});
