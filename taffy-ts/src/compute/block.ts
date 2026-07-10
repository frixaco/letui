import { Line, Point, Rect, Size, rectAdd, rectHorizontalAxisSum, rectSumAxes, rectVerticalAxisSum, } from "../geometry.js";
import { AvailableSpace } from "../style/available-space.js";
import { maybeResolveDimensionSize, resolveLengthPercentageAutoRectOrZero, resolveLengthPercentageRectOrZero, } from "../style/dimensions.js";
import { BoxSizing, Clear, Direction, Display, Float, Overflow, Position, Style, TextAlign, FloatDirection, floatDirection, overflowIsScrollContainer, } from "../style/style.js";
import { CollapsibleMarginSet, Layout, LayoutInput, LayoutOutput, RequestedAxis, RunMode, SizingMode, } from "../tree/layout.js";
import type { MeasureFunction, NodeId, TaffyTree } from "../tree/taffy-tree.js";
import { availableSpaceMaybeSub, maybeAddOptionalSize, maybeClamp, maybeClampOptionalSize, maybeMaxOptionalSize, } from "../util/math.js";
import { f32Max } from "../util/sys.js";
import { computeContentSizeContribution } from "./common.js";
import { FloatContext, FloatIntrinsicWidthCalculator } from "./float.js";

type Insets = [number, number];
type ClearValue = Clear;
type DirectionValue = Direction;
type FloatDirectionValue = FloatDirection;
type FloatValue = Float;

type BlockItem = {
    node: NodeId<unknown>;
    order: number;
    style: Style;
    marginIsAuto: Rect;
    padding: Rect;
    border: Rect;
    paddingBorderSum: Size;
    size: Size;
    minSize: Size;
    maxSize: Size;
    position: Position;
    float: FloatValue;
    isTable: boolean;
    isInSameBfc: boolean;
    staticPosition: Point;
    computedSize: Size;
    canCollapseThrough: boolean;
};

type InFlowLayoutResult = {
    contentSize: Size;
    intrinsicOuterHeight: number;
    firstTopMargin: CollapsibleMarginSet;
    lastBottomMargin: CollapsibleMarginSet;
};

