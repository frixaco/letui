import { describe, expect, test } from "bun:test";
import { Column, Text } from "./components.ts";
import { OpQueue } from "./ops.ts";
import { prepareRenderTreeSync } from "./sync.ts";

describe("render-tree shape changes", () => {
  test("syncs appended children without resetting the native tree", () => {
    const first = Text({ text: "first" });
    const root = Column({}, [first]);
    const initial = prepareRenderTreeSync(root, null, new OpQueue());

    root.appendChild(Text({ text: "second" }));
    const appended = prepareRenderTreeSync(root, initial.sentTree, new OpQueue());
    expect(appended.requiresTreeReset).toBe(false);

    root.setChildren([first]);
    const removed = prepareRenderTreeSync(root, appended.sentTree, new OpQueue());
    expect(removed.requiresTreeReset).toBe(true);
  });
});
