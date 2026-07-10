import assert from "node:assert/strict";
import test from "node:test";

import {
    AvailableSpace,
    CompactLength,
    CompactLengthTag,
    Dimension,
    Display,
    LengthPercentage,
    LengthPercentageAuto,
    MaxTrackSizingFunction,
    MinTrackSizingFunction,
    Rect,
    Size,
    Style,
    TaffyTree,
    TrackSizingFunction,
    maybeResolveDimension,
} from "../src/index.js";

type CalcHandle = {
    fraction: number;
    offset?: number;
};

class CalcTree extends TaffyTree {
    override resolveCalcValue(value: unknown, basis: number): number {
        const handle = value as CalcHandle;
        return basis * handle.fraction + (handle.offset ?? 0);
    }
}

const calc = (fraction: number, offset = 0): CalcHandle => ({ fraction, offset });
const available = (width: number, height: number): Size =>
    new Size(AvailableSpace.definite(width), AvailableSpace.definite(height));

test("calc style values preserve opaque handles and delegate definite resolution", () => {
    const handle = calc(0.5, 8);
    const resolver = (value: unknown, basis: number): number => {
        return basis * (value as CalcHandle).fraction + ((value as CalcHandle).offset ?? 0);
    };
    const raw = CompactLength.calc(handle);

    assert.equal(CompactLength.CALC_TAG, CompactLengthTag.Calc);
    assert.equal(raw.tag(), CompactLengthTag.Calc);
    assert.equal(raw.isCalc(), true);
    assert.equal(raw.is_calc(), true);
    assert.equal(raw.calcValue(), handle);
    assert.equal(raw.calc_value(), handle);
    assert.equal(raw.usesPercentage(), true);
    assert.equal(Dimension.calc(handle).maybeResolve(undefined, resolver), undefined);
    assert.equal(maybeResolveDimension(Dimension.calc(handle), 200, resolver), 108);
    assert.deepEqual(
        new Size(Dimension.calc(handle), Dimension.calc(calc(0.25))).maybeResolve(new Size(200, 80), resolver),
        new Size(108, 20),
    );
    assert.equal(Dimension.calc(handle).resolveOrZero(200), 0);
    assert.equal(MaxTrackSizingFunction.calc(handle).hasDefiniteValue(200), true);
    assert.equal(MaxTrackSizingFunction.calc(handle).definiteValue(200, resolver), 108);
    assert.equal(MinTrackSizingFunction.calc(handle).definiteValue(undefined, resolver), undefined);
});

test("leaf layout resolves calc dimensions against the parent basis", () => {
    const tree = new CalcTree();
    const leaf = tree.newLeaf(new Style({
        size: new Size(Dimension.calc(calc(0.5, -10)), Dimension.calc(calc(0.25))),
    }));

    tree.computeLayout(leaf, available(200, 80));

    assert.deepEqual(tree.layout(leaf).size, new Size(90, 20));
});

test("flex layout resolves calc child sizes and gaps", () => {
    const tree = new CalcTree();
    const first = tree.newLeaf(new Style({
        size: new Size(Dimension.calc(calc(0.25)), Dimension.length(10)),
    }));
    const second = tree.newLeaf(new Style({
        size: new Size(Dimension.calc(calc(0.5)), Dimension.length(10)),
    }));
    const root = tree.newWithChildren(new Style({
        size: new Size(Dimension.length(200), Dimension.length(40)),
        gap: new Size(LengthPercentage.calc(calc(0.05)), LengthPercentage.length(0)),
    }), [first, second]);

    tree.computeLayout(root, available(200, 40));

    assert.deepEqual(tree.layout(first).size, new Size(50, 10));
    assert.deepEqual(tree.layout(second).size, new Size(100, 10));
    assert.equal(tree.layout(second).location.x, 60);
});

test("block layout resolves calc dimensions and margins", () => {
    const tree = new CalcTree();
    const child = tree.newLeaf(new Style({
        display: Display.Block,
        size: new Size(Dimension.calc(calc(0.5)), Dimension.length(10)),
        margin: new Rect(
            LengthPercentageAuto.calc(calc(0.1)),
            LengthPercentageAuto.length(0),
            LengthPercentageAuto.length(0),
            LengthPercentageAuto.length(0),
        ),
    }));
    const root = tree.newWithChildren(new Style({
        display: Display.Block,
        size: new Size(Dimension.calc(calc(0.5)), Dimension.length(40)),
    }), [child]);

    tree.computeLayout(root, available(400, 40));

    assert.deepEqual(tree.layout(root).size, new Size(200, 40));
    assert.deepEqual(tree.layout(child).size, new Size(100, 10));
    assert.equal(tree.layout(child).location.x, 20);
});

test("grid layout resolves calc track sizing functions", () => {
    const tree = new CalcTree();
    const first = tree.newLeaf();
    const second = tree.newLeaf();
    const calcTrack = TrackSizingFunction.fromLengthPercentage(LengthPercentage.calc(calc(0.25)));
    const root = tree.newWithChildren(new Style({
        display: Display.Grid,
        size: new Size(Dimension.length(200), Dimension.length(40)),
        gridTemplateColumns: [calcTrack, TrackSizingFunction.length(50)].map((track) => ({ type: "Single" as const, track })),
        gridTemplateRows: [{ type: "Single", track: TrackSizingFunction.length(20) }],
    }), [first, second]);

    tree.computeLayout(root, available(200, 40));

    assert.deepEqual(tree.layout(first).size, new Size(50, 20));
    assert.deepEqual(tree.layout(second).size, new Size(50, 20));
    assert.equal(tree.layout(second).location.x, 50);
});
