import { AbstractAxis, AbsoluteAxis, Line, MinMax, Point, Rect, Size } from "../geometry.js";
import { isCssIdent, parseCssIdentifiers, parseError, parseKeywordEnum, parseLengthPercentageToken, } from "../util/parse.js";
import { CompactLength, CompactLengthTag, Dimension, dimensionSizeAuto, LengthPercentage, LengthPercentageAuto, lengthPercentageAutoRectAuto, lengthPercentageAutoRectZero, lengthPercentageRectZero, type CalcResolver, } from "./dimensions.js";
export enum AlignItems {
    Start = "Start",
    End = "End",
    FlexStart = "FlexStart",
    FlexEnd = "FlexEnd",
    Center = "Center",
    Baseline = "Baseline",
    Stretch = "Stretch",
}
export namespace AlignItems {
    export function fromString(input: string): AlignItems {
        return alignItemsFromString(input);
    }
    export function from_string(input: string): AlignItems {
        return fromString(input);
    }
}
export enum AlignContent {
    Start = "Start",
    End = "End",
    FlexStart = "FlexStart",
    FlexEnd = "FlexEnd",
    Center = "Center",
    Stretch = "Stretch",
    SpaceBetween = "SpaceBetween",
    SpaceEvenly = "SpaceEvenly",
    SpaceAround = "SpaceAround",
}
export namespace AlignContent {
    export function reversed(alignment: AlignContent): AlignContent {
        return alignContentReversed(alignment);
    }
    export function fromString(input: string): AlignContent {
        return alignContentFromString(input);
    }
    export function from_string(input: string): AlignContent {
        return fromString(input);
    }
}
export enum Display {
    Block = "Block",
    Flex = "Flex",
    Grid = "Grid",
    None = "None",
}
export namespace Display {
    export const DEFAULT: Display = Display.Flex;
    export function toString(display: Display): string {
        return displayToString(display);
    }
    export function to_string(display: Display): string {
        return toString(display);
    }
    export function fromString(input: string): Display {
        return displayFromString(input);
    }
    export function from_string(input: string): Display {
        return fromString(input);
    }
}
export enum BoxGenerationMode {
    Normal = "Normal",
    None = "None",
}
export namespace BoxGenerationMode {
    export const DEFAULT: BoxGenerationMode = BoxGenerationMode.Normal;
}
export enum Position {
    Relative = "Relative",
    Absolute = "Absolute",
}
export namespace Position {
    export const DEFAULT: Position = Position.Relative;
    export function fromString(input: string): Position {
        return positionFromString(input);
    }
    export function from_string(input: string): Position {
        return fromString(input);
    }
}
export enum BoxSizing {
    BorderBox = "BorderBox",
    ContentBox = "ContentBox",
}
export namespace BoxSizing {
    export const DEFAULT: BoxSizing = BoxSizing.BorderBox;
    export function fromString(input: string): BoxSizing {
        return boxSizingFromString(input);
    }
    export function from_string(input: string): BoxSizing {
        return fromString(input);
    }
}
export enum Overflow {
    Visible = "Visible",
    Clip = "Clip",
    Hidden = "Hidden",
    Scroll = "Scroll",
}
export namespace Overflow {
    export const DEFAULT: Overflow = Overflow.Visible;
    export function fromString(input: string): Overflow {
        return overflowFromString(input);
    }
    export function from_string(input: string): Overflow {
        return fromString(input);
    }
    export function isScrollContainer(overflow: Overflow): boolean {
        return overflowIsScrollContainer(overflow);
    }
    export function is_scroll_container(overflow: Overflow): boolean {
        return isScrollContainer(overflow);
    }
    export function maybeIntoAutomaticMinSize(overflow: Overflow): number | undefined {
        return overflowMaybeIntoAutomaticMinSize(overflow);
    }
    export function maybe_into_automatic_min_size(overflow: Overflow): number | undefined {
        return maybeIntoAutomaticMinSize(overflow);
    }
}
export enum Direction {
    Ltr = "Ltr",
    Rtl = "Rtl",
}
export namespace Direction {
    export const DEFAULT: Direction = Direction.Ltr;
    export function fromString(input: string): Direction {
        return directionFromString(input);
    }
    export function from_string(input: string): Direction {
        return fromString(input);
    }
    export function isRtl(direction: Direction): boolean {
        return directionIsRtl(direction);
    }
    export function is_rtl(direction: Direction): boolean {
        return isRtl(direction);
    }
}
export enum Float {
    Left = "Left",
    Right = "Right",
    None = "None",
}
export namespace Float {
    export const DEFAULT: Float = Float.None;
    export function fromString(input: string): Float {
        return floatFromString(input);
    }
    export function from_string(input: string): Float {
        return fromString(input);
    }
    export function isFloated(value: Float): boolean {
        return floatIsFloated(value);
    }
    export function is_floated(value: Float): boolean {
        return isFloated(value);
    }
    export function floatDirection(value: Float): FloatDirection | undefined {
        return styleFloatDirection(value);
    }
    export function float_direction(value: Float): FloatDirection | undefined {
        return floatDirection(value);
    }
}
export enum FloatDirection {
    Left = "Left",
    Right = "Right",
}
export enum Clear {
    Left = "Left",
    Right = "Right",
    Both = "Both",
    None = "None",
}
export namespace Clear {
    export const DEFAULT: Clear = Clear.None;
    export function fromString(input: string): Clear {
        return clearFromString(input);
    }
    export function from_string(input: string): Clear {
        return fromString(input);
    }
}
export enum TextAlign {
    Auto = "Auto",
    LegacyLeft = "LegacyLeft",
    LegacyRight = "LegacyRight",
    LegacyCenter = "LegacyCenter",
}
export namespace TextAlign {
    export const DEFAULT: TextAlign = TextAlign.Auto;
    export function fromString(input: string): TextAlign {
        return textAlignFromString(input);
    }
    export function from_string(input: string): TextAlign {
        return fromString(input);
    }
}
export enum FlexWrap {
    NoWrap = "NoWrap",
    Wrap = "Wrap",
    WrapReverse = "WrapReverse",
}
export namespace FlexWrap {
    export const DEFAULT: FlexWrap = FlexWrap.NoWrap;
    export function fromString(input: string): FlexWrap {
        return flexWrapFromString(input);
    }
    export function from_string(input: string): FlexWrap {
        return fromString(input);
    }
}
export enum FlexDirection {
    Row = "Row",
    Column = "Column",
    RowReverse = "RowReverse",
    ColumnReverse = "ColumnReverse",
}
export namespace FlexDirection {
    export const DEFAULT: FlexDirection = FlexDirection.Row;
    export function fromString(input: string): FlexDirection {
        return flexDirectionFromString(input);
    }
    export function from_string(input: string): FlexDirection {
        return fromString(input);
    }
    export function isRow(direction: FlexDirection): boolean {
        return flexDirectionIsRow(direction);
    }
    export function is_row(direction: FlexDirection): boolean {
        return isRow(direction);
    }
    export function isColumn(direction: FlexDirection): boolean {
        return flexDirectionIsColumn(direction);
    }
    export function is_column(direction: FlexDirection): boolean {
        return isColumn(direction);
    }
    export function isReverse(direction: FlexDirection): boolean {
        return flexDirectionIsReverse(direction);
    }
    export function is_reverse(direction: FlexDirection): boolean {
        return isReverse(direction);
    }
    export function mainAxis(direction: FlexDirection): AbsoluteAxis {
        return flexDirectionMainAxis(direction);
    }
    export function main_axis(direction: FlexDirection): AbsoluteAxis {
        return mainAxis(direction);
    }
    export function crossAxis(direction: FlexDirection): AbsoluteAxis {
        return flexDirectionCrossAxis(direction);
    }
    export function cross_axis(direction: FlexDirection): AbsoluteAxis {
        return crossAxis(direction);
    }
}
export enum GridAutoFlow {
    Row = "Row",
    Column = "Column",
    RowDense = "RowDense",
    ColumnDense = "ColumnDense",
}
export namespace GridAutoFlow {
    export const DEFAULT: GridAutoFlow = GridAutoFlow.Row;
    export function fromString(input: string): GridAutoFlow {
        return gridAutoFlowFromString(input);
    }
    export function from_string(input: string): GridAutoFlow {
        return fromString(input);
    }
    export function isDense(flow: GridAutoFlow): boolean {
        return gridAutoFlowIsDense(flow);
    }
    export function is_dense(flow: GridAutoFlow): boolean {
        return isDense(flow);
    }
    export function primaryAxis(flow: GridAutoFlow): AbsoluteAxis {
        return gridAutoFlowPrimaryAxis(flow);
    }
    export function primary_axis(flow: GridAutoFlow): AbsoluteAxis {
        return primaryAxis(flow);
    }
}
export class InvalidStringRepetitionValue extends Error {
    constructor() {
        super("&str can only be converted to GridTrackRepetition if it's value is 'auto-fit' or 'auto-fill'");
        this.name = "InvalidStringRepetitionValue";
    }
}
export class GridTemplateArea {
    name: string;
    rowStart: number;
    rowEnd: number;
    columnStart: number;
    columnEnd: number;
    constructor(name: string, rowStart: number, rowEnd: number, columnStart: number, columnEnd: number) {
        this.name = name;
        this.rowStart = rowStart;
        this.rowEnd = rowEnd;
        this.columnStart = columnStart;
        this.columnEnd = columnEnd;
    }
    get row_start() {
        return this.rowStart;
    }
    set row_start(value: number) {
        this.rowStart = value;
    }
    get row_end() {
        return this.rowEnd;
    }
    set row_end(value: number) {
        this.rowEnd = value;
    }
    get column_start() {
        return this.columnStart;
    }
    set column_start(value: number) {
        this.columnStart = value;
    }
    get column_end() {
        return this.columnEnd;
    }
    set column_end(value: number) {
        this.columnEnd = value;
    }
}
export class NamedGridLine {
    name: string;
    index: number;
    constructor(name: string, index: number) {
        this.name = name;
        this.index = index;
    }
}
export class MaxTrackSizingFunction {
    value: CompactLength;
    constructor(value: CompactLength) {
        this.value = value;
    }
    static get ZERO() {
        return MaxTrackSizingFunction.length(0);
    }
    static get AUTO() {
        return MaxTrackSizingFunction.auto();
    }
    static get MIN_CONTENT() {
        return MaxTrackSizingFunction.minContent();
    }
    static get MAX_CONTENT() {
        return MaxTrackSizingFunction.maxContent();
    }
    static length(value: number) {
        return new MaxTrackSizingFunction(CompactLength.length(value));
    }
    static fromLength(value: number) {
        return MaxTrackSizingFunction.length(value);
    }
    static from_length(value: number) {
        return MaxTrackSizingFunction.fromLength(value);
    }
    static percent(value: number) {
        return new MaxTrackSizingFunction(CompactLength.percent(value));
    }
    static fromPercent(value: number) {
        return MaxTrackSizingFunction.percent(value);
    }
    static from_percent(value: number) {
        return MaxTrackSizingFunction.fromPercent(value);
    }
    static calc(value: unknown) {
        return new MaxTrackSizingFunction(CompactLength.calc(value));
    }
    static auto() {
        return new MaxTrackSizingFunction(CompactLength.auto());
    }
    static minContent() {
        return new MaxTrackSizingFunction(CompactLength.minContent());
    }
    static min_content() {
        return MaxTrackSizingFunction.minContent();
    }
    static maxContent() {
        return new MaxTrackSizingFunction(CompactLength.maxContent());
    }
    static max_content() {
        return MaxTrackSizingFunction.maxContent();
    }
    static fitContentPx(limit: number) {
        return new MaxTrackSizingFunction(CompactLength.fitContentPx(limit));
    }
    static fit_content_px(limit: number) {
        return MaxTrackSizingFunction.fitContentPx(limit);
    }
    static fitContentPercent(limit: number) {
        return new MaxTrackSizingFunction(CompactLength.fitContentPercent(limit));
    }
    static fit_content_percent(limit: number) {
        return MaxTrackSizingFunction.fitContentPercent(limit);
    }
    static fitContent(argument: LengthPercentage) {
        return new MaxTrackSizingFunction(CompactLength.fitContent(argument));
    }
    static fit_content(argument: LengthPercentage) {
        return MaxTrackSizingFunction.fitContent(argument);
    }
    static fr(value: number) {
        return new MaxTrackSizingFunction(CompactLength.fr(value));
    }
    static fromFr(value: number) {
        return MaxTrackSizingFunction.fr(value);
    }
    static from_fr(value: number) {
        return MaxTrackSizingFunction.fromFr(value);
    }
    static fromLengthPercentage(input: LengthPercentage) {
        return new MaxTrackSizingFunction(input.intoRaw());
    }
    static from_length_percentage(input: LengthPercentage) {
        return MaxTrackSizingFunction.fromLengthPercentage(input);
    }
    static fromLengthPercentageAuto(input: LengthPercentageAuto) {
        return new MaxTrackSizingFunction(input.intoRaw());
    }
    static from_length_percentage_auto(input: LengthPercentageAuto) {
        return MaxTrackSizingFunction.fromLengthPercentageAuto(input);
    }
    static fromDimension(input: Dimension) {
        return new MaxTrackSizingFunction(input.intoRaw());
    }
    static from_dimension(input: Dimension) {
        return MaxTrackSizingFunction.fromDimension(input);
    }
    static fromMin(input: MinTrackSizingFunction) {
        return new MaxTrackSizingFunction(input.intoRaw());
    }
    static from_min(input: MinTrackSizingFunction) {
        return MaxTrackSizingFunction.fromMin(input);
    }
    static fromRaw(input: CompactLength) {
        return new MaxTrackSizingFunction(input);
    }
    static from_raw(input: CompactLength) {
        return MaxTrackSizingFunction.fromRaw(input);
    }
    static fromString(input: string) {
        return maxTrackSizingFunctionFromString(input);
    }
    static from_string(input: string) {
        return MaxTrackSizingFunction.fromString(input);
    }
    intoRaw() {
        return this.value;
    }
    into_raw() {
        return this.intoRaw();
    }
    isIntrinsic() {
        return this.value.isIntrinsic();
    }
    is_intrinsic() {
        return this.isIntrinsic();
    }
    isMaxContentAlike() {
        return this.value.isMaxContentAlike();
    }
    is_max_content_alike() {
        return this.isMaxContentAlike();
    }
    isFr() {
        return this.value.isFr();
    }
    is_fr() {
        return this.isFr();
    }
    isAuto() {
        return this.value.isAuto();
    }
    is_auto() {
        return this.isAuto();
    }
    isMinContent() {
        return this.value.isMinContent();
    }
    is_min_content() {
        return this.isMinContent();
    }
    isMaxContent() {
        return this.value.isMaxContent();
    }
    is_max_content() {
        return this.isMaxContent();
    }
    isFitContent() {
        return this.value.isFitContent();
    }
    is_fit_content() {
        return this.isFitContent();
    }
    isMaxOrFitContent() {
        return this.value.isMaxOrFitContent();
    }
    is_max_or_fit_content() {
        return this.isMaxOrFitContent();
    }
    hasDefiniteValue(parentSize: number | undefined) {
        return (this.value.tag() === CompactLengthTag.Length ||
            ((this.value.tag() === CompactLengthTag.Percent || this.value.isCalc()) && parentSize !== undefined));
    }
    has_definite_value(parentSize: number | undefined) {
        return this.hasDefiniteValue(parentSize);
    }
    definiteValue(parentSize: number | undefined, calcResolver?: CalcResolver) {
        switch (this.value.tag()) {
            case CompactLengthTag.Length:
                return this.value.value();
            case CompactLengthTag.Percent:
                return parentSize === undefined ? undefined : this.value.value() * parentSize;
            case CompactLengthTag.Calc:
                return parentSize === undefined ? undefined : this.value.resolvedPercentageSize(parentSize, calcResolver);
            default:
                return undefined;
        }
    }
    definite_value(parentSize: number | undefined, calcResolver?: CalcResolver) {
        return this.definiteValue(parentSize, calcResolver);
    }
    definiteLimit(parentSize: number | undefined, calcResolver?: CalcResolver) {
        switch (this.value.tag()) {
            case CompactLengthTag.FitContentPx:
                return this.value.value();
            case CompactLengthTag.FitContentPercent:
                return parentSize === undefined ? undefined : this.value.value() * parentSize;
            default:
                return this.definiteValue(parentSize, calcResolver);
        }
    }
    definite_limit(parentSize: number | undefined, calcResolver?: CalcResolver) {
        return this.definiteLimit(parentSize, calcResolver);
    }
    resolvedPercentageSize(parentSize: number, calcResolver?: CalcResolver) {
        return this.value.resolvedPercentageSize(parentSize, calcResolver);
    }
    resolved_percentage_size(parentSize: number, calcResolver?: CalcResolver) {
        return this.resolvedPercentageSize(parentSize, calcResolver);
    }
    usesPercentage() {
        return this.value.usesPercentage();
    }
    uses_percentage() {
        return this.usesPercentage();
    }
}
export class MinTrackSizingFunction {
    value: CompactLength;
    constructor(value: CompactLength) {
        this.value = value;
    }
    static get ZERO() {
        return MinTrackSizingFunction.length(0);
    }
    static get AUTO() {
        return MinTrackSizingFunction.auto();
    }
    static get MIN_CONTENT() {
        return MinTrackSizingFunction.minContent();
    }
    static get MAX_CONTENT() {
        return MinTrackSizingFunction.maxContent();
    }
    static length(value: number) {
        return new MinTrackSizingFunction(CompactLength.length(value));
    }
    static fromLength(value: number) {
        return MinTrackSizingFunction.length(value);
    }
    static from_length(value: number) {
        return MinTrackSizingFunction.fromLength(value);
    }
    static percent(value: number) {
        return new MinTrackSizingFunction(CompactLength.percent(value));
    }
    static fromPercent(value: number) {
        return MinTrackSizingFunction.percent(value);
    }
    static from_percent(value: number) {
        return MinTrackSizingFunction.fromPercent(value);
    }
    static calc(value: unknown) {
        return new MinTrackSizingFunction(CompactLength.calc(value));
    }
    static auto() {
        return new MinTrackSizingFunction(CompactLength.auto());
    }
    static minContent() {
        return new MinTrackSizingFunction(CompactLength.minContent());
    }
    static min_content() {
        return MinTrackSizingFunction.minContent();
    }
    static maxContent() {
        return new MinTrackSizingFunction(CompactLength.maxContent());
    }
    static max_content() {
        return MinTrackSizingFunction.maxContent();
    }
    static fromMax(input: MaxTrackSizingFunction) {
        if (input.isFr() || input.isFitContent())
            return MinTrackSizingFunction.auto();
        return new MinTrackSizingFunction(input.intoRaw());
    }
    static from_max(input: MaxTrackSizingFunction) {
        return MinTrackSizingFunction.fromMax(input);
    }
    static fromLengthPercentage(input: LengthPercentage) {
        return new MinTrackSizingFunction(input.intoRaw());
    }
    static from_length_percentage(input: LengthPercentage) {
        return MinTrackSizingFunction.fromLengthPercentage(input);
    }
    static fromLengthPercentageAuto(input: LengthPercentageAuto) {
        return new MinTrackSizingFunction(input.intoRaw());
    }
    static from_length_percentage_auto(input: LengthPercentageAuto) {
        return MinTrackSizingFunction.fromLengthPercentageAuto(input);
    }
    static fromDimension(input: Dimension) {
        return new MinTrackSizingFunction(input.intoRaw());
    }
    static from_dimension(input: Dimension) {
        return MinTrackSizingFunction.fromDimension(input);
    }
    static fromRaw(input: CompactLength) {
        return new MinTrackSizingFunction(input);
    }
    static from_raw(input: CompactLength) {
        return MinTrackSizingFunction.fromRaw(input);
    }
    static fromString(input: string) {
        return minTrackSizingFunctionFromString(input);
    }
    static from_string(input: string) {
        return MinTrackSizingFunction.fromString(input);
    }
    intoRaw() {
        return this.value;
    }
    into_raw() {
        return this.intoRaw();
    }
    isIntrinsic() {
        return this.value.isIntrinsic();
    }
    is_intrinsic() {
        return this.isIntrinsic();
    }
    isMinOrMaxContent() {
        return this.value.isMinOrMaxContent();
    }
    is_min_or_max_content() {
        return this.isMinOrMaxContent();
    }
    isFr() {
        return this.value.isFr();
    }
    is_fr() {
        return this.isFr();
    }
    isAuto() {
        return this.value.isAuto();
    }
    is_auto() {
        return this.isAuto();
    }
    isMinContent() {
        return this.value.isMinContent();
    }
    is_min_content() {
        return this.isMinContent();
    }
    isMaxContent() {
        return this.value.isMaxContent();
    }
    is_max_content() {
        return this.isMaxContent();
    }
    definiteValue(parentSize: number | undefined, calcResolver?: CalcResolver) {
        switch (this.value.tag()) {
            case CompactLengthTag.Length:
                return this.value.value();
            case CompactLengthTag.Percent:
                return parentSize === undefined ? undefined : this.value.value() * parentSize;
            case CompactLengthTag.Calc:
                return parentSize === undefined ? undefined : this.value.resolvedPercentageSize(parentSize, calcResolver);
            default:
                return undefined;
        }
    }
    definite_value(parentSize: number | undefined, calcResolver?: CalcResolver) {
        return this.definiteValue(parentSize, calcResolver);
    }
    resolvedPercentageSize(parentSize: number, calcResolver?: CalcResolver) {
        return this.value.resolvedPercentageSize(parentSize, calcResolver);
    }
    resolved_percentage_size(parentSize: number, calcResolver?: CalcResolver) {
        return this.resolvedPercentageSize(parentSize, calcResolver);
    }
    usesPercentage() {
        return this.value.tag() === CompactLengthTag.Percent || this.value.isCalc();
    }
    uses_percentage() {
        return this.usesPercentage();
    }
}
export class TrackSizingFunction extends MinMax {
    declare min: MinTrackSizingFunction;
    declare max: MaxTrackSizingFunction;
    constructor(min: MinTrackSizingFunction, max: MaxTrackSizingFunction) {
        super(min, max);
        this.min = min;
        this.max = max;
    }
    static get ZERO() {
        return TrackSizingFunction.zero();
    }
    static get AUTO() {
        return TrackSizingFunction.auto();
    }
    static get MIN_CONTENT() {
        return TrackSizingFunction.minContent();
    }
    static get MAX_CONTENT() {
        return TrackSizingFunction.maxContent();
    }
    static auto() {
        return new TrackSizingFunction(MinTrackSizingFunction.auto(), MaxTrackSizingFunction.auto());
    }
    static minContent() {
        return new TrackSizingFunction(MinTrackSizingFunction.minContent(), MaxTrackSizingFunction.minContent());
    }
    static min_content() {
        return TrackSizingFunction.minContent();
    }
    static maxContent() {
        return new TrackSizingFunction(MinTrackSizingFunction.maxContent(), MaxTrackSizingFunction.maxContent());
    }
    static max_content() {
        return TrackSizingFunction.maxContent();
    }
    static fitContent(argument: LengthPercentage) {
        return new TrackSizingFunction(MinTrackSizingFunction.auto(), MaxTrackSizingFunction.fitContent(argument));
    }
    static fit_content(argument: LengthPercentage) {
        return TrackSizingFunction.fitContent(argument);
    }
    static zero() {
        return TrackSizingFunction.length(0);
    }
    static length(value: number) {
        return new TrackSizingFunction(MinTrackSizingFunction.length(value), MaxTrackSizingFunction.length(value));
    }
    static fromLength(value: number) {
        return TrackSizingFunction.length(value);
    }
    static from_length(value: number) {
        return TrackSizingFunction.fromLength(value);
    }
    static percent(value: number) {
        return new TrackSizingFunction(MinTrackSizingFunction.percent(value), MaxTrackSizingFunction.percent(value));
    }
    static fromPercent(value: number) {
        return TrackSizingFunction.percent(value);
    }
    static from_percent(value: number) {
        return TrackSizingFunction.fromPercent(value);
    }
    static fr(value: number) {
        return new TrackSizingFunction(MinTrackSizingFunction.auto(), MaxTrackSizingFunction.fr(value));
    }
    static fromFr(value: number) {
        return TrackSizingFunction.fr(value);
    }
    static from_fr(value: number) {
        return TrackSizingFunction.fromFr(value);
    }
    static fromLengthPercentage(input: LengthPercentage) {
        return new TrackSizingFunction(MinTrackSizingFunction.fromLengthPercentage(input), MaxTrackSizingFunction.fromLengthPercentage(input));
    }
    static from_length_percentage(input: LengthPercentage) {
        return TrackSizingFunction.fromLengthPercentage(input);
    }
    static fromLengthPercentageAuto(input: LengthPercentageAuto) {
        return new TrackSizingFunction(MinTrackSizingFunction.fromLengthPercentageAuto(input), MaxTrackSizingFunction.fromLengthPercentageAuto(input));
    }
    static from_length_percentage_auto(input: LengthPercentageAuto) {
        return TrackSizingFunction.fromLengthPercentageAuto(input);
    }
    static fromDimension(input: Dimension) {
        return new TrackSizingFunction(MinTrackSizingFunction.fromDimension(input), MaxTrackSizingFunction.fromDimension(input));
    }
    static from_dimension(input: Dimension) {
        return TrackSizingFunction.fromDimension(input);
    }
    static fromString(input: string) {
        return trackSizingFunctionFromString(input);
    }
    static from_string(input: string) {
        return TrackSizingFunction.fromString(input);
    }
    minSizingFunction() {
        return this.min;
    }
    min_sizing_function() {
        return this.minSizingFunction();
    }
    maxSizingFunction() {
        return this.max;
    }
    max_sizing_function() {
        return this.maxSizingFunction();
    }
    hasFixedComponent() {
        return this.min.value.isLengthOrPercentage() || this.max.value.isLengthOrPercentage();
    }
    has_fixed_component() {
        return this.hasFixedComponent();
    }
}
export class GridTemplateTracks {
    tracks: TrackSizingFunction[];
    lineNames: string[][];
    constructor(tracks: TrackSizingFunction[] = [], lineNames: string[][] = []) {
        this.tracks = tracks;
        this.lineNames = lineNames;
    }
    static default() {
        return new GridTemplateTracks();
    }
    static fromString(input: string) {
        return gridTemplateTracksFromString(input);
    }
    static from_string(input: string) {
        return GridTemplateTracks.fromString(input);
    }
    get line_names() {
        return this.lineNames;
    }
    set line_names(value: string[][]) {
        this.lineNames = value;
    }
}
export class GridAutoTracks {
    tracks: TrackSizingFunction[];
    constructor(tracks: TrackSizingFunction[] = []) {
        this.tracks = tracks;
    }
    static default() {
        return new GridAutoTracks();
    }
    static fromString(input: string) {
        return gridAutoTracksFromString(input);
    }
    static from_string(input: string) {
        return GridAutoTracks.fromString(input);
    }
    get 0() {
        return this.tracks;
    }
}
export class GridTemplateRepetition {
    count: GridTrackRepetition;
    tracks: TrackSizingFunction[];
    lineNames: string[][];
    constructor(count: GridTrackRepetition, tracks: TrackSizingFunction[], lineNames: string[][] = []) {
        this.count = count;
        this.tracks = tracks;
        this.lineNames = lineNames;
    }
    get line_names() {
        return this.lineNames;
    }
    set line_names(value: string[][]) {
        this.lineNames = value;
    }
    count_() {
        return this.count;
    }
    tracks_() {
        return this.tracks;
    }
    trackCount() {
        return this.tracks.length;
    }
    track_count() {
        return this.trackCount();
    }
    linesNames() {
        return this.lineNames;
    }
    lines_names() {
        return this.linesNames();
    }
}
export type GridTrackRepetition =
    | { type: "Count"; count: number }
    | { type: "AutoFit" }
    | { type: "AutoFill" };

