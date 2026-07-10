import { Line, Point, Rect, Size, rectAdd, rectHorizontalAxisSum, rectSumAxes, rectVerticalAxisSum, sizeAdd, } from "../geometry.js";
import { AvailableSpace, type AvailableSpaceValue } from "../style/available-space.js";
import { CompactLength, CompactLengthTag, LengthPercentage, maybeResolveDimension, maybeResolveDimensionSize, resolveLengthPercentageAutoRectOrZero, resolveLengthPercentageOrZero, resolveLengthPercentageRectOrZero, } from "../style/dimensions.js";
import { AlignContent, AlignItems, BoxSizing, Direction, Display, GridAutoFlow, Overflow, Position, Style, TrackSizingFunction, type GridPlacement, type GridTemplateComponent, overflowIsScrollContainer, } from "../style/style.js";
import { Layout, LayoutInput, LayoutOutput, RequestedAxis, RunMode, SizingMode, } from "../tree/layout.js";
import { maybeAddOptionalSize, maybeClamp, maybeClampOptionalSize, maybeClampSize, maybeMaxOptionalSize, } from "../util/math.js";
import { f32Max, f32Min } from "../util/sys.js";
import { applyAlignmentFallback, computeAlignmentOffset, computeContentSizeContribution, } from "./common.js";

type GridAxis = "row" | "column";
type TrackSizingKind = "auto" | "min" | "max" | "fit" | "flex" | "percent" | "fixed";
type IntrinsicContribution = "min" | "max";
type TrackContribution = "min" | "max";
type ContributionType = "minimum" | "maximum";
type AutoRepeatStrategy = "MinThatOverflows" | "MaxThatDoNotOverflow";

interface GridTrack {
    size: number;
    growthLimit?: number;
    fr: number;
    isFlexible: boolean;
    percent?: number;
    minPercent?: number;
    maxPercent?: number;
    minCalc?: CompactLength;
    maxCalc?: CompactLength;
    minPercentLimit?: number;
    maxPercentLimit?: number;
    maxPercentFloor?: IntrinsicContribution;
    maxPercentFloorSize?: number;
    isAuto: boolean;
    intrinsicContribution?: IntrinsicContribution;
    fitContentLimit?: number;
    fitContentPercent?: number;
    fitContentFloorSize?: number;
    minContentFloorSize?: number;
    minTrackKind: TrackSizingKind;
    maxTrackKind: TrackSizingKind;
    isAutoFit: boolean;
    isCollapsed: boolean;
}

interface GridTrackSet {
    tracks: GridTrack[];
    originOffset: number;
    explicitTrackCount: number;
}

interface GridItem {
    node: any;
    order: number;
    style: Style;
    row: number;
    column: number;
    rowSpan: number;
    columnSpan: number;
    baseline: number | undefined;
    baselineShim: number;
    yPosition: number;
    height: number;
    output?: LayoutOutput;
}

interface NamedLineResolver {
    rowLines: Map<string, number[]>;
    columnLines: Map<string, number[]>;
    areaColumnCount: number;
    areaRowCount: number;
    explicitColumnCount: number;
    explicitRowCount: number;
}

interface GridPlacementBounds {
    columnStart: number;
    columnEnd: number;
    rowStart: number;
    rowEnd: number;
}

interface ResolvedPlacement {
    start: number | undefined;
    span: number;
}

interface ResolvedAbsolutePlacement extends ResolvedPlacement {
    end: number | undefined;
}

type AxisPlacement = {
    column: ResolvedPlacement;
    row: ResolvedPlacement;
};

interface GridItemConstraints {
    inherentSize: Size;
    minSize: Size;
    maxSize: Size;
}

interface GridItemSizing {
    knownDimensions: Size;
    justify: AlignItems;
    align: AlignItems;
    minSize: Size;
    maxSize: Size;
}

interface AxisAlignmentResult {
    offset: number;
    startMargin: number;
    endMargin: number;
}

interface AbsoluteAxisAreaResult {
    start: number;
    end: number;
}

type OccupiedGridCells = Set<string>;

