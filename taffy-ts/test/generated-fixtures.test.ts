import assert from "node:assert/strict";
import test from "node:test";
import {
    AlignContent,
    AlignItems,
    AvailableSpace,
    AvailableSpaceSize,
    BoxSizing,
    Dimension,
    Display,
    LengthPercentage,
    LengthPercentageAuto,
    Point,
    Rect,
    Size,
    Style,
    TaffyTree,
    gridTemplateComponentLength,
} from "../src/index.js";
import type {
    AvailableSpaceValue,
    GridTemplateComponent,
    NodeId,
} from "../src/index.js";

type AxisName = "width" | "height";
type DimensionInput = number | "auto";
type WritingMode = "horizontal" | "vertical";
type AhemTextContext = { type: "ahemText"; text: string; writingMode: WritingMode };
type TestNodeContext = AhemTextContext | undefined;

test("upstream generated fixture: leaf/leaf_with_content_and_padding_border.rs", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        const taffy = TaffyTree.new();
        const node = taffy.newLeafWithContext(
            new Style({
                boxSizing,
                padding: lpRect(8, 4, 2, 6),
                border: lpRect(7, 3, 1, 5),
            }),
            ahemText("HHHH", "horizontal"),
        );

        taffy.computeLayoutWithMeasure(node, AvailableSpaceSize.maxContent(), testMeasureFunction);

        assertLayout(taffy, node, 0, 0, 62, 24);
    }
});

test("upstream generated fixture: flex/gap_column_gap_determines_parent_width.rs", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        const taffy = TaffyTree.new();
        const node0 = taffy.newLeaf(new Style({ boxSizing, size: dimSize(10, "auto") }));
        const node1 = taffy.newLeaf(new Style({ boxSizing, size: dimSize(20, "auto") }));
        const node2 = taffy.newLeaf(new Style({ boxSizing, size: dimSize(30, "auto") }));
        const root = taffy.newWithChildren(
            new Style({
                boxSizing,
                alignItems: AlignItems.Stretch,
                gap: new Size(LengthPercentage.length(10), LengthPercentage.zero()),
                size: dimSize("auto", 100),
            }),
            [node0, node1, node2],
        );

        taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), testMeasureFunction);

        assertLayout(taffy, root, 0, 0, 80, 100);
        assertLayout(taffy, node0, 0, 0, 10, 100);
        assertLayout(taffy, node1, 20, 0, 20, 100);
        assertLayout(taffy, node2, 50, 0, 30, 100);
    }
});

test("upstream generated fixture: block/block_margin_y_sibling_collapse_positive_and_negative.rs", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        const taffy = TaffyTree.new();
        const children = [
            blockLeaf(taffy, boxSizing, 10, 10),
            blockLeaf(taffy, boxSizing, -10, 10),
            blockLeaf(taffy, boxSizing, -5, 5),
            blockLeaf(taffy, boxSizing, -10, -10),
            blockLeaf(taffy, boxSizing, 10, -10),
            blockLeaf(taffy, boxSizing, 5, -5),
            blockLeaf(taffy, boxSizing, 10, 10),
        ];
        const root = taffy.newWithChildren(
            new Style({
                boxSizing,
                display: Display.Block,
                size: dimSize(50, "auto"),
            }),
            children,
        );

        taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), testMeasureFunction);

        assertLayout(taffy, root, 0, 0, 50, 90);
        [10, 20, 35, 40, 50, 55, 70].forEach((y, index) => {
            assertLayout(taffy, children[index], 0, y, 50, 10);
        });
    }
});

test("upstream generated fixture: grid/grid_align_content_space_evenly.rs", () => {
    for (const boxSizing of [BoxSizing.BorderBox, BoxSizing.ContentBox]) {
        const taffy = TaffyTree.new();
        const children = Array.from({ length: 9 }, () => taffy.newLeaf(new Style({ boxSizing })));
        const root = taffy.newWithChildren(
            new Style({
                boxSizing,
                display: Display.Grid,
                alignContent: AlignContent.SpaceEvenly,
                gridTemplateRows: fixedTracks(40, 40, 40),
                gridTemplateColumns: fixedTracks(40, 40, 40),
                size: dimSize(200, 200),
            }),
            children,
        );

        taffy.computeLayoutWithMeasure(root, AvailableSpaceSize.maxContent(), testMeasureFunction);

        assertLayout(taffy, root, 0, 0, 200, 200);
        [
            [0, 20],
            [40, 20],
            [80, 20],
            [0, 80],
            [40, 80],
            [80, 80],
            [0, 140],
            [40, 140],
            [80, 140],
        ].forEach(([x, y], index) => {
            assertLayout(taffy, children[index], x, y, 40, 40);
        });
    }
});

