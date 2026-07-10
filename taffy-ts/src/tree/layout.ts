import { AbsoluteAxis, Line, Point, Rect, Size } from "../geometry.js";
import { AvailableSpaceSize } from "../style/available-space.js";
import { f32Max, f32Min } from "../util/sys.js";

export enum RunMode {
    PerformLayout = "PerformLayout",
    ComputeSize = "ComputeSize",
    PerformHiddenLayout = "PerformHiddenLayout",
}

export enum SizingMode {
    ContentSize = "ContentSize",
    InherentSize = "InherentSize",
}

export enum RequestedAxis {
    Horizontal = "Horizontal",
    Vertical = "Vertical",
    Both = "Both",
}

type LayoutInputInit = {
    runMode?: RunMode;
    run_mode?: RunMode;
    sizingMode?: SizingMode;
    sizing_mode?: SizingMode;
    axis?: RequestedAxis;
    knownDimensions?: Size;
    known_dimensions?: Size;
    parentSize?: Size;
    parent_size?: Size;
    availableSpace?: Size;
    available_space?: Size;
    verticalMarginsAreCollapsible?: Line;
    vertical_margins_are_collapsible?: Line;
};

type LayoutOutputInit = {
    size?: Size;
    contentSize?: Size;
    content_size?: Size;
    firstBaselines?: Point;
    first_baselines?: Point;
    topMargin?: CollapsibleMarginSet;
    top_margin?: CollapsibleMarginSet;
    bottomMargin?: CollapsibleMarginSet;
    bottom_margin?: CollapsibleMarginSet;
    marginsCanCollapseThrough?: boolean;
    margins_can_collapse_through?: boolean;
};

type LayoutInit = {
    order?: number;
    location?: Point;
    size?: Size;
    contentSize?: Size;
    content_size?: Size;
    scrollbarSize?: Size;
    scrollbar_size?: Size;
    border?: Rect;
    padding?: Rect;
    margin?: Rect;
};

