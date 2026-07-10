import assert from "node:assert/strict";
import test from "node:test";
import { AlignContent, AlignItems, AvailableSpace, AvailableSpaceSize, Dimension, Display, LengthPercentageAuto, Point, Rect, Size, Style, TaffyTree, } from "../src/index.js";
import type { NodeId } from "../src/index.js";
test("Rust hand-written relayout keeps repeated layout locations stable", () => {
    const taffy = TaffyTree.new();
    const node1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(8), Dimension.length(80)) }));
    const node0 = taffy.newWithChildren(new Style({
        alignSelf: AlignItems.Center,
        size: new Size(Dimension.auto(), Dimension.auto()),
    }), [node1]);
    const node = taffy.newWithChildren(new Style({ size: new Size(Dimension.percent(1), Dimension.percent(1)) }), [node0]);
    const availableSpace = new Size(AvailableSpace.definite(100), AvailableSpace.definite(100));
    taffy.computeLayout(node, availableSpace);
    const initial = pointOf(taffy.layout(node).location);
    const initial0 = pointOf(taffy.layout(node0).location);
    const initial1 = pointOf(taffy.layout(node1).location);
    for (let index = 1; index < 10; index += 1) {
        taffy.computeLayout(node, availableSpace);
        assert.deepEqual(taffy.layout(node).location, initial);
        assert.deepEqual(taffy.layout(node0).location, initial0);
        assert.deepEqual(taffy.layout(node1).location, initial1);
    }
});
test("Rust hand-written relayout toggles root display none", () => {
    const taffy = TaffyTree.new();
    const hiddenStyle = sizedDisplay(Display.None);
    const flexStyle = sizedDisplay(Display.Flex);
    const node = taffy.newLeaf(hiddenStyle);
    taffy.computeLayout(node, AvailableSpaceSize.maxContent());
    assertLayout(taffy, node, new Point(0, 0), Size.zero());
    taffy.setStyle(node, flexStyle);
    taffy.computeLayout(node, AvailableSpaceSize.maxContent());
    assertLayout(taffy, node, new Point(0, 0), new Size(100, 100));
    taffy.setStyle(node, hiddenStyle);
    taffy.computeLayout(node, AvailableSpaceSize.maxContent());
    assertLayout(taffy, node, new Point(0, 0), Size.zero());
});
test("Rust hand-written relayout toggles root display none with children recursively", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(800), Dimension.length(100)) }));
    const parent = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(800), Dimension.length(100)) }), [child]);
    const root = taffy.newWithChildren(Style.default(), [parent]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).size, new Size(800, 100));
    taffy.setStyle(root, new Style({ display: Display.None }));
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).size, Size.zero());
    taffy.setStyle(root, Style.default());
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(parent).size, new Size(800, 100));
    assert.deepEqual(taffy.layout(child).size, new Size(800, 100));
});
test("Rust hand-written relayout toggles flex display none child and container", () => {
    const childTree = TaffyTree.new();
    const hiddenStyle = sizedDisplay(Display.None);
    const flexStyle = sizedDisplay(Display.Flex);
    const childNode = childTree.newLeaf(hiddenStyle);
    const childRoot = childTree.newWithChildren(flexStyle, [childNode]);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), Size.zero());
    childTree.setStyle(childNode, flexStyle);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), new Size(100, 100));
    childTree.setStyle(childNode, hiddenStyle);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), Size.zero());
    const containerTree = TaffyTree.new();
    const containerChild = containerTree.newLeaf(hiddenStyle);
    const containerRoot = containerTree.newWithChildren(hiddenStyle, [containerChild]);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), Size.zero());
    containerTree.setStyle(containerRoot, flexStyle);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), new Size(100, 100));
    containerTree.setStyle(containerRoot, hiddenStyle);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), Size.zero());
});
test("Rust hand-written relayout toggles grid display none child and container", () => {
    const childTree = TaffyTree.new();
    const hiddenStyle = sizedDisplay(Display.None);
    const gridStyle = sizedDisplay(Display.Grid);
    const childNode = childTree.newLeaf(hiddenStyle);
    const childRoot = childTree.newWithChildren(gridStyle, [childNode]);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), Size.zero());
    childTree.setStyle(childNode, gridStyle);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), new Size(100, 100));
    childTree.setStyle(childNode, hiddenStyle);
    childTree.computeLayout(childRoot, AvailableSpaceSize.maxContent());
    assertLayout(childTree, childNode, new Point(0, 0), Size.zero());
    const containerTree = TaffyTree.new();
    const containerChild = containerTree.newLeaf(hiddenStyle);
    const containerRoot = containerTree.newWithChildren(hiddenStyle, [containerChild]);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), Size.zero());
    containerTree.setStyle(containerRoot, gridStyle);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), new Size(100, 100));
    containerTree.setStyle(containerRoot, hiddenStyle);
    containerTree.computeLayout(containerRoot, AvailableSpaceSize.maxContent());
    assertLayout(containerTree, containerRoot, new Point(0, 0), Size.zero());
});
test("Rust hand-written relayout remains stable with cumulative rounding", () => {
    const taffy = TaffyTree.new();
    taffy.enableRounding();
    const inner = taffy.newLeaf(new Style({ minSize: new Size(Dimension.length(300), Dimension.auto()) }));
    const wrapper = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(150), Dimension.auto()),
        justifyContent: AlignContent.End,
    }), [inner]);
    const outer = taffy.newWithChildren(new Style({
        size: new Size(Dimension.percent(1), Dimension.auto()),
        inset: new Rect(LengthPercentageAuto.length(1.5), LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }), [wrapper]);
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(1920), Dimension.length(1080)) }), [outer]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    const initialRoot = layoutSnapshot(taffy, root);
    assert.deepEqual(initialRoot.location, new Point(0, 0));
    assert.deepEqual(initialRoot.size, new Size(1920, 1080));
    const initialOuter = layoutSnapshot(taffy, outer);
    assert.deepEqual(initialOuter.location, new Point(2, 0));
    assert.deepEqual(initialOuter.size, new Size(1920, 1080));
    const initialWrapper = layoutSnapshot(taffy, wrapper);
    assert.deepEqual(initialWrapper.location, new Point(0, 0));
    assert.deepEqual(initialWrapper.size, new Size(150, 1080));
    const initialInner = layoutSnapshot(taffy, inner);
    assert.deepEqual(initialInner.location, new Point(-150, 0));
    assert.deepEqual(initialInner.size, new Size(300, 1080));
    for (let index = 0; index < 5; index += 1) {
        taffy.markDirty(root);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(layoutSnapshot(taffy, root), initialRoot);
        assert.deepEqual(layoutSnapshot(taffy, outer), initialOuter);
        assert.deepEqual(layoutSnapshot(taffy, wrapper), initialWrapper);
        assert.deepEqual(layoutSnapshot(taffy, inner), initialInner);
    }
});
function sizedDisplay(display: Display): Style {
    return new Style({
        display,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    });
}
function assertLayout(tree: TaffyTree, node: NodeId<unknown>, location: Point, size: Size): void {
    assert.deepEqual(tree.layout(node).location, location);
    assert.deepEqual(tree.layout(node).size, size);
}
function layoutSnapshot(tree: TaffyTree, node: NodeId<unknown>): { location: Point; size: Size } {
    const layout = tree.layout(node);
    return {
        location: pointOf(layout.location),
        size: new Size(layout.size.width, layout.size.height),
    };
}
function pointOf(point: Point): Point {
    return new Point(point.x, point.y);
}