function blockLeaf(taffy: TaffyTree, boxSizing: BoxSizing, marginTop: number, marginBottom: number): NodeId<undefined> {
    return taffy.newLeaf(
        new Style({
            boxSizing,
            size: dimSize("auto", 10),
            margin: lpaRect(0, 0, marginTop, marginBottom),
        }),
    );
}

function fixedTracks(...values: number[]): GridTemplateComponent[] {
    return values.map((value) => gridTemplateComponentLength(value));
}

function dimSize(width: DimensionInput, height: DimensionInput): Size {
    return new Size(dimension(width), dimension(height));
}

function dimension(value: DimensionInput): Dimension {
    return value === "auto" ? Dimension.auto() : Dimension.length(value);
}

function lpRect(left: number, right: number, top: number, bottom: number): Rect {
    return new Rect(
        LengthPercentage.length(left),
        LengthPercentage.length(right),
        LengthPercentage.length(top),
        LengthPercentage.length(bottom),
    );
}

function lpaRect(left: number, right: number, top: number, bottom: number): Rect {
    return new Rect(
        LengthPercentageAuto.length(left),
        LengthPercentageAuto.length(right),
        LengthPercentageAuto.length(top),
        LengthPercentageAuto.length(bottom),
    );
}

function ahemText(text: string, writingMode: WritingMode): AhemTextContext {
    return { type: "ahemText", text, writingMode };
}

function testMeasureFunction(knownDimensions: Size, availableSpace: Size, _nodeId: NodeId<AhemTextContext>, context: TestNodeContext): Size {
    if (knownDimensions.width !== undefined && knownDimensions.height !== undefined) {
        return new Size(knownDimensions.width, knownDimensions.height);
    }

    const measured = context?.type === "ahemText"
        ? measureAhemText(context, knownDimensions, availableSpace)
        : Size.zero();

    return new Size(
        knownDimensions.width ?? measured.width,
        knownDimensions.height ?? measured.height,
    );
}

function measureAhemText(context: AhemTextContext, knownDimensions: Size, availableSpace: Size): Size {
    const inlineAxis: AxisName = context.writingMode === "horizontal" ? "width" : "height";
    const blockAxis: AxisName = inlineAxis === "width" ? "height" : "width";
    const lines = context.text.split("\u200b");
    const minLineLength = lines.reduce((max: number, line: string) => Math.max(max, line.length), 0);
    const maxLineLength = lines.reduce((sum: number, line: string) => sum + line.length, 0);
    const inlineAvailable = availableSpace[inlineAxis];
    const inlineSize = Math.max(
        knownDimensions[inlineAxis] ?? resolveAvailableInlineSize(inlineAvailable, minLineLength, maxLineLength),
        minLineLength * 10,
    );
    const blockSize = knownDimensions[blockAxis] ?? computeAhemBlockSize(lines, inlineSize);

    return context.writingMode === "horizontal"
        ? new Size(inlineSize, blockSize)
        : new Size(blockSize, inlineSize);
}

function resolveAvailableInlineSize(available: AvailableSpaceValue, minLineLength: number, maxLineLength: number): number {
    if (available.type === "MinContent")
        return minLineLength * 10;
    if (available.type === "MaxContent")
        return maxLineLength * 10;
    return Math.min(available.value, maxLineLength * 10);
}

function computeAhemBlockSize(lines: string[], inlineSize: number): number {
    const inlineLineLength = Math.floor(inlineSize / 10);
    let lineCount = 1;
    let currentLineLength = 0;

    for (const line of lines) {
        if (currentLineLength + line.length > inlineLineLength) {
            if (currentLineLength > 0)
                lineCount += 1;
            currentLineLength = line.length;
        }
        else {
            currentLineLength += line.length;
        }
    }

    return lineCount * 10;
}

function assertLayout(taffy: TaffyTree, node: NodeId<unknown>, x: number, y: number, width: number, height: number): void {
    const layout = taffy.layout(node);
    assert.deepEqual(layout.location, new Point(x, y));
    assert.deepEqual(layout.size, new Size(width, height));
}
