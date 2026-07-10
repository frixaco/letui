import assert from "node:assert/strict";
import {
    AlignContent,
    AlignItems,
    AvailableSpace,
    AvailableSpaceSize,
    BoxSizing,
    Dimension,
    Display,
    FlexDirection,
    FlexWrap,
    GridAutoFlow,
    LengthPercentage,
    LengthPercentageAuto,
    Line,
    MaxTrackSizingFunction,
    MinTrackSizingFunction,
    Overflow,
    Point,
    Position,
    Rect,
    Size,
    Style,
    TaffyTree,
    TextAlign,
    TrackSizingFunction,
    gridPlacementAuto,
    gridPlacementLine,
    gridPlacementSpan,
    gridTemplateComponentSingle,
    repeat,
} from "../src/index.js";
import type {
    AvailableSpaceValue,
    GridPlacement,
    GridTemplateComponent,
    GridTrackRepetition,
    NodeId,
} from "../src/index.js";

type AxisName = "width" | "height";
type WritingMode = "horizontal" | "vertical";
type AhemTextContext = { type: "ahemText"; text: string; writingMode: WritingMode };
type TestNodeContext = AhemTextContext | undefined;
type FixtureNode = { name: string; style: Style; context: TestNodeContext; children: string[] };
type RustTestCase = { name: string; body: string };
type ExpectedLayout = { x: number; y: number; width: number; height: number };
type GeneratedFixtureCase = {
    name: string;
    nodes: FixtureNode[];
    root: string;
    availableSpace: Size;
    expected: Map<string, ExpectedLayout>;
};
type GeneratedFixture = { cases: GeneratedFixtureCase[] };
type SplitFieldResult = [name: string, value: string] | [name: undefined, value: undefined];

export function runGeneratedFixture(source: string): void {
    const fixture = parseGeneratedFixture(source);

    for (const fixtureCase of fixture.cases) {
        const taffy = TaffyTree.new();
        const nodes = new Map<string, any>();

        for (const node of fixtureCase.nodes) {
            if (node.children.length === 0) {
                nodes.set(node.name, node.context === undefined
                    ? taffy.newLeaf(node.style)
                    : taffy.newLeafWithContext(node.style, node.context));
            }
            else {
                nodes.set(node.name, taffy.newWithChildren(node.style, node.children.map((child) => nodes.get(child))));
            }
        }

        const root = nodes.get(fixtureCase.root);
        taffy.computeLayoutWithMeasure(root, fixtureCase.availableSpace, testMeasureFunction);

        for (const [nodeName, expected] of fixtureCase.expected) {
            const layout = taffy.layout(nodes.get(nodeName));
            assert.deepEqual(layout.location, new Point(expected.x, expected.y), `${fixtureCase.name} ${nodeName} location`);
            assert.deepEqual(layout.size, new Size(expected.width, expected.height), `${fixtureCase.name} ${nodeName} size`);
        }
    }
}

function parseGeneratedFixture(source: string): GeneratedFixture {
    return {
        cases: splitRustTests(source).map(parseRustTestCase),
    };
}

function splitRustTests(source: string): RustTestCase[] {
    const cases: RustTestCase[] = [];
    const regex = /fn\s+([A-Za-z0-9_]+)\s*\(\)\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
        const bodyStart = source.indexOf("{", match.index);
        const bodyEnd = findMatching(source, bodyStart, "{", "}");
        cases.push({ name: match[1], body: source.slice(bodyStart + 1, bodyEnd) });
        regex.lastIndex = bodyEnd + 1;
    }

    return cases;
}

function parseRustTestCase(testCase: RustTestCase): GeneratedFixtureCase {
    const nodes = parseNodeDeclarations(testCase.body);
    return {
        name: testCase.name,
        nodes,
        root: nodes[nodes.length - 1].name,
        availableSpace: parseComputeAvailableSpace(testCase.body),
        expected: parseExpectedLayouts(testCase.body),
    };
}

