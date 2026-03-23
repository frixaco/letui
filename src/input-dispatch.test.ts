import { describe, expect, it } from "bun:test";

import { parseInputCommands } from "./input-dispatch";

describe("parseInputCommands", () => {
  it("treats windows backspace as deleteBackward", () => {
    expect(parseInputCommands("ab\x08")).toEqual([
      { type: "insertText", text: "ab" },
      { type: "deleteBackward" },
    ]);
  });

  it("treats del backspace as deleteBackward", () => {
    expect(parseInputCommands("ab\x7f")).toEqual([
      { type: "insertText", text: "ab" },
      { type: "deleteBackward" },
    ]);
  });
});