export class BlockFormattingContext {
    floatContext = FloatContext.new();
    static default() {
        return new BlockFormattingContext();
    }
    static new() {
        return BlockFormattingContext.default();
    }
    rootBlockContext() {
        return new BlockContext(this.floatContext, 0, [0, 0], [0, 0], 0, true);
    }
    root_block_context() {
        return this.rootBlockContext();
    }
}
export class BlockContext {
    floatContext: FloatContext;
    yOffset: number;
    insets: Insets;
    contentBoxInsets: Insets;
    floatContentContribution: number;
    isRoot: boolean;
    constructor(floatContext: FloatContext, yOffset: number = 0, insets: Insets = [0, 0], contentBoxInsets: Insets = [0, 0], floatContentContribution: number = 0, isRoot: boolean = true) {
        this.floatContext = floatContext;
        this.yOffset = yOffset;
        this.insets = insets;
        this.contentBoxInsets = contentBoxInsets;
        this.floatContentContribution = floatContentContribution;
        this.isRoot = isRoot;
    }
    subContext(additionalYOffset: number, insets: Insets): BlockContext {
        const resolvedInsets: Insets = [
            this.insets[0] + insets[0],
            this.insets[1] + insets[1],
        ];
        return new BlockContext(this.floatContext, this.yOffset + additionalYOffset, resolvedInsets, resolvedInsets, 0, false);
    }
    sub_context(additionalYOffset: number, insets: Insets): BlockContext {
        return this.subContext(additionalYOffset, insets);
    }
    isBfcRoot() {
        return this.isRoot;
    }
    is_bfc_root() {
        return this.isBfcRoot();
    }
    setWidth(availableWidth: number): void {
        this.floatContext.setWidth(availableWidth);
    }
    set_width(availableWidth: number): void {
        this.setWidth(availableWidth);
    }
    applyContentBoxInset(contentBoxXInsets: Insets): void {
        this.contentBoxInsets = [
            this.insets[0] + contentBoxXInsets[0],
            this.insets[1] + contentBoxXInsets[1],
        ];
    }
    apply_content_box_inset(contentBoxXInsets: Insets): void {
        this.applyContentBoxInset(contentBoxXInsets);
    }
    hasFloats() {
        return this.floatContext.hasFloats();
    }
    has_floats() {
        return this.hasFloats();
    }
    hasActiveFloats(minY: number) {
        return this.floatContext.hasActiveFloats(minY + this.yOffset);
    }
    has_active_floats(minY: number) {
        return this.hasActiveFloats(minY);
    }
    placeFloatedBox(floatedBox: Size, minY: number, direction: FloatDirectionValue, clear: ClearValue) {
        const position = this.floatContext.placeFloatedBox(floatedBox, minY + this.yOffset, this.contentBoxInsets, direction, clear);
        const adjustedPosition = new Point(position.x - this.insets[0], position.y - this.yOffset);
        this.floatContentContribution = f32Max(this.floatContentContribution, adjustedPosition.y + floatedBox.height);
        return adjustedPosition;
    }
    place_floated_box(floatedBox: Size, minY: number, direction: FloatDirectionValue, clear: ClearValue) {
        return this.placeFloatedBox(floatedBox, minY, direction, clear);
    }
    findContentSlot(minY: number, clear: ClearValue, after: number | undefined) {
        const slot = this.floatContext.findContentSlot(minY + this.yOffset, this.contentBoxInsets, clear, after);
        return { ...slot, x: slot.x - this.insets[0], y: slot.y - this.yOffset };
    }
    find_content_slot(minY: number, clear: ClearValue, after: number | undefined) {
        return this.findContentSlot(minY, clear, after);
    }
    clearedThreshold(clear: ClearValue) {
        const threshold = this.floatContext.clearedThreshold(clear);
        return threshold === undefined ? undefined : threshold - this.yOffset;
    }
    cleared_threshold(clear: ClearValue) {
        return this.clearedThreshold(clear);
    }
    addChildFloatedContentHeightContribution(childContribution: number): void {
        this.floatContentContribution = f32Max(this.floatContentContribution, childContribution);
    }
    add_child_floated_content_height_contribution(childContribution: number): void {
        this.addChildFloatedContentHeightContribution(childContribution);
    }
    floatedContentHeightContribution() {
        return this.floatContentContribution;
    }
    floated_content_height_contribution() {
        return this.floatedContentHeightContribution();
    }
}
export function computeBlockLayout(tree: TaffyTree, node: NodeId<unknown>, inputs: LayoutInput, measureFunction: MeasureFunction): LayoutOutput {
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
    const clampedStyleSize = inputs.sizingMode === SizingMode.InherentSize
        ? maybeClampOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment), minSize, maxSize)
        : Size.none();
    const minMaxDefiniteSize = minSize.zipMap(maxSize, (min, max) => min !== undefined && max !== undefined && max <= min ? min : undefined);
    const knownDimensions = maybeMaxOptionalSize(inputs.knownDimensions
        .or(minMaxDefiniteSize)
        .or(clampedStyleSize), paddingBorderSum.map((value) => value));
    if (inputs.runMode === RunMode.ComputeSize &&
        knownDimensions.width !== undefined &&
        knownDimensions.height !== undefined) {
        return LayoutOutput.fromOuterSize(new Size(knownDimensions.width, knownDimensions.height));
    }
    const scrollbarGutter = style.overflow
        .transpose()
        .map((overflow: any) => (overflow === Overflow.Scroll ? style.scrollbarWidth : 0));
    const contentBoxInset = new Rect(padding.left + border.left + (style.direction === Direction.Rtl ? scrollbarGutter.x : 0), padding.right + border.right + (style.direction === Direction.Ltr ? scrollbarGutter.x : 0), padding.top + border.top, padding.bottom + border.bottom + scrollbarGutter.y);
    const innerKnownSize = knownDimensions
        .maybeApplyAspectRatio(aspectRatio)
        .or(Size.none())
        .zipMap(rectSumAxes(contentBoxInset), (size, inset) => size === undefined ? undefined : Math.max(0, size - inset));
    const isScrollContainer = overflowIsScrollContainer(style.overflow.x) || overflowIsScrollContainer(style.overflow.y);
    const ownMarginsCollapseWithChildren = new Line(inputs.verticalMarginsAreCollapsible.start &&
        !isScrollContainer &&
        style.position === Position.Relative &&
        padding.top === 0 &&
        border.top === 0, inputs.verticalMarginsAreCollapsible.end &&
        !isScrollContainer &&
        style.position === Position.Relative &&
        padding.bottom === 0 &&
        border.bottom === 0 &&
        clampedStyleSize.height === undefined);
    const hasStylesPreventingBeingCollapsedThrough = style.display !== Display.Block ||
        isScrollContainer ||
        style.position === Position.Absolute ||
        padding.top > 0 ||
        padding.bottom > 0 ||
        border.top > 0 ||
        border.bottom > 0 ||
        (clampedStyleSize.height !== undefined && clampedStyleSize.height > 0) ||
        (minSize.height !== undefined && minSize.height > 0);
    const items = generateBlockItems(tree, node, innerKnownSize);
    const outerWidth = knownDimensions.width ??
        maybeClamp(determineContentBasedWidth(tree, items, inputs.availableSpace.width, measureFunction) +
            rectHorizontalAxisSum(contentBoxInset), minSize.width, maxSize.width) ??
        rectHorizontalAxisSum(paddingBorder);
    if (inputs.runMode === RunMode.ComputeSize && knownDimensions.height !== undefined) {
        return LayoutOutput.fromOuterSize(new Size(outerWidth, knownDimensions.height));
    }
    const resolvedPadding = resolveLengthPercentageRectOrZero(style.padding, outerWidth, tree);
    const resolvedBorder = resolveLengthPercentageRectOrZero(style.border, outerWidth, tree);
    const resolvedContentBoxInset = new Rect(resolvedPadding.left +
        resolvedBorder.left +
        (style.direction === Direction.Rtl ? scrollbarGutter.x : 0), resolvedPadding.right +
        resolvedBorder.right +
        (style.direction === Direction.Ltr ? scrollbarGutter.x : 0), resolvedPadding.top + resolvedBorder.top, resolvedPadding.bottom + resolvedBorder.bottom + scrollbarGutter.y);
    const innerWidth = Math.max(0, outerWidth - rectHorizontalAxisSum(resolvedContentBoxInset));
    const parentForChildren = new Size(innerWidth, knownDimensions.height ?? clampedStyleSize.height ?? minSize.height);
    const layoutResult = performFinalLayoutOnInFlowChildren(tree, items, outerWidth, innerWidth, parentForChildren.height, resolvedContentBoxInset, ownMarginsCollapseWithChildren, style, measureFunction);
    const intrinsicOuterHeight = layoutResult.intrinsicOuterHeight;
    const outerHeight = knownDimensions.height ??
        f32Max(maybeClamp(intrinsicOuterHeight, minSize.height, maxSize.height) ?? intrinsicOuterHeight, rectVerticalAxisSum(paddingBorder));
    const outerSize = new Size(outerWidth, outerHeight);
    if (inputs.runMode === RunMode.ComputeSize) {
        return LayoutOutput.fromOuterSize(outerSize);
    }
    const absoluteContentSize = performAbsoluteLayoutOnAbsoluteChildren(tree, items, new Size(Math.max(0, outerSize.width - rectHorizontalAxisSum(resolvedBorder) - scrollbarGutter.x), Math.max(0, outerSize.height - rectVerticalAxisSum(resolvedBorder) - scrollbarGutter.y)), new Point(resolvedBorder.left + (style.direction === Direction.Rtl ? scrollbarGutter.x : 0), resolvedBorder.top), style.direction, measureFunction);
    tree.childIds(node).forEach((child: NodeId<unknown>, order: number) => {
        const childStyle = tree.getStyle(child);
        if (childStyle.display === Display.None) {
            tree.computeChildLayout(child, LayoutInput.hidden(), measureFunction);
            tree.setUnroundedLayout(child, Layout.withOrder(order));
        }
    });
    return new LayoutOutput({
        size: outerSize,
        contentSize: layoutResult.contentSize.zipMap(absoluteContentSize, f32Max),
        firstBaselines: Point.none(),
        topMargin: ownMarginsCollapseWithChildren.start
            ? layoutResult.firstTopMargin
            : CollapsibleMarginSet.fromMargin(resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree).top),
        bottomMargin: ownMarginsCollapseWithChildren.end
            ? layoutResult.lastBottomMargin
            : CollapsibleMarginSet.fromMargin(resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, tree).bottom),
        marginsCanCollapseThrough: !hasStylesPreventingBeingCollapsedThrough &&
            items.every((item: BlockItem) => item.position === Position.Absolute || item.canCollapseThrough),
    });
}
export const compute_block_layout = computeBlockLayout;
function generateBlockItems(tree: TaffyTree, node: NodeId<unknown>, parentSize: Size): BlockItem[] {
    return tree
        .childIds(node)
        .map((child: NodeId<unknown>) => ({ child, style: tree.getStyle(child) }))
        .filter(({ style }: { child: NodeId<unknown>; style: Style }) => style.display !== Display.None)
        .map(({ child, style }: { child: NodeId<unknown>; style: Style }, order: number) => {
        const aspectRatio = style.aspectRatio;
        const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, tree);
        const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, tree);
        const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
        const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
        const isScrollContainer = overflowIsScrollContainer(style.overflow.x) || overflowIsScrollContainer(style.overflow.y);
        return {
            node: child,
            order,
            style,
            marginIsAuto: style.margin.map((margin: any) => margin.isAuto()),
            padding,
            border,
            paddingBorderSum,
            size: maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment),
            minSize: maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment),
            maxSize: maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment),
            position: style.position,
            float: style.float,
            isTable: style.itemIsTable,
            isInSameBfc: style.display === Display.Block &&
                !style.itemIsTable &&
                style.position !== Position.Absolute &&
                style.float === Float.None &&
                !isScrollContainer,
            staticPosition: Point.zero(),
            computedSize: Size.zero(),
            canCollapseThrough: false,
        };
    });
}
function determineContentBasedWidth(tree: TaffyTree, items: BlockItem[], availableWidth: any, measureFunction: MeasureFunction): number {
    let maxChildWidth = 0;
    const floatContribution = FloatIntrinsicWidthCalculator.new(availableWidth);
    for (const item of items) {
        if (item.position === Position.Absolute)
            continue;
        const knownDimensions = maybeClampOptionalSize(item.size, item.minSize, item.maxSize);
        const margin = resolveLengthPercentageAutoRectOrZero(item.style.margin, availableWidth.type === "Definite" ? availableWidth.value : undefined, tree);
        const childAvailableWidth = availableSpaceMaybeSub(availableWidth, rectHorizontalAxisSum(margin));
        const output = knownDimensions.width === undefined
            ? tree.computeChildLayout(item.node, new LayoutInput({
                runMode: RunMode.ComputeSize,
                sizingMode: SizingMode.InherentSize,
                axis: RequestedAxis.Both,
                knownDimensions,
                parentSize: Size.none(),
                availableSpace: new Size(childAvailableWidth, AvailableSpace.minContent()),
                verticalMarginsAreCollapsible: Line.true(),
            }), measureFunction)
            : LayoutOutput.fromOuterSize(new Size(knownDimensions.width, knownDimensions.height ?? 0));
        const outerChildWidth = f32Max(output.size.width, item.paddingBorderSum.width) + rectHorizontalAxisSum(margin);
        if (item.float !== Float.None) {
            floatContribution.addFloat(outerChildWidth, floatDirection(item.float)!, item.style.clear);
        }
        else {
            maxChildWidth = f32Max(maxChildWidth, outerChildWidth);
        }
    }
    return f32Max(maxChildWidth, floatContribution.result());
}
function performFinalLayoutOnInFlowChildren(tree: TaffyTree, items: BlockItem[], outerWidth: number, innerWidth: number, parentHeight: number | undefined, contentBoxInset: Rect, ownMarginsCollapseWithChildren: Line, containerStyle: Style, measureFunction: MeasureFunction): InFlowLayoutResult {
    let contentSize = Size.zero();
    let committedY = contentBoxInset.top;
    let absoluteY = contentBoxInset.top;
    let activeMargin = CollapsibleMarginSet.zero();
    let firstTopMargin = CollapsibleMarginSet.zero();
    let isCollapsingWithFirstMargin = true;
    let hasPlacedInFlowChild = false;
    const floatContext = FloatContext.new();
    floatContext.setWidth(outerWidth);
    const containingBlockInsets: [number, number] = [contentBoxInset.left, contentBoxInset.right];
    let floatBottom = contentBoxInset.top;
    for (const item of items) {
        if (item.position === Position.Absolute) {
            item.staticPosition = new Point(containerStyle.direction === Direction.Rtl
                ? outerWidth - contentBoxInset.right
                : contentBoxInset.left, absoluteY);
            continue;
        }
        if (item.float !== Float.None) {
            const marginOption = item.style.margin.map((margin: any) => margin.resolveToOption(outerWidth, tree));
            const margin = marginOption.map((value: number | undefined) => value ?? 0);
            const knownDimensions = maybeClampOptionalSize(item.size, item.minSize, item.maxSize);
            const output = tree.computeChildLayout(item.node, new LayoutInput({
                runMode: RunMode.PerformLayout,
                sizingMode: SizingMode.InherentSize,
                axis: RequestedAxis.Both,
                knownDimensions,
                parentSize: new Size(innerWidth, parentHeight),
                availableSpace: new Size(AvailableSpace.definite(innerWidth), AvailableSpace.minContent()),
                verticalMarginsAreCollapsible: Line.false(),
            }), measureFunction);
            const outerFloatWidth = output.size.width + rectHorizontalAxisSum(margin);
            const outerFloatHeight = output.size.height + rectVerticalAxisSum(margin);
            const marginBoxLocation = floatContext.placeFloatedBox(new Size(outerFloatWidth, outerFloatHeight), contentBoxInset.top, containingBlockInsets, floatDirection(item.float)!, item.style.clear);
            const x = marginBoxLocation.x + margin.left;
            const y = marginBoxLocation.y + margin.top;
            floatBottom = f32Max(floatBottom, marginBoxLocation.y + outerFloatHeight);
            tree.setUnroundedLayout(item.node, new Layout({
                order: item.order,
                location: new Point(x, y),
                size: output.size,
                contentSize: output.contentSize,
                scrollbarSize: new Size(item.style.overflow.y === Overflow.Scroll ? item.style.scrollbarWidth : 0, item.style.overflow.x === Overflow.Scroll ? item.style.scrollbarWidth : 0),
                padding: item.padding,
                border: item.border,
                margin,
            }));
            item.staticPosition = new Point(x, y);
            item.computedSize = output.size;
            item.canCollapseThrough = output.marginsCanCollapseThrough;
            contentSize = contentSize.zipMap(computeContentSizeContribution(new Point(x - contentBoxInset.left, y - contentBoxInset.top), output.size, output.contentSize, item.style.overflow), f32Max);
            continue;
        }
        const marginOption = item.style.margin.map((margin: any) => margin.resolveToOption(outerWidth, tree));
        const nonAutoMargin = marginOption.map((margin: number | undefined) => margin ?? 0);
        let yMarginOffset = 0;
        if (!item.isInSameBfc ||
            !isCollapsingWithFirstMargin ||
            !ownMarginsCollapseWithChildren.start) {
            yMarginOffset = hasPlacedInFlowChild
                ? activeMargin.collapseWithMargin(nonAutoMargin.top).resolve()
                : nonAutoMargin.top;
        }
        const clearY = floatContext.clearedThreshold(item.style.clear);
        const rawMinY = committedY + yMarginOffset;
        const minY = clearY === undefined ? rawMinY : Math.max(rawMinY, clearY);
        const floatSlot = item.isInSameBfc
            ? undefined
            : floatContext.findContentSlot(minY, containingBlockInsets, item.style.clear, undefined);
        const hasActiveFloats = floatSlot?.segmentId !== undefined;
        const floatAvoidingX = hasActiveFloats ? floatSlot.x : contentBoxInset.left;
        const floatAvoidingY = hasActiveFloats ? floatSlot.y : minY;
        const floatAvoidingWidth = item.isInSameBfc
            ? innerWidth
            : hasActiveFloats
                ? floatSlot.width
                : innerWidth;
        const stretchWidth = Math.max(0, floatAvoidingWidth - rectHorizontalAxisSum(nonAutoMargin));
        const knownDimensions = item.isTable
            ? Size.none()
            : maybeClampOptionalSize(new Size(item.size.width ?? stretchWidth, item.size.height), item.minSize, item.maxSize);
        const output = tree.computeChildLayout(item.node, new LayoutInput({
            runMode: RunMode.PerformLayout,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions,
            parentSize: new Size(innerWidth, parentHeight),
            availableSpace: new Size(AvailableSpace.definite(stretchWidth), AvailableSpace.minContent()),
            verticalMarginsAreCollapsible: item.isInSameBfc ? Line.true() : Line.false(),
        }), measureFunction);
        const topMarginSet = output.topMargin.collapseWithMargin(nonAutoMargin.top);
        const bottomMarginSet = output.bottomMargin.collapseWithMargin(nonAutoMargin.bottom);
        if (item.isInSameBfc &&
            (!isCollapsingWithFirstMargin || !ownMarginsCollapseWithChildren.start)) {
            yMarginOffset = activeMargin.collapseWithSet(topMarginSet).resolve();
        }
        const freeXSpace = Math.max(0, stretchWidth - output.size.width);
        const autoXMarginCount = Number(item.marginIsAuto.left) + Number(item.marginIsAuto.right);
        const autoXMarginSize = autoXMarginCount > 0 ? freeXSpace / autoXMarginCount : 0;
        const resolvedMargin = new Rect(marginOption.left ?? autoXMarginSize, marginOption.right ?? autoXMarginSize, topMarginSet.resolve(), bottomMarginSet.resolve());
        const inset = item.style.inset.zipSize(new Size(innerWidth, 0), (value: any, context: number | undefined) => value.resolveToOption(context, tree));
        const insetOffset = new Point(containerStyle.direction === Direction.Rtl
            ? inset.right !== undefined
                ? -inset.right
                : (inset.left ?? 0)
            : inset.left !== undefined
                ? inset.left
                : inset.right === undefined
                    ? 0
                    : -inset.right, inset.top ?? -(inset.bottom ?? 0));
        let location = hasActiveFloats
            ? new Point(containerStyle.direction === Direction.Rtl
                ? floatAvoidingX +
                    floatAvoidingWidth -
                    output.size.width -
                    resolvedMargin.right +
                    insetOffset.x
                : floatAvoidingX + resolvedMargin.left + insetOffset.x, floatAvoidingY + insetOffset.y)
            : new Point(containerStyle.direction === Direction.Rtl
                ? outerWidth -
                    contentBoxInset.right -
                    output.size.width -
                    resolvedMargin.right +
                    insetOffset.x
                : contentBoxInset.left + resolvedMargin.left + insetOffset.x, minY + insetOffset.y);
        if (item.isInSameBfc) {
            location = new Point(containerStyle.direction === Direction.Rtl
                ? outerWidth -
                    contentBoxInset.right -
                    output.size.width -
                    resolvedMargin.right +
                    insetOffset.x
                : contentBoxInset.left + resolvedMargin.left + insetOffset.x, Math.max(committedY, clearY ?? 0) + yMarginOffset + insetOffset.y);
        }
        const outerItemWidth = output.size.width + rectHorizontalAxisSum(resolvedMargin);
        if (outerItemWidth < floatAvoidingWidth) {
            const freeXSpaceForAlignment = floatAvoidingWidth - outerItemWidth;
            if (containerStyle.textAlign === TextAlign.LegacyRight ||
                (containerStyle.textAlign === TextAlign.LegacyLeft &&
                    containerStyle.direction === Direction.Rtl)) {
                location.x +=
                    containerStyle.direction === Direction.Rtl
                        ? -freeXSpaceForAlignment
                        : freeXSpaceForAlignment;
            }
            else if (containerStyle.textAlign === TextAlign.LegacyCenter) {
                location.x +=
                    containerStyle.direction === Direction.Rtl
                        ? -freeXSpaceForAlignment / 2
                        : freeXSpaceForAlignment / 2;
            }
        }
        const layout = new Layout({
            order: item.order,
            location,
            size: output.size,
            contentSize: output.contentSize,
            scrollbarSize: new Size(item.style.overflow.y === Overflow.Scroll ? item.style.scrollbarWidth : 0, item.style.overflow.x === Overflow.Scroll ? item.style.scrollbarWidth : 0),
            padding: item.padding,
            border: item.border,
            margin: resolvedMargin,
        });
        tree.setUnroundedLayout(item.node, layout);
        item.staticPosition = item.isInSameBfc
            ? new Point(containerStyle.direction === Direction.Rtl
                ? outerWidth - contentBoxInset.right - output.size.width
                : contentBoxInset.left, Math.max(committedY + activeMargin.resolve(), clearY ?? 0))
            : new Point(contentBoxInset.left, committedY + yMarginOffset);
        item.computedSize = output.size;
        item.canCollapseThrough = output.marginsCanCollapseThrough && item.style.clear === Clear.None;
        contentSize = contentSize.zipMap(computeContentSizeContribution(new Point(location.x - contentBoxInset.left, location.y - contentBoxInset.top), output.size, output.contentSize, item.style.overflow), f32Max);
        if (isCollapsingWithFirstMargin) {
            if (item.canCollapseThrough) {
                firstTopMargin = firstTopMargin
                    .collapseWithSet(topMarginSet)
                    .collapseWithSet(bottomMarginSet);
            }
            else {
                firstTopMargin = firstTopMargin.collapseWithSet(topMarginSet);
                isCollapsingWithFirstMargin = false;
            }
        }
        if (item.canCollapseThrough) {
            activeMargin = activeMargin.collapseWithSet(topMarginSet).collapseWithSet(bottomMarginSet);
            absoluteY = committedY + output.size.height + yMarginOffset;
        }
        else {
            committedY = location.y - insetOffset.y + output.size.height;
            activeMargin = bottomMarginSet;
            absoluteY = committedY + activeMargin.resolve();
        }
        hasPlacedInFlowChild = true;
    }
    const bottomMarginOffset = ownMarginsCollapseWithChildren.end ? 0 : activeMargin.resolve();
    const intrinsicOuterHeight = f32Max(committedY + bottomMarginOffset, floatBottom) + contentBoxInset.bottom;
    return { contentSize, intrinsicOuterHeight, firstTopMargin, lastBottomMargin: activeMargin };
}
function performAbsoluteLayoutOnAbsoluteChildren(tree: TaffyTree, items: BlockItem[], areaSize: Size, areaOffset: Point, direction: DirectionValue, measureFunction: MeasureFunction): Size {
    let contentSize = Size.zero();
    for (const item of items) {
        if (item.position !== Position.Absolute)
            continue;
        const style = item.style;
        const aspectRatio = style.aspectRatio;
        const parentSize = new Size(areaSize.width, areaSize.height);
        const marginOption = style.margin.map((margin: any) => margin.resolveToOption(areaSize.width, tree));
        const marginForSize = marginOption.map((value: number | undefined) => value ?? 0);
        const padding = resolveLengthPercentageRectOrZero(style.padding, areaSize.width, tree);
        const border = resolveLengthPercentageRectOrZero(style.border, areaSize.width, tree);
        const inset = style.inset.zipSize(parentSize, (value: any, context: number | undefined) => value.resolveToOption(context, tree));
        const paddingBorderSum = rectSumAxes(rectAdd(padding, border));
        const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
        const styleSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
        const minSize = maybeMaxOptionalSize(maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment).or(paddingBorderSum.map((value: number) => value)), paddingBorderSum.map((value: number) => value));
        const maxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, tree).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
        let knownDimensions = maybeClampOptionalSize(styleSize, minSize, maxSize);
        if (knownDimensions.width === undefined &&
            inset.left !== undefined &&
            inset.right !== undefined) {
            knownDimensions.width = f32Max(areaSize.width - inset.left - inset.right - marginForSize.left - marginForSize.right, 0);
            knownDimensions = maybeClampOptionalSize(knownDimensions.maybeApplyAspectRatio(aspectRatio), minSize, maxSize);
        }
        if (knownDimensions.height === undefined &&
            inset.top !== undefined &&
            inset.bottom !== undefined) {
            knownDimensions.height = f32Max(areaSize.height - inset.top - inset.bottom - marginForSize.top - marginForSize.bottom, 0);
            knownDimensions = maybeClampOptionalSize(knownDimensions.maybeApplyAspectRatio(aspectRatio), minSize, maxSize);
        }
        const childAvailableSpace = new Size(AvailableSpace.definite(maybeClamp(areaSize.width, minSize.width, maxSize.width) ?? areaSize.width), AvailableSpace.definite(maybeClamp(areaSize.height, minSize.height, maxSize.height) ?? areaSize.height));
        const measuredOutput = tree.computeChildLayout(item.node, new LayoutInput({
            runMode: RunMode.ComputeSize,
            sizingMode: SizingMode.ContentSize,
            axis: RequestedAxis.Both,
            knownDimensions,
            parentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        const size = new Size(maybeClamp(knownDimensions.width ?? measuredOutput.size.width, minSize.width, maxSize.width) ?? measuredOutput.size.width, maybeClamp(knownDimensions.height ?? measuredOutput.size.height, minSize.height, maxSize.height) ?? measuredOutput.size.height);
        const output = tree.computeChildLayout(item.node, new LayoutInput({
            runMode: RunMode.PerformLayout,
            sizingMode: SizingMode.ContentSize,
            axis: RequestedAxis.Both,
            knownDimensions: new Size(size.width, size.height),
            parentSize,
            availableSpace: childAvailableSpace,
            verticalMarginsAreCollapsible: Line.false(),
        }), measureFunction);
        const margin = resolveBlockAbsoluteAutoMargins(marginOption, styleSize, size, areaSize, inset);
        const x = inset.left !== undefined && inset.right !== undefined
            ? areaOffset.x +
                (direction === Direction.Rtl
                    ? areaSize.width - size.width - inset.right - margin.right
                    : inset.left + margin.left)
            : inset.left !== undefined
                ? areaOffset.x + inset.left + margin.left
                : inset.right !== undefined
                    ? areaOffset.x + areaSize.width - inset.right - margin.right - size.width
                    : direction === Direction.Rtl
                        ? item.staticPosition.x - size.width - margin.right
                        : item.staticPosition.x + margin.left;
        const y = inset.top !== undefined
            ? areaOffset.y + inset.top + margin.top
            : inset.bottom !== undefined
                ? areaOffset.y + areaSize.height - inset.bottom - margin.bottom - size.height
                : item.staticPosition.y + margin.top;
        const layout = new Layout({
            order: item.order,
            location: new Point(x, y),
            size,
            contentSize: output.contentSize,
            scrollbarSize: new Size(style.overflow.y === Overflow.Scroll ? style.scrollbarWidth : 0, style.overflow.x === Overflow.Scroll ? style.scrollbarWidth : 0),
            padding,
            border,
            margin,
        });
        tree.setUnroundedLayout(item.node, layout);
        contentSize = contentSize.zipMap(computeContentSizeContribution(new Point(x - areaOffset.x, y - areaOffset.y), size, output.contentSize, style.overflow), f32Max);
    }
    return contentSize;
}
function resolveBlockAbsoluteAutoMargins(margin: Rect, styleSize: Size, finalSize: Size, areaSize: Size, inset: Rect): Rect {
    const nonAutoMargin = new Rect(inset.left !== undefined ? (margin.left ?? 0) : 0, inset.right !== undefined ? (margin.right ?? 0) : 0, inset.top !== undefined ? (margin.top ?? 0) : 0, inset.bottom !== undefined ? (margin.bottom ?? 0) : 0);
    const absoluteAutoMarginSpace = new Point(inset.right !== undefined ? areaSize.width - inset.right - (inset.left ?? 0) : finalSize.width, inset.bottom !== undefined
        ? areaSize.height - inset.bottom - (inset.top ?? 0)
        : finalSize.height);
    const freeSpace = new Size(absoluteAutoMarginSpace.x - finalSize.width - rectHorizontalAxisSum(nonAutoMargin), absoluteAutoMarginSpace.y - finalSize.height - rectVerticalAxisSum(nonAutoMargin));
    const horizontalAutoCount = (margin.left === undefined ? 1 : 0) + (margin.right === undefined ? 1 : 0);
    const verticalAutoCount = (margin.top === undefined ? 1 : 0) + (margin.bottom === undefined ? 1 : 0);
    const horizontalAutoMargin = horizontalAutoCount === 2 &&
        (styleSize.width === undefined || styleSize.width >= freeSpace.width)
        ? 0
        : horizontalAutoCount > 0
            ? freeSpace.width / horizontalAutoCount
            : 0;
    const verticalAutoMargin = verticalAutoCount === 2 &&
        (styleSize.height === undefined || styleSize.height >= freeSpace.height)
        ? 0
        : verticalAutoCount > 0
            ? freeSpace.height / verticalAutoCount
            : 0;
    return new Rect(margin.left ?? horizontalAutoMargin, margin.right ?? horizontalAutoMargin, margin.top ?? verticalAutoMargin, margin.bottom ?? verticalAutoMargin);
}
