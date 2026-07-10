import { Size } from "../geometry.js";
import { parseError } from "../util/parse.js";

export type AvailableSpaceValue =
    | { type: "Definite"; value: number }
    | { type: "MinContent" }
    | { type: "MaxContent" };

type MaybeNumber = number | undefined;

type AvailableSpaceApi = {
    readonly ZERO: AvailableSpaceValue;
    readonly MIN_CONTENT: AvailableSpaceValue;
    readonly MAX_CONTENT: AvailableSpaceValue;
    definite(value: number): AvailableSpaceValue;
    fromLength(value: number): AvailableSpaceValue;
    from_length(value: number): AvailableSpaceValue;
    fromString(input: string): AvailableSpaceValue;
    from_string(input: string): AvailableSpaceValue;
    minContent(): AvailableSpaceValue;
    min_content(): AvailableSpaceValue;
    maxContent(): AvailableSpaceValue;
    max_content(): AvailableSpaceValue;
    fromOption(value: MaybeNumber): AvailableSpaceValue;
    from_option(value: MaybeNumber): AvailableSpaceValue;
    isDefinite(space: AvailableSpaceValue): boolean;
    is_definite(space: AvailableSpaceValue): boolean;
    intoOption(space: AvailableSpaceValue): MaybeNumber;
    into_option(space: AvailableSpaceValue): MaybeNumber;
    unwrapOr(space: AvailableSpaceValue, fallback: number): number;
    unwrap_or(space: AvailableSpaceValue, fallback: number): number;
    unwrap(space: AvailableSpaceValue): number;
    or(space: AvailableSpaceValue, fallback: AvailableSpaceValue): AvailableSpaceValue;
    orElse(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue;
    or_else(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue;
    unwrapOrElse(space: AvailableSpaceValue, fallback: () => number): number;
    unwrap_or_else(space: AvailableSpaceValue, fallback: () => number): number;
    maybeSet(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue;
    maybe_set(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue;
    mapDefiniteValue(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue;
    map_definite_value(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue;
    computeFreeSpace(space: AvailableSpaceValue, usedSpace: number): number;
    compute_free_space(space: AvailableSpaceValue, usedSpace: number): number;
    isRoughlyEqual(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean;
    is_roughly_equal(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean;
};

type AvailableSpaceSizeApi = {
    readonly ZERO: Size;
    readonly MIN_CONTENT: Size;
    readonly MAX_CONTENT: Size;
    zero(): Size;
    maxContent(): Size;
    max_content(): Size;
    minContent(): Size;
    min_content(): Size;
    intoOptions(size: Size): Size;
    into_options(size: Size): Size;
    maybeSet(size: Size, value: Size): Size;
    maybe_set(size: Size, value: Size): Size;
};

export const AvailableSpace: AvailableSpaceApi = {
    get ZERO() {
        return AvailableSpace.definite(0);
    },
    get MIN_CONTENT() {
        return AvailableSpace.minContent();
    },
    get MAX_CONTENT() {
        return AvailableSpace.maxContent();
    },
    definite(value: number): AvailableSpaceValue {
        return { type: "Definite", value };
    },
    fromLength(value: number): AvailableSpaceValue {
        return AvailableSpace.definite(value);
    },
    from_length(value: number): AvailableSpaceValue {
        return AvailableSpace.fromLength(value);
    },
    fromString(input: string): AvailableSpaceValue {
        return availableSpaceFromString(input);
    },
    from_string(input: string): AvailableSpaceValue {
        return AvailableSpace.fromString(input);
    },
    minContent(): AvailableSpaceValue {
        return { type: "MinContent" };
    },
    min_content(): AvailableSpaceValue {
        return AvailableSpace.minContent();
    },
    maxContent(): AvailableSpaceValue {
        return { type: "MaxContent" };
    },
    max_content(): AvailableSpaceValue {
        return AvailableSpace.maxContent();
    },
    fromOption(value: MaybeNumber): AvailableSpaceValue {
        return value === undefined ? AvailableSpace.maxContent() : AvailableSpace.definite(value);
    },
    from_option(value: MaybeNumber): AvailableSpaceValue {
        return AvailableSpace.fromOption(value);
    },
    isDefinite(space: AvailableSpaceValue): boolean {
        return availableSpaceIsDefinite(space);
    },
    is_definite(space: AvailableSpaceValue): boolean {
        return AvailableSpace.isDefinite(space);
    },
    intoOption(space: AvailableSpaceValue): MaybeNumber {
        return availableSpaceIntoOption(space);
    },
    into_option(space: AvailableSpaceValue): MaybeNumber {
        return AvailableSpace.intoOption(space);
    },
    unwrapOr(space: AvailableSpaceValue, fallback: number): number {
        return availableSpaceUnwrapOr(space, fallback);
    },
    unwrap_or(space: AvailableSpaceValue, fallback: number): number {
        return AvailableSpace.unwrapOr(space, fallback);
    },
    unwrap(space: AvailableSpaceValue): number {
        return availableSpaceUnwrap(space);
    },
    or(space: AvailableSpaceValue, fallback: AvailableSpaceValue): AvailableSpaceValue {
        return availableSpaceOr(space, fallback);
    },
    orElse(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue {
        return availableSpaceOrElse(space, fallback);
    },
    or_else(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue {
        return AvailableSpace.orElse(space, fallback);
    },
    unwrapOrElse(space: AvailableSpaceValue, fallback: () => number): number {
        return availableSpaceUnwrapOrElse(space, fallback);
    },
    unwrap_or_else(space: AvailableSpaceValue, fallback: () => number): number {
        return AvailableSpace.unwrapOrElse(space, fallback);
    },
    maybeSet(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue {
        return availableSpaceMaybeSet(space, value);
    },
    maybe_set(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue {
        return AvailableSpace.maybeSet(space, value);
    },
    mapDefiniteValue(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue {
        return availableSpaceMapDefiniteValue(space, map);
    },
    map_definite_value(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue {
        return AvailableSpace.mapDefiniteValue(space, map);
    },
    computeFreeSpace(space: AvailableSpaceValue, usedSpace: number): number {
        return availableSpaceComputeFreeSpace(space, usedSpace);
    },
    compute_free_space(space: AvailableSpaceValue, usedSpace: number): number {
        return AvailableSpace.computeFreeSpace(space, usedSpace);
    },
    isRoughlyEqual(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean {
        return availableSpaceIsRoughlyEqual(left, right);
    },
    is_roughly_equal(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean {
        return AvailableSpace.isRoughlyEqual(left, right);
    },
};
export function availableSpaceFromString(input: string): AvailableSpaceValue {
    const trimmed = input.trim();
    if (trimmed === "min-content")
        return AvailableSpace.minContent();
    if (trimmed === "max-content")
        return AvailableSpace.maxContent();
    const numeric = /^([+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?))(?:[a-z_][a-z0-9_-]*)?$/i.exec(trimmed);
    if (numeric !== null && !trimmed.endsWith("%")) {
        const value = Number(numeric[1]);
        if (value >= 0)
            return AvailableSpace.definite(value);
    }
    throw parseError("AvailableSpace", input);
}
export function available_space_from_string(input: string): AvailableSpaceValue {
    return availableSpaceFromString(input);
}
export function availableSpaceIsDefinite(space: AvailableSpaceValue): boolean {
    return space.type === "Definite";
}
export function available_space_is_definite(space: AvailableSpaceValue): boolean {
    return availableSpaceIsDefinite(space);
}
export function availableSpaceIntoOption(space: AvailableSpaceValue): MaybeNumber {
    return space.type === "Definite" ? space.value : undefined;
}
export function available_space_into_option(space: AvailableSpaceValue): MaybeNumber {
    return availableSpaceIntoOption(space);
}
export function availableSpaceUnwrapOr(space: AvailableSpaceValue, fallback: number): number {
    return availableSpaceIntoOption(space) ?? fallback;
}
export function available_space_unwrap_or(space: AvailableSpaceValue, fallback: number): number {
    return availableSpaceUnwrapOr(space, fallback);
}
export function availableSpaceUnwrap(space: AvailableSpaceValue): number {
    if (space.type !== "Definite") {
        throw new Error("AvailableSpace is not definite");
    }
    return space.value;
}
export function available_space_unwrap(space: AvailableSpaceValue): number {
    return availableSpaceUnwrap(space);
}
export function availableSpaceOr(space: AvailableSpaceValue, fallback: AvailableSpaceValue): AvailableSpaceValue {
    return space.type === "Definite" ? space : fallback;
}
export function available_space_or(space: AvailableSpaceValue, fallback: AvailableSpaceValue): AvailableSpaceValue {
    return availableSpaceOr(space, fallback);
}
export function availableSpaceOrElse(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue {
    return space.type === "Definite" ? space : fallback();
}
export function available_space_or_else(space: AvailableSpaceValue, fallback: () => AvailableSpaceValue): AvailableSpaceValue {
    return availableSpaceOrElse(space, fallback);
}
export function availableSpaceUnwrapOrElse(space: AvailableSpaceValue, fallback: () => number): number {
    return space.type === "Definite" ? space.value : fallback();
}
export function available_space_unwrap_or_else(space: AvailableSpaceValue, fallback: () => number): number {
    return availableSpaceUnwrapOrElse(space, fallback);
}
export function availableSpaceMaybeSet(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue {
    return value === undefined ? space : AvailableSpace.definite(value);
}
export function available_space_maybe_set(space: AvailableSpaceValue, value: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeSet(space, value);
}
export function availableSpaceMapDefiniteValue(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue {
    return space.type === "Definite" ? AvailableSpace.definite(map(space.value)) : space;
}
export function available_space_map_definite_value(space: AvailableSpaceValue, map: (value: number) => number): AvailableSpaceValue {
    return availableSpaceMapDefiniteValue(space, map);
}
export function availableSpaceComputeFreeSpace(space: AvailableSpaceValue, usedSpace: number): number {
    switch (space.type) {
        case "Definite":
            return space.value - usedSpace;
        case "MinContent":
            return 0;
        case "MaxContent":
            return Number.POSITIVE_INFINITY;
    }
}
export function available_space_compute_free_space(space: AvailableSpaceValue, usedSpace: number): number {
    return availableSpaceComputeFreeSpace(space, usedSpace);
}
export function availableSpaceIsRoughlyEqual(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean {
    if (left.type === "Definite" && right.type === "Definite") {
        return Math.abs(left.value - right.value) < Number.EPSILON;
    }
    return left.type === right.type;
}
export function available_space_is_roughly_equal(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean {
    return availableSpaceIsRoughlyEqual(left, right);
}
export function sizeAvailableSpaceIntoOptions(size: Size): Size {
    return new Size(availableSpaceIntoOption(size.width), availableSpaceIntoOption(size.height));
}
export function size_available_space_into_options(size: Size): Size {
    return sizeAvailableSpaceIntoOptions(size);
}
export function sizeAvailableSpaceMaybeSet(size: Size, value: Size): Size {
    return new Size(availableSpaceMaybeSet(size.width, value.width), availableSpaceMaybeSet(size.height, value.height));
}
export function size_available_space_maybe_set(size: Size, value: Size): Size {
    return sizeAvailableSpaceMaybeSet(size, value);
}
export const AvailableSpaceSize: AvailableSpaceSizeApi = {
    get ZERO() {
        return AvailableSpaceSize.zero();
    },
    get MIN_CONTENT() {
        return AvailableSpaceSize.minContent();
    },
    get MAX_CONTENT() {
        return AvailableSpaceSize.maxContent();
    },
    zero() {
        return new Size(AvailableSpace.definite(0), AvailableSpace.definite(0));
    },
    maxContent() {
        return new Size(AvailableSpace.maxContent(), AvailableSpace.maxContent());
    },
    max_content() {
        return AvailableSpaceSize.maxContent();
    },
    minContent() {
        return new Size(AvailableSpace.minContent(), AvailableSpace.minContent());
    },
    min_content() {
        return AvailableSpaceSize.minContent();
    },
    intoOptions(size: Size): Size {
        return sizeAvailableSpaceIntoOptions(size);
    },
    into_options(size: Size): Size {
        return AvailableSpaceSize.intoOptions(size);
    },
    maybeSet(size: Size, value: Size): Size {
        return sizeAvailableSpaceMaybeSet(size, value);
    },
    maybe_set(size: Size, value: Size): Size {
        return AvailableSpaceSize.maybeSet(size, value);
    },
};