export function requestedAxisFromAbsoluteAxis(axis: AbsoluteAxis): RequestedAxis {
    return axis === AbsoluteAxis.Horizontal ? RequestedAxis.Horizontal : RequestedAxis.Vertical;
}
export function requestedAxisIntoAbsoluteAxis(axis: RequestedAxis): AbsoluteAxis | undefined {
    switch (axis) {
        case RequestedAxis.Horizontal:
            return AbsoluteAxis.Horizontal;
        case RequestedAxis.Vertical:
            return AbsoluteAxis.Vertical;
        case RequestedAxis.Both:
            return undefined;
    }
}
export class CollapsibleMarginSet {
    positive: number;
    negative: number;
    static get ZERO() {
        return CollapsibleMarginSet.zero();
    }
    static zero() {
        return new CollapsibleMarginSet(0, 0);
    }
    static fromMargin(margin: number): CollapsibleMarginSet {
        return margin >= 0 ? new CollapsibleMarginSet(margin, 0) : new CollapsibleMarginSet(0, margin);
    }
    static from_margin(margin: number): CollapsibleMarginSet {
        return CollapsibleMarginSet.fromMargin(margin);
    }
    constructor(positive: number, negative: number) {
        this.positive = positive;
        this.negative = negative;
    }
    collapseWithMargin(margin: number): CollapsibleMarginSet {
        return margin >= 0
            ? new CollapsibleMarginSet(f32Max(this.positive, margin), this.negative)
            : new CollapsibleMarginSet(this.positive, f32Min(this.negative, margin));
    }
    collapse_with_margin(margin: number): CollapsibleMarginSet {
        return this.collapseWithMargin(margin);
    }
    collapseWithSet(other: CollapsibleMarginSet): CollapsibleMarginSet {
        return new CollapsibleMarginSet(f32Max(this.positive, other.positive), f32Min(this.negative, other.negative));
    }
    collapse_with_set(other: CollapsibleMarginSet): CollapsibleMarginSet {
        return this.collapseWithSet(other);
    }
    resolve(): number {
        return this.positive + this.negative;
    }
}
export class LayoutInput {
    static get HIDDEN() {
        return LayoutInput.hidden();
    }
    static hidden() {
        return new LayoutInput({
            runMode: RunMode.PerformHiddenLayout,
            sizingMode: SizingMode.InherentSize,
            axis: RequestedAxis.Both,
            knownDimensions: Size.none(),
            parentSize: Size.none(),
            availableSpace: AvailableSpaceSize.maxContent(),
            verticalMarginsAreCollapsible: Line.false(),
        });
    }
    runMode: RunMode;
    sizingMode: SizingMode;
    axis: RequestedAxis;
    knownDimensions: Size;
    parentSize: Size;
    availableSpace: Size;
    verticalMarginsAreCollapsible: Line;
    constructor(init: LayoutInputInit) {
        this.runMode = requireInitValue(init.runMode ?? init.run_mode, "runMode");
        this.sizingMode = requireInitValue(init.sizingMode ?? init.sizing_mode, "sizingMode");
        this.axis = requireInitValue(init.axis, "axis");
        this.knownDimensions = requireInitValue(init.knownDimensions ?? init.known_dimensions, "knownDimensions");
        this.parentSize = requireInitValue(init.parentSize ?? init.parent_size, "parentSize");
        this.availableSpace = requireInitValue(init.availableSpace ?? init.available_space, "availableSpace");
        this.verticalMarginsAreCollapsible = requireInitValue(init.verticalMarginsAreCollapsible ?? init.vertical_margins_are_collapsible, "verticalMarginsAreCollapsible");
    }
    get run_mode() {
        return this.runMode;
    }
    set run_mode(value: RunMode) {
        this.runMode = value;
    }
    get sizing_mode() {
        return this.sizingMode;
    }
    set sizing_mode(value: SizingMode) {
        this.sizingMode = value;
    }
    get known_dimensions() {
        return this.knownDimensions;
    }
    set known_dimensions(value: Size) {
        this.knownDimensions = value;
    }
    get parent_size() {
        return this.parentSize;
    }
    set parent_size(value: Size) {
        this.parentSize = value;
    }
    get available_space() {
        return this.availableSpace;
    }
    set available_space(value: Size) {
        this.availableSpace = value;
    }
    get vertical_margins_are_collapsible() {
        return this.verticalMarginsAreCollapsible;
    }
    set vertical_margins_are_collapsible(value: Line) {
        this.verticalMarginsAreCollapsible = value;
    }
}
export class LayoutOutput {
    static get HIDDEN() {
        return LayoutOutput.hidden();
    }
    static get DEFAULT() {
        return LayoutOutput.hidden();
    }
    static hidden() {
        return new LayoutOutput({
            size: Size.zero(),
            contentSize: Size.zero(),
            firstBaselines: Point.none(),
            topMargin: CollapsibleMarginSet.zero(),
            bottomMargin: CollapsibleMarginSet.zero(),
            marginsCanCollapseThrough: false,
        });
    }
    static fromSizesAndBaselines(size: Size, contentSize: Size, firstBaselines: Point): LayoutOutput {
        return new LayoutOutput({
            size,
            contentSize,
            firstBaselines,
            topMargin: CollapsibleMarginSet.zero(),
            bottomMargin: CollapsibleMarginSet.zero(),
            marginsCanCollapseThrough: false,
        });
    }
    static from_sizes_and_baselines(size: Size, contentSize: Size, firstBaselines: Point): LayoutOutput {
        return LayoutOutput.fromSizesAndBaselines(size, contentSize, firstBaselines);
    }
    static fromSizes(size: Size, contentSize: Size): LayoutOutput {
        return LayoutOutput.fromSizesAndBaselines(size, contentSize, Point.none());
    }
    static from_sizes(size: Size, contentSize: Size): LayoutOutput {
        return LayoutOutput.fromSizes(size, contentSize);
    }
    static fromOuterSize(size: Size): LayoutOutput {
        return LayoutOutput.fromSizes(size, Size.zero());
    }
    static from_outer_size(size: Size): LayoutOutput {
        return LayoutOutput.fromOuterSize(size);
    }
    size: Size;
    contentSize: Size;
    firstBaselines: Point;
    topMargin: CollapsibleMarginSet;
    bottomMargin: CollapsibleMarginSet;
    marginsCanCollapseThrough: boolean;
    constructor(init: LayoutOutputInit) {
        this.size = requireInitValue(init.size, "size");
        this.contentSize = requireInitValue(init.contentSize ?? init.content_size, "contentSize");
        this.firstBaselines = requireInitValue(init.firstBaselines ?? init.first_baselines, "firstBaselines");
        this.topMargin = requireInitValue(init.topMargin ?? init.top_margin, "topMargin");
        this.bottomMargin = requireInitValue(init.bottomMargin ?? init.bottom_margin, "bottomMargin");
        this.marginsCanCollapseThrough = requireInitValue(init.marginsCanCollapseThrough ?? init.margins_can_collapse_through, "marginsCanCollapseThrough");
    }
    get content_size() {
        return this.contentSize;
    }
    set content_size(value: Size) {
        this.contentSize = value;
    }
    get first_baselines() {
        return this.firstBaselines;
    }
    set first_baselines(value: Point) {
        this.firstBaselines = value;
    }
    get top_margin() {
        return this.topMargin;
    }
    set top_margin(value: CollapsibleMarginSet) {
        this.topMargin = value;
    }
    get bottom_margin() {
        return this.bottomMargin;
    }
    set bottom_margin(value: CollapsibleMarginSet) {
        this.bottomMargin = value;
    }
    get margins_can_collapse_through() {
        return this.marginsCanCollapseThrough;
    }
    set margins_can_collapse_through(value: boolean) {
        this.marginsCanCollapseThrough = value;
    }
}
export class Layout {
    static get DEFAULT() {
        return Layout.default();
    }
    static default() {
        return Layout.new();
    }
    static new() {
        return Layout.withOrder(0);
    }
    static withOrder(order: number): Layout {
        return new Layout({
            order,
            location: Point.zero(),
            size: Size.zero(),
            contentSize: Size.zero(),
            scrollbarSize: Size.zero(),
            border: Rect.zero(),
            padding: Rect.zero(),
            margin: Rect.zero(),
        });
    }
    static with_order(order: number): Layout {
        return Layout.withOrder(order);
    }
    order: number;
    location: Point;
    size: Size;
    contentSize: Size;
    scrollbarSize: Size;
    border: Rect;
    padding: Rect;
    margin: Rect;
    constructor(init: LayoutInit) {
        this.order = requireInitValue(init.order, "order");
        this.location = requireInitValue(init.location, "location");
        this.size = requireInitValue(init.size, "size");
        this.contentSize = requireInitValue(init.contentSize ?? init.content_size, "contentSize");
        this.scrollbarSize = requireInitValue(init.scrollbarSize ?? init.scrollbar_size, "scrollbarSize");
        this.border = requireInitValue(init.border, "border");
        this.padding = requireInitValue(init.padding, "padding");
        this.margin = requireInitValue(init.margin, "margin");
    }
    get content_size() {
        return this.contentSize;
    }
    set content_size(value: Size) {
        this.contentSize = value;
    }
    get scrollbar_size() {
        return this.scrollbarSize;
    }
    set scrollbar_size(value: Size) {
        this.scrollbarSize = value;
    }
    contentBoxWidth(): number {
        return (this.size.width -
            this.padding.left -
            this.padding.right -
            this.border.left -
            this.border.right);
    }
    content_box_width(): number {
        return this.contentBoxWidth();
    }
    contentBoxHeight(): number {
        return (this.size.height -
            this.padding.top -
            this.padding.bottom -
            this.border.top -
            this.border.bottom);
    }
    content_box_height(): number {
        return this.contentBoxHeight();
    }
    contentBoxSize(): Size {
        return new Size(this.contentBoxWidth(), this.contentBoxHeight());
    }
    content_box_size(): Size {
        return this.contentBoxSize();
    }
    contentBoxX(): number {
        return this.location.x + this.border.left + this.padding.left;
    }
    content_box_x(): number {
        return this.contentBoxX();
    }
    contentBoxY(): number {
        return this.location.y + this.border.top + this.padding.top;
    }
    content_box_y(): number {
        return this.contentBoxY();
    }
    scrollWidth(): number {
        return f32Max(0, this.contentSize.width +
            f32Min(this.scrollbarSize.width, this.size.width) -
            this.size.width +
            this.border.right);
    }
    scroll_width(): number {
        return this.scrollWidth();
    }
    scrollHeight(): number {
        return f32Max(0, this.contentSize.height +
            f32Min(this.scrollbarSize.height, this.size.height) -
            this.size.height +
            this.border.bottom);
    }
    scroll_height(): number {
        return this.scrollHeight();
    }
}
function requireInitValue<T>(value: T | undefined, field: string): T {
    if (value === undefined)
        throw new TypeError(`${field} is required`);
    return value;
}
