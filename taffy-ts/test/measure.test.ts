import assert from "node:assert/strict";
import test from "node:test";
import { AlignItems, AvailableSpace, AvailableSpaceSize, Dimension, LengthPercentage, Point, Position, Rect, Size, Style, TaffyTree, } from "../src/index.js";
import type { NodeId } from "../src/index.js";

type FixedMeasureContext = { type: "fixed"; width: number; height: number; count?: number };
type AspectRatioMeasureContext = { type: "aspectRatio"; width: number; heightRatio: number; count?: number };
type MeasureContext = FixedMeasureContext | AspectRatioMeasureContext;

const HUNDRED_HUNDRED: FixedMeasureContext = { type: "fixed", width: 100, height: 100 };
const HUNDRED_FIFTY: FixedMeasureContext = { type: "fixed", width: 100, height: 50 };
const FIFTY_FIFTY: FixedMeasureContext = { type: "fixed", width: 50, height: 50 };
test("Rust hand-written measure root uses node context intrinsic size", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeafWithContext(Style.default(), fixed(100, 100));
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(taffy.layout(node).size, new Size(100, 100));
});
test("Rust hand-written measure child sizes parent and child from measured content", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeafWithContext(Style.default(), fixed(100, 100));
    const node = taffy.newWithChildren(Style.default(), [child]);
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(taffy.layout(node).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 100));
});
test("Rust hand-written measure child constraint keeps child intrinsic width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeafWithContext(Style.default(), fixed(100, 100));
    const node = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(50), Dimension.auto()) }), [child]);
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(taffy.layout(node).size, new Size(50, 100));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 100));
});
test("Rust hand-written measure child constraint includes parent padding", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeafWithContext(Style.default(), fixed(100, 100));
    const node = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(50), Dimension.auto()),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
    }), [child]);
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(taffy.layout(node).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(node).size, new Size(50, 120));
    assert.deepEqual(taffy.layout(child).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 100));
});
test("Rust hand-written flex measurement remeasures grow, shrink, and stretch cases", () => {
    const growTree = TaffyTree.new();
    const growFixed = growTree.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)) }));
    const growMeasured = growTree.newLeafWithContext(new Style({ flexGrow: 1 }), FIFTY_FIFTY);
    const growRoot = growTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.auto()) }), [growFixed, growMeasured]);
    growTree.computeLayoutWithMeasure(growRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(growTree.layout(growMeasured).size, new Size(50, 50));
    const shrinkTree = TaffyTree.new();
    const shrinkFixed = shrinkTree.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)), flexShrink: 0 }));
    const shrinkMeasured = shrinkTree.newLeafWithContext(Style.default(), HUNDRED_FIFTY);
    const shrinkRoot = shrinkTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.auto()) }), [shrinkFixed, shrinkMeasured]);
    shrinkTree.computeLayoutWithMeasure(shrinkRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(shrinkTree.layout(shrinkMeasured).size, new Size(100, 50));
    const stretchTree = TaffyTree.new();
    const stretchChild = stretchTree.newLeafWithContext(Style.default(), undefined);
    const stretchRoot = stretchTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [stretchChild]);
    stretchTree.computeLayoutWithMeasure(stretchRoot, AvailableSpaceSize.maxContent(), (known) => {
        const height = known.height ?? 50;
        return new Size(known.width ?? height, height);
    });
    assert.deepEqual(stretchTree.layout(stretchChild).size, new Size(100, 100));
});
test("Rust hand-written flex measurement remeasures aspect-ratio children after flexing", () => {
    const growTree = TaffyTree.new();
    const growFixed = growTree.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)) }));
    const growMeasured = growTree.newLeafWithContext(new Style({ flexGrow: 1 }), aspectRatio(10, 2));
    const growRoot = growTree.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.auto()),
        alignItems: AlignItems.Start,
    }), [growFixed, growMeasured]);
    growTree.computeLayoutWithMeasure(growRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(growTree.layout(growMeasured).size, new Size(50, 100));
    const shrinkTree = TaffyTree.new();
    const shrinkFixed = shrinkTree.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)), flexShrink: 0 }));
    const shrinkMeasured = shrinkTree.newLeafWithContext(Style.default(), aspectRatio(100, 2));
    const shrinkRoot = shrinkTree.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.auto()),
        alignItems: AlignItems.Start,
    }), [shrinkFixed, shrinkMeasured]);
    shrinkTree.computeLayoutWithMeasure(shrinkRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(shrinkTree.layout(shrinkMeasured).size, new Size(100, 200));
});
test("Rust hand-written explicit sizes and flex-basis override measurement", () => {
    const widthTree = TaffyTree.new();
    const widthChild = widthTree.newLeafWithContext(new Style({ size: new Size(Dimension.length(50), Dimension.auto()) }), HUNDRED_HUNDRED);
    const widthRoot = widthTree.newWithChildren(Style.default(), [widthChild]);
    widthTree.computeLayoutWithMeasure(widthRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(widthTree.layout(widthChild).size, new Size(50, 100));
    const heightTree = TaffyTree.new();
    const heightChild = heightTree.newLeafWithContext(new Style({ size: new Size(Dimension.auto(), Dimension.length(50)) }), HUNDRED_HUNDRED);
    const heightRoot = heightTree.newWithChildren(Style.default(), [heightChild]);
    heightTree.computeLayoutWithMeasure(heightRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(heightTree.layout(heightChild).size, new Size(100, 50));
    const basisTree = TaffyTree.new();
    const basisChild0 = basisTree.newLeaf(new Style({ flexBasis: Dimension.length(50), flexGrow: 1 }));
    const basisChild1 = basisTree.newLeafWithContext(new Style({ flexBasis: Dimension.length(50), flexGrow: 1 }), HUNDRED_HUNDRED);
    const basisRoot = basisTree.newWithChildren(new Style({ size: new Size(Dimension.length(200), Dimension.length(100)) }), [basisChild0, basisChild1]);
    basisTree.computeLayoutWithMeasure(basisRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(basisTree.layout(basisChild0).size, new Size(100, 100));
    assert.deepEqual(basisTree.layout(basisChild1).size, new Size(100, 100));
});
test("Rust hand-written stretch, absolute, and missing-context measure cases match Rust", () => {
    const stretchTree = TaffyTree.new();
    const stretchChild = stretchTree.newLeafWithContext(Style.default(), FIFTY_FIFTY);
    const stretchRoot = stretchTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [stretchChild]);
    stretchTree.computeLayoutWithMeasure(stretchRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(stretchTree.layout(stretchChild).size, new Size(50, 100));
    const absoluteTree = TaffyTree.new();
    const absoluteChild = absoluteTree.newLeafWithContext(new Style({ position: Position.Absolute }), FIFTY_FIFTY);
    const absoluteRoot = absoluteTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absoluteChild]);
    absoluteTree.computeLayoutWithMeasure(absoluteRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(absoluteTree.layout(absoluteChild).size, new Size(50, 50));
    const invalidTree = TaffyTree.new();
    const invalidChild = invalidTree.newLeaf(new Style({ flexGrow: 1 }));
    const invalidRoot = invalidTree.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [invalidChild]);
    invalidTree.computeLayoutWithMeasure(invalidRoot, AvailableSpaceSize.maxContent(), testMeasureFunction);
    assert.deepEqual(invalidTree.layout(invalidChild).size, new Size(100, 100));
});
function fixed(width: number, height: number): FixedMeasureContext {
    return { type: "fixed", width, height };
}
function aspectRatio(width: number, heightRatio: number): AspectRatioMeasureContext {
    return { type: "aspectRatio", width, heightRatio };
}
function testMeasureFunction(knownDimensions: Size, availableSpace: Size, _nodeId: NodeId<MeasureContext>, context: MeasureContext | undefined): Size {
    if (knownDimensions.width !== undefined && knownDimensions.height !== undefined) {
        return new Size(knownDimensions.width, knownDimensions.height);
    }
    if (context === undefined) {
        return knownDimensions.map((dimension: number | undefined) => dimension ?? 0);
    }
    context.count = (context.count ?? 0) + 1;
    const measuredSize = context.type === "fixed"
        ? new Size(context.width, context.height)
        : measureAspectRatio(context, knownDimensions, availableSpace);
    return new Size(knownDimensions.width ?? measuredSize.width, knownDimensions.height ?? measuredSize.height);
}
function measureAspectRatio(context: AspectRatioMeasureContext, knownDimensions: Size, _availableSpace: Size): Size {
    const width = knownDimensions.width ?? context.width;
    const height = knownDimensions.height ?? width * context.heightRatio;
    return new Size(width, height);
}