function parseComputeAvailableSpace(body: string): Size {
    const callMatch = /\.compute_layout_with_measure\s*\(/.exec(body);
    if (callMatch === null)
        return AvailableSpaceSize.maxContent();

    const callStart = callMatch.index + callMatch[0].length - 1;
    const callEnd = findMatching(body, callStart, "(", ")");
    const [, rawAvailableSpace] = splitTopLevel(body.slice(callStart + 1, callEnd));
    if (rawAvailableSpace === undefined || rawAvailableSpace.includes("Size::MAX_CONTENT"))
        return AvailableSpaceSize.maxContent();
    if (rawAvailableSpace.includes("Size::MIN_CONTENT"))
        return AvailableSpaceSize.minContent();

    const fields = parseStructFields(rawAvailableSpace);
    return new Size(parseAvailableSpace(fields.width), parseAvailableSpace(fields.height));
}

function parseAvailableSpace(input: string): AvailableSpaceValue {
    if (input.includes("MinContent"))
        return AvailableSpace.minContent();
    if (input.includes("MaxContent"))
        return AvailableSpace.maxContent();
    if (input.includes("Definite"))
        return AvailableSpace.definite(parseNumber(input));
    throw new Error(`unsupported generated available space: ${input}`);
}

function parseNodeDeclarations(body: string): FixtureNode[] {
    const declarations: FixtureNode[] = [];
    const regex = /let\s+(node\d*)\s*=\s*taffy/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(body)) !== null) {
        const name = match[1];
        const callNameMatch = /\.\s*(new_leaf_with_context|new_with_children|new_leaf)\s*\(/.exec(body.slice(match.index));
        if (callNameMatch === null)
            throw new Error(`unsupported node declaration for ${name}`);

        const callName = callNameMatch[1];
        const callStart = match.index + callNameMatch.index + callNameMatch[0].length - 1;
        const callEnd = findMatching(body, callStart, "(", ")");
        const callBody = body.slice(callStart + 1, callEnd);
        const style = parseStyle(callBody);
        const context = callName === "new_leaf_with_context" ? parseContext(callBody) : undefined;
        const children = callName === "new_with_children" ? parseChildren(callBody) : [];

        declarations.push({ name, style, context, children });
        regex.lastIndex = callEnd + 1;
    }

    return declarations;
}

function parseStyle(input: string): Style {
    const styleStart = input.indexOf("Style");
    if (styleStart === -1)
        return Style.default();

    const braceStart = input.indexOf("{", styleStart);
    const braceEnd = findMatching(input, braceStart, "{", "}");
    const fields = splitTopLevel(input.slice(braceStart + 1, braceEnd));
    const init: any = {};

    for (const field of fields) {
        const [rawName, rawValue] = splitField(field);
        if (rawName === undefined)
            continue;
        const name = rawName.trim();
        const value = rawValue.trim();

        if (name === "display")
            init.display = parseDisplay(value);
        else if (name === "box_sizing")
            init.boxSizing = parseBoxSizing(value);
        else if (name === "overflow")
            init.overflow = parsePoint(value);
        else if (name === "scrollbar_width")
            init.scrollbarWidth = parseNumber(value);
        else if (name === "position")
            init.position = parsePosition(value);
        else if (name === "inset")
            init.inset = parseLengthPercentageAutoRect(value);
        else if (name === "aspect_ratio")
            init.aspectRatio = parseOptionalNumber(value);
        else if (name === "align_items")
            init.alignItems = parseOptionalAlignItems(value);
        else if (name === "align_self")
            init.alignSelf = parseOptionalAlignItems(value);
        else if (name === "justify_items")
            init.justifyItems = parseOptionalAlignItems(value);
        else if (name === "justify_self")
            init.justifySelf = parseOptionalAlignItems(value);
        else if (name === "align_content")
            init.alignContent = parseOptionalAlignContent(value);
        else if (name === "justify_content")
            init.justifyContent = parseOptionalAlignContent(value);
        else if (name === "text_align")
            init.textAlign = parseTextAlign(value);
        else if (name === "flex_direction")
            init.flexDirection = parseFlexDirection(value);
        else if (name === "flex_wrap")
            init.flexWrap = parseFlexWrap(value);
        else if (name === "flex_basis")
            init.flexBasis = parseDimension(value);
        else if (name === "flex_grow")
            init.flexGrow = parseNumber(value);
        else if (name === "flex_shrink")
            init.flexShrink = parseNumber(value);
        else if (name === "gap")
            init.gap = parseLengthPercentageSize(value);
        else if (name === "size")
            init.size = parseDimensionSize(value);
        else if (name === "min_size")
            init.minSize = parseDimensionSize(value);
        else if (name === "max_size")
            init.maxSize = parseDimensionSize(value);
        else if (name === "padding")
            init.padding = parseLengthPercentageRect(value);
        else if (name === "border")
            init.border = parseLengthPercentageRect(value);
        else if (name === "margin")
            init.margin = parseLengthPercentageAutoRect(value);
        else if (name === "grid_template_rows")
            init.gridTemplateRows = parseGridTemplateTracks(value);
        else if (name === "grid_template_columns")
            init.gridTemplateColumns = parseGridTemplateTracks(value);
        else if (name === "grid_auto_rows")
            init.gridAutoRows = parseGridAutoTracks(value);
        else if (name === "grid_auto_columns")
            init.gridAutoColumns = parseGridAutoTracks(value);
        else if (name === "grid_auto_flow")
            init.gridAutoFlow = parseGridAutoFlow(value);
        else if (name === "grid_row")
            init.gridRow = parseGridPlacementLine(value);
        else if (name === "grid_column")
            init.gridColumn = parseGridPlacementLine(value);
        else
            throw new Error(`unsupported generated fixture style field: ${name}`);
    }

    return new Style(init);
}

