/** Shared layout helpers used by root, cache, rounding, and content-size compute paths. */
import { Line, Point, Rect, Size, rectAdd, rectHorizontalAxisSum, rectSumAxes, } from "../geometry.js";
import { AvailableSpace, sizeAvailableSpaceIntoOptions } from "../style/available-space.js";
import { maybeResolveDimensionSize, resolveLengthPercentageAutoRectOrZero, resolveLengthPercentageRectOrZero, } from "../style/dimensions.js";
import { AlignContent, BoxSizing, Direction, Display, Overflow, Style } from "../style/style.js";
import { maybeAddOptionalSize, maybeClampOptionalSize, maybeMaxOptionalSize, } from "../util/math.js";
import { f32Max, f32Min } from "../util/sys.js";
import { Layout, LayoutInput, LayoutOutput, RequestedAxis, RunMode, SizingMode, } from "../tree/layout.js";
import type { NodeId } from "../tree/taffy-tree.js";

type CachedLayoutTree = {
    cacheGet(node: NodeId, input: LayoutInput): LayoutOutput | undefined;
    cacheStore(node: NodeId, input: LayoutInput, layoutOutput: LayoutOutput): void;
};

type RootLayoutTree = {
    getCoreContainerStyle(node: NodeId): Style;
    computeChildLayout(node: NodeId, input: LayoutInput): LayoutOutput;
    setUnroundedLayout(node: NodeId, layout: Layout): void;
    resolveCalcValue?(value: unknown, basis: number): number;
    resolve_calc_value?(value: unknown, basis: number): number;
};

type HiddenLayoutTree = RootLayoutTree & {
    cacheClear(node: NodeId): void;
    childCount(node: NodeId): number;
    getChildId(node: NodeId, childIndex: number): NodeId;
};

type RoundLayoutTree = {
    getUnroundedLayout(node: NodeId): Layout;
    setFinalLayout(node: NodeId, layout: Layout): void;
    childCount(node: NodeId): number;
    getChildId(node: NodeId, childIndex: number): NodeId;
};

type AlignContentValue =
    | "Start"
    | "End"
    | "FlexStart"
    | "FlexEnd"
    | "Center"
    | "Stretch"
    | "SpaceBetween"
    | "SpaceEvenly"
    | "SpaceAround";

