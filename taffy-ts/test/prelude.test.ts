import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { AlignContent, AvailableSpace, Dimension, Line, Rect, Size, Style, TaffyTree, flex, line, length, percent, span, zero, } from "../src/prelude.js";
import { Point } from "../src/geometry.js";
import { computeLeafLayout as computeLeafLayoutFromComputeModule } from "../src/compute.js";
import { applyAlignmentFallback as applyAlignmentFallbackFromCommonAlignment } from "../src/compute/common/alignment.js";
import { computeContentSizeContribution as computeContentSizeContributionFromCommonContentSize } from "../src/compute/common/content_size.js";
import { Display as DisplayFromStyleModule, Overflow as OverflowFromStyleModule, Style as StyleFromStyleModule, } from "../src/style.js";
import { AlignContent as AlignContentFromAlignmentModule } from "../src/style/alignment.js";
import { AvailableSpace as AvailableSpaceFromSnakeModule } from "../src/style/available_space.js";
import { TextAlign as TextAlignFromBlockModule } from "../src/style/block.js";
import { CompactLength as CompactLengthFromCompactModule } from "../src/style/compact_length.js";
import { Dimension as DimensionFromDimensionModule } from "../src/style/dimension.js";
import { FlexDirection as FlexDirectionFromFlexModule } from "../src/style/flex.js";
import { Float as FloatFromFloatModule } from "../src/style/float.js";
import { GridAutoFlow as GridAutoFlowFromGridModule } from "../src/style/grid.js";
import { line as rootStyleHelpersLine } from "../src/style_helpers.js";
import { NodeId as NodeIdFromTreeModule } from "../src/tree.js";
import { TaffyTree as TaffyTreeFromSnakeTreeModule } from "../src/tree/taffy_tree.js";
import { round as roundFromUtilSysModule } from "../src/util/sys.js";
import { maybe_min as maybeMinFromUtilModule } from "../src/util.js";
test("prelude re-exports common common layout APIs", () => {
    const taffy = TaffyTree.new();
    const child = taffy.newLeaf(new Style({ size: Size.length(10, Dimension) }));
    const root = taffy.newWithChildren(new Style({
        size: new Size(Dimension.length(100), Dimension.length(100)),
        justifyContent: AlignContent.Center,
    }), [child]);
    taffy.computeLayout(root, new Size(AvailableSpace.definite(100), AvailableSpace.definite(100)));
    assert.deepEqual(taffy.layout(child).size, new Size(10, 10));
    assert.deepEqual(Line.length(2), new Line(2, 2));
    assert.deepEqual(Rect.percent(0.5), new Rect(0.5, 0.5, 0.5, 0.5));
    assert.equal(length(3), 3);
    assert.equal(percent(0.25), 0.25);
    assert.equal(zero(), 0);
    assert.equal(flex(1).maxSizingFunction().isFr(), true);
    assert.deepEqual(line(2), { type: "Line", line: 2 });
    assert.deepEqual(span(3), { type: "Span", span: 3 });
    const lineFactory = {
        from_line_index: (index: number) => ({ kind: "line", index }),
    };
    const spanFactory = {
        fromSpan: (spanValue: number) => ({ kind: "span", span: spanValue }),
    };
    assert.deepEqual(line(4, lineFactory), { kind: "line", index: 4 });
    assert.deepEqual(span(5, spanFactory), { kind: "span", span: 5 });
});
test("package metadata points at Bun workspace and built TypeScript port entrypoints", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(packageJson.version, "0.9.1");
    assert.equal(packageJson.private, true);
    assert.equal(packageJson.license, "MIT");
    assert.ok(existsSync(new URL("../LICENSE.md", import.meta.url)));
    assert.equal(packageJson.main, "./dist/src/index.js");
    assert.equal(packageJson.types, "./src/index.ts");
    assert.equal(packageJson.module, "./dist/src/index.js");
    assert.deepEqual(packageJson.files, ["src", "dist"]);
    assert.equal(packageJson.scripts.build, "rm -rf dist && tsgo -p tsconfig.build.json");
    assert.equal(packageJson.scripts.typecheck, "tsgo -p tsconfig.json");
    assert.equal(packageJson.scripts.check, "bun run typecheck && bun test test/*.test.ts && bun run build && bun run bench/layout.ts");
    assert.equal(packageJson.scripts.prepack, undefined);
    assert.deepEqual(packageJson.exports["."], {
        types: "./src/index.ts",
        bun: "./src/index.ts",
        import: "./dist/src/index.js",
    });
    assert.deepEqual(packageJson.exports["./prelude"], {
        types: "./src/prelude.ts",
        bun: "./src/prelude.ts",
        import: "./dist/src/prelude.js",
    });
    assert.deepEqual(packageJson.exports["./compute/grid"], {
        types: "./src/compute/grid.ts",
        bun: "./src/compute/grid.ts",
        import: "./dist/src/compute/grid.js",
    });
    for (const [subpath, target] of Object.entries(packageJson.exports) as Array<[string, { types: string; bun: string; import: string }]>) {
        assert.equal(target.types.endsWith(".ts"), true, `${subpath} types target is source TS`);
        assert.equal(target.bun.endsWith(".ts"), true, `${subpath} Bun target is source TS`);
        assert.equal(target.import.startsWith("./dist/src/"), true, `${subpath} import target is built`);
        assert.ok(existsSync(new URL(`../${target.import}`, import.meta.url)), `${subpath} import target exists`);
        assert.ok(existsSync(new URL(`../${target.types}`, import.meta.url)), `${subpath} types target exists`);
        assert.ok(existsSync(new URL(`../${target.bun}`, import.meta.url)), `${subpath} Bun target exists`);
    }
});
test("package subpath exports expose layout module surfaces", async () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const expectedSubpaths = [
        "./geometry",
        "./compute/block",
        "./compute/common",
        "./compute/flexbox",
        "./compute/float",
        "./compute/grid",
        "./compute/leaf",
        "./style/available-space",
        "./style/dimensions",
        "./style/helpers",
        "./style/style",
        "./style/traits",
        "./tree/cache",
        "./tree/layout",
        "./tree/taffy-tree",
        "./tree/traits",
        "./util/math",
        "./util/parse",
        "./util/print",
        "./util/resolve",
    ];
    for (const subpath of expectedSubpaths) {
        assert.ok(packageJson.exports[subpath], `${subpath} is exported`);
    }
    for (const subpath of Object.keys(packageJson.exports)) {
        const specifier = subpath === "." ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`;
        const exportedModule = (await import(specifier));
        assert.ok(exportedModule !== null, `${specifier} imports successfully`);
    }
    const rootModule = (await import(packageJson.name));
    const packageTree = rootModule.TaffyTree.new();
    const packageChild = packageTree.newLeaf(new rootModule.Style({
        size: new rootModule.Size(rootModule.Dimension.length(12), rootModule.Dimension.length(8)),
    }));
    const packageRoot = packageTree.newWithChildren(new rootModule.Style({
        size: new rootModule.Size(rootModule.Dimension.length(40), rootModule.Dimension.length(20)),
    }), [packageChild]);
    packageTree.computeLayout(packageRoot, rootModule.AvailableSpaceSize.maxContent());
    assert.deepEqual(packageTree.layout(packageChild).size, new rootModule.Size(12, 8));
    const computePath = "taffy-ts/compute";
    const computeCommonAlignmentPath = "taffy-ts/compute/common/alignment";
    const computeCommonContentSizePath = "taffy-ts/compute/common/content_size";
    const computeDetailedInfoPath = "taffy-ts/compute/detailed_info";
    const stylePath = "taffy-ts/style";
    const alignmentPath = "taffy-ts/style/alignment";
    const availableSpacePath = "taffy-ts/style/available_space";
    const blockPath = "taffy-ts/style/block";
    const compactLengthPath = "taffy-ts/style/compact_length";
    const dimensionPath = "taffy-ts/style/dimension";
    const flexPath = "taffy-ts/style/flex";
    const floatPath = "taffy-ts/style/float";
    const gridPath = "taffy-ts/style/grid";
    const styleHelpersPath = "taffy-ts/style_helpers";
    const treePath = "taffy-ts/tree";
    const nodePath = "taffy-ts/tree/node";
    const taffyTreeSnakePath = "taffy-ts/tree/taffy_tree";
    const utilPath = "taffy-ts/util";
    const utilSysPath = "taffy-ts/util/sys";
    const computeModule = (await import(computePath));
    const computeCommonAlignmentModule = (await import(computeCommonAlignmentPath));
    const computeCommonContentSizeModule = (await import(computeCommonContentSizePath));
    const computeDetailedInfoModule = (await import(computeDetailedInfoPath));
    const styleModule = (await import(stylePath));
    const alignmentModule = (await import(alignmentPath));
    const availableSpaceModule = (await import(availableSpacePath));
    const blockModule = (await import(blockPath));
    const compactLengthModule = (await import(compactLengthPath));
    const dimensionModule = (await import(dimensionPath));
    const flexModule = (await import(flexPath));
    const floatModule = (await import(floatPath));
    const gridModule = (await import(gridPath));
    const styleHelpers = (await import(styleHelpersPath));
    const treeModule = (await import(treePath));
    const nodeModule = (await import(nodePath));
    const taffyTreeSnakeModule = (await import(taffyTreeSnakePath));
    const utilModule = (await import(utilPath));
    const utilSysModule = (await import(utilSysPath));
    assert.equal(computeLeafLayoutFromComputeModule, computeModule.computeLeafLayout);
    assert.equal(computeCommonAlignmentModule.applyAlignmentFallback(0, 1, AlignContent.SpaceBetween, false), applyAlignmentFallbackFromCommonAlignment(0, 1, AlignContent.SpaceBetween, false));
    assert.deepEqual(computeCommonContentSizeModule.computeContentSizeContribution(new Point(-2, 3), new Size(8, 4), new Size(10, 2), new Point(styleModule.Overflow.Visible, styleModule.Overflow.Hidden)), computeContentSizeContributionFromCommonContentSize(new Point(-2, 3), new Size(8, 4), new Size(10, 2), new Point(OverflowFromStyleModule.Visible, OverflowFromStyleModule.Hidden)));
    const detailedGridInfoFromDetailedInfoModule = {
        rows: {
            negative_implicit_tracks: 0,
            explicit_tracks: 0,
            positive_implicit_tracks: 0,
            sizes: [],
            gutters: [],
        },
        columns: {
            negative_implicit_tracks: 0,
            explicit_tracks: 0,
            positive_implicit_tracks: 0,
            sizes: [],
            gutters: [],
        },
        items: [],
    };
    const detailedGridInfoFromGridModule = detailedGridInfoFromDetailedInfoModule;
    assert.deepEqual(Object.keys(computeDetailedInfoModule), []);
    assert.deepEqual(detailedGridInfoFromGridModule.items, []);
    assert.equal(StyleFromStyleModule, styleModule.Style);
    assert.equal(DisplayFromStyleModule.Flex, styleModule.Display.Flex);
    assert.equal(alignmentModule.AlignContent.Center, AlignContentFromAlignmentModule.Center);
    assert.deepEqual(availableSpaceModule.AvailableSpace.definite(4), AvailableSpaceFromSnakeModule.definite(4));
    assert.equal(blockModule.TextAlign.Auto, TextAlignFromBlockModule.Auto);
    assert.equal(compactLengthModule.CompactLength.length(2).value(), CompactLengthFromCompactModule.length(2).value());
    assert.deepEqual(dimensionModule.Dimension.length(3), DimensionFromDimensionModule.length(3));
    assert.equal(flexModule.FlexDirection.Row, FlexDirectionFromFlexModule.Row);
    assert.equal(floatModule.Float.Left, FloatFromFloatModule.Left);
    assert.equal(gridModule.GridAutoFlow.Row, GridAutoFlowFromGridModule.Row);
    assert.deepEqual(rootStyleHelpersLine(2), line(2));
    assert.deepEqual(styleHelpers.line(2), line(2));
    assert.deepEqual(styleHelpers.span(3), span(3));
    assert.equal(styleHelpers.flex(1).maxSizingFunction().isFr(), true);
    assert.equal(NodeIdFromTreeModule, treeModule.NodeId);
    assert.equal(nodeModule.NodeId.new(7).toNumber(), 7);
    assert.equal(taffyTreeSnakeModule.TaffyTree, TaffyTreeFromSnakeTreeModule);
    assert.equal(maybeMinFromUtilModule(3, 5), 3);
    assert.equal(utilModule.maybe_min(3, 5), 3);
    assert.equal(utilSysModule.round(-0.5), roundFromUtilSysModule(-0.5));
    assert.equal(utilModule.round(-0.5), roundFromUtilSysModule(-0.5));
    assert.equal(new StyleFromStyleModule().display, DisplayFromStyleModule.DEFAULT);
});