function parseDisplay(input: string): Display {
    if (hasRustVariant(input, "Display", "Block"))
        return Display.Block;
    if (hasRustVariant(input, "Display", "None"))
        return Display.None;
    if (hasRustVariant(input, "Display", "Grid"))
        return Display.Grid;
    return Display.Flex;
}

function parseBoxSizing(input: string): BoxSizing {
    if (input.includes("ContentBox"))
        return BoxSizing.ContentBox;
    return BoxSizing.BorderBox;
}

function parsePosition(input: string): Position {
    if (hasRustVariant(input, "Position", "Absolute"))
        return Position.Absolute;
    return Position.Relative;
}

function parseOptionalNumber(input: string): number | undefined {
    if (input.includes("None"))
        return undefined;
    return parseNumber(input);
}

function parseOptionalAlignItems(input: string): AlignItems | undefined {
    if (input.includes("None"))
        return undefined;
    if (input.includes("FlexStart"))
        return AlignItems.FlexStart;
    if (input.includes("FlexEnd"))
        return AlignItems.FlexEnd;
    if (input.includes("Start"))
        return AlignItems.Start;
    if (input.includes("End"))
        return AlignItems.End;
    if (input.includes("Center"))
        return AlignItems.Center;
    if (input.includes("Baseline"))
        return AlignItems.Baseline;
    return AlignItems.Stretch;
}

function parseOptionalAlignContent(input: string): AlignContent | undefined {
    if (input.includes("None"))
        return undefined;
    if (input.includes("SpaceBetween"))
        return AlignContent.SpaceBetween;
    if (input.includes("SpaceEvenly"))
        return AlignContent.SpaceEvenly;
    if (input.includes("SpaceAround"))
        return AlignContent.SpaceAround;
    if (input.includes("FlexStart"))
        return AlignContent.FlexStart;
    if (input.includes("FlexEnd"))
        return AlignContent.FlexEnd;
    if (input.includes("Start"))
        return AlignContent.Start;
    if (input.includes("End"))
        return AlignContent.End;
    if (input.includes("Center"))
        return AlignContent.Center;
    return AlignContent.Stretch;
}

function parseTextAlign(input: string): TextAlign {
    if (input.includes("LegacyLeft"))
        return TextAlign.LegacyLeft;
    if (input.includes("LegacyRight"))
        return TextAlign.LegacyRight;
    if (input.includes("LegacyCenter"))
        return TextAlign.LegacyCenter;
    return TextAlign.Auto;
}

function parseFlexDirection(input: string): FlexDirection {
    if (hasRustVariant(input, "FlexDirection", "ColumnReverse"))
        return FlexDirection.ColumnReverse;
    if (hasRustVariant(input, "FlexDirection", "RowReverse"))
        return FlexDirection.RowReverse;
    if (hasRustVariant(input, "FlexDirection", "Column"))
        return FlexDirection.Column;
    return FlexDirection.Row;
}

function parseFlexWrap(input: string): FlexWrap {
    if (hasRustVariant(input, "FlexWrap", "WrapReverse"))
        return FlexWrap.WrapReverse;
    if (hasRustVariant(input, "FlexWrap", "Wrap"))
        return FlexWrap.Wrap;
    return FlexWrap.NoWrap;
}

