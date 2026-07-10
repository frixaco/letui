import { Line, Point, Rect, Size, rectAdd, rectHorizontalAxisSum, rectSumAxes, rectVerticalAxisSum, } from "../geometry.js";
import { AvailableSpace, AvailableSpaceSize, type AvailableSpaceValue, availableSpaceIntoOption, } from "../style/available-space.js";
import { CompactLengthTag, Dimension, LengthPercentage, maybeResolveDimensionSize, maybeResolveDimension, resolveLengthPercentageAutoRectOrZero, resolveLengthPercentageOrZero, resolveLengthPercentageRectOrZero, } from "../style/dimensions.js";
import { AlignContent, AlignItems, BoxSizing, Direction, Display, FlexDirection, FlexWrap, Overflow, Position, Style, flexDirectionIsReverse, flexDirectionIsRow, overflowMaybeIntoAutomaticMinSize, } from "../style/style.js";
import { Layout, LayoutInput, LayoutOutput, RequestedAxis, RunMode, SizingMode, } from "../tree/layout.js";
import { availableSpaceMaybeSub, maybeAddOptionalSize, maybeClamp, maybeClampOptionalSize, maybeMaxOptionalSize, maybeSub, } from "../util/math.js";
import { f32Max } from "../util/sys.js";
import { applyAlignmentFallback, computeAlignmentOffset, computeContentSizeContribution, } from "./common.js";

type FlexAxis = "width" | "height";

type FlexAlignment =
    | { type: "main"; value: AlignContent }
    | { type: "cross"; value: AlignItems };

interface FlexItemBase {
    node: any;
    order: number;
    style: Style;
    inset: Rect;
    margin: Rect;
    marginIsAuto: Rect;
    padding: Rect;
    border: Rect;
    size: Size;
    styleSize: Size;
    minSize: Size;
    maxSize: Size;
    flexBasisSize: Size;
    resolvedMinMainSize: number | undefined;
    eagerAutomaticMinMainSize: number | undefined;
    paddingBorderSum: Size;
    targetSize: Size;
    outerTargetSize: Size;
    baseline: number;
}

interface FlexItem extends FlexItemBase {
    maxContentMainContribution: number;
    violation: number;
}

interface FlexLine {
    items: FlexItem[];
    crossSize: number;
    offsetCross: number;
    baseline: number | undefined;
}

interface AbsoluteFlexAxisLocationInput {
    itemSize: number;
    startMargin: number;
    endMargin: number;
    startInset: number | undefined;
    endInset: number | undefined;
    insetEdgeStart: number;
    insetEdgeEnd: number;
    contentStart: number;
    contentEnd: number;
    containerSize: number;
    alignment: FlexAlignment;
    reversed: boolean;
    preferEndInset: boolean;
}

