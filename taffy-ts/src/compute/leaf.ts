import { Point, Rect, Size, rectAdd, rectHorizontalAxisSum, rectSumAxes, rectVerticalAxisSum, sizeAdd, } from "../geometry.js";
import { AvailableSpace, availableSpaceMapDefiniteValue, availableSpaceMaybeSet, } from "../style/available-space.js";
import { maybeResolveDimensionSize, resolveLengthPercentageAutoRectOrZero, resolveLengthPercentageRectOrZero, type CalcResolver, } from "../style/dimensions.js";
import { BoxSizing, Display, Overflow, overflowIsScrollContainer, Position, Style, } from "../style/style.js";
import { CollapsibleMarginSet, LayoutInput, LayoutOutput, RunMode, SizingMode, } from "../tree/layout.js";
import { availableSpaceMaybeSub, maybeAddOptionalSize, maybeClamp, maybeClampOptionalSize, maybeMaxOptionalSize, } from "../util/math.js";
import { f32Max } from "../util/sys.js";

type LeafMeasureFunction = (knownDimensions: Size, availableSpace: Size) => Size;

export function computeLeafLayout(inputs: LayoutInput, style: Style, measureFunction: LeafMeasureFunction, calcResolver?: CalcResolver): LayoutOutput {
    const { knownDimensions, parentSize, sizingMode, runMode } = inputs;
    const margin = resolveLengthPercentageAutoRectOrZero(style.margin, parentSize.width, calcResolver);
    const padding = resolveLengthPercentageRectOrZero(style.padding, parentSize.width, calcResolver);
    const border = resolveLengthPercentageRectOrZero(style.border, parentSize.width, calcResolver);
    const paddingBorder = rectAdd(padding, border);
    const paddingBorderSum = rectSumAxes(paddingBorder);
    const boxSizingAdjustment = style.boxSizing === BoxSizing.ContentBox ? paddingBorderSum : Size.zero();
    const resolvedSizes = sizingMode === SizingMode.ContentSize
        ? {
            nodeSize: knownDimensions,
            nodeMinSize: Size.none(),
            nodeMaxSize: Size.none(),
            aspectRatio: undefined,
        }
        : (() => {
            const aspectRatio = style.aspectRatio;
            const styleSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.size, parentSize, calcResolver).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
            const styleMinSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.minSize, parentSize, calcResolver).maybeApplyAspectRatio(aspectRatio), boxSizingAdjustment);
            const styleMaxSize = maybeAddOptionalSize(maybeResolveDimensionSize(style.maxSize, parentSize, calcResolver), boxSizingAdjustment);
            return {
                nodeSize: knownDimensions.or(styleSize),
                nodeMinSize: styleMinSize,
                nodeMaxSize: styleMaxSize,
                aspectRatio,
            };
        })();
    const { nodeSize, nodeMinSize, nodeMaxSize, aspectRatio } = resolvedSizes;
    const scrollbarGutter = style.overflow
        .transpose()
        .map((overflow: string) => (overflow === Overflow.Scroll ? style.scrollbarWidth : 0));
    const contentBoxInset = rectAdd(paddingBorder, new Rect(0, scrollbarGutter.x, 0, scrollbarGutter.y));
    const hasStylesPreventingBeingCollapsedThrough = style.display !== Display.Block ||
        overflowIsScrollContainer(style.overflow.x) ||
        overflowIsScrollContainer(style.overflow.y) ||
        style.position === Position.Absolute ||
        padding.top > 0 ||
        padding.bottom > 0 ||
        border.top > 0 ||
        border.bottom > 0 ||
        (nodeSize.height !== undefined && nodeSize.height > 0) ||
        (nodeMinSize.height !== undefined && nodeMinSize.height > 0);
    if (runMode === RunMode.ComputeSize &&
        hasStylesPreventingBeingCollapsedThrough &&
        nodeSize.width !== undefined &&
        nodeSize.height !== undefined) {
        const size = maybeMaxOptionalSize(maybeClampOptionalSize(new Size(nodeSize.width, nodeSize.height), nodeMinSize, nodeMaxSize), paddingBorderSum.map((value: number) => value)).unwrapOr(Size.zero());
        return new LayoutOutput({
            size,
            contentSize: Size.zero(),
            firstBaselines: Point.none(),
            topMargin: CollapsibleMarginSet.zero(),
            bottomMargin: CollapsibleMarginSet.zero(),
            marginsCanCollapseThrough: false,
        });
    }
    const knownWidth = knownDimensions.width;
    const knownHeight = knownDimensions.height;
    const availableSpace = new Size(availableSpaceMapDefiniteValue(availableSpaceMaybeSet(availableSpaceMaybeSet(availableSpaceMaybeSub(knownWidth === undefined
        ? inputs.availableSpace.width
        : AvailableSpace.definite(knownWidth), rectHorizontalAxisSum(margin)), knownWidth), nodeSize.width), (size: number) => (maybeClamp(size, nodeMinSize.width, nodeMaxSize.width) ?? size) -
        rectHorizontalAxisSum(contentBoxInset)), availableSpaceMapDefiniteValue(availableSpaceMaybeSet(availableSpaceMaybeSet(availableSpaceMaybeSub(knownHeight === undefined
        ? inputs.availableSpace.height
        : AvailableSpace.definite(knownHeight), rectVerticalAxisSum(margin)), knownHeight), nodeSize.height), (size: number) => (maybeClamp(size, nodeMinSize.height, nodeMaxSize.height) ?? size) -
        rectVerticalAxisSum(contentBoxInset)));
    const measuredSize = measureFunction(runMode === RunMode.ComputeSize ? knownDimensions : Size.none(), availableSpace);
    const preferred = knownDimensions.or(nodeSize);
    const clampedSize = maybeClampOptionalSize(preferred, nodeMinSize, nodeMaxSize).unwrapOr(maybeClampOptionalSize(sizeAdd(measuredSize, rectSumAxes(contentBoxInset)), nodeMinSize, nodeMaxSize).unwrapOr(sizeAdd(measuredSize, rectSumAxes(contentBoxInset))));
    const size = maybeMaxOptionalSize(new Size(clampedSize.width, f32Max(clampedSize.height, aspectRatio === undefined ? 0 : clampedSize.width / aspectRatio)), paddingBorderSum.map((value: number) => value)).unwrapOr(Size.zero());
    return new LayoutOutput({
        size,
        contentSize: sizeAdd(measuredSize, rectSumAxes(padding)),
        firstBaselines: Point.none(),
        topMargin: CollapsibleMarginSet.zero(),
        bottomMargin: CollapsibleMarginSet.zero(),
        marginsCanCollapseThrough: !hasStylesPreventingBeingCollapsedThrough && size.height === 0 && measuredSize.height === 0,
    });
}
export const compute_leaf_layout = computeLeafLayout;
