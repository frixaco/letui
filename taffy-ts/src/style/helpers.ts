export { evenlySizedTracks, evenly_sized_tracks, flex, fr, line, minmax, repeat, span, } from "./style.js";

type ConstantFactory<T> = {
    ZERO: T;
    AUTO: T;
    MIN_CONTENT: T;
    MAX_CONTENT: T;
};

type FitContentFactory<T> =
    | { fitContent(argument: unknown): T }
    | { fit_content(argument: unknown): T };

type LengthFactory<T> =
    | { fromLength(value: number): T }
    | { from_length(value: number): T };

type PercentFactory<T> =
    | { fromPercent(value: number): T }
    | { from_percent(value: number): T };

export function zero(): 0;
export function zero<T>(factory: Pick<ConstantFactory<T>, "ZERO">): T;
export function zero<T>(factory: Pick<ConstantFactory<T>, "ZERO"> | undefined = undefined): 0 | T {
    return factory === undefined ? 0 : factory.ZERO;
}
export function auto<T>(factory: Pick<ConstantFactory<T>, "AUTO">): T {
    return factory.AUTO;
}
export function minContent<T>(factory: Pick<ConstantFactory<T>, "MIN_CONTENT">): T {
    return factory.MIN_CONTENT;
}
export function min_content<T>(factory: Pick<ConstantFactory<T>, "MIN_CONTENT">): T {
    return minContent(factory);
}
export function maxContent<T>(factory: Pick<ConstantFactory<T>, "MAX_CONTENT">): T {
    return factory.MAX_CONTENT;
}
export function max_content<T>(factory: Pick<ConstantFactory<T>, "MAX_CONTENT">): T {
    return maxContent(factory);
}
export function fitContent<T>(argument: unknown, factory: FitContentFactory<T>): T {
    return "fitContent" in factory ? factory.fitContent(argument) : factory.fit_content(argument);
}
export function fit_content<T>(argument: unknown, factory: FitContentFactory<T>): T {
    return fitContent(argument, factory);
}
export function length(value: number): number;
export function length<T>(value: number, factory: LengthFactory<T>): T;
export function length<T>(value: number, factory: LengthFactory<T> | undefined = undefined): number | T {
    if (factory === undefined)
        return value;
    return "fromLength" in factory ? factory.fromLength(value) : factory.from_length(value);
}
export function percent(value: number): number;
export function percent<T>(value: number, factory: PercentFactory<T>): T;
export function percent<T>(value: number, factory: PercentFactory<T> | undefined = undefined): number | T {
    if (factory === undefined)
        return value;
    return "fromPercent" in factory ? factory.fromPercent(value) : factory.from_percent(value);
}