export type GridTemplateComponent =
    | { type: "Single"; track: TrackSizingFunction }
    | { type: "Repeat"; repetition: GridTemplateRepetition };

export type GridPlacement =
    | { type: "Auto" }
    | { type: "Line"; line: number }
    | { type: "NamedLine"; name: string; line: number }
    | { type: "Span"; span: number }
    | { type: "NamedSpan"; name: string; span: number };

export type NonNamedGridPlacement = Extract<GridPlacement, { type: "Auto" | "Line" | "Span" }>;

type TrackLengthPercentage =
    | { type: "Length"; value: number }
    | { type: "Percent"; value: number };

export function gridTemplateComponentIsAutoRepetition(component: GridTemplateComponent): boolean {
    return (component.type === "Repeat" &&
        (component.repetition.count.type === "AutoFit" ||
            component.repetition.count.type === "AutoFill"));
}
export function grid_template_component_is_auto_repetition(component: GridTemplateComponent): boolean {
    return gridTemplateComponentIsAutoRepetition(component);
}
export function gridTemplateComponentAsComponentRef(component: GridTemplateComponent): GridTemplateComponent {
    return component;
}
export function grid_template_component_as_component_ref(component: GridTemplateComponent): GridTemplateComponent {
    return gridTemplateComponentAsComponentRef(component);
}
export function gridTemplateComponentSingle(track: TrackSizingFunction): GridTemplateComponent {
    return { type: "Single", track };
}
export function gridTemplateComponentAuto() {
    return gridTemplateComponentSingle(TrackSizingFunction.auto());
}
export function gridTemplateComponentMinContent() {
    return gridTemplateComponentSingle(TrackSizingFunction.minContent());
}
export function gridTemplateComponentMaxContent() {
    return gridTemplateComponentSingle(TrackSizingFunction.maxContent());
}
export function gridTemplateComponentFitContent(argument: LengthPercentage): GridTemplateComponent {
    return gridTemplateComponentSingle(TrackSizingFunction.fitContent(argument));
}
export function gridTemplateComponentZero() {
    return gridTemplateComponentSingle(TrackSizingFunction.zero());
}
export function gridTemplateComponentLength(value: number): GridTemplateComponent {
    return gridTemplateComponentSingle(TrackSizingFunction.length(value));
}
export function gridTemplateComponentPercent(value: number): GridTemplateComponent {
    return gridTemplateComponentSingle(TrackSizingFunction.percent(value));
}
export function gridTemplateComponentFr(value: number): GridTemplateComponent {
    return gridTemplateComponentSingle(TrackSizingFunction.fr(value));
}
export function gridTemplateComponentFromString(input: string): GridTemplateComponent {
    const trimmed = input.trim();
    const repeatMatch = /^repeat\((.*)\)$/.exec(trimmed);
    if (repeatMatch !== null) {
        const [countPart, tracksPart] = splitTopLevelComma(repeatMatch[1] ?? "", "GridTemplateComponent", input);
        const count = repetitionCountFromString(countPart);
        const tracks = gridTemplateTracksFromString(tracksPart);
        return {
            type: "Repeat",
            repetition: new GridTemplateRepetition(count, tracks.tracks, tracks.lineNames),
        };
    }
    return gridTemplateComponentSingle(trackSizingFunctionFromString(input));
}
export function grid_template_component_from_string(input: string): GridTemplateComponent {
    return gridTemplateComponentFromString(input);
}
export function line(index: number, factory: any = undefined) {
    if (factory === undefined)
        return gridPlacementLine(index);
    return "fromLineIndex" in factory ? factory.fromLineIndex(index) : factory.from_line_index(index);
}
export function span(spanValue: number, factory: any = undefined) {
    if (factory === undefined)
        return gridPlacementSpan(spanValue);
    return "fromSpan" in factory ? factory.fromSpan(spanValue) : factory.from_span(spanValue);
}
export function minmax(min: MinTrackSizingFunction, max: MaxTrackSizingFunction): TrackSizingFunction {
    return new TrackSizingFunction(min, max);
}
export function flex(flexFraction: number): TrackSizingFunction {
    return minmax(MinTrackSizingFunction.length(0), MaxTrackSizingFunction.fr(flexFraction));
}
export function fr(value: number, factory: any = undefined) {
    if (factory === undefined)
        return TrackSizingFunction.fr(value);
    return "fromFr" in factory ? factory.fromFr(value) : factory.from_fr(value);
}
export function lengthTrack(value: number): TrackSizingFunction {
    return TrackSizingFunction.length(value);
}
export function percentTrack(value: number): TrackSizingFunction {
    return TrackSizingFunction.percent(value);
}
export function repeat(repetitionKind: GridTrackRepetition | number | string, tracks: TrackSizingFunction[]): GridTemplateComponent {
    return {
        type: "Repeat",
        repetition: new GridTemplateRepetition(repetitionCountFrom(repetitionKind), tracks, []),
    };
}
export function evenlySizedTracks(count: number): GridTemplateComponent[] {
    return [repeat(count, [flex(1)])];
}
export function evenly_sized_tracks(count: number): GridTemplateComponent[] {
    return evenlySizedTracks(count);
}
export function repetitionCountFrom(value: GridTrackRepetition | number | string): GridTrackRepetition {
    if (typeof value === "number")
        return { type: "Count", count: value };
    if (value === "auto-fit")
        return { type: "AutoFit" };
    if (value === "auto-fill")
        return { type: "AutoFill" };
    if (typeof value === "string")
        throw new InvalidStringRepetitionValue();
    return value;
}
export function repetitionCountFromString(input: string): GridTrackRepetition {
    const trimmed = input.trim();
    if (trimmed === "auto-fit")
        return { type: "AutoFit" };
    if (trimmed === "auto-fill")
        return { type: "AutoFill" };
    if (/^\+?[1-9]\d*$/.test(trimmed))
        return { type: "Count", count: Number(trimmed) };
    throw parseError("RepetitionCount", input);
}
export function repetition_count_from_string(input: string): GridTrackRepetition {
    return repetitionCountFromString(input);
}
export class Style {
    display;
    itemIsTable;
    itemIsReplaced;
    boxSizing;
    direction;
    overflow;
    scrollbarWidth;
    float;
    clear;
    position;
    inset;
    size;
    minSize;
    maxSize;
    aspectRatio;
    margin;
    padding;
    border;
    alignItems;
    alignSelf;
    justifyItems;
    justifySelf;
    alignContent;
    justifyContent;
    gap;
    textAlign;
    flexDirection;
    flexWrap;
    flexBasis;
    flexGrow;
    flexShrink;
    gridTemplateRows;
    gridTemplateColumns;
    gridAutoRows;
    gridAutoColumns;
    gridAutoFlow;
    gridTemplateAreas;
    gridTemplateColumnNames;
    gridTemplateRowNames;
    gridRow;
    gridColumn;
    constructor(init: any = {}) {
        this.display = init.display ?? Display.DEFAULT;
        this.itemIsTable = init.itemIsTable ?? init.item_is_table ?? false;
        this.itemIsReplaced = init.itemIsReplaced ?? init.item_is_replaced ?? false;
        this.boxSizing = init.boxSizing ?? init.box_sizing ?? BoxSizing.DEFAULT;
        this.direction = init.direction ?? Direction.DEFAULT;
        this.overflow = init.overflow ?? new Point(Overflow.DEFAULT, Overflow.DEFAULT);
        this.scrollbarWidth = init.scrollbarWidth ?? init.scrollbar_width ?? 0;
        this.float = init.float ?? Float.DEFAULT;
        this.clear = init.clear ?? Clear.DEFAULT;
        this.position = init.position ?? Position.DEFAULT;
        this.inset = init.inset ?? lengthPercentageAutoRectAuto();
        this.size = init.size ?? dimensionSizeAuto();
        this.minSize = init.minSize ?? init.min_size ?? dimensionSizeAuto();
        this.maxSize = init.maxSize ?? init.max_size ?? dimensionSizeAuto();
        this.aspectRatio = init.aspectRatio ?? init.aspect_ratio;
        this.margin = init.margin ?? lengthPercentageAutoRectZero();
        this.padding = init.padding ?? lengthPercentageRectZero();
        this.border = init.border ?? lengthPercentageRectZero();
        this.alignItems = init.alignItems ?? init.align_items;
        this.alignSelf = init.alignSelf ?? init.align_self;
        this.justifyItems = init.justifyItems ?? init.justify_items;
        this.justifySelf = init.justifySelf ?? init.justify_self;
        this.alignContent = init.alignContent ?? init.align_content;
        this.justifyContent = init.justifyContent ?? init.justify_content;
        this.gap = init.gap ?? new Size(LengthPercentage.zero(), LengthPercentage.zero());
        this.textAlign = init.textAlign ?? init.text_align ?? TextAlign.DEFAULT;
        this.flexDirection = init.flexDirection ?? init.flex_direction ?? FlexDirection.DEFAULT;
        this.flexWrap = init.flexWrap ?? init.flex_wrap ?? FlexWrap.DEFAULT;
        this.flexBasis = init.flexBasis ?? init.flex_basis ?? Dimension.auto();
        this.flexGrow = init.flexGrow ?? init.flex_grow ?? 0;
        this.flexShrink = init.flexShrink ?? init.flex_shrink ?? 1;
        this.gridTemplateRows = init.gridTemplateRows ?? init.grid_template_rows ?? [];
        this.gridTemplateColumns = init.gridTemplateColumns ?? init.grid_template_columns ?? [];
        this.gridAutoRows = init.gridAutoRows ?? init.grid_auto_rows ?? [];
        this.gridAutoColumns = init.gridAutoColumns ?? init.grid_auto_columns ?? [];
        this.gridAutoFlow = init.gridAutoFlow ?? init.grid_auto_flow ?? GridAutoFlow.DEFAULT;
        this.gridTemplateAreas = init.gridTemplateAreas ?? init.grid_template_areas ?? [];
        this.gridTemplateColumnNames =
            init.gridTemplateColumnNames ?? init.grid_template_column_names ?? [];
        this.gridTemplateRowNames = init.gridTemplateRowNames ?? init.grid_template_row_names ?? [];
        this.gridRow = gridPlacementLineFrom(init.gridRow ?? init.grid_row);
        this.gridColumn = gridPlacementLineFrom(init.gridColumn ?? init.grid_column);
    }
    static get DEFAULT() {
        return Style.default();
    }
    static default() {
        return new Style();
    }
    get item_is_table() {
        return this.itemIsTable;
    }
    set item_is_table(value) {
        this.itemIsTable = value;
    }
    get item_is_replaced() {
        return this.itemIsReplaced;
    }
    set item_is_replaced(value) {
        this.itemIsReplaced = value;
    }
    get grid_row() {
        return this.gridRow;
    }
    set grid_row(value) {
        this.gridRow = gridPlacementLineFrom(value);
    }
    get grid_column() {
        return this.gridColumn;
    }
    set grid_column(value) {
        this.gridColumn = gridPlacementLineFrom(value);
    }
    boxGenerationMode() {
        return boxGenerationMode(this);
    }
    box_generation_mode() {
        return this.boxGenerationMode();
    }
    isBlock() {
        return this.display === Display.Block;
    }
    is_block() {
        return this.isBlock();
    }
    isCompressibleReplaced() {
        return this.itemIsReplaced;
    }
    is_compressible_replaced() {
        return this.isCompressibleReplaced();
    }
    isTable() {
        return this.itemIsTable;
    }
    is_table() {
        return this.isTable();
    }
    box_sizing() {
        return this.boxSizing;
    }
    direction_() {
        return this.direction;
    }
    overflow_() {
        return this.overflow;
    }
    scrollbar_width() {
        return this.scrollbarWidth;
    }
    position_() {
        return this.position;
    }
    inset_() {
        return this.inset;
    }
    size_() {
        return this.size;
    }
    min_size() {
        return this.minSize;
    }
    max_size() {
        return this.maxSize;
    }
    aspect_ratio() {
        return this.aspectRatio;
    }
    margin_() {
        return this.margin;
    }
    padding_() {
        return this.padding;
    }
    border_() {
        return this.border;
    }
    text_align() {
        return this.textAlign;
    }
    float_() {
        return this.float;
    }
    clear_() {
        return this.clear;
    }
    flex_direction() {
        return this.flexDirection;
    }
    flex_wrap() {
        return this.flexWrap;
    }
    gap_() {
        return this.gap;
    }
    align_content() {
        return this.alignContent;
    }
    align_items() {
        return this.alignItems;
    }
    justify_content() {
        return this.justifyContent;
    }
    flex_basis() {
        return this.flexBasis;
    }
    flex_grow() {
        return this.flexGrow;
    }
    flex_shrink() {
        return this.flexShrink;
    }
    align_self() {
        return this.alignSelf;
    }
    grid_template_rows() {
        return this.gridTemplateRows;
    }
    grid_template_columns() {
        return this.gridTemplateColumns;
    }
    grid_auto_rows() {
        return this.gridAutoRows;
    }
    grid_auto_columns() {
        return this.gridAutoColumns;
    }
    grid_auto_flow() {
        return this.gridAutoFlow;
    }
    justify_items() {
        return this.justifyItems;
    }
    grid_template_tracks(axis: AbsoluteAxis) {
        return axis === AbsoluteAxis.Horizontal ? this.gridTemplateColumns : this.gridTemplateRows;
    }
    grid_align_content(axis: AbstractAxis) {
        return axis === AbstractAxis.Inline
            ? (this.justifyContent ?? AlignContent.Stretch)
            : (this.alignContent ?? AlignContent.Stretch);
    }
    grid_template_areas() {
        return this.gridTemplateAreas;
    }
    grid_template_column_names() {
        return this.gridTemplateColumnNames;
    }
    grid_template_row_names() {
        return this.gridTemplateRowNames;
    }
    grid_row_() {
        return this.gridRow;
    }
    grid_column_() {
        return this.gridColumn;
    }
    grid_placement(axis: AbsoluteAxis) {
        return axis === AbsoluteAxis.Horizontal ? this.gridColumn : this.gridRow;
    }
    justify_self() {
        return this.justifySelf;
    }
}
export function alignContentReversed(alignment: AlignContent): AlignContent {
    switch (alignment) {
        case AlignContent.Start:
            return AlignContent.End;
        case AlignContent.End:
            return AlignContent.Start;
        case AlignContent.FlexStart:
            return AlignContent.FlexEnd;
        case AlignContent.FlexEnd:
            return AlignContent.FlexStart;
        case AlignContent.Stretch:
            return AlignContent.End;
        default:
            return alignment;
    }
}
export function boxGenerationMode(style: Style): BoxGenerationMode {
    return style.display === Display.None ? BoxGenerationMode.None : BoxGenerationMode.Normal;
}
export function displayToString(display: Display): string {
    switch (display) {
        case Display.None:
            return "NONE";
        case Display.Block:
            return "BLOCK";
        case Display.Flex:
            return "FLEX";
        case Display.Grid:
            return "GRID";
    }
}
export function alignItemsFromString(input: string): AlignItems {
    return parseKeywordEnum(input, ALIGN_ITEMS_KEYWORDS, "AlignItems");
}
export function align_items_from_string(input: string): AlignItems {
    return alignItemsFromString(input);
}
export function alignContentFromString(input: string): AlignContent {
    return parseKeywordEnum(input, ALIGN_CONTENT_KEYWORDS, "AlignContent");
}
export function align_content_from_string(input: string): AlignContent {
    return alignContentFromString(input);
}
export function displayFromString(input: string): Display {
    return parseKeywordEnum(input, DISPLAY_KEYWORDS, "Display");
}
export function display_from_string(input: string): Display {
    return displayFromString(input);
}
export function positionFromString(input: string): Position {
    return parseKeywordEnum(input, POSITION_KEYWORDS, "Position");
}
export function position_from_string(input: string): Position {
    return positionFromString(input);
}
export function boxSizingFromString(input: string): BoxSizing {
    return parseKeywordEnum(input, BOX_SIZING_KEYWORDS, "BoxSizing");
}
export function box_sizing_from_string(input: string): BoxSizing {
    return boxSizingFromString(input);
}
export function overflowFromString(input: string): Overflow {
    return parseKeywordEnum(input, OVERFLOW_KEYWORDS, "Overflow");
}
export function overflow_from_string(input: string): Overflow {
    return overflowFromString(input);
}
export function directionFromString(input: string): Direction {
    return parseKeywordEnum(input, DIRECTION_KEYWORDS, "Direction");
}
export function direction_from_string(input: string): Direction {
    return directionFromString(input);
}
export function floatFromString(input: string): Float {
    return parseKeywordEnum(input, FLOAT_KEYWORDS, "Float");
}
export function float_from_string(input: string): Float {
    return floatFromString(input);
}
export function clearFromString(input: string): Clear {
    return parseKeywordEnum(input, CLEAR_KEYWORDS, "Clear");
}
export function clear_from_string(input: string): Clear {
    return clearFromString(input);
}
export function textAlignFromString(input: string): TextAlign {
    return parseKeywordEnum(input, TEXT_ALIGN_KEYWORDS, "TextAlign");
}
export function text_align_from_string(input: string): TextAlign {
    return textAlignFromString(input);
}
export function flexWrapFromString(input: string): FlexWrap {
    return parseKeywordEnum(input, FLEX_WRAP_KEYWORDS, "FlexWrap");
}
export function flex_wrap_from_string(input: string): FlexWrap {
    return flexWrapFromString(input);
}
export function flexDirectionFromString(input: string): FlexDirection {
    return parseKeywordEnum(input, FLEX_DIRECTION_KEYWORDS, "FlexDirection");
}
export function flex_direction_from_string(input: string): FlexDirection {
    return flexDirectionFromString(input);
}
export function gridAutoFlowFromString(input: string): GridAutoFlow {
    let axis: "row" | "column" | undefined;
    let dense = false;
    for (const identifier of parseCssIdentifiers(input, "GridAutoFlow", 2)) {
        switch (identifier) {
            case "row":
                axis = "row";
                break;
            case "column":
                axis = "column";
                break;
            case "dense":
                dense = true;
                break;
            default:
                throw parseError("GridAutoFlow", input);
        }
    }
    if (axis === "column")
        return dense ? GridAutoFlow.ColumnDense : GridAutoFlow.Column;
    if (dense)
        return GridAutoFlow.RowDense;
    return GridAutoFlow.Row;
}
export function grid_auto_flow_from_string(input: string): GridAutoFlow {
    return gridAutoFlowFromString(input);
}
const ALIGN_ITEMS_KEYWORDS = new Map([
    ["start", AlignItems.Start],
    ["end", AlignItems.End],
    ["flex-start", AlignItems.FlexStart],
    ["flex-end", AlignItems.FlexEnd],
    ["center", AlignItems.Center],
    ["baseline", AlignItems.Baseline],
    ["stretch", AlignItems.Stretch],
]);
const ALIGN_CONTENT_KEYWORDS = new Map([
    ["start", AlignContent.Start],
    ["end", AlignContent.End],
    ["flex-start", AlignContent.FlexStart],
    ["flex-end", AlignContent.FlexEnd],
    ["center", AlignContent.Center],
    ["stretch", AlignContent.Stretch],
    ["space-between", AlignContent.SpaceBetween],
    ["space-evenly", AlignContent.SpaceEvenly],
    ["space-around", AlignContent.SpaceAround],
]);
const DISPLAY_KEYWORDS = new Map([
    ["none", Display.None],
    ["flex", Display.Flex],
    ["grid", Display.Grid],
    ["block", Display.Block],
]);
const POSITION_KEYWORDS = new Map([
    ["relative", Position.Relative],
    ["absolute", Position.Absolute],
]);
const BOX_SIZING_KEYWORDS = new Map([
    ["border-box", BoxSizing.BorderBox],
    ["content-box", BoxSizing.ContentBox],
]);
const OVERFLOW_KEYWORDS = new Map([
    ["visible", Overflow.Visible],
    ["hidden", Overflow.Hidden],
    ["clip", Overflow.Clip],
    ["scroll", Overflow.Scroll],
]);
const DIRECTION_KEYWORDS = new Map([
    ["ltr", Direction.Ltr],
    ["rtl", Direction.Rtl],
]);
const FLOAT_KEYWORDS = new Map([
    ["left", Float.Left],
    ["right", Float.Right],
    ["none", Float.None],
]);
const CLEAR_KEYWORDS = new Map([
    ["left", Clear.Left],
    ["right", Clear.Right],
    ["both", Clear.Both],
    ["none", Clear.None],
]);
const TEXT_ALIGN_KEYWORDS = new Map([
    ["auto", TextAlign.Auto],
    ["-webkit-left", TextAlign.LegacyLeft],
    ["-webkit-right", TextAlign.LegacyRight],
    ["-webkit-center", TextAlign.LegacyCenter],
]);
const FLEX_WRAP_KEYWORDS = new Map([
    ["nowrap", FlexWrap.NoWrap],
    ["wrap", FlexWrap.Wrap],
    ["wrap-reverse", FlexWrap.WrapReverse],
]);
const FLEX_DIRECTION_KEYWORDS = new Map([
    ["row", FlexDirection.Row],
    ["column", FlexDirection.Column],
    ["row-reverse", FlexDirection.RowReverse],
    ["column-reverse", FlexDirection.ColumnReverse],
]);
export function display_to_string(display: Display): string {
    return displayToString(display);
}
export function overflowIsScrollContainer(overflow: Overflow): boolean {
    return overflow === Overflow.Hidden || overflow === Overflow.Scroll;
}
export function overflow_is_scroll_container(overflow: Overflow): boolean {
    return overflowIsScrollContainer(overflow);
}
export function overflowMaybeIntoAutomaticMinSize(overflow: Overflow): number | undefined {
    return overflowIsScrollContainer(overflow) ? 0 : undefined;
}
export function overflow_maybe_into_automatic_min_size(overflow: Overflow): number | undefined {
    return overflowMaybeIntoAutomaticMinSize(overflow);
}
export function directionIsRtl(direction: Direction): boolean {
    return direction === Direction.Rtl;
}
export function direction_is_rtl(direction: Direction): boolean {
    return directionIsRtl(direction);
}
export function gridAutoFlowIsDense(flow: GridAutoFlow): boolean {
    return flow === GridAutoFlow.RowDense || flow === GridAutoFlow.ColumnDense;
}
export function grid_auto_flow_is_dense(flow: GridAutoFlow): boolean {
    return gridAutoFlowIsDense(flow);
}
export function gridAutoFlowPrimaryAxis(flow: GridAutoFlow): AbsoluteAxis {
    return flow === GridAutoFlow.Row || flow === GridAutoFlow.RowDense
        ? AbsoluteAxis.Horizontal
        : AbsoluteAxis.Vertical;
}
export function grid_auto_flow_primary_axis(flow: GridAutoFlow): AbsoluteAxis {
    return gridAutoFlowPrimaryAxis(flow);
}
export function floatIsFloated(value: Float): boolean {
    return value === Float.Left || value === Float.Right;
}
export function float_is_floated(value: Float): boolean {
    return floatIsFloated(value);
}
export function floatDirection(value: Float): FloatDirection | undefined {
    return styleFloatDirection(value);
}
export function float_direction(value: Float): FloatDirection | undefined {
    return floatDirection(value);
}
function styleFloatDirection(value: Float): FloatDirection | undefined {
    switch (value) {
        case Float.Left:
            return FloatDirection.Left;
        case Float.Right:
            return FloatDirection.Right;
        case Float.None:
            return undefined;
    }
}
export function flexDirectionIsRow(direction: FlexDirection): boolean {
    return direction === FlexDirection.Row || direction === FlexDirection.RowReverse;
}
export function flex_direction_is_row(direction: FlexDirection): boolean {
    return flexDirectionIsRow(direction);
}
export function flexDirectionIsColumn(direction: FlexDirection): boolean {
    return direction === FlexDirection.Column || direction === FlexDirection.ColumnReverse;
}
export function flex_direction_is_column(direction: FlexDirection): boolean {
    return flexDirectionIsColumn(direction);
}
export function flexDirectionIsReverse(direction: FlexDirection): boolean {
    return direction === FlexDirection.RowReverse || direction === FlexDirection.ColumnReverse;
}
export function flex_direction_is_reverse(direction: FlexDirection): boolean {
    return flexDirectionIsReverse(direction);
}
export function flexDirectionMainAxis(direction: FlexDirection): AbsoluteAxis {
    return flexDirectionIsRow(direction) ? AbsoluteAxis.Horizontal : AbsoluteAxis.Vertical;
}
export function flex_direction_main_axis(direction: FlexDirection): AbsoluteAxis {
    return flexDirectionMainAxis(direction);
}
export function flexDirectionCrossAxis(direction: FlexDirection): AbsoluteAxis {
    return flexDirectionIsRow(direction) ? AbsoluteAxis.Vertical : AbsoluteAxis.Horizontal;
}
export function flex_direction_cross_axis(direction: FlexDirection): AbsoluteAxis {
    return flexDirectionCrossAxis(direction);
}
export function gridPlacementAuto(): GridPlacement {
    return { type: "Auto" };
}
export function gridPlacementLine(line: number): GridPlacement {
    return { type: "Line", line };
}
export function gridPlacementNamedLine(name: string, line: number): GridPlacement {
    return { type: "NamedLine", name, line };
}
export function gridPlacementSpan(span: number): GridPlacement {
    return { type: "Span", span };
}
export function gridPlacementNamedSpan(name: string, span: number): GridPlacement {
    return { type: "NamedSpan", name, span };
}
export function gridPlacementFromString(input: string): GridPlacement {
    const trimmed = input.trim();
    if (trimmed.length === 0)
        throw parseError("GridPlacement", input);
    let span = false;
    let number: number | undefined;
    let ident: string | undefined;
    for (const token of trimmed.split(/\s+/)) {
        if (token === "auto") {
            if (span || number !== undefined || ident !== undefined || token !== trimmed) {
                throw parseError("GridPlacement", input);
            }
            return gridPlacementAuto();
        }
        if (token === "span") {
            if (span)
                throw parseError("GridPlacement", input);
            span = true;
            continue;
        }
        if (/^[+-]?\d+$/.test(token)) {
            const parsed = Number(token);
            if (parsed === 0 || number !== undefined)
                throw parseError("GridPlacement", input);
            number = parsed;
            continue;
        }
        if (isCssIdent(token)) {
            if (ident !== undefined)
                throw parseError("GridPlacement", input);
            ident = token;
            continue;
        }
        throw parseError("GridPlacement", input);
    }
    if (span) {
        if (ident !== undefined)
            return gridPlacementNamedSpan(ident, number ?? 0);
        return gridPlacementSpan(number ?? 0);
    }
    if (number !== undefined && ident !== undefined)
        return gridPlacementNamedLine(ident, number);
    if (number !== undefined)
        return gridPlacementLine(number);
    if (ident !== undefined)
        return gridPlacementNamedLine(ident, 0);
    throw parseError("GridPlacement", input);
}
export function grid_placement_from_string(input: string): GridPlacement {
    return gridPlacementFromString(input);
}
export function maxTrackSizingFunctionFromString(input: string): MaxTrackSizingFunction {
    const trimmed = input.trim();
    const fitContent = /^fit-content\((.*)\)$/.exec(trimmed);
    if (fitContent !== null) {
        const argument = parseLengthPercentageToken(fitContent[1] ?? "", "MaxTrackSizingFunction", false);
        switch (argument.type) {
            case "Length":
                return MaxTrackSizingFunction.fitContentPx(argument.value);
            case "Percent":
                return MaxTrackSizingFunction.fitContentPercent(argument.value);
            case "Auto":
                throw parseError("MaxTrackSizingFunction", input);
        }
    }
    const fraction = /^([+]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))fr$/.exec(trimmed);
    if (fraction !== null)
        return MaxTrackSizingFunction.fr(Number(fraction[1]));
    const lengthPercentage = parseTrackLengthPercentage(input, "MaxTrackSizingFunction");
    if (lengthPercentage !== undefined) {
        return lengthPercentage.type === "Length"
            ? MaxTrackSizingFunction.length(lengthPercentage.value)
            : MaxTrackSizingFunction.percent(lengthPercentage.value);
    }
    switch (trimmed) {
        case "auto":
            return MaxTrackSizingFunction.auto();
        case "min-content":
            return MaxTrackSizingFunction.minContent();
        case "max-content":
            return MaxTrackSizingFunction.maxContent();
        default:
            throw parseError("MaxTrackSizingFunction", input);
    }
}
export function max_track_sizing_function_from_string(input: string): MaxTrackSizingFunction {
    return maxTrackSizingFunctionFromString(input);
}
export function minTrackSizingFunctionFromString(input: string): MinTrackSizingFunction {
    const lengthPercentage = parseTrackLengthPercentage(input, "MinTrackSizingFunction");
    if (lengthPercentage !== undefined) {
        return lengthPercentage.type === "Length"
            ? MinTrackSizingFunction.length(lengthPercentage.value)
            : MinTrackSizingFunction.percent(lengthPercentage.value);
    }
    switch (input.trim()) {
        case "auto":
            return MinTrackSizingFunction.auto();
        case "min-content":
            return MinTrackSizingFunction.minContent();
        case "max-content":
            return MinTrackSizingFunction.maxContent();
        default:
            throw parseError("MinTrackSizingFunction", input);
    }
}
export function min_track_sizing_function_from_string(input: string): MinTrackSizingFunction {
    return minTrackSizingFunctionFromString(input);
}
export function trackSizingFunctionFromString(input: string): TrackSizingFunction {
    const trimmed = input.trim();
    const minmaxMatch = /^minmax\((.*),(.*)\)$/.exec(trimmed);
    if (minmaxMatch !== null) {
        const min = minTrackSizingFunctionFromString(minmaxMatch[1] ?? "");
        const max = maxTrackSizingFunctionFromString(minmaxMatch[2] ?? "");
        return new TrackSizingFunction(min, max);
    }
    const max = maxTrackSizingFunctionFromString(input);
    return new TrackSizingFunction(MinTrackSizingFunction.fromMax(max), max);
}
export function track_sizing_function_from_string(input: string): TrackSizingFunction {
    return trackSizingFunctionFromString(input);
}
export function gridAutoTracksFromString(input: string): GridAutoTracks {
    const tracks = splitTrackSizingList(input, "GridAutoTracks").map((track) => trackSizingFunctionFromString(track));
    if (tracks.length === 0)
        throw parseError("GridAutoTracks", input);
    return new GridAutoTracks(tracks);
}
export function grid_auto_tracks_from_string(input: string): GridAutoTracks {
    return gridAutoTracksFromString(input);
}
export function gridTemplateTracksFromString(input: string): GridTemplateTracks {
    const tokens = splitGridTemplateTrackTokens(input, "GridTemplateTracks");
    const tracks: TrackSizingFunction[] = [];
    const lineNames: string[][] = [];
    let index = 0;
    if (tokens[index]?.startsWith("[")) {
        lineNames.push(parseGridLineNameSet(tokens[index], input, "GridTemplateTracks"));
        index += 1;
    }
    while (index < tokens.length) {
        const token = tokens[index];
        if (token.startsWith("["))
            throw parseError("GridTemplateTracks", input);
        tracks.push(trackSizingFunctionFromString(token));
        index += 1;
        if (tokens[index]?.startsWith("[")) {
            lineNames.push(parseGridLineNameSet(tokens[index], input, "GridTemplateTracks"));
            index += 1;
        }
    }
    if (tracks.length === 0)
        throw parseError("GridTemplateTracks", input);
    return new GridTemplateTracks(tracks, lineNames);
}
export function grid_template_tracks_from_string(input: string): GridTemplateTracks {
    return gridTemplateTracksFromString(input);
}
function parseTrackLengthPercentage(input: string, typeName: string): TrackLengthPercentage | undefined {
    try {
        const parsed = parseLengthPercentageToken(input, typeName, false);
        if (parsed.type === "Auto")
            return undefined;
        return parsed;
    }
    catch (error) {
        if (error instanceof Error && error.name === "ParseError")
            return undefined;
        throw error;
    }
}
function splitTrackSizingList(input: string, typeName: string): string[] {
    const tracks: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of input.trim()) {
        if (char === "(")
            depth += 1;
        if (char === ")")
            depth -= 1;
        if (depth < 0)
            throw parseError(typeName, input);
        if (/\s/.test(char) && depth === 0) {
            if (current.length > 0) {
                tracks.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (depth !== 0)
        throw parseError(typeName, input);
    if (current.length > 0)
        tracks.push(current);
    return tracks;
}
function parseGridLineNameSet(token: string, input: string, typeName: string): string[] {
    if (!token.startsWith("[") || !token.endsWith("]"))
        throw parseError(typeName, input);
    const body = token.slice(1, -1).trim();
    if (body.length === 0)
        return [];
    const names = body.split(/\s+/);
    if (names.some((name) => !isCssIdent(name)))
        throw parseError(typeName, input);
    return names;
}
function splitGridTemplateTrackTokens(input: string, typeName: string): string[] {
    const tokens: string[] = [];
    let parenDepth = 0;
    let bracketDepth = 0;
    let current = "";
    for (const char of input.trim()) {
        if (bracketDepth > 0) {
            current += char;
            if (char === "[")
                bracketDepth += 1;
            if (char === "]")
                bracketDepth -= 1;
            if (bracketDepth < 0)
                throw parseError(typeName, input);
            if (bracketDepth === 0) {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        if (char === "[" && parenDepth === 0) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
            current = char;
            bracketDepth = 1;
            continue;
        }
        if (char === "(")
            parenDepth += 1;
        if (char === ")")
            parenDepth -= 1;
        if (parenDepth < 0)
            throw parseError(typeName, input);
        if (/\s/.test(char) && parenDepth === 0) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (parenDepth !== 0 || bracketDepth !== 0)
        throw parseError(typeName, input);
    if (current.length > 0)
        tokens.push(current);
    return tokens;
}
function splitTopLevelComma(input: string, typeName: string, originalInput = input): [string, string] {
    let parenDepth = 0;
    let bracketDepth = 0;
    let commaIndex = -1;
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (char === "(")
            parenDepth += 1;
        if (char === ")")
            parenDepth -= 1;
        if (char === "[")
            bracketDepth += 1;
        if (char === "]")
            bracketDepth -= 1;
        if (parenDepth < 0 || bracketDepth < 0)
            throw parseError(typeName, originalInput);
        if (char === "," && parenDepth === 0 && bracketDepth === 0) {
            if (commaIndex !== -1)
                throw parseError(typeName, originalInput);
            commaIndex = index;
        }
    }
    if (parenDepth !== 0 || bracketDepth !== 0 || commaIndex === -1)
        throw parseError(typeName, originalInput);
    return [input.slice(0, commaIndex).trim(), input.slice(commaIndex + 1).trim()];
}
export class TrackCounts {
    negativeImplicit: number;
    explicit: number;
    positiveImplicit: number;
    static default(): TrackCounts {
        return new TrackCounts(0, 0, 0);
    }
    static fromRaw(negativeImplicit: number, explicit: number, positiveImplicit: number): TrackCounts {
        return new TrackCounts(negativeImplicit, explicit, positiveImplicit);
    }
    static from_raw(negativeImplicit: number, explicit: number, positiveImplicit: number): TrackCounts {
        return TrackCounts.fromRaw(negativeImplicit, explicit, positiveImplicit);
    }
    constructor(negativeImplicit: number, explicit: number, positiveImplicit: number) {
        this.negativeImplicit = negativeImplicit;
        this.explicit = explicit;
        this.positiveImplicit = positiveImplicit;
    }
    len(): number {
        return this.negativeImplicit + this.explicit + this.positiveImplicit;
    }
    implicitStartLine(): number {
        return -this.negativeImplicit;
    }
    implicit_start_line(): number {
        return this.implicitStartLine();
    }
    implicitEndLine(): number {
        return this.explicit + this.positiveImplicit;
    }
    implicit_end_line(): number {
        return this.implicitEndLine();
    }
    ozLineToNextTrack(line: number): number {
        return line + this.negativeImplicit;
    }
    oz_line_to_next_track(line: number): number {
        return this.ozLineToNextTrack(line);
    }
    ozLineRangeToTrackRange(lineRange: Line): Line {
        return new Line(this.ozLineToNextTrack(lineRange.start), this.ozLineToNextTrack(lineRange.end));
    }
    oz_line_range_to_track_range(lineRange: Line): Line {
        return this.ozLineRangeToTrackRange(lineRange);
    }
    trackToPrevOzLine(index: number): number {
        return index - this.negativeImplicit;
    }
    track_to_prev_oz_line(index: number): number {
        return this.trackToPrevOzLine(index);
    }
    trackRangeToOzLineRange(trackRange: Line): Line {
        return new Line(this.trackToPrevOzLine(trackRange.start), this.trackToPrevOzLine(trackRange.end));
    }
    track_range_to_oz_line_range(trackRange: Line): Line {
        return this.trackRangeToOzLineRange(trackRange);
    }
}
export function gridLineAsI16(line: number): number {
    return line;
}
export function grid_line_as_i16(line: number): number {
    return gridLineAsI16(line);
}
export function gridLineIntoOriginZeroLine(line: number, explicitTrackCount: number): number {
    if (line === 0)
        throw new Error("Grid line of zero is invalid");
    return line > 0 ? line - 1 : line + explicitTrackCount + 1;
}
export function grid_line_into_origin_zero_line(line: number, explicitTrackCount: number): number {
    return gridLineIntoOriginZeroLine(line, explicitTrackCount);
}
export function originZeroLineTryIntoTrackVecIndex(line: number, trackCounts: TrackCounts): number | undefined {
    if (line < -trackCounts.negativeImplicit)
        return undefined;
    if (line > trackCounts.explicit + trackCounts.positiveImplicit)
        return undefined;
    return 2 * (line + trackCounts.negativeImplicit);
}
export function origin_zero_line_try_into_track_vec_index(line: number, trackCounts: TrackCounts): number | undefined {
    return originZeroLineTryIntoTrackVecIndex(line, trackCounts);
}
export function originZeroLineIntoTrackVecIndex(line: number, trackCounts: TrackCounts): number {
    const index = originZeroLineTryIntoTrackVecIndex(line, trackCounts);
    if (index !== undefined)
        return index;
    if (line > 0)
        throw new Error("OriginZero grid line cannot be more than the number of positive grid lines");
    throw new Error("OriginZero grid line cannot be less than the number of negative grid lines");
}
export function origin_zero_line_into_track_vec_index(line: number, trackCounts: TrackCounts): number {
    return originZeroLineIntoTrackVecIndex(line, trackCounts);
}
export function originZeroLineImpliedNegativeImplicitTracks(line: number): number {
    return line < 0 ? Math.abs(line) : 0;
}
export function origin_zero_line_implied_negative_implicit_tracks(line: number): number {
    return originZeroLineImpliedNegativeImplicitTracks(line);
}
export function originZeroLineImpliedPositiveImplicitTracks(line: number, explicitTrackCount: number): number {
    return line > explicitTrackCount ? line - explicitTrackCount : 0;
}
export function origin_zero_line_implied_positive_implicit_tracks(line: number, explicitTrackCount: number): number {
    return originZeroLineImpliedPositiveImplicitTracks(line, explicitTrackCount);
}
export function originZeroLineSpan(line: Line): number {
    return Math.max(line.end - line.start, 0);
}
export function origin_zero_line_span(line: Line): number {
    return originZeroLineSpan(line);
}
export function gridPlacementIntoOriginZeroIgnoringNamed(placement: GridPlacement, explicitTrackCount: number): NonNamedGridPlacement {
    switch (placement.type) {
        case "Line":
        case "Auto":
        case "Span":
            return nonNamedGridPlacementIntoOriginZero(placement, explicitTrackCount);
        case "NamedLine":
        case "NamedSpan":
            return { type: "Auto" };
    }
}
export function gridPlacementLineIntoOriginZeroIgnoringNamed(placement: Line, explicitTrackCount: number): Line {
    return new Line(gridPlacementIntoOriginZeroIgnoringNamed(placement.start, explicitTrackCount), gridPlacementIntoOriginZeroIgnoringNamed(placement.end, explicitTrackCount));
}
export function gridPlacementLineIsDefinite(placement: Line): boolean {
    return placementIsDefinite(placement.start) || placementIsDefinite(placement.end);
}
export function nonNamedGridPlacementIntoOriginZero(placement: NonNamedGridPlacement, explicitTrackCount: number): NonNamedGridPlacement {
    switch (placement.type) {
        case "Auto":
        case "Span":
            return placement;
        case "Line":
            return placement.line === 0
                ? { type: "Auto" }
                : { type: "Line", line: gridLineIntoOriginZeroLine(placement.line, explicitTrackCount) };
    }
}
export function nonNamedGridPlacementLineIntoOriginZero(placement: Line, explicitTrackCount: number): Line {
    return new Line(nonNamedGridPlacementIntoOriginZero(placement.start, explicitTrackCount), nonNamedGridPlacementIntoOriginZero(placement.end, explicitTrackCount));
}
export function nonNamedGridPlacementLineIsDefinite(placement: Line): boolean {
    return nonNamedPlacementIsDefinite(placement.start) || nonNamedPlacementIsDefinite(placement.end);
}
export function originZeroGridPlacementLineIsDefinite(placement: Line): boolean {
    return placement.start.type === "Line" || placement.end.type === "Line";
}
export function originZeroGridPlacementLineIndefiniteSpan(placement: Line): number {
    if (placement.start.type === "Line" && placement.end.type === "Line") {
        throw new Error("indefinite span should only be called on indefinite grid tracks");
    }
    if (placement.start.type === "Span")
        return placement.start.span;
    if (placement.end.type === "Span")
        return placement.end.span;
    return 1;
}
export function originZeroGridPlacementLineResolveDefiniteGridLines(placement: Line): Line {
    if (placement.start.type === "Line" && placement.end.type === "Line") {
        return placement.start.line === placement.end.line
            ? new Line(placement.start.line, placement.start.line + 1)
            : new Line(Math.min(placement.start.line, placement.end.line), Math.max(placement.start.line, placement.end.line));
    }
    if (placement.start.type === "Line" && placement.end.type === "Span") {
        return new Line(placement.start.line, placement.start.line + placement.end.span);
    }
    if (placement.start.type === "Line" && placement.end.type === "Auto") {
        return new Line(placement.start.line, placement.start.line + 1);
    }
    if (placement.start.type === "Span" && placement.end.type === "Line") {
        return new Line(placement.end.line - placement.start.span, placement.end.line);
    }
    if (placement.start.type === "Auto" && placement.end.type === "Line") {
        return new Line(placement.end.line - 1, placement.end.line);
    }
    throw new Error("definite grid lines should only be resolved for definite grid tracks");
}
export function originZeroGridPlacementLineResolveAbsolutelyPositionedGridTracks(placement: Line): Line {
    if (placement.start.type === "Line" && placement.end.type === "Line") {
        return placement.start.line === placement.end.line
            ? new Line(placement.start.line, placement.start.line + 1)
            : new Line(Math.min(placement.start.line, placement.end.line), Math.max(placement.start.line, placement.end.line));
    }
    if (placement.start.type === "Line" && placement.end.type === "Span") {
        return new Line(placement.start.line, placement.start.line + placement.end.span);
    }
    if (placement.start.type === "Line" && placement.end.type === "Auto") {
        return new Line(placement.start.line, undefined);
    }
    if (placement.start.type === "Span" && placement.end.type === "Line") {
        return new Line(placement.end.line - placement.start.span, placement.end.line);
    }
    if (placement.start.type === "Auto" && placement.end.type === "Line") {
        return new Line(undefined, placement.end.line);
    }
    return new Line(undefined, undefined);
}
export function originZeroGridPlacementLineResolveIndefiniteGridTracks(placement: Line, start: number): Line {
    if (placement.start.type === "Auto" && placement.end.type === "Auto") {
        return new Line(start, start + 1);
    }
    if (placement.start.type === "Span" && placement.end.type === "Auto") {
        return new Line(start, start + placement.start.span);
    }
    if (placement.start.type === "Auto" && placement.end.type === "Span") {
        return new Line(start, start + placement.end.span);
    }
    if (placement.start.type === "Span" && placement.end.type === "Span") {
        return new Line(start, start + placement.start.span);
    }
    throw new Error("indefinite grid tracks should only be resolved for indefinite grid tracks");
}
function placementIsDefinite(placement: GridPlacement): boolean {
    switch (placement.type) {
        case "Line":
            return placement.line !== 0;
        case "NamedLine":
            return true;
        default:
            return false;
    }
}
function nonNamedPlacementIsDefinite(placement: NonNamedGridPlacement): boolean {
    return placement.type === "Line" && placement.line !== 0;
}
function gridPlacementLineFrom(placement: GridPlacement | Line | undefined): Line {
    if (placement === undefined)
        return new Line({ type: "Auto" }, { type: "Auto" });
    return placement instanceof Line ? placement : new Line(placement, { type: "Auto" });
}