export function computeFlexboxLayout(tree: any, node: any, inputs: LayoutInput, measureFunction: any): LayoutOutput {
    const style = tree.getStyle(node);
    const parentSize = inputs.parentSize;
    const aspectRatio = style.aspectRatio;
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree);
    const paddingBorder = rectAdd(padding, border);
    const paddingBorderSum = rectSumAxes(paddingBorder);
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const minSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const clampedStyleSize = inputs.sizingMode === SizingMode.InherentSize
        ? maybeClampOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment), minSize, maxSize)
        : Size.none();
    const minMaxDefiniteSize = minSize.zipMap(maxSize, (min, max) => min !== undefined && max !== undefined && max <= min ? min : undefined);
    const knownDimensions = inputs.knownDimensions.or(maybeMaxOptionalSize(minMaxDefiniteSize.or(clampedStyleSize), paddingBorderSum.map((value) => value)));
    if (inputs.runMode !== RunMode.PerformLayout &&
        knownDimensions.width !== undefined &&
        knownDimensions.height !== undefined) {
        return LayoutOutput.fromOuterSize(new Size(knownDimensions.width, knownDimensions.height));
    }
    const scrollbarGutter = style.overflow
        .transpose()
        .map((overflow: Overflow) => (overflow === Overflow.Scroll ? style.scrollbarWidth : 0));
    const contentBoxInset = new Rect(padding.left + border.left + (style.direction === Direction.Rtl ? scrollbarGutter.x : 0), padding.right + border.right + (style.direction === Direction.Ltr ? scrollbarGutter.x : 0), padding.top + border.top, padding.bottom + border.bottom + scrollbarGutter.y);
    const availableSpace = determineFlexAvailableSpace(knownDimensions, inputs.availableSpace, margin, contentBoxInset);
    const innerKnownSize = knownDimensions
        .maybeApplyAspectRatio(aspectRatio)
        .or(Size.none())
        .zipMap(rectSumAxes(contentBoxInset), (size: number | undefined, inset: number) => size === undefined ? undefined : Math.max(0, size - inset));
    const gap = resolveLengthPercentageSize(style.gap, innerKnownSize.or(Size.zero()), tree);
    const items: FlexItem[] = [];
    for (let index = 0; index < tree.childCount(node); index += 1) {
        const child = tree.getChildId(node, index);
        const childStyle = tree.getStyle(child);
        if (childStyle.position === Position.Absolute || childStyle.display === Display.None)
            continue;
        items.push(computeFlexItem(tree, child, index, childStyle, innerKnownSize, gap, inputs, availableSpace, style.flexDirection, style.alignItems ?? AlignItems.Stretch, measureFunction));
    }
    const dir = style.flexDirection;
    const isWrap = style.flexWrap !== FlexWrap.NoWrap;
    const isWrapReverse = style.flexWrap === FlexWrap.WrapReverse;
    const isRow = flexDirectionIsRow(dir);
    const main: FlexAxis = isRow ? "width" : "height";
    const cross: FlexAxis = isRow ? "height" : "width";
    let mainGap = isRow ? gap.width : gap.height;
    const crossGap = isRow ? gap.height : gap.width;
    const defaultAlignItems = style.alignItems ?? AlignItems.Stretch;
    const lines = collectFlexLines(items, style.flexWrap, dir, mainGap, innerKnownSize[main], availableSpace[main], minSize[main], maxSize[main], contentBoxInset);
    const contentInnerMain = determineInnerMainSize(lines, dir, mainGap, innerKnownSize[main], availableSpace[main], contentBoxInset);
    const innerMain = determineClampedInnerMainSize(contentInnerMain, dir, knownDimensions, minSize, maxSize, contentBoxInset);
    if (innerKnownSize[main] === undefined) {
        mainGap = resolveLengthPercentageOrZero(isRow ? style.gap.width : style.gap.height, innerMain, tree);
    }
    for (const line of lines) {
        const totalGap = Math.max(line.items.length - 1, 0) * mainGap;
        distributeFlexLengths(tree, line.items, innerMain, totalGap, dir, defaultAlignItems, innerKnownSize, availableSpace, measureFunction);
        for (const item of line.items) {
            remeasureAutoCrossSize(tree, item, dir, innerKnownSize, availableSpace, measureFunction);
        }
        line.baseline = flexDirectionIsRow(dir)
            ? resolveLineBaseline(tree, line, dir, defaultAlignItems, innerKnownSize, availableSpace, measureFunction)
            : undefined;
        line.crossSize =
            !isWrap && innerKnownSize[cross] !== undefined
                ? innerKnownSize[cross]
                : line.items.reduce((max, item) => Math.max(max, itemCrossSizeContribution(item, line.baseline, dir, defaultAlignItems)), 0);
    }
    if (!isWrap && lines.length > 0 && innerKnownSize[cross] === undefined) {
        lines[0].crossSize = clampSingleLineCrossSize(lines[0].crossSize, dir, minSize, maxSize, contentBoxInset);
    }
    const alignContent = style.alignContent ?? AlignContent.Stretch;
    const stretchInnerCross = determineStretchInnerCross(dir, knownDimensions, minSize, maxSize, contentBoxInset);
    stretchFlexLinesIfNeeded(lines, alignContent, stretchInnerCross, crossGap, isWrap);
    for (const line of lines) {
        for (const item of line.items) {
                applyStretchIfNeeded(tree, item, line.crossSize, dir, defaultAlignItems, innerKnownSize);
        }
    }
    const totalLineCross = lines.reduce((sum: number, line: FlexLine) => sum + line.crossSize, 0);
    const totalCrossGap = Math.max(lines.length - 1, 0) * crossGap;
    const outerCross = maybeClamp((knownDimensions[cross] ?? totalLineCross + totalCrossGap + crossAxisContentBoxInsetSum(contentBoxInset, dir)), minSize[cross], maxSize[cross]) ?? 0;
    const innerCross = innerKnownSize[cross] ?? Math.max(0, outerCross - crossAxisContentBoxInsetSum(contentBoxInset, dir));
    const innerContainerSize = new Size(isRow ? innerMain : innerCross, isRow ? innerCross : innerMain);
    const outerSize = maybeClampOptionalSize(new Size(knownDimensions.width ?? innerContainerSize.width + rectHorizontalAxisSum(contentBoxInset), knownDimensions.height ?? innerContainerSize.height + rectVerticalAxisSum(contentBoxInset)), minSize, maxSize).unwrapOr(Size.zero());
    if (inputs.runMode === RunMode.ComputeSize) {
        return LayoutOutput.fromOuterSize(outerSize);
    }
    alignFlexLines(lines, innerCross, totalLineCross, crossGap, alignContent, isWrapReverse);
    const justify = style.justifyContent ?? AlignContent.FlexStart;
    let inflowContentSize = Size.zero();
    const baselineSource = flexContainerBaselineSource(lines[0], !isRow, defaultAlignItems);
    let firstVerticalBaseline;
    let lineCursor = 0;
    const layoutLines = isWrapReverse ? [...lines].reverse() : lines;
    for (const line of layoutLines) {
        const lineGap = Math.max(line.items.length - 1, 0) * mainGap;
        const finalOuterMain = line.items.reduce((sum: number, item: FlexItem) => sum + item.outerTargetSize[main], 0);
        let freeMainSpace = innerMain - finalOuterMain - lineGap;
        freeMainSpace = distributeMainAxisAutoMargins(line.items, freeMainSpace, dir);
        const justifyMode = applyAlignmentFallback(freeMainSpace, Math.max(line.items.length, 1), justify, false);
        let cursor = computeAlignmentOffset(freeMainSpace, Math.max(line.items.length, 1), mainGap, justifyMode, false, true);
        if (justifyMode === AlignContent.Start && mainAxisLayoutIsReversed(dir, style.direction)) {
            cursor += freeMainSpace;
        }
        const lineCrossStart = lineCursor + line.offsetCross;
        for (const [index, item] of line.items.entries()) {
            if (index > 0) {
                cursor += computeAlignmentOffset(freeMainSpace, Math.max(line.items.length, 1), mainGap, justifyMode, false, false);
            }
            const itemMainStart = cursor + mainStartMargin(item.margin, dir);
            const itemCrossStart = lineCrossStart +
                crossAxisOffset(item, line.crossSize, line.baseline, dir, defaultAlignItems, isWrapReverse);
            const location = itemLocation(itemMainStart, itemCrossStart, dir, style.direction, contentBoxInset, innerContainerSize, item.targetSize, item.outerTargetSize);
            const relativeOffset = relativeInsetOffset(item.inset, item.style.position, style.direction);
            location.x += relativeOffset.x;
            location.y += relativeOffset.y;
            const output = tree.computeChildLayout(item.node, new LayoutInput({
                runMode: RunMode.PerformLayout,
                sizingMode: SizingMode.ContentSize,
                axis: RequestedAxis.Both,
                knownDimensions: new Size(item.targetSize.width, item.targetSize.height),
                parentSize: innerKnownSize,
                availableSpace: new Size(AvailableSpace.definite(outerSize.width), AvailableSpace.definite(outerSize.height)),
                verticalMarginsAreCollapsible: Line.false(),
            }), measureFunction);
            const itemInnerBaseline = output.firstBaselines.y ?? output.size.height;
            item.baseline = itemInnerBaseline;
            const layout = new Layout({
                order: item.order,
                location,
                size: output.size,
                contentSize: output.contentSize,
                scrollbarSize: new Size(item.style.overflow.y === Overflow.Scroll ? item.style.scrollbarWidth : 0, item.style.overflow.x === Overflow.Scroll ? item.style.scrollbarWidth : 0),
                padding: item.padding,
                border: item.border,
                margin: item.margin,
            });
            tree.setUnroundedLayout(item.node, layout);
            const contributionLocation = style.direction === Direction.Rtl
                ? new Point(outerSize.width - (location.x + output.size.width), location.y)
                : location;
            inflowContentSize = inflowContentSize.zipMap(computeContentSizeContribution(contributionLocation, output.size, output.contentSize, item.style.overflow), f32Max);
            if (item === baselineSource) {
                firstVerticalBaseline = location.y + itemInnerBaseline;
            }
            cursor += item.outerTargetSize[main];
        }
        lineCursor += line.offsetCross + line.crossSize;
    }
    inflowContentSize = new Size(inflowContentSize.width +
        (style.direction === Direction.Rtl
            ? contentBoxInset.left - border.left - scrollbarGutter.x
            : contentBoxInset.right - border.right - scrollbarGutter.x), inflowContentSize.height + contentBoxInset.bottom - border.bottom - scrollbarGutter.y);
    const absoluteContentSize = performAbsoluteLayoutOnAbsoluteChildren(tree, node, style, padding, border, contentBoxInset, innerContainerSize, measureFunction);
    for (let order = 0; order < tree.childCount(node); order += 1) {
        const child = tree.getChildId(node, order);
        const childStyle = tree.getStyle(child);
        if (childStyle.display === Display.None) {
            tree.computeChildLayout(child, LayoutInput.hidden(), measureFunction);
            tree.setUnroundedLayout(child, Layout.withOrder(order));
        }
    }
    return LayoutOutput.fromSizesAndBaselines(outerSize, inflowContentSize.zipMap(absoluteContentSize, f32Max), new Point(undefined, firstVerticalBaseline));
}
export const compute_flexbox_layout = computeFlexboxLayout;
function collectFlexLines(items: FlexItem[], flexWrap: FlexWrap, dir: FlexDirection, mainGap: number, innerKnownMain: number | undefined, availableMain: AvailableSpaceValue, minMain: number | undefined, maxMain: number | undefined, contentBoxInset: Rect): FlexLine[] {
    if (items.length === 0 ||
        flexWrap === FlexWrap.NoWrap) {
        return [{ items, crossSize: 0, offsetCross: 0, baseline: undefined }];
    }
    const lineBreakAvailableMain = flexLineBreakAvailableSpace(availableMain, minMain, maxMain);
    if (innerKnownMain === undefined && lineBreakAvailableMain.type === "MaxContent") {
        return [{ items, crossSize: 0, offsetCross: 0, baseline: undefined }];
    }
    if (lineBreakAvailableMain.type === "MinContent") {
        return items.map((item) => ({
            items: [item],
            crossSize: 0,
            offsetCross: 0,
            baseline: undefined,
        }));
    }
    const availableInnerMain = innerKnownMain ??
        (lineBreakAvailableMain.type === "Definite"
            ? Math.max(0, lineBreakAvailableMain.value - mainAxisContentBoxInsetSum(contentBoxInset, dir))
            : Number.POSITIVE_INFINITY);
    const lines: FlexLine[] = [];
    let lineItems: FlexItem[] = [];
    let lineLength = 0;
    for (const item of items) {
        const gapContribution = lineItems.length === 0 ? 0 : mainGap;
        const itemOuterMain = item.outerTargetSize[flexDirectionIsRow(dir) ? "width" : "height"];
        if (lineItems.length > 0 && lineLength + gapContribution + itemOuterMain > availableInnerMain) {
            lines.push({ items: lineItems, crossSize: 0, offsetCross: 0, baseline: undefined });
            lineItems = [item];
            lineLength = itemOuterMain;
        }
        else {
            lineItems.push(item);
            lineLength += gapContribution + itemOuterMain;
        }
    }
    lines.push({ items: lineItems, crossSize: 0, offsetCross: 0, baseline: undefined });
    return lines;
}
function flexLineBreakAvailableSpace(availableMain: AvailableSpaceValue, minMain: number | undefined, maxMain: number | undefined): AvailableSpaceValue {
    if (maxMain === undefined)
        return availableMain;
    const base = availableMain.type === "Definite" ? availableMain.value : maxMain;
    return AvailableSpace.definite(minMain === undefined ? base : Math.max(base, minMain));
}
function determineInnerMainSize(lines: FlexLine[], dir: FlexDirection, mainGap: number, innerKnownMain: number | undefined, availableMain: AvailableSpaceValue, contentBoxInset: Rect): number {
    if (innerKnownMain !== undefined)
        return innerKnownMain;
    if (availableMain.type === "MaxContent") {
        return lines.reduce((max, line) => Math.max(max, maxContentLineMainSize(line, dir, mainGap)), 0);
    }
    const longestLine = lines.reduce((max, line) => Math.max(max, usedLineMainSize(line, dir, mainGap)), 0);
    if (availableMain.type === "Definite" && lines.length > 1) {
        return Math.max(longestLine, Math.max(0, availableMain.value - mainAxisContentBoxInsetSum(contentBoxInset, dir)));
    }
    return longestLine;
}
function determineClampedInnerMainSize(contentInnerMain: number, dir: FlexDirection, knownDimensions: Size, minSize: Size, maxSize: Size, contentBoxInset: Rect): number {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const mainInset = mainAxisContentBoxInsetSum(contentBoxInset, dir);
    const outerMain = maybeClamp(knownDimensions[main] ?? contentInnerMain + mainInset, minSize[main], maxSize[main]) ?? 0;
    return Math.max(0, outerMain - mainInset);
}
function determineStretchInnerCross(dir: FlexDirection, knownDimensions: Size, minSize: Size, maxSize: Size, contentBoxInset: Rect): number | undefined {
    const cross: FlexAxis = flexDirectionIsRow(dir) ? "height" : "width";
    const crossInset = crossAxisContentBoxInsetSum(contentBoxInset, dir);
    const containerCross = maybeClamp(knownDimensions[cross] ?? minSize[cross], minSize[cross], maxSize[cross]);
    return containerCross === undefined ? undefined : Math.max(0, containerCross - crossInset);
}
function clampSingleLineCrossSize(crossSize: number, dir: FlexDirection, minSize: Size, maxSize: Size, contentBoxInset: Rect): number {
    const cross: FlexAxis = flexDirectionIsRow(dir) ? "height" : "width";
    const crossInset = crossAxisContentBoxInsetSum(contentBoxInset, dir);
    return maybeClamp(crossSize, maybeSub(minSize[cross], crossInset), maybeSub(maxSize[cross], crossInset)) ?? crossSize;
}
function stretchFlexLinesIfNeeded(lines: FlexLine[], alignContent: AlignContent, innerKnownCross: number | undefined, crossGap: number, isWrap: boolean): void {
    if (alignContent !== AlignContent.Stretch || innerKnownCross === undefined || lines.length === 0)
        return;
    const totalCross = lines.reduce((sum, line) => sum + line.crossSize, 0) + Math.max(lines.length - 1, 0) * crossGap;
    if (totalCross >= innerKnownCross)
        return;
    const addition = (innerKnownCross - totalCross) / (isWrap ? lines.length : 1);
    for (const line of lines) {
        line.crossSize += addition;
    }
}
function alignFlexLines(lines: FlexLine[], innerCross: number, totalLineCross: number, crossGap: number, alignContent: AlignContent, isWrapReverse: boolean): void {
    const freeCrossSpace = innerCross - totalLineCross - Math.max(lines.length - 1, 0) * crossGap;
    const alignMode = applyAlignmentFallback(freeCrossSpace, Math.max(lines.length, 1), alignContent, false);
    const orderedLines = isWrapReverse ? [...lines].reverse() : lines;
    for (const [index, line] of orderedLines.entries()) {
        line.offsetCross = computeAlignmentOffset(freeCrossSpace, Math.max(lines.length, 1), crossGap, alignMode, isWrapReverse, index === 0);
    }
}
function usedLineMainSize(line: FlexLine, dir: FlexDirection, mainGap: number): number {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    return (line.items.reduce((sum, item) => sum + item.outerTargetSize[main], 0) +
        Math.max(line.items.length - 1, 0) * mainGap);
}
function maxContentLineMainSize(line: FlexLine, dir: FlexDirection, mainGap: number): number {
    return (line.items.reduce((sum, item) => sum + item.maxContentMainContribution + mainAxisMarginSum(item.margin, dir), 0) +
        Math.max(line.items.length - 1, 0) * mainGap);
}
function crossAxisContentBoxInsetSum(contentBoxInset: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir)
        ? rectVerticalAxisSum(contentBoxInset)
        : rectHorizontalAxisSum(contentBoxInset);
}
function resolveLineBaseline(tree: any, line: FlexLine, dir: FlexDirection, defaultAlignment: AlignItems, parentSize: Size, availableSpace: Size, measureFunction: any): number | undefined {
    const baselineItems = line.items.filter((item) => itemAlignSelf(item, defaultAlignment) === AlignItems.Baseline);
    if (baselineItems.length <= 1)
        return undefined;
    for (const item of baselineItems) {
        const output = tree.computeChildLayout(item.node, new LayoutInput({
            runMode: RunMode.PerformLayout,
            sizingMode: SizingMode.ContentSize,
            axis: RequestedAxis.Both,
            knownDimensions: new Size(item.targetSize.width, item.targetSize.height),
            parentSize,
            availableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        item.baseline = output.firstBaselines.y ?? output.size.height;
    }
    return baselineItems.reduce((max, item) => Math.max(max, itemOuterBaseline(item, dir)), 0);
}
function flexContainerBaselineSource(line: FlexLine | undefined, isColumn: boolean, defaultAlignment: AlignItems): FlexItem | undefined {
    if (line === undefined)
        return undefined;
    return (line.items.find((item) => isColumn || itemAlignSelf(item, defaultAlignment) === AlignItems.Baseline) ?? line.items[0]);
}
function itemCrossSizeContribution(item: FlexItem, lineBaseline: number | undefined, dir: FlexDirection, defaultAlignment: AlignItems): number {
    const cross: FlexAxis = flexDirectionIsRow(dir) ? "height" : "width";
    if (lineBaseline === undefined ||
        itemAlignSelf(item, defaultAlignment) !== AlignItems.Baseline ||
        crossAxisAutoMarginCount(item.marginIsAuto, dir) > 0) {
        return item.outerTargetSize[cross];
    }
    return lineBaseline - itemOuterBaseline(item, dir) + item.outerTargetSize[cross];
}
function itemOuterBaseline(item: FlexItem, dir: FlexDirection): number {
    return item.baseline + crossStartMargin(item.margin, dir);
}
function mainAxisContentBoxInsetSum(contentBoxInset: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir)
        ? rectHorizontalAxisSum(contentBoxInset)
        : rectVerticalAxisSum(contentBoxInset);
}
function determineFlexAvailableSpace(knownDimensions: Size, outerAvailableSpace: Size, margin: Rect, contentBoxInset: Rect): Size {
    return new Size(knownDimensions.width === undefined
        ? availableSpaceMaybeSub(availableSpaceMaybeSub(outerAvailableSpace.width, rectHorizontalAxisSum(margin)), rectHorizontalAxisSum(contentBoxInset))
        : AvailableSpace.definite(knownDimensions.width - rectHorizontalAxisSum(contentBoxInset)), knownDimensions.height === undefined
        ? availableSpaceMaybeSub(availableSpaceMaybeSub(outerAvailableSpace.height, rectVerticalAxisSum(margin)), rectVerticalAxisSum(contentBoxInset))
        : AvailableSpace.definite(knownDimensions.height - rectVerticalAxisSum(contentBoxInset)));
}
function computeFlexItem(tree: any, child: any, order: number, style: Style, parentSize: Size, _gap: Size, inputs: LayoutInput, availableSpace: Size, dir: FlexDirection, defaultAlignment: AlignItems, measureFunction: any): FlexItem {
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree);
    const marginIsAuto = style.margin.map((value: any) => value.isAuto());
    const inset = style.inset.zipSize(parentSize, (value: any, context: number | undefined) => value.resolveToOption(context, tree));
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const aspectRatio = style.aspectRatio;
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const minSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const styleSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const initialKnownDimensions = itemKnownDimensions(tree, style, parentSize, inputs, dir, boxSizingAdjustment);
    const crossAvailableSpace = automaticMinCrossAvailableSpace(dir, parentSize, availableSpace, minSize, maxSize);
    const childAvailableSpace = flexItemMaxContentAvailableSpace(dir, availableSpace, crossAvailableSpace);
    const output = tree.computeChildLayout(child, new LayoutInput({
        runMode: inputs.runMode === RunMode.PerformLayout ? RunMode.ComputeSize : inputs.runMode,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: initialKnownDimensions,
        parentSize,
        availableSpace: childAvailableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    }), measureFunction);
    const measuredSize = new Size(
        initialKnownDimensions.width === undefined
            ? resolvedFlexItemStyleSize(styleSize.width, output.size.width, paddingBorderSum.width)
            : output.size.width,
        initialKnownDimensions.height === undefined
            ? resolvedFlexItemStyleSize(styleSize.height, output.size.height, paddingBorderSum.height)
            : output.size.height,
    );
    const flexBaseKnown = flexBaseKnownDimensions(tree, style, defaultAlignment, parentSize, inputs, dir, crossAvailableSpace, margin);
    const flexBaseMainChanged = flexBaseKnown[main] !== initialKnownDimensions[main];
    const flexBaseCrossChanged = flexBaseKnown[flexDirectionIsRow(dir) ? "height" : "width"] !==
        initialKnownDimensions[flexDirectionIsRow(dir) ? "height" : "width"];
    const mainStyleSizeIsDefinite = styleSize[main] !== undefined;
    let flexBaseContentMain: number | undefined;
    if (initialKnownDimensions[main] === undefined &&
        !mainStyleSizeIsDefinite &&
        (minSize[main] !== undefined || maxSize[main] !== undefined)) {
        flexBaseContentMain = tree.computeChildLayout(child, new LayoutInput({
            runMode: RunMode.ComputeSize,
            sizingMode: SizingMode.ContentSize,
            axis: flexDirectionIsRow(dir) ? RequestedAxis.Horizontal : RequestedAxis.Vertical,
            knownDimensions: flexBaseKnown,
            parentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction).size[main];
    }
    if (flexBaseMainChanged ||
        (!mainStyleSizeIsDefinite &&
            ((!isDefaultMeasureFunction(measureFunction) && flexBaseCrossChanged) ||
                (aspectRatio !== undefined && flexBaseCrossChanged)))) {
        const flexBaseOutput = tree.computeChildLayout(child, new LayoutInput({
            runMode: inputs.runMode === RunMode.PerformLayout ? RunMode.ComputeSize : inputs.runMode,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions: flexBaseKnown,
            parentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        measuredSize[main] = flexBaseOutput.size[main];
    }
    const flexBasisSize = new Size(measuredSize.width, measuredSize.height);
    if (initialKnownDimensions[main] !== undefined) {
        flexBasisSize[main] = Math.max(initialKnownDimensions[main], paddingBorderSum[main]);
    }
    else if (mainStyleSizeIsDefinite) {
        flexBasisSize[main] = Math.max(styleSize[main], paddingBorderSum[main]);
    }
    else if (flexBaseContentMain !== undefined) {
        flexBasisSize[main] = Math.max(flexBaseContentMain, paddingBorderSum[main]);
    }
    else {
        flexBasisSize[main] = Math.max(flexBasisSize[main], paddingBorderSum[main]);
    }
    const baseTargetSize = clampSize(measuredSize, minSize, maxSize);
    baseTargetSize.width = Math.max(baseTargetSize.width, paddingBorderSum.width);
    baseTargetSize.height = Math.max(baseTargetSize.height, paddingBorderSum.height);
    const baseOuterTargetSize = new Size(baseTargetSize.width + rectHorizontalAxisSum(margin), baseTargetSize.height + rectVerticalAxisSum(margin));
    const styleResolvedMinMainSize = minSize[main] ??
        overflowMaybeIntoAutomaticMinSize(flexDirectionIsRow(dir) ? style.overflow.x : style.overflow.y);
    const eagerAutomaticMinMainSize = styleResolvedMinMainSize === undefined && !isDefaultMeasureFunction(measureFunction)
            ? computeAutomaticMinMainSize(tree, {
            node: child,
            order,
            style,
            inset,
            margin,
            marginIsAuto,
            padding,
            border,
            size: measuredSize,
            styleSize,
            minSize,
            maxSize,
            flexBasisSize,
            resolvedMinMainSize: styleResolvedMinMainSize,
            eagerAutomaticMinMainSize: undefined,
            paddingBorderSum,
            targetSize: baseTargetSize,
            outerTargetSize: baseOuterTargetSize,
            baseline: output.firstBaselines.y ?? baseTargetSize.height,
        }, dir, defaultAlignment, parentSize, availableSpace, measureFunction)
        : undefined;
    const resolvedMinMainSize = styleResolvedMinMainSize ?? eagerAutomaticMinMainSize;
    const targetSize = new Size(baseTargetSize.width, baseTargetSize.height);
    targetSize[main] = maybeClamp(flexBasisSize[main], resolvedMinMainSize, maxSize[main]) ?? flexBasisSize[main];
    const outerTargetSize = new Size(targetSize.width + rectHorizontalAxisSum(margin), targetSize.height + rectVerticalAxisSum(margin));
    const maxContentMainContribution = computeFlexItemMaxContentMainContribution(tree, child, style, styleSize, measuredSize, minSize, maxSize, flexBasisSize, resolvedMinMainSize, paddingBorderSum, parentSize, dir, measureFunction);
    return {
        node: child,
        order,
        style,
        inset,
        margin,
        marginIsAuto,
        padding,
        border,
        size: measuredSize,
        styleSize,
        minSize,
        maxSize,
        flexBasisSize,
        maxContentMainContribution,
        resolvedMinMainSize,
        eagerAutomaticMinMainSize,
        paddingBorderSum,
        targetSize,
        outerTargetSize,
        violation: 0,
        baseline: output.firstBaselines.y ?? targetSize.height,
    };
}

function computeFlexItemMaxContentMainContribution(tree: any, child: any, style: Style, styleSize: Size, measuredSize: Size, minSize: Size, maxSize: Size, flexBasisSize: Size, resolvedMinMainSize: number | undefined, paddingBorderSum: Size, parentSize: Size, dir: FlexDirection, measureFunction: any): number {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const flexBasis = flexBasisSize[main];
    const preferred = styleSize[main];
    const clampingBasis = Math.max(flexBasis, preferred ?? flexBasis);
    const flexBasisMin = style.flexShrink === 0 ? clampingBasis : undefined;
    const flexBasisMax = style.flexGrow === 0 ? clampingBasis : undefined;
    const minMain = Math.max(maybeMaxOr(minSize[main], flexBasisMin, flexBasisMin ?? resolvedMinMainSize ?? 0), resolvedMinMainSize ?? 0);
    const maxMain = maybeMinOr(maxSize[main], flexBasisMax, flexBasisMax ?? Number.POSITIVE_INFINITY);
    let contentContribution: number;
    if (preferred !== undefined && (maxMain <= minMain || maxMain <= preferred)) {
        contentContribution = Math.max(Math.min(preferred, maxMain), minMain);
    }
    else if (maxMain <= minMain) {
        contentContribution = minMain;
    }
    else if (style.flexGrow === 0 && preferred !== undefined && maxSize[main] === undefined && flexBasis > preferred) {
        contentContribution = flexBasis;
    }
    else {
        const contentMainSize = measureMaxContentMainContribution(tree, child, style, styleSize, measuredSize, paddingBorderSum, parentSize, dir, measureFunction);
        const contentMain = flexDirectionIsRow(dir)
            ? maybeClamp(contentMainSize, minSize[main], maxSize[main]) ?? contentMainSize
            : maybeClamp(Math.max(contentMainSize, flexBasis), minSize[main], maxSize[main]) ?? Math.max(contentMainSize, flexBasis);
        contentContribution = Math.max(contentMain, paddingBorderSum[main]);
    }
    const diff = contentContribution - flexBasis;
    if (diff > 0) {
        return flexBasis + Math.max(1, style.flexGrow) * (diff / Math.max(1, style.flexGrow));
    }
    if (diff < 0) {
        const innerFlexBasis = Math.max(0, flexBasis - paddingBorderSum[main]);
        return flexBasis + Math.max(1, style.flexShrink) * innerFlexBasis * (diff / Math.max(1, style.flexShrink * innerFlexBasis));
    }
    return flexBasis;
}
function measureMaxContentMainContribution(tree: any, child: any, style: Style, styleSize: Size, measuredSize: Size, paddingBorderSum: Size, parentSize: Size, dir: FlexDirection, measureFunction: any): number {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    if (!flexDirectionIsRow(dir) || dimensionIsAuto(style.flexBasis)) {
        return measuredSize[main];
    }
    const knownDimensions = new Size(styleSize.width, styleSize.height);
    knownDimensions[main] = undefined;
    const output = tree.computeChildLayout(child, new LayoutInput({
        runMode: RunMode.ComputeSize,
        sizingMode: SizingMode.ContentSize,
        axis: RequestedAxis.Horizontal,
        knownDimensions,
        parentSize,
        availableSpace: AvailableSpaceSize.maxContent(),
        verticalMarginsAreCollapsible: Line.false(),
    }), measureFunction);
    return Math.max(output.size[main], styleSize[main] ?? 0, paddingBorderSum[main]);
}
function distributeMainAxisAutoMargins(items: FlexItem[], freeMainSpace: number, dir: FlexDirection): number {
    const autoMarginCount = items.reduce((count, item) => count + mainAxisAutoMarginCount(item.marginIsAuto, dir), 0);
    if (autoMarginCount === 0 || freeMainSpace <= 0)
        return freeMainSpace;
    const autoMarginSize = freeMainSpace / autoMarginCount;
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    for (const item of items) {
        if (flexDirectionIsRow(dir)) {
            if (item.marginIsAuto.left)
                item.margin.left = autoMarginSize;
            if (item.marginIsAuto.right)
                item.margin.right = autoMarginSize;
        }
        else {
            if (item.marginIsAuto.top)
                item.margin.top = autoMarginSize;
            if (item.marginIsAuto.bottom)
                item.margin.bottom = autoMarginSize;
        }
        item.outerTargetSize[main] = item.targetSize[main] + mainAxisMarginSum(item.margin, dir);
    }
    return 0;
}

function resolvedFlexItemStyleSize(styleSize: number | undefined, measuredSize: number, paddingBorderSum: number): number {
    return styleSize === undefined ? measuredSize : Math.max(styleSize, paddingBorderSum);
}

function mainAxisAutoMarginCount(marginIsAuto: Rect, dir: FlexDirection): number {
    if (flexDirectionIsRow(dir)) {
        return Number(marginIsAuto.left) + Number(marginIsAuto.right);
    }
    return Number(marginIsAuto.top) + Number(marginIsAuto.bottom);
}
function distributeFlexLengths(tree: any, items: FlexItem[], innerMain: number, totalGap: number, dir: FlexDirection, defaultAlignment: AlignItems, parentSize: Size, availableSpace: Size, measureFunction: any): void {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const frozen = new Set<FlexItem>();
    const totalHypotheticalOuterMain = items.reduce((sum, item) => sum + item.outerTargetSize[main], 0);
    const growing = totalGap + totalHypotheticalOuterMain < innerMain;
    if (growing) {
        for (const item of items) {
            if (item.style.flexGrow === 0 || item.flexBasisSize[main] > item.targetSize[main]) {
                frozen.add(item);
            }
        }
        const initialFreeSpace = innerMain -
            totalGap -
                items.reduce((sum, item) => sum +
                (frozen.has(item)
                    ? item.outerTargetSize[main]
                    : item.flexBasisSize[main] + mainAxisMarginSum(item.margin, dir)), 0);
        for (let iteration = 0; iteration < items.length + 1; iteration += 1) {
            const unfrozen = items.filter((item) => !frozen.has(item));
            if (unfrozen.length === 0)
                return;

            const usedSpace = totalGap +
                items.reduce((sum, item) => sum +
                    (frozen.has(item)
                        ? item.outerTargetSize[main]
                        : item.flexBasisSize[main] + mainAxisMarginSum(item.margin, dir)), 0);
            const totalGrow = unfrozen.reduce((sum, item) => sum + item.style.flexGrow, 0);
            if (totalGrow <= 0)
                return;

            const rawFreeSpace = innerMain - usedSpace;
            const freeSpace = totalGrow < 1 ? Math.min(initialFreeSpace * totalGrow, rawFreeSpace) : rawFreeSpace;
            let totalViolation = 0;
            for (const item of unfrozen) {
                const unclampedMain = item.flexBasisSize[main] + (freeSpace * item.style.flexGrow) / totalGrow;
                item.violation = setItemMainSizeAndReturnViolation(item, main, unclampedMain);
                totalViolation += item.violation;
            }

            if (Math.abs(totalViolation) < 0.0001) {
                for (const item of unfrozen)
                    frozen.add(item);
            }
            else if (totalViolation > 0) {
                for (const item of unfrozen) {
                    if (item.violation > 0)
                        frozen.add(item);
                }
            }
            else {
                for (const item of unfrozen) {
                    if (item.violation < 0)
                        frozen.add(item);
                }
            }
        }
        return;
    }
    for (let iteration = 0; iteration < items.length + 1; iteration += 1) {
        const freeSpace = innerMain - totalGap - items.reduce((sum, item) => sum + item.outerTargetSize[main], 0);
        if (Math.abs(freeSpace) < 0.0001)
            return;
        const unfrozen = items.filter((item) => !frozen.has(item));
        if (unfrozen.length === 0)
            return;
        let anyViolation = false;
        if (freeSpace > 0) {
            const totalGrow = unfrozen.reduce((sum, item) => sum + item.style.flexGrow, 0);
            if (totalGrow <= 0)
                return;
            for (const item of unfrozen) {
                const unclampedMain = item.targetSize[main] + (freeSpace * item.style.flexGrow) / totalGrow;
                anyViolation = setItemMainSize(item, main, unclampedMain) || anyViolation;
                if (anyViolation && item.targetSize[main] !== unclampedMain)
                    frozen.add(item);
            }
        }
        else {
            const totalShrink = unfrozen.reduce((sum, item) => sum + item.style.flexShrink * item.targetSize[main], 0);
            if (totalShrink <= 0)
                return;
            for (const item of unfrozen) {
                item.resolvedMinMainSize ??=
                    item.eagerAutomaticMinMainSize ??
                        computeAutomaticMinMainSize(tree, item, dir, defaultAlignment, parentSize, availableSpace, measureFunction);
                const scaled = item.style.flexShrink * item.targetSize[main];
                const unclampedMain = Math.max(0, item.targetSize[main] - (-freeSpace * scaled) / totalShrink);
                anyViolation = setItemMainSize(item, main, unclampedMain) || anyViolation;
                if (anyViolation && item.targetSize[main] !== unclampedMain)
                    frozen.add(item);
            }
        }
        if (!anyViolation)
            return;
    }
}
function setItemMainSize(item: FlexItem, main: FlexAxis, unclampedMain: number): boolean {
    const violation = setItemMainSizeAndReturnViolation(item, main, unclampedMain);
    return Math.abs(violation) >= 0.0001;
}
function setItemMainSizeAndReturnViolation(item: FlexItem, main: FlexAxis, unclampedMain: number): number {
    const newMain = maybeClamp(unclampedMain, item.resolvedMinMainSize, item.maxSize[main]) ?? unclampedMain;
    item.outerTargetSize[main] += newMain - item.targetSize[main];
    item.targetSize[main] = newMain;
    return newMain - unclampedMain;
}
function clampFlexAutomaticMinMainSize(minContentMainSize: number, styleMainSize: number | undefined, maxMainSize: number | undefined, paddingBorderMainSum: number): number {
    const maxMinContentMainSize = styleMainSize === undefined
        ? maxMainSize
        : maybeClamp(styleMainSize, undefined, maxMainSize);
    return f32Max(maybeClamp(minContentMainSize, undefined, maxMinContentMainSize) ??
        minContentMainSize, paddingBorderMainSum);
}
function computeAutomaticMinMainSize(tree: any, item: FlexItemBase, dir: FlexDirection, defaultAlignment: AlignItems, parentSize: Size, availableSpace: Size, measureFunction: any): number {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const crossAvailableSpace = automaticMinCrossAvailableSpace(dir, parentSize, availableSpace, item.minSize, item.maxSize);
    const knownDimensions = flexAutomaticMinKnownDimensions(item.styleSize, item.style, defaultAlignment, dir, crossAvailableSpace, item.margin);
    const minContentAvailableSpace = flexMinContentAvailableSpace(dir).withCross(dir, crossAvailableSpace);
    const input = new LayoutInput({
        runMode: RunMode.ComputeSize,
        sizingMode: SizingMode.ContentSize,
        axis: flexDirectionIsRow(dir) ? RequestedAxis.Horizontal : RequestedAxis.Vertical,
        knownDimensions,
        parentSize,
        availableSpace: minContentAvailableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    });
    let minContentMainSize: number;
    if (tree.childCount(item.node) === 0) {
        const cached = item.styleSize[main] === undefined
            ? tree.cacheGet(item.node, input)
            : tree.cacheGetExact(item.node, input);
        if (cached !== undefined) {
            minContentMainSize = cached.size[main];
        }
        else {
            const measuredSize = measureFunction(knownDimensions, minContentAvailableSpace, item.node, tree.getNodeContext(item.node), item.style);
            const outerSize = new Size(measuredSize.width + item.paddingBorderSum.width, measuredSize.height + item.paddingBorderSum.height);
            tree.cacheStore(item.node, input, LayoutOutput.fromOuterSize(outerSize));
            minContentMainSize = outerSize[main];
        }
    }
    else {
        minContentMainSize = tree.computeChildLayout(item.node, input, measureFunction).size[main];
    }
    return clampFlexAutomaticMinMainSize(minContentMainSize, item.styleSize[main], item.maxSize[main], item.paddingBorderSum[main]);
}
function isDefaultMeasureFunction(measureFunction: any): boolean {
    return (measureFunction.isTaffyDefaultMeasure === true);
}
function flexMinContentAvailableSpace(dir: FlexDirection): Size {
    return flexDirectionIsRow(dir)
        ? new Size(AvailableSpace.minContent(), AvailableSpace.maxContent())
        : new Size(AvailableSpace.maxContent(), AvailableSpace.minContent());
}
function flexAutomaticMinKnownDimensions(styleSize: Size, style: Style, defaultAlignment: AlignItems, dir: FlexDirection, crossAvailableSpace: AvailableSpaceValue, margin: Rect): Size {
    const knownDimensions = new Size(styleSize.width, styleSize.height);
    if (flexDirectionIsRow(dir)) {
        knownDimensions.width = undefined;
        if (itemStyleAlignSelf(style, defaultAlignment) === AlignItems.Stretch &&
            !style.margin.top.isAuto() &&
            !style.margin.bottom.isAuto() &&
            knownDimensions.height === undefined) {
            knownDimensions.height = maybeSub(availableSpaceIntoOption(crossAvailableSpace), rectVerticalAxisSum(margin));
        }
    }
    else {
        knownDimensions.height = undefined;
        if (itemStyleAlignSelf(style, defaultAlignment) === AlignItems.Stretch &&
            !style.margin.left.isAuto() &&
            !style.margin.right.isAuto() &&
            knownDimensions.width === undefined) {
            knownDimensions.width = maybeSub(availableSpaceIntoOption(crossAvailableSpace), rectHorizontalAxisSum(margin));
        }
    }
    return knownDimensions;
}
function flexBaseKnownDimensions(tree: any, style: Style, defaultAlignment: AlignItems, parentSize: Size, inputs: LayoutInput, dir: FlexDirection, crossAvailableSpace: AvailableSpaceValue, margin: Rect): Size {
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const knownDimensions = itemKnownDimensions(tree, style, parentSize, inputs, dir, boxSizingAdjustment);
    if (flexDirectionIsRow(dir)) {
        if (knownDimensions.width === undefined &&
            itemStyleAlignSelf(style, defaultAlignment) === AlignItems.Stretch &&
            !style.margin.top.isAuto() &&
            !style.margin.bottom.isAuto() &&
            knownDimensions.height === undefined) {
            knownDimensions.height = maybeSub(availableSpaceIntoOption(crossAvailableSpace) ?? parentSize.height, rectVerticalAxisSum(margin));
        }
    }
    else if (knownDimensions.height === undefined &&
        itemStyleAlignSelf(style, defaultAlignment) === AlignItems.Stretch &&
        !style.margin.left.isAuto() &&
        !style.margin.right.isAuto() &&
        knownDimensions.width === undefined) {
        knownDimensions.width = maybeSub(availableSpaceIntoOption(crossAvailableSpace) ?? parentSize.width, rectHorizontalAxisSum(margin));
    }
    return knownDimensions;
}
function automaticMinCrossAvailableSpace(dir: FlexDirection, parentSize: Size, availableSpace: Size, minSize: Size, maxSize: Size): AvailableSpaceValue {
    if (flexDirectionIsRow(dir)) {
        return clampAvailableSpaceCross(availableSpace.height, parentSize.height, minSize.height, maxSize.height);
    }
    return clampAvailableSpaceCross(availableSpace.width, parentSize.width, minSize.width, maxSize.width);
}
function flexItemMaxContentAvailableSpace(dir: FlexDirection, availableSpace: Size, crossAvailableSpace: AvailableSpaceValue): Size {
    const mainAvailableSpace = availableSpace.main(dir).type === "MinContent"
        ? AvailableSpace.minContent()
        : AvailableSpace.maxContent();
    return AvailableSpaceSize.maxContent().withMain(dir, mainAvailableSpace).withCross(dir, crossAvailableSpace);
}
function clampAvailableSpaceCross(space: AvailableSpaceValue, parentCrossSize: number | undefined, minCrossSize: number | undefined, maxCrossSize: number | undefined): AvailableSpaceValue {
    switch (space.type) {
        case "Definite":
            return AvailableSpace.definite(maybeClamp(parentCrossSize ?? space.value, minCrossSize, maxCrossSize) ??
                parentCrossSize ??
                space.value);
        case "MinContent":
            return minCrossSize === undefined ? space : AvailableSpace.definite(minCrossSize);
        case "MaxContent":
            return maxCrossSize === undefined ? space : AvailableSpace.definite(maxCrossSize);
    }
}
function applyStretchIfNeeded(tree: any, item: FlexItem, lineCross: number, dir: FlexDirection, defaultAlignment: AlignItems, parentSize: Size): void {
    const cross: FlexAxis = flexDirectionIsRow(dir) ? "height" : "width";
    const alignSelf = itemAlignSelf(item, defaultAlignment);
    if (alignSelf !== AlignItems.Stretch ||
        !dimensionIsAuto(item.style.size[cross]) ||
        crossAxisAutoMarginCount(item.marginIsAuto, dir) > 0) {
        return;
    }
    const stretchedCross = Math.max(0, lineCross - crossAxisMarginSum(item.margin, dir));
    const maxSizeIgnoringAspectRatio = maybeAddOptionalSize(maybeResolveDimensionSize(item.style.maxSize, parentSize, tree), item.style.boxSizing === BoxSizing.ContentBox ? item.paddingBorderSum : Size.zero());
    item.targetSize[cross] = maybeClamp(stretchedCross, item.minSize[cross], maxSizeIgnoringAspectRatio[cross]) ?? stretchedCross;
    item.outerTargetSize = new Size(item.targetSize.width + rectHorizontalAxisSum(item.margin), item.targetSize.height + rectVerticalAxisSum(item.margin));
}
function remeasureAutoCrossSize(tree: any, item: FlexItem, dir: FlexDirection, parentSize: Size, availableSpace: Size, measureFunction: any): void {
    const cross: FlexAxis = flexDirectionIsRow(dir) ? "height" : "width";
    if (!dimensionIsAuto(item.style.size[cross]))
        return;
    if (!autoCrossSizeCanDependOnFinalMainSize(tree, item, measureFunction))
        return;
    const knownDimensions = new Size(flexDirectionIsRow(dir) ? item.targetSize.width : undefined, flexDirectionIsRow(dir) ? undefined : item.targetSize.height);
    const childAvailableSpace = new Size(flexDirectionIsRow(dir) ? AvailableSpace.definite(item.targetSize.width) : availableSpace.width, flexDirectionIsRow(dir)
        ? availableSpace.height
        : AvailableSpace.definite(item.targetSize.height));
    const output = tree.computeChildLayout(item.node, new LayoutInput({
        runMode: RunMode.ComputeSize,
        sizingMode: SizingMode.ContentSize,
        axis: flexDirectionIsRow(dir) ? RequestedAxis.Vertical : RequestedAxis.Horizontal,
        knownDimensions,
        parentSize,
        availableSpace: childAvailableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    }), measureFunction);
    const measuredCross = Math.max(maybeClamp(output.size[cross], item.minSize[cross], item.maxSize[cross]) ?? output.size[cross], item.paddingBorderSum[cross]);
    item.targetSize[cross] = measuredCross;
    item.outerTargetSize = new Size(item.targetSize.width + rectHorizontalAxisSum(item.margin), item.targetSize.height + rectVerticalAxisSum(item.margin));
}
function autoCrossSizeCanDependOnFinalMainSize(tree: any, item: FlexItem, measureFunction: any): boolean {
    if (!isDefaultMeasureFunction(measureFunction))
        return true;
    if (item.style.aspectRatio !== undefined)
        return true;
    if (tree.childCount(item.node) === 0)
        return false;
    return item.style.display !== Display.Flex || item.style.flexWrap !== FlexWrap.NoWrap;
}
function itemKnownDimensions(tree: any, style: Style, parentSize: Size, inputs: LayoutInput, dir: FlexDirection, boxSizingAdjustment: Size): Size {
    const main: FlexAxis = flexDirectionIsRow(dir) ? "width" : "height";
    const resolvedBasis = maybeResolveDimension(style.flexBasis, flexDirectionIsRow(dir) ? parentSize.width : parentSize.height, tree);
    const basis = resolvedBasis === undefined ? undefined : resolvedBasis + boxSizingAdjustment[main];
    const knownDimensions = Size.none();
    if (basis === undefined)
        return knownDimensions;
    if (inputs.runMode === RunMode.PerformHiddenLayout)
        return knownDimensions;
    if (flexDirectionIsRow(dir)) {
        knownDimensions.width = basis;
    }
    else {
        knownDimensions.height = basis;
    }
    return knownDimensions;
}
function performAbsoluteLayoutOnAbsoluteChildren(tree: any, node: any, containerStyle: Style, containerPadding: Rect, containerBorder: Rect, contentBoxInset: Rect, innerContainerSize: Size, measureFunction: any): Size {
    let contentSize = Size.zero();
    const insetRelativeSize = new Size(innerContainerSize.width + containerPadding.left + containerPadding.right, innerContainerSize.height + containerPadding.top + containerPadding.bottom);
    const parentSize = new Size(insetRelativeSize.width, insetRelativeSize.height);
    const childParentSize = new Size(innerContainerSize.width, innerContainerSize.height);
    for (let childIndex = 0; childIndex < tree.childCount(node); childIndex += 1) {
        const child = tree.getChildId(node, childIndex);
        const style = tree.getStyle(child);
        if (style.position !== Position.Absolute || style.display === Display.None)
            continue;
        const aspectRatio = style.aspectRatio;
        const margin = style.margin.map((value: any) => value.resolveToOption(parentSize.width, tree));
        const nonAutoMargin = margin.map((value: number | undefined) => value ?? 0);
        const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
        const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
        const inset = style.inset.zipSize(parentSize, (value: any, context: number | undefined) => value.resolveToOption(context, tree));
        const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
        const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
        const minSize = maybeMaxOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment).or(paddingBorderSum.map((value) => value)), paddingBorderSum.map((value) => value));
        const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
        let knownDimensions = maybeClampOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment), minSize, maxSize);
        if (knownDimensions.width === undefined &&
            inset.left !== undefined &&
            inset.right !== undefined) {
            knownDimensions.width = f32Max(insetRelativeSize.width -
                inset.left -
                inset.right -
                nonAutoMargin.left -
                nonAutoMargin.right, 0);
            knownDimensions = maybeClampOptionalSize(knownDimensions.maybeApplyAspectRatio(aspectRatio), minSize, maxSize);
        }
        if (knownDimensions.height === undefined &&
            inset.top !== undefined &&
            inset.bottom !== undefined) {
            knownDimensions.height = f32Max(insetRelativeSize.height -
                inset.top -
                inset.bottom -
                nonAutoMargin.top -
                nonAutoMargin.bottom, 0);
            knownDimensions = maybeClampOptionalSize(knownDimensions.maybeApplyAspectRatio(aspectRatio), minSize, maxSize);
        }
        const containerSize = new Size(contentBoxInset.left + innerContainerSize.width + contentBoxInset.right, contentBoxInset.top + innerContainerSize.height + contentBoxInset.bottom);
        const childAvailableSpace = new Size(AvailableSpace.definite(maybeClamp(containerSize.width, minSize.width, maxSize.width) ?? containerSize.width), AvailableSpace.definite(maybeClamp(containerSize.height, minSize.height, maxSize.height) ?? containerSize.height));
        const measuredOutput = tree.computeChildLayout(child, new LayoutInput({
            runMode: RunMode.ComputeSize,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions,
            parentSize: childParentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        const size = clampSize(knownDimensions.unwrapOr(measuredOutput.size), minSize, maxSize);
        const output = tree.computeChildLayout(child, new LayoutInput({
            runMode: RunMode.PerformLayout,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions: new Size(size.width, size.height),
            parentSize: childParentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        const resolvedMargin = resolveAbsoluteAutoMargins(margin, nonAutoMargin, size, containerSize);
        const location = absoluteChildLocation(size, resolvedMargin, inset, containerStyle, style, containerPadding, contentBoxInset, innerContainerSize);
        const layout = new Layout({
            order: childIndex,
            location,
            size,
            contentSize: output.contentSize,
            scrollbarSize: new Size(style.overflow.y === Overflow.Scroll ? style.scrollbarWidth : 0, style.overflow.x === Overflow.Scroll ? style.scrollbarWidth : 0),
            padding,
            border,
            margin: resolvedMargin,
        });
        tree.setUnroundedLayout(child, layout);
        const sizeContentSizeContribution = new Size(style.overflow.x === Overflow.Visible
            ? f32Max(size.width, output.contentSize.width)
            : size.width, style.overflow.y === Overflow.Visible
            ? f32Max(size.height, output.contentSize.height)
            : size.height);
        if (sizeContentSizeContribution.width > 0 && sizeContentSizeContribution.height > 0) {
            const horizontalScrollbarGutter = containerStyle.direction === Direction.Rtl
                ? contentBoxInset.left - containerPadding.left - containerBorder.left
                : contentBoxInset.right - containerPadding.right - containerBorder.right;
            const absoluteAreaOffset = new Point(containerBorder.left +
                (containerStyle.direction === Direction.Rtl ? horizontalScrollbarGutter : 0), containerBorder.top);
            const relativeLocation = new Point(location.x - absoluteAreaOffset.x, location.y - absoluteAreaOffset.y);
            const width = containerStyle.direction === Direction.Rtl
                ? f32Max(insetRelativeSize.width - relativeLocation.x, 0) +
                    f32Max(sizeContentSizeContribution.width - size.width, 0)
                : relativeLocation.x + sizeContentSizeContribution.width;
            const height = relativeLocation.y + sizeContentSizeContribution.height;
            contentSize = contentSize.zipMap(new Size(width, height), f32Max);
        }
    }
    return contentSize;
}
function resolveAbsoluteAutoMargins(margin: Rect, nonAutoMargin: Rect, size: Size, containerSize: Size): Rect {
    const freeSpace = new Size(f32Max(containerSize.width - size.width - nonAutoMargin.left - nonAutoMargin.right, 0), f32Max(containerSize.height - size.height - nonAutoMargin.top - nonAutoMargin.bottom, 0));
    const horizontalAutoCount = (margin.left === undefined ? 1 : 0) + (margin.right === undefined ? 1 : 0);
    const verticalAutoCount = (margin.top === undefined ? 1 : 0) + (margin.bottom === undefined ? 1 : 0);
    const horizontalAutoSize = horizontalAutoCount === 0 ? 0 : freeSpace.width / horizontalAutoCount;
    const verticalAutoSize = verticalAutoCount === 0 ? 0 : freeSpace.height / verticalAutoCount;
    return new Rect(margin.left ?? horizontalAutoSize, margin.right ?? horizontalAutoSize, margin.top ?? verticalAutoSize, margin.bottom ?? verticalAutoSize);
}
function absoluteChildLocation(size: Size, margin: Rect, inset: Rect, containerStyle: Style, childStyle: Style, containerPadding: Rect, contentBoxInset: Rect, innerContainerSize: Size): Point {
    const isRow = flexDirectionIsRow(containerStyle.flexDirection);
    const isRtl = containerStyle.direction === Direction.Rtl;
    const flexDirection = containerStyle.flexDirection;
    const containerSize = new Size(contentBoxInset.left + innerContainerSize.width + contentBoxInset.right, contentBoxInset.top + innerContainerSize.height + contentBoxInset.bottom);
    const insetEdge = new Rect(contentBoxInset.left - containerPadding.left, contentBoxInset.right - containerPadding.right, contentBoxInset.top - containerPadding.top, contentBoxInset.bottom - containerPadding.bottom);
    const main = absoluteFlexAxisLocation({
        itemSize: isRow ? size.width : size.height,
        startMargin: isRow ? margin.left : margin.top,
        endMargin: isRow ? margin.right : margin.bottom,
        startInset: isRow ? inset.left : inset.top,
        endInset: isRow ? inset.right : inset.bottom,
        insetEdgeStart: isRow ? insetEdge.left : insetEdge.top,
        insetEdgeEnd: isRow ? insetEdge.right : insetEdge.bottom,
        contentStart: isRow ? contentBoxInset.left : contentBoxInset.top,
        contentEnd: isRow ? contentBoxInset.right : contentBoxInset.bottom,
        containerSize: isRow ? containerSize.width : containerSize.height,
        alignment: { type: "main", value: containerStyle.justifyContent ?? AlignContent.FlexStart },
        reversed: flexDirectionIsReverse(flexDirection) !== (isRow && isRtl),
        preferEndInset: isRow && isRtl,
    });
    const cross = absoluteFlexAxisLocation({
        itemSize: isRow ? size.height : size.width,
        startMargin: isRow ? margin.top : margin.left,
        endMargin: isRow ? margin.bottom : margin.right,
        startInset: isRow ? inset.top : inset.left,
        endInset: isRow ? inset.bottom : inset.right,
        insetEdgeStart: isRow ? insetEdge.top : insetEdge.left,
        insetEdgeEnd: isRow ? insetEdge.bottom : insetEdge.right,
        contentStart: isRow ? contentBoxInset.top : contentBoxInset.left,
        contentEnd: isRow ? contentBoxInset.bottom : contentBoxInset.right,
        containerSize: isRow ? containerSize.height : containerSize.width,
        alignment: {
            type: "cross",
            value: childStyle.alignSelf ?? containerStyle.alignItems ?? AlignItems.Stretch,
        },
        reversed: (containerStyle.flexWrap === FlexWrap.WrapReverse) !== (!isRow && isRtl),
        preferEndInset: !isRow && isRtl,
    });
    return isRow ? new Point(main, cross) : new Point(cross, main);
}
function absoluteFlexAxisLocation(input: AbsoluteFlexAxisLocationInput): number {
    if (input.startInset !== undefined || input.endInset !== undefined) {
        if (input.preferEndInset && input.endInset !== undefined) {
            return (input.containerSize - input.insetEdgeEnd - input.itemSize - input.endInset - input.endMargin);
        }
        if (input.startInset !== undefined) {
            return input.insetEdgeStart + input.startInset + input.startMargin;
        }
        return (input.containerSize -
            input.insetEdgeEnd -
            input.itemSize -
            (input.endInset ?? 0) -
            input.endMargin);
    }
    switch (alignmentLocation(input.alignment, input.reversed)) {
        case "start":
            return input.contentStart + input.startMargin;
        case "end":
            return input.containerSize - input.contentEnd - input.itemSize - input.endMargin;
        case "center":
            return ((input.containerSize +
                input.contentStart -
                input.contentEnd -
                input.itemSize +
                input.startMargin -
                input.endMargin) /
                2);
    }
}
function alignmentLocation(alignment: FlexAlignment, reversed: boolean): "start" | "end" | "center" {
    if (alignment.type === "main") {
        switch (alignment.value) {
            case AlignContent.SpaceBetween:
            case AlignContent.SpaceAround:
            case AlignContent.SpaceEvenly:
            case AlignContent.Center:
                return alignment.value === AlignContent.SpaceBetween ? "start" : "center";
            case AlignContent.Start:
                return reversed ? "end" : "start";
            case AlignContent.End:
                return reversed ? "start" : "end";
            case AlignContent.FlexStart:
                return reversed ? "end" : "start";
            case AlignContent.FlexEnd:
                return reversed ? "start" : "end";
            case AlignContent.Stretch:
                return reversed ? "end" : "start";
        }
    }
    switch (alignment.value) {
        case AlignItems.Start:
            return reversed ? "end" : "start";
        case AlignItems.End:
            return reversed ? "start" : "end";
        case AlignItems.FlexStart:
        case AlignItems.Stretch:
        case AlignItems.Baseline:
            return reversed ? "end" : "start";
        case AlignItems.FlexEnd:
            return reversed ? "start" : "end";
        case AlignItems.Center:
            return "center";
    }
}
function clampSize(size: Size, minSize: Size, maxSize: Size): Size {
    return new Size(maybeClamp(size.width, minSize.width, maxSize.width) ?? size.width, maybeClamp(size.height, minSize.height, maxSize.height) ?? size.height);
}
function maybeMaxOr(left: number | undefined, right: number | undefined, fallback: number): number {
    if (left === undefined)
        return right === undefined ? fallback : Math.max(right, fallback);
    return Math.max(right === undefined ? left : Math.max(left, right), fallback);
}
function maybeMinOr(left: number | undefined, right: number | undefined, fallback: number): number {
    if (left === undefined)
        return right === undefined ? fallback : Math.min(right, fallback);
    return Math.min(right === undefined ? left : Math.min(left, right), fallback);
}
function resolveLengthPercentageSize(size: Size, context: Size, tree: any): Size {
    return new Size(resolveLengthPercentageOrZero(size.width, context.width, tree), resolveLengthPercentageOrZero(size.height, context.height, tree));
}
function itemLocation(mainStart: number, crossStart: number, dir: FlexDirection, direction: Direction, inset: Rect, innerContainerSize: Size, targetSize: Size, outerTargetSize: Size): Point {
    const isRtl = direction === Direction.Rtl;
    const mainReverse = mainAxisLayoutIsReversed(dir, direction);
    const crossReverse = !flexDirectionIsRow(dir) && isRtl;
    if (flexDirectionIsRow(dir)) {
        return new Point(mainReverse
            ? inset.left + innerContainerSize.width - mainStart - targetSize.width
            : inset.left + mainStart, inset.top + crossStart);
    }
    return new Point(crossReverse
        ? inset.left + innerContainerSize.width - crossStart - targetSize.width
        : inset.left + crossStart, mainReverse
        ? inset.top + innerContainerSize.height - mainStart - targetSize.height
        : inset.top + mainStart);
}
function mainAxisLayoutIsReversed(dir: FlexDirection, direction: Direction): boolean {
    const isRtl = direction === Direction.Rtl;
    return flexDirectionIsRow(dir)
        ? flexDirectionIsReverse(dir) !== isRtl
        : flexDirectionIsReverse(dir);
}
function relativeInsetOffset(inset: Rect, position: Position, direction: Direction): Point {
    if (position !== Position.Relative)
        return Point.zero();
    return new Point(direction === Direction.Rtl
        ? inset.right !== undefined
            ? -inset.right
            : (inset.left ?? 0)
        : (inset.left ?? -(inset.right ?? 0)), inset.top ?? -(inset.bottom ?? 0));
}
function crossAxisOffset(item: FlexItem, lineCross: number, lineBaseline: number | undefined, dir: FlexDirection, defaultAlignment: AlignItems, isWrapReverse: boolean): number {
    const freeSpace = lineCross - item.outerTargetSize[flexDirectionIsRow(dir) ? "height" : "width"];
    const autoMarginCount = crossAxisAutoMarginCount(item.marginIsAuto, dir);
    if (autoMarginCount > 0 && freeSpace > 0) {
        const autoMarginSize = freeSpace / autoMarginCount;
        if (flexDirectionIsRow(dir)) {
            if (item.marginIsAuto.top)
                item.margin.top = autoMarginSize;
            if (item.marginIsAuto.bottom)
                item.margin.bottom = autoMarginSize;
        }
        else {
            if (item.marginIsAuto.left)
                item.margin.left = autoMarginSize;
            if (item.marginIsAuto.right)
                item.margin.right = autoMarginSize;
        }
        return crossStartMargin(item.margin, dir);
    }
    const alignSelf = itemAlignSelf(item, defaultAlignment);
    switch (alignSelf) {
        case AlignItems.End:
            return freeSpace + crossStartMargin(item.margin, dir);
        case AlignItems.FlexEnd:
            return (isWrapReverse ? 0 : freeSpace) + crossStartMargin(item.margin, dir);
        case AlignItems.Center:
            return freeSpace / 2 + crossStartMargin(item.margin, dir);
        case AlignItems.Start:
            return crossStartMargin(item.margin, dir);
        case AlignItems.Baseline:
            if (flexDirectionIsRow(dir) && lineBaseline !== undefined) {
                return lineBaseline - item.baseline;
            }
            return (isWrapReverse ? freeSpace : 0) + crossStartMargin(item.margin, dir);
        case AlignItems.Stretch:
        case AlignItems.FlexStart:
            return (isWrapReverse ? freeSpace : 0) + crossStartMargin(item.margin, dir);
    }
}
function itemAlignSelf(item: FlexItem, defaultAlignment: AlignItems): AlignItems {
    return item.style.alignSelf ?? defaultAlignment;
}
function itemStyleAlignSelf(style: Style, defaultAlignment: AlignItems): AlignItems {
    return style.alignSelf ?? defaultAlignment;
}
function mainStartMargin(margin: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir) ? margin.left : margin.top;
}
function mainAxisMarginSum(margin: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir) ? rectHorizontalAxisSum(margin) : rectVerticalAxisSum(margin);
}
function crossStartMargin(margin: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir) ? margin.top : margin.left;
}
function crossAxisMarginSum(margin: Rect, dir: FlexDirection): number {
    return flexDirectionIsRow(dir) ? rectVerticalAxisSum(margin) : rectHorizontalAxisSum(margin);
}
function crossAxisAutoMarginCount(marginIsAuto: Rect, dir: FlexDirection): number {
    if (flexDirectionIsRow(dir)) {
        return Number(marginIsAuto.top) + Number(marginIsAuto.bottom);
    }
    return Number(marginIsAuto.left) + Number(marginIsAuto.right);
}
function dimensionIsAuto(dimension: Dimension): boolean {
    return dimension.isAuto();
}