export function computeCachedLayout<TTree extends CachedLayoutTree>(
    tree: TTree,
    node: NodeId,
    input: LayoutInput,
    computeUncached: (tree: TTree, node: NodeId, input: LayoutInput) => LayoutOutput,
): LayoutOutput {
    const cached = tree.cacheGet(node, input);
    if (cached !== undefined)
        return cached;
    const computed = computeUncached(tree, node, input);
    tree.cacheStore(node, input, computed);
    return computed;
}
export const compute_cached_layout = computeCachedLayout;
export function computeRootLayout(tree: RootLayoutTree, root: NodeId, availableSpace: Size): void {
    const output = tree.computeChildLayout(root, new LayoutInput({
        runMode: RunMode.PerformLayout,
        sizingMode: SizingMode.InherentSize,
        axis: RequestedAxis.Both,
        knownDimensions: rootKnownDimensions(tree.getCoreContainerStyle(root), availableSpace, tree),
        parentSize: sizeAvailableSpaceIntoOptions(availableSpace),
        availableSpace,
        verticalMarginsAreCollapsible: Line.false(),
    }));
    const style = tree.getCoreContainerStyle(root);
    const parentWidth = sizeAvailableSpaceIntoOptions(availableSpace).width;
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentWidth, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentWidth, tree);
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentWidth, tree);
    const scrollbarSize = new Size(style.overflow.y === Overflow.Scroll ? style.scrollbarWidth : 0, style.overflow.x === Overflow.Scroll ? style.scrollbarWidth : 0);
    const location = new Point(style.direction === Direction.Rtl && availableSpace.width.type === "Definite"
        ? availableSpace.width.value - output.size.width
        : 0, 0);
    tree.setUnroundedLayout(root, new Layout({
        order: 0,
        location,
        size: output.size,
        contentSize: output.contentSize,
        scrollbarSize,
        padding,
        border,
        margin,
    }));
}
export const compute_root_layout = computeRootLayout;
export function computeHiddenLayout(tree: HiddenLayoutTree, node: NodeId): LayoutOutput {
    tree.cacheClear(node);
    tree.setUnroundedLayout(node, Layout.withOrder(0));
    for (let index = 0; index < tree.childCount(node); index += 1) {
        tree.computeChildLayout(tree.getChildId(node, index), LayoutInput.hidden());
    }
    return LayoutOutput.hidden();
}
export const compute_hidden_layout = computeHiddenLayout;
export function roundLayout(tree: RoundLayoutTree, node: NodeId): void {
    roundLayoutInner(tree, node, 0, 0);
}
export const round_layout = roundLayout;
export function applyAlignmentFallback(freeSpace: number, numItems: number, alignmentMode: AlignContentValue, isSafe: boolean): AlignContentValue {
    let mode = alignmentMode;
    let safe = isSafe;
    if (numItems <= 1 || freeSpace <= 0) {
        switch (mode) {
            case AlignContent.Stretch:
            case AlignContent.SpaceBetween:
                mode = AlignContent.FlexStart;
                safe = true;
                break;
            case AlignContent.SpaceAround:
            case AlignContent.SpaceEvenly:
                mode = AlignContent.Center;
                safe = true;
                break;
        }
    }
    if (freeSpace <= 0 && safe) {
        mode = AlignContent.Start;
    }
    return mode;
}
export const apply_alignment_fallback = applyAlignmentFallback;
export function computeAlignmentOffset(
    freeSpace: number,
    numItems: number,
    gap: number,
    alignmentMode: AlignContentValue,
    layoutIsFlexReversed: boolean,
    isFirst: boolean,
): number {
    if (isFirst) {
        switch (alignmentMode) {
            case AlignContent.Start:
                return 0;
            case AlignContent.FlexStart:
                return layoutIsFlexReversed ? freeSpace : 0;
            case AlignContent.End:
                return freeSpace;
            case AlignContent.FlexEnd:
                return layoutIsFlexReversed ? 0 : freeSpace;
            case AlignContent.Center:
                return freeSpace / 2;
            case AlignContent.Stretch:
            case AlignContent.SpaceBetween:
                return 0;
            case AlignContent.SpaceAround:
                return freeSpace >= 0 ? freeSpace / numItems / 2 : freeSpace / 2;
            case AlignContent.SpaceEvenly:
                return freeSpace >= 0 ? freeSpace / (numItems + 1) : freeSpace / 2;
        }
    }
    const positiveFreeSpace = f32Max(freeSpace, 0);
    switch (alignmentMode) {
        case AlignContent.SpaceBetween:
            return gap + positiveFreeSpace / (numItems - 1);
        case AlignContent.SpaceAround:
            return gap + positiveFreeSpace / numItems;
        case AlignContent.SpaceEvenly:
            return gap + positiveFreeSpace / (numItems + 1);
        default:
            return gap;
    }
}
export const compute_alignment_offset = computeAlignmentOffset;
export function computeContentSizeContribution(location: Point, size: Size, contentSize: Size, overflow: Point): Size {
    const sizeContentSizeContribution = new Size(overflow.x === Overflow.Visible ? f32Max(size.width, contentSize.width) : size.width, overflow.y === Overflow.Visible ? f32Max(size.height, contentSize.height) : size.height);
    if (sizeContentSizeContribution.width > 0 && sizeContentSizeContribution.height > 0) {
        const maxX = f32Max(location.x + sizeContentSizeContribution.width, 0);
        const minX = f32Min(location.x, 0);
        const maxY = f32Max(location.y + sizeContentSizeContribution.height, 0);
        const minY = f32Min(location.y, 0);
        return new Size(maxX - minX, maxY - minY);
    }
    return Size.zero();
}
export const compute_content_size_contribution = computeContentSizeContribution;
function roundLayoutInner(tree: RoundLayoutTree, node: NodeId, cumulativeX: number, cumulativeY: number): void {
    const unroundedLayout = tree.getUnroundedLayout(node);
    const roundedLayout = roundSingleLayout(unroundedLayout, cumulativeX, cumulativeY);
    tree.setFinalLayout(node, roundedLayout);
    const childCumulativeX = cumulativeX + unroundedLayout.location.x;
    const childCumulativeY = cumulativeY + unroundedLayout.location.y;
    for (let index = 0; index < tree.childCount(node); index += 1) {
        roundLayoutInner(tree, tree.getChildId(node, index), childCumulativeX, childCumulativeY);
    }
}
function roundSingleLayout(layout: Layout, parentCumulativeX: number, parentCumulativeY: number): Layout {
    const cumulativeX = parentCumulativeX + layout.location.x;
    const cumulativeY = parentCumulativeY + layout.location.y;
    return new Layout({
        order: layout.order,
        location: new Point(roundValue(layout.location.x), roundValue(layout.location.y)),
        size: new Size(roundValue(cumulativeX + layout.size.width) - roundValue(cumulativeX), roundValue(cumulativeY + layout.size.height) - roundValue(cumulativeY)),
        contentSize: new Size(roundValue(cumulativeX + layout.contentSize.width) - roundValue(cumulativeX), roundValue(cumulativeY + layout.contentSize.height) - roundValue(cumulativeY)),
        scrollbarSize: new Size(roundValue(layout.scrollbarSize.width), roundValue(layout.scrollbarSize.height)),
        border: new Rect(roundValue(cumulativeX + layout.border.left) - roundValue(cumulativeX), roundValue(cumulativeX + layout.size.width) -
            roundValue(cumulativeX + layout.size.width - layout.border.right), roundValue(cumulativeY + layout.border.top) - roundValue(cumulativeY), roundValue(cumulativeY + layout.size.height) -
            roundValue(cumulativeY + layout.size.height - layout.border.bottom)),
        padding: new Rect(roundValue(cumulativeX + layout.padding.left) - roundValue(cumulativeX), roundValue(cumulativeX + layout.size.width) -
            roundValue(cumulativeX + layout.size.width - layout.padding.right), roundValue(cumulativeY + layout.padding.top) - roundValue(cumulativeY), roundValue(cumulativeY + layout.size.height) -
            roundValue(cumulativeY + layout.size.height - layout.padding.bottom)),
        margin: layout.margin,
    });
}
function roundValue(value: number): number {
    return Math.floor(value + 0.5);
}
function rootKnownDimensions(style: Style, availableSpace: Size, tree: RootLayoutTree): Size {
    if (style.display !== Display.Block)
        return Size.none();
    const parentSize = sizeAvailableSpaceIntoOptions(availableSpace);
    const aspectRatio = style.aspectRatio;
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree);
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
    const paddingBorderSize = rectSumAxes(rectAdd(padding, border));
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSize : Size.zero();
    const minSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
    const clampedStyleSize = maybeClampOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment), minSize, maxSize);
    const minMaxDefiniteSize = minSize.zipMap(maxSize, (min: number | undefined, max: number | undefined) => min !== undefined && max !== undefined && max <= min ? min : undefined);
    const availableSpaceBasedSize = new Size(availableSpace.width.type === "Definite"
        ? availableSpace.width.value - rectHorizontalAxisSum(margin)
        : undefined, undefined);
    return maybeMaxOptionalSize(minMaxDefiniteSize.or(clampedStyleSize).or(availableSpaceBasedSize), paddingBorderSize.map((value: number) => value));
}
