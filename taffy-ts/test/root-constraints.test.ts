import assert from "node:assert/strict";
import test from "node:test";
import { AvailableSpace, AvailableSpaceSize, Dimension, LengthPercentage, Rect, Size, Style, TaffyTree, } from "../src/index.js";
test("root with percentage size resolves against available space", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({ size: new Size(Dimension.percent(1), Dimension.percent(1)) }));
    taffy.computeLayout(node, new Size(AvailableSpace.definite(100), AvailableSpace.definite(200)));
    assert.deepEqual(taffy.layout(node).size, new Size(100, 200));
});
test("root with no size remains zero sized", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(Style.default());
    taffy.computeLayout(node, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(taffy.layout(node).size, Size.zero());
});
test("root explicit size can exceed available space", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({ size: new Size(Dimension.length(200), Dimension.length(200)) }));
    taffy.computeLayout(node, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(taffy.layout(node).size, new Size(200, 200));
});
test("root padding and border larger than definite size floor block root size", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(Style.default());
    const ten = LengthPercentage.length(10);
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(10), Dimension.length(10)),
        padding: new Rect(ten, ten, ten, ten),
        border: new Rect(ten, ten, ten, ten),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
});