function parseGridAutoFlow(input: string): GridAutoFlow {
    if (hasRustVariant(input, "GridAutoFlow", "ColumnDense"))
        return GridAutoFlow.ColumnDense;
    if (hasRustVariant(input, "GridAutoFlow", "RowDense"))
        return GridAutoFlow.RowDense;
    if (hasRustVariant(input, "GridAutoFlow", "Column"))
        return GridAutoFlow.Column;
    return GridAutoFlow.Row;
}

function parseContext(input: string): TestNodeContext {
    const match = /TestNodeContext\s*::\s*ahem_text\s*\(\s*"((?:\\.|[^"])*)"\s*,\s*crate\s*::\s*WritingMode\s*::\s*(Horizontal|Vertical)\s*,?\s*\)/s.exec(input);
    if (match === null)
        return undefined;

    return {
        type: "ahemText",
        text: decodeRustString(match[1]),
        writingMode: match[2] === "Horizontal" ? "horizontal" : "vertical",
    };
}

function parseChildren(input: string): string[] {
    const match = /&\[([^\]]*)\]/.exec(input);
    if (match === null)
        return [];

    return match[1].split(",").map((child) => child.trim()).filter(Boolean);
}

function parseExpectedLayouts(body: string): Map<string, ExpectedLayout> {
    const expected = new Map<string, Partial<ExpectedLayout>>();
    const regex = /assert_eq!\((size\.width|size\.height|location\.x|location\.y),\s*([-0-9.]+)f32,[^\n]*,\s*(node\d*)[,)]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(body)) !== null) {
        const [, property, rawValue, nodeName] = match;
        const record: any = expected.get(nodeName) ?? {};
        const value = Number(rawValue);

        if (property === "size.width")
            record.width = value;
        else if (property === "size.height")
            record.height = value;
        else if (property === "location.x")
            record.x = value;
        else
            record.y = value;

        expected.set(nodeName, record);
    }

    return expected as Map<string, ExpectedLayout>;
}

function parseDimensionSize(input: string): Size {
    const fields = parseStructFields(input);
    return new Size(parseDimension(fields.width), parseDimension(fields.height));
}

function parseLengthPercentageSize(input: string): Size {
    const fields = parseStructFields(input);
    return new Size(parseLengthPercentage(fields.width), parseLengthPercentage(fields.height));
}

function parseGridTemplateTracks(input: string): GridTemplateComponent[] {
    return parseRustVec(input).map(parseGridTemplateComponent);
}

function parseGridAutoTracks(input: string): TrackSizingFunction[] {
    return parseRustVec(input).map(parseTrackSizingFunction);
}

function parseGridTemplateComponent(input: string): GridTemplateComponent {
    if (hasRustCall(input, "repeat"))
        return parseGridRepeat(input);
    return gridTemplateComponentSingle(parseTrackSizingFunction(input));
}

function parseGridRepeat(input: string): GridTemplateComponent {
    const callBody = parseCallBody(input, "repeat");
    const [rawCount, rawTracks] = splitTopLevel(callBody);
    if (rawCount === undefined || rawTracks === undefined)
        throw new Error(`unsupported generated repeat track: ${input}`);

    return repeat(parseRepetitionCount(rawCount), parseGridAutoTracks(rawTracks));
}

function parseRepetitionCount(input: string): GridTrackRepetition | number | string {
    if (input.includes("AutoFill"))
        return "auto-fill";
    if (input.includes("AutoFit"))
        return "auto-fit";
    if (input.includes("Count"))
        return parseNumber(input);
    throw new Error(`unsupported generated repetition count: ${input}`);
}

