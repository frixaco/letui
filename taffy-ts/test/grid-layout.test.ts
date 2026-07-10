import assert from "node:assert/strict";
import test from "node:test";
import { AlignContent, AlignItems, AvailableSpace, AvailableSpaceSize, BoxSizing, Dimension, Direction, Display, GridAutoFlow, GridTemplateArea, GridTemplateRepetition, LengthPercentage, LengthPercentageAuto, Line, MaxTrackSizingFunction, MinTrackSizingFunction, Overflow, Point, Position, Rect, Size, Style, TaffyTree, TrackSizingFunction, fr, lengthTrack, lengthPercentageAutoRectAuto, line, minmax, percentTrack, repeat, span, } from "../src/index.js";
test("grid repeat integer lays auto-placed items row by row", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid layout stores detailed grid information consistently detailed_layout_info", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({ gridColumn: span(2) }));
    const second = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(110), Dimension.length(50)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(0)),
        gridTemplateRows: [{ type: "Single", track: lengthTrack(50) }],
        gridTemplateColumns: [
            { type: "Single", track: lengthTrack(30) },
            { type: "Single", track: lengthTrack(70) },
        ],
    }), [first, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.detailed_layout_info(root), {
        type: "Grid",
        grid: {
            rows: {
                negative_implicit_tracks: 0,
                explicit_tracks: 1,
                positive_implicit_tracks: 1,
                gutters: [0],
                sizes: [50, 0],
            },
            columns: {
                negative_implicit_tracks: 0,
                explicit_tracks: 2,
                positive_implicit_tracks: 0,
                gutters: [10],
                sizes: [30, 70],
            },
            items: [
                { row_start: 1, row_end: 2, column_start: 1, column_end: 3 },
                { row_start: 2, row_end: 3, column_start: 1, column_end: 2 },
            ],
        },
    });
});
test("grid scrollbars reduce stretched grid item space", () => {
    const cases = [
        {
            name: "x_axis",
            overflow: new Point(Overflow.Scroll, Overflow.Visible),
            expectedScrollbar: new Size(0, 15),
            expectedChildSize: new Size(50, 35),
        },
        {
            name: "y_axis",
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
        const child = taffy.newLeaf(new Style({ direction: Direction.Ltr }));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
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
test("grid rtl scrollbar reduces percentage column track", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.auto(), Dimension.length(200)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        overflow: new Point(Overflow.Visible, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(100), Dimension.length(100)),
        gridTemplateColumns: [{ type: "Single", track: percentTrack(1) }],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(15, 0));
    assert.deepEqual(taffy.layout(child).location, new Point(15, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(85, 200));
});
test("grid scrollbars clamp stretched item space after size constraints", () => {
    const explicitTree = TaffyTree.new();
    const explicitChild = explicitTree.newLeaf(new Style({ direction: Direction.Ltr }));
    const explicitRoot = explicitTree.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(2), Dimension.length(4)),
    }), [explicitChild]);
    const maxTree = TaffyTree.new();
    const maxChild = maxTree.newLeaf(new Style({ direction: Direction.Ltr }));
    const maxRoot = maxTree.newWithChildren(new Style({
        display: Display.Grid,
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
test("nested grid scrollbars are clamped by parent available space", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ direction: Direction.Ltr }));
    const child = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(2), Dimension.length(4)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(2, 4));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, new Size(2, 4));
    assert.deepEqual(taffy.layout(child).scrollbarSize, new Size(15, 15));
    assert.deepEqual(taffy.layout(grandchild).location, Point.zero());
    assert.deepEqual(taffy.layout(grandchild).size, Size.zero());
});
test("grid inline overflow preserves visible and scrollable content", () => {
    const cases = [
        {
            name: "visible",
            overflow: new Point(Overflow.Visible, Overflow.Visible),
            expectedSize: new Size(100, 50),
            expectedScrollWidth: 0,
        },
        {
            name: "hidden",
            overflow: new Point(Overflow.Hidden, Overflow.Hidden),
            expectedSize: new Size(50, 50),
            expectedScrollWidth: 50,
        },
        {
            name: "scroll",
            overflow: new Point(Overflow.Scroll, Overflow.Scroll),
            expectedSize: new Size(50, 50),
            expectedScrollWidth: 65,
        },
    ];
    for (const direction of [Direction.Ltr, Direction.Rtl]) {
        for (const testCase of cases) {
            const taffy = TaffyTree.new();
            const text = taffy.newLeafWithContext(new Style({
                direction,
                overflow: testCase.overflow,
                scrollbarWidth: 15,
            }), "text");
            const root = taffy.newWithChildren(new Style({
                display: Display.Grid,
                direction,
                size: new Size(Dimension.length(50), Dimension.length(50)),
            }), [text]);
            taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => context === "text" ? new Size(100, 0) : Size.zero());
            const expectedX = direction === Direction.Rtl && testCase.name === "visible" ? -50 : 0;
            assert.deepEqual(taffy.layout(root).size, new Size(50, 50), `${testCase.name} ${direction}`);
            assert.deepEqual(taffy.layout(text).location, new Point(expectedX, 0), `${testCase.name} ${direction}`);
            assert.deepEqual(taffy.layout(text).size, testCase.expectedSize, `${testCase.name} ${direction}`);
            assert.equal(taffy.layout(text).scrollWidth(), testCase.expectedScrollWidth, `${testCase.name} ${direction}`);
            assert.equal(taffy.layout(text).scrollHeight(), 0, `${testCase.name} ${direction}`);
        }
    }
});
test("grid item padding and border floor undersized child dimensions", () => {
    const padding = new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6));
    const border = new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5));
    const cases = [
        {
            name: "border-box explicit size",
            boxSizing: BoxSizing.BorderBox,
            style: { size: new Size(Dimension.length(12), Dimension.length(12)) },
            expected: new Size(22, 14),
        },
        {
            name: "content-box explicit size",
            boxSizing: BoxSizing.ContentBox,
            style: { size: new Size(Dimension.length(12), Dimension.length(12)) },
            expected: new Size(34, 26),
        },
        {
            name: "border-box max size",
            boxSizing: BoxSizing.BorderBox,
            style: { maxSize: new Size(Dimension.length(12), Dimension.length(12)) },
            expected: new Size(22, 14),
        },
        {
            name: "content-box max size",
            boxSizing: BoxSizing.ContentBox,
            style: { maxSize: new Size(Dimension.length(12), Dimension.length(12)) },
            expected: new Size(22, 14),
        },
        {
            name: "border-box min size",
            boxSizing: BoxSizing.BorderBox,
            style: { minSize: Size.zero(Dimension) },
            expected: new Size(22, 14),
        },
        {
            name: "content-box min size",
            boxSizing: BoxSizing.ContentBox,
            style: { minSize: Size.zero(Dimension) },
            expected: new Size(22, 14),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const child = taffy.newLeaf(new Style({
            boxSizing: testCase.boxSizing,
            direction: Direction.Ltr,
            padding,
            border,
            ...testCase.style,
        }));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: Direction.Ltr,
        }), [child]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expected, testCase.name);
        assert.deepEqual(taffy.layout(child).location, Point.zero(), testCase.name);
        assert.deepEqual(taffy.layout(child).size, testCase.expected, testCase.name);
    }
});
test("grid container padding and border floor undersized container dimensions", () => {
    const padding = new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6));
    const border = new Rect(LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(1), LengthPercentage.length(5));
    const cases = [
        {
            name: "border-box explicit size",
            boxSizing: BoxSizing.BorderBox,
            style: { size: new Size(Dimension.length(12), Dimension.length(12)) },
            expectedRoot: new Size(22, 14),
            expectedChild: Size.zero(),
        },
        {
            name: "content-box explicit size",
            boxSizing: BoxSizing.ContentBox,
            style: { size: new Size(Dimension.length(12), Dimension.length(12)) },
            expectedRoot: new Size(34, 26),
            expectedChild: new Size(12, 12),
        },
        {
            name: "border-box max size",
            boxSizing: BoxSizing.BorderBox,
            style: { maxSize: new Size(Dimension.length(12), Dimension.length(12)) },
            expectedRoot: new Size(22, 14),
            expectedChild: Size.zero(),
        },
        {
            name: "content-box max size",
            boxSizing: BoxSizing.ContentBox,
            style: { maxSize: new Size(Dimension.length(12), Dimension.length(12)) },
            expectedRoot: new Size(22, 14),
            expectedChild: Size.zero(),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const child = taffy.newLeaf(new Style({
            boxSizing: testCase.boxSizing,
            direction: Direction.Ltr,
        }));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: Direction.Ltr,
            padding,
            border,
            ...testCase.style,
        }), [child]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expectedRoot, testCase.name);
        assert.deepEqual(taffy.layout(child).location, new Point(15, 3), testCase.name);
        assert.deepEqual(taffy.layout(child).size, testCase.expectedChild, testCase.name);
    }
});
test("blockgrid grid children inside block participate in block layout", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const gridChild = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(50), Dimension.length(50)),
            }));
            const grid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
            }), [gridChild]);
            const block = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                size: new Size(Dimension.length(50), Dimension.length(20)),
            }));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                size: new Size(Dimension.length(200), Dimension.auto()),
            }), [grid, block]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const expectedChildX = direction === Direction.Ltr ? 0 : 150;
            assert.deepEqual(taffy.layout(root).location, Point.zero());
            assert.deepEqual(taffy.layout(root).size, new Size(200, 70));
            assert.deepEqual(taffy.layout(grid).location, Point.zero());
            assert.deepEqual(taffy.layout(grid).size, new Size(200, 50));
            assert.deepEqual(taffy.layout(gridChild).location, new Point(expectedChildX, 0));
            assert.deepEqual(taffy.layout(gridChild).size, new Size(50, 50));
            assert.deepEqual(taffy.layout(block).location, new Point(expectedChildX, 50));
            assert.deepEqual(taffy.layout(block).size, new Size(50, 20));
        }
    }
});
test("grid boxes block vertical margin collapse through block siblings", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const first = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
                size: new Size(Dimension.auto(), Dimension.length(10)),
            }));
            const grid = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
                margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
            }));
            const last = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
                size: new Size(Dimension.auto(), Dimension.length(10)),
            }));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }), [first, grid, last]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).size, new Size(50, 40));
            assert.deepEqual(taffy.layout(first).location, Point.zero());
            assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
            assert.deepEqual(taffy.layout(grid).location, new Point(0, 20));
            assert.deepEqual(taffy.layout(grid).size, new Size(50, 0));
            assert.deepEqual(taffy.layout(last).location, new Point(0, 30));
            assert.deepEqual(taffy.layout(last).size, new Size(50, 10));
        }
    }
});
test("grid boxes block first and last child margin collapse", () => {
    const cases = [
        {
            gridMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
            blockMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
            gridLocation: new Point(0, 10),
            blockY: 10,
        },
        {
            gridMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
            blockMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
            gridLocation: Point.zero(),
            blockY: 0,
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const { gridMargin, blockMargin, gridLocation, blockY } of cases) {
                const taffy = TaffyTree.new();
                const leaf = taffy.newLeaf(new Style({
                    boxSizing,
                    direction,
                    size: new Size(Dimension.auto(), Dimension.length(10)),
                }));
                const block = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Block,
                    margin: blockMargin,
                }), [leaf]);
                const grid = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Grid,
                    margin: gridMargin,
                }), [block]);
                const root = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Block,
                    size: new Size(Dimension.length(50), Dimension.auto()),
                }), [grid]);
                taffy.computeLayout(root, AvailableSpaceSize.maxContent());
                assert.deepEqual(taffy.layout(root).size, new Size(50, 30));
                assert.deepEqual(taffy.layout(grid).location, gridLocation);
                assert.deepEqual(taffy.layout(grid).size, new Size(50, 20));
                assert.deepEqual(taffy.layout(block).location, new Point(0, blockY));
                assert.deepEqual(taffy.layout(block).size, new Size(50, 10));
                assert.deepEqual(taffy.layout(leaf).location, Point.zero());
                assert.deepEqual(taffy.layout(leaf).size, new Size(50, 10));
            }
        }
    }
});
test("block children in single-column grids size block text by track function", () => {
    const cases = [
        { track: TrackSizingFunction.auto(), expectedWidth: 40, expectedHeight: 10 },
        { track: fr(1), expectedWidth: 40, expectedHeight: 10 },
        { track: TrackSizingFunction.minContent(), expectedWidth: 20, expectedHeight: 20 },
        { track: lengthTrack(10), expectedWidth: 10, expectedHeight: 20 },
        { track: lengthTrack(30), expectedWidth: 30, expectedHeight: 20 },
        { track: lengthTrack(50), expectedWidth: 50, expectedHeight: 10 },
        {
            track: TrackSizingFunction.fitContent(LengthPercentage.length(10)),
            expectedWidth: 20,
            expectedHeight: 20,
        },
        {
            track: TrackSizingFunction.fitContent(LengthPercentage.length(30)),
            expectedWidth: 30,
            expectedHeight: 20,
        },
        {
            track: TrackSizingFunction.fitContent(LengthPercentage.length(50)),
            expectedWidth: 40,
            expectedHeight: 10,
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const { track, expectedWidth, expectedHeight } of cases) {
                const taffy = TaffyTree.new();
                const text = taffy.newLeafWithContext(new Style({
                    boxSizing,
                    direction,
                    display: Display.Block,
                }), { text: "HH\u200bHH" });
                const empty = taffy.newLeaf(new Style({
                    boxSizing,
                    direction,
                    display: Display.Block,
                }));
                const root = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Grid,
                    gridTemplateColumns: [{ type: "Single", track }],
                }), [text, empty]);
                taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (known, available, _node, context) => {
                    if (context === undefined)
                        return Size.zero();
                    const definiteWidth = known.width ??
                        (available.width.type === "Definite" ? available.width.value : undefined);
                    const width = definiteWidth ??
                        (available.width.type === "MinContent" ? 20 : context.text.length * 10 - 10);
                    return new Size(width, width >= 40 ? 10 : 20);
                });
                assert.deepEqual(taffy.layout(root).size, new Size(expectedWidth, expectedHeight));
                assert.deepEqual(taffy.layout(text).location, Point.zero());
                assert.deepEqual(taffy.layout(text).size, new Size(expectedWidth, expectedHeight));
                assert.deepEqual(taffy.layout(empty).location, new Point(0, expectedHeight));
                assert.deepEqual(taffy.layout(empty).size, new Size(expectedWidth, 0));
            }
        }
    }
});
test("grid holy grail example lays out named regions with helper placements", () => {
    const taffy = TaffyTree.new();
    const rootStyle = new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(800), Dimension.length(600)),
        gridTemplateColumns: [lengthTrack(250), fr(1), lengthTrack(250)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateRows: [lengthTrack(150), fr(1), lengthTrack(150)].map((track) => ({
            type: "Single",
            track,
        })),
    });
    const header = taffy.newLeaf(new Style({ gridRow: line(1), gridColumn: span(3) }));
    const leftSidebar = taffy.newLeaf(new Style({ gridRow: line(2), gridColumn: line(1) }));
    const contentArea = taffy.newLeaf(new Style({ gridRow: line(2), gridColumn: line(2) }));
    const rightSidebar = taffy.newLeaf(new Style({ gridRow: line(2), gridColumn: line(3) }));
    const footer = taffy.newLeaf(new Style({ gridRow: line(3), gridColumn: span(3) }));
    const root = taffy.newWithChildren(rootStyle, [
        header,
        leftSidebar,
        contentArea,
        rightSidebar,
        footer,
    ]);
    taffy.computeLayout(root, new Size(AvailableSpace.definite(800), AvailableSpace.definite(600)));
    assert.deepEqual(taffy.layout(root).size, new Size(800, 600));
    assert.deepEqual(taffy.layout(header).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(header).size, new Size(800, 150));
    assert.deepEqual(taffy.layout(leftSidebar).location, new Point(0, 150));
    assert.deepEqual(taffy.layout(leftSidebar).size, new Size(250, 300));
    assert.deepEqual(taffy.layout(contentArea).location, new Point(250, 150));
    assert.deepEqual(taffy.layout(contentArea).size, new Size(300, 300));
    assert.deepEqual(taffy.layout(rightSidebar).location, new Point(550, 150));
    assert.deepEqual(taffy.layout(rightSidebar).size, new Size(250, 300));
    assert.deepEqual(taffy.layout(footer).location, new Point(0, 450));
    assert.deepEqual(taffy.layout(footer).size, new Size(800, 150));
});
test("grid row and column gaps offset auto-placed items", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gap: new Size(LengthPercentage.length(40), LengthPercentage.length(40)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[1]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(0, 80));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(160, 160));
});
test("grid auto-fill repeat creates the maximum definite column count", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 8 }, () => taffy.newLeaf(new Style({ display: Display.Block })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(730), Dimension.length(300)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(10)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
        gridTemplateColumns: [
            repeat("auto-fill", [
                minmax(MinTrackSizingFunction.length(150), MaxTrackSizingFunction.fr(1)),
            ]),
        ],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(730, 300));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(170, 135));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(550, 10));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(10, 155));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(550, 155));
});
test("grid auto-fill repeat respects rtl physical column mapping", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 8 }, () => taffy.newLeaf(new Style({ display: Display.Block, direction: Direction.Rtl })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(730), Dimension.length(300)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(10)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
        gridTemplateColumns: [
            repeat("auto-fill", [
                minmax(MinTrackSizingFunction.length(150), MaxTrackSizingFunction.fr(1)),
            ]),
        ],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(730, 300));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(550, 10));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(170, 135));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(550, 155));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(10, 155));
});
test("grid auto-fill repeat uses minimum size to choose overflowing count", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 4 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        minSize: new Size(Dimension.length(140), Dimension.auto()),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat("auto-fill", [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(160, 40));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(120, 0));
});
test("grid auto-fill repeat accounts for a fixed leading track", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [
            { type: "Single", track: lengthTrack(40) },
            repeat("auto-fill", [lengthTrack(40)]),
        ],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid mixed fixed and auto-fill repeats resolve in both axes", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const tracks = [
        { type: "Single", track: lengthTrack(40) },
        repeat(1, [lengthTrack(40)]),
        repeat("auto-fill", [lengthTrack(40)]),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: tracks,
        gridTemplateColumns: tracks,
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid mixed fixed and auto-fill repeats preserve rtl physical order", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Rtl })));
    const tracks = [
        { type: "Single", track: lengthTrack(40) },
        repeat(1, [lengthTrack(40)]),
        repeat("auto-fill", [lengthTrack(40)]),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: tracks,
        gridTemplateColumns: tracks,
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(0, 80));
});
test("grid named column lines resolve definite placement", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "middle", line: 0 }, { type: "NamedLine", name: "right", line: 0 }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [lengthTrack(40), lengthTrack(60)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumnNames: [["left"], ["middle"], ["right"]],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(60, 40));
});
test("grid template areas create implicit named lines and explicit auto tracks", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "main-start", line: 0 }, { type: "NamedLine", name: "main-end", line: 0 }),
        gridRow: new Line({ type: "NamedLine", name: "main-start", line: 0 }, { type: "NamedLine", name: "main-end", line: 0 }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(40)),
        gridTemplateAreas: [new GridTemplateArea("main", 1, 2, 1, 3)],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 40));
});
test("grid named span resolves against later matching lines", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line(line(1), { type: "NamedSpan", name: "stop", span: 2 }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumnNames: [["start"], ["stop"], ["stop"], ["end"]],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(80, 40));
});
test("grid missing named line falls back to positive implicit line", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "missing", line: 0 }, { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
        gridAutoColumns: [lengthTrack(20)],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(160, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(140, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(20, 40));
});
test("grid repeated line-name sets collapse adjacent repeat lines", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "end", line: 1 }, { type: "NamedLine", name: "middle", line: 2 }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [
            {
                type: "Repeat",
                repetition: new GridTemplateRepetition({ type: "Count", count: 2 }, [lengthTrack(40), lengthTrack(20)], [["start"], ["middle"], ["end"]]),
            },
        ],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(40, 40));
});
test("grid auto-repeat line-name sets use the resolved repetition count", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "cell-start", line: 2 }, { type: "NamedLine", name: "cell-end", line: 3 }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [
            {
                type: "Repeat",
                repetition: new GridTemplateRepetition({ type: "AutoFill" }, [lengthTrack(40)], [["cell-start"], ["cell-end"]]),
            },
        ],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(80, 40));
});
test("grid negative named line index selects from the end", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line({ type: "NamedLine", name: "edge", line: -1 }, { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(2, [lengthTrack(40)])],
        gridTemplateColumnNames: [["edge"], [], ["edge"]],
        gridAutoColumns: [lengthTrack(20)],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(20, 40));
});
test("grid line placement conflict handling mirrors reference", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        gridColumn: new Line(line(3), line(1)),
        gridRow: new Line(line(1), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(new Style({
        gridColumn: new Line(line(2), line(2)),
        gridRow: new Line(line(2), { type: "Auto" }),
    }));
    const child2 = taffy.newLeaf(new Style({
        gridColumn: new Line(line(0), line(3)),
        gridRow: new Line(line(3), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(60)),
        gridTemplateRows: [repeat(3, [lengthTrack(20)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 60));
    assert.deepEqual(taffy.layout(child0).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child0).size, new Size(80, 20));
    assert.deepEqual(taffy.layout(child1).location, new Point(40, 20));
    assert.deepEqual(taffy.layout(child1).size, new Size(40, 20));
    assert.deepEqual(taffy.layout(child2).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(child2).size, new Size(40, 20));
});
test("grid child with fixed height and aspect ratio stretches to fill cell width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.auto(), Dimension.length(50)),
        aspectRatio: 2,
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 50));
});
test("grid child max-height applies aspect ratio before clamping measured content", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        maxSize: new Size(Dimension.auto(), Dimension.length(20)),
        aspectRatio: 2,
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), () => new Size(80, 80));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(40, 20));
});
test("grid child measurement receives area minus resolved margins as available space", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        margin: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(20), LengthPercentageAuto.length(5), LengthPercentageAuto.length(15)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(80)),
    }), [child]);
    const availableSpaces: Size[] = [];
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace) => {
        availableSpaces.push(availableSpace);
        return new Size(10, 10);
    });
    assert.ok(availableSpaces.some((availableSpace) => availableSpace.width.type === "Definite" &&
        availableSpace.width.value === 70 &&
        availableSpace.height.type === "Definite" &&
        availableSpace.height.value === 60));
    assert.deepEqual(taffy.layout(child).size, new Size(70, 60));
});
test("grid auto tracks grow from measured single-span child content", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({ display: Display.Grid }), [child]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), () => new Size(70, 30));
    assert.deepEqual(taffy.layout(root).size, new Size(70, 30));
    assert.deepEqual(taffy.layout(child).size, new Size(70, 30));
});
test("grid compressible replaced percentage preferred size caps indefinite auto minimum against zero", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        itemIsReplaced: true,
        size: new Size(Dimension.percent(0.5), Dimension.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        justifyContent: AlignContent.Start,
        alignItems: AlignItems.Start,
        gridTemplateColumns: [{ type: "Single", track: TrackSizingFunction.auto() }],
        gridTemplateRows: [{ type: "Single", track: lengthTrack(20) }],
    }), [child]);
    taffy.computeLayoutWithMeasure(root, new Size(AvailableSpace.definite(200), AvailableSpace.definite(20)), () => new Size(100, 10));
    assert.deepEqual(taffy.layout(root).size, new Size(0, 20));
    assert.deepEqual(taffy.layout(child).size, new Size(0, 10));
});
test("grid auto tracks grow from measured spanning child content", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        gridColumn: new Line(line(1), span(2)),
    }));
    const root = taffy.newWithChildren(new Style({ display: Display.Grid }), [child]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), () => new Size(100, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 20));
});
test("grid min-content maximum track uses measured min-content contribution", () => {
    const taffy = TaffyTree.new();
    const left = taffy.newLeaf(Style.default());
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const right = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            lengthTrack(40),
            minmax(MinTrackSizingFunction.length(0), MaxTrackSizingFunction.minContent()),
            lengthTrack(40),
        ].map((track) => ({ type: "Single", track })),
    }), [left, text, right]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 40, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(right).location, new Point(60, 0));
});
test("grid max-content maximum track uses measured max-content contribution", () => {
    const taffy = TaffyTree.new();
    const left = taffy.newLeaf(Style.default());
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const right = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            lengthTrack(40),
            minmax(MinTrackSizingFunction.length(0), MaxTrackSizingFunction.maxContent()),
            lengthTrack(40),
        ].map((track) => ({ type: "Single", track })),
    }), [left, text, right]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 40, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(right).location, new Point(80, 0));
});
test("grid fit-content track caps measured max-content contribution", () => {
    const taffy = TaffyTree.new();
    const left = taffy.newLeaf(Style.default());
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const right = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            lengthTrack(40),
            TrackSizingFunction.fitContent(LengthPercentage.length(30)),
            lengthTrack(40),
        ].map((track) => ({ type: "Single", track })),
    }), [left, text, right]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 50, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(110, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(30, 40));
    assert.deepEqual(taffy.layout(right).location, new Point(70, 0));
});
test("grid fit-content point limit floors by measured min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [TrackSizingFunction.fitContent(LengthPercentage.length(30))].map((track) => ({
            type: "Single",
            track,
        })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 40 : 60, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(40, 40));
});
test("grid fit-content percent limit resolves after intrinsic sizing", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [TrackSizingFunction.fitContent(LengthPercentage.percent(0.5))].map((track) => ({
            type: "Single",
            track,
        })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 60, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(30, 40));
});
test("grid fit-content percent limit floors by measured min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [TrackSizingFunction.fitContent(LengthPercentage.percent(0.5))].map((track) => ({
            type: "Single",
            track,
        })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 40 : 60, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(40, 40));
});
test("grid fit-content point limit does not floor hidden overflow item by min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(new Style({
        overflow: new Point(Overflow.Hidden, Overflow.Hidden),
    }), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [TrackSizingFunction.fitContent(LengthPercentage.length(30))].map((track) => ({
            type: "Single",
            track,
        })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 40 : 60, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(30, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(30, 40));
    assert.deepEqual(taffy.layout(text).contentSize, new Size(60, 0));
});
test("grid fit-content percent limit does not floor hidden overflow item by min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(new Style({
        overflow: new Point(Overflow.Hidden, Overflow.Hidden),
    }), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [TrackSizingFunction.fitContent(LengthPercentage.percent(0.5))].map((track) => ({
            type: "Single",
            track,
        })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 10 : 20, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(10, 40));
    assert.deepEqual(taffy.layout(text).contentSize, new Size(20, 0));
});
test("grid intrinsic container resolves percentage column gap after sizing", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, (_, index) => index === 1
        ? taffy.newLeafWithContext(new Style({ gridColumn: new Line(span(2), { type: "Auto" }) }), "text")
        : taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gap: new Size(LengthPercentage.percent(0.2), LengthPercentage.zero()),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [
            lengthTrack(40),
            TrackSizingFunction.maxContent(),
            TrackSizingFunction.maxContent(),
        ].map((track) => ({ type: "Single", track })),
    }), children);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _availableSpace, _node, context) => context === "text" ? new Size(60, 0) : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 120));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(60, 40));
    assert.deepEqual(taffy.layout(children[3]).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(100, 40));
    assert.deepEqual(taffy.layout(children[4]).size, new Size(20, 40));
});
test("grid minmax auto percentage maximum clamps after intrinsic sizing", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            minmax(MinTrackSizingFunction.auto(), MaxTrackSizingFunction.percent(0.2)),
        ].map((track) => ({ type: "Single", track })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _availableSpace, _node, context) => context === "text" ? new Size(40, 0) : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(8, 40));
});
test("grid minmax min-content percentage maximum floors max by min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            minmax(MinTrackSizingFunction.minContent(), MaxTrackSizingFunction.percent(0.2)),
        ].map((track) => ({ type: "Single", track })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 40, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(20, 40));
});
test("grid minmax max-content percentage maximum floors max by max-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            minmax(MinTrackSizingFunction.maxContent(), MaxTrackSizingFunction.percent(0.2)),
        ].map((track) => ({ type: "Single", track })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _availableSpace, _node, context) => context === "text" ? new Size(40, 0) : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(40, 40));
});
test("grid minmax min-content fixed maximum floors max by min-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            minmax(MinTrackSizingFunction.minContent(), MaxTrackSizingFunction.length(10)),
        ].map((track) => ({ type: "Single", track })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace, _node, context) => context === "text"
        ? new Size(availableSpace.width.type === "MinContent" ? 20 : 40, 0)
        : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(20, 40));
});
test("grid minmax max-content fixed maximum floors max by max-content", () => {
    const taffy = TaffyTree.new();
    const text = taffy.newLeafWithContext(Style.default(), "text");
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [
            minmax(MinTrackSizingFunction.maxContent(), MaxTrackSizingFunction.length(10)),
        ].map((track) => ({ type: "Single", track })),
    }), [text]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _availableSpace, _node, context) => context === "text" ? new Size(40, 0) : Size.zero());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(text).size, new Size(40, 40));
});
test("grid vertical percentage margins resolve against grid area width", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(10), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.1)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(200), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).location, new Point(0, 20));
    assert.equal(taffy.layout(child).margin.top, 20);
    assert.equal(taffy.layout(child).margin.bottom, 20);
});
test("grid negative column line creates leading implicit auto columns", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 8 }, (_, index) => taffy.newLeaf(index === 0
        ? new Style({ gridColumn: new Line(line(-3), { type: "Auto" }) })
        : Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridAutoFlow: GridAutoFlow.Column,
        gridTemplateRows: [lengthTrack(100)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridAutoColumns: [lengthTrack(10), lengthTrack(20), lengthTrack(30)],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(190, 100));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(30, 100));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(30, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(40, 100));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(160, 0));
    assert.deepEqual(taffy.layout(children[7]).size, new Size(30, 100));
});
test("grid negative column line creates leading implicit auto columns in rtl", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 8 }, (_, index) => taffy.newLeaf(index === 0
        ? new Style({ direction: Direction.Rtl, gridColumn: new Line(line(-3), { type: "Auto" }) })
        : new Style({ direction: Direction.Rtl })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        gridAutoFlow: GridAutoFlow.Column,
        gridTemplateRows: [lengthTrack(100)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridAutoColumns: [lengthTrack(10), lengthTrack(20), lengthTrack(30)],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(190, 100));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(160, 0));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(30, 100));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(120, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(40, 100));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[7]).size, new Size(30, 100));
});
test("grid negative row line creates leading implicit auto rows", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 8 }, (_, index) => taffy.newLeaf(index === 0 ? new Style({ gridRow: new Line(line(-4), { type: "Auto" }) }) : Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40)].map((track) => ({ type: "Single", track })),
        gridTemplateColumns: [lengthTrack(100)].map((track) => ({ type: "Single", track })),
        gridAutoRows: [lengthTrack(10), lengthTrack(20), lengthTrack(30)],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 180));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(100, 30));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(0, 160));
    assert.deepEqual(taffy.layout(children[7]).size, new Size(100, 20));
});
test("grid auto-fit collapses empty columns before content alignment", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(Style.default());
    const child1 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        justifyContent: AlignContent.SpaceEvenly,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat("auto-fit", [lengthTrack(40)])],
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(child0).location, new Point(13, 0));
    assert.deepEqual(taffy.layout(child0).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(child1).location, new Point(67, 0));
    assert.deepEqual(taffy.layout(child1).size, new Size(40, 40));
});
test("grid auto-fit collapsed columns preserve rtl placement", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ direction: Direction.Rtl }));
    const child1 = taffy.newLeaf(new Style({ direction: Direction.Rtl }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        justifyContent: AlignContent.SpaceEvenly,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat("auto-fit", [lengthTrack(40)])],
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(child0).location, new Point(67, 0));
    assert.deepEqual(taffy.layout(child0).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(child1).location, new Point(13, 0));
    assert.deepEqual(taffy.layout(child1).size, new Size(40, 40));
});
test("relative grid child insets offset layout without affecting placement", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        alignSelf: AlignItems.Start,
        justifySelf: AlignItems.Start,
        inset: new Rect(LengthPercentageAuto.length(7), LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(3)),
    }));
    const child1 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(80), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(2, [lengthTrack(40)])],
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(7, -3));
    assert.deepEqual(taffy.layout(child1).location, new Point(40, 0));
});
test("relative grid child uses right inset precedence in rtl", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        alignSelf: AlignItems.Start,
        justifySelf: AlignItems.Start,
        inset: new Rect(LengthPercentageAuto.length(7), LengthPercentageAuto.length(3), LengthPercentageAuto.length(2), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(120), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).location, new Point(97, 2));
});
test("grid justify-content distributes free inline track space", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        justifyContent: AlignContent.SpaceBetween,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(160, 0));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(160, 80));
});
test("grid justify-content center offsets column tracks in inline space", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        justifyContent: AlignContent.Center,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(80, 40));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(120, 80));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40));
});
test("grid justify-content center respects rtl physical column order", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        justifyContent: AlignContent.Center,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(120, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(40, 80));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40));
});
test("grid justify-content center with negative free space and gaps preserves overflow", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const grid = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignContent: AlignContent.Center,
        justifyContent: AlignContent.Center,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(10)),
        gridTemplateRows: [repeat(3, [lengthTrack(20)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    const sixty = LengthPercentage.length(60);
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(240), Dimension.length(240)),
        border: new Rect(sixty, sixty, sixty, sixty),
    }), [grid]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(240, 240));
    assert.deepEqual(taffy.layout(grid).location, new Point(60, 60));
    assert.deepEqual(taffy.layout(grid).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(-10, 20));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(40, 50));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(90, 80));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 20));
});
test("grid align-content end accounts for padding and border", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        alignContent: AlignContent.End,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        border: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(48, 44));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(48, 84));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(128, 124));
});
test("grid align-content center offsets row tracks in block space", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignContent: AlignContent.Center,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(40, 80));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 120));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40));
});
test("grid align-content space-around distributes row track space", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignContent: AlignContent.SpaceAround,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 13));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(0, 80));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 147));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40));
});
test("grid align-content spaced modes account for padding and border", () => {
    const padding = new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30));
    const border = new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6));
    const cases = [
        {
            name: "space-around border-box",
            alignContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.BorderBox,
            expectedRoot: new Size(200, 200),
            expectedY: [17, 68, 119],
        },
        {
            name: "space-between border-box",
            alignContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.BorderBox,
            expectedRoot: new Size(200, 200),
            expectedY: [12, 68, 124],
        },
        {
            name: "space-evenly border-box",
            alignContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.BorderBox,
            expectedRoot: new Size(200, 200),
            expectedY: [20, 68, 116],
        },
        {
            name: "space-around content-box",
            alignContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.ContentBox,
            expectedRoot: new Size(272, 248),
            expectedY: [25, 92, 159],
        },
        {
            name: "space-between content-box",
            alignContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.ContentBox,
            expectedRoot: new Size(272, 248),
            expectedY: [12, 92, 172],
        },
        {
            name: "space-evenly content-box",
            alignContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.ContentBox,
            expectedRoot: new Size(272, 248),
            expectedY: [32, 92, 152],
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ boxSizing: testCase.boxSizing, direction: Direction.Ltr })));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: Direction.Ltr,
            alignContent: testCase.alignContent,
            size: new Size(Dimension.length(200), Dimension.length(200)),
            padding,
            border,
            gridTemplateRows: [repeat(3, [lengthTrack(40)])],
            gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
        }), children);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expectedRoot, testCase.name);
        assert.deepEqual(taffy.layout(children[0]).location, new Point(48, testCase.expectedY[0]), testCase.name);
        assert.deepEqual(taffy.layout(children[3]).location, new Point(48, testCase.expectedY[1]), testCase.name);
        assert.deepEqual(taffy.layout(children[6]).location, new Point(48, testCase.expectedY[2]), testCase.name);
        assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40), testCase.name);
    }
});
test("grid align-content center with negative free space and gaps preserves overflow", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ direction: Direction.Ltr })));
    const grid = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignContent: AlignContent.Center,
        justifyContent: AlignContent.Center,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(10)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(20)])],
    }), children);
    const sixty = LengthPercentage.length(60);
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(240), Dimension.length(240)),
        border: new Rect(sixty, sixty, sixty, sixty),
    }), [grid]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(240, 240));
    assert.deepEqual(taffy.layout(grid).location, new Point(60, 60));
    assert.deepEqual(taffy.layout(grid).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(20, -10));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(50, 40));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 90));
    assert.deepEqual(taffy.layout(children[8]).size, new Size(20, 40));
});
test("grid justify-content space-evenly accounts for padding and border", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        justifyContent: AlignContent.SpaceEvenly,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        border: new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).location, new Point(50, 12));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(92, 12));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(134, 12));
});
test("grid justify-content spaced modes account for padding and border", () => {
    const padding = new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30));
    const border = new Rect(LengthPercentage.length(8), LengthPercentage.length(4), LengthPercentage.length(2), LengthPercentage.length(6));
    const cases = [
        {
            name: "space-around border-box ltr",
            justifyContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(200, 200),
            expectedX: [49, 92, 135],
        },
        {
            name: "space-around border-box rtl",
            justifyContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(200, 200),
            expectedX: [135, 92, 49],
        },
        {
            name: "space-between border-box ltr",
            justifyContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(200, 200),
            expectedX: [48, 92, 136],
        },
        {
            name: "space-between border-box rtl",
            justifyContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(200, 200),
            expectedX: [136, 92, 48],
        },
        {
            name: "space-evenly border-box ltr",
            justifyContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(200, 200),
            expectedX: [50, 92, 134],
        },
        {
            name: "space-evenly border-box rtl",
            justifyContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(200, 200),
            expectedX: [134, 92, 50],
        },
        {
            name: "space-around content-box ltr",
            justifyContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(272, 248),
            expectedX: [61, 128, 195],
        },
        {
            name: "space-around content-box rtl",
            justifyContent: AlignContent.SpaceAround,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(272, 248),
            expectedX: [195, 128, 61],
        },
        {
            name: "space-between content-box ltr",
            justifyContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(272, 248),
            expectedX: [48, 128, 208],
        },
        {
            name: "space-between content-box rtl",
            justifyContent: AlignContent.SpaceBetween,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(272, 248),
            expectedX: [208, 128, 48],
        },
        {
            name: "space-evenly content-box ltr",
            justifyContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            expectedRoot: new Size(272, 248),
            expectedX: [68, 128, 188],
        },
        {
            name: "space-evenly content-box rtl",
            justifyContent: AlignContent.SpaceEvenly,
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            expectedRoot: new Size(272, 248),
            expectedX: [188, 128, 68],
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ boxSizing: testCase.boxSizing, direction: testCase.direction })));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: testCase.direction,
            justifyContent: testCase.justifyContent,
            size: new Size(Dimension.length(200), Dimension.length(200)),
            padding,
            border,
            gridTemplateRows: [repeat(3, [lengthTrack(40)])],
            gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
        }), children);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expectedRoot, testCase.name);
        assert.deepEqual(taffy.layout(children[0]).location, new Point(testCase.expectedX[0], 12), testCase.name);
        assert.deepEqual(taffy.layout(children[1]).location, new Point(testCase.expectedX[1], 12), testCase.name);
        assert.deepEqual(taffy.layout(children[2]).location, new Point(testCase.expectedX[2], 12), testCase.name);
        assert.deepEqual(taffy.layout(children[8]).size, new Size(40, 40), testCase.name);
    }
});
test("grid percent tracks resolve against definite content size", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 6 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(60)),
        gridTemplateRows: [percentTrack(0.3), percentTrack(0.6)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [percentTrack(0.1), percentTrack(0.2), percentTrack(0.3)].map((track) => ({
            type: "Single",
            track,
        })),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 60));
    assert.deepEqual(taffy.layout(children[0]).size, new Size(12, 18));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(12, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(24, 18));
    assert.deepEqual(taffy.layout(children[5]).location, new Point(36, 18));
    assert.deepEqual(taffy.layout(children[5]).size, new Size(36, 36));
});
test("grid percentage tracks resolve definite and content-sized containers", () => {
    const runPercentTracks = (rowPercents: number[], columnPercents: number[], rootSize: Size, leadingContentSize: Size | undefined = undefined) => {
        const taffy = TaffyTree.new();
        const first = taffy.newLeaf(new Style({
            size: leadingContentSize ?? Size.auto(Dimension),
            gridRow: leadingContentSize === undefined
                ? new Line({ type: "Auto" }, { type: "Auto" })
                : new Line(line(1), { type: "Auto" }),
            gridColumn: leadingContentSize === undefined
                ? new Line({ type: "Auto" }, { type: "Auto" })
                : new Line(line(1), { type: "Auto" }),
        }));
        const overlappingSecond = leadingContentSize === undefined
            ? undefined
            : taffy.newLeaf(new Style({
                gridRow: new Line(line(1), { type: "Auto" }),
                gridColumn: new Line(line(1), { type: "Auto" }),
            }));
        const children = [
            first,
            ...(overlappingSecond === undefined ? [] : [overlappingSecond]),
            ...Array.from({ length: 5 }, () => taffy.newLeaf(Style.default())),
        ];
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            size: rootSize,
            gridTemplateRows: rowPercents.map((percent: number) => ({
                type: "Single",
                track: percentTrack(percent),
            })),
            gridTemplateColumns: columnPercents.map((percent: number) => ({
                type: "Single",
                track: percentTrack(percent),
            })),
        }), children);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        return { taffy, root, children };
    };
    const definiteUnderflow = runPercentTracks([0.3, 0.6], [0.1, 0.2, 0.3], new Size(Dimension.length(120), Dimension.length(60)));
    assert.deepEqual(definiteUnderflow.taffy.layout(definiteUnderflow.root).size, new Size(120, 60));
    assert.deepEqual(definiteUnderflow.taffy.layout(definiteUnderflow.children[0]).size, new Size(12, 18));
    assert.deepEqual(definiteUnderflow.taffy.layout(definiteUnderflow.children[5]).location, new Point(36, 18));
    assert.deepEqual(definiteUnderflow.taffy.layout(definiteUnderflow.children[5]).size, new Size(36, 36));
    const definiteOverflow = runPercentTracks([0.5, 0.8], [0.4, 0.4, 0.4], new Size(Dimension.length(120), Dimension.length(60)));
    assert.deepEqual(definiteOverflow.taffy.layout(definiteOverflow.root).size, new Size(120, 60));
    assert.deepEqual(definiteOverflow.taffy.layout(definiteOverflow.children[2]).location, new Point(96, 0));
    assert.deepEqual(definiteOverflow.taffy.layout(definiteOverflow.children[2]).size, new Size(48, 30));
    assert.deepEqual(definiteOverflow.taffy.layout(definiteOverflow.children[5]).location, new Point(96, 30));
    assert.deepEqual(definiteOverflow.taffy.layout(definiteOverflow.children[5]).size, new Size(48, 48));
    const indefiniteOnly = runPercentTracks([0.3, 0.6], [0.1, 0.2, 0.3], Size.auto(Dimension));
    assert.deepEqual(indefiniteOnly.taffy.layout(indefiniteOnly.root).size, Size.zero());
    for (const child of indefiniteOnly.children) {
        assert.deepEqual(indefiniteOnly.taffy.layout(child).location, Point.zero());
        assert.deepEqual(indefiniteOnly.taffy.layout(child).size, Size.zero());
    }
    const contentUnderflow = runPercentTracks([0.3, 0.6], [0.1, 0.2, 0.3], Size.auto(Dimension), new Size(Dimension.length(100), Dimension.length(100)));
    assert.deepEqual(contentUnderflow.taffy.layout(contentUnderflow.root).size, new Size(100, 100));
    assert.deepEqual(contentUnderflow.taffy.layout(contentUnderflow.children[1]).size, new Size(10, 30));
    assert.deepEqual(contentUnderflow.taffy.layout(contentUnderflow.children[6]).location, new Point(30, 30));
    assert.deepEqual(contentUnderflow.taffy.layout(contentUnderflow.children[6]).size, new Size(30, 60));
    const contentOverflow = runPercentTracks([0.5, 0.8], [0.4, 0.4, 0.4], Size.auto(Dimension), new Size(Dimension.length(100), Dimension.length(100)));
    assert.deepEqual(contentOverflow.taffy.layout(contentOverflow.root).size, new Size(100, 100));
    assert.deepEqual(contentOverflow.taffy.layout(contentOverflow.children[1]).size, new Size(40, 50));
    assert.deepEqual(contentOverflow.taffy.layout(contentOverflow.children[6]).location, new Point(80, 50));
    assert.deepEqual(contentOverflow.taffy.layout(contentOverflow.children[6]).size, new Size(40, 80));
});
test("grid percentage items resolve against grid area width", () => {
    const cases = [
        {
            name: "width and padding border-box ltr",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            rootPadding: Rect.zero(LengthPercentage),
            childSize: new Size(Dimension.percent(0.5), Dimension.auto()),
            childPadding: Rect.percent(0.03, LengthPercentage),
            childMargin: Rect.zero(LengthPercentageAuto),
            expectedRoot: new Size(200, 12),
            expectedChildLocation: Point.zero(),
            expectedChildSize: new Size(100, 12),
        },
        {
            name: "width and padding content-box rtl",
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            rootPadding: Rect.zero(LengthPercentage),
            childSize: new Size(Dimension.percent(0.5), Dimension.auto()),
            childPadding: Rect.percent(0.03, LengthPercentage),
            childMargin: Rect.zero(LengthPercentageAuto),
            expectedRoot: new Size(200, 12),
            expectedChildLocation: new Point(88, 0),
            expectedChildSize: new Size(112, 12),
        },
        {
            name: "width and margin border-box ltr",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            rootPadding: Rect.length(3, LengthPercentage),
            childSize: new Size(Dimension.percent(0.45), Dimension.auto()),
            childPadding: Rect.length(3, LengthPercentage),
            childMargin: Rect.percent(0.05, LengthPercentageAuto),
            expectedRoot: new Size(200, 31),
            expectedChildLocation: new Point(13, 13),
            expectedChildSize: new Size(87, 6),
        },
        {
            name: "width and margin content-box rtl",
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            rootPadding: Rect.length(3, LengthPercentage),
            childSize: new Size(Dimension.percent(0.45), Dimension.auto()),
            childPadding: Rect.length(3, LengthPercentage),
            childMargin: Rect.percent(0.05, LengthPercentageAuto),
            expectedRoot: new Size(206, 32),
            expectedChildLocation: new Point(97, 13),
            expectedChildSize: new Size(96, 6),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const child = taffy.newLeaf(new Style({
            boxSizing: testCase.boxSizing,
            direction: testCase.direction,
            size: testCase.childSize,
            padding: testCase.childPadding,
            margin: testCase.childMargin,
        }));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: testCase.direction,
            size: new Size(Dimension.length(200), Dimension.auto()),
            padding: testCase.rootPadding,
        }), [child]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expectedRoot, testCase.name);
        assert.deepEqual(taffy.layout(child).location, testCase.expectedChildLocation, testCase.name);
        assert.deepEqual(taffy.layout(child).size, testCase.expectedChildSize, testCase.name);
    }
});
test("grid percentage child inside stretched grid item resolves from stretched area", () => {
    for (const direction of [Direction.Ltr, Direction.Rtl]) {
        const taffy = TaffyTree.new();
        const grandchild = taffy.newLeaf(new Style({
            display: Display.Grid,
            direction,
            size: new Size(Dimension.percent(0.5), Dimension.auto()),
        }));
        const child = taffy.newWithChildren(new Style({ display: Display.Grid, direction }), [
            grandchild,
        ]);
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            direction,
            size: new Size(Dimension.length(100), Dimension.length(100)),
        }), [child]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, new Size(100, 100), direction);
        assert.deepEqual(taffy.layout(child).location, Point.zero(), direction);
        assert.deepEqual(taffy.layout(child).size, new Size(100, 100), direction);
        assert.deepEqual(taffy.layout(grandchild).location, new Point(direction === Direction.Rtl ? 50 : 0, 0), direction);
        assert.deepEqual(taffy.layout(grandchild).size, new Size(50, 100), direction);
    }
});
test("grid flexible tracks respect sized single-span item contributions", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, (_, index) => taffy.newLeaf(index === 4
        ? new Style({ size: new Size(Dimension.length(100), Dimension.auto()) })
        : Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: [lengthTrack(40), fr(1), fr(1)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [lengthTrack(40), fr(1), fr(1)].map((track) => ({
            type: "Single",
            track,
        })),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(100, 40));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(140, 0));
    assert.deepEqual(taffy.layout(children[2]).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(children[4]).size, new Size(100, 80));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(140, 120));
});
test("grid spanning flexible tracks divide item contribution by flex fraction", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(60), Dimension.auto()),
        gridColumn: new Line(span(2), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(Style.default());
    const child2 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40), lengthTrack(40)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [fr(1), fr(2)].map((track) => ({ type: "Single", track })),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 80));
    assert.deepEqual(taffy.layout(child0).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(child1).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(child1).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(child2).location, new Point(20, 40));
    assert.deepEqual(taffy.layout(child2).size, new Size(40, 40));
});
test("grid spanning flexible tracks with sub-one fraction sum keep proportional bases", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(60), Dimension.auto()),
        gridColumn: new Line(span(2), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(Style.default());
    const child2 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40), lengthTrack(40)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [fr(0.2), fr(0.3)].map((track) => ({ type: "Single", track })),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 80));
    assert.deepEqual(taffy.layout(child1).size, new Size(24, 40));
    assert.deepEqual(taffy.layout(child2).location, new Point(24, 40));
    assert.deepEqual(taffy.layout(child2).size, new Size(36, 40));
});
test("grid spanning zero-fr tracks divide item contribution equally", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(60), Dimension.auto()),
        gridColumn: new Line(span(2), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(Style.default());
    const child2 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40), lengthTrack(40)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [fr(0), fr(0)].map((track) => ({ type: "Single", track })),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(60, 80));
    assert.deepEqual(taffy.layout(child1).size, new Size(30, 40));
    assert.deepEqual(taffy.layout(child2).location, new Point(30, 40));
    assert.deepEqual(taffy.layout(child2).size, new Size(30, 40));
});
test("grid indefinite flexible tracks expand non-spanned fr tracks from used flex fraction", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(60), Dimension.auto()),
        gridColumn: new Line(span(2), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(Style.default());
    const child2 = taffy.newLeaf(Style.default());
    const child3 = taffy.newLeaf(Style.default());
    const child4 = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridTemplateRows: [lengthTrack(40), lengthTrack(40)].map((track) => ({
            type: "Single",
            track,
        })),
        gridTemplateColumns: [fr(1), fr(2), fr(3)].map((track) => ({
            type: "Single",
            track,
        })),
    }), [child0, child1, child2, child3, child4]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 80));
    assert.deepEqual(taffy.layout(child1).location, new Point(60, 0));
    assert.deepEqual(taffy.layout(child1).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(child2).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(child3).location, new Point(20, 40));
    assert.deepEqual(taffy.layout(child3).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(child4).location, new Point(60, 40));
    assert.deepEqual(taffy.layout(child4).size, new Size(60, 40));
});
test("grid auto tracks stretch to fill definite container size", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 16 }, () => taffy.newLeaf(Style.default()));
    const tracks = [
        lengthTrack(40),
        TrackSizingFunction.auto(),
        lengthTrack(40),
        TrackSizingFunction.auto(),
    ].map((track) => ({ type: "Single", track }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gridTemplateRows: tracks,
        gridTemplateColumns: tracks,
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[1]).size, new Size(60, 40));
    assert.deepEqual(taffy.layout(children[5]).size, new Size(60, 60));
    assert.deepEqual(taffy.layout(children[15]).location, new Point(140, 140));
    assert.deepEqual(taffy.layout(children[15]).size, new Size(60, 60));
});
test("grid auto-flow column places items down rows before new columns", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridAutoFlow: GridAutoFlow.Column,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(0, 80));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid dense placement reserves out-of-order definite items before auto items", () => {
    const taffy = TaffyTree.new();
    const children = Array.from({ length: 9 }, (_, index) => {
        if (index === 2) {
            return taffy.newLeaf(new Style({
                size: new Size(Dimension.length(35), Dimension.length(35)),
                gridColumn: new Line(line(1), { type: "Auto" }),
            }));
        }
        if (index === 5) {
            return taffy.newLeaf(new Style({
                size: new Size(Dimension.length(20), Dimension.length(20)),
                gridRow: new Line(line(1), { type: "Auto" }),
                gridColumn: new Line(line(1), { type: "Auto" }),
            }));
        }
        if (index === 7) {
            return taffy.newLeaf(new Style({
                size: new Size(Dimension.length(10), Dimension.length(10)),
                gridRow: new Line(line(1), { type: "Auto" }),
            }));
        }
        return taffy.newLeaf(Style.default());
    });
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        gridAutoFlow: GridAutoFlow.RowDense,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(children[0]).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(0, 80));
    assert.deepEqual(taffy.layout(children[5]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(40, 0));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid layout order compacts in-flow children before absolute and hidden children", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(Style.default());
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
    }));
    const hidden = taffy.newLeaf(new Style({ display: Display.None }));
    const second = taffy.newLeaf(Style.default());
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(80), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(2, [lengthTrack(40)])],
    }), [first, absolute, hidden, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(first).order, 0);
    assert.equal(taffy.layout(second).order, 1);
    assert.equal(taffy.layout(absolute).order, 2);
    assert.equal(taffy.layout(hidden).order, 3);
    assert.deepEqual(taffy.layout(hidden).size, Size.zero());
});
test("grid align and justify items center sized children in their cells", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(20)),
        gridRow: new Line(line(1), { type: "Auto" }),
        gridColumn: new Line(line(1), { type: "Auto" }),
    }));
    const child1 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(60), Dimension.length(60)),
        gridRow: new Line(line(3), { type: "Auto" }),
        gridColumn: new Line(line(3), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        justifyItems: AlignItems.Center,
        alignItems: AlignItems.Center,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(child1).location, new Point(70, 70));
});
test("grid absolute resolved insets honor border, scrollbars, percentages, and rtl", () => {
    const len = LengthPercentageAuto.length;
    const percent = LengthPercentageAuto.percent;
    const auto = LengthPercentageAuto.auto();
    const resolvedInsetCases = [
        {
            name: "auto static",
            inset: lengthPercentageAutoRectAuto(),
            size: Size.auto(Dimension),
        },
        {
            name: "zero start",
            inset: new Rect(len(0), auto, len(0), auto),
            size: Size.auto(Dimension),
        },
        {
            name: "percent start",
            inset: new Rect(percent(1), auto, percent(1), auto),
            size: Size.auto(Dimension),
        },
        {
            name: "percent end",
            inset: new Rect(auto, percent(1), auto, percent(1)),
            size: Size.auto(Dimension),
        },
        {
            name: "point start",
            inset: new Rect(len(30), auto, len(30), auto),
            size: Size.auto(Dimension),
        },
        {
            name: "percent size",
            inset: new Rect(len(0), auto, len(0), auto),
            size: new Size(Dimension.percent(1), Dimension.percent(1)),
        },
    ];
    const cases = [
        {
            name: "border ltr",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            scroll: false,
            expectedRoot: new Size(200, 200),
            expectedLocations: [
                new Point(20, 20),
                new Point(20, 20),
                new Point(180, 180),
                new Point(20, 20),
                new Point(50, 50),
                new Point(20, 20),
            ],
            expectedFullSize: new Size(160, 160),
        },
        {
            name: "border ltr scroll",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Ltr,
            scroll: true,
            expectedRoot: new Size(200, 200),
            expectedLocations: [
                new Point(20, 20),
                new Point(20, 20),
                new Point(165, 165),
                new Point(20, 20),
                new Point(50, 50),
                new Point(20, 20),
            ],
            expectedFullSize: new Size(145, 145),
        },
        {
            name: "border rtl",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            scroll: false,
            expectedRoot: new Size(200, 200),
            expectedLocations: [
                new Point(180, 20),
                new Point(20, 20),
                new Point(180, 180),
                new Point(20, 20),
                new Point(50, 50),
                new Point(20, 20),
            ],
            expectedFullSize: new Size(160, 160),
        },
        {
            name: "border rtl scroll",
            boxSizing: BoxSizing.BorderBox,
            direction: Direction.Rtl,
            scroll: true,
            expectedRoot: new Size(200, 200),
            expectedLocations: [
                new Point(180, 20),
                new Point(35, 20),
                new Point(180, 165),
                new Point(35, 20),
                new Point(65, 50),
                new Point(35, 20),
            ],
            expectedFullSize: new Size(145, 145),
        },
        {
            name: "content ltr",
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Ltr,
            scroll: false,
            expectedRoot: new Size(270, 270),
            expectedLocations: [
                new Point(20, 20),
                new Point(20, 20),
                new Point(250, 250),
                new Point(20, 20),
                new Point(50, 50),
                new Point(20, 20),
            ],
            expectedFullSize: new Size(230, 230),
        },
        {
            name: "content rtl scroll",
            boxSizing: BoxSizing.ContentBox,
            direction: Direction.Rtl,
            scroll: true,
            expectedRoot: new Size(270, 270),
            expectedLocations: [
                new Point(250, 20),
                new Point(35, 20),
                new Point(250, 235),
                new Point(35, 20),
                new Point(65, 50),
                new Point(35, 20),
            ],
            expectedFullSize: new Size(215, 215),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const children = resolvedInsetCases.map((insetCase) => taffy.newLeaf(new Style({
            boxSizing: testCase.boxSizing,
            direction: testCase.direction,
            position: Position.Absolute,
            inset: insetCase.inset,
            size: insetCase.size,
        })));
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            boxSizing: testCase.boxSizing,
            direction: testCase.direction,
            overflow: testCase.scroll
                ? new Point(Overflow.Scroll, Overflow.Scroll)
                : new Point(Overflow.Visible, Overflow.Visible),
            scrollbarWidth: 15,
            size: new Size(Dimension.length(200), Dimension.length(200)),
            padding: Rect.length(15, LengthPercentage),
            border: Rect.length(20, LengthPercentage),
        }), children);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, testCase.expectedRoot, testCase.name);
        for (const [index, child] of children.entries()) {
            assert.deepEqual(taffy.layout(child).location, testCase.expectedLocations[index], `${testCase.name} ${resolvedInsetCases[index].name}`);
        }
        assert.deepEqual(taffy.layout(children[5]).size, testCase.expectedFullSize, `${testCase.name} percent size`);
    }
});
test("grid baseline alignment shims items per row", () => {
    const taffy = TaffyTree.new();
    const childWithInner = (height: number) => {
        const inner = taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.auto(), Dimension.length(height)),
        }));
        return taffy.newWithChildren(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        }), [inner]);
    };
    const children = [
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        })),
        childWithInner(10),
        childWithInner(10),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        })),
        childWithInner(10),
        childWithInner(5),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(20), Dimension.length(20)),
        })),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(120), Dimension.length(120)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 120));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(40, 10));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(80, 10));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(0, 40));
    assert.deepEqual(taffy.layout(children[6]).location, new Point(0, 90));
    assert.deepEqual(taffy.layout(children[7]).location, new Point(40, 95));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(80, 80));
});
test("grid baseline alignment contributes shims to auto row sizing", () => {
    const taffy = TaffyTree.new();
    const childWithInner = (outerHeight: number, innerHeight: number) => {
        const inner = taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(innerHeight)),
        }));
        return taffy.newWithChildren(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(outerHeight)),
        }), [inner]);
    };
    const children = [
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(50)),
        })),
        childWithInner(20, 10),
        childWithInner(20, 10),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(50)),
        })),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
        gridTemplateColumns: [repeat(2, [TrackSizingFunction.auto()])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(50, 40));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(0, 100));
    assert.deepEqual(taffy.layout(children[3]).location, new Point(50, 60));
});
test("grid baseline alignment preserves margin and padding offsets", () => {
    const five = LengthPercentage.length(5);
    const onePercent = LengthPercentageAuto.percent(0.01);
    const fivePercent = LengthPercentageAuto.percent(0.05);
    const cases = [
        {
            name: "child margin",
            firstMargin: new Rect(LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5)),
            innerMargin: new Rect(LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5)),
            rootPadding: Rect.zero(LengthPercentage),
            secondPadding: Rect.zero(LengthPercentage),
            expectedFirst: new Point(5, 5),
            expectedSecond: new Point(0, 70),
            expectedInner: new Point(5, 5),
        },
        {
            name: "child percent margin",
            firstMargin: new Rect(fivePercent, fivePercent, fivePercent, fivePercent),
            innerMargin: new Rect(onePercent, onePercent, onePercent, onePercent),
            rootPadding: Rect.zero(LengthPercentage),
            secondPadding: Rect.zero(LengthPercentage),
            expectedFirst: new Point(5, 5),
            expectedSecond: new Point(0, 70),
            expectedInner: new Point(1, 1),
        },
        {
            name: "child padding",
            firstMargin: Rect.zero(LengthPercentageAuto),
            innerMargin: Rect.zero(LengthPercentageAuto),
            rootPadding: new Rect(five, five, five, five),
            secondPadding: new Rect(five, five, five, five),
            expectedFirst: new Point(5, 5),
            expectedSecond: new Point(5, 65),
            expectedInner: new Point(5, 5),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const first = taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(50)),
            margin: testCase.firstMargin,
        }));
        const inner = taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(10)),
            margin: testCase.innerMargin,
        }));
        const second = taffy.newWithChildren(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(20)),
            padding: testCase.secondPadding,
        }), [inner]);
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            direction: Direction.Ltr,
            alignItems: AlignItems.Baseline,
            size: new Size(Dimension.length(100), Dimension.length(100)),
            padding: testCase.rootPadding,
        }), [first, second]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, new Size(100, 100), testCase.name);
        assert.deepEqual(taffy.layout(first).location, testCase.expectedFirst, testCase.name);
        assert.deepEqual(taffy.layout(second).location, testCase.expectedSecond, testCase.name);
        assert.deepEqual(taffy.layout(inner).location, testCase.expectedInner, testCase.name);
    }
});
test("grid baseline alignment composes with relative top offsets", () => {
    const cases = [
        {
            name: "first baseline child offset",
            firstInset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto()),
            secondInset: lengthPercentageAutoRectAuto(),
            expectedFirst: new Point(0, 10),
            expectedSecond: new Point(0, 65),
        },
        {
            name: "second baseline child offset",
            firstInset: lengthPercentageAutoRectAuto(),
            secondInset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(5), LengthPercentageAuto.auto()),
            expectedFirst: new Point(0, 0),
            expectedSecond: new Point(0, 70),
        },
    ];
    for (const testCase of cases) {
        const taffy = TaffyTree.new();
        const first = taffy.newLeaf(new Style({
            display: Display.Grid,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(50)),
            inset: testCase.firstInset,
        }));
        const inner = taffy.newLeaf(new Style({
            display: Display.Grid,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(10)),
        }));
        const second = taffy.newWithChildren(new Style({
            display: Display.Grid,
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(20)),
            inset: testCase.secondInset,
        }), [inner]);
        const root = taffy.newWithChildren(new Style({
            display: Display.Grid,
            direction: Direction.Ltr,
            alignItems: AlignItems.Baseline,
            size: new Size(Dimension.length(100), Dimension.length(100)),
        }), [first, second]);
        taffy.computeLayout(root, AvailableSpaceSize.maxContent());
        assert.deepEqual(taffy.layout(root).size, new Size(100, 100), testCase.name);
        assert.deepEqual(taffy.layout(first).location, testCase.expectedFirst, testCase.name);
        assert.deepEqual(taffy.layout(second).location, testCase.expectedSecond, testCase.name);
        assert.deepEqual(taffy.layout(inner).location, Point.zero(), testCase.name);
    }
});
test("grid baseline alignment follows nested column baselines", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(60)),
    }));
    const nestedFirst = taffy.newLeaf(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(30)),
    }));
    const nestedSecond = taffy.newLeaf(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(40)),
    }));
    const inner = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(80)),
    }), [nestedFirst, nestedSecond]);
    const second = taffy.newWithChildren(new Style({ display: Display.Grid, direction: Direction.Ltr }), [inner]);
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [first, second]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(first).location, Point.zero());
    assert.deepEqual(taffy.layout(second).location, new Point(0, 60));
    assert.deepEqual(taffy.layout(second).size, new Size(100, 80));
    assert.deepEqual(taffy.layout(inner).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedFirst).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedSecond).location, new Point(0, 35));
});
test("grid auto margins absorb inline and block free space in ltr", () => {
    const taffy = TaffyTree.new();
    const zero = LengthPercentageAuto.zero();
    const auto = LengthPercentageAuto.auto();
    const children = [
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            justifySelf: AlignItems.Start,
            size: new Size(Dimension.length(20), Dimension.auto()),
            margin: new Rect(auto, auto, zero, zero),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            alignSelf: AlignItems.Start,
            size: new Size(Dimension.auto(), Dimension.length(20)),
            margin: new Rect(zero, zero, auto, auto),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            alignSelf: AlignItems.Start,
            justifySelf: AlignItems.Start,
            size: new Size(Dimension.length(20), Dimension.length(20)),
            margin: new Rect(auto, auto, auto, auto),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
        taffy.newLeaf(new Style({ direction: Direction.Ltr })),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Ltr,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(40, 10));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(80, 10));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(130, 10));
    assert.deepEqual(taffy.layout(children[2]).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(80, 60));
    assert.deepEqual(taffy.layout(children[4]).size, new Size(40, 20));
    assert.deepEqual(taffy.layout(children[6]).location, new Point(50, 100));
    assert.deepEqual(taffy.layout(children[6]).size, new Size(20, 20));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(120, 90));
});
test("grid auto margins absorb inline and block free space in rtl", () => {
    const taffy = TaffyTree.new();
    const zero = LengthPercentageAuto.zero();
    const auto = LengthPercentageAuto.auto();
    const children = [
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
        taffy.newLeaf(new Style({
            direction: Direction.Rtl,
            justifySelf: AlignItems.Start,
            size: new Size(Dimension.length(20), Dimension.auto()),
            margin: new Rect(auto, auto, zero, zero),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
        taffy.newLeaf(new Style({
            direction: Direction.Rtl,
            alignSelf: AlignItems.Start,
            size: new Size(Dimension.auto(), Dimension.length(20)),
            margin: new Rect(zero, zero, auto, auto),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
        taffy.newLeaf(new Style({
            direction: Direction.Rtl,
            alignSelf: AlignItems.Start,
            justifySelf: AlignItems.Start,
            size: new Size(Dimension.length(20), Dimension.length(20)),
            margin: new Rect(auto, auto, auto, auto),
        })),
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
        taffy.newLeaf(new Style({ direction: Direction.Rtl })),
    ];
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(children[0]).location, new Point(120, 10));
    assert.deepEqual(taffy.layout(children[1]).location, new Point(80, 10));
    assert.deepEqual(taffy.layout(children[2]).location, new Point(50, 10));
    assert.deepEqual(taffy.layout(children[2]).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(children[4]).location, new Point(80, 60));
    assert.deepEqual(taffy.layout(children[4]).size, new Size(40, 20));
    assert.deepEqual(taffy.layout(children[6]).location, new Point(130, 100));
    assert.deepEqual(taffy.layout(children[6]).size, new Size(20, 20));
    assert.deepEqual(taffy.layout(children[8]).location, new Point(40, 90));
});
test("absolute grid child with row start uses the container block-end edge", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(4), LengthPercentageAuto.length(3), LengthPercentageAuto.length(1), LengthPercentageAuto.length(2)),
        gridRow: new Line(line(1), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(child).location, new Point(4, 11));
    assert.deepEqual(taffy.layout(child).size, new Size(173, 147));
});
test("absolute grid child with column start uses the container inline-end edge in ltr", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(4), LengthPercentageAuto.length(3), LengthPercentageAuto.length(1), LengthPercentageAuto.length(2)),
        gridColumn: new Line(line(1), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(child).location, new Point(44, 1));
    assert.deepEqual(taffy.layout(child).size, new Size(133, 157));
});
test("absolute grid child with column start uses the container inline-end edge in rtl", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(4), LengthPercentageAuto.length(3), LengthPercentageAuto.length(1), LengthPercentageAuto.length(2)),
        gridColumn: new Line(line(1), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(child).location, new Point(4, 1));
    assert.deepEqual(taffy.layout(child).size, new Size(153, 157));
});
test("absolute grid child with column end uses the container inline-start edge in rtl", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(4), LengthPercentageAuto.length(3), LengthPercentageAuto.length(1), LengthPercentageAuto.length(2)),
        gridColumn: new Line({ type: "Auto" }, line(1)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(child).location, new Point(164, 1));
    assert.deepEqual(taffy.layout(child).size, new Size(13, 157));
});
test("absolute grid child without grid lines is positioned within the border box", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        inset: new Rect(LengthPercentageAuto.length(0), LengthPercentageAuto.auto(), LengthPercentageAuto.length(0), LengthPercentageAuto.auto()),
    }));
    const child1 = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.length(0), LengthPercentageAuto.auto(), LengthPercentageAuto.length(0)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
        border: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(10)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child0).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(child0).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(child1).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(child1).size, new Size(50, 50));
});
test("absolute grid child ignores grid lines outside the existing implicit grid", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        gridColumn: new Line(line(5), { type: "Auto" }),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(40)),
        gridTemplateRows: [repeat(1, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 40));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(10, 10));
});
test("absolute grid child applies line placement conflict handling", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(0), LengthPercentageAuto.length(0), LengthPercentageAuto.length(0), LengthPercentageAuto.length(0)),
        gridColumn: new Line(line(3), line(1)),
    }));
    const child1 = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(0), LengthPercentageAuto.length(0), LengthPercentageAuto.length(0), LengthPercentageAuto.length(0)),
        gridColumn: new Line(line(2), line(2)),
        gridRow: new Line(line(2), line(2)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(120), Dimension.length(80)),
        gridTemplateRows: [repeat(2, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 80));
    assert.deepEqual(taffy.layout(child0).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child0).size, new Size(80, 80));
    assert.deepEqual(taffy.layout(child1).location, new Point(40, 40));
    assert.deepEqual(taffy.layout(child1).size, new Size(40, 40));
});
test("absolute grid child fills container area from opposing horizontal insets", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(5), LengthPercentageAuto.length(2), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }));
    const children = Array.from({ length: 8 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [absolute, ...children]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(absolute).location, new Point(5, 0));
    assert.deepEqual(taffy.layout(absolute).size, new Size(173, 0));
});
test("absolute grid child with both horizontal insets uses right edge in rtl", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.auto()),
        inset: new Rect(LengthPercentageAuto.length(5), LengthPercentageAuto.length(2), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }));
    const children = Array.from({ length: 8 }, () => taffy.newLeaf(Style.default()));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        direction: Direction.Rtl,
        padding: new Rect(LengthPercentage.length(40), LengthPercentage.length(20), LengthPercentage.length(10), LengthPercentage.length(30)),
        gridTemplateRows: [repeat(3, [lengthTrack(40)])],
        gridTemplateColumns: [repeat(3, [lengthTrack(40)])],
    }), [absolute, ...children]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(180, 160));
    assert.deepEqual(taffy.layout(absolute).location, new Point(168, 0));
    assert.deepEqual(taffy.layout(absolute).size, new Size(10, 0));
});
test("absolute grid child reapplies aspect ratio after inset-derived width", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(400), Dimension.length(300)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(20, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(360, 120));
});
test("absolute grid child content-box sizing includes padding and border in known dimensions", () => {
    const taffy = TaffyTree.new();
    const five = LengthPercentage.length(5);
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        boxSizing: BoxSizing.ContentBox,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        padding: new Rect(five, five, five, five),
        border: new Rect(five, five, five, five),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, Point.zero());
    assert.deepEqual(taffy.layout(absolute).size, new Size(30, 30));
});
test("absolute grid child inset-derived size is clamped by max size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        maxSize: new Size(Dimension.length(40), Dimension.length(30)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(40, 30));
});
test("absolute grid child with auto size is measured before final layout", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
    }));
    const root = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(100), Dimension.length(80)),
    }), [absolute]);
    const availableSpaces: Size[] = [];
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, availableSpace) => {
        availableSpaces.push(availableSpace);
        return new Size(30, 20);
    });
    assert.deepEqual(availableSpaces, [
        new Size(AvailableSpace.definite(100), AvailableSpace.definite(80)),
        new Size(AvailableSpace.definite(30), AvailableSpace.definite(20)),
    ]);
    assert.deepEqual(taffy.layout(absolute).location, Point.zero());
    assert.deepEqual(taffy.layout(absolute).size, new Size(30, 20));
});