export function computeGridLayout(tree: any, node: any, inputs: LayoutInput, measureFunction: any): LayoutOutput {
    const style = tree.getStyle(node);
    const parentSize = inputs.parentSize;
    const aspectRatio = style.aspectRatio;
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const paddingBorder = rectAdd(padding, border);
    const paddingBorderSum = rectSumAxes(paddingBorder);
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const minSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const preferredSize = inputs.sizingMode === SizingMode.InherentSize
        ? maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment)
        : Size.none();
    const knownDimensions = inputs.knownDimensions.or(maybeMaxOptionalSize(maybeClampOptionalSize(preferredSize, minSize, maxSize), paddingBorderSum.map((value: number) => value)));
    const autoRepeatOuterSize = maybeMaxOptionalSize(maybeClampOptionalSize(inputs.knownDimensions.or(preferredSize).or(maxSize).or(minSize), minSize, maxSize), paddingBorderSum.map((value: number) => value));
    const autoRepeatStrategy = inputs.knownDimensions
        .or(preferredSize)
        .or(maxSize)
        .map((size: number | undefined) => (size === undefined ? "MinThatOverflows" : "MaxThatDoNotOverflow"));
    if (inputs.runMode === RunMode.ComputeSize &&
        knownDimensions.width !== undefined &&
        knownDimensions.height !== undefined) {
        return LayoutOutput.fromOuterSize(new Size(knownDimensions.width, knownDimensions.height));
    }
    const scrollbarGutter = style.overflow
        .transpose()
        .map((overflow: Overflow) => (overflow === Overflow.Scroll ? style.scrollbarWidth : 0));
    const contentBoxInset = new Rect(padding.left + border.left + (style.direction === Direction.Rtl ? scrollbarGutter.x : 0), padding.right + border.right + (style.direction === Direction.Ltr ? scrollbarGutter.x : 0), padding.top + border.top, padding.bottom + border.bottom + scrollbarGutter.y);
    const innerKnownSize = knownDimensions.zipMap(rectSumAxes(contentBoxInset), (size: number | undefined, inset: number) => size === undefined ? undefined : Math.max(0, size - inset));
    const autoRepeatInnerSize = autoRepeatOuterSize.zipMap(rectSumAxes(contentBoxInset), (size: number | undefined, inset: number) => (size === undefined ? undefined : Math.max(0, size - inset)));
    const constrainedInnerSize = new Size(gridTrackConstraintSize(innerKnownSize.width, maxSize.width, inputs.availableSpace.width, rectHorizontalAxisSum(contentBoxInset)), gridTrackConstraintSize(innerKnownSize.height, maxSize.height, inputs.availableSpace.height, rectVerticalAxisSum(contentBoxInset)));
    let columnGap = resolveLengthPercentage(style.gap.width, knownDimensions.width, tree);
    let rowGap = resolveLengthPercentage(style.gap.height, knownDimensions.height, tree);
    const columnAutoRepeatCount = computeAutoRepeatCount(style.gridTemplateColumns, autoRepeatInnerSize.width, columnGap, autoRepeatStrategy.width, tree);
    const rowAutoRepeatCount = computeAutoRepeatCount(style.gridTemplateRows, autoRepeatInnerSize.height, rowGap, autoRepeatStrategy.height, tree);
    let explicitColumns = expandTracks(style.gridTemplateColumns, columnAutoRepeatCount);
    let explicitRows = expandTracks(style.gridTemplateRows, rowAutoRepeatCount);
    const namedLineResolver = createNamedLineResolver(style, columnAutoRepeatCount ?? 0, rowAutoRepeatCount ?? 0);
    const explicitColumnCount = Math.max(explicitColumns.length, namedLineResolver.areaColumnCount);
    const explicitRowCount = Math.max(explicitRows.length, namedLineResolver.areaRowCount);
    namedLineResolver.explicitColumnCount = explicitColumnCount;
    namedLineResolver.explicitRowCount = explicitRowCount;
    explicitColumns = extendTracksToExplicitCount(explicitColumns, explicitColumnCount, style.gridAutoColumns);
    explicitRows = extendTracksToExplicitCount(explicitRows, explicitRowCount, style.gridAutoRows);
    const childEntries = tree
        .childIds(node)
        .map((child: any, index: number) => ({ child, index, style: tree.getStyle(child) as Style }))
        .filter(({ style }: { style: Style }) => style.display !== Display.None && style.position !== Position.Absolute);
    const placedItems = placeItems(childEntries.map(({ child, index, style }: { child: any; index: number; style: Style }): GridItem => ({
        node: child,
        order: index,
        style,
        row: 0,
        column: 0,
        rowSpan: 1,
        columnSpan: 1,
        baseline: undefined,
        baselineShim: 0,
        yPosition: 0,
        height: 0,
    })), explicitColumns.length, explicitRows.length, style.gridAutoFlow, namedLineResolver);
    placedItems.sort((left: GridItem, right: GridItem) => left.order - right.order);
    placedItems.forEach((item: GridItem, order: number) => {
        item.order = order;
    });
    const columnStart = Math.min(0, ...placedItems.map((item: GridItem) => item.column));
    const columnEnd = Math.max(explicitColumns.length, ...placedItems.map((item: GridItem) => item.column + item.columnSpan), 1);
    const rowStart = Math.min(0, ...placedItems.map((item: GridItem) => item.row));
    const rowEnd = Math.max(explicitRows.length, ...placedItems.map((item: GridItem) => item.row + item.rowSpan), 1);
    const columns = materializeTracks(explicitColumns, style.gridAutoColumns, columnStart, columnEnd);
    const rows = materializeTracks(explicitRows, style.gridAutoRows, rowStart, rowEnd);
    collapseEmptyAutoFitTracks(columns, placedItems, "column", style.direction);
    collapseEmptyAutoFitTracks(rows, placedItems, "row", Direction.Ltr);
    resolvePercentageTracks(columns.tracks, innerKnownSize.width, tree);
    resolvePercentageTracks(rows.tracks, innerKnownSize.height, tree);
    resolveGridItemBaselines(placedItems, style.alignItems, innerKnownSize, tree, measureFunction);
    const baseColumnTracks = columns.tracks.map((track: GridTrack) => ({ ...track }));
    const baseRowTracks = rows.tracks.map((track: GridTrack) => ({ ...track }));
    const sizeTracks = (sizingInnerSize = innerKnownSize) => {
        columns.tracks = baseColumnTracks.map((track: GridTrack) => ({ ...track }));
        rows.tracks = baseRowTracks.map((track: GridTrack) => ({ ...track }));
        resolvePercentageTracks(columns.tracks, sizingInnerSize.width, tree);
        resolvePercentageTracks(rows.tracks, sizingInnerSize.height, tree);
        applySingleSpanItemContributions(placedItems, columns, rows, sizingInnerSize, columnGap, rowGap, "column", constrainedInnerSize.width, style, tree, measureFunction);
        applySpanningItemContributions(placedItems, columns, rows, sizingInnerSize, columnGap, rowGap, "column", inputs.availableSpace.width, style, tree, measureFunction);
        maximiseTracks(columns.tracks, sizingInnerSize.width, columnGap, inputs.availableSpace.width);
        shrinkAutoTracksToFit(columns.tracks, constrainedInnerSize.width, columnGap);
        resolveFlexibleTracks(columns.tracks, sizingInnerSize.width, columnGap);
        stretchAutoTracks(columns.tracks, sizingInnerSize.width, columnGap, style.justifyContent ?? AlignContent.Stretch);
        applySingleSpanItemContributions(placedItems, columns, rows, sizingInnerSize, columnGap, rowGap, "row", constrainedInnerSize.height, style, tree, measureFunction);
        applySpanningItemContributions(placedItems, columns, rows, sizingInnerSize, columnGap, rowGap, "row", inputs.availableSpace.height, style, tree, measureFunction);
        maximiseTracks(rows.tracks, sizingInnerSize.height, rowGap, inputs.availableSpace.height);
        shrinkAutoTracksToFit(rows.tracks, constrainedInnerSize.height, rowGap);
        resolveFlexibleTracks(rows.tracks, sizingInnerSize.height, rowGap);
        stretchAutoTracks(rows.tracks, sizingInnerSize.height, rowGap, style.alignContent ?? AlignContent.Stretch);
    };
    sizeTracks();
    const innerWidth = innerKnownSize.width ?? trackSum(columns.tracks, columnGap);
    const innerHeight = innerKnownSize.height ?? trackSum(rows.tracks, rowGap);
    if ((innerKnownSize.width === undefined && inputs.availableSpace.width.type !== "Definite" && tracksUsePercentage(columns.tracks)) ||
        (innerKnownSize.height === undefined && inputs.availableSpace.height.type !== "Definite" && tracksUsePercentage(rows.tracks))) {
        sizeTracks(new Size(innerKnownSize.width ?? innerWidth, innerKnownSize.height ?? innerHeight));
    }
    const resolvedColumnGap = resolveFinalGridGap(style.gap.width, innerKnownSize.width, innerWidth, tree);
    const resolvedRowGap = resolveFinalGridGap(style.gap.height, innerKnownSize.height, innerHeight, tree);
    if (resolvedColumnGap !== columnGap || resolvedRowGap !== rowGap) {
        columnGap = resolvedColumnGap;
        rowGap = resolvedRowGap;
        sizeTracks();
    }
    if (innerKnownSize.width === undefined)
        resolvePercentageTracks(columns.tracks, innerWidth, tree);
    if (innerKnownSize.height === undefined)
        resolvePercentageTracks(rows.tracks, innerHeight, tree);
    const contentOuterSize = new Size(innerWidth + rectHorizontalAxisSum(contentBoxInset), innerHeight + rectVerticalAxisSum(contentBoxInset));
    const resolvedStyleSize = inputs.knownDimensions.or(preferredSize);
    const outerSize = maybeMaxOptionalSize(maybeClampOptionalSize(new Size(resolvedStyleSize.width ?? contentOuterSize.width, resolvedStyleSize.height ?? contentOuterSize.height), minSize, maxSize), paddingBorderSum.map((value: number) => value)).unwrapOr(Size.zero());
    if (inputs.runMode === RunMode.ComputeSize) {
        return LayoutOutput.fromOuterSize(outerSize);
    }
    const columnOffsets = trackOffsets(columns.tracks, columnGap, contentBoxInset.left, innerWidth, style.justifyContent ?? AlignContent.Stretch);
    const rowOffsets = trackOffsets(rows.tracks, rowGap, contentBoxInset.top, innerHeight, style.alignContent ?? AlignContent.Stretch);
    let contentSize = Size.zero();
    for (const item of placedItems) {
        const area = gridArea(item, columns, rows, columnOffsets, rowOffsets, columnGap, rowGap, contentBoxInset.left, innerWidth, style.direction);
        const contribution = layoutGridItem(tree, item, area, style, measureFunction);
        contentSize = contentSize.zipMap(contribution, f32Max);
    }
    const absoluteContentSize = layoutHiddenAndAbsoluteGridChildren(tree, node, placedItems.length, columns, rows, columnOffsets, rowOffsets, columnGap, rowGap, outerSize, contentBoxInset, border, scrollbarGutter, namedLineResolver, style, measureFunction);
    setDetailedGridInfo(tree, node, rows, columns, placedItems, rowGap, columnGap);
    return LayoutOutput.fromSizesAndBaselines(outerSize, contentSize.zipMap(absoluteContentSize, f32Max), new Point(undefined, gridContainerBaseline(placedItems, style.alignItems)));
}
export const compute_grid_layout = computeGridLayout;
function setDetailedGridInfo(tree: any, node: any, rows: GridTrackSet, columns: GridTrackSet, items: GridItem[], rowGap: number, columnGap: number): void {
    const detailedGridInfo = {
        rows: detailedGridTracksInfo(rows, rowGap),
        columns: detailedGridTracksInfo(columns, columnGap),
        items: items.map((item) => detailedGridItemsInfo(item, rows, columns)),
    };
    if (tree.setDetailedGridInfo !== undefined) {
        tree.setDetailedGridInfo(node, detailedGridInfo);
    }
    else {
        tree.set_detailed_grid_info?.(node, detailedGridInfo);
    }
}
function detailedGridTracksInfo(trackSet: GridTrackSet, gap: number) {
    return {
        negative_implicit_tracks: trackSet.originOffset,
        explicit_tracks: trackSet.explicitTrackCount,
        positive_implicit_tracks: Math.max(0, trackSet.tracks.length - trackSet.originOffset - trackSet.explicitTrackCount),
        gutters: trackSet.tracks
            .slice(0, -1)
            .map((_track: GridTrack, index: number) => trackGapAfter(trackSet.tracks, index, gap)),
        sizes: trackSet.tracks.map((track: GridTrack) => track.size),
    };
}
function detailedGridItemsInfo(item: GridItem, rows: GridTrackSet, columns: GridTrackSet) {
    const rowStart = item.row + rows.originOffset + 1;
    const columnStart = item.column + columns.originOffset + 1;
    return {
        row_start: rowStart,
        row_end: rowStart + item.rowSpan,
        column_start: columnStart,
        column_end: columnStart + item.columnSpan,
    };
}
function expandTracks(components: GridTemplateComponent[], autoRepeatCount: number | undefined): GridTrack[] {
    const tracks: GridTrack[] = [];
    if (autoRepeatCount === undefined)
        return tracks;
    for (const component of components) {
        if (component.type === "Single") {
            tracks.push(trackFromSizingFunction(component.track));
            continue;
        }
        const count = component.repetition.count.type === "Count"
            ? component.repetition.count.count
            : autoRepeatCount;
        const isAutoFit = component.repetition.count.type === "AutoFit";
        for (let repetition = 0; repetition < count; repetition += 1) {
            for (const track of component.repetition.tracks) {
                tracks.push(trackFromSizingFunction(track, isAutoFit));
            }
        }
    }
    return tracks;
}
function extendTracksToExplicitCount(tracks: GridTrack[], explicitTrackCount: number, autoTracks: TrackSizingFunction[]): GridTrack[] {
    if (tracks.length >= explicitTrackCount)
        return tracks;
    const extendedTracks = tracks.slice();
    const auto = autoTracks.length === 0
        ? [defaultAutoTrack()]
        : autoTracks.map((track) => trackFromSizingFunction(track));
    while (extendedTracks.length < explicitTrackCount) {
        extendedTracks.push({ ...auto[(extendedTracks.length - tracks.length) % auto.length] });
    }
    return extendedTracks;
}
function createNamedLineResolver(style: Style, columnAutoRepetitions: number, rowAutoRepetitions: number): NamedLineResolver {
    const resolver: NamedLineResolver = {
        rowLines: new Map(),
        columnLines: new Map(),
        areaColumnCount: 0,
        areaRowCount: 0,
        explicitColumnCount: 0,
        explicitRowCount: 0,
    };
    for (const area of style.gridTemplateAreas) {
        resolver.areaColumnCount = Math.max(resolver.areaColumnCount, Math.max(area.columnEnd, 1) - 1);
        resolver.areaRowCount = Math.max(resolver.areaRowCount, Math.max(area.rowEnd, 1) - 1);
        upsertLineName(resolver.columnLines, `${lineNameKey(area.name)}-start`, area.columnStart);
        upsertLineName(resolver.columnLines, `${lineNameKey(area.name)}-end`, area.columnEnd);
        upsertLineName(resolver.rowLines, `${lineNameKey(area.name)}-start`, area.rowStart);
        upsertLineName(resolver.rowLines, `${lineNameKey(area.name)}-end`, area.rowEnd);
    }
    addTemplateLineNames(resolver.columnLines, style.gridTemplateColumns, style.gridTemplateColumnNames, columnAutoRepetitions);
    addTemplateLineNames(resolver.rowLines, style.gridTemplateRows, style.gridTemplateRowNames, rowAutoRepetitions);
    sortAndDeduplicateLineNames(resolver.columnLines);
    sortAndDeduplicateLineNames(resolver.rowLines);
    return resolver;
}
function addTemplateLineNames(lineMap: Map<string, number[]>, components: GridTemplateComponent[], templateLineNames: string[][], autoRepetitions: number): void {
    let currentLine = 0;
    const lineNameSetCount = Math.max(templateLineNames.length, components.length);
    for (let componentIndex = 0; componentIndex < lineNameSetCount; componentIndex += 1) {
        currentLine += 1;
        const lineNames = templateLineNames[componentIndex] ?? [];
        for (const lineName of lineNames) {
            upsertLineName(lineMap, lineName, currentLine);
        }
        const component = components[componentIndex];
        if (component?.type !== "Repeat" || component.repetition.lineNames.length === 0)
            continue;
        const repeatCount = component.repetition.count.type === "Count"
            ? component.repetition.count.count
            : autoRepetitions;
        for (let repetition = 0; repetition < repeatCount; repetition += 1) {
            for (const repeatedLineNames of component.repetition.lineNames) {
                for (const lineName of repeatedLineNames) {
                    upsertLineName(lineMap, lineName, currentLine);
                }
                currentLine += 1;
            }
            currentLine -= 1;
        }
        currentLine -= 1;
    }
}
function upsertLineName(lineMap: Map<string, number[]>, name: string, line: number): void {
    const key = lineNameKey(name);
    const lines = lineMap.get(key);
    if (lines === undefined) {
        lineMap.set(key, [line]);
    }
    else {
        lines.push(line);
    }
}
function sortAndDeduplicateLineNames(lineMap: Map<string, number[]>): void {
    for (const [key, lines] of lineMap) {
        lineMap.set(key, [...new Set(lines.sort((left: number, right: number) => left - right))]);
    }
}
function resolveNamedLineNames(placement: Line, resolver: NamedLineResolver, axis: GridAxis): Line {
    const start = placement.start.type === "NamedLine"
        ? {
            type: "Line",
            line: findNamedLineIndex(resolver, placement.start.name, placement.start.line, axis, "start", (lines: number[]) => lines),
        }
        : placement.start;
    const end = placement.end.type === "NamedLine"
        ? {
            type: "Line",
            line: findNamedLineIndex(resolver, placement.end.name, placement.end.line, axis, "end", (lines: number[]) => lines),
        }
        : placement.end;
    if (start.type === "Line" && end.type === "NamedSpan") {
        const explicitTrackCount = axis === "row" ? resolver.explicitRowCount : resolver.explicitColumnCount;
        const normalizedStartLine = start.line > 0 ? start.line : Math.max(explicitTrackCount + 1 + start.line, 0);
        return new Line(start, {
            type: "Line",
            line: findNamedLineIndex(resolver, end.name, end.span, axis, "end", (lines: number[]) => linesAfter(lines, normalizedStartLine)),
        });
    }
    if (start.type === "NamedSpan" && end.type === "Line") {
        const explicitTrackCount = axis === "row" ? resolver.explicitRowCount : resolver.explicitColumnCount;
        const normalizedEndLine = end.line > 0 ? end.line : Math.max(explicitTrackCount + 1 + end.line, 0);
        return new Line({
            type: "Line",
            line: findNamedLineIndex(resolver, start.name, start.span, axis, "start", (lines: number[]) => linesBefore(lines, normalizedEndLine)),
        }, end);
    }
    return new Line(resolveNamedSpanAsUnitSpan(start), resolveNamedSpanAsUnitSpan(end));
}
function resolveNamedSpanAsUnitSpan(placement: GridPlacement): GridPlacement {
    return placement.type === "NamedSpan" ? { type: "Span", span: 1 } : placement;
}
function findNamedLineIndex(resolver: NamedLineResolver, name: string, index: number, axis: GridAxis, end: "start" | "end", filterLines: (lines: number[]) => number[]): number {
    const normalizedIndex = index === 0 ? 1 : index;
    const explicitTrackCount = axis === "row" ? resolver.explicitRowCount : resolver.explicitColumnCount;
    const lineMap = axis === "row" ? resolver.rowLines : resolver.columnLines;
    const key = lineNameKey(name);
    const lines = lineMap.get(key);
    if (lines !== undefined)
        return lineByIndex(filterLines(lines), explicitTrackCount, normalizedIndex);
    const implicitLines = lineMap.get(`${key}-${end}`);
    if (implicitLines !== undefined)
        return lineByIndex(filterLines(implicitLines), explicitTrackCount, normalizedIndex);
    return normalizedIndex > 0
        ? explicitTrackCount + 1 + normalizedIndex
        : -(explicitTrackCount + 1 + normalizedIndex);
}
function lineByIndex(lines: number[], explicitTrackCount: number, index: number): number {
    const absoluteIndex = Math.abs(index);
    if (absoluteIndex <= lines.length) {
        return index > 0 ? lines[absoluteIndex - 1] : lines[lines.length - absoluteIndex];
    }
    const remainingLines = (absoluteIndex - lines.length) * Math.sign(index);
    return index > 0
        ? explicitTrackCount + 1 + remainingLines
        : -(explicitTrackCount + 1 + remainingLines);
}
function linesAfter(lines: number[], line: number): number[] {
    const index = lines.findIndex((candidate: number) => candidate > line);
    return index === -1 ? [] : lines.slice(index);
}
function linesBefore(lines: number[], line: number): number[] {
    const index = lines.findIndex((candidate: number) => candidate >= line);
    return index === -1 ? lines : lines.slice(0, index);
}
function lineNameKey(name: string): string {
    return String(name);
}
function computeAutoRepeatCount(components: GridTemplateComponent[], innerSize: number | undefined, gap: number, autoRepeatStrategy: AutoRepeatStrategy | undefined, tree: any): number | undefined {
    const autoRepeatComponents = components.filter((component: GridTemplateComponent) => component.type === "Repeat" && component.repetition.count.type !== "Count");
    if (autoRepeatComponents.length === 0)
        return 0;
    if (autoRepeatComponents.length > 1 || !components.every(componentHasFixedTrackComponents))
        return undefined;
    if (innerSize === undefined)
        return 1;
    const repeatedComponent = autoRepeatComponents[0];
    if (repeatedComponent.type !== "Repeat" || repeatedComponent.repetition.tracks.length === 0)
        return undefined;
    const nonRepeatingTrackCount = nonAutoRepeatingTrackCount(components);
    const nonRepeatingTrackSpace = components.reduce((sum: number, component: GridTemplateComponent) => {
        if (component.type === "Single")
            return sum + trackDefiniteValue(component.track, innerSize, tree);
        if (component.repetition.count.type !== "Count")
            return sum;
        const repeatedSpace = component.repetition.tracks.reduce((trackSum: number, track: TrackSizingFunction) => trackSum + trackDefiniteValue(track, innerSize, tree), 0);
        return sum + repeatedSpace * component.repetition.count.count;
    }, 0);
    const perRepetitionTrackCount = repeatedComponent.repetition.tracks.length;
    const perRepetitionTrackSpace = repeatedComponent.repetition.tracks.reduce((sum: number, track: TrackSizingFunction) => sum + trackDefiniteValue(track, innerSize, tree), 0);
    const firstRepetitionSpace = nonRepeatingTrackSpace +
        perRepetitionTrackSpace +
        Math.max(nonRepeatingTrackCount + perRepetitionTrackCount - 1, 0) * gap;
    if (firstRepetitionSpace > innerSize)
        return 1;
    const perRepetitionSpace = perRepetitionTrackSpace + perRepetitionTrackCount * gap;
    if (perRepetitionSpace <= 0)
        return 1;
    const additionalRepetitions = (innerSize - firstRepetitionSpace) / perRepetitionSpace;
    const roundedAdditionalRepetitions = autoRepeatStrategy === "MaxThatDoNotOverflow"
        ? Math.floor(additionalRepetitions)
        : Math.ceil(additionalRepetitions);
    return roundedAdditionalRepetitions + 1;
}
function componentHasFixedTrackComponents(component: GridTemplateComponent): boolean {
    if (component.type === "Single")
        return component.track.hasFixedComponent();
    return (component.repetition.tracks.length > 0 &&
        component.repetition.tracks.every((track: TrackSizingFunction) => track.hasFixedComponent()));
}
function nonAutoRepeatingTrackCount(components: GridTemplateComponent[]): number {
    return components.reduce((count: number, component: GridTemplateComponent) => {
        if (component.type === "Single")
            return count + 1;
        if (component.repetition.count.type === "Count")
            return count + component.repetition.count.count * component.repetition.tracks.length;
        return count;
    }, 0);
}
function trackDefiniteValue(track: TrackSizingFunction, parentSize: number, tree: any): number {
    const max = track.max.definiteValue(parentSize, tree);
    const min = track.min.definiteValue(parentSize, tree);
    return max === undefined ? (min ?? 0) : Math.max(max, min ?? 0);
}
function trackFromSizingFunction(track: TrackSizingFunction, isAutoFit = false): GridTrack {
    const max = track.max.intoRaw();
    const min = track.min.intoRaw();
    const intrinsicContribution = intrinsicContributionFromMaxTrack(max.tag());
    const trackIntrinsicContribution = min.tag() === CompactLengthTag.MaxContent ? "max" : intrinsicContribution;
    const fitContentLimit = max.tag() === CompactLengthTag.FitContentPx ? max.value() : undefined;
    const fitContentPercent = max.tag() === CompactLengthTag.FitContentPercent ? max.value() : undefined;
    const minPercent = min.tag() === CompactLengthTag.Percent ? min.value() : undefined;
    const maxPercent = max.tag() === CompactLengthTag.Percent ? max.value() : undefined;
    const minCalc = min.isCalc() ? min : undefined;
    const maxCalc = max.isCalc() ? max : undefined;
    const maxPercentFloor = maxPercent === undefined && maxCalc === undefined ? undefined : percentMaxFloorFromMinTrack(min.tag());
    const fixedMaxFloor = max.tag() === CompactLengthTag.Length ? fixedMaxFloorFromMinTrack(min.tag()) : undefined;
    if (max.tag() === CompactLengthTag.Length) {
        const minValue = min.tag() === CompactLengthTag.Length ? min.value() : 0;
        const maxValue = max.value();
        return {
            size: minValue,
            growthLimit: f32Max(minValue, maxValue),
            fr: 0,
            isFlexible: false,
            percent: undefined,
            minPercent,
            maxPercent,
            minCalc,
            maxCalc,
            minPercentLimit: undefined,
            maxPercentLimit: undefined,
            maxPercentFloor,
            maxPercentFloorSize: undefined,
            isAuto: false,
            intrinsicContribution: trackIntrinsicContribution ?? fixedMaxFloor,
            fitContentLimit,
            fitContentPercent,
            fitContentFloorSize: undefined,
            minTrackKind: trackSizingKindFromTag(min.tag()),
            maxTrackKind: trackSizingKindFromTag(max.tag()),
            isAutoFit,
            isCollapsed: false,
        };
    }
    if (max.tag() === CompactLengthTag.Percent) {
        return {
            size: 0,
            fr: 0,
            isFlexible: false,
            percent: max.value(),
            minPercent,
            maxPercent,
            minCalc,
            maxCalc,
            minPercentLimit: undefined,
            maxPercentLimit: undefined,
            maxPercentFloor,
            maxPercentFloorSize: undefined,
            isAuto: false,
            intrinsicContribution: trackIntrinsicContribution ?? minIntrinsicContribution(min.tag()),
            fitContentLimit,
            fitContentPercent,
            fitContentFloorSize: undefined,
            minTrackKind: trackSizingKindFromTag(min.tag()),
            maxTrackKind: trackSizingKindFromTag(max.tag()),
            isAutoFit,
            isCollapsed: false,
        };
    }
    if (max.tag() === CompactLengthTag.Fr) {
        return {
            size: min.tag() === CompactLengthTag.Length ? min.value() : 0,
            fr: max.value(),
            isFlexible: true,
            percent: undefined,
            minPercent,
            maxPercent,
            minCalc,
            maxCalc,
            minPercentLimit: undefined,
            maxPercentLimit: undefined,
            maxPercentFloor,
            maxPercentFloorSize: undefined,
            isAuto: false,
            intrinsicContribution: "max",
            fitContentLimit,
            fitContentPercent,
            fitContentFloorSize: undefined,
            minTrackKind: trackSizingKindFromTag(min.tag()),
            maxTrackKind: trackSizingKindFromTag(max.tag()),
            isAutoFit,
            isCollapsed: false,
        };
    }
    if (min.tag() === CompactLengthTag.Length) {
        return {
            size: min.value(),
            fr: 0,
            isFlexible: false,
            percent: undefined,
            minPercent,
            maxPercent,
            minCalc,
            maxCalc,
            minPercentLimit: undefined,
            maxPercentLimit: undefined,
            maxPercentFloor,
            maxPercentFloorSize: undefined,
            isAuto: false,
            intrinsicContribution: trackIntrinsicContribution,
            fitContentLimit,
            fitContentPercent,
            fitContentFloorSize: undefined,
            minTrackKind: trackSizingKindFromTag(min.tag()),
            maxTrackKind: trackSizingKindFromTag(max.tag()),
            isAutoFit,
            isCollapsed: false,
        };
    }
    if (min.tag() === CompactLengthTag.Percent) {
        return {
            size: 0,
            fr: 0,
            isFlexible: false,
            percent: min.value(),
            minPercent,
            maxPercent,
            minCalc,
            maxCalc,
            minPercentLimit: undefined,
            maxPercentLimit: undefined,
            maxPercentFloor,
            maxPercentFloorSize: undefined,
            isAuto: false,
            intrinsicContribution: trackIntrinsicContribution,
            fitContentLimit,
            fitContentPercent,
            fitContentFloorSize: undefined,
            minTrackKind: trackSizingKindFromTag(min.tag()),
            maxTrackKind: trackSizingKindFromTag(max.tag()),
            isAutoFit,
            isCollapsed: false,
        };
    }
    return {
        size: 0,
        fr: 0,
        isFlexible: false,
        percent: undefined,
        minPercent,
        maxPercent,
        minCalc,
        maxCalc,
        minPercentLimit: undefined,
        maxPercentLimit: undefined,
        maxPercentFloor,
        maxPercentFloorSize: undefined,
        isAuto: max.tag() === CompactLengthTag.Auto,
        intrinsicContribution: trackIntrinsicContribution,
        fitContentLimit,
        fitContentPercent,
        fitContentFloorSize: undefined,
        minTrackKind: trackSizingKindFromTag(min.tag()),
        maxTrackKind: trackSizingKindFromTag(max.tag()),
        isAutoFit,
        isCollapsed: false,
    };
}
function trackSizingKindFromTag(tag: CompactLengthTag): TrackSizingKind {
    switch (tag) {
        case CompactLengthTag.Auto:
            return "auto";
        case CompactLengthTag.MinContent:
            return "min";
        case CompactLengthTag.MaxContent:
            return "max";
        case CompactLengthTag.FitContentPx:
        case CompactLengthTag.FitContentPercent:
            return "fit";
        case CompactLengthTag.Fr:
            return "flex";
        case CompactLengthTag.Percent:
        case CompactLengthTag.Calc:
            return "percent";
        default:
            return "fixed";
    }
}
function minIntrinsicContribution(tag: CompactLengthTag): IntrinsicContribution | undefined {
    switch (tag) {
        case CompactLengthTag.Auto:
        case CompactLengthTag.MaxContent:
            return "max";
        case CompactLengthTag.MinContent:
            return "min";
        default:
            return undefined;
    }
}
function percentMaxFloorFromMinTrack(tag: CompactLengthTag): IntrinsicContribution | undefined {
    switch (tag) {
        case CompactLengthTag.MinContent:
            return "min";
        case CompactLengthTag.MaxContent:
            return "max";
        default:
            return undefined;
    }
}
function fixedMaxFloorFromMinTrack(tag: CompactLengthTag): IntrinsicContribution | undefined {
    switch (tag) {
        case CompactLengthTag.MinContent:
            return "min";
        case CompactLengthTag.MaxContent:
            return "max";
        default:
            return undefined;
    }
}
function intrinsicContributionFromMaxTrack(tag: CompactLengthTag): IntrinsicContribution | undefined {
    switch (tag) {
        case CompactLengthTag.MinContent:
            return "min";
        case CompactLengthTag.Auto:
        case CompactLengthTag.MaxContent:
        case CompactLengthTag.FitContentPx:
        case CompactLengthTag.FitContentPercent:
            return "max";
        default:
            return undefined;
    }
}
function defaultAutoTrack(): GridTrack {
    return {
        size: 0,
        fr: 0,
        isFlexible: false,
        percent: undefined,
        minPercent: undefined,
        maxPercent: undefined,
        minPercentLimit: undefined,
        maxPercentLimit: undefined,
        maxPercentFloor: undefined,
        maxPercentFloorSize: undefined,
        isAuto: true,
        intrinsicContribution: "max",
        fitContentLimit: undefined,
        fitContentPercent: undefined,
        fitContentFloorSize: undefined,
        minTrackKind: "auto",
        maxTrackKind: "auto",
        isAutoFit: false,
        isCollapsed: false,
    };
}
function materializeTracks(explicitTracks: GridTrack[], autoTracks: TrackSizingFunction[], start: number, end: number): GridTrackSet {
    const negativeImplicitTrackCount = Math.max(0, -start);
    const auto = autoTracks.length === 0
        ? [defaultAutoTrack()]
        : autoTracks.map((track) => trackFromSizingFunction(track));
    const tracks: GridTrack[] = [];
    if (negativeImplicitTrackCount > 0) {
        const offset = auto.length - (negativeImplicitTrackCount % auto.length);
        for (let index = 0; index < negativeImplicitTrackCount; index += 1) {
            tracks.push({ ...auto[(offset + index) % auto.length] });
        }
    }
    tracks.push(...explicitTracks.map((track) => ({ ...track })));
    while (tracks.length < negativeImplicitTrackCount + end) {
        tracks.push({
            ...auto[(tracks.length - negativeImplicitTrackCount - explicitTracks.length) % auto.length],
        });
    }
    return {
        tracks,
        originOffset: negativeImplicitTrackCount,
        explicitTrackCount: explicitTracks.length,
    };
}
function gridTrackConstraintSize(innerKnownSize: number | undefined, maxOuterSize: number | undefined, availableSpace: AvailableSpaceValue, contentBoxInset: number): number | undefined {
    if (innerKnownSize !== undefined)
        return innerKnownSize;
    if (availableSpace.type === "MinContent")
        return 0;
    const availableSize = AvailableSpace.intoOption(availableSpace);
    if (maxOuterSize !== undefined && availableSize !== undefined)
        return Math.max(0, Math.min(maxOuterSize, availableSize) - contentBoxInset);
    if (maxOuterSize !== undefined)
        return Math.max(0, maxOuterSize - contentBoxInset);
    return availableSize === undefined ? undefined : Math.max(0, availableSize - contentBoxInset);
}
function resolvePercentageTracks(tracks: GridTrack[], innerSize: number | undefined, tree: any): void {
    if (innerSize === undefined)
        return;
    for (const track of tracks) {
        if (track.isCollapsed)
            continue;
        resolvePercentageTrackLimits(track, innerSize, tree);
        clampTrackToFitContentLimit(track);
        clampTrackToPercentageLimits(track);
    }
}
function tracksUsePercentage(tracks: GridTrack[]): boolean {
    return tracks.some((track: GridTrack) => !track.isCollapsed && (track.minPercent !== undefined ||
        track.maxPercent !== undefined ||
        track.minCalc !== undefined ||
        track.maxCalc !== undefined ||
        track.fitContentPercent !== undefined));
}
function resolvePercentageTrackLimits(track: GridTrack, innerSize: number, tree: any): void {
    if (track.minPercent !== undefined) {
        track.minPercentLimit = track.minPercent * innerSize;
        track.size = f32Max(track.size, track.minPercentLimit);
    }
    if (track.maxPercent !== undefined)
        track.maxPercentLimit = track.maxPercent * innerSize;
    if (track.minCalc !== undefined) {
        track.minPercentLimit = track.minCalc.resolvedPercentageSize(innerSize, tree);
        track.size = f32Max(track.size, track.minPercentLimit ?? 0);
    }
    if (track.maxCalc !== undefined)
        track.maxPercentLimit = track.maxCalc.resolvedPercentageSize(innerSize, tree);
    if (track.fitContentPercent !== undefined)
        track.fitContentLimit = track.fitContentPercent * innerSize;
}
function clampTrackToPercentageLimits(track: GridTrack): void {
    if (track.maxPercentLimit === undefined)
        return;
    const minLimit = f32Max(track.minPercentLimit ?? 0, track.maxPercentFloorSize ?? 0);
    track.size = f32Min(track.size, f32Max(track.maxPercentLimit, minLimit));
}
function clampTrackToFitContentLimit(track: GridTrack): void {
    if (track.fitContentLimit === undefined)
        return;
    track.size = f32Max(track.fitContentFloorSize ?? 0, f32Min(track.size, track.fitContentLimit));
}
function collapseEmptyAutoFitTracks(trackSet: GridTrackSet, items: GridItem[], axis: GridAxis, direction: Direction): void {
    const { tracks, originOffset } = trackSet;
    for (const [index, track] of tracks.entries()) {
        if (!track.isAutoFit)
            continue;
        const hasItem = items.some((item: GridItem) => {
            const start = axis === "column" ? item.column + originOffset : item.row + originOffset;
            const span = axis === "column" ? item.columnSpan : item.rowSpan;
            return index >= start && index < start + span;
        });
        if (!hasItem) {
            track.size = 0;
            track.fr = 0;
            track.isFlexible = false;
            track.percent = undefined;
            track.minPercent = undefined;
            track.maxPercent = undefined;
            track.minCalc = undefined;
            track.maxCalc = undefined;
            track.minPercentLimit = undefined;
            track.maxPercentLimit = undefined;
            track.maxPercentFloor = undefined;
            track.maxPercentFloorSize = undefined;
            track.isAuto = false;
            track.intrinsicContribution = undefined;
            track.fitContentLimit = undefined;
            track.fitContentPercent = undefined;
            track.fitContentFloorSize = undefined;
            track.minContentFloorSize = undefined;
            track.minTrackKind = "fixed";
            track.maxTrackKind = "fixed";
            track.growthLimit = undefined;
            track.isCollapsed = true;
        }
    }
}
function applySingleSpanItemContributions(items: GridItem[], columns: GridTrackSet, rows: GridTrackSet, parentSize: Size, columnGap: number, rowGap: number, axis: GridAxis, axisConstraintSize: number | undefined, containerStyle: Style, tree: any, measureFunction: any): void {
    for (const item of items) {
        let measuredColumnMinContentSize: Size | undefined;
        let measuredColumnMaxContentSize: Size | undefined;
        let measuredRowMinContentSize: Size | undefined;
        let measuredRowMaxContentSize: Size | undefined;
        const measureColumn = (contribution: TrackContribution): Size => contribution === "min"
            ? (measuredColumnMinContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpaceForTrackContribution("column", "min", item, columns, rows, parentSize, columnGap, rowGap), containerStyle, measureFunction))
            : (measuredColumnMaxContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpaceForTrackContribution("column", "max", item, columns, rows, parentSize, columnGap, rowGap), containerStyle, measureFunction));
        const measureRow = (contribution: TrackContribution): Size => {
            const availableSpace = availableSpaceForTrackContribution("row", contribution, item, columns, rows, parentSize, columnGap, rowGap);
            return contribution === "min"
                ? (measuredRowMinContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpace, containerStyle, measureFunction))
                : (measuredRowMaxContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpace, containerStyle, measureFunction));
        };
        const itemSize = preferredGridItemContributionSize(item, parentSize, tree);
        if (axis === "column" && item.columnSpan === 1) {
            const column = columns.tracks[item.column + columns.originOffset];
            const contribution = column === undefined ? undefined : trackContributionKind(column);
            if (column !== undefined && column.maxPercentFloor !== undefined) {
                column.maxPercentFloorSize = f32Max(column.maxPercentFloorSize ?? 0, measureColumn(column.maxPercentFloor).width);
            }
            if (column !== undefined &&
                trackHasFitContentLimit(column) &&
                !overflowIsScrollContainer(item.style.overflow.x)) {
                column.fitContentFloorSize = f32Max(column.fitContentFloorSize ?? 0, measureColumn("min").width);
            }
            if (column !== undefined && axisConstraintSize !== undefined && column.isAuto) {
                column.minContentFloorSize = f32Max(column.minContentFloorSize ?? 0, measureColumn("min").width);
            }
            const width = itemSize.width ??
                (column !== undefined && column.isAuto
                    ? compressibleReplacedMinimumContribution(item, "column", () => measureColumn("min").width, tree)
                    : undefined) ??
                (column !== undefined && contribution !== undefined
                    ? measureColumn(contribution).width
                    : undefined);
            if (width !== undefined && column !== undefined && contribution !== undefined) {
                column.size = f32Max(column.size, limitTrackContribution(column, width));
                updateSingleSpanGrowthLimit(column, width);
            }
        }
        if (axis === "row" && item.rowSpan === 1) {
            const row = rows.tracks[item.row + rows.originOffset];
            const contribution = row === undefined ? undefined : trackContributionKind(row);
            if (row !== undefined && row.maxPercentFloor !== undefined) {
                row.maxPercentFloorSize = f32Max(row.maxPercentFloorSize ?? 0, measureRow(row.maxPercentFloor).height);
            }
            if (row !== undefined &&
                trackHasFitContentLimit(row) &&
                !overflowIsScrollContainer(item.style.overflow.y)) {
                row.fitContentFloorSize = f32Max(row.fitContentFloorSize ?? 0, measureRow("min").height);
            }
            if (row !== undefined && axisConstraintSize !== undefined && row.isAuto) {
                row.minContentFloorSize = f32Max(row.minContentFloorSize ?? 0, measureRow("min").height);
            }
            const height = itemSize.height ??
                (row !== undefined && row.isAuto
                    ? compressibleReplacedMinimumContribution(item, "row", () => measureRow("min").height, tree)
                    : undefined) ??
                (row !== undefined && contribution !== undefined
                    ? measureRow(contribution).height
                    : undefined);
            if (height !== undefined && row !== undefined && contribution !== undefined) {
                row.size = f32Max(row.size, limitTrackContribution(row, height));
                updateSingleSpanGrowthLimit(row, height);
            }
        }
    }
}
function updateSingleSpanGrowthLimit(track: GridTrack, contribution: number): void {
    if (track.isCollapsed || contribution <= 0)
        return;
    let growthLimit: number | undefined;
    if (track.maxTrackKind === "fit") {
        growthLimit = f32Min(contribution, track.fitContentLimit ?? Number.POSITIVE_INFINITY);
    }
    else if (track.maxTrackKind === "auto" ||
        track.maxTrackKind === "max") {
        growthLimit = contribution;
    }
    else if (track.maxTrackKind === "min") {
        growthLimit = contribution;
    }
    if (growthLimit !== undefined) {
        track.growthLimit = f32Max(f32Max(track.growthLimit ?? 0, growthLimit), track.size);
    }
}
function trackAcceptsItemContribution(track: GridTrack): boolean {
    return trackContributionKind(track) !== undefined;
}
function trackContributionKind(track: GridTrack): TrackContribution | undefined {
    if (track.isCollapsed)
        return undefined;
    if (track.maxPercent !== undefined || track.maxCalc !== undefined)
        return "max";
    if (track.intrinsicContribution !== undefined)
        return track.intrinsicContribution;
    if (track.isFlexible || track.isAuto)
        return "max";
    return undefined;
}
function limitTrackContribution(track: GridTrack, contribution: number): number {
    let limitedContribution = contribution;
    if (track.fitContentLimit !== undefined) {
        limitedContribution = f32Max(track.fitContentFloorSize ?? 0, f32Min(limitedContribution, track.fitContentLimit));
    }
    if (track.maxPercentLimit !== undefined) {
        const floor = f32Max(track.minPercentLimit ?? 0, track.maxPercentFloorSize ?? 0);
        limitedContribution = f32Min(limitedContribution, f32Max(track.maxPercentLimit, floor));
    }
    return limitedContribution;
}
function trackHasFitContentLimit(track: GridTrack): boolean {
    return track.fitContentLimit !== undefined || track.fitContentPercent !== undefined;
}
function compressibleReplacedMinimumContribution(item: GridItem, axis: GridAxis, minContentContribution: () => number, tree: any): number | undefined {
    if (!item.style.isCompressibleReplaced())
        return undefined;
    let contribution = minContentContribution();
    const preferredSize = axis === "column" ? item.style.size.width : item.style.size.height;
    const maximumSize = axis === "column" ? item.style.maxSize.width : item.style.maxSize.height;
    const preferredSizeLimit = maybeResolveDimension(preferredSize, 0, tree);
    const maximumSizeLimit = maybeResolveDimension(maximumSize, 0, tree);
    if (preferredSizeLimit !== undefined)
        contribution = f32Min(contribution, preferredSizeLimit);
    if (maximumSizeLimit !== undefined)
        contribution = f32Min(contribution, maximumSizeLimit);
    return contribution;
}
function preferredGridItemContributionSize(item: GridItem, parentSize: Size, tree: any): Size {
    const style = item.style;
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const paddingBorderSize = rectSumAxes(rectAdd(padding, border));
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSize : Size.zero();
    const preferredSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(style.aspectRatio), boxSizingAdjustment);
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree);
    const flooredSize = maybeAddOptionalSize(maybeMaxOptionalSize(preferredSize, paddingBorderSize), rectSumAxes(margin));
    return new Size(flooredSize.width, flooredSize.height === undefined ? undefined : flooredSize.height + item.baselineShim);
}
function availableSpaceForTrackContribution(axis: GridAxis, contribution: TrackContribution, item: GridItem, columns: GridTrackSet, rows: GridTrackSet, parentSize: Size, columnGap: number, rowGap: number): Size {
    const contributionSpace = contribution === "min" ? AvailableSpace.minContent() : AvailableSpace.maxContent();
    if (axis === "column") {
        const rowSpan = spanSize(rows.tracks, item.row + rows.originOffset, item.rowSpan, rowGap);
        const availableHeight = rowSpan > 0 ? rowSpan : parentSize.height;
        return new Size(contributionSpace, availableHeight === undefined ? contributionSpace : AvailableSpace.definite(availableHeight));
    }
    const columnSpan = spanSize(columns.tracks, item.column + columns.originOffset, item.columnSpan, columnGap);
    const availableWidth = columnSpan > 0 ? columnSpan : parentSize.width;
    return new Size(availableWidth === undefined ? contributionSpace : AvailableSpace.definite(availableWidth), contributionSpace);
}
function measureGridItemForTrackContributions(tree: any, item: GridItem, parentSize: Size, availableSpace: Size, containerStyle: Style, measureFunction: any): Size {
    const knownDimensions = gridItemKnownDimensionsForContribution(item, parentSize, availableSpace, containerStyle, tree);
    const output = tree.computeChildLayout(item.node, new LayoutInput({
        runMode: RunMode.ComputeSize,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions,
        parentSize,
        availableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    }), measureFunction);
    const measuredContribution = new Size(parentSize.width !== undefined && overflowIsScrollContainer(item.style.overflow.x)
        ? f32Min(output.size.width, parentSize.width)
        : output.size.width, parentSize.height !== undefined && overflowIsScrollContainer(item.style.overflow.y)
        ? f32Min(output.size.height, parentSize.height)
        : output.size.height);
    const padding = resolveLengthPercentageRectOrZero(item.style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(item.style.border, parentSize.width, tree);
    const paddingBorderSize = rectSumAxes(rectAdd(padding, border));
    const contribution = new Size(f32Max(measuredContribution.width, paddingBorderSize.width), f32Max(measuredContribution.height, paddingBorderSize.height));
    const margin = resolveLengthPercentageAutoRectOrZero(item.style.margin, parentSize.width, tree);
    return sizeAdd(sizeAdd(contribution, rectSumAxes(margin)), new Size(0, item.baselineShim));
}
function gridItemKnownDimensionsForContribution(item: GridItem, parentSize: Size, availableSpace: Size, containerStyle: Style, tree: any): Size {
    const areaSize = new Size(AvailableSpace.intoOption(availableSpace.width), AvailableSpace.intoOption(availableSpace.height));
    const margin = gridItemContributionMarginSize(item, parentSize, tree);
    const constraints = gridItemConstraints(item.style, areaSize, tree);
    const justify = item.style.justifySelf ??
        containerStyle.justifyItems ??
        (constraints.inherentSize.width !== undefined ? AlignItems.Start : AlignItems.Stretch);
    const align = item.style.alignSelf ??
        containerStyle.alignItems ??
        (constraints.inherentSize.height !== undefined || item.style.aspectRatio !== undefined
            ? AlignItems.Start
            : AlignItems.Stretch);
    let width = constraints.inherentSize.width;
    let height = constraints.inherentSize.height;
    if (width === undefined &&
        justify === AlignItems.Stretch &&
        !item.style.margin.left.isAuto() &&
        !item.style.margin.right.isAuto() &&
        areaSize.width !== undefined) {
        width = Math.max(0, areaSize.width - margin.width);
    }
    ({ width, height } = new Size(width, height).maybeApplyAspectRatio(item.style.aspectRatio));
    if (height === undefined &&
        align === AlignItems.Stretch &&
        !item.style.margin.top.isAuto() &&
        !item.style.margin.bottom.isAuto() &&
        areaSize.height !== undefined) {
        height = Math.max(0, areaSize.height - margin.height);
    }
    return maybeClampOptionalSize(new Size(width, height).maybeApplyAspectRatio(item.style.aspectRatio), constraints.minSize, constraints.maxSize);
}
function gridItemContributionMarginSize(item: GridItem, parentSize: Size, tree: any): Size {
    return new Size((item.style.margin.left.resolveToOption(0, tree) ?? 0) + (item.style.margin.right.resolveToOption(0, tree) ?? 0), (item.style.margin.top.resolveToOption(parentSize.width, tree) ?? 0) +
        (item.style.margin.bottom.resolveToOption(parentSize.width, tree) ?? 0) +
        item.baselineShim);
}
function resolveGridItemBaselines(items: GridItem[], containerAlignItems: AlignItems | undefined, parentSize: Size, tree: any, measureFunction: any): void {
    if (!items.some((item: GridItem) => gridItemAlignSelf(item, containerAlignItems) === AlignItems.Baseline))
        return;
    const itemsByRow = new Map<number, GridItem[]>();
    for (const item of items) {
        const rowItems = itemsByRow.get(item.row);
        if (rowItems === undefined) {
            itemsByRow.set(item.row, [item]);
        }
        else {
            rowItems.push(item);
        }
    }
    for (const rowItems of itemsByRow.values()) {
        const baselineItemCount = rowItems.filter((item: GridItem) => gridItemAlignSelf(item, containerAlignItems) === AlignItems.Baseline).length;
        if (baselineItemCount <= 1)
            continue;
        for (const item of rowItems) {
            const output = tree.computeChildLayout(item.node, new LayoutInput({
                runMode: RunMode.PerformLayout,
                sizingMode: SizingMode.InherentSize,
                axis: RequestedAxis.Both,
                knownDimensions: Size.none(),
                parentSize,
                availableSpace: new Size(AvailableSpace.minContent(), AvailableSpace.minContent()),
                verticalMarginsAreCollapsible: Line.false(),
            }), measureFunction);
            const margin = resolveLengthPercentageAutoRectOrZero(item.style.margin, parentSize.width, tree);
            item.baseline = (output.firstBaselines.y ?? output.size.height) + margin.top;
        }
        const rowMaxBaseline = rowItems.reduce((baseline: number, item: GridItem) => f32Max(baseline, item.baseline ?? 0), 0);
        for (const item of rowItems) {
            item.baselineShim = rowMaxBaseline - (item.baseline ?? 0);
        }
    }
}
function applySpanningItemContributions(items: GridItem[], columns: GridTrackSet, rows: GridTrackSet, parentSize: Size, columnGap: number, rowGap: number, axis: GridAxis, axisAvailableSpace: AvailableSpaceValue, containerStyle: Style, tree: any, measureFunction: any): void {
    for (const item of items) {
        let measuredMinContentSize: Size | undefined;
        let measuredMaxContentSize: Size | undefined;
        const measure = (contribution: TrackContribution): Size => contribution === "min"
            ? (measuredMinContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpaceForTrackContribution(axis, "min", item, columns, rows, parentSize, columnGap, rowGap), containerStyle, measureFunction))
            : (measuredMaxContentSize ??= measureGridItemForTrackContributions(tree, item, parentSize, availableSpaceForTrackContribution(axis, "max", item, columns, rows, parentSize, columnGap, rowGap), containerStyle, measureFunction));
        const itemSize = preferredGridItemContributionSize(item, parentSize, tree);
        if (axis === "column" && item.columnSpan > 1) {
            applySpanningTrackSizingContribution(columns.tracks, item.column + columns.originOffset, item.columnSpan, columnGap, itemSize.width, measure("min").width, measure("max").width, overflowIsScrollContainer(item.style.overflow.x), axisAvailableSpace);
        }
        if (axis === "row" && item.rowSpan > 1) {
            applySpanningTrackSizingContribution(rows.tracks, item.row + rows.originOffset, item.rowSpan, rowGap, itemSize.height, measure("min").height, measure("max").height, overflowIsScrollContainer(item.style.overflow.y), axisAvailableSpace);
        }
    }
}
function applySpanningTrackSizingContribution(tracks: GridTrack[], start: number, span: number, gap: number, preferredSize: number | undefined, minContentSize: number, maxContentSize: number, isScrollContainer: boolean, axisAvailableSpace: AvailableSpaceValue): void {
    const spannedTracks = tracks.slice(start, start + span);
    if (spannedTracks.some((track: GridTrack) => track.isFlexible)) {
        const contribution = spanContributionKind(spannedTracks);
        const itemSize = preferredSize ?? (contribution === "min" ? minContentSize : maxContentSize);
        applyFlexibleSpanningContribution(tracks, start, span, gap, itemSize);
        return;
    }
    const contributionMinSize = preferredSize ?? minContentSize;
    const contributionMaxSize = preferredSize ?? maxContentSize;
    const minimumContribution = isScrollContainer ? 0 : contributionMinSize;
    distributeSpanningContribution(tracks, start, span, gap, minimumContribution, trackHasIntrinsicMinSizing, trackGrowthLimit, "minimum");
    distributeSpanningContribution(tracks, start, span, gap, contributionMinSize, trackHasMinOrMaxContentMinSizing, isScrollContainer ? trackFitContentLimit : trackGrowthLimit, "minimum");
    if (!isScrollContainer) {
        for (const track of tracks.slice(start, start + span)) {
            if (trackHasFitContentLimit(track)) {
                track.fitContentFloorSize = f32Max(track.fitContentFloorSize ?? 0, track.size);
            }
        }
    }
    if (axisAvailableSpace.type === "MaxContent") {
        const spannedTracks = tracks.slice(start, start + span);
        const hasMaxContentMinTrack = spannedTracks.some(trackHasMaxContentMinSizing);
        distributeSpanningContribution(tracks, start, span, gap, contributionMaxSize, hasMaxContentMinTrack ? trackHasMaxContentMinSizing : trackHasAutoMinSizing, hasMaxContentMinTrack ? () => Number.POSITIVE_INFINITY : trackFitContentLimit, "maximum");
    }
    distributeSpanningContribution(tracks, start, span, gap, contributionMaxSize, trackHasMaxContentMinSizing, trackGrowthLimit, "maximum");
}
function spanContributionKind(tracks: GridTrack[]): TrackContribution | undefined {
    const contributions = tracks.map(trackContributionKind);
    if (contributions.includes("max"))
        return "max";
    if (contributions.includes("min"))
        return "min";
    return undefined;
}
function applyFlexibleSpanningContribution(tracks: GridTrack[], start: number, span: number, gap: number, itemSize: number): void {
    const spannedTracks = tracks.slice(start, start + span);
    const targetTrackSpace = f32Max(itemSize - Math.max(span - 1, 0) * gap, 0);
    const currentTrackSpace = spannedTracks.reduce((sum: number, track: GridTrack) => sum + track.size, 0);
    const extra = targetTrackSpace - currentTrackSpace;
    if (extra <= 0)
        return;
    const flexibleTracks = spannedTracks.filter((track: GridTrack) => track.isFlexible);
    const flexibleFraction = flexibleTracks.reduce((sum: number, track: GridTrack) => sum + track.fr, 0);
    if (flexibleFraction > 0) {
        for (const track of flexibleTracks) {
            track.size += extra * (track.fr / flexibleFraction);
        }
        return;
    }
    const share = extra / flexibleTracks.length;
    for (const track of flexibleTracks) {
        track.size += share;
    }
}
function distributeSpanningContribution(tracks: GridTrack[], start: number, span: number, gap: number, itemSize: number, trackIsAffected: (track: GridTrack) => boolean, trackLimit: (track: GridTrack) => number, contributionType: ContributionType): void {
    const spannedTracks = tracks.slice(start, start + span);
    if (!spannedTracks.some(trackIsAffected))
        return;
    const targetTrackSpace = f32Max(itemSize - Math.max(span - 1, 0) * gap, 0);
    const currentTrackSpace = spannedTracks.reduce((sum: number, track: GridTrack) => sum + track.size, 0);
    let extra = targetTrackSpace - currentTrackSpace;
    if (extra <= 0)
        return;
    extra = distributeSpaceUpToLimits(extra, spannedTracks, trackIsAffected, trackLimit);
    if (extra <= 0.000001)
        return;
    const fallback = contributionType === "minimum" ? trackHasIntrinsicMaxSizing : trackHasMaxOrFitContentMaxSizing;
    const fallbackHasTrack = spannedTracks.some((track: GridTrack) => trackIsAffected(track) && fallback(track));
    distributeSpaceUpToLimits(extra, spannedTracks, (track: GridTrack) => trackIsAffected(track) && (fallbackHasTrack ? fallback(track) : true), trackLimit);
}
function distributeSpaceUpToLimits(space: number, tracks: GridTrack[], trackIsAffected: (track: GridTrack) => boolean, trackLimit: (track: GridTrack) => number): number {
    let remaining = space;
    while (remaining > 0.01) {
        const growable = tracks.filter((track: GridTrack) => trackIsAffected(track) && track.size < trackLimit(track));
        if (growable.length === 0)
            return remaining;
        const share = remaining / growable.length;
        let distributed = 0;
        for (const track of growable) {
            const increase = f32Min(share, trackLimit(track) - track.size);
            if (increase > 0) {
                track.size += increase;
                distributed += increase;
            }
        }
        if (distributed <= 0)
            return remaining;
        remaining -= distributed;
    }
    return remaining;
}
function trackHasIntrinsicMinSizing(track: GridTrack): boolean {
    return !track.isCollapsed && ["auto", "min", "max", "percent"].includes(track.minTrackKind);
}
function trackHasMinOrMaxContentMinSizing(track: GridTrack): boolean {
    return !track.isCollapsed && (track.minTrackKind === "min" || track.minTrackKind === "max");
}
function trackHasMaxContentMinSizing(track: GridTrack): boolean {
    return !track.isCollapsed && track.minTrackKind === "max";
}
function trackHasAutoMinSizing(track: GridTrack): boolean {
    return !track.isCollapsed && track.minTrackKind === "auto" && track.maxTrackKind !== "min";
}
function trackHasIntrinsicMaxSizing(track: GridTrack): boolean {
    return !track.isCollapsed && ["auto", "min", "max", "fit", "percent"].includes(track.maxTrackKind);
}
function trackHasMaxOrFitContentMaxSizing(track: GridTrack): boolean {
    return !track.isCollapsed && (track.minTrackKind === "max" || track.maxTrackKind === "max" || track.maxTrackKind === "fit");
}
function trackGrowthLimit(track: GridTrack): number {
    if (track.maxPercentLimit !== undefined) {
        return f32Max(track.maxPercentLimit, f32Max(track.minPercentLimit ?? 0, track.maxPercentFloorSize ?? 0));
    }
    return track.growthLimit ?? Number.POSITIVE_INFINITY;
}
function trackFitContentLimit(track: GridTrack): number {
    return track.fitContentLimit ?? Number.POSITIVE_INFINITY;
}
function shrinkAutoTracksToFit(tracks: GridTrack[], innerSize: number | undefined, gap: number): void {
    if (innerSize === undefined)
        return;
    let overflow = trackSum(tracks, gap) - innerSize;
    if (overflow <= 0)
        return;
    let shrinkableTracks = tracks.filter((track: GridTrack) => !track.isCollapsed &&
        track.isAuto &&
        track.minContentFloorSize !== undefined &&
        track.size > track.minContentFloorSize);
    while (overflow > 0 && shrinkableTracks.length > 0) {
        const share = overflow / shrinkableTracks.length;
        let shrunk = 0;
        for (const track of shrinkableTracks) {
            const floor = track.minContentFloorSize ?? 0;
            const decrease = f32Min(share, track.size - floor);
            track.size -= decrease;
            shrunk += decrease;
        }
        if (shrunk <= 0)
            return;
        overflow -= shrunk;
        shrinkableTracks = shrinkableTracks.filter((track: GridTrack) => track.size > (track.minContentFloorSize ?? 0));
    }
}
function maximiseTracks(tracks: GridTrack[], innerSize: number | undefined, gap: number, availableSpace: AvailableSpaceValue): void {
    if (innerSize === undefined) {
        if (availableSpace.type === "MaxContent") {
            for (const track of tracks) {
                if (!track.isCollapsed && track.growthLimit !== undefined) {
                    track.size = f32Max(track.size, track.growthLimit);
                }
            }
        }
        return;
    }
    let freeSpace = innerSize - trackSum(tracks, gap);
    if (freeSpace <= 0)
        return;
    let growableTracks = tracks.filter((track: GridTrack) => !track.isCollapsed && track.growthLimit !== undefined && track.size < track.growthLimit);
    while (freeSpace > 0 && growableTracks.length > 0) {
        const share = freeSpace / growableTracks.length;
        let distributed = 0;
        for (const track of growableTracks) {
            const growthLimit = track.growthLimit ?? track.size;
            const increase = f32Min(share, growthLimit - track.size);
            track.size += increase;
            distributed += increase;
        }
        if (distributed <= 0)
            return;
        freeSpace -= distributed;
        growableTracks = growableTracks.filter((track: GridTrack) => track.growthLimit !== undefined && track.size < track.growthLimit);
    }
}
function stretchAutoTracks(tracks: GridTrack[], innerSize: number | undefined, gap: number, alignment: AlignContent): void {
    if (innerSize === undefined || alignment !== AlignContent.Stretch)
        return;
    const autoTracks = tracks.filter((track: GridTrack) => !track.isCollapsed && track.isAuto && track.fr === 0);
    if (autoTracks.length === 0)
        return;
    const usedSize = trackSum(tracks, gap);
    if (usedSize >= innerSize)
        return;
    const addition = (innerSize - usedSize) / autoTracks.length;
    for (const track of autoTracks) {
        track.size += addition;
    }
}
function resolveFlexibleTracks(tracks: GridTrack[], innerSize: number | undefined, gap: number): void {
    const flexibleTracks = tracks.filter((track: GridTrack) => !track.isCollapsed && track.isFlexible);
    if (flexibleTracks.length === 0)
        return;
    if (innerSize === undefined) {
        const flexFraction = flexibleTracks.reduce((fraction: number, track: GridTrack) => {
            const trackFraction = track.fr > 1 ? track.size / track.fr : track.size;
            return f32Max(fraction, trackFraction);
        }, 0);
        for (const track of flexibleTracks) {
            track.size = f32Max(track.size, track.fr * flexFraction);
        }
        return;
    }
    const spaceToFill = f32Max(innerSize - trackGapSum(tracks, gap), 0);
    const baseSize = tracks.reduce((sum: number, track: GridTrack) => sum + track.size, 0);
    if (spaceToFill <= baseSize)
        return;
    const flexFraction = findSizeOfFr(tracks, spaceToFill);
    for (const track of flexibleTracks) {
        track.size = f32Max(track.size, track.fr * flexFraction);
    }
}
function findSizeOfFr(tracks: GridTrack[], spaceToFill: number): number {
    if (spaceToFill === 0)
        return 0;
    let hypotheticalFrSize = Number.POSITIVE_INFINITY;
    while (true) {
        let usedSpace = 0;
        let flexFactorSum = 0;
        for (const track of tracks) {
            if (track.isFlexible && track.fr * hypotheticalFrSize >= track.size) {
                flexFactorSum += track.fr;
            }
            else {
                usedSpace += track.size;
            }
        }
        const previousFrSize = hypotheticalFrSize;
        hypotheticalFrSize = (spaceToFill - usedSpace) / f32Max(flexFactorSum, 1);
        const isValid = tracks.every((track: GridTrack) => {
            if (!track.isFlexible)
                return true;
            return track.fr * hypotheticalFrSize >= track.size || track.fr * previousFrSize < track.size;
        });
        if (isValid)
            return hypotheticalFrSize;
    }
}
function placeItems(items: GridItem[], explicitColumnCount: number, explicitRowCount: number, gridAutoFlow: GridAutoFlow, namedLineResolver: NamedLineResolver): GridItem[] {
    const occupied: OccupiedGridCells = new Set();
    const columns = Math.max(explicitColumnCount, 1);
    const rows = Math.max(explicitRowCount, 1);
    const isColumnFlow = gridAutoFlow === GridAutoFlow.Column || gridAutoFlow === GridAutoFlow.ColumnDense;
    const isDense = gridAutoFlow === GridAutoFlow.RowDense || gridAutoFlow === GridAutoFlow.ColumnDense;
    const placements = new Map<GridItem, AxisPlacement>();
    const placed = new Set<GridItem>();
    for (const item of items) {
        const columnPlacement = resolvePlacement(resolveNamedLineNames(item.style.gridColumn, namedLineResolver, "column"), explicitColumnCount);
        const rowPlacement = resolvePlacement(resolveNamedLineNames(item.style.gridRow, namedLineResolver, "row"), explicitRowCount);
        placements.set(item, { column: columnPlacement, row: rowPlacement });
        item.columnSpan = columnPlacement.span;
        item.rowSpan = rowPlacement.span;
    }
    const bounds = gridPlacementBounds(placements, explicitColumnCount, explicitRowCount);
    for (const item of items) {
        const placement = placements.get(item)!;
        if (placement.column.start !== undefined && placement.row.start !== undefined) {
            placeAt(item, placement.row.start, placement.column.start, occupied);
            placed.add(item);
        }
    }
    const secondaryDefiniteItems = items.filter((item: GridItem) => {
        if (placed.has(item))
            return false;
        const placement = placements.get(item)!;
        return isColumnFlow
            ? placement.column.start !== undefined && placement.row.start === undefined
            : placement.row.start !== undefined && placement.column.start === undefined;
    });
    for (const item of secondaryDefiniteItems) {
        const placement = placements.get(item)!;
        if (isColumnFlow) {
            const columnStart = placement.column.start!;
            item.column = columnStart;
            item.row = firstFreeInAxis(occupied, columnStart, item.columnSpan, item.rowSpan, bounds.rowStart, bounds.rowEnd, "row");
        }
        else {
            const rowStart = placement.row.start!;
            item.row = rowStart;
            item.column = firstFreeInAxis(occupied, rowStart, item.rowSpan, item.columnSpan, bounds.columnStart, bounds.columnEnd, "column");
        }
        occupy(occupied, item.row, item.column, item.rowSpan, item.columnSpan);
        placed.add(item);
    }
    let cursor = {
        row: bounds.rowStart,
        column: bounds.columnStart,
    };
    for (const item of items) {
        if (placed.has(item))
            continue;
        const placement = placements.get(item)!;
        if (isColumnFlow && placement.row.start !== undefined) {
            item.row = placement.row.start;
            item.column = firstFreeInAxis(occupied, placement.row.start, item.rowSpan, item.columnSpan, bounds.columnStart, bounds.columnEnd, "column");
        }
        else if (!isColumnFlow && placement.column.start !== undefined) {
            item.column = placement.column.start;
            item.row = firstFreeInAxis(occupied, placement.column.start, item.columnSpan, item.rowSpan, bounds.rowStart, bounds.rowEnd, "row");
        }
        else {
            let row = cursor.row;
            let column = cursor.column;
            while (autoPlacementOutOfBounds(row, column, item.rowSpan, item.columnSpan, bounds, isColumnFlow) ||
                areaOccupied(occupied, row, column, item.rowSpan, item.columnSpan)) {
                ({ row, column } = advanceAutoPlacementCursor(row, column, bounds, isColumnFlow));
            }
            item.row = row;
            item.column = column;
            cursor = isDense
                ? { row: bounds.rowStart, column: bounds.columnStart }
                : isColumnFlow
                    ? { row: item.row + item.rowSpan, column: item.column }
                    : { row: item.row, column: item.column + item.columnSpan };
        }
        occupy(occupied, item.row, item.column, item.rowSpan, item.columnSpan);
        placed.add(item);
    }
    return items;
}
function gridPlacementBounds(placements: Map<GridItem, AxisPlacement>, explicitColumnCount: number, explicitRowCount: number): GridPlacementBounds {
    let columnStart = 0;
    let rowStart = 0;
    let columnEnd = Math.max(explicitColumnCount, 1);
    let rowEnd = Math.max(explicitRowCount, 1);
    for (const placement of placements.values()) {
        if (placement.column.start !== undefined) {
            columnStart = Math.min(columnStart, placement.column.start);
            columnEnd = Math.max(columnEnd, placement.column.start + placement.column.span);
        }
        if (placement.row.start !== undefined) {
            rowStart = Math.min(rowStart, placement.row.start);
            rowEnd = Math.max(rowEnd, placement.row.start + placement.row.span);
        }
    }
    return { columnStart, columnEnd, rowStart, rowEnd };
}
function autoPlacementOutOfBounds(row: number, column: number, rowSpan: number, columnSpan: number, bounds: GridPlacementBounds, isColumnFlow: boolean): boolean {
    return isColumnFlow ? row + rowSpan > bounds.rowEnd : column + columnSpan > bounds.columnEnd;
}
function advanceAutoPlacementCursor(row: number, column: number, bounds: GridPlacementBounds, isColumnFlow: boolean): { row: number; column: number } {
    if (isColumnFlow) {
        row += 1;
        return row >= bounds.rowEnd ? { row: bounds.rowStart, column: column + 1 } : { row, column };
    }
    column += 1;
    return column >= bounds.columnEnd ? { row: row + 1, column: bounds.columnStart } : { row, column };
}
function placeAt(item: GridItem, row: number, column: number, occupied: OccupiedGridCells): void {
    item.row = row;
    item.column = column;
    occupy(occupied, item.row, item.column, item.rowSpan, item.columnSpan);
}
function resolvePlacement(placement: Line, explicitTrackCount: number): ResolvedPlacement {
    const startLine = placement.start.type === "Line"
        ? lineToOriginZero(placement.start.line, explicitTrackCount)
        : undefined;
    const endLine = placement.end.type === "Line"
        ? lineToOriginZero(placement.end.line, explicitTrackCount)
        : undefined;
    if (startLine !== undefined) {
        if (endLine !== undefined) {
            return startLine === endLine
                ? { start: startLine, span: 1 }
                : { start: Math.min(startLine, endLine), span: Math.abs(endLine - startLine) };
        }
        if (placement.end.type === "Span")
            return { start: startLine, span: placement.end.span };
        return { start: startLine, span: 1 };
    }
    if (placement.start.type === "Span" && endLine !== undefined) {
        return { start: endLine - placement.start.span, span: placement.start.span };
    }
    if (endLine !== undefined) {
        return { start: endLine - 1, span: 1 };
    }
    return {
        start: undefined,
        span: placement.start.type === "Span"
            ? placement.start.span
            : placement.end.type === "Span"
                ? placement.end.span
                : 1,
    };
}
function lineToOriginZero(line: number, explicitTrackCount: number): number | undefined {
    if (line === 0)
        return undefined;
    return line > 0 ? line - 1 : line + explicitTrackCount + 1;
}
function firstFreeInAxis(occupied: OccupiedGridCells, fixedStart: number, fixedSpan: number, autoSpan: number, searchStart: number, searchEnd: number, axis: GridAxis): number {
    for (let index = searchStart; index < searchEnd + 100; index += 1) {
        const row = axis === "row" ? index : fixedStart;
        const column = axis === "row" ? fixedStart : index;
        const rowSpan = axis === "row" ? autoSpan : fixedSpan;
        const columnSpan = axis === "row" ? fixedSpan : autoSpan;
        if (!areaOccupied(occupied, row, column, rowSpan, columnSpan))
            return index;
    }
    return searchEnd;
}
function areaOccupied(occupied: OccupiedGridCells, row: number, column: number, rowSpan: number, columnSpan: number): boolean {
    for (let y = row; y < row + rowSpan; y += 1) {
        for (let x = column; x < column + columnSpan; x += 1) {
            if (occupied.has(`${y}:${x}`))
                return true;
        }
    }
    return false;
}
function occupy(occupied: OccupiedGridCells, row: number, column: number, rowSpan: number, columnSpan: number): void {
    for (let y = row; y < row + rowSpan; y += 1) {
        for (let x = column; x < column + columnSpan; x += 1) {
            occupied.add(`${y}:${x}`);
        }
    }
}
function trackOffsets(tracks: GridTrack[], gap: number, start: number, containerSize: number, alignment: AlignContent): number[] {
    const offsets = [start];
    let cursor = start;
    const usedSize = trackSum(tracks, gap);
    const freeSpace = containerSize - usedSize;
    const nonCollapsedTrackCount = Math.max(tracks.filter((track: GridTrack) => !track.isCollapsed).length, 1);
    const alignmentMode = applyAlignmentFallback(freeSpace, nonCollapsedTrackCount, alignment, false);
    let seenNonCollapsedTrack = false;
    for (const [index, track] of tracks.entries()) {
        const offset = track.isCollapsed
            ? 0
            : computeAlignmentOffset(freeSpace, nonCollapsedTrackCount, 0, alignmentMode, false, !seenNonCollapsedTrack);
        cursor += offset;
        offsets[index] = cursor;
        cursor += track.size + trackGapAfter(tracks, index, gap);
        offsets.push(cursor);
        if (!track.isCollapsed)
            seenNonCollapsedTrack = true;
    }
    return offsets;
}
function gridArea(item: GridItem, columns: GridTrackSet, rows: GridTrackSet, columnOffsets: number[], rowOffsets: number[], columnGap: number, rowGap: number, columnContentStart: number, innerWidth: number, direction: Direction): Rect {
    const columnStart = item.column + columns.originOffset;
    const rowStart = item.row + rows.originOffset;
    const columnWidth = spanSize(columns.tracks, columnStart, item.columnSpan, columnGap);
    const ltrColumnLeft = columnOffsets[columnStart];
    const columnLeft = direction === Direction.Rtl
        ? columnContentStart + innerWidth - (ltrColumnLeft - columnContentStart) - columnWidth
        : ltrColumnLeft;
    return new Rect(columnLeft, columnLeft + columnWidth, rowOffsets[rowStart], rowOffsets[rowStart] + spanSize(rows.tracks, rowStart, item.rowSpan, rowGap));
}
function layoutGridItem(tree: any, item: GridItem, area: Rect, containerStyle: Style, measureFunction: any): Size {
    const areaSize = new Size(area.right - area.left, area.bottom - area.top);
    const optionalMargin = item.style.margin.map((value: any) => value.resolveToOption(areaSize.width, tree));
    const margin = optionalMargin.map((value: number | undefined) => value ?? 0);
    const inset = item.style.inset.zipSize(areaSize, (value: any, context: number | undefined) => value.resolveToOption(context, tree));
    const isAbsolute = item.style.position === Position.Absolute;
    const sizing = gridItemSizing(item.style, areaSize, margin, optionalMargin, inset, isAbsolute, item.style.justifySelf ?? containerStyle.justifyItems, item.style.alignSelf ?? containerStyle.alignItems, item.baselineShim, tree);
    const childAvailableSpace = new Size(AvailableSpace.definite(areaSize.width - rectHorizontalAxisSum(margin)), AvailableSpace.definite(areaSize.height - rectVerticalAxisSum(margin) - item.baselineShim));
    let childKnownDimensions = sizing.knownDimensions;
    if (isAbsolute && !childKnownDimensions.bothAxisDefined()) {
        const measuredOutput = tree.computeChildLayout(item.node, new LayoutInput({
            runMode: RunMode.ComputeSize,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions: childKnownDimensions,
            parentSize: areaSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        childKnownDimensions = new Size(measuredOutput.size.width, measuredOutput.size.height);
    }
    const output = tree.computeChildLayout(item.node, new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: childKnownDimensions,
        parentSize: areaSize,
        availableSpace: childAvailableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    }), measureFunction);
    item.output = output;
    const itemSize = maybeClampSize(childKnownDimensions.unwrapOr(output.size), sizing.minSize, sizing.maxSize);
    const inlineAlignment = axisAlignment(sizing.justify, areaSize.width, itemSize.width, optionalMargin.left, optionalMargin.right, isAbsolute, inset.left, inset.right, containerStyle.direction);
    const blockAlignment = axisAlignment(sizing.align, areaSize.height, itemSize.height, optionalMargin.top, optionalMargin.bottom, isAbsolute, inset.top, inset.bottom, Direction.Ltr, item.baselineShim);
    const resolvedMargin = new Rect(inlineAlignment.startMargin, inlineAlignment.endMargin, blockAlignment.startMargin, blockAlignment.endMargin);
    const location = new Point(area.left +
        inlineAlignment.offset +
        relativeInsetOffset(optionalInsetLine(inset.left, inset.right), item.style.position, containerStyle.direction), area.top +
        blockAlignment.offset +
        relativeInsetOffset(optionalInsetLine(inset.top, inset.bottom), item.style.position, Direction.Ltr));
    item.baseline = output.firstBaselines.y;
    item.yPosition = location.y;
    item.height = itemSize.height;
    tree.setUnroundedLayout(item.node, new Layout({
        order: item.order,
        location,
        size: itemSize,
        contentSize: output.contentSize,
        scrollbarSize: new Size(item.style.overflow.y === Overflow.Scroll ? item.style.scrollbarWidth : 0, item.style.overflow.x === Overflow.Scroll ? item.style.scrollbarWidth : 0),
        padding: resolveLengthPercentageRectOrZero(item.style.padding, areaSize.width, tree),
        border: resolveLengthPercentageRectOrZero(item.style.border, areaSize.width, tree),
        margin: resolvedMargin,
    }));
    return computeContentSizeContribution(location, itemSize, output.contentSize, item.style.overflow);
}
function gridContainerBaseline(items: GridItem[], containerAlignItems: AlignItems | undefined): number | undefined {
    if (items.length === 0)
        return undefined;
    const firstRow = items.reduce((row: number, item: GridItem) => Math.min(row, item.row), items[0].row);
    const firstRowItems = items.filter((item: GridItem) => item.row === firstRow);
    const baselineItem = firstRowItems.find((item: GridItem) => gridItemAlignSelf(item, containerAlignItems) === AlignItems.Baseline) ?? firstRowItems[0];
    return baselineItem.yPosition + (baselineItem.baseline ?? baselineItem.height);
}
function gridItemAlignSelf(item: GridItem, containerAlignItems: AlignItems | undefined): AlignItems {
    return item.style.alignSelf ?? containerAlignItems ?? AlignItems.Stretch;
}
function gridItemSizing(style: Style, areaSize: Size, margin: Rect, optionalMargin: Rect, inset: Rect, isAbsolute: boolean, preferredJustify: AlignItems | undefined, preferredAlign: AlignItems | undefined, baselineShim: number, tree: any): GridItemSizing {
    const constraints = gridItemConstraints(style, areaSize, tree);
    const justify = preferredJustify ??
        (constraints.inherentSize.width !== undefined ? AlignItems.Start : AlignItems.Stretch);
    const align = preferredAlign ??
        (constraints.inherentSize.height !== undefined || style.aspectRatio !== undefined
            ? AlignItems.Start
            : AlignItems.Stretch);
    let width = constraints.inherentSize.width;
    let height = constraints.inherentSize.height;
    if (width === undefined) {
        if (isAbsolute && inset.left !== undefined && inset.right !== undefined) {
            width = f32Max(areaSize.width - inset.left - inset.right - margin.left - margin.right, 0);
        }
        else if (!isAbsolute &&
            justify === AlignItems.Stretch &&
            optionalMargin.left !== undefined &&
            optionalMargin.right !== undefined) {
            width = Math.max(0, areaSize.width - rectHorizontalAxisSum(margin));
        }
    }
    ({ width, height } = new Size(width, height).maybeApplyAspectRatio(style.aspectRatio));
    if (height === undefined) {
        if (isAbsolute && inset.top !== undefined && inset.bottom !== undefined) {
            height = f32Max(areaSize.height - inset.top - inset.bottom - margin.top - margin.bottom - baselineShim, 0);
        }
        else if (!isAbsolute &&
            align === AlignItems.Stretch &&
            optionalMargin.top !== undefined &&
            optionalMargin.bottom !== undefined) {
            height = Math.max(0, areaSize.height - rectVerticalAxisSum(margin) - baselineShim);
        }
    }
    const knownDimensions = maybeClampOptionalSize(new Size(width, height).maybeApplyAspectRatio(style.aspectRatio), constraints.minSize, constraints.maxSize);
    return {
        knownDimensions,
        justify,
        align,
        minSize: constraints.minSize,
        maxSize: constraints.maxSize,
    };
}
function gridItemConstraints(style: Style, areaSize: Size, tree: any): GridItemConstraints {
    const aspectRatio = style.aspectRatio;
    const padding = resolveLengthPercentageRectOrZero(style.padding, areaSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, areaSize.width, tree);
    const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const inherentSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.size, areaSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const minSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, areaSize, tree), boxSizingAdjustment);
    const paddedMinSize = maybeMaxOptionalSize(minSize.or(paddingBorderSum), paddingBorderSum).maybeApplyAspectRatio(aspectRatio);
    const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, areaSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    return { inherentSize, minSize: paddedMinSize, maxSize };
}
function layoutHiddenAndAbsoluteGridChildren(tree: any, node: any, firstOutOfFlowOrder: number, columns: GridTrackSet, rows: GridTrackSet, columnOffsets: number[], rowOffsets: number[], columnGap: number, rowGap: number, outerSize: Size, contentBoxInset: Rect, border: Rect, scrollbarGutter: Point, namedLineResolver: NamedLineResolver, containerStyle: Style, measureFunction: any): Size {
    let contentSize = Size.zero();
    let order = firstOutOfFlowOrder;
    for (const child of tree.childIds(node)) {
        const style = tree.getStyle(child) as Style;
        if (style.display === Display.None) {
            tree.computeChildLayout(child, LayoutInput.hidden(), measureFunction);
            tree.setUnroundedLayout(child, Layout.withOrder(order));
            order += 1;
            continue;
        }
        if (style.position !== Position.Absolute)
            continue;
        const columnPlacement = resolveAbsolutePlacement(resolveNamedLineNames(style.gridColumn, namedLineResolver, "column"), columns.explicitTrackCount);
        const rowPlacement = resolveAbsolutePlacement(resolveNamedLineNames(style.gridRow, namedLineResolver, "row"), rows.explicitTrackCount);
        const unadjustedArea = absoluteGridArea(columnPlacement, rowPlacement, columns, rows, columnOffsets, rowOffsets, outerSize, contentBoxInset, border, scrollbarGutter, containerStyle.direction);
        const item: GridItem = {
            node: child,
            order,
            style,
            row: rowPlacement.start ?? 0,
            column: columnPlacement.start ?? 0,
            rowSpan: rowPlacement.span,
            columnSpan: columnPlacement.span,
            baseline: undefined,
            baselineShim: 0,
            yPosition: 0,
            height: 0,
        };
        contentSize = contentSize.zipMap(layoutGridItem(tree, item, unadjustedArea, containerStyle, measureFunction), f32Max);
        order += 1;
    }
    return contentSize;
}
function resolveAbsolutePlacement(placement: Line, explicitTrackCount: number): ResolvedAbsolutePlacement {
    const startLine = placement.start.type === "Line"
        ? lineToOriginZero(placement.start.line, explicitTrackCount)
        : undefined;
    const endLine = placement.end.type === "Line"
        ? lineToOriginZero(placement.end.line, explicitTrackCount)
        : undefined;
    if (startLine !== undefined) {
        if (endLine !== undefined) {
            return startLine === endLine
                ? { start: startLine, end: startLine + 1, span: 1 }
                : {
                    start: Math.min(startLine, endLine),
                    end: Math.max(startLine, endLine),
                    span: Math.abs(endLine - startLine),
                };
        }
        if (placement.end.type === "Span") {
            return { start: startLine, end: startLine + placement.end.span, span: placement.end.span };
        }
        return { start: startLine, end: undefined, span: 1 };
    }
    if (placement.start.type === "Span" && endLine !== undefined) {
        return { start: endLine - placement.start.span, end: endLine, span: placement.start.span };
    }
    if (endLine !== undefined) {
        return { start: undefined, end: endLine, span: 1 };
    }
    const span = placement.start.type === "Span"
        ? placement.start.span
        : placement.end.type === "Span"
            ? placement.end.span
            : 1;
    return { start: undefined, end: undefined, span };
}
function absoluteGridArea(columnPlacement: ResolvedAbsolutePlacement, rowPlacement: ResolvedAbsolutePlacement, columns: GridTrackSet, rows: GridTrackSet, columnOffsets: number[], rowOffsets: number[], outerSize: Size, contentBoxInset: Rect, border: Rect, scrollbarGutter: Point, direction: Direction): Rect {
    const column = absoluteAxisArea(columnPlacement, columns, columnOffsets, direction === Direction.Rtl ? border.left + scrollbarGutter.x : border.left, direction === Direction.Rtl
        ? outerSize.width - border.right
        : outerSize.width - border.right - scrollbarGutter.x, contentBoxInset.left, outerSize.width - contentBoxInset.right, direction);
    const row = absoluteAxisArea(rowPlacement, rows, rowOffsets, border.top, outerSize.height - border.bottom - scrollbarGutter.y, contentBoxInset.top, outerSize.height - contentBoxInset.bottom, Direction.Ltr);
    return new Rect(column.start, column.end, row.start, row.end);
}
function absoluteAxisArea(placement: ResolvedAbsolutePlacement, trackSet: GridTrackSet, offsets: number[], outerStart: number, outerEnd: number, contentStart: number, contentEnd: number, direction: Direction): AbsoluteAxisAreaResult {
    const start = placement.start === undefined
        ? undefined
        : absoluteGridLine(placement.start, trackSet, offsets, contentStart, contentEnd, direction);
    const end = placement.end === undefined
        ? undefined
        : absoluteGridLine(placement.end, trackSet, offsets, contentStart, contentEnd, direction);
    if (start !== undefined && end !== undefined)
        return { start: Math.min(start, end), end: Math.max(start, end) };
    if (start !== undefined) {
        return direction === Direction.Rtl
            ? { start: outerStart, end: start }
            : { start, end: outerEnd };
    }
    if (end !== undefined) {
        return direction === Direction.Rtl ? { start: end, end: outerEnd } : { start: outerStart, end };
    }
    return { start: outerStart, end: outerEnd };
}
function absoluteGridLine(line: number, trackSet: GridTrackSet, offsets: number[], contentStart: number, contentEnd: number, direction: Direction): number | undefined {
    const offset = offsets[line + trackSet.originOffset];
    if (offset === undefined)
        return undefined;
    return direction === Direction.Rtl ? contentStart + contentEnd - offset : offset;
}
function axisAlignment(alignment: AlignItems, areaSize: number, itemSize: number, optionalStartMargin: number | undefined, optionalEndMargin: number | undefined, isAbsolute = false, startInset: number | undefined, endInset: number | undefined, direction = Direction.Ltr, baselineShim = 0): AxisAlignmentResult {
    const nonAutoStartMargin = (optionalStartMargin ?? 0) + baselineShim;
    const nonAutoEndMargin = optionalEndMargin ?? 0;
    const freeSpace = f32Max(areaSize - itemSize - nonAutoStartMargin - nonAutoEndMargin, 0);
    const autoMarginCount = (optionalStartMargin === undefined ? 1 : 0) + (optionalEndMargin === undefined ? 1 : 0);
    const autoMarginSize = autoMarginCount > 0 ? freeSpace / autoMarginCount : 0;
    const startMargin = (optionalStartMargin ?? autoMarginSize) + baselineShim;
    const endMargin = optionalEndMargin ?? autoMarginSize;
    let offset: number;
    if (isAbsolute) {
        if (startInset !== undefined && endInset !== undefined) {
            offset =
                direction === Direction.Rtl
                    ? areaSize - endInset - itemSize - nonAutoEndMargin
                    : startInset + nonAutoStartMargin;
            return { offset, startMargin, endMargin };
        }
        if (startInset !== undefined) {
            offset = startInset + nonAutoStartMargin;
            return { offset, startMargin, endMargin };
        }
        if (endInset !== undefined) {
            offset = areaSize - endInset - itemSize - nonAutoEndMargin;
            return { offset, startMargin, endMargin };
        }
    }
    switch (alignment) {
        case AlignItems.Center:
            offset = (areaSize - itemSize + startMargin - endMargin) / 2;
            break;
        case AlignItems.End:
        case AlignItems.FlexEnd:
            offset = direction === Direction.Rtl ? startMargin : areaSize - itemSize - endMargin;
            break;
        case AlignItems.Start:
        case AlignItems.FlexStart:
        case AlignItems.Baseline:
        case AlignItems.Stretch:
            offset = direction === Direction.Rtl ? areaSize - itemSize - endMargin : startMargin;
            break;
    }
    return { offset, startMargin, endMargin };
}
function optionalInsetLine(start: number | undefined, end: number | undefined): Line {
    return new Line(start, end);
}
function relativeInsetOffset(inset: Line, position: Position, direction: Direction): number {
    if (position !== Position.Relative)
        return 0;
    if (direction === Direction.Rtl)
        return inset.end !== undefined ? -inset.end : (inset.start ?? 0);
    return inset.start !== undefined ? inset.start : -(inset.end ?? 0);
}
function spanSize(tracks: GridTrack[], start: number, span: number, gap: number): number {
    const end = Math.min(start + span, tracks.length);
    let size = 0;
    for (let index = start; index < end; index += 1) {
        size += tracks[index]?.size ?? 0;
        if (index < end - 1)
            size += trackGapAfter(tracks.slice(0, end), index, gap);
    }
    return size;
}
function trackSum(tracks: GridTrack[], gap: number): number {
    return tracks.reduce((sum: number, track: GridTrack) => sum + track.size, 0) + trackGapSum(tracks, gap);
}
function trackGapSum(tracks: GridTrack[], gap: number): number {
    return tracks.reduce((sum: number, _track: GridTrack, index: number) => sum + trackGapAfter(tracks, index, gap), 0);
}
function trackGapAfter(tracks: GridTrack[], index: number, gap: number): number {
    const track = tracks[index];
    if (track === undefined || track.isCollapsed)
        return 0;
    return tracks.slice(index + 1).some((laterTrack: GridTrack) => !laterTrack.isCollapsed) ? gap : 0;
}
function resolveLengthPercentage(value: LengthPercentage, context: number | undefined, tree: any): number {
    return resolveLengthPercentageOrZero(value, context, tree);
}
function resolveFinalGridGap(value: LengthPercentage, knownSize: number | undefined, intrinsicSize: number, tree: any): number {
    return resolveLengthPercentageOrZero(value, knownSize ?? intrinsicSize, tree);
}
