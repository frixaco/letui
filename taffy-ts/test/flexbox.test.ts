import assert from "node:assert/strict";
import test from "node:test";
import { AlignItems, AlignContent, AvailableSpace, AvailableSpaceSize, BoxSizing, Dimension, Direction, Display, FlexDirection, FlexWrap, LengthPercentage, LengthPercentageAuto, Overflow, Point, Position, Rect, Size, Style, TaffyTree, TrackSizingFunction, fr, lengthTrack, percentTrack, } from "../src/index.js";
test("basic Rust example: centered percent-width flex child stretches in cross axis", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.percent(0.5), Dimension.auto()) }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        justifyContent: AlignContent.Center,
    }), [child]);
    taffy.computeLayout(root, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).size, new Size(50, 100));
    assert.equal(taffy.layout(child).location.x, 25);
    assert.equal(taffy.layout(child).location.y, 0);
});
test("flexbox_gap Rust example: row gap contributes to max-content container size and child offsets", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) });
    const child0 = taffy.newLeaf(childStyle);
    const child1 = taffy.newLeaf(childStyle);
    const child2 = taffy.newLeaf(childStyle);
    const root = taffy.newWithChildren(new Style({ gap: new Size(LengthPercentage.length(10), LengthPercentage.zero()) }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(80, 20));
    assert.equal(taffy.layout(child0).location.x, 0);
    assert.equal(taffy.layout(child0).location.y, 0);
    assert.equal(taffy.layout(child1).location.x, 30);
    assert.equal(taffy.layout(child1).location.y, 0);
    assert.equal(taffy.layout(child2).location.x, 60);
    assert.equal(taffy.layout(child2).location.y, 0);
});
test("Rust XML block children in flex row and column preserve block sizing", () => {
    const cases = [
        {
            flexDirection: FlexDirection.Row,
            direction: Direction.Ltr,
            expectedFirstLocation: new Point(0, 0),
            expectedSecondLocation: new Point(0, 0),
            expectedFirstSize: new Size(0, 50),
            expectedSecondSize: new Size(50, 50),
        },
        {
            flexDirection: FlexDirection.Row,
            direction: Direction.Rtl,
            expectedFirstLocation: new Point(200, 0),
            expectedSecondLocation: new Point(150, 0),
            expectedFirstSize: new Size(0, 50),
            expectedSecondSize: new Size(50, 50),
        },
        {
            flexDirection: FlexDirection.Column,
            direction: Direction.Ltr,
            expectedFirstLocation: new Point(0, 0),
            expectedSecondLocation: new Point(0, 0),
            expectedFirstSize: new Size(200, 0),
            expectedSecondSize: new Size(50, 0),
        },
        {
            flexDirection: FlexDirection.Column,
            direction: Direction.Rtl,
            expectedFirstLocation: new Point(0, 0),
            expectedSecondLocation: new Point(150, 0),
            expectedFirstSize: new Size(200, 0),
            expectedSecondSize: new Size(50, 0),
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const { flexDirection, direction, expectedFirstLocation, expectedSecondLocation, expectedFirstSize, expectedSecondSize, } of cases) {
            const taffy = TaffyTree.new();
            const first = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Block,
            }));
            const second = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Flex,
                flexDirection,
                size: new Size(Dimension.length(200), Dimension.length(50)),
            }), [first, second]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).location, Point.zero());
            assert.deepEqual(taffy.layout(root).size, new Size(200, 50));
            assert.deepEqual(taffy.layout(first).location, expectedFirstLocation);
            assert.deepEqual(taffy.layout(first).size, expectedFirstSize);
            assert.deepEqual(taffy.layout(second).location, expectedSecondLocation);
            assert.deepEqual(taffy.layout(second).size, expectedSecondSize);
        }
    }
});
test("Rust XML flex children inside block participate in block layout", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const flexChild = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(50), Dimension.length(50)),
            }));
            const flex = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Flex,
            }), [flexChild]);
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
            }), [flex, block]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const expectedChildX = direction === Direction.Ltr ? 0 : 150;
            assert.deepEqual(taffy.layout(root).location, Point.zero());
            assert.deepEqual(taffy.layout(root).size, new Size(200, 70));
            assert.deepEqual(taffy.layout(flex).location, Point.zero());
            assert.deepEqual(taffy.layout(flex).size, new Size(200, 50));
            assert.deepEqual(taffy.layout(flexChild).location, new Point(expectedChildX, 0));
            assert.deepEqual(taffy.layout(flexChild).size, new Size(50, 50));
            assert.deepEqual(taffy.layout(block).location, new Point(expectedChildX, 50));
            assert.deepEqual(taffy.layout(block).size, new Size(50, 20));
        }
    }
});
test("Rust XML flex boxes block vertical margin collapse through block siblings", () => {
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
            const flex = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                display: Display.Flex,
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
            }), [first, flex, last]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).size, new Size(50, 40));
            assert.deepEqual(taffy.layout(first).location, Point.zero());
            assert.deepEqual(taffy.layout(first).size, new Size(50, 10));
            assert.deepEqual(taffy.layout(flex).location, new Point(0, 20));
            assert.deepEqual(taffy.layout(flex).size, new Size(50, 0));
            assert.deepEqual(taffy.layout(last).location, new Point(0, 30));
            assert.deepEqual(taffy.layout(last).size, new Size(50, 10));
        }
    }
});
test("Rust XML flex boxes block first and last child margin collapse", () => {
    const cases = [
        {
            flexMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
            blockMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.zero()),
            flexLocation: new Point(0, 10),
            blockY: 10,
        },
        {
            flexMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
            blockMargin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
            flexLocation: Point.zero(),
            blockY: 0,
        },
    ];
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const { flexMargin, blockMargin, flexLocation, blockY } of cases) {
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
                const flex = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Flex,
                    margin: flexMargin,
                }), [block]);
                const root = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Block,
                    size: new Size(Dimension.length(50), Dimension.auto()),
                }), [flex]);
                taffy.computeLayout(root, AvailableSpaceSize.maxContent());
                const expectedBlockX = direction === Direction.Ltr ? 0 : 50;
                assert.deepEqual(taffy.layout(root).size, new Size(50, 30));
                assert.deepEqual(taffy.layout(flex).location, flexLocation);
                assert.deepEqual(taffy.layout(flex).size, new Size(50, 20));
                assert.deepEqual(taffy.layout(block).location, new Point(expectedBlockX, blockY));
                assert.deepEqual(taffy.layout(block).size, new Size(0, 10));
                assert.deepEqual(taffy.layout(leaf).location, Point.zero());
                assert.deepEqual(taffy.layout(leaf).size, new Size(0, 10));
            }
        }
    }
});
test("Rust XML blockflex overflow hidden can shrink below measured content", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const hidden = taffy.newLeafWithContext(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                flexGrow: 1,
                overflow: new Point(Overflow.Hidden, Overflow.Hidden),
                scrollbarWidth: 15,
            }), { width: 40 });
            const visible = taffy.newLeafWithContext(new Style({
                boxSizing,
                direction,
                display: Display.Block,
                flexGrow: 1,
            }), { width: 40 });
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Flex,
                size: new Size(Dimension.length(20), Dimension.length(50)),
            }), [hidden, visible]);
            taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
                assert.ok(context);
                return new Size(context.width, 0);
            });
            const expectedHiddenX = direction === Direction.Ltr ? 0 : 20;
            const expectedVisibleX = direction === Direction.Ltr ? 0 : -20;
            assert.deepEqual(taffy.layout(root).location, Point.zero());
            assert.deepEqual(taffy.layout(root).size, new Size(20, 50));
            assert.deepEqual(taffy.layout(hidden).location, new Point(expectedHiddenX, 0));
            assert.deepEqual(taffy.layout(hidden).size, new Size(0, 50));
            assert.equal(taffy.layout(hidden).scrollWidth(), 40);
            assert.equal(taffy.layout(hidden).scrollHeight(), 0);
            assert.deepEqual(taffy.layout(visible).location, new Point(expectedVisibleX, 0));
            assert.deepEqual(taffy.layout(visible).size, new Size(40, 50));
        }
    }
});
test("Rust XML gridflex row and column integration sizes grid flex item from measured cells", () => {
    const gridCellLocationsByDirection = new Map([
        [Direction.Ltr, [new Point(0, 0), new Point(20, 0), new Point(0, 10), new Point(20, 10)]],
        [Direction.Rtl, [new Point(20, 0), new Point(0, 0), new Point(20, 10), new Point(0, 10)]],
    ]);
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            for (const flexDirection of [FlexDirection.Row, FlexDirection.Column]) {
                const taffy = TaffyTree.new();
                const cells = Array.from({ length: 4 }, () => taffy.newLeafWithContext(new Style({
                    boxSizing,
                    direction,
                }), { text: "HH" }));
                const grid = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    display: Display.Grid,
                    gridTemplateRows: [fr(1), fr(1)].map((track) => ({ type: "Single", track })),
                    gridTemplateColumns: [fr(1), fr(1)].map((track) => ({
                        type: "Single",
                        track,
                    })),
                }), cells);
                const root = taffy.newWithChildren(new Style({
                    boxSizing,
                    direction,
                    flexDirection,
                }), [grid]);
                taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
                    assert.ok(context);
                    return new Size(context.text.length * 10, 10);
                });
                assert.deepEqual(taffy.layout(root).location, Point.zero());
                assert.deepEqual(taffy.layout(root).size, new Size(40, 20));
                assert.deepEqual(taffy.layout(grid).location, Point.zero());
                assert.deepEqual(taffy.layout(grid).size, new Size(40, 20));
                const expectedLocations = gridCellLocationsByDirection.get(direction);
                assert.ok(expectedLocations);
                for (const [index, cell] of cells.entries()) {
                    assert.deepEqual(taffy.layout(cell).location, expectedLocations[index]);
                    assert.deepEqual(taffy.layout(cell).size, new Size(20, 10));
                }
            }
        }
    }
});
test("Rust XML gridflex kitchen-sink minimisations preserve intrinsic grid flex sizing", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const first = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }));
            const second = taffy.newLeaf(new Style({
                boxSizing,
                direction,
            }));
            const grid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
                gridTemplateRows: [lengthTrack(20)].map((track) => ({ type: "Single", track })),
                gridTemplateColumns: [fr(1), fr(1)].map((track) => ({ type: "Single", track })),
            }), [first, second]);
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
            }), [grid]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const expectedFirstX = direction === Direction.Ltr ? 0 : 50;
            const expectedSecondX = direction === Direction.Ltr ? 50 : 0;
            assert.deepEqual(taffy.layout(root).size, new Size(100, 20));
            assert.deepEqual(taffy.layout(grid).location, Point.zero());
            assert.deepEqual(taffy.layout(grid).size, new Size(100, 20));
            assert.deepEqual(taffy.layout(first).location, new Point(expectedFirstX, 0));
            assert.deepEqual(taffy.layout(first).size, new Size(50, 20));
            assert.deepEqual(taffy.layout(second).location, new Point(expectedSecondX, 0));
            assert.deepEqual(taffy.layout(second).size, new Size(50, 20));
        }
    }
});
test("Rust XML gridflex kitchen-sink nested auto grid keeps flex parent width", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const cell = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(20), Dimension.length(20)),
            }));
            const grid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
            }), [cell]);
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                flexGrow: 1,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }), [grid]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const expectedGridX = direction === Direction.Ltr ? 0 : 30;
            assert.deepEqual(taffy.layout(root).size, new Size(50, 20));
            assert.deepEqual(taffy.layout(grid).location, new Point(expectedGridX, 0));
            assert.deepEqual(taffy.layout(grid).size, new Size(20, 20));
            assert.deepEqual(taffy.layout(cell).location, Point.zero());
            assert.deepEqual(taffy.layout(cell).size, new Size(20, 20));
        }
    }
});
test("Rust XML gridflex kitchen-sink percentage tracks overflow intrinsic grid width", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const cells = [
                taffy.newLeaf(new Style({
                    boxSizing,
                    direction,
                    size: new Size(Dimension.length(20), Dimension.length(20)),
                })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
            ];
            const grid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
                gridTemplateRows: [percentTrack(0.3), percentTrack(0.1)].map((track) => ({
                    type: "Single",
                    track,
                })),
                gridTemplateColumns: [TrackSizingFunction.auto(), percentTrack(0.1)].map((track) => ({
                    type: "Single",
                    track,
                })),
            }), cells);
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }), [grid]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const expectedGridX = direction === Direction.Ltr ? 0 : 30;
            const expectedOverflowX = direction === Direction.Ltr ? 20 : -2;
            assert.deepEqual(taffy.layout(root).size, new Size(50, 20));
            assert.deepEqual(taffy.layout(grid).location, new Point(expectedGridX, 0));
            assert.deepEqual(taffy.layout(grid).size, new Size(20, 20));
            assert.deepEqual(taffy.layout(cells[0]).location, Point.zero());
            assert.deepEqual(taffy.layout(cells[0]).size, new Size(20, 20));
            assert.deepEqual(taffy.layout(cells[1]).location, new Point(expectedOverflowX, 0));
            assert.deepEqual(taffy.layout(cells[1]).size, new Size(2, 6));
            assert.deepEqual(taffy.layout(cells[2]).location, new Point(0, 6));
            assert.deepEqual(taffy.layout(cells[2]).size, new Size(20, 2));
            assert.deepEqual(taffy.layout(cells[3]).location, new Point(expectedOverflowX, 6));
            assert.deepEqual(taffy.layout(cells[3]).size, new Size(2, 2));
        }
    }
});
test("Rust XML gridflex kitchen-sink preserves nested flex and grid intrinsic sizing", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const innerCells = [
                taffy.newLeaf(new Style({
                    boxSizing,
                    direction,
                    size: new Size(Dimension.length(20), Dimension.auto()),
                })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
                taffy.newLeaf(new Style({ boxSizing, direction })),
            ];
            const innerGrid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
                gridTemplateRows: [percentTrack(0.3), percentTrack(0.1)].map((track) => ({
                    type: "Single",
                    track,
                })),
                gridTemplateColumns: [TrackSizingFunction.auto(), percentTrack(0.1)].map((track) => ({
                    type: "Single",
                    track,
                })),
            }), innerCells);
            const nestedFixed = taffy.newLeaf(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(20), Dimension.auto()),
            }));
            const nestedFlexGrow = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                flexGrow: 1,
                size: new Size(Dimension.length(50), Dimension.auto()),
            }), [innerGrid]);
            const nestedFlex = taffy.newWithChildren(new Style({ boxSizing, direction }), [
                nestedFixed,
                nestedFlexGrow,
            ]);
            const textCells = Array.from({ length: 3 }, () => taffy.newLeafWithContext(new Style({
                boxSizing,
                direction,
            }), { text: "HH" }));
            const outerGrid = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                display: Display.Grid,
                gridTemplateRows: [fr(1), fr(1)].map((track) => ({ type: "Single", track })),
                gridTemplateColumns: [fr(1), fr(1)].map((track) => ({ type: "Single", track })),
            }), [nestedFlex, ...textCells]);
            const root = taffy.newWithChildren(new Style({ boxSizing, direction }), [outerGrid]);
            taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (_known, _available, _node, context) => {
                if (context === undefined)
                    return Size.zero();
                return new Size(context.text.length * 10, 10);
            });
            const rtl = direction === Direction.Rtl;
            assert.deepEqual(taffy.layout(root).size, new Size(140, 20));
            assert.deepEqual(taffy.layout(outerGrid).location, Point.zero());
            assert.deepEqual(taffy.layout(outerGrid).size, new Size(140, 20));
            assert.deepEqual(taffy.layout(nestedFlex).location, new Point(rtl ? 70 : 0, 0));
            assert.deepEqual(taffy.layout(nestedFlex).size, new Size(70, 10));
            assert.deepEqual(taffy.layout(textCells[0]).location, new Point(rtl ? 0 : 70, 0));
            assert.deepEqual(taffy.layout(textCells[0]).size, new Size(70, 10));
            assert.deepEqual(taffy.layout(textCells[1]).location, new Point(rtl ? 70 : 0, 10));
            assert.deepEqual(taffy.layout(textCells[1]).size, new Size(70, 10));
            assert.deepEqual(taffy.layout(textCells[2]).location, new Point(rtl ? 0 : 70, 10));
            assert.deepEqual(taffy.layout(textCells[2]).size, new Size(70, 10));
            assert.deepEqual(taffy.layout(nestedFixed).location, new Point(rtl ? 50 : 0, 0));
            assert.deepEqual(taffy.layout(nestedFixed).size, new Size(20, 10));
            assert.deepEqual(taffy.layout(nestedFlexGrow).location, new Point(rtl ? 0 : 20, 0));
            assert.deepEqual(taffy.layout(nestedFlexGrow).size, new Size(50, 10));
            assert.deepEqual(taffy.layout(innerGrid).location, new Point(rtl ? 30 : 0, 0));
            assert.deepEqual(taffy.layout(innerGrid).size, new Size(20, 10));
            assert.deepEqual(taffy.layout(innerCells[0]).location, Point.zero());
            assert.deepEqual(taffy.layout(innerCells[0]).size, new Size(20, 3));
            assert.deepEqual(taffy.layout(innerCells[1]).location, new Point(rtl ? -2 : 20, 0));
            assert.deepEqual(taffy.layout(innerCells[1]).size, new Size(2, 3));
            assert.deepEqual(taffy.layout(innerCells[2]).location, new Point(0, 3));
            assert.deepEqual(taffy.layout(innerCells[2]).size, new Size(20, 1));
            assert.deepEqual(taffy.layout(innerCells[3]).location, new Point(rtl ? -2 : 20, 3));
            assert.deepEqual(taffy.layout(innerCells[3]).size, new Size(2, 1));
        }
    }
});
test("flex container content size includes trailing padding", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        alignItems: AlignItems.Start,
        padding: new Rect(LengthPercentage.length(5), LengthPercentage.length(7), LengthPercentage.length(3), LengthPercentage.length(11)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).location, new Point(5, 3));
    assert.deepEqual(taffy.layout(root).contentSize, new Size(32, 34));
});
test("Rust XML percentage padding resolves vertical and horizontal sides from container width", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(10), Dimension.length(10)),
    }));
    const child = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        flexDirection: FlexDirection.Column,
        flexGrow: 1,
        padding: Rect.percent(0.1, LengthPercentage),
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        flexDirection: FlexDirection.Column,
        size: new Size(Dimension.length(200), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 100));
    assert.deepEqual(taffy.layout(child).size, new Size(200, 100));
    assert.deepEqual(taffy.layout(grandchild).location, new Point(170, 20));
    assert.deepEqual(taffy.layout(grandchild).size, new Size(10, 10));
});
test("Rust XML margin and stretch row subtracts vertical margins from stretched child", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        flexGrow: 1,
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).location, new Point(0, 10));
    assert.deepEqual(taffy.layout(child).size, new Size(100, 80));
});
test("Rust XML content-sized flex container includes child size and border", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(10), Dimension.length(10)),
    }));
    const ten = LengthPercentage.length(10);
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        border: new Rect(ten, ten, ten, ten),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(30, 30));
    assert.deepEqual(taffy.layout(child).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(child).size, new Size(10, 10));
});
test("Rust XML unsized flex child stretches in the cross axis with zero main size", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ direction: Direction.Ltr }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, new Size(0, 100));
});
test("Rust XML align-content center single line shrinks items on the main axis", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    });
    const children = Array.from({ length: 6 }, () => taffy.newLeaf(childStyle));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignContent: AlignContent.Center,
        size: new Size(Dimension.length(120), Dimension.length(100)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 100));
    children.forEach((child, index) => {
        assert.deepEqual(taffy.layout(child).location, new Point(index * 20, 0));
        assert.deepEqual(taffy.layout(child).size, new Size(20, 10));
    });
});
test("Rust XML align-content center wrapped lines are centered in cross space", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    });
    const children = Array.from({ length: 6 }, () => taffy.newLeaf(childStyle));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        flexWrap: FlexWrap.Wrap,
        alignContent: AlignContent.Center,
        size: new Size(Dimension.length(120), Dimension.length(100)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(120, 100));
    const expectedLocations = [
        new Point(0, 35),
        new Point(50, 35),
        new Point(0, 45),
        new Point(50, 45),
        new Point(0, 55),
        new Point(50, 55),
    ];
    children.forEach((child, index) => {
        assert.deepEqual(taffy.layout(child).location, expectedLocations[index]);
        assert.deepEqual(taffy.layout(child).size, new Size(50, 10));
    });
});
test("Rust XML align-content flex-start keeps zero-height column children on the same line", () => {
    const taffy = TaffyTree.new();
    const children = [
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.auto()),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(10)),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.auto()),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.length(10)),
        })),
        taffy.newLeaf(new Style({
            direction: Direction.Ltr,
            size: new Size(Dimension.length(50), Dimension.auto()),
        })),
    ];
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.Wrap,
        alignContent: AlignContent.FlexStart,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), children);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    const expectedLocations = [
        new Point(0, 0),
        new Point(0, 0),
        new Point(0, 10),
        new Point(0, 10),
        new Point(0, 20),
    ];
    const expectedSizes = [
        new Size(50, 0),
        new Size(50, 10),
        new Size(50, 0),
        new Size(50, 10),
        new Size(50, 0),
    ];
    children.forEach((child, index) => {
        assert.deepEqual(taffy.layout(child).location, expectedLocations[index]);
        assert.deepEqual(taffy.layout(child).size, expectedSizes[index]);
    });
});
test("rtl flex container content size mirrors in-flow child contribution", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(50)),
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(root).contentSize, new Size(20, 20));
});
test("in-flow flex item lays out its own children during final layout", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const child = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(40), Dimension.length(30)),
        alignItems: AlignItems.Start,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).size, new Size(40, 30));
    assert.deepEqual(taffy.layout(grandchild).location, Point.zero());
    assert.deepEqual(taffy.layout(grandchild).size, new Size(10, 10));
});
test("row flex item applies aspect ratio to max-height before clamping", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        maxSize: new Size(Dimension.auto(), Dimension.length(20)),
        aspectRatio: 2,
    }));
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), () => new Size(100, 20));
    assert.deepEqual(taffy.layout(child).size, new Size(40, 20));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
});
test("column flex lays children along the vertical main axis", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(20)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(40)) }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        gap: new Size(LengthPercentage.zero(), LengthPercentage.length(5)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(30, 65));
    assert.equal(taffy.layout(child0).location.x, 0);
    assert.equal(taffy.layout(child0).location.y, 0);
    assert.equal(taffy.layout(child1).location.x, 0);
    assert.equal(taffy.layout(child1).location.y, 25);
});
test("row flex direction respects rtl physical main axis", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(90, 0));
    assert.deepEqual(taffy.layout(child1).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(child2).location, new Point(70, 0));
});
test("rtl flex container reserves vertical scrollbar gutter on the inline start edge", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        overflow: new Point(Overflow.Visible, Overflow.Scroll),
        scrollbarWidth: 10,
        size: new Size(Dimension.length(100), Dimension.length(50)),
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(10, 0));
    assert.deepEqual(taffy.layout(child).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(child).size, new Size(20, 10));
});
test("Rust XML flex scrollbars take up space in the main axis", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        flexGrow: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Visible),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(0, 15));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, new Size(50, 35));
});
test("Rust XML flex scrollbars take up space in the cross axis", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        flexGrow: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Visible, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(15, 0));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, new Size(35, 50));
});
test("Rust XML flex scrollbars are overridden by explicit container size", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        flexGrow: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        size: new Size(Dimension.length(2), Dimension.length(4)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(2, 4));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(15, 15));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, Size.zero());
});
test("Rust XML flex scrollbars are overridden by available space", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        flexGrow: 1,
    }));
    const child = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        flexGrow: 1,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
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
test("Rust XML flex scrollbars are overridden by max size", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        flexGrow: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Ltr,
        overflow: new Point(Overflow.Scroll, Overflow.Scroll),
        scrollbarWidth: 15,
        maxSize: new Size(Dimension.length(2), Dimension.length(4)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(2, 4));
    assert.deepEqual(taffy.layout(root).scrollbarSize, new Size(15, 15));
    assert.deepEqual(taffy.layout(child).location, Point.zero());
    assert.deepEqual(taffy.layout(child).size, Size.zero());
});
test("relative flex child insets offset layout without affecting flow", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(7), LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(3)),
    }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.length(40)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(7, -3));
    assert.deepEqual(taffy.layout(child1).location, new Point(20, 0));
});
test("relative flex child uses right inset precedence in rtl", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(7), LengthPercentageAuto.length(3), LengthPercentageAuto.length(2), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.length(40)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).location, new Point(77, 2));
});
test("row-reverse flex direction places flex-start at the physical right edge", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.RowReverse,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(90, 0));
    assert.deepEqual(taffy.layout(child1).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(child2).location, new Point(70, 0));
});
test("row-reverse flex direction is un-reversed by rtl direction", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.auto()) }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        flexDirection: FlexDirection.RowReverse,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(0, 0));
    assert.deepEqual(taffy.layout(child1).location, new Point(10, 0));
    assert.deepEqual(taffy.layout(child2).location, new Point(20, 0));
});
test("column flex direction respects rtl horizontal cross axis", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        flexDirection: FlexDirection.Column,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child0).location, new Point(90, 0));
    assert.deepEqual(taffy.layout(child1).location, new Point(90, 10));
});
test("row flex-wrap splits children into multiple lines", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({ size: new Size(Dimension.length(40), Dimension.length(10)) });
    const child0 = taffy.newLeaf(childStyle);
    const child1 = taffy.newLeaf(childStyle);
    const child2 = taffy.newLeaf(childStyle);
    const root = taffy.newWithChildren(new Style({
        flexWrap: FlexWrap.Wrap,
        size: new Size(Dimension.length(100), Dimension.auto()),
        alignItems: AlignItems.Start,
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 20));
    assert.equal(taffy.layout(child0).location.x, 0);
    assert.equal(taffy.layout(child0).location.y, 0);
    assert.equal(taffy.layout(child1).location.x, 40);
    assert.equal(taffy.layout(child1).location.y, 0);
    assert.equal(taffy.layout(child2).location.x, 0);
    assert.equal(taffy.layout(child2).location.y, 10);
});
test("row flex-wrap applies row and column gaps between items and lines", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({ size: new Size(Dimension.length(40), Dimension.length(10)) });
    const child0 = taffy.newLeaf(childStyle);
    const child1 = taffy.newLeaf(childStyle);
    const child2 = taffy.newLeaf(childStyle);
    const root = taffy.newWithChildren(new Style({
        flexWrap: FlexWrap.Wrap,
        size: new Size(Dimension.length(90), Dimension.auto()),
        gap: new Size(LengthPercentage.length(5), LengthPercentage.length(3)),
        alignItems: AlignItems.Start,
    }), [child0, child1, child2]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(90, 23));
    assert.equal(taffy.layout(child1).location.x, 45);
    assert.equal(taffy.layout(child2).location.x, 0);
    assert.equal(taffy.layout(child2).location.y, 13);
});
test("wrapped lines stretch across definite cross size", () => {
    const taffy = TaffyTree.new();
    const childStyle = new Style({
        minSize: new Size(Dimension.length(60), Dimension.auto()),
        flexGrow: 1,
    });
    const child0 = taffy.newLeaf(childStyle);
    const child1 = taffy.newLeaf(childStyle);
    const child2 = taffy.newLeaf(childStyle);
    const child3 = taffy.newLeaf(childStyle);
    const child4 = taffy.newLeaf(childStyle);
    const root = taffy.newWithChildren(new Style({
        flexWrap: FlexWrap.Wrap,
        alignContent: AlignContent.Stretch,
        size: new Size(Dimension.length(300), Dimension.length(300)),
        gap: new Size(LengthPercentage.length(5), LengthPercentage.zero()),
    }), [child0, child1, child2, child3, child4]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(300, 300));
    assert.deepEqual(taffy.layout(child0).size, new Size(71, 150));
    assert.deepEqual(taffy.layout(child1).size, new Size(72, 150));
    assert.deepEqual(taffy.layout(child2).size, new Size(71, 150));
    assert.deepEqual(taffy.layout(child3).size, new Size(71, 150));
    assert.deepEqual(taffy.layout(child4).size, new Size(300, 150));
    assert.equal(taffy.layout(child4).location.y, 150);
});
test("wrap-reverse places later row lines before earlier row lines in the cross axis", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(31), Dimension.length(30)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(32), Dimension.length(30)) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(33), Dimension.length(30)) }));
    const child3 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(34), Dimension.length(30)) }));
    const root = taffy.newWithChildren(new Style({
        flexWrap: FlexWrap.WrapReverse,
        size: new Size(Dimension.length(100), Dimension.auto()),
        alignItems: AlignItems.Start,
    }), [child0, child1, child2, child3]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 60));
    assert.equal(taffy.layout(child0).location.y, 30);
    assert.equal(taffy.layout(child1).location.y, 30);
    assert.equal(taffy.layout(child2).location.y, 30);
    assert.equal(taffy.layout(child3).location.y, 0);
});
test("column flex-wrap splits children into multiple columns", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(31)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(32)) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(33)) }));
    const child3 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(34)) }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.Wrap,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1, child2, child3]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.equal(taffy.layout(child0).location.x, 0);
    assert.equal(taffy.layout(child0).location.y, 0);
    assert.equal(taffy.layout(child1).location.y, 31);
    assert.equal(taffy.layout(child2).location.y, 63);
    assert.equal(taffy.layout(child3).location.x, 50);
    assert.equal(taffy.layout(child3).location.y, 0);
});
test("wrap-reverse column places earlier columns at the far cross edge", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(31)) }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(32)) }));
    const child2 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(33)) }));
    const child3 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(30), Dimension.length(34)) }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.WrapReverse,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child0, child1, child2, child3]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.equal(taffy.layout(child0).location.x, 70);
    assert.equal(taffy.layout(child1).location.x, 70);
    assert.equal(taffy.layout(child2).location.x, 70);
    assert.equal(taffy.layout(child3).location.x, 20);
});
test("align-items start prevents stretch in fixed-height row container", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(child).size, new Size(20, 20));
    assert.equal(taffy.layout(child).location.x, 0);
    assert.equal(taffy.layout(child).location.y, 0);
});
test("row flex baseline alignment offsets shorter items to the shared baseline", () => {
    const taffy = TaffyTree.new();
    const short = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const tall = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(40)) }));
    const root = taffy.newWithChildren(new Style({ alignItems: AlignItems.Baseline }), [short, tall]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 40));
    assert.deepEqual(taffy.layout(short).location, new Point(0, 20));
    assert.deepEqual(taffy.layout(tall).location, new Point(20, 0));
});
test("row flex baseline alignment uses nested flex container first baseline", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(40)) }));
    const nestedChild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const nested = taffy.newWithChildren(new Style({
        padding: new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({ alignItems: AlignItems.Baseline }), [
        tall,
        nested,
    ]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 60));
    assert.deepEqual(taffy.layout(tall).location, Point.zero());
    assert.deepEqual(taffy.layout(nested).location, new Point(20, 20));
    assert.deepEqual(taffy.layout(nested).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
});
test("row flex baseline alignment uses nested grid container first baseline", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(40)) }));
    const nestedChild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(20), Dimension.length(40)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({ alignItems: AlignItems.Baseline }), [
        tall,
        nested,
    ]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(40, 60));
    assert.deepEqual(taffy.layout(tall).location, Point.zero());
    assert.deepEqual(taffy.layout(nested).location, new Point(20, 20));
    assert.deepEqual(taffy.layout(nested).size, new Size(20, 40));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
});
test("Rust XML block baseline alignment uses block child fallback baselines", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, Point.zero());
    assert.deepEqual(taffy.layout(tall).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 30));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment preserves block child margins", () => {
    const taffy = TaffyTree.new();
    const allFive = new Rect(LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5), LengthPercentageAuto.length(5));
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: allFive,
    }));
    const nestedChild = taffy.newLeaf(new Style({
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
        margin: allFive,
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(tall).size, new Size(40, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 35));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment resolves percent margins against inline size", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.percent(0.01), LengthPercentageAuto.percent(0.01), LengthPercentageAuto.percent(0.01), LengthPercentageAuto.percent(0.01)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(tall).size, new Size(40, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 35));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, new Point(1, 1));
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment preserves padding offsets", () => {
    const taffy = TaffyTree.new();
    const allFive = Rect.length(5, LengthPercentage);
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
        padding: allFive,
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: allFive,
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(tall).size, new Size(40, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(45, 35));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment applies relative top to first block child", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto()),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, new Point(0, 10));
    assert.deepEqual(taffy.layout(tall).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 30));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment applies relative top to second block child", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.length(5), LengthPercentageAuto.auto()),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, Point.zero());
    assert.deepEqual(taffy.layout(tall).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 35));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment supports double-nested block children", () => {
    const taffy = TaffyTree.new();
    const tallChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }));
    const tall = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }), [tallChild]);
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(15)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Ltr,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Ltr,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, Point.zero());
    assert.deepEqual(taffy.layout(tall).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(tallChild).location, Point.zero());
    assert.deepEqual(taffy.layout(tallChild).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nested).location, new Point(50, 30));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 15));
});
test("Rust XML block baseline alignment mirrors fallback baselines in rtl", () => {
    const taffy = TaffyTree.new();
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(20)),
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(tall).location, new Point(50, 0));
    assert.deepEqual(taffy.layout(tall).size, new Size(50, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(0, 30));
    assert.deepEqual(taffy.layout(nested).size, new Size(50, 20));
    assert.deepEqual(taffy.layout(nestedChild).location, Point.zero());
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("Rust XML block baseline alignment handles content-box padding in rtl", () => {
    const taffy = TaffyTree.new();
    const allFive = Rect.length(5, LengthPercentage);
    const tall = taffy.newLeaf(new Style({
        display: Display.Block,
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const nestedChild = taffy.newLeaf(new Style({
        display: Display.Block,
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(10)),
    }));
    const nested = taffy.newWithChildren(new Style({
        display: Display.Block,
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(20)),
        padding: allFive,
    }), [nestedChild]);
    const root = taffy.newWithChildren(new Style({
        boxSizing: BoxSizing.ContentBox,
        direction: Direction.Rtl,
        alignItems: AlignItems.Baseline,
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: allFive,
    }), [tall, nested]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(110, 110));
    assert.deepEqual(taffy.layout(tall).location, new Point(65, 5));
    assert.deepEqual(taffy.layout(tall).size, new Size(40, 50));
    assert.deepEqual(taffy.layout(nested).location, new Point(5, 25));
    assert.deepEqual(taffy.layout(nested).size, new Size(60, 30));
    assert.deepEqual(taffy.layout(nestedChild).location, new Point(5, 5));
    assert.deepEqual(taffy.layout(nestedChild).size, new Size(50, 10));
});
test("root padding and border larger than definite size floors flex container size", () => {
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
test("flex-basis overrides row main size", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(10), Dimension.length(10)),
        flexBasis: Dimension.length(30),
    }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({ alignItems: AlignItems.Start }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(root).size.width, 40);
    assert.equal(taffy.layout(child0).size.width, 30);
    assert.equal(taffy.layout(child1).location.x, 30);
});
test("flex-basis overrides column main size", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(10), Dimension.length(10)),
        flexBasis: Dimension.length(30),
    }));
    const child1 = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({ flexDirection: FlexDirection.Column, alignItems: AlignItems.Start }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(root).size.height, 40);
    assert.equal(taffy.layout(child0).size.height, 30);
    assert.equal(taffy.layout(child1).location.y, 30);
});
test("flex grow redistributes remaining space after max-size clamp", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        maxSize: new Size(Dimension.length(30), Dimension.auto()),
        flexGrow: 1,
    }));
    const child1 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        flexGrow: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(10)),
        alignItems: AlignItems.Start,
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child0).size.width, 30);
    assert.equal(taffy.layout(child1).size.width, 70);
    assert.equal(taffy.layout(child1).location.x, 30);
});
test("flex grow remeasures auto cross size from the grown main size", () => {
    const taffy = TaffyTree.new();
    const fixed = taffy.newLeaf(new Style({ size: new Size(Dimension.length(50), Dimension.length(50)) }));
    const measured = taffy.newLeafWithContext(new Style({ flexGrow: 1 }), { aspect: 2 });
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [fixed, measured]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (known, _available, _node, context) => {
        if (known.width !== undefined && known.height !== undefined)
            return new Size(known.width, known.height);
        const width = known.width ?? 10;
        return new Size(width, known.height ?? width * (context?.aspect ?? 1));
    });
    assert.deepEqual(taffy.layout(measured).size, new Size(50, 100));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 100));
});
test("flex shrink respects measured automatic minimum main size", () => {
    const taffy = TaffyTree.new();
    const fixed = taffy.newLeaf(new Style({
        flexShrink: 0,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const measured = taffy.newLeafWithContext(Style.default(), { width: 100, aspect: 2 });
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [fixed, measured]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (known, _available, _node, context) => {
        if (known.width !== undefined && known.height !== undefined)
            return new Size(known.width, known.height);
        const width = known.width ?? context?.width ?? 0;
        return new Size(width, known.height ?? width * (context?.aspect ?? 1));
    });
    assert.deepEqual(taffy.layout(measured).size, new Size(100, 200));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 200));
});
test("flex-basis does not lower measured automatic minimum main size", () => {
    const taffy = TaffyTree.new();
    const fixed = taffy.newLeaf(new Style({
        flexShrink: 0,
        size: new Size(Dimension.length(80), Dimension.length(20)),
    }));
    const measured = taffy.newLeafWithContext(new Style({
        flexBasis: Dimension.length(50),
    }), { width: 100, aspect: 2 });
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Start,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [fixed, measured]);
    taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), (known, _available, _node, context) => {
        if (known.width !== undefined && known.height !== undefined)
            return new Size(known.width, known.height);
        const width = known.width ?? context?.width ?? 0;
        return new Size(width, known.height ?? width * (context?.aspect ?? 1));
    });
    assert.deepEqual(taffy.layout(measured).size, new Size(100, 200));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 200));
});
test("flex automatic minimum uses stretched definite available cross size", () => {
    const taffy = TaffyTree.new();
    const fixed = taffy.newLeaf(new Style({
        flexShrink: 0,
        size: new Size(Dimension.length(80), Dimension.length(20)),
    }));
    const measured = taffy.newLeafWithContext(new Style({
        flexBasis: Dimension.length(50),
    }), { fallbackWidth: 10 });
    const root = taffy.newWithChildren(new Style({
        alignItems: AlignItems.Stretch,
        size: new Size(Dimension.length(100), Dimension.auto()),
    }), [fixed, measured]);
    taffy.computeLayoutWithMeasure(root, new Size(AvailableSpace.maxContent(), AvailableSpace.definite(100)), (known, _available, _node, context) => {
        if (known.width !== undefined && known.height !== undefined)
            return new Size(known.width, known.height);
        const width = known.width ?? known.height ?? context?.fallbackWidth ?? 0;
        return new Size(width, known.height ?? 20);
    });
    assert.deepEqual(taffy.layout(measured).size, new Size(100, 20));
    assert.deepEqual(taffy.layout(root).size, new Size(100, 20));
});
test("flex shrink redistributes negative space after min-size clamp", () => {
    const taffy = TaffyTree.new();
    const child0 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(40), Dimension.length(10)),
        minSize: new Size(Dimension.length(30), Dimension.auto()),
        flexShrink: 1,
    }));
    const child1 = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(40), Dimension.length(10)),
        flexShrink: 1,
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(50), Dimension.length(10)),
        alignItems: AlignItems.Start,
    }), [child0, child1]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child0).size.width, 30);
    assert.equal(taffy.layout(child1).size.width, 20);
    assert.equal(taffy.layout(child1).location.x, 30);
});
test("main-axis auto margin consumes free space before justify-content", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(10)),
        justifyContent: AlignContent.Center,
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).location.x, 80);
    assert.equal(taffy.layout(child).margin.left, 80);
});
test("opposing row auto margins split free space equally", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(10)),
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).location.x, 40);
    assert.equal(taffy.layout(child).margin.left, 40);
    assert.equal(taffy.layout(child).margin.right, 40);
});
test("cross-axis auto margin consumes free space before align-items", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        alignItems: AlignItems.Start,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).location.y, 90);
    assert.equal(taffy.layout(child).margin.top, 90);
});
test("opposing cross-axis auto margins center the item and prevent stretch", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.auto()),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        alignItems: AlignItems.Stretch,
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).size.height, 0);
    assert.equal(taffy.layout(child).location.y, 50);
    assert.equal(taffy.layout(child).margin.top, 50);
    assert.equal(taffy.layout(child).margin.bottom, 50);
});
test("Rust XML taffy issue 937 keeps RTL gapped row items packed with auto cross margin", () => {
    const taffy = TaffyTree.new();
    const first = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto()),
    }));
    const second = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const third = taffy.newLeaf(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(50), Dimension.length(50)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(200), Dimension.length(200)),
        gap: new Size(LengthPercentage.length(10), LengthPercentage.length(10)),
    }), [first, second, third]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(200, 200));
    assert.deepEqual(taffy.layout(first).location, new Point(150, 0));
    assert.deepEqual(taffy.layout(second).location, new Point(90, 0));
    assert.deepEqual(taffy.layout(third).location, new Point(30, 0));
});
test("Rust XML flex column-gap child margins share remaining row space", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const childStyle = (margin: number) => new Style({
                boxSizing,
                direction,
                flexGrow: 1,
                flexBasis: Dimension.percent(0),
                margin: new Rect(LengthPercentageAuto.length(margin), LengthPercentageAuto.length(margin), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
            });
            const first = taffy.newLeaf(childStyle(2));
            const second = taffy.newLeaf(childStyle(10));
            const third = taffy.newLeaf(childStyle(15));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(80), Dimension.length(100)),
                gap: new Size(LengthPercentage.length(10), LengthPercentage.zero()),
            }), [first, second, third]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).size, new Size(80, 100));
            assert.deepEqual(taffy.layout(first).location, new Point(direction === Direction.Ltr ? 2 : 76, 0));
            assert.deepEqual(taffy.layout(first).size, new Size(2, 100));
            assert.deepEqual(taffy.layout(second).location, new Point(direction === Direction.Ltr ? 26 : 52, 0));
            assert.deepEqual(taffy.layout(second).size, new Size(2, 100));
            assert.deepEqual(taffy.layout(third).location, new Point(direction === Direction.Ltr ? 63 : 15, 0));
            assert.deepEqual(taffy.layout(third).size, new Size(2, 100));
        }
    }
});
test("Rust XML flex row-gap child margins share remaining column space", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const childStyle = (margin: number) => new Style({
                boxSizing,
                direction,
                flexGrow: 1,
                flexBasis: Dimension.percent(0),
                margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(margin), LengthPercentageAuto.length(margin)),
            });
            const first = taffy.newLeaf(childStyle(2));
            const second = taffy.newLeaf(childStyle(10));
            const third = taffy.newLeaf(childStyle(15));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                flexDirection: FlexDirection.Column,
                size: new Size(Dimension.length(100), Dimension.length(200)),
                gap: new Size(LengthPercentage.zero(), LengthPercentage.length(10)),
            }), [first, second, third]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            assert.deepEqual(taffy.layout(root).size, new Size(100, 200));
            assert.deepEqual(taffy.layout(first).location, new Point(0, 2));
            assert.deepEqual(taffy.layout(first).size, new Size(100, 42));
            assert.deepEqual(taffy.layout(second).location, new Point(0, 66));
            assert.deepEqual(taffy.layout(second).size, new Size(100, 42));
            assert.deepEqual(taffy.layout(third).location, new Point(0, 143));
            assert.deepEqual(taffy.layout(third).size, new Size(100, 42));
        }
    }
});
test("Rust XML flex wrapped row-gap child margins size wrapped lines", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        for (const direction of [Direction.Ltr, Direction.Rtl]) {
            const taffy = TaffyTree.new();
            const childStyle = (margin: number) => new Style({
                boxSizing,
                direction,
                size: new Size(Dimension.length(60), Dimension.auto()),
                margin: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(margin), LengthPercentageAuto.length(margin)),
            });
            const first = taffy.newLeaf(childStyle(2));
            const second = taffy.newLeaf(childStyle(10));
            const third = taffy.newLeaf(childStyle(15));
            const root = taffy.newWithChildren(new Style({
                boxSizing,
                direction,
                flexWrap: FlexWrap.Wrap,
                size: new Size(Dimension.length(100), Dimension.length(200)),
                gap: new Size(LengthPercentage.zero(), LengthPercentage.length(10)),
            }), [first, second, third]);
            taffy.computeLayout(root, AvailableSpaceSize.maxContent());
            const childX = direction === Direction.Ltr ? 0 : 40;
            assert.deepEqual(taffy.layout(root).size, new Size(100, 200));
            assert.deepEqual(taffy.layout(first).location, new Point(childX, 2));
            assert.deepEqual(taffy.layout(first).size, new Size(60, 42));
            assert.deepEqual(taffy.layout(second).location, new Point(childX, 66));
            assert.deepEqual(taffy.layout(second).size, new Size(60, 42));
            assert.deepEqual(taffy.layout(third).location, new Point(childX, 143));
            assert.deepEqual(taffy.layout(third).size, new Size(60, 42));
        }
    }
});
test("column cross-axis auto margins split horizontal free space", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [child]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(child).location.x, 40);
    assert.equal(taffy.layout(child).margin.left, 40);
    assert.equal(taffy.layout(child).margin.right, 40);
});
test("absolute flex child with start/top insets is laid out out of flow", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto()),
    }));
    const normal = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(20)) }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        alignItems: AlignItems.Start,
    }), [absolute, normal]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(root).size.width, 100);
    assert.equal(taffy.layout(normal).location.x, 0);
    assert.equal(taffy.layout(absolute).location.x, 10);
    assert.equal(taffy.layout(absolute).location.y, 10);
    assert.equal(taffy.layout(absolute).size.width, 10);
    assert.equal(taffy.layout(absolute).size.height, 10);
});
test("absolute flex container lays out its own children", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const absolute = taffy.newWithChildren(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(40), Dimension.length(30)),
        alignItems: AlignItems.Start,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).size, new Size(40, 30));
    assert.deepEqual(taffy.layout(grandchild).location, Point.zero());
    assert.deepEqual(taffy.layout(grandchild).size, new Size(10, 10));
});
test("absolute flex container lays descendants with containing content box as parent size", () => {
    const taffy = TaffyTree.new();
    const grandchild = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const absolute = taffy.newWithChildren(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(40), Dimension.length(30)),
        padding: new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.percent(0.1), LengthPercentage.zero()),
        alignItems: AlignItems.Start,
    }), [grandchild]);
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.zero(), LengthPercentage.zero()),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(grandchild).location, new Point(0, 8));
});
test("absolute flex child without insets uses static center alignment", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(60), Dimension.length(40)),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(110), Dimension.length(100)),
        justifyContent: AlignContent.Center,
        alignItems: AlignItems.Center,
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(absolute).location.x, 25);
    assert.equal(taffy.layout(absolute).location.y, 30);
    assert.equal(taffy.layout(absolute).size.width, 60);
    assert.equal(taffy.layout(absolute).size.height, 40);
});
test("absolute flex child without insets uses rtl flex-start on the physical right edge", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(80, 0));
});
test("absolute flex child in a column uses justify-content on the vertical axis", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        justifyContent: AlignContent.FlexEnd,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 80));
});
test("absolute flex child in a column uses align-items on the horizontal axis", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        flexDirection: FlexDirection.Column,
        alignItems: AlignItems.Center,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 0));
});
test("absolute flex child in wrap-reverse row uses the reversed cross-axis flex-start", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        flexWrap: FlexWrap.WrapReverse,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 80));
});
test("absolute flex child in wrap-reverse rtl column uses physical left cross-axis flex-start", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        flexDirection: FlexDirection.Column,
        flexWrap: FlexWrap.WrapReverse,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 0));
});
test("absolute flex child with end/bottom insets is placed from far edges", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(20)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.length(15), LengthPercentageAuto.auto(), LengthPercentageAuto.length(25)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(absolute).location.x, 75);
    assert.equal(taffy.layout(absolute).location.y, 55);
});
test("absolute flex child with both horizontal insets prefers the right edge in rtl", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(80, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(10, 10));
});
test("absolute flex child insets are positioned from the border edge", () => {
    const taffy = TaffyTree.new();
    const ten = LengthPercentage.length(10);
    const start = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        inset: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto()),
    }));
    const end = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(50), Dimension.length(50)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: new Rect(ten, ten, ten, ten),
        border: new Rect(ten, ten, ten, ten),
    }), [start, end]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(start).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(end).location, new Point(40, 40));
});
test("absolute flex child opposing horizontal auto margins split free space", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 0));
    assert.equal(taffy.layout(absolute).margin.left, 40);
    assert.equal(taffy.layout(absolute).margin.right, 40);
});
test("absolute flex child single auto margin consumes free space before static alignment", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(10)),
        margin: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(80, 0));
    assert.equal(taffy.layout(absolute).margin.left, 80);
});
test("absolute flex child with opposing insets fills available size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(80, 80));
});
test("absolute flex child opposing insets fill the padding box", () => {
    const taffy = TaffyTree.new();
    const ten = LengthPercentage.length(10);
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        inset: new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero()),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        padding: new Rect(ten, ten, ten, ten),
        border: new Rect(ten, ten, ten, ten),
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(80, 80));
});
test("absolute flex child explicit size overrides opposing insets", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(10), Dimension.length(10)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(10, 10));
});
test("absolute flex child uses aspect ratio after filling height from vertical insets", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.3), LengthPercentageAuto.percent(0.5)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(400), Dimension.length(300)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 90));
    assert.deepEqual(taffy.layout(absolute).size, new Size(180, 60));
});
test("absolute flex child uses aspect ratio after filling width from horizontal insets", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(400), Dimension.length(300)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(320, 107));
});
test("absolute flex child explicit width overrides inset width before aspect ratio", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.percent(0.4), Dimension.auto()),
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.1), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.auto()),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(400), Dimension.length(300)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(160, 53));
});
test("absolute flex child explicit height overrides inset height before aspect ratio", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.auto(), Dimension.percent(0.1)),
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.percent(0.3), LengthPercentageAuto.percent(0.5)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(400), Dimension.length(300)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(0, 90));
    assert.deepEqual(taffy.layout(absolute).size, new Size(90, 30));
});
test("absolute flex child aspect ratio overrides full vertical inset after width fill", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        aspectRatio: 3,
        inset: new Rect(LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05), LengthPercentageAuto.percent(0.05)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(400), Dimension.length(300)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(20, 15));
    assert.deepEqual(taffy.layout(absolute).size, new Size(360, 120));
});
test("absolute flex child opposing min and max use min as the definite size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        minSize: new Size(Dimension.length(50), Dimension.length(60)),
        maxSize: new Size(Dimension.length(40), Dimension.length(30)),
        inset: new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.length(10), LengthPercentageAuto.auto(), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(40, 30));
    assert.deepEqual(taffy.layout(absolute).size, new Size(50, 60));
});
test("absolute flex child min size floors to padding and border", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(5), Dimension.length(5)),
        padding: new Rect(LengthPercentage.length(10), LengthPercentage.length(10), LengthPercentage.length(12), LengthPercentage.length(8)),
        border: new Rect(LengthPercentage.length(2), LengthPercentage.length(3), LengthPercentage.length(4), LengthPercentage.length(6)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).size, new Size(25, 30));
    assert.deepEqual(taffy.layout(absolute).padding, new Rect(10, 10, 12, 8));
    assert.deepEqual(taffy.layout(absolute).border, new Rect(2, 3, 4, 6));
});
test("absolute flex child inset-derived size is clamped by max size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        maxSize: new Size(Dimension.length(40), Dimension.length(30)),
        inset: new Rect(LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10), LengthPercentageAuto.length(10)),
    }));
    const root = taffy.newWithChildren(new Style({ size: new Size(Dimension.length(100), Dimension.length(100)) }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(10, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(40, 30));
});
test("absolute flex child does not contribute to max-content container size", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }));
    const normal = taffy.newLeaf(new Style({ size: new Size(Dimension.length(20), Dimension.length(10)) }));
    const root = taffy.newWithChildren(new Style({ alignItems: AlignItems.Start }), [
        absolute,
        normal,
    ]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(root).size, new Size(20, 10));
    assert.deepEqual(taffy.layout(absolute).size, new Size(100, 100));
    assert.deepEqual(taffy.layout(normal).size, new Size(20, 10));
});
test("flex hidden children keep source layout order", () => {
    const taffy = TaffyTree.new();
    const inFlow = taffy.newLeaf(new Style({ size: new Size(Dimension.length(10), Dimension.length(10)) }));
    const hidden = taffy.newLeaf(new Style({
        display: Display.None,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(30), Dimension.length(30)),
    }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
    }), [inFlow, hidden, absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.equal(taffy.layout(inFlow).order, 0);
    assert.equal(taffy.layout(hidden).order, 1);
    assert.equal(taffy.layout(absolute).order, 2);
    assert.deepEqual(taffy.layout(hidden).size, Size.zero());
});
test("rtl absolute flex child content size contribution is mirrored", () => {
    const taffy = TaffyTree.new();
    const absolute = taffy.newLeaf(new Style({
        position: Position.Absolute,
        size: new Size(Dimension.length(20), Dimension.length(20)),
    }));
    const root = taffy.newWithChildren(new Style({
        direction: Direction.Rtl,
        size: new Size(Dimension.length(100), Dimension.length(50)),
        alignItems: AlignItems.Start,
    }), [absolute]);
    taffy.computeLayout(root, AvailableSpaceSize.maxContent());
    assert.deepEqual(taffy.layout(absolute).location, new Point(80, 0));
    assert.deepEqual(taffy.layout(root).contentSize, new Size(20, 20));
});
