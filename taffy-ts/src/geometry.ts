import { f32Max, f32Min } from "./util/sys.js";

export enum AbsoluteAxis {
    Horizontal = "Horizontal",
    Vertical = "Vertical",
}

export namespace AbsoluteAxis {
    export function otherAxis(axis: AbsoluteAxis) {
        return absoluteAxisOther(axis);
    }
    export function other_axis(axis: AbsoluteAxis) {
        return otherAxis(axis);
    }
}

export enum AbstractAxis {
    Inline = "Inline",
    Block = "Block",
}

export namespace AbstractAxis {
    export function other(axis: AbstractAxis) {
        return abstractAxisOther(axis);
    }
    export function asAbsNaive(axis: AbstractAxis) {
        return abstractAxisAsAbsoluteNaive(axis);
    }
    export function as_abs_naive(axis: AbstractAxis) {
        return asAbsNaive(axis);
    }
}

export class Rect {
    left: any;
    right: any;
    top: any;
    bottom: any;
    constructor(left: any, right: any, top: any, bottom: any) {
        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
    }
    static get ZERO() {
        return Rect.zero();
    }
    static get MIN_CONTENT() {
        return Rect.minContent();
    }
    static get MAX_CONTENT() {
        return Rect.maxContent();
    }
    static new(start: any, end: any, top: any, bottom: any) {
        return new Rect(start, end, top, bottom);
    }
    static zero(factory: any = undefined) {
        return factory === undefined
            ? new Rect(0, 0, 0, 0)
            : new Rect(factory.ZERO, factory.ZERO, factory.ZERO, factory.ZERO);
    }
    static auto(factory: any = undefined) {
        return new Rect(factory.AUTO, factory.AUTO, factory.AUTO, factory.AUTO);
    }
    static minContent(factory: any = undefined) {
        return factory === undefined
            ? new Rect({ type: "MinContent" }, { type: "MinContent" }, { type: "MinContent" }, { type: "MinContent" })
            : new Rect(factory.MIN_CONTENT, factory.MIN_CONTENT, factory.MIN_CONTENT, factory.MIN_CONTENT);
    }
    static min_content(factory: any = undefined) {
        return factory === undefined ? Rect.minContent() : Rect.minContent(factory);
    }
    static maxContent(factory: any = undefined) {
        return factory === undefined
            ? new Rect({ type: "MaxContent" }, { type: "MaxContent" }, { type: "MaxContent" }, { type: "MaxContent" })
            : new Rect(factory.MAX_CONTENT, factory.MAX_CONTENT, factory.MAX_CONTENT, factory.MAX_CONTENT);
    }
    static max_content(factory: any = undefined) {
        return factory === undefined ? Rect.maxContent() : Rect.maxContent(factory);
    }
    static fitContent(argument: any, factory: any = undefined) {
        return new Rect(factoryFitContent(factory, argument), factoryFitContent(factory, argument), factoryFitContent(factory, argument), factoryFitContent(factory, argument));
    }
    static fit_content(argument: any, factory: any = undefined) {
        return Rect.fitContent(argument, factory);
    }
    static length(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Rect(value, value, value, value)
            : new Rect(factoryFromLength(factory, value), factoryFromLength(factory, value), factoryFromLength(factory, value), factoryFromLength(factory, value));
    }
    static percent(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Rect(value, value, value, value)
            : new Rect(factoryFromPercent(factory, value), factoryFromPercent(factory, value), factoryFromPercent(factory, value), factoryFromPercent(factory, value));
    }
    static fromLength(left: any, right: any, top: any, bottom: any) {
        return new Rect(left, right, top, bottom);
    }
    static from_length(left: any, right: any, top: any, bottom: any) {
        return Rect.fromLength(left, right, top, bottom);
    }
    static from_percent(left: any, right: any, top: any, bottom: any) {
        return new Rect(left, right, top, bottom);
    }
    map(f: (value: any) => any) {
        return new Rect(f(this.left), f(this.right), f(this.top), f(this.bottom));
    }
    zipSize(size: Size, f: (value: any, size: any) => any) {
        return new Rect(f(this.left, size.width), f(this.right, size.width), f(this.top, size.height), f(this.bottom, size.height));
    }
    zip_size(size: Size, f: (value: any, size: any) => any) {
        return this.zipSize(size, f);
    }
    resolveOrZero(context: any, resolver?: unknown) {
        const leftRightContext = context instanceof Size ? context.width : context;
        const topBottomContext = context instanceof Size ? context.height : context;
        return new Rect(valueResolveOrZero(this.left, leftRightContext, resolver), valueResolveOrZero(this.right, leftRightContext, resolver), valueResolveOrZero(this.top, topBottomContext, resolver), valueResolveOrZero(this.bottom, topBottomContext, resolver));
    }
    resolve_or_zero(context: any, resolver?: unknown) {
        return this.resolveOrZero(context, resolver);
    }
    horizontalComponents() {
        return new Line(this.left, this.right);
    }
    horizontal_components() {
        return this.horizontalComponents();
    }
    verticalComponents() {
        return new Line(this.top, this.bottom);
    }
    vertical_components() {
        return this.verticalComponents();
    }
    gridAxisSum(axis: AbsoluteAxis) {
        return axis === AbsoluteAxis.Horizontal ? this.left + this.right : this.top + this.bottom;
    }
    grid_axis_sum(axis: AbsoluteAxis) {
        return this.gridAxisSum(axis);
    }
    horizontalAxisSum() {
        return this.left + this.right;
    }
    horizontal_axis_sum() {
        return this.horizontalAxisSum();
    }
    verticalAxisSum() {
        return this.top + this.bottom;
    }
    vertical_axis_sum() {
        return this.verticalAxisSum();
    }
    sumAxes() {
        return new Size(this.horizontalAxisSum(), this.verticalAxisSum());
    }
    sum_axes() {
        return this.sumAxes();
    }
    mainAxisSum(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.horizontalAxisSum() : this.verticalAxisSum();
    }
    main_axis_sum(direction: any) {
        return this.mainAxisSum(direction);
    }
    crossAxisSum(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.verticalAxisSum() : this.horizontalAxisSum();
    }
    cross_axis_sum(direction: any) {
        return this.crossAxisSum(direction);
    }
    mainStart(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.left : this.top;
    }
    main_start(direction: any) {
        return this.mainStart(direction);
    }
    mainEnd(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.right : this.bottom;
    }
    main_end(direction: any) {
        return this.mainEnd(direction);
    }
    crossStart(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.top : this.left;
    }
    cross_start(direction: any) {
        return this.crossStart(direction);
    }
    crossEnd(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.bottom : this.right;
    }
    cross_end(direction: any) {
        return this.crossEnd(direction);
    }
}
export class Line {
    start: any;
    end: any;
    constructor(start: any, end: any) {
        this.start = start;
        this.end = end;
    }
    static get ZERO() {
        return Line.zero();
    }
    static get TRUE() {
        return Line.true();
    }
    static get FALSE() {
        return Line.false();
    }
    static get MIN_CONTENT() {
        return Line.minContent();
    }
    static get MAX_CONTENT() {
        return Line.maxContent();
    }
    static true() {
        return new Line(true, true);
    }
    static false() {
        return new Line(false, false);
    }
    static zero(factory: any = undefined) {
        return factory === undefined ? new Line(0, 0) : new Line(factory.ZERO, factory.ZERO);
    }
    static auto(factory: any = undefined) {
        return new Line(factory.AUTO, factory.AUTO);
    }
    static minContent(factory: any = undefined) {
        return factory === undefined
            ? new Line({ type: "MinContent" }, { type: "MinContent" })
            : new Line(factory.MIN_CONTENT, factory.MIN_CONTENT);
    }
    static min_content(factory: any = undefined) {
        return factory === undefined ? Line.minContent() : Line.minContent(factory);
    }
    static maxContent(factory: any = undefined) {
        return factory === undefined
            ? new Line({ type: "MaxContent" }, { type: "MaxContent" })
            : new Line(factory.MAX_CONTENT, factory.MAX_CONTENT);
    }
    static max_content(factory: any = undefined) {
        return factory === undefined ? Line.maxContent() : Line.maxContent(factory);
    }
    static fitContent(argument: any, factory: any = undefined) {
        return new Line(factoryFitContent(factory, argument), factoryFitContent(factory, argument));
    }
    static fit_content(argument: any, factory: any = undefined) {
        return Line.fitContent(argument, factory);
    }
    static length(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Line(value, value)
            : new Line(factoryFromLength(factory, value), factoryFromLength(factory, value));
    }
    static percent(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Line(value, value)
            : new Line(factoryFromPercent(factory, value), factoryFromPercent(factory, value));
    }
    map(f: (value: any) => any) {
        return new Line(f(this.start), f(this.end));
    }
    sum() {
        return this.start + this.end;
    }
}
export class Size {
    width: any;
    height: any;
    constructor(width: any, height: any) {
        this.width = width;
        this.height = height;
    }
    static get ZERO() {
        return Size.zero();
    }
    static get NONE() {
        return Size.none();
    }
    static get MIN_CONTENT() {
        return Size.minContent();
    }
    static get MAX_CONTENT() {
        return Size.maxContent();
    }
    static zero(factory: any = undefined) {
        return factory === undefined ? new Size(0, 0) : new Size(factory.ZERO, factory.ZERO);
    }
    static none() {
        return new Size(undefined, undefined);
    }
    static auto(factory: any = undefined) {
        return new Size(factory.AUTO, factory.AUTO);
    }
    static minContent(factory: any = undefined) {
        return factory === undefined
            ? new Size({ type: "MinContent" }, { type: "MinContent" })
            : new Size(factory.MIN_CONTENT, factory.MIN_CONTENT);
    }
    static min_content(factory: any = undefined) {
        return factory === undefined ? Size.minContent() : Size.minContent(factory);
    }
    static maxContent(factory: any = undefined) {
        return factory === undefined
            ? new Size({ type: "MaxContent" }, { type: "MaxContent" })
            : new Size(factory.MAX_CONTENT, factory.MAX_CONTENT);
    }
    static max_content(factory: any = undefined) {
        return factory === undefined ? Size.maxContent() : Size.maxContent(factory);
    }
    static fitContent(argument: any, factory: any = undefined) {
        return new Size(factoryFitContent(factory, argument), factoryFitContent(factory, argument));
    }
    static fit_content(argument: any, factory: any = undefined) {
        return Size.fitContent(argument, factory);
    }
    static new(width: any, height: any) {
        return Size.some(width, height);
    }
    static some(width: any, height: any) {
        return new Size(width, height);
    }
    static fromCross(direction: any, value: any) {
        return flexDirectionIsRowValue(direction)
            ? new Size(undefined, value)
            : new Size(value, undefined);
    }
    static from_cross(direction: any, value: any) {
        return Size.fromCross(direction, value);
    }
    static fromLengths(width: any, height: any, factory: any = undefined) {
        return factory === undefined
            ? new Size(width, height)
            : new Size(factoryFromLength(factory, width), factoryFromLength(factory, height));
    }
    static from_lengths(width: any, height: any, factory: any = undefined) {
        return factory === undefined
            ? Size.fromLengths(width, height)
            : Size.fromLengths(width, height, factory);
    }
    static fromPercent(width: any, height: any, factory: any = undefined) {
        return factory === undefined
            ? new Size(width, height)
            : new Size(factoryFromPercent(factory, width), factoryFromPercent(factory, height));
    }
    static from_percent(width: any, height: any, factory: any = undefined) {
        return factory === undefined
            ? Size.fromPercent(width, height)
            : Size.fromPercent(width, height, factory);
    }
    static length(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Size(value, value)
            : new Size(factoryFromLength(factory, value), factoryFromLength(factory, value));
    }
    static percent(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Size(value, value)
            : new Size(factoryFromPercent(factory, value), factoryFromPercent(factory, value));
    }
    map(f: (value: any) => any) {
        return new Size(f(this.width), f(this.height));
    }
    mapWidth(f: (value: any) => any) {
        return new Size(f(this.width), this.height);
    }
    map_width(f: (value: any) => any) {
        return this.mapWidth(f);
    }
    mapHeight(f: (value: any) => any) {
        return new Size(this.width, f(this.height));
    }
    map_height(f: (value: any) => any) {
        return this.mapHeight(f);
    }
    zipMap(other: Size, f: (left: any, right: any) => any) {
        return new Size(f(this.width, other.width), f(this.height, other.height));
    }
    zip_map(other: Size, f: (left: any, right: any) => any) {
        return this.zipMap(other, f);
    }
    setMain(direction: any, value: any) {
        if (flexDirectionIsRowValue(direction)) {
            this.width = value;
        }
        else {
            this.height = value;
        }
    }
    set_main(direction: any, value: any) {
        this.setMain(direction, value);
    }
    setCross(direction: any, value: any) {
        if (flexDirectionIsRowValue(direction)) {
            this.height = value;
        }
        else {
            this.width = value;
        }
    }
    set_cross(direction: any, value: any) {
        this.setCross(direction, value);
    }
    withMain(direction: any, value: any) {
        const size = new Size(this.width, this.height);
        size.setMain(direction, value);
        return size;
    }
    with_main(direction: any, value: any) {
        return this.withMain(direction, value);
    }
    withCross(direction: any, value: any) {
        const size = new Size(this.width, this.height);
        size.setCross(direction, value);
        return size;
    }
    with_cross(direction: any, value: any) {
        return this.withCross(direction, value);
    }
    mapMain(direction: any, mapper: (value: any) => any) {
        return flexDirectionIsRowValue(direction)
            ? new Size(mapper(this.width), this.height)
            : new Size(this.width, mapper(this.height));
    }
    map_main(direction: any, mapper: (value: any) => any) {
        return this.mapMain(direction, mapper);
    }
    mapCross(direction: any, mapper: (value: any) => any) {
        return flexDirectionIsRowValue(direction)
            ? new Size(this.width, mapper(this.height))
            : new Size(mapper(this.width), this.height);
    }
    map_cross(direction: any, mapper: (value: any) => any) {
        return this.mapCross(direction, mapper);
    }
    main(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.width : this.height;
    }
    cross(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.height : this.width;
    }
    getAbs(axis: AbsoluteAxis) {
        return axis === AbsoluteAxis.Horizontal ? this.width : this.height;
    }
    get_abs(axis: AbsoluteAxis) {
        return this.getAbs(axis);
    }
    get(axis: AbstractAxis) {
        return axis === AbstractAxis.Inline ? this.width : this.height;
    }
    set(axis: AbstractAxis, value: any) {
        if (axis === AbstractAxis.Inline) {
            this.width = value;
        }
        else {
            this.height = value;
        }
    }
    unwrapOr(fallback: Size) {
        return new Size(this.width ?? fallback.width, this.height ?? fallback.height);
    }
    unwrap_or(fallback: Size) {
        return this.unwrapOr(fallback);
    }
    or(fallback: Size) {
        return new Size(this.width ?? fallback.width, this.height ?? fallback.height);
    }
    bothAxisDefined() {
        return this.width !== undefined && this.height !== undefined;
    }
    both_axis_defined() {
        return this.bothAxisDefined();
    }
    f32Max(rhs: Size) {
        return new Size(f32Max(this.width, rhs.width), f32Max(this.height, rhs.height));
    }
    f32_max(rhs: Size) {
        return this.f32Max(rhs);
    }
    f32Min(rhs: Size) {
        return new Size(f32Min(this.width, rhs.width), f32Min(this.height, rhs.height));
    }
    f32_min(rhs: Size) {
        return this.f32Min(rhs);
    }
    hasNonZeroArea() {
        return this.width > 0 && this.height > 0;
    }
    has_non_zero_area() {
        return this.hasNonZeroArea();
    }
    maybeApplyAspectRatio(aspectRatio: number | undefined) {
        if (aspectRatio === undefined)
            return this;
        if (this.width !== undefined && this.height === undefined) {
            return new Size(this.width, this.width / aspectRatio);
        }
        if (this.width === undefined && this.height !== undefined) {
            return new Size(this.height * aspectRatio, this.height);
        }
        return this;
    }
    maybe_apply_aspect_ratio(aspectRatio: number | undefined) {
        return this.maybeApplyAspectRatio(aspectRatio);
    }
    maybeResolve(context: Size, resolver?: unknown) {
        return new Size(valueMaybeResolve(this.width, context.width, resolver), valueMaybeResolve(this.height, context.height, resolver));
    }
    maybe_resolve(context: Size, resolver?: unknown) {
        return this.maybeResolve(context, resolver);
    }
    resolveOrZero(context: Size, resolver?: unknown) {
        return new Size(valueResolveOrZero(this.width, context.width, resolver), valueResolveOrZero(this.height, context.height, resolver));
    }
    resolve_or_zero(context: Size, resolver?: unknown) {
        return this.resolveOrZero(context, resolver);
    }
    maybeMin(rhs: Size) {
        return new Size(maybeMinValue(this.width, rhs.width), maybeMinValue(this.height, rhs.height));
    }
    maybe_min(rhs: Size) {
        return this.maybeMin(rhs);
    }
    maybeMax(rhs: Size) {
        return new Size(maybeMaxValue(this.width, rhs.width), maybeMaxValue(this.height, rhs.height));
    }
    maybe_max(rhs: Size) {
        return this.maybeMax(rhs);
    }
    maybeClamp(min: Size, max: Size) {
        return new Size(maybeClampValue(this.width, min.width, max.width), maybeClampValue(this.height, min.height, max.height));
    }
    maybe_clamp(min: Size, max: Size) {
        return this.maybeClamp(min, max);
    }
    maybeAdd(rhs: Size) {
        return new Size(maybeAddValue(this.width, rhs.width), maybeAddValue(this.height, rhs.height));
    }
    maybe_add(rhs: Size) {
        return this.maybeAdd(rhs);
    }
    maybeSub(rhs: Size) {
        return new Size(maybeSubValue(this.width, rhs.width), maybeSubValue(this.height, rhs.height));
    }
    maybe_sub(rhs: Size) {
        return this.maybeSub(rhs);
    }
}
export class Point {
    x: any;
    y: any;
    constructor(x: any, y: any) {
        this.x = x;
        this.y = y;
    }
    static get ZERO() {
        return Point.zero();
    }
    static get NONE() {
        return Point.none();
    }
    static get MIN_CONTENT() {
        return Point.minContent();
    }
    static get MAX_CONTENT() {
        return Point.maxContent();
    }
    static zero(factory: any = undefined) {
        return factory === undefined ? new Point(0, 0) : new Point(factory.ZERO, factory.ZERO);
    }
    static none() {
        return new Point(undefined, undefined);
    }
    static auto(factory: any = undefined) {
        return new Point(factory.AUTO, factory.AUTO);
    }
    static minContent(factory: any = undefined) {
        return factory === undefined
            ? new Point({ type: "MinContent" }, { type: "MinContent" })
            : new Point(factory.MIN_CONTENT, factory.MIN_CONTENT);
    }
    static min_content(factory: any = undefined) {
        return factory === undefined ? Point.minContent() : Point.minContent(factory);
    }
    static maxContent(factory: any = undefined) {
        return factory === undefined
            ? new Point({ type: "MaxContent" }, { type: "MaxContent" })
            : new Point(factory.MAX_CONTENT, factory.MAX_CONTENT);
    }
    static max_content(factory: any = undefined) {
        return factory === undefined ? Point.maxContent() : Point.maxContent(factory);
    }
    static fitContent(argument: any, factory: any = undefined) {
        return new Point(factoryFitContent(factory, argument), factoryFitContent(factory, argument));
    }
    static fit_content(argument: any, factory: any = undefined) {
        return Point.fitContent(argument, factory);
    }
    static length(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Point(value, value)
            : new Point(factoryFromLength(factory, value), factoryFromLength(factory, value));
    }
    static percent(value: any, factory: any = undefined) {
        return factory === undefined
            ? new Point(value, value)
            : new Point(factoryFromPercent(factory, value), factoryFromPercent(factory, value));
    }
    map(f: (value: any) => any) {
        return new Point(f(this.x), f(this.y));
    }
    get(axis: AbstractAxis) {
        return axis === AbstractAxis.Inline ? this.x : this.y;
    }
    set(axis: AbstractAxis, value: any) {
        if (axis === AbstractAxis.Inline) {
            this.x = value;
        }
        else {
            this.y = value;
        }
    }
    transpose() {
        return new Point(this.y, this.x);
    }
    main(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.x : this.y;
    }
    cross(direction: any) {
        return flexDirectionIsRowValue(direction) ? this.y : this.x;
    }
    toSize() {
        return new Size(this.x, this.y);
    }
    to_size() {
        return this.toSize();
    }
}
export class MinMax {
    min: any;
    max: any;
    constructor(min: any, max: any) {
        this.min = min;
        this.max = max;
    }
}
export function absoluteAxisOther(axis: AbsoluteAxis) {
    return axis === AbsoluteAxis.Horizontal ? AbsoluteAxis.Vertical : AbsoluteAxis.Horizontal;
}
export function abstractAxisOther(axis: AbstractAxis) {
    return axis === AbstractAxis.Inline ? AbstractAxis.Block : AbstractAxis.Inline;
}
export function abstractAxisAsAbsoluteNaive(axis: AbstractAxis) {
    return axis === AbstractAxis.Inline ? AbsoluteAxis.Horizontal : AbsoluteAxis.Vertical;
}
export function sizeGetAbsolute(size: Size, axis: AbsoluteAxis) {
    return axis === AbsoluteAxis.Horizontal ? size.width : size.height;
}
export function size_get_absolute(size: Size, axis: AbsoluteAxis) {
    return sizeGetAbsolute(size, axis);
}
export function size_get_abs(size: Size, axis: AbsoluteAxis) {
    return sizeGetAbsolute(size, axis);
}
export function rectHorizontalAxisSum(rect: Rect) {
    return rect.left + rect.right;
}
export function rect_horizontal_axis_sum(rect: Rect) {
    return rectHorizontalAxisSum(rect);
}
export function rectVerticalAxisSum(rect: Rect) {
    return rect.top + rect.bottom;
}
export function rect_vertical_axis_sum(rect: Rect) {
    return rectVerticalAxisSum(rect);
}
export function rectSumAxes(rect: Rect) {
    return new Size(rectHorizontalAxisSum(rect), rectVerticalAxisSum(rect));
}
export function rect_sum_axes(rect: Rect) {
    return rectSumAxes(rect);
}
export function rectAdd(left: Rect, right: Rect) {
    return new Rect(left.left + right.left, left.right + right.right, left.top + right.top, left.bottom + right.bottom);
}
export function rect_add(left: Rect, right: Rect) {
    return rectAdd(left, right);
}
export function sizeAdd(left: Size, right: Size) {
    return new Size(left.width + right.width, left.height + right.height);
}
export function size_add(left: Size, right: Size) {
    return sizeAdd(left, right);
}
export function sizeHasNonZeroArea(size: Size) {
    return size.width > 0 && size.height > 0;
}
export function size_has_non_zero_area(size: Size) {
    return sizeHasNonZeroArea(size);
}
function flexDirectionIsRowValue(direction: any) {
    return direction === "Row" || direction === "RowReverse";
}
function factoryFitContent(factory: any, argument: any) {
    return "fitContent" in factory ? factory.fitContent(argument) : factory.fit_content(argument);
}
function factoryFromLength(factory: any, value: any) {
    return "fromLength" in factory ? factory.fromLength(value) : factory.from_length(value);
}
function factoryFromPercent(factory: any, value: any) {
    return "fromPercent" in factory ? factory.fromPercent(value) : factory.from_percent(value);
}
function valueMaybeResolve(value: any, context: any, resolver?: unknown) {
    return "maybeResolve" in value ? value.maybeResolve(context, resolver) : value.maybe_resolve(context, resolver);
}
function valueResolveOrZero(value: any, context: any, resolver?: unknown) {
    return "resolveOrZero" in value ? value.resolveOrZero(context, resolver) : value.resolve_or_zero(context, resolver);
}
function maybeMinValue(left: any, right: any) {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : f32Min(left, right);
}
function maybeMaxValue(left: any, right: any) {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : f32Max(left, right);
}
function maybeClampValue(value: any, min: any, max: any) {
    if (value === undefined)
        return undefined;
    if (min !== undefined && max !== undefined)
        return f32Max(f32Min(value, max), min);
    if (min !== undefined)
        return f32Max(value, min);
    if (max !== undefined)
        return f32Min(value, max);
    return value;
}
function maybeAddValue(left: any, right: any) {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : left + right;
}
function maybeSubValue(left: any, right: any) {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : left - right;
}
