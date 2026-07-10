import assert from "node:assert/strict";
import test from "node:test";
import { AvailableSpaceSize, BlockFormattingContext, BoxSizing, Clear, Dimension, Direction, Display, Float, FloatDirection, LengthPercentage, LengthPercentageAuto, Overflow, Point, Position, Rect, Size, Style, TaffyTree, } from "../src/index.js";
test("block formatting context matches low-level float context helpers", () => {
    const formattingContext = BlockFormattingContext.new();
    const rootContext = formattingContext.root_block_context();
    assert.equal(rootContext.is_bfc_root(), true);
    rootContext.set_width(120);
    rootContext.apply_content_box_inset([5, 10]);
    const childContext = rootContext.sub_context(10, [3, 4]);
    assert.equal(childContext.isBfcRoot(), false);
    assert.deepEqual(childContext.place_floated_box(new Size(20, 15), 2, FloatDirection.Left, Clear.None), new Point(0, 2));
    assert.equal(childContext.has_floats(), true);
    assert.equal(childContext.has_active_floats(16), true);
    assert.equal(childContext.hasActiveFloats(17), false);
    assert.equal(childContext.cleared_threshold(Clear.Left), 17);
    assert.equal(childContext.floated_content_height_contribution(), 17);
    const slot = childContext.find_content_slot(2, Clear.None, undefined);
    assert.deepEqual({
        segmentId: slot.segmentId,
        segment_id: slot.segment_id,
        x: slot.x,
        y: slot.y,
        width: slot.width,
    }, { segmentId: 1, segment_id: 1, x: 20, y: 2, width: 93 });
    rootContext.add_child_floated_content_height_contribution(childContext.floatedContentHeightContribution());
    assert.equal(rootContext.floatedContentHeightContribution(), 17);
});
test("block container stacks in-flow children and resolves vertical margins", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 40));
    assert.deepEqual(taffy.layout(child0).size, new Size(50, 10));
    assert.equal(taffy.layout(child0).location.y, 10);
    assert.deepEqual(taffy.layout(child1).size, new Size(50, 10));
    assert.equal(taffy.layout(child1).location.y, 30);
});
test("block padding constrains stretched child width", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        padding: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(child0).size, new Size(38, 10));
    assert.equal(taffy.layout(child0).location.x, 8);
    assert.equal(taffy.layout(child0).location.y, 2);
    assert.deepEqual(taffy.layout(child1).size, new Size(38, 10));
    assert.equal(taffy.layout(child1).location.y, 12);
});
test("block final layout resolves percentage padding against content-based width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(100), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.auto()),
        padding: new Rect(LengthPercentage.percent(0.1), LengthPercentage.percent(0.1), LengthPercentage.zero(), LengthPercentage.zero()),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 10));
    assert.equal(taffy.layout(child).location.x, 10);
    assert.deepEqual(taffy.layout(child).size, new Size(100, 10));
});
test("block horizontal auto margins consume free inline space", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child0).location.x, 150);
    assert.equal(taffy.layout(child0).margin.left, 150);
    assert.equal(taffy.layout(child1).location.x, 0);
    assert.equal(taffy.layout(child1).location.y, 50);
});
test("block table item does not stretch fit auto width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeafWithContext(new Style({
        display: Display.Block,
        itemIsTable: true,
        size: new Size(Dimension.auto(), Dimension.length(10)),
    }), "table");
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_knownDimensions, _availableSpace, _nodeId, context) => context === "table" ? new Size(30, 10) : Size.zero());
    assert.deepEqual(taffy.layout(child).size, new Size(30, 10));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
});
test("block vertical percentage margins resolve against container width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.1)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(200), Dimension.auto()),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 50));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 20));
    assert.equal(taffy.layout(child).margin.top, 20);
    assert.equal(taffy.layout(child).margin.bottom, 20);
});
test("block scrollbars reduce absolute child containing space", () => {
    const cases = [
        {
            name: "main_axis",
            overflow: new Point(Overflow.Scroll, Overflow.Visible),
            expectedScrollbar: new Size(0, 15),
            expectedChildSize: new Size(50, 35),
        },
        {
            name: "cross_axis",
            overflow: new Point(Overflow.Visible, Overflow.Scroll),
            expectedScrollbar: new Size(15, 0),
            expectedChildSize: new Size(35, 50),
        },
        {
            name: "both_axis",
            overflow: new Point(Overflow.Scroll, Overflow.Scroll),
            expectedScrollbar: new Size(15, 15),
            expectedChildSize: new Size(35, 35),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const child = taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            position: Position.Absolute,
            inset: Rect.length(0, LengthPercentageAuto),
        }));
        const root = taffy.newWithChildren(new Style({
            display: Display.Block,
            direction: Direction.Ltr,
            overflow: testCase.overflow,
            scrollbarWidth: 15,
            size: new Size(Dimension.length(50), Dimension.length(50)),
        }), [child]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, new Size(50, 50), testCase.name);
        assert.deepEqual(taffy.layout(root).scrollbarSize, testCase.expectedScrollbar, testCase.name);
        assert.deepEqual(taffy.layout(child).location, Point.zero(), testCase.name);
        assert.deepEqual(taffy.layout(child).size, testCase.expectedChildSize, testCase.name);
    }
});
test("block scrollbars clamp absolute child space after size constraints", () => {
    const explicitTree = TaffyTree.new();
    const explicitChild = explicitTree.newLeaf(new Style({
        direction: Direction.Ltr,
        position: Position.Absolute,
        inset: Rect.length(0, LengthPercentageAuto),
    }));
    const explicitRoot = explicitTree.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(2), Dimension.length(4)),
    }), [explicitChild]);
    const maxTree = TaffyTree.new();
    const maxChild = maxTree.newLeaf(new Style({
        direction: Direction.Ltr,
        position: Position.Absolute,
        inset: Rect.length(0, LengthPercentageAuto),
    }));
    const maxRoot = maxTree.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        maxSize: new Size(Dimension.length(2), Dimension.length(4)),
    }), [maxChild]);
    explicitTree.computeLayout(explicitRoot, AvailableSpaceSize.maxContent());
    maxTree.computeLayout(maxRoot, AvailableSpaceSize.maxContent());
    assert.deepEqual(explicitTree.layout(explicitRoot).size, new Size(2, 4));
    assert.deepEqual(explicitTree.layout(explicitRoot).scrollbarSize, new Size(15, 15));
    assert.deepEqual(explicitTree.layout(explicitChild).location, Point.zero());
    assert.deepEqual(explicitTree.layout(explicitChild).size, Size.zero());
    assert.deepEqual(maxTree.layout(maxRoot).size, new Size(2, 4));
    assert.deepEqual(maxTree.layout(maxRoot).scrollbarSize, new Size(15, 15));
    assert.deepEqual(maxTree.layout(maxChild).location, Point.zero());
    assert.deepEqual(maxTree.layout(maxChild).size, Size.zero());
});
test("block rtl scrollbar keeps in-flow child on the physical content edge", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        overflow: new Point(Overflow.Visible, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(15, 0));
    assert.deepEqual(taffy.layout(child).location, new Point(150, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(50, 20));
});
test("nested block margins collapse through same-bfc auto-height parent", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(20), LengthPercentageAuto.length(30)),
    }));
    const wrapper = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.auto()),
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [wrapper]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 60));
    assert.deepEqual(taffy.layout(wrapper).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(wrapper).size, new Size(100, 10));
    assert.deepEqual(taffy.layout(grandchild).location, Point.zero());
    assert.deepEqual(taffy.layout(grandchild).size, new Size(100, 10));
});
test("block empty middle margins collapse through between siblings", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const middle = taffy.newLeaf(new Style({
        display: Display.Block,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const last = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [first, middle, last]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 30));
    assert.deepEqual(taffy.layout(first).location, Point.zero());
    assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(middle).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(middle).size, new Size(50, 0));
    assert.deepEqual(taffy.layout(last).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(last).size, new Size(50, 10));
});
test("block complex vertical margins collapse through nested children", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-10), LengthPercentageAuto.length(-10)),
    }));
    const grandchild0 = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-5), LengthPercentageAuto.length(-5)),
    }));
    const grandchild1 = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(7), LengthPercentageAuto.length(3)),
    }));
    const grandchild2 = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-6), LengthPercentageAuto.length(9)),
    }));
    const second = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-10), LengthPercentageAuto.length(-10)),
    }), [grandchild0, grandchild1, grandchild2]);
    const third = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-5), LengthPercentageAuto.length(-5)),
    }));
    const fourth = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(-10), LengthPercentageAuto.length(-10)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.auto()),
    }), [first, second, third, fourth]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 0));
    assert.deepEqual(taffy.layout(first).location, new Point(0, -10));
    assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(second).location, new Point(0, -10));
    assert.deepEqual(taffy.layout(second).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(grandchild0).location, new Point(0, -5));
    assert.deepEqual(taffy.layout(grandchild0).size, new Size(0, 10));
    assert.deepEqual(taffy.layout(grandchild1).location, new Point(0, 7));
    assert.deepEqual(taffy.layout(grandchild1).size, new Size(0, 10));
    assert.deepEqual(taffy.layout(grandchild2).location, new Point(0, -6));
    assert.deepEqual(taffy.layout(grandchild2).size, new Size(0, 10));
    assert.deepEqual(taffy.layout(third).location, new Point(0, -10));
    assert.deepEqual(taffy.layout(third).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(fourth).location, new Point(0, -10));
    assert.deepEqual(taffy.layout(fourth).size, new Size(50, 10));
});
test("block height and min-height prevent margin collapse-through", () => {
    const heightTree = TaffyTree.new();
    const heightFirst = heightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const heightMiddle = heightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(1)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const heightLast = heightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const heightRoot = heightTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [heightFirst, heightMiddle, heightLast]);
    const minHeightTree = TaffyTree.new();
    const minHeightFirst = minHeightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const minHeightMiddle = minHeightTree.newLeaf(new Style({
        display: Display.Block,
        minSize: new Size(Dimension.auto(), Dimension.length(1)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const minHeightLast = minHeightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const minHeightRoot = minHeightTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [minHeightFirst, minHeightMiddle, minHeightLast]);
    heightTree.computeLayout(heightRoot, AvailableSpaceSize.maxContent());
    minHeightTree.computeLayout(minHeightRoot, AvailableSpaceSize.maxContent());
    assert.deepEqual(heightTree.layout(heightRoot).size, new Size(50, 41));
    assert.deepEqual(heightTree.layout(heightFirst).location, Point.zero());
    assert.deepEqual(heightTree.layout(heightMiddle).location, new Point(0, 20));
    assert.deepEqual(heightTree.layout(heightMiddle).size, new Size(50, 1));
    assert.deepEqual(heightTree.layout(heightLast).location, new Point(0, 31));
    assert.deepEqual(heightTree.layout(heightLast).size, new Size(50, 10));
    assert.deepEqual(minHeightTree.layout(minHeightRoot).size, new Size(50, 41));
    assert.deepEqual(minHeightTree.layout(minHeightFirst).location, Point.zero());
    assert.deepEqual(minHeightTree.layout(minHeightMiddle).location, new Point(0, 20));
    assert.deepEqual(minHeightTree.layout(minHeightMiddle).size, new Size(50, 1));
    assert.deepEqual(minHeightTree.layout(minHeightLast).location, new Point(0, 31));
    assert.deepEqual(minHeightTree.layout(minHeightLast).size, new Size(50, 10));
});
test("block padding prevents margin collapse-through", () => {
    const topPaddingTree = TaffyTree.new();
    const topPaddingFirst = topPaddingTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const topPaddingMiddle = topPaddingTree.newLeaf(new Style({
        display: Display.Block,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
        padding: new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.length(1), LengthPercentage.zero()),
    }));
    const topPaddingLast = topPaddingTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const topPaddingRoot = topPaddingTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [topPaddingFirst, topPaddingMiddle, topPaddingLast]);
    const bottomPaddingTree = TaffyTree.new();
    const bottomPaddingFirst = bottomPaddingTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const bottomPaddingMiddle = bottomPaddingTree.newLeaf(new Style({
        display: Display.Block,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
        padding: new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.length(1)),
    }));
    const bottomPaddingLast = bottomPaddingTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const bottomPaddingRoot = bottomPaddingTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [bottomPaddingFirst, bottomPaddingMiddle, bottomPaddingLast]);
    topPaddingTree.computeLayout(topPaddingRoot, AvailableSpaceSize.maxContent());
    bottomPaddingTree.computeLayout(bottomPaddingRoot, AvailableSpaceSize.maxContent());
    assert.deepEqual(topPaddingTree.layout(topPaddingRoot).size, new Size(50, 41));
    assert.deepEqual(topPaddingTree.layout(topPaddingFirst).location, Point.zero());
    assert.deepEqual(topPaddingTree.layout(topPaddingMiddle).location, new Point(0, 20));
    assert.deepEqual(topPaddingTree.layout(topPaddingMiddle).size, new Size(50, 1));
    assert.deepEqual(topPaddingTree.layout(topPaddingLast).location, new Point(0, 31));
    assert.deepEqual(topPaddingTree.layout(topPaddingLast).size, new Size(50, 10));
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingRoot).size, new Size(50, 41));
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingFirst).location, Point.zero());
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingMiddle).location, new Point(0, 20));
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingMiddle).size, new Size(50, 1));
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingLast).location, new Point(0, 31));
    assert.deepEqual(bottomPaddingTree.layout(bottomPaddingLast).size, new Size(50, 10));
});
test("block aspect ratio prevents margin collapse-through", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const middle = taffy.newLeaf(new Style({
        display: Display.Block,
        aspectRatio: 2,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const last = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [first, middle, last]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 65));
    assert.deepEqual(taffy.layout(first).location, Point.zero());
    assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(middle).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(middle).size, new Size(50, 25));
    assert.deepEqual(taffy.layout(last).location, new Point(0, 55));
    assert.deepEqual(taffy.layout(last).size, new Size(50, 10));
});
test("block measured line box prevents margin collapse-through", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const lineBox = taffy.newLeafWithContext(new Style({
        display: Display.Block,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }), "text");
    const last = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [first, lineBox, last]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), () => new Size(0, 10));
    assert.deepEqual(taffy.layout(root).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(first).location, Point.zero());
    assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(lineBox).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(lineBox).size, new Size(50, 10));
    assert.deepEqual(taffy.layout(last).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(last).size, new Size(50, 10));
});
test("block zero-height line boxes still prevent margin collapse-through", () => {
    const heightTree = TaffyTree.new();
    const heightFirst = heightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const heightLineBox = heightTree.newLeafWithContext(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(0)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }), "text");
    const heightLast = heightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const heightRoot = heightTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [heightFirst, heightLineBox, heightLast]);
    const maxHeightTree = TaffyTree.new();
    const maxHeightFirst = maxHeightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const maxHeightLineBox = maxHeightTree.newLeafWithContext(new Style({
        display: Display.Block,
        maxSize: new Size(Dimension.auto(), Dimension.length(0)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }), "text");
    const maxHeightLast = maxHeightTree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
    }));
    const maxHeightRoot = maxHeightTree.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.length(50), Dimension.auto()) }), [maxHeightFirst, maxHeightLineBox, maxHeightLast]);
    heightTree.computeLayoutWithMeasure(heightRoot, AvailableSpaceSize.maxContent(), () => new Size(0, 10));
    maxHeightTree.computeLayoutWithMeasure(maxHeightRoot, AvailableSpaceSize.maxContent(), () => new Size(0, 10));
    assert.deepEqual(heightTree.layout(heightRoot).size, new Size(50, 40));
    assert.deepEqual(heightTree.layout(heightFirst).location, Point.zero());
    assert.deepEqual(heightTree.layout(heightLineBox).location, new Point(0, 20));
    assert.deepEqual(heightTree.layout(heightLineBox).size, new Size(50, 0));
    assert.deepEqual(heightTree.layout(heightLast).location, new Point(0, 30));
    assert.deepEqual(heightTree.layout(heightLast).size, new Size(50, 10));
    assert.deepEqual(maxHeightTree.layout(maxHeightRoot).size, new Size(50, 40));
    assert.deepEqual(maxHeightTree.layout(maxHeightFirst).location, Point.zero());
    assert.deepEqual(maxHeightTree.layout(maxHeightLineBox).location, new Point(0, 20));
    assert.deepEqual(maxHeightTree.layout(maxHeightLineBox).size, new Size(50, 0));
    assert.deepEqual(maxHeightTree.layout(maxHeightLast).location, new Point(0, 30));
    assert.deepEqual(maxHeightTree.layout(maxHeightLast).size, new Size(50, 10));
});
test("block in-flow child applies aspect ratio to max-height before stretch", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        display: Display.Block,
        maxSize: new Size(Dimension.auto(), Dimension.length(20)),
        aspectRatio: 2,
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).size, new Size(40, 20));
});
test("block absolute child with start and top insets is out of flow", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        display: Display.Block,
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(absolute).size, new Size(10, 10));
    assert.equal(taffy.layout(absolute).location.x, 10);
    assert.equal(taffy.layout(absolute).location.y, 10);
});
test("block absolute container lays out its own children", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const absolute = taffy.newWithChildren(new Style({
        display: Display.Block,
        position: Position.Absolute,
        size: new Size(Dimension.length(40), Dimension.length(30)),
        padding: new Rect(LengthPercentage.length(5), LengthPercentage.zero(), LengthPercentage.length(7), LengthPercentage.zero()),
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).size, new Size(40, 30));
    assert.deepEqual(taffy.layout(grandchild).location, new Point(5, 7));
    assert.deepEqual(taffy.layout(grandchild).size, new Size(10, 10));
});
test("block intrinsic width measures child with margins removed from definite available width", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeafWithContext(new Style({
        size: new Size(Dimension.auto(), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }), "grandchild");
    const absolute = taffy.newWithChildren(new Style({
        display: Display.Block,
        position: Position.Absolute,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_knownDimensions, availableSpace, _nodeId, context) => {
        if (context === "grandchild") {
            return new Size(availableSpace.width.type === "Definite" ? availableSpace.width.value : 0, 10);
        }
        return Size.zero();
    });
    assert.deepEqual(taffy.layout(absolute).size, new Size(80, 10));
    assert.deepEqual(taffy.layout(grandchild).size, new Size(60, 10));
    assert.deepEqual(taffy.layout(grandchild).margin, new Rect(10, 10, 0, 0));
});
test("block intrinsic width floors explicit border-box child by padding and border", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        padding: new Rect(LengthPercentage.length(30), LengthPercentage.length(30), LengthPercentage.zero(), LengthPercentage.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block, size: new Size(Dimension.auto(), Dimension.auto()) }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 10));
    assert.deepEqual(taffy.layout(child).size, new Size(60, 10));
});
test("block absolute vertical percentage margins resolve against containing block width", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(0), LengthPercentageAuto.auto(), LengthPercentageAuto.length(0), LengthPercentageAuto.auto()),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(200), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 20));
    assert.equal(taffy.layout(absolute).margin.top, 20);
});
test("block absolute vertical percentage insets resolve against parent height", () => {
    const taffy = TaffyTree.new();
    const top = taffy.newLeaf(new Style({
        display: Display.Block,
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.5), LengthPercentageAuto.auto()),
    }));
    const bottom = taffy.newLeaf(new Style({
        display: Display.Block,
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.5)),
    }));
    const stretched = taffy.newLeaf(new Style({
        display: Display.Block,
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.auto()),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.1)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(200)),
    }), [top, bottom, stretched]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 200));
    assert.deepEqual(taffy.layout(top).location, new Point(0, 100));
    assert.deepEqual(taffy.layout(top).size, new Size(10, 10));
    assert.deepEqual(taffy.layout(bottom).location, new Point(0, 90));
    assert.deepEqual(taffy.layout(bottom).size, new Size(10, 10));
    assert.deepEqual(taffy.layout(stretched).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(stretched).size, new Size(10, 160));
});
test("block absolute child applies aspect ratio to explicit width", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.percent(0.5), Dimension.auto()),
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.05), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(400), Dimension.length(300)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(20, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(200, 67));
});
test("block absolute child aspect ratio overrides full vertical inset after width fill", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(400), Dimension.length(300)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(20, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(360, 120));
});
test("block absolute child opposing min and max use min as the definite size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        minSize: new Size(Dimension.length(50), Dimension.length(60)),
        maxSize: new Size(Dimension.length(40), Dimension.length(30)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 30));
    assert.deepEqual(taffy.layout(absolute).size, new Size(50, 60));
});
test("block absolute child min size floors to padding and border", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(5), Dimension.length(5)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(12), LengthPercentage.length(8)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(3), LengthPercentage.length(4), LengthPercentage.length(6)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).size, new Size(25, 30));
    assert.deepEqual(taffy.layout(absolute).padding, new Rect(10, 10, 12, 8));
    assert.deepEqual(taffy.layout(absolute).border, new Rect(2, 3, 4, 6));
});
test("block absolute child uses right inset when both horizontal insets are set in rtl", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(80, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(10, 10));
});
test("block absolute child auto margin resolves only when insets are set", () => {
    const taffy = TaffyTree.new();
    const withInset = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(20), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }));
    const withoutInset = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [withInset, withoutInset]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(withInset).location, new Point(130, 0));
    assert.equal(taffy.layout(withInset).margin.left, 120);
    assert.deepEqual(taffy.layout(withoutInset).location, new Point(0, 0));
    assert.equal(taffy.layout(withoutInset).margin.left, 0);
});
test("block absolute auto margins distribute inset free space", () => {
    const zero = () => LengthPercentageAuto.zero();
    const auto = () => LengthPercentageAuto.auto();
    const length = (value: number) => LengthPercentageAuto.length(value);
    const absoluteStyle = (margin: Rect, inset: Rect, width = 50) => new Style({
        direction: Direction.Ltr,
        position: Position.Absolute,
        size: new Size(Dimension.length(width), Dimension.length(50)),
        margin,
        inset,
    });
    const cases = [
        {
            name: "left_with_inset",
            margin: new Rect(auto(), zero(), zero(), zero()),
            inset: new Rect(length(10), length(20), auto(), auto()),
            location: new Point(130, 0),
            resolvedMargin: new Rect(120, 0, 0, 0),
        },
        {
            name: "right_with_inset",
            margin: new Rect(zero(), auto(), zero(), zero()),
            inset: new Rect(length(10), length(20), auto(), auto()),
            location: new Point(10, 0),
            resolvedMargin: new Rect(0, 120, 0, 0),
        },
        {
            name: "left_and_right_with_inset",
            margin: new Rect(auto(), auto(), zero(), zero()),
            inset: new Rect(length(10), length(20), auto(), auto()),
            location: new Point(70, 0),
            resolvedMargin: new Rect(60, 60, 0, 0),
        },
        {
            name: "top_with_inset",
            margin: new Rect(zero(), zero(), auto(), zero()),
            inset: new Rect(auto(), auto(), length(20), length(10)),
            location: new Point(0, 140),
            resolvedMargin: new Rect(0, 0, 120, 0),
        },
        {
            name: "bottom_with_inset",
            margin: new Rect(zero(), zero(), zero(), auto()),
            inset: new Rect(auto(), auto(), length(10), length(20)),
            location: new Point(0, 10),
            resolvedMargin: new Rect(0, 0, 0, 120),
        },
        {
            name: "top_and_bottom_with_inset",
            margin: new Rect(zero(), zero(), auto(), auto()),
            inset: new Rect(auto(), auto(), length(10), length(20)),
            location: new Point(0, 70),
            resolvedMargin: new Rect(0, 0, 60, 60),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const absolute = taffy.newLeaf(absoluteStyle(testCase.margin, testCase.inset));
        const root = taffy.newWithChildren(new Style({
            display: Display.Block,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(200), Dimension.length(200)),
        }), [absolute]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, new Size(200, 200), testCase.name);
        assert.deepEqual(taffy.layout(absolute).location, testCase.location, testCase.name);
        assert.deepEqual(taffy.layout(absolute).size, new Size(50, 50), testCase.name);
        assert.deepEqual(taffy.layout(absolute).margin, testCase.resolvedMargin, testCase.name);
    }
    const multipleChildrenTree = TaffyTree.new();
    const first = multipleChildrenTree.newLeaf(absoluteStyle(new Rect(zero(), auto(), zero(), zero()), new Rect(length(10), length(20), auto(), auto()), 100));
    const second = multipleChildrenTree.newLeaf(absoluteStyle(new Rect(zero(), auto(), zero(), zero()), new Rect(length(20), length(10), auto(), auto())));
    const root = multipleChildrenTree.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [first, second]);
    multipleChildrenTree.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(multipleChildrenTree.layout(first).location, new Point(10, 0));
    assert.deepEqual(multipleChildrenTree.layout(first).size, new Size(100, 50));
    assert.deepEqual(multipleChildrenTree.layout(first).margin, new Rect(0, 70, 0, 0));
    assert.deepEqual(multipleChildrenTree.layout(second).location, new Point(20, 0));
    assert.deepEqual(multipleChildrenTree.layout(second).size, new Size(50, 50));
    assert.deepEqual(multipleChildrenTree.layout(second).margin, new Rect(0, 120, 0, 0));
});
test("block absolute opposing vertical auto margins split inset free space", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 70));
    assert.deepEqual(taffy.layout(absolute).size, new Size(50, 50));
    assert.equal(taffy.layout(absolute).margin.top, 60);
    assert.equal(taffy.layout(absolute).margin.bottom, 60);
});
test("block item order compacts generated items after hidden children are filtered", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const hidden = taffy.newLeaf(new Style({
        display: Display.None,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const second = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(30), Dimension.length(30)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [first, hidden, second, absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(first).order, 0);
    assert.equal(taffy.layout(second).order, 1);
    assert.equal(taffy.layout(absolute).order, 2);
    assert.equal(taffy.layout(hidden).order, 1);
    assert.deepEqual(taffy.layout(hidden).size, Size.zero());
});
test("block display-none recursively zeroes hidden child layouts", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({ direction: Direction.Ltr, size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const hiddenChild = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(20), Dimension.length(10)),
    }));
    const hidden = taffy.newWithChildren(new Style({ display: Display.None, direction: Direction.Ltr }), [hiddenChild]);
    const second = taffy.newLeaf(new Style({ direction: Direction.Ltr, size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [first, hidden, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(first).location, Point.zero());
    assert.deepEqual(taffy.layout(first).size, new Size(100, 10));
    assert.deepEqual(taffy.layout(hidden).location, Point.zero());
    assert.deepEqual(taffy.layout(hidden).size, Size.zero());
    assert.deepEqual(taffy.layout(hiddenChild).location, Point.zero());
    assert.deepEqual(taffy.layout(hiddenChild).size, Size.zero());
    assert.deepEqual(taffy.layout(second).location, new Point(0, 10));
    assert.deepEqual(taffy.layout(second).size, new Size(100, 10));
});
test("block display-none ignores margins, insets, and absolute positioning", () => {
    const taffy = TaffyTree.new();
    const hiddenWithMargin = taffy.newLeaf(new Style({
        display: Display.None,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(20), Dimension.length(20)),
        margin: Rect.length(10, LengthPercentageAuto),
    }));
    const followingMargin = taffy.newLeaf(new Style({ direction: Direction.Ltr, size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const marginRoot = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [hiddenWithMargin, followingMargin]);
    const visibleBeforeInset = taffy.newLeaf(new Style({ direction: Direction.Ltr, size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const hiddenWithInset = taffy.newLeaf(new Style({
        display: Display.None,
        direction: Direction.Ltr,
        size: new Size(Dimension.auto(), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto()),
    }));
    const insetRoot = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [visibleBeforeInset, hiddenWithInset]);
    const hiddenAbsolute = taffy.newLeaf(new Style({
        display: Display.None,
        direction: Direction.Ltr,
        position: Position.Absolute,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }));
    const absoluteRoot = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [hiddenAbsolute]);
    taffy.computeLayout(marginRoot, AvailableSpaceSize.maxContent());
    taffy.computeLayout(insetRoot, AvailableSpaceSize.maxContent());
    taffy.computeLayout(absoluteRoot, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(hiddenWithMargin).location, Point.zero());
    assert.deepEqual(taffy.layout(hiddenWithMargin).size, Size.zero());
    assert.deepEqual(taffy.layout(followingMargin).location, Point.zero());
    assert.deepEqual(taffy.layout(followingMargin).size, new Size(100, 10));
    assert.deepEqual(taffy.layout(visibleBeforeInset).location, Point.zero());
    assert.deepEqual(taffy.layout(visibleBeforeInset).size, new Size(100, 10));
    assert.deepEqual(taffy.layout(hiddenWithInset).location, Point.zero());
    assert.deepEqual(taffy.layout(hiddenWithInset).size, Size.zero());
    assert.deepEqual(taffy.layout(hiddenAbsolute).location, Point.zero());
    assert.deepEqual(taffy.layout(hiddenAbsolute).size, Size.zero());
});
test("block absolute child opposing auto margins split inset free space", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(20), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(200), Dimension.length(200)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(70, 0));
    assert.equal(taffy.layout(absolute).margin.left, 60);
    assert.equal(taffy.layout(absolute).margin.right, 60);
});
test("block right floats contribute to max-content width and pack from the right edge", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 5 }, () => taffy.newLeaf(new Style({
        float: Float.Right,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.auto(), Dimension.length(300)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).location, Point.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(254, 300));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(202, 2));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(152, 2));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(102, 2));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(52, 2));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(2, 2));
});
test("block content-box container preserves float packing and adds border to outer size", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 5 }, () => taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        float: Float.Right,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        boxSizing: BoxSizing.ContentBox,
        size: new Size(Dimension.auto(), Dimension.length(300)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).location, Point.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(254, 304));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(202, 2));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(152, 2));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(102, 2));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(52, 2));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(2, 2));
});
test("float simple content-box rtl preserves physical right float packing", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 5 }, () => taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        float: Float.Right,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.auto(), Dimension.length(300)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).location, Point.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(254, 304));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(202, 2));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(152, 2));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(102, 2));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(52, 2));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(2, 2));
});
test("block right floats use the physical right edge in rtl containers", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 5 }, () => taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        float: Float.Right,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        size: new Size(Dimension.auto(), Dimension.length(300)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2), LengthPercentage.length(2)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).location, Point.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(254, 300));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(202, 2));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(152, 2));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(102, 2));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(52, 2));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(2, 2));
});
test("block child after right float stretches into the float-avoiding slot", () => {
    const taffy = TaffyTree.new();
    const floated = taffy.newLeaf(new Style({
        float: Float.Right,
        size: new Size(Dimension.length(40), Dimension.length(40)),
    }));
    const normal = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [floated, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(floated).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(normal).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(normal).size, new Size(60, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
});
test("block child after left float starts at the float-avoiding slot edge", () => {
    const taffy = TaffyTree.new();
    const floated = taffy.newLeaf(new Style({
        float: Float.Left,
        size: new Size(Dimension.length(40), Dimension.length(40)),
    }));
    const normal = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [floated, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(floated).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(normal).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(normal).size, new Size(60, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
});
test("block clear moves normal child below matching float side", () => {
    const taffy = TaffyTree.new();
    const floated = taffy.newLeaf(new Style({
        float: Float.Right,
        size: new Size(Dimension.length(40), Dimension.length(40)),
    }));
    const normal = taffy.newLeaf(new Style({
        clear: Clear.Right,
        size: new Size(Dimension.auto(), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [floated, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(floated).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(normal).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(normal).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 60));
});
test("block clear left uses the left-side segment threshold", () => {
    const taffy = TaffyTree.new();
    const left = taffy.newLeaf(new Style({
        float: Float.Left,
        size: new Size(Dimension.length(30), Dimension.length(40)),
    }));
    const right = taffy.newLeaf(new Style({
        float: Float.Right,
        size: new Size(Dimension.length(30), Dimension.length(70)),
    }));
    const normal = taffy.newLeaf(new Style({
        clear: Clear.Left,
        size: new Size(Dimension.auto(), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [left, right, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(left).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(right).location, new Point(70, 0));
    assert.deepEqual(taffy.layout(normal).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(normal).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 70));
});
test("block clear both moves normal child below the later float side segment", () => {
    const taffy = TaffyTree.new();
    const left = taffy.newLeaf(new Style({
        float: Float.Left,
        size: new Size(Dimension.length(30), Dimension.length(40)),
    }));
    const right = taffy.newLeaf(new Style({
        clear: Clear.Left,
        float: Float.Right,
        size: new Size(Dimension.length(30), Dimension.length(70)),
    }));
    const normal = taffy.newLeaf(new Style({
        clear: Clear.Both,
        size: new Size(Dimension.auto(), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [left, right, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(left).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(right).location, new Point(70, 40));
    assert.deepEqual(taffy.layout(normal).location, new Point(0, 110));
    assert.deepEqual(taffy.layout(normal).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 130));
});
test("block clear moves subsequent same-side float below previous float", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        float: Float.Right,
        size: new Size(Dimension.length(40), Dimension.length(40)),
    }));
    const second = taffy.newLeaf(new Style({
        clear: Clear.Right,
        float: Float.Right,
        size: new Size(Dimension.length(40), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [first, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(first).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(second).location, new Point(60, 40));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 60));
});
