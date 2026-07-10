import assert from "node:assert/strict";
import test from "node:test";
import { AvailableSpace, AvailableSpaceSize, Display, Size, Style, TaffyTree, } from "../src/index.js";
import type { NodeId } from "../src/index.js";

type FixedMeasureContext = { count: number; width: number; height: number };
test("Rust hand-written caching limits flexbox measurement count through deep wrapper trees", () => {
    const taffy = TaffyTree.new();
    const leaf = taffy.newLeafWithContext(Style.default(), fixedContext(50, 50));
    let node = taffy.newWithChildren(Style.default(), [leaf]);
    for (let index = 0; index < 100; index += 1) {
        node = taffy.newWithChildren(Style.default(), [node]);
    }
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.equal(taffy.getNodeContextMut(leaf)?.count, 4);
});
test("Rust hand-written caching limits grid measurement count through deep wrapper trees", () => {
    const taffy = TaffyTree.new();
    const leaf = taffy.newLeafWithContext(new Style({ display: Display.Grid }), fixedContext(50, 50));
    let node = taffy.newWithChildren(Style.default(), [leaf]);
    for (let index = 0; index < 100; index += 1) {
        node = taffy.newWithChildren(Style.default(), [node]);
    }
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.equal(taffy.getNodeContextMut(leaf)?.count, 4);
});
function fixedContext(width: number, height: number): FixedMeasureContext {
    return { count: 0, width, height };
}
function testMeasureFunction(knownDimensions: Size, _availableSpace: Size, _nodeId: NodeId<FixedMeasureContext>, context: FixedMeasureContext | undefined): Size {
    if (knownDimensions.width !== undefined && knownDimensions.height !== undefined) {
        return new Size(knownDimensions.width, knownDimensions.height);
    }
    if (context === undefined) {
        return knownDimensions.map((dimension: number | undefined) => dimension ?? 0);
    }
    context.count += 1;
    return new Size(knownDimensions.width ?? context.width, knownDimensions.height ?? context.height);
}