function parseTrackSizingFunction(input: string): TrackSizingFunction {
    if (hasRustCall(input, "minmax")) {
        const [rawMin, rawMax] = splitTopLevel(parseCallBody(input, "minmax"));
        if (rawMin === undefined || rawMax === undefined)
            throw new Error(`unsupported generated minmax track: ${input}`);
        return new TrackSizingFunction(parseMinTrackSizingFunction(rawMin), parseMaxTrackSizingFunction(rawMax));
    }
    if (hasRustCall(input, "fit_content"))
        return TrackSizingFunction.fitContent(parseLengthPercentageTrackArgument(input));
    if (hasRustCall(input, "auto"))
        return TrackSizingFunction.auto();
    if (hasRustCall(input, "min_content"))
        return TrackSizingFunction.minContent();
    if (hasRustCall(input, "max_content"))
        return TrackSizingFunction.maxContent();
    if (hasRustCall(input, "length"))
        return TrackSizingFunction.length(parseNumber(input));
    if (hasRustCall(input, "percent"))
        return TrackSizingFunction.percent(parseNumber(input));
    if (hasRustCall(input, "fr"))
        return TrackSizingFunction.fr(parseNumber(input));
    throw new Error(`unsupported generated track sizing function: ${input}`);
}

function parseMinTrackSizingFunction(input: string): MinTrackSizingFunction {
    if (hasRustCall(input, "auto"))
        return MinTrackSizingFunction.auto();
    if (hasRustCall(input, "min_content"))
        return MinTrackSizingFunction.minContent();
    if (hasRustCall(input, "max_content"))
        return MinTrackSizingFunction.maxContent();
    if (hasRustCall(input, "length"))
        return MinTrackSizingFunction.length(parseNumber(input));
    if (hasRustCall(input, "percent"))
        return MinTrackSizingFunction.percent(parseNumber(input));
    throw new Error(`unsupported generated min track sizing function: ${input}`);
}

function parseMaxTrackSizingFunction(input: string): MaxTrackSizingFunction {
    if (hasRustCall(input, "fit_content"))
        return MaxTrackSizingFunction.fitContent(parseLengthPercentageTrackArgument(input));
    if (hasRustCall(input, "auto"))
        return MaxTrackSizingFunction.auto();
    if (hasRustCall(input, "min_content"))
        return MaxTrackSizingFunction.minContent();
    if (hasRustCall(input, "max_content"))
        return MaxTrackSizingFunction.maxContent();
    if (hasRustCall(input, "length"))
        return MaxTrackSizingFunction.length(parseNumber(input));
    if (hasRustCall(input, "percent"))
        return MaxTrackSizingFunction.percent(parseNumber(input));
    if (hasRustCall(input, "fr"))
        return MaxTrackSizingFunction.fr(parseNumber(input));
    throw new Error(`unsupported generated max track sizing function: ${input}`);
}

function parseLengthPercentageTrackArgument(input: string): LengthPercentage {
    const callBody = parseCallBody(input, "fit_content");
    if (hasRustCall(callBody, "percent"))
        return LengthPercentage.percent(parseNumber(callBody));
    return LengthPercentage.length(parseNumber(callBody));
}

function parseGridPlacementLine(input: string): Line {
    const fields = parseStructFields(input);
    return new Line(parseGridPlacement(fields.start), parseGridPlacement(fields.end));
}

function parseGridPlacement(input: string): GridPlacement {
    if (hasRustVariant(input, "GridPlacement", "Auto"))
        return gridPlacementAuto();
    if (hasRustCall(input, "line"))
        return gridPlacementLine(parseNumber(input));
    if (hasRustVariant(input, "GridPlacement", "Line"))
        return gridPlacementLine(parseNumber(input));
    if (hasRustVariant(input, "GridPlacement", "Span"))
        return gridPlacementSpan(parseNumber(input));
    throw new Error(`unsupported generated grid placement: ${input}`);
}

function parseDimension(input: string): Dimension {
    if (hasRustCall(input, "auto") || input.includes("::AUTO"))
        return Dimension.auto();
    if (input.includes("from_percent"))
        return Dimension.percent(parseNumber(input));
    return Dimension.length(parseNumber(input));
}

function parseLengthPercentageRect(input: string): Rect {
    const fields = parseStructFields(input);
    return new Rect(
        parseLengthPercentage(fields.left),
        parseLengthPercentage(fields.right),
        parseLengthPercentage(fields.top),
        parseLengthPercentage(fields.bottom),
    );
}

function parseLengthPercentageAutoRect(input: string): Rect {
    const fields = parseStructFields(input);
    return new Rect(
        parseLengthPercentageAuto(fields.left),
        parseLengthPercentageAuto(fields.right),
        parseLengthPercentageAuto(fields.top),
        parseLengthPercentageAuto(fields.bottom),
    );
}

