import { Rect, Size } from "../geometry.js";
import { parseLengthPercentageToken } from "../util/parse.js";

export enum CompactLengthTag {
    Calc = 0,
    Length = 1,
    Percent = 2,
    Auto = 3,
    Fr = 4,
    MinContent = 7,
    MaxContent = 15,
    FitContentPx = 23,
    FitContentPercent = 31,
}

export type CalcResolver =
    | ((value: unknown, basis: number) => number)
    | {
        resolveCalcValue?: (value: unknown, basis: number) => number;
        resolve_calc_value?: (value: unknown, basis: number) => number;
    };

export class CompactLength {
    tagValue: CompactLengthTag;
    numericValue: number;
    opaqueValue: unknown;
    static CALC_TAG = CompactLengthTag.Calc;
    static LENGTH_TAG = CompactLengthTag.Length;
    static PERCENT_TAG = CompactLengthTag.Percent;
    static AUTO_TAG = CompactLengthTag.Auto;
    static FR_TAG = CompactLengthTag.Fr;
    static MIN_CONTENT_TAG = CompactLengthTag.MinContent;
    static MAX_CONTENT_TAG = CompactLengthTag.MaxContent;
    static FIT_CONTENT_PX_TAG = CompactLengthTag.FitContentPx;
    static FIT_CONTENT_PERCENT_TAG = CompactLengthTag.FitContentPercent;
    constructor(tagValue: CompactLengthTag, numericValue: number = 0, opaqueValue?: unknown) {
        this.tagValue = tagValue;
        this.numericValue = numericValue;
        this.opaqueValue = opaqueValue;
    }
    static get ZERO() {
        return CompactLength.length(0);
    }
    static get AUTO() {
        return CompactLength.auto();
    }
    static get MIN_CONTENT() {
        return CompactLength.minContent();
    }
    static get MAX_CONTENT() {
        return CompactLength.maxContent();
    }
    static length(value: number) {
        return new CompactLength(CompactLengthTag.Length, value);
    }
    static fromLength(value: number) {
        return CompactLength.length(value);
    }
    static from_length(value: number) {
        return CompactLength.fromLength(value);
    }
    static percent(value: number) {
        return new CompactLength(CompactLengthTag.Percent, value);
    }
    static fromPercent(value: number) {
        return CompactLength.percent(value);
    }
    static from_percent(value: number) {
        return CompactLength.fromPercent(value);
    }
    static calc(value: unknown) {
        if (value === null || value === undefined) {
            throw new TypeError("CompactLength.calc requires a non-null opaque value");
        }
        return new CompactLength(CompactLengthTag.Calc, 0, value);
    }
    static auto() {
        return new CompactLength(CompactLengthTag.Auto);
    }
    static fr(value: number) {
        return new CompactLength(CompactLengthTag.Fr, value);
    }
    static fromFr(value: number) {
        return CompactLength.fr(value);
    }
    static from_fr(value: number) {
        return CompactLength.fromFr(value);
    }
    static minContent() {
        return new CompactLength(CompactLengthTag.MinContent);
    }
    static min_content() {
        return CompactLength.minContent();
    }
    static maxContent() {
        return new CompactLength(CompactLengthTag.MaxContent);
    }
    static max_content() {
        return CompactLength.maxContent();
    }
    static fitContentPx(value: number) {
        return new CompactLength(CompactLengthTag.FitContentPx, value);
    }
    static fit_content_px(value: number) {
        return CompactLength.fitContentPx(value);
    }
    static fitContentPercent(value: number) {
        return new CompactLength(CompactLengthTag.FitContentPercent, value);
    }
    static fit_content_percent(value: number) {
        return CompactLength.fitContentPercent(value);
    }
    static fitContent(argument: LengthPercentage) {
        const raw = argument.intoRaw();
        if (raw.tag() === CompactLengthTag.Length)
            return CompactLength.fitContentPx(raw.value());
        if (raw.tag() === CompactLengthTag.Percent)
            return CompactLength.fitContentPercent(raw.value());
        throw new TypeError("fit-content requires a length or percent value");
    }
    static fit_content(argument: LengthPercentage) {
        return CompactLength.fitContent(argument);
    }
    tag() {
        return this.tagValue;
    }
    value() {
        return this.numericValue;
    }
    calcValue() {
        return this.opaqueValue;
    }
    calc_value() {
        return this.calcValue();
    }
    isCalc() {
        return this.tagValue === CompactLengthTag.Calc;
    }
    is_calc() {
        return this.isCalc();
    }
    isZero() {
        return this.tagValue === CompactLengthTag.Length && Object.is(this.numericValue, 0);
    }
    is_zero() {
        return this.isZero();
    }
    isLengthOrPercentage() {
        return this.tagValue === CompactLengthTag.Length || this.tagValue === CompactLengthTag.Percent;
    }
    is_length_or_percentage() {
        return this.isLengthOrPercentage();
    }
    isAuto() {
        return this.tagValue === CompactLengthTag.Auto;
    }
    is_auto() {
        return this.isAuto();
    }
    isMinContent() {
        return this.tagValue === CompactLengthTag.MinContent;
    }
    is_min_content() {
        return this.isMinContent();
    }
    isMaxContent() {
        return this.tagValue === CompactLengthTag.MaxContent;
    }
    is_max_content() {
        return this.isMaxContent();
    }
    isFitContent() {
        return (this.tagValue === CompactLengthTag.FitContentPx ||
            this.tagValue === CompactLengthTag.FitContentPercent);
    }
    is_fit_content() {
        return this.isFitContent();
    }
    isMaxOrFitContent() {
        return this.isMaxContent() || this.isFitContent();
    }
    is_max_or_fit_content() {
        return this.isMaxOrFitContent();
    }
    isMaxContentAlike() {
        return this.isAuto() || this.isMaxOrFitContent();
    }
    is_max_content_alike() {
        return this.isMaxContentAlike();
    }
    isMinOrMaxContent() {
        return this.isMinContent() || this.isMaxContent();
    }
    is_min_or_max_content() {
        return this.isMinOrMaxContent();
    }
    isIntrinsic() {
        return this.isAuto() || this.isMinContent() || this.isMaxContent() || this.isFitContent();
    }
    is_intrinsic() {
        return this.isIntrinsic();
    }
    isFr() {
        return this.tagValue === CompactLengthTag.Fr;
    }
    is_fr() {
        return this.isFr();
    }
    usesPercentage() {
        return (this.tagValue === CompactLengthTag.Percent ||
            this.tagValue === CompactLengthTag.FitContentPercent ||
            this.tagValue === CompactLengthTag.Calc);
    }
    uses_percentage() {
        return this.usesPercentage();
    }
    resolvedPercentageSize(parentSize: number, calcResolver?: CalcResolver) {
        if (this.tagValue === CompactLengthTag.Percent)
            return this.numericValue * parentSize;
        if (this.tagValue === CompactLengthTag.Calc)
            return resolveCalcValue(calcResolver, this.opaqueValue, parentSize);
        return undefined;
    }
    resolved_percentage_size(parentSize: number, calcResolver?: CalcResolver) {
        return this.resolvedPercentageSize(parentSize, calcResolver);
    }
}
export class LengthPercentage {
    raw: CompactLength;
    constructor(raw: CompactLength) {
        this.raw = raw;
        if (!(raw.isLengthOrPercentage() || raw.isCalc())) {
            throw new TypeError("LengthPercentage can only contain length, percent, or calc values");
        }
    }
    static get ZERO() {
        return LengthPercentage.zero();
    }
    static length(value: number) {
        return new LengthPercentage(CompactLength.length(value));
    }
    static fromLength(value: number) {
        return LengthPercentage.length(value);
    }
    static from_length(value: number) {
        return LengthPercentage.fromLength(value);
    }
    static percent(value: number) {
        return new LengthPercentage(CompactLength.percent(value));
    }
    static fromPercent(value: number) {
        return LengthPercentage.percent(value);
    }
    static from_percent(value: number) {
        return LengthPercentage.fromPercent(value);
    }
    static calc(value: unknown) {
        return new LengthPercentage(CompactLength.calc(value));
    }
    static fromString(input: string) {
        return lengthPercentageFromString(input);
    }
    static from_string(input: string) {
        return LengthPercentage.fromString(input);
    }
    static zero() {
        return LengthPercentage.length(0);
    }
    static fromRaw(value: CompactLength) {
        return new LengthPercentage(value);
    }
    static from_raw(value: CompactLength) {
        return LengthPercentage.fromRaw(value);
    }
    intoRaw() {
        return this.raw;
    }
    into_raw() {
        return this.intoRaw();
    }
    maybeResolve(context: number | undefined, calcResolver?: CalcResolver) {
        return maybeResolveLengthPercentage(this, context, calcResolver);
    }
    maybe_resolve(context: number | undefined, calcResolver?: CalcResolver) {
        return this.maybeResolve(context, calcResolver);
    }
    resolveOrZero(context: number | undefined, calcResolver?: CalcResolver) {
        return resolveLengthPercentageOrZero(this, context, calcResolver);
    }
    resolve_or_zero(context: number | undefined, calcResolver?: CalcResolver) {
        return this.resolveOrZero(context, calcResolver);
    }
}
export class LengthPercentageAuto {
    raw: CompactLength;
    constructor(raw: CompactLength) {
        this.raw = raw;
        if (!(raw.isLengthOrPercentage() || raw.isAuto() || raw.isCalc())) {
            throw new TypeError("LengthPercentageAuto can only contain length, percent, auto, or calc values");
        }
    }
    static get ZERO() {
        return LengthPercentageAuto.zero();
    }
    static get AUTO() {
        return LengthPercentageAuto.auto();
    }
    static length(value: number) {
        return new LengthPercentageAuto(CompactLength.length(value));
    }
    static fromLength(value: number) {
        return LengthPercentageAuto.length(value);
    }
    static from_length(value: number) {
        return LengthPercentageAuto.fromLength(value);
    }
    static percent(value: number) {
        return new LengthPercentageAuto(CompactLength.percent(value));
    }
    static fromPercent(value: number) {
        return LengthPercentageAuto.percent(value);
    }
    static from_percent(value: number) {
        return LengthPercentageAuto.fromPercent(value);
    }
    static calc(value: unknown) {
        return new LengthPercentageAuto(CompactLength.calc(value));
    }
    static fromString(input: string) {
        return lengthPercentageAutoFromString(input);
    }
    static from_string(input: string) {
        return LengthPercentageAuto.fromString(input);
    }
    static auto() {
        return new LengthPercentageAuto(CompactLength.auto());
    }
    static fromLengthPercentage(value: LengthPercentage) {
        return new LengthPercentageAuto(value.intoRaw());
    }
    static from_length_percentage(value: LengthPercentage) {
        return LengthPercentageAuto.fromLengthPercentage(value);
    }
    static zero() {
        return LengthPercentageAuto.length(0);
    }
    static fromRaw(value: CompactLength) {
        return new LengthPercentageAuto(value);
    }
    static from_raw(value: CompactLength) {
        return LengthPercentageAuto.fromRaw(value);
    }
    intoRaw() {
        return this.raw;
    }
    into_raw() {
        return this.intoRaw();
    }
    isAuto() {
        return this.raw.isAuto();
    }
    is_auto() {
        return this.isAuto();
    }
    resolveToOption(context: number | undefined, calcResolver?: CalcResolver) {
        return maybeResolveCompactLength(this.raw, context, calcResolver);
    }
    resolve_to_option(context: number | undefined, calcResolver?: CalcResolver) {
        return this.resolveToOption(context, calcResolver);
    }
    maybeResolve(context: number | undefined, calcResolver?: CalcResolver) {
        return maybeResolveLengthPercentageAuto(this, context, calcResolver);
    }
    maybe_resolve(context: number | undefined, calcResolver?: CalcResolver) {
        return this.maybeResolve(context, calcResolver);
    }
    resolveOrZero(context: number | undefined, calcResolver?: CalcResolver) {
        return resolveLengthPercentageAutoOrZero(this, context, calcResolver);
    }
    resolve_or_zero(context: number | undefined, calcResolver?: CalcResolver) {
        return this.resolveOrZero(context, calcResolver);
    }
}
export class Dimension {
    raw: CompactLength;
    constructor(raw: CompactLength) {
        this.raw = raw;
        if (!(raw.isLengthOrPercentage() || raw.isAuto() || raw.isCalc())) {
            throw new TypeError("Dimension can only contain length, percent, auto, or calc values");
        }
    }
    static get ZERO() {
        return Dimension.zero();
    }
    static get AUTO() {
        return Dimension.auto();
    }
    static length(value: number) {
        return new Dimension(CompactLength.length(value));
    }
    static fromLength(value: number) {
        return Dimension.length(value);
    }
    static from_length(value: number) {
        return Dimension.fromLength(value);
    }
    static percent(value: number) {
        return new Dimension(CompactLength.percent(value));
    }
    static fromPercent(value: number) {
        return Dimension.percent(value);
    }
    static from_percent(value: number) {
        return Dimension.fromPercent(value);
    }
    static calc(value: unknown) {
        return new Dimension(CompactLength.calc(value));
    }
    static fromString(input: string) {
        return dimensionFromString(input);
    }
    static from_string(input: string) {
        return Dimension.fromString(input);
    }
    static auto() {
        return new Dimension(CompactLength.auto());
    }
    static zero() {
        return Dimension.length(0);
    }
    static fromLengthPercentage(value: LengthPercentage) {
        return new Dimension(value.intoRaw());
    }
    static from_length_percentage(value: LengthPercentage) {
        return Dimension.fromLengthPercentage(value);
    }
    static fromLengthPercentageAuto(value: LengthPercentageAuto) {
        return new Dimension(value.intoRaw());
    }
    static from_length_percentage_auto(value: LengthPercentageAuto) {
        return Dimension.fromLengthPercentageAuto(value);
    }
    static fromRaw(value: CompactLength) {
        return new Dimension(value);
    }
    static from_raw(value: CompactLength) {
        return Dimension.fromRaw(value);
    }
    intoRaw() {
        return this.raw;
    }
    into_raw() {
        return this.intoRaw();
    }
    isAuto() {
        return this.raw.isAuto();
    }
    is_auto() {
        return this.isAuto();
    }
    intoOption() {
        return this.raw.tag() === CompactLengthTag.Length ? this.raw.value() : undefined;
    }
    into_option() {
        return this.intoOption();
    }
    tag() {
        return this.raw.tag();
    }
    value() {
        return this.raw.value();
    }
    maybeResolve(context: number | undefined, calcResolver?: CalcResolver) {
        return maybeResolveDimension(this, context, calcResolver);
    }
    maybe_resolve(context: number | undefined, calcResolver?: CalcResolver) {
        return this.maybeResolve(context, calcResolver);
    }
    resolveOrZero(context: number | undefined, calcResolver?: CalcResolver) {
        return resolveDimensionOrZero(this, context, calcResolver);
    }
    resolve_or_zero(context: number | undefined, calcResolver?: CalcResolver) {
        return this.resolveOrZero(context, calcResolver);
    }
}
export function lengthPercentageFromString(input: string) {
    const parsed = parseLengthPercentageToken(input, "LengthPercentage", false);
    switch (parsed.type) {
        case "Length":
            return LengthPercentage.length(parsed.value);
        case "Percent":
            return LengthPercentage.percent(parsed.value);
        case "Auto":
            throw new Error("unreachable");
    }
}
export function length_percentage_from_string(input: string) {
    return lengthPercentageFromString(input);
}
export function lengthPercentageAutoFromString(input: string) {
    const parsed = parseLengthPercentageToken(input, "LengthPercentageAuto", true);
    switch (parsed.type) {
        case "Length":
            return LengthPercentageAuto.length(parsed.value);
        case "Percent":
            return LengthPercentageAuto.percent(parsed.value);
        case "Auto":
            return LengthPercentageAuto.auto();
    }
}
export function length_percentage_auto_from_string(input: string) {
    return lengthPercentageAutoFromString(input);
}
export function dimensionFromString(input: string) {
    const parsed = parseLengthPercentageToken(input, "Dimension", true);
    switch (parsed.type) {
        case "Length":
            return Dimension.length(parsed.value);
        case "Percent":
            return Dimension.percent(parsed.value);
        case "Auto":
            return Dimension.auto();
    }
}
export function dimension_from_string(input: string) {
    return dimensionFromString(input);
}
export function lengthPercentageRectZero() {
    return new Rect(LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero(), LengthPercentage.zero());
}
export function lengthPercentageAutoRectZero() {
    return new Rect(LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero(), LengthPercentageAuto.zero());
}
export function lengthPercentageAutoRectAuto() {
    return new Rect(LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto(), LengthPercentageAuto.auto());
}
export function dimensionSizeAuto() {
    return new Size(Dimension.auto(), Dimension.auto());
}
export function dimensionSizeFromLengths(width: number, height: number) {
    return new Size(Dimension.length(width), Dimension.length(height));
}
export function dimensionSizeFromPercent(width: number, height: number) {
    return new Size(Dimension.percent(width), Dimension.percent(height));
}
export function dimensionRectFromLengths(left: number, right: number, top: number, bottom: number) {
    return new Rect(Dimension.length(left), Dimension.length(right), Dimension.length(top), Dimension.length(bottom));
}
export function dimensionRectFromPercent(left: number, right: number, top: number, bottom: number) {
    return new Rect(Dimension.percent(left), Dimension.percent(right), Dimension.percent(top), Dimension.percent(bottom));
}
export function maybeResolveCompactLength(raw: CompactLength, context: number | undefined, calcResolver?: CalcResolver): number | undefined {
    switch (raw.tag()) {
        case CompactLengthTag.Length:
            return raw.value();
        case CompactLengthTag.Percent:
            return context === undefined ? undefined : context * raw.value();
        case CompactLengthTag.Auto:
            return undefined;
        case CompactLengthTag.Calc:
            return context === undefined ? undefined : resolveCalcValue(calcResolver, raw.calcValue(), context);
        default:
            throw new Error(`Cannot resolve compact length tag ${raw.tag()}`);
    }
}
export function maybeResolveDimension(value: Dimension, context: number | undefined, calcResolver?: CalcResolver): number | undefined {
    return maybeResolveCompactLength(value.intoRaw(), context, calcResolver);
}
export function maybeResolveLengthPercentage(value: LengthPercentage, context: number | undefined, calcResolver?: CalcResolver): number | undefined {
    return maybeResolveCompactLength(value.intoRaw(), context, calcResolver);
}
export function maybeResolveLengthPercentageAuto(value: LengthPercentageAuto, context: number | undefined, calcResolver?: CalcResolver): number | undefined {
    return maybeResolveCompactLength(value.intoRaw(), context, calcResolver);
}
export function maybeResolveDimensionSize(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(maybeResolveDimension(size.width, context.width, calcResolver), maybeResolveDimension(size.height, context.height, calcResolver));
}
export function maybeResolveLengthPercentageSize(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(maybeResolveLengthPercentage(size.width, context.width, calcResolver), maybeResolveLengthPercentage(size.height, context.height, calcResolver));
}
export function maybeResolveLengthPercentageAutoSize(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(maybeResolveLengthPercentageAuto(size.width, context.width, calcResolver), maybeResolveLengthPercentageAuto(size.height, context.height, calcResolver));
}
export function resolveDimensionOrZero(value: Dimension, context: number | undefined, calcResolver?: CalcResolver): number {
    return maybeResolveDimension(value, context, calcResolver) ?? 0;
}
export function resolveLengthPercentageOrZero(value: LengthPercentage, context: number | undefined, calcResolver?: CalcResolver): number {
    return maybeResolveLengthPercentage(value, context, calcResolver) ?? 0;
}
export function resolveLengthPercentageAutoOrZero(value: LengthPercentageAuto, context: number | undefined, calcResolver?: CalcResolver): number {
    return maybeResolveLengthPercentageAuto(value, context, calcResolver) ?? 0;
}
export function resolveDimensionSizeOrZero(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(resolveDimensionOrZero(size.width, context.width, calcResolver), resolveDimensionOrZero(size.height, context.height, calcResolver));
}
export function resolveLengthPercentageSizeOrZero(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(resolveLengthPercentageOrZero(size.width, context.width, calcResolver), resolveLengthPercentageOrZero(size.height, context.height, calcResolver));
}
export function resolveLengthPercentageAutoSizeOrZero(size: Size, context: Size, calcResolver?: CalcResolver) {
    return new Size(resolveLengthPercentageAutoOrZero(size.width, context.width, calcResolver), resolveLengthPercentageAutoOrZero(size.height, context.height, calcResolver));
}
export function resolveDimensionRectOrZero(rect: Rect, context: Size | number | undefined, calcResolver?: CalcResolver) {
    const width = context instanceof Size ? context.width : context;
    const height = context instanceof Size ? context.height : context;
    return new Rect(resolveDimensionOrZero(rect.left, width, calcResolver), resolveDimensionOrZero(rect.right, width, calcResolver), resolveDimensionOrZero(rect.top, height, calcResolver), resolveDimensionOrZero(rect.bottom, height, calcResolver));
}
export function resolveLengthPercentageRectOrZero(rect: Rect, context: Size | number | undefined, calcResolver?: CalcResolver) {
    const width = context instanceof Size ? context.width : context;
    const height = context instanceof Size ? context.height : context;
    return new Rect(maybeResolveLengthPercentage(rect.left, width, calcResolver) ?? 0, maybeResolveLengthPercentage(rect.right, width, calcResolver) ?? 0, maybeResolveLengthPercentage(rect.top, height, calcResolver) ?? 0, maybeResolveLengthPercentage(rect.bottom, height, calcResolver) ?? 0);
}
export function resolveLengthPercentageAutoRectOrZero(rect: Rect, context: Size | number | undefined, calcResolver?: CalcResolver) {
    const width = context instanceof Size ? context.width : context;
    const height = context instanceof Size ? context.height : context;
    return new Rect(maybeResolveLengthPercentageAuto(rect.left, width, calcResolver) ?? 0, maybeResolveLengthPercentageAuto(rect.right, width, calcResolver) ?? 0, maybeResolveLengthPercentageAuto(rect.top, height, calcResolver) ?? 0, maybeResolveLengthPercentageAuto(rect.bottom, height, calcResolver) ?? 0);
}

export function resolveCalcValue(calcResolver: CalcResolver | undefined, value: unknown, basis: number): number {
    if (typeof calcResolver === "function")
        return calcResolver(value, basis);
    if (calcResolver?.resolveCalcValue !== undefined)
        return calcResolver.resolveCalcValue.call(calcResolver, value, basis);
    if (calcResolver?.resolve_calc_value !== undefined)
        return calcResolver.resolve_calc_value.call(calcResolver, value, basis);
    return 0;
}
