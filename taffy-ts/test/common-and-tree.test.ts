import assert from "node:assert/strict";
import test from "node:test";
import { AbsoluteAxis, AlignContent, AvailableSpace, AvailableSpaceSize, Cache, ClearState, CollapsibleMarginSet, Dimension, Direction, Display, FlexDirection, Layout, LayoutInput, LayoutOutput, LengthPercentage, LengthPercentageAuto, Line, NodeId, Overflow, Point, Rect, RequestedAxis, RunMode, SizingMode, Size, Style, TaffyError, TaffyTree, applyAlignmentFallback, apply_alignment_fallback, computeBlockLayout, computeFlexboxLayout, computeGridLayout, computeLeafLayout, computeCachedLayout, compute_cached_layout, computeAlignmentOffset, compute_alignment_offset, computeContentSizeContribution, compute_content_size_contribution, computeHiddenLayout, compute_hidden_layout, computeRootLayout, compute_root_layout, compute_block_layout, compute_flexbox_layout, compute_grid_layout, compute_leaf_layout, requestedAxisFromAbsoluteAxis, requestedAxisIntoAbsoluteAxis, roundLayout, round_layout, printTree, print_tree, writeTree, write_tree, abs, ceil, f32Max, f32Min, f32_max, f32_min, floor, newVecWithCapacity, new_vec_with_capacity, round, singleValueVec, single_value_vec, } from "../src/index.js";
import { NodeId as NodeIdFromNodeModule } from "../src/tree/node.js";
test("low-level compute exports include reference snake_case names", () => {
    assert.equal(compute_cached_layout, computeCachedLayout);
    assert.equal(compute_root_layout, computeRootLayout);
    assert.equal(compute_hidden_layout, computeHiddenLayout);
    assert.equal(round_layout, roundLayout);
    assert.equal(compute_leaf_layout, computeLeafLayout);
    assert.equal(compute_block_layout, computeBlockLayout);
    assert.equal(compute_flexbox_layout, computeFlexboxLayout);
    assert.equal(compute_grid_layout, computeGridLayout);
    assert.equal(apply_alignment_fallback, applyAlignmentFallback);
    assert.equal(compute_alignment_offset, computeAlignmentOffset);
    assert.equal(compute_content_size_contribution, computeContentSizeContribution);
});
test("alignment fallback follows reference shared alignment rules", () => {
    assert.equal(applyAlignmentFallback(10, 1, AlignContent.Stretch, false), AlignContent.FlexStart);
    assert.equal(applyAlignmentFallback(10, 1, AlignContent.SpaceBetween, false), AlignContent.FlexStart);
    assert.equal(applyAlignmentFallback(10, 1, AlignContent.SpaceAround, false), AlignContent.Center);
    assert.equal(applyAlignmentFallback(10, 1, AlignContent.SpaceEvenly, false), AlignContent.Center);
    assert.equal(applyAlignmentFallback(-1, 3, AlignContent.Center, true), AlignContent.Start);
    assert.equal(applyAlignmentFallback(-1, 3, AlignContent.Center, false), AlignContent.Center);
});
test("alignment offsets follow reference shared alignment rules", () => {
    assert.equal(computeAlignmentOffset(100, 3, 10, AlignContent.Start, false, true), 0);
    assert.equal(computeAlignmentOffset(100, 3, 10, AlignContent.End, false, true), 100);
    assert.equal(computeAlignmentOffset(100, 3, 10, AlignContent.Center, false, true), 50);
    assert.equal(computeAlignmentOffset(100, 3, 10, AlignContent.FlexStart, true, true), 100);
    assert.equal(computeAlignmentOffset(100, 3, 10, AlignContent.FlexEnd, true, true), 0);
    assert.equal(computeAlignmentOffset(90, 3, 10, AlignContent.SpaceBetween, false, false), 55);
    assert.equal(computeAlignmentOffset(90, 3, 10, AlignContent.SpaceAround, false, false), 40);
    assert.equal(computeAlignmentOffset(90, 3, 10, AlignContent.SpaceEvenly, false, false), 32.5);
    assert.equal(computeAlignmentOffset(-90, 3, 10, AlignContent.SpaceBetween, false, false), 10);
    assert.equal(computeAlignmentOffset(Number.NaN, 3, 10, AlignContent.SpaceBetween, false, false), 10);
});
test("content size contribution follows reference overflow and negative-location rules", () => {
    assert.deepEqual(computeContentSizeContribution(new Point(-10, -20), new Size(50, 60), new Size(100, 30), new Point(Overflow.Visible, Overflow.Hidden)), new Size(100, 60));
    assert.deepEqual(computeContentSizeContribution(new Point(10, 10), new Size(0, 60), new Size(100, 100), new Point(Overflow.Visible, Overflow.Visible)), new Size(110, 110));
    assert.deepEqual(computeContentSizeContribution(new Point(10, 10), Size.zero(), Size.zero(), new Point(Overflow.Visible, Overflow.Visible)), Size.zero());
    assert.deepEqual(computeContentSizeContribution(new Point(0, 0), new Size(20, 30), new Size(Number.NaN, Number.NaN), new Point(Overflow.Visible, Overflow.Visible)), new Size(20, 30));
});
test("sys helpers mirror reference allocation and f32 helpers", () => {
    assert.deepEqual(newVecWithCapacity(4), []);
    assert.deepEqual(new_vec_with_capacity(2), []);
    assert.deepEqual(singleValueVec("x"), ["x"]);
    assert.deepEqual(single_value_vec("y"), ["y"]);
    assert.equal(round(1.5), 2);
    assert.equal(round(-1.5), -2);
    assert.equal(round(-0.5), -1);
    assert.equal(ceil(1.1), 2);
    assert.equal(floor(-1.1), -2);
    assert.equal(abs(-3), 3);
    assert.equal(f32Max(Number.NaN, 7), 7);
    assert.equal(f32_max(7, Number.NaN), 7);
    assert.equal(f32Min(Number.NaN, -2), -2);
    assert.equal(f32_min(-2, Number.NaN), -2);
    assert.deepEqual(new Size(Number.NaN, 10).f32Max(new Size(4, Number.NaN)), new Size(4, 10));
    assert.deepEqual(new Size(Number.NaN, 10).f32Min(new Size(4, Number.NaN)), new Size(4, 10));
});
test("layout input and output constants mirror reference constructors", () => {
    const hiddenInput = LayoutInput.HIDDEN;
    assert.equal(hiddenInput.runMode, RunMode.PerformHiddenLayout);
    assert.equal(hiddenInput.run_mode, RunMode.PerformHiddenLayout);
    assert.equal(hiddenInput.sizingMode, SizingMode.InherentSize);
    assert.equal(hiddenInput.sizing_mode, SizingMode.InherentSize);
    assert.equal(hiddenInput.axis, RequestedAxis.Both);
    assert.deepEqual(hiddenInput.knownDimensions, Size.none());
    assert.deepEqual(hiddenInput.known_dimensions, Size.none());
    assert.deepEqual(hiddenInput.parentSize, Size.none());
    assert.deepEqual(hiddenInput.parent_size, Size.none());
    assert.deepEqual(hiddenInput.availableSpace, AvailableSpaceSize.maxContent());
    assert.deepEqual(hiddenInput.available_space, AvailableSpaceSize.maxContent());
    assert.deepEqual(hiddenInput.verticalMarginsAreCollapsible, Line.false());
    assert.deepEqual(hiddenInput.vertical_margins_are_collapsible, Line.false());
    const hiddenOutput = LayoutOutput.HIDDEN;
    assert.deepEqual(hiddenOutput.size, Size.zero());
    assert.deepEqual(hiddenOutput.contentSize, Size.zero());
    assert.deepEqual(hiddenOutput.content_size, Size.zero());
    assert.deepEqual(hiddenOutput.firstBaselines, Point.none());
    assert.deepEqual(hiddenOutput.first_baselines, Point.none());
    assert.deepEqual(hiddenOutput.topMargin, CollapsibleMarginSet.ZERO);
    assert.deepEqual(hiddenOutput.top_margin, CollapsibleMarginSet.ZERO);
    assert.deepEqual(hiddenOutput.bottomMargin, CollapsibleMarginSet.ZERO);
    assert.deepEqual(hiddenOutput.bottom_margin, CollapsibleMarginSet.ZERO);
    assert.equal(hiddenOutput.marginsCanCollapseThrough, false);
    assert.equal(hiddenOutput.margins_can_collapse_through, false);
    assert.deepEqual(LayoutOutput.DEFAULT, LayoutOutput.HIDDEN);
    hiddenOutput.size.width = 99;
    assert.deepEqual(LayoutOutput.HIDDEN.size, Size.zero());
});
test("tree layout data helpers expose reference snake_case aliases", () => {
    const input = new LayoutInput({
        run_mode: RunMode.ComputeSize,
        sizing_mode: SizingMode.ContentSize,
        axis: RequestedAxis.Horizontal,
        known_dimensions: new Size(10, undefined),
        parent_size: new Size(100, undefined),
        available_space: new Size(AvailableSpace.definite(100), AvailableSpace.maxContent()),
        vertical_margins_are_collapsible: Line.true(),
    });
    assert.equal(input.runMode, RunMode.ComputeSize);
    assert.equal(input.sizingMode, SizingMode.ContentSize);
    assert.deepEqual(input.knownDimensions, new Size(10, undefined));
    assert.deepEqual(input.parentSize, new Size(100, undefined));
    assert.deepEqual(input.availableSpace, new Size(AvailableSpace.definite(100), AvailableSpace.maxContent()));
    assert.deepEqual(input.verticalMarginsAreCollapsible, Line.true());
    const margin = CollapsibleMarginSet.from_margin(12)
        .collapse_with_margin(-5)
        .collapse_with_set(CollapsibleMarginSet.fromMargin(-8));
    assert.deepEqual(margin, new CollapsibleMarginSet(12, -8));
    assert.equal(margin.resolve(), 4);
    assert.deepEqual(new CollapsibleMarginSet(Number.NaN, Number.NaN)
        .collapse_with_margin(12)
        .collapse_with_set(new CollapsibleMarginSet(20, -8)), new CollapsibleMarginSet(20, -8));
    const output = LayoutOutput.from_sizes_and_baselines(new Size(10, 20), new Size(30, 40), new Point(5, undefined));
    assert.deepEqual(output.size, new Size(10, 20));
    assert.deepEqual(output.contentSize, new Size(30, 40));
    assert.deepEqual(output.content_size, new Size(30, 40));
    assert.deepEqual(output.firstBaselines, new Point(5, undefined));
    assert.deepEqual(output.first_baselines, new Point(5, undefined));
    output.top_margin = CollapsibleMarginSet.from_margin(6);
    output.bottom_margin = CollapsibleMarginSet.from_margin(-4);
    output.margins_can_collapse_through = true;
    assert.deepEqual(output.topMargin, new CollapsibleMarginSet(6, 0));
    assert.deepEqual(output.bottomMargin, new CollapsibleMarginSet(0, -4));
    assert.equal(output.marginsCanCollapseThrough, true);
    assert.deepEqual(LayoutOutput.from_sizes(new Size(1, 2), new Size(3, 4)).contentSize, new Size(3, 4));
    assert.deepEqual(LayoutOutput.from_outer_size(new Size(5, 6)).contentSize, Size.zero());
    const layout = new Layout({
        order: 9,
        location: new Point(3, 4),
        size: new Size(100, 80),
        content_size: new Size(150, 130),
        scrollbar_size: new Size(8, 9),
        border: new Rect(1, 2, 3, 4),
        padding: new Rect(5, 6, 7, 8),
        margin: Rect.zero(),
    });
    assert.deepEqual(Layout.DEFAULT, Layout.new());
    assert.notEqual(Layout.DEFAULT, Layout.DEFAULT);
    assert.equal(layout.order, 9);
    assert.deepEqual(layout.content_size, new Size(150, 130));
    assert.deepEqual(layout.scrollbar_size, new Size(8, 9));
    layout.content_size = new Size(160, 130);
    layout.scrollbar_size = new Size(9, 9);
    assert.deepEqual(layout.contentSize, new Size(160, 130));
    assert.deepEqual(layout.scrollbarSize, new Size(9, 9));
    assert.equal(layout.content_box_width(), 86);
    assert.equal(layout.content_box_height(), 58);
    assert.deepEqual(layout.content_box_size(), new Size(86, 58));
    assert.equal(layout.content_box_x(), 9);
    assert.equal(layout.content_box_y(), 14);
    assert.equal(layout.scroll_width(), 71);
    assert.equal(layout.scroll_height(), 63);
    const nanLayout = new Layout({
        order: 0,
        location: Point.zero(),
        size: new Size(Number.NaN, Number.NaN),
        content_size: new Size(20, 30),
        scrollbar_size: new Size(5, 6),
        border: new Rect(0, 7, 0, 8),
        padding: Rect.zero(),
        margin: Rect.zero(),
    });
    assert.equal(nanLayout.scroll_width(), 0);
    assert.equal(nanLayout.scroll_height(), 0);
});
test("requested axis conversion helpers mirror From and TryFrom implementations", () => {
    assert.equal(requestedAxisFromAbsoluteAxis(AbsoluteAxis.Horizontal), RequestedAxis.Horizontal);
    assert.equal(requestedAxisFromAbsoluteAxis(AbsoluteAxis.Vertical), RequestedAxis.Vertical);
    assert.equal(requestedAxisIntoAbsoluteAxis(RequestedAxis.Horizontal), AbsoluteAxis.Horizontal);
    assert.equal(requestedAxisIntoAbsoluteAxis(RequestedAxis.Vertical), AbsoluteAxis.Vertical);
    assert.equal(requestedAxisIntoAbsoluteAxis(RequestedAxis.Both), undefined);
});
test("tree cache prevents repeat measurement for unchanged leaf input and dirty clears it", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.auto()) }));
    let calls = 0;
    const measure = () => {
        calls += 1;
        return new Size(42, 24);
    };
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), measure);
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), measure);
    assert.equal(calls, 1);
    assert.equal(taffy.dirty(node), false);
    taffy.setStyle(node, new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    assert.equal(taffy.dirty(node), true);
    taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), measure);
    assert.equal(calls, 2);
});
test("computeCachedLayout matches cache wrapper behavior", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(Style.default());
    const input = new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: Size.none(),
        parentSize: Size.none(),
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    });
    let calls = 0;
    const first = computeCachedLayout(taffy, node, input, () => {
        calls += 1;
        return LayoutOutput.fromOuterSize(new Size(12, 34));
    });
    const second = computeCachedLayout(taffy, node, input, () => {
        calls += 1;
        return LayoutOutput.fromOuterSize(new Size(56, 78));
    });
    assert.equal(calls, 1);
    assert.deepEqual(first.size, new Size(12, 34));
    assert.deepEqual(second.size, new Size(12, 34));
});
test("roundLayout matches cumulative tree rounding", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(Style.default());
    const parent = taffy.newWithChildren(Style.default(), [child]);
    taffy.setUnroundedLayout(parent, new Layout({
        ...Layout.new(),
        location: new Point(0.25, 0.25),
        size: new Size(10.25, 10.25),
        contentSize: new Size(12.25, 12.25),
        scrollbarSize: new Size(0.6, 1.4),
        border: new Rect(0.6, 1.4, 0.6, 1.4),
        padding: new Rect(1.6, 2.4, 1.6, 2.4),
    }));
    taffy.setUnroundedLayout(child, new Layout({
        ...Layout.new(),
        location: new Point(0.4, 0.4),
        size: new Size(3.4, 3.4),
        contentSize: new Size(4.4, 4.4),
    }));
    roundLayout(taffy, parent);
    assert.deepEqual(taffy.getFinalLayout(parent).location, new Point(0, 0));
    assert.deepEqual(taffy.getFinalLayout(parent).size, new Size(11, 11));
    assert.deepEqual(taffy.getFinalLayout(parent).contentSize, new Size(13, 13));
    assert.deepEqual(taffy.getFinalLayout(parent).scrollbarSize, new Size(1, 1));
    assert.deepEqual(taffy.getFinalLayout(parent).border, new Rect(1, 2, 1, 2));
    assert.deepEqual(taffy.getFinalLayout(parent).padding, new Rect(2, 3, 2, 3));
    assert.deepEqual(taffy.getFinalLayout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.getFinalLayout(child).size, new Size(3, 3));
    assert.deepEqual(taffy.getFinalLayout(child).contentSize, new Size(4, 4));
});
test("computeHiddenLayout matches recursive hidden layout helper", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(40)) }));
    const child = taffy.newWithChildren(new Style({ display: Display.Flex }), [grandchild]);
    const root = taffy.newWithChildren(new Style({ display: Display.Flex }), [child]);
    const input = new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: Size.none(),
        parentSize: Size.none(),
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    });
    for (const node of [root, child, grandchild]) {
        taffy.setUnroundedLayout(node, new Layout({ ...Layout.new(), location: new Point(3, 4), size: new Size(10, 20) }));
        taffy.cacheStore(node, input, LayoutOutput.fromOuterSize(new Size(10, 20)));
    }
    const output = computeHiddenLayout(taffy, root);
    assert.deepEqual(output, LayoutOutput.HIDDEN);
    for (const node of [root, child, grandchild]) {
        assert.deepEqual(taffy.getUnroundedLayout(node).location, Point.zero());
        assert.deepEqual(taffy.getUnroundedLayout(node).size, Size.zero());
        assert.equal(taffy.cacheGet(node, input), undefined);
    }
});
test("computeRootLayout matches root layout helper", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        margin: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(15), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }), [child]);
    computeRootLayout(taffy, root, new Size(AvailableSpace.definite(100), AvailableSpace.maxContent()));
    assert.deepEqual(taffy.getUnroundedLayout(root).size, new Size(75, 10));
    assert.deepEqual(taffy.getUnroundedLayout(root).location, new Point(25, 0));
    assert.deepEqual(taffy.getUnroundedLayout(root).margin, new Rect(10, 15, 0, 0));
    assert.deepEqual(taffy.getUnroundedLayout(child).size, new Size(75, 10));
});
test("root constraints cases match expected root leaf sizes", () => {
    const percentageTree = TaffyTree.new();
    const percentageRoot = percentageTree.newLeaf(new Style({ size: new Size(Dimension.percent(1), Dimension.percent(1)) }));
    percentageTree.computeLayout(percentageRoot, new Size(AvailableSpace.definite(100), AvailableSpace.definite(200)));
    assert.deepEqual(percentageTree.layout(percentageRoot).size, new Size(100, 200));
    const noSizeTree = TaffyTree.new();
    const noSizeRoot = noSizeTree.newLeaf(Style.default());
    noSizeTree.computeLayout(noSizeRoot, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(noSizeTree.layout(noSizeRoot).size, Size.zero());
    const largerSizeTree = TaffyTree.new();
    const largerSizeRoot = largerSizeTree.newLeaf(new Style({ size: new Size(Dimension.length(200), Dimension.length(200)) }));
    largerSizeTree.computeLayout(largerSizeRoot, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(largerSizeTree.layout(largerSizeRoot).size, new Size(200, 200));
    const paddingBorderTree = TaffyTree.new();
    const paddingBorderChild = paddingBorderTree.newLeaf(Style.default());
    const paddingBorderRoot = paddingBorderTree.newWithChildren(new Style({
        size: new Size(Dimension.length(10), Dimension.length(10)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
        border: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
    }), [paddingBorderChild]);
    paddingBorderTree.computeLayout(paddingBorderRoot, Size.MAX_CONTENT);
    assert.deepEqual(paddingBorderTree.layout(paddingBorderRoot).size, new Size(40, 40));
});
test("min and max overrides size in the documented order", () => {
    const minOverridesMaxTree = TaffyTree.new();
    const minOverridesMax = minOverridesMaxTree.newLeaf(new Style({
        size: new Size(Dimension.length(50), Dimension.length(50)),
        minSize: new Size(Dimension.length(100), Dimension.length(100)),
        maxSize: new Size(Dimension.length(10), Dimension.length(10)),
    }));
    minOverridesMaxTree.computeLayout(minOverridesMax, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(minOverridesMaxTree.layout(minOverridesMax).size, new Size(100, 100));
    const maxOverridesSizeTree = TaffyTree.new();
    const maxOverridesSize = maxOverridesSizeTree.newLeaf(new Style({
        size: new Size(Dimension.length(50), Dimension.length(50)),
        maxSize: new Size(Dimension.length(10), Dimension.length(10)),
    }));
    maxOverridesSizeTree.computeLayout(maxOverridesSize, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(maxOverridesSizeTree.layout(maxOverridesSize).size, new Size(10, 10));
    const minOverridesSizeTree = TaffyTree.new();
    const minOverridesSize = minOverridesSizeTree.newLeaf(new Style({
        size: new Size(Dimension.length(50), Dimension.length(50)),
        minSize: new Size(Dimension.length(100), Dimension.length(100)),
    }));
    minOverridesSizeTree.computeLayout(minOverridesSize, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(minOverridesSizeTree.layout(minOverridesSize).size, new Size(100, 100));
});
test("TaffyTree.withCapacity creates a usable tree", () => {
    const taffy = TaffyTree.withCapacity(8);
    const node = taffy.newLeaf(Style.default());
    assert.equal(taffy.totalNodeCount(), 1);
    assert.equal(taffy.childCount(node), 0);
});
test("TaffyTree.default matches Default constructor", () => {
    const taffy = TaffyTree.default();
    const node = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10.5), Dimension.length(20.5)) }));
    taffy.computeLayout(node, Size.MAX_CONTENT);
    assert.equal(taffy.totalNodeCount(), 1);
    assert.deepEqual(taffy.layout(node).size, new Size(11, 21));
});
test("TaffyTree snake_case high-level API aliases mirror reference method names", () => {
    const taffy = TaffyTree.with_capacity(8);
    const measured = taffy.new_leaf_with_context(new Style({ size: new Size(Dimension.auto(), Dimension.auto()) }), { value: 4 });
    const first = taffy.new_leaf(new Style({ size: new Size(Dimension.length(10.5), Dimension.length(20.5)) }));
    const second = taffy.new_leaf(Style.default());
    const parent = taffy.new_with_children(new Style({ display: Display.Flex }), [first]);
    assert.equal(taffy.total_node_count(), 4);
    assert.equal(taffy.child_at_index(parent, 0), first);
    taffy.add_child(parent, second);
    const inserted = taffy.new_leaf(Style.default());
    taffy.insert_child_at_index(parent, 1, inserted);
    assert.deepEqual(taffy.children(parent), [first, inserted, second]);
    const replacement = taffy.new_leaf(Style.default());
    assert.equal(taffy.replace_child_at_index(parent, 1, replacement), inserted);
    assert.equal(taffy.parent(inserted), undefined);
    assert.equal(taffy.remove_child(parent, replacement), replacement);
    assert.deepEqual(taffy.children(parent), [first, second]);
    taffy.set_children(parent, [first, replacement, second]);
    taffy.remove_children_range(parent, 1, 2);
    assert.deepEqual(taffy.children(parent), [first, second]);
    assert.equal(taffy.parent(replacement), undefined);
    taffy.set_node_context(measured, { value: 8 });
    taffy.get_node_context_mut(measured)!.value = 12;
    assert.deepEqual(taffy.get_node_context(measured), { value: 12 });
    assert.deepEqual(taffy.get_disjoint_node_context_mut([measured]), [{ value: 12 }]);
    assert.equal(taffy.get_node_context(NodeId.new(999)), undefined);
    assert.equal(taffy.get_node_context_mut(NodeId.new(999)), undefined);
    assert.equal(taffy.get_disjoint_node_context_mut([measured, measured]), undefined);
    assert.equal(taffy.get_disjoint_node_context_mut([measured, first]), undefined);
    assert.equal(taffy.get_disjoint_node_context_mut([measured, NodeId.new(999)]), undefined);
    const restyled = new Style({ size: new Size(Dimension.length(30.5), Dimension.length(40.5)) });
    taffy.set_style(first, restyled);
    assert.equal(taffy.style(first), restyled);
    taffy.compute_layout_with_measure(measured, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
        return new Size(context?.value ?? 0, 6);
    });
    assert.deepEqual(taffy.layout(measured).size, new Size(12, 6));
    taffy.compute_layout(parent, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(first).size, new Size(31, 41));
    taffy.disable_rounding();
    assert.deepEqual(taffy.layout(first).size, new Size(30.5, 40.5));
    assert.equal(taffy.unrounded_layout(first), taffy.layout(first));
    taffy.mark_dirty(first);
    assert.equal(taffy.dirty(first), true);
    taffy.enable_rounding();
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => {
        logs.push(message);
    };
    try {
        taffy.print_tree(parent);
    }
    finally {
        console.log = originalLog;
    }
    assert.deepEqual(logs, [writeTree(taffy, parent)]);
});
test("NodeId matches new and numeric conversions", () => {
    const node = NodeId.new(42);
    assert.equal(NodeIdFromNodeModule, NodeId);
    assert.deepEqual(node, new NodeId(42));
    assert.deepEqual(NodeId.from(42), node);
    assert.equal(node.toNumber(), 42);
    assert.equal(node.valueOf(), 42);
    assert.equal(Number(node), 42);
    assert.equal(String(node), "NodeId(42)");
    assert.equal(node.equals(new NodeId(42)), true);
    assert.equal(node.equals(new NodeId(43)), false);
});
test("TaffyTree removeChildrenRange detaches children and dirties the parent", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(Style.default());
    const child1 = taffy.newLeaf(Style.default());
    const child2 = taffy.newLeaf(Style.default());
    const child3 = taffy.newLeaf(Style.default());
    const parent = taffy.newWithChildren(Style.default(), [child0, child1, child2, child3]);
    taffy.computeLayout(parent, AvailableSpaceSize.maxContent());
    assert.equal(taffy.dirty(parent), false);
    taffy.removeChildrenRange(parent, 1, 3);
    assert.deepEqual(taffy.children(parent), [child0, child3]);
    assert.equal(taffy.parent(child0), parent);
    assert.equal(taffy.parent(child3), parent);
    assert.equal(taffy.parent(child1), undefined);
    assert.equal(taffy.parent(child2), undefined);
    assert.equal(taffy.dirty(parent), true);
});
test("TaffyTree remove detaches removed hierarchy like reference", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(Style.default());
    const child = taffy.newWithChildren(Style.default(), [grandchild]);
    const root = taffy.newWithChildren(Style.default(), [child]);
    assert.deepEqual(taffy.children(root), [child]);
    assert.deepEqual(taffy.children(child), [grandchild]);
    assert.equal(taffy.remove(child), child);
    assert.deepEqual(taffy.children(root), []);
    assert.deepEqual(taffy.children(grandchild), []);
    assert.equal(taffy.parent(grandchild), undefined);
    const parent = taffy.newLeaf(Style.default());
    const lastChild = taffy.newLeaf(Style.default());
    taffy.addChild(parent, lastChild);
    assert.equal(taffy.remove(lastChild), lastChild);
    assert.equal(taffy.remove(parent), parent);
});
test("TaffyTree remove clears child parent references before later mutation", () => {
    const taffy = TaffyTree.new();
    const parent = taffy.newLeaf(Style.default());
    const child = taffy.newLeaf(Style.default());
    taffy.addChild(parent, child);
    taffy.remove(parent);
    taffy.setChildren(child, []);
    assert.deepEqual(taffy.children(child), []);
    assert.equal(taffy.parent(child), undefined);
});
test("TaffyTree setNodeContext remeasures cached leaves like reference", () => {
    const measure = (knownDimensions: Size, _availableSpace: Size, _nodeId: NodeId<Size>, context: Size | undefined) => knownDimensions.unwrapOr(context ?? Size.zero());
    const taffy = TaffyTree.new();
    const measured = taffy.newLeafWithContext(Style.default(), new Size(200, 200));
    taffy.computeLayoutWithMeasure(measured, AvailableSpaceSize.maxContent(), measure);
    assert.equal(taffy.layout(measured).size.width, 200);
    taffy.setNodeContext(measured, new Size(100, 100));
    taffy.computeLayoutWithMeasure(measured, AvailableSpaceSize.maxContent(), measure);
    assert.equal(taffy.layout(measured).size.width, 100);
    const unmeasured = taffy.newLeaf(Style.default());
    taffy.computeLayoutWithMeasure(unmeasured, AvailableSpaceSize.maxContent(), measure);
    assert.equal(taffy.layout(unmeasured).size.width, 0);
    taffy.setNodeContext(unmeasured, new Size(50, 50));
    taffy.computeLayoutWithMeasure(unmeasured, AvailableSpaceSize.maxContent(), measure);
    assert.equal(taffy.layout(unmeasured).size.width, 50);
});
test("TaffyTree setChildren reparents existing children like reference", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(Style.default());
    const oldParent = taffy.newWithChildren(Style.default(), [child]);
    const newParent = taffy.newLeaf(Style.default());
    taffy.setChildren(newParent, [child]);
    assert.deepEqual(taffy.children(oldParent), []);
    assert.deepEqual(taffy.children(newParent), [child]);
    assert.equal(taffy.parent(child), newParent);
});
test("TaffyTree layout locations use top-left coordinates like reference", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.percent(1), Dimension.percent(1)),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(20), LengthPercentage.length(30), LengthPercentage.length(40)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).location.x, 10);
    assert.equal(taffy.layout(child).location.y, 30);
});
test("TaffyTree parent and child operation errors mirror variants", () => {
    const taffy = TaffyTree.new();
    const parent = taffy.newLeaf(Style.default());
    const child = taffy.newLeaf(Style.default());
    const missing = new NodeId(999);
    assert.throws(() => taffy.childCount(missing), /Parent Node NodeId\(999\) is not in the TaffyTree instance/);
    assert.throws(() => taffy.children(missing), /Parent Node NodeId\(999\) is not in the TaffyTree instance/);
    assert.throws(() => taffy.addChild(missing, child), /Parent Node NodeId\(999\) is not in the TaffyTree instance/);
    assert.throws(() => taffy.addChild(parent, missing), /Child Node NodeId\(999\) is not in the TaffyTree instance/);
    assert.throws(() => taffy.newWithChildren(Style.default(), [missing]), /Child Node NodeId\(999\) is not in the TaffyTree instance/);
    assert.throws(() => taffy.setChildren(parent, [missing]), /Child Node NodeId\(999\) is not in the TaffyTree instance/);
});
test("TaffyError carries variant data", () => {
    const taffy = TaffyTree.new();
    const parent = taffy.newLeaf(Style.default());
    const child = taffy.newLeaf(Style.default());
    const missing = new NodeId(999);
    const childIndexError = captureTaffyError(() => taffy.childAtIndex(parent, 0));
    assert.equal(childIndexError.kind, "ChildIndexOutOfBounds");
    assert.equal(childIndexError.parent, parent);
    assert.equal(childIndexError.childIndex, 0);
    assert.equal(childIndexError.childCount, 0);
    const parentError = captureTaffyError(() => taffy.addChild(missing, child));
    assert.equal(parentError.kind, "InvalidParentNode");
    assert.equal(parentError.parent, missing);
    const childError = captureTaffyError(() => taffy.addChild(parent, missing));
    assert.equal(childError.kind, "InvalidChildNode");
    assert.equal(childError.child, missing);
    const inputError = captureTaffyError(() => taffy.layout(missing));
    assert.equal(inputError.kind, "InvalidInputNode");
    assert.equal(inputError.node, missing);
});
test("TaffyTree context accessors mirror reference context lookups", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeafWithContext(Style.default(), { width: 10 });
    const second = taffy.newLeafWithContext(Style.default(), { width: 20 });
    const missing = taffy.newLeaf(Style.default());
    taffy.getNodeContextMut(first)!.width = 30;
    assert.deepEqual(taffy.getNodeContext(first), { width: 30 });
    const contexts = taffy.getDisjointNodeContextMut([first, second]);
    assert.deepEqual(contexts, [{ width: 30 }, { width: 20 }]);
    contexts[1]!.width = 40;
    assert.deepEqual(taffy.getNodeContext(second), { width: 40 });
    assert.equal(taffy.getDisjointNodeContextMut([first, first]), undefined);
    assert.equal(taffy.getDisjointNodeContextMut([first, missing]), undefined);
});
test("TaffyTree traversal and style trait hooks mirror reference aliases", () => {
    const taffy = TaffyTree.new();
    const child0Style = Style.default();
    const child0 = taffy.newLeaf(child0Style);
    const child1 = taffy.newLeaf(Style.default());
    const blockStyle = new Style({ display: Display.Block });
    const block = taffy.newWithChildren(blockStyle, [child0, child1]);
    const flexChildStyle = Style.default();
    const gridChildStyle = Style.default();
    const flexChild = taffy.newLeaf(flexChildStyle);
    const gridChild = taffy.newLeaf(gridChildStyle);
    const flexRowStyle = new Style({ display: Display.Flex, flexDirection: FlexDirection.Row });
    const flexColumnStyle = new Style({ display: Display.Flex, flexDirection: FlexDirection.Column });
    const gridStyle = new Style({ display: Display.Grid });
    const flexRow = taffy.newWithChildren(flexRowStyle, [flexChild]);
    const flexColumn = taffy.newWithChildren(flexColumnStyle, [taffy.newLeaf(Style.default())]);
    const grid = taffy.newWithChildren(gridStyle, [gridChild]);
    const hidden = taffy.newWithChildren(new Style({ display: Display.None }), [
        taffy.newLeaf(Style.default()),
    ]);
    assert.deepEqual(taffy.childIds(block), [child0, child1]);
    assert.equal(taffy.getChildId(block, 1), child1);
    assert.equal(taffy.getCoreContainerStyle(block), blockStyle);
    assert.equal(taffy.getBlockContainerStyle(block), blockStyle);
    assert.equal(taffy.getBlockChildStyle(child0), child0Style);
    assert.equal(taffy.getFlexboxContainerStyle(flexRow), flexRowStyle);
    assert.equal(taffy.getFlexboxChildStyle(flexChild), flexChildStyle);
    assert.equal(taffy.getGridContainerStyle(grid), gridStyle);
    assert.equal(taffy.getGridChildStyle(gridChild), gridChildStyle);
    assert.equal(taffy.getStyle(block), blockStyle);
    assert.equal(taffy.getDebugLabel(child0), "LEAF");
    assert.equal(taffy.getDebugLabel(block), "BLOCK");
    assert.equal(taffy.getDebugLabel(flexRow), "FLEX ROW");
    assert.equal(taffy.getDebugLabel(flexColumn), "FLEX COL");
    assert.equal(taffy.getDebugLabel(grid), "GRID");
    assert.equal(taffy.getDebugLabel(hidden), "NONE");
});
test("TaffyTree snake_case trait aliases mirror reference trait names", () => {
    const taffy = TaffyTree.new();
    const childStyle = Style.default();
    const child = taffy.newLeaf(childStyle);
    const parentStyle = new Style({ display: Display.Flex });
    const parent = taffy.newWithChildren(parentStyle, [child]);
    const input = new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: Size.none(),
        parentSize: Size.none(),
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    });
    const output = LayoutOutput.fromOuterSize(new Size(12, 34));
    const traversePartial = taffy;
    const traverseTree = taffy;
    const layoutTree = taffy;
    const cacheTree = taffy;
    const roundTree = taffy;
    const printTreeTrait = taffy;
    const flexTree = taffy;
    const gridTree = taffy;
    const blockTree = taffy;
    assert.deepEqual(traversePartial.child_ids(parent), [child]);
    assert.deepEqual(traverseTree.child_ids(parent), [child]);
    assert.equal(traversePartial.child_count(parent), 1);
    assert.equal(traversePartial.get_child_id(parent, 0), child);
    assert.equal(layoutTree.get_core_container_style(parent), parentStyle);
    assert.equal(layoutTree.resolve_calc_value(null, 123), 0);
    assert.equal(taffy.resolveCalcValue(null, 123), 0);
    assert.equal(flexTree.get_flexbox_container_style(parent), parentStyle);
    assert.equal(flexTree.get_flexbox_child_style(child), childStyle);
    assert.equal(gridTree.get_grid_child_style(child), childStyle);
    assert.equal(blockTree.get_block_child_style(child), childStyle);
    assert.deepEqual(taffy.detailed_layout_info(parent), { type: "None" });
    const detailedGridInfo = {
        rows: {
            negative_implicit_tracks: 1,
            explicit_tracks: 2,
            positive_implicit_tracks: 3,
            gutters: [4],
            sizes: [5, 6],
        },
        columns: {
            negative_implicit_tracks: 0,
            explicit_tracks: 1,
            positive_implicit_tracks: 0,
            gutters: [],
            sizes: [7],
        },
        items: [{ row_start: 1, row_end: 2, column_start: 1, column_end: 3 }],
    };
    gridTree.set_detailed_grid_info?.(parent, detailedGridInfo);
    assert.deepEqual(taffy.detailedLayoutInfo(parent), { type: "Grid", grid: detailedGridInfo });
    cacheTree.cache_store(child, input, output);
    assert.deepEqual(cacheTree.cache_get(child, input)?.size, new Size(12, 34));
    cacheTree.cache_clear(child);
    assert.equal(cacheTree.cache_get(child, input), undefined);
    layoutTree.set_unrounded_layout(child, new Layout({ ...Layout.new(), size: new Size(5, 6) }));
    assert.deepEqual(roundTree.get_unrounded_layout(child).size, new Size(5, 6));
    roundTree.set_final_layout(child, new Layout({ ...Layout.new(), size: new Size(7, 8) }));
    assert.deepEqual(printTreeTrait.get_final_layout(child).size, new Size(7, 8));
    assert.equal(printTreeTrait.get_debug_label(parent), "FLEX ROW");
});
test("writeTree matches debug tree output", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(20)) }));
    const second = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(40)) }));
    const root = taffy.newWithChildren(new Style({ display: Display.Flex }), [first, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(writeTree(taffy, root), [
        "TREE",
        "└──  FLEX ROW [x: 0    y: 0    w: 40   h: 40   content_w: 40   content_h: 40   border: l:0 r:0 t:0 b:0, padding: l:0 r:0 t:0 b:0] (NodeId(2))",
        "    ├──  LEAF [x: 0    y: 0    w: 10   h: 20   content_w: 0    content_h: 0    border: l:0 r:0 t:0 b:0, padding: l:0 r:0 t:0 b:0] (NodeId(0))",
        "    └──  LEAF [x: 10   y: 0    w: 30   h: 40   content_w: 0    content_h: 0    border: l:0 r:0 t:0 b:0, padding: l:0 r:0 t:0 b:0] (NodeId(1))",
    ].join("\n"));
    assert.equal(write_tree(taffy, root), writeTree(taffy, root));
});
test("printTree writes the debug tree string", () => {
    const taffy = TaffyTree.new();
    const root = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(20)) }));
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => {
        logs.push(message);
    };
    try {
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        printTree(taffy, root);
        print_tree(taffy, root);
    }
    finally {
        console.log = originalLog;
    }
    assert.deepEqual(logs, [writeTree(taffy, root), writeTree(taffy, root)]);
});
test("TaffyTree printTree method mirrors the reference print_tree high-level API", () => {
    const taffy = TaffyTree.new();
    const root = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(20)) }));
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message: string) => {
        logs.push(message);
    };
    try {
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        taffy.printTree(root);
        taffy.print_tree(root);
    }
    finally {
        console.log = originalLog;
    }
    assert.deepEqual(logs, [writeTree(taffy, root), writeTree(taffy, root)]);
});
test("TaffyTree cache and rounded layout trait hooks mirror reference behavior", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(Style.default());
    const input = new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: Size.none(),
        parentSize: Size.none(),
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    });
    const output = LayoutOutput.fromOuterSize(new Size(12, 34));
    const unrounded = new Layout({
        ...Layout.new(),
        location: new Point(0.25, 0.5),
        size: new Size(10.25, 10.5),
    });
    const final = new Layout({
        ...Layout.new(),
        location: new Point(0, 1),
        size: new Size(10, 11),
    });
    assert.equal(taffy.cacheGet(node, input), undefined);
    taffy.cacheStore(node, input, output);
    assert.deepEqual(taffy.cacheGet(node, input)?.size, new Size(12, 34));
    taffy.cacheClear(node);
    assert.equal(taffy.cacheGet(node, input), undefined);
    taffy.setUnroundedLayout(node, unrounded);
    taffy.setFinalLayout(node, final);
    assert.equal(taffy.getUnroundedLayout(node), unrounded);
    assert.equal(taffy.getFinalLayout(node), final);
    taffy.disableRounding();
    assert.equal(taffy.getFinalLayout(node), unrounded);
});
test("display none performs hidden layout recursively without container algorithms", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)) }));
    const root = taffy.newWithChildren(new Style({ display: Display.None }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, Size.zero());
    assert.deepEqual(taffy.layout(child).size, Size.zero());
});
test("block root auto width stretch-fits definite available width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({ display: Display.Block }), [child]);
    taffy.computeLayout(root, new Size(AvailableSpace.definite(100), AvailableSpace.maxContent()));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 10));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 10));
});
test("block root definite available width subtracts resolved root margins", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.auto(), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Block,
        margin: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(15), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }), [child]);
    taffy.computeLayout(root, new Size(AvailableSpace.definite(100), AvailableSpace.maxContent()));
    assert.deepEqual(taffy.layout(root).size, new Size(75, 10));
    assert.deepEqual(taffy.layout(root).margin, new Rect(10, 15, 0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(75, 10));
});
test("root leaf rounding uses Taffy's round-half-up behavior", () => {
    const taffy = TaffyTree.new();
    const node = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(10.49), Dimension.length(10.5)),
        padding: new Rect(LengthPercentage.length(0.49), LengthPercentage.length(0.5), LengthPercentage.length(1.49), LengthPercentage.length(1.5)),
    }));
    taffy.computeLayout(node, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(node).size.width, 10);
    assert.equal(taffy.layout(node).size.height, 11);
    assert.equal(taffy.layout(node).padding.left, 0);
    assert.equal(taffy.layout(node).padding.right, 0);
    assert.equal(taffy.layout(node).padding.top, 1);
    assert.equal(taffy.layout(node).padding.bottom, 2);
});
test("rounding does not leave gaps between adjacent rounded children", () => {
    const taffy = TaffyTree.new();
    const squareSize = new Size(Dimension.length(100.3), Dimension.length(100.3));
    const childA = taffy.newLeaf(new Style({ size: squareSize }));
    const childB = taffy.newLeaf(new Style({ size: squareSize }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(963.3333), Dimension.length(1000)),
        justifyContent: AlignContent.Center,
    }), [childA, childB]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    const layoutA = taffy.layout(childA);
    const layoutB = taffy.layout(childB);
    assert.equal(layoutA.location.x + layoutA.size.width, layoutB.location.x);
});
test("Cache stores ComputeSize entries in slots", () => {
    const cache = Cache.new();
    const input = new LayoutInput({
        runMode: RunMode.ComputeSize,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: Size.none(),
        parentSize: Size.none(),
        availableSpace: new Size(AvailableSpace.minContent(), AvailableSpace.maxContent()),
        verticalMarginsAreCollapsible: Line.false(),
    });
    assert.equal(cache.isEmpty(), true);
    assert.equal(cache.is_empty(), true);
    assert.equal(cache.clear(), ClearState.AlreadyEmpty);
    cache.store(input, LayoutOutput.fromOuterSize(new Size(7, 9)));
    assert.equal(cache.is_empty(), false);
    assert.deepEqual(cache.get(input)?.size, new Size(7, 9));
    assert.equal(cache.get(new LayoutInput({
        ...input,
        availableSpace: new Size(AvailableSpace.maxContent(), AvailableSpace.maxContent()),
    })), undefined);
    assert.equal(cache.clear(), ClearState.Cleared);
    assert.equal(cache.is_empty(), true);
    assert.equal(Cache.default().is_empty(), true);
});
function captureTaffyError(action: () => void): TaffyError {
    try {
        action();
    }
    catch (error) {
        assert.ok(error instanceof TaffyError);
        return error;
    }
    throw new Error("expected TaffyError");
}