function parseLengthPercentageAuto(input: string): LengthPercentageAuto {
    if (hasRustCall(input, "auto") || input.includes("::AUTO"))
        return LengthPercentageAuto.auto();
    if (hasRustCall(input, "zero"))
        return LengthPercentageAuto.zero();
    if (input.includes("percent"))
        return LengthPercentageAuto.percent(parseNumber(input));
    return LengthPercentageAuto.length(parseNumber(input));
}

function parseLengthPercentage(input: string): LengthPercentage {
    if (hasRustCall(input, "zero"))
        return LengthPercentage.zero();
    if (input.includes("percent"))
        return LengthPercentage.percent(parseNumber(input));
    return LengthPercentage.length(parseNumber(input));
}

function parsePoint(input: string): Point {
    const fields = parseStructFields(input);
    return new Point(parseOverflow(fields.x), parseOverflow(fields.y));
}

function parseOverflow(input: string): Overflow {
    if (input.includes("Scroll"))
        return Overflow.Scroll;
    if (input.includes("Hidden"))
        return Overflow.Hidden;
    if (input.includes("Clip"))
        return Overflow.Clip;
    return Overflow.Visible;
}

function parseStructFields(input: string): Record<string, string> {
    const braceStart = input.indexOf("{");
    const braceEnd = findMatching(input, braceStart, "{", "}");
    const fields: Record<string, string> = {};

    for (const field of splitTopLevel(input.slice(braceStart + 1, braceEnd))) {
        const [name, value] = splitField(field);
        if (name !== undefined)
            fields[name.trim()] = value.trim();
    }

    return fields;
}

function parseRustVec(input: string): string[] {
    const vecStart = input.indexOf("vec!");
    if (vecStart === -1)
        throw new Error(`expected generated Rust vec in ${input}`);

    const bracketStart = input.indexOf("[", vecStart);
    const bracketEnd = findMatching(input, bracketStart, "[", "]");
    return splitTopLevel(input.slice(bracketStart + 1, bracketEnd));
}

function parseCallBody(input: string, name: string): string {
    const match = new RegExp(`\\b${name}\\s*\\(`).exec(input);
    if (match === null)
        throw new Error(`expected ${name} call in ${input}`);

    const start = match.index + match[0].length - 1;
    const end = findMatching(input, start, "(", ")");
    return input.slice(start + 1, end);
}

function splitField(field: string): SplitFieldResult {
    const colon = field.indexOf(":");
    if (colon === -1)
        return [undefined, undefined];
    return [field.slice(0, colon), field.slice(colon + 1)];
}

function splitTopLevel(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (char === "{" || char === "(" || char === "[")
            depth += 1;
        else if (char === "}" || char === ")" || char === "]")
            depth -= 1;
        else if (char === "," && depth === 0) {
            parts.push(input.slice(start, index).trim());
            start = index + 1;
        }
    }

    parts.push(input.slice(start).trim());
    return parts.filter((part) => part !== "" && !/^\.\.\s*Default\s*::\s*default\s*\(\s*\)$/.test(part));
}

function findMatching(input: string, start: number, open: string, close: string): number {
    let depth = 0;

    for (let index = start; index < input.length; index += 1) {
        if (input[index] === open)
            depth += 1;
        else if (input[index] === close) {
            depth -= 1;
            if (depth === 0)
                return index;
        }
    }

    throw new Error(`unmatched ${open}`);
}

function parseNumber(input: string): number {
    const match = /-?\d+(?:\.\d+)?/.exec(input);
    if (match === null)
        throw new Error(`expected number in ${input}`);
    return Number(match[0]);
}

function hasRustCall(input: string, name: string): boolean {
    return new RegExp(`\\b${name}\\s*\\(`).test(input);
}

function hasRustVariant(input: string, enumName: string, variantName: string): boolean {
    return new RegExp(`\\b${enumName}\\s*::\\s*${variantName}\\b`).test(input);
}

function decodeRustString(input: string): string {
    return input
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_match: string, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
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
    const minLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const maxLineLength = lines.reduce((sum, line) => sum + line.length, 0);
    const inlineSize = Math.max(
        knownDimensions[inlineAxis] ?? resolveAvailableInlineSize(availableSpace[inlineAxis], minLineLength, maxLineLength),
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
