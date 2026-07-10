import { Size } from "../geometry.js";
import { AvailableSpace } from "../style/available-space.js";
import type { AvailableSpaceValue } from "../style/available-space.js";
import { f32Max, f32Min } from "./sys.js";

type MaybeNumber = number | undefined;

export function maybeMin(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : f32Min(left, right);
}
export function maybe_min(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    return maybeMin(left, right);
}
export function maybeMax(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : f32Max(left, right);
}
export function maybe_max(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    return maybeMax(left, right);
}
export function maybeClamp(value: MaybeNumber, min: MaybeNumber, max: MaybeNumber): MaybeNumber {
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
export function maybe_clamp(value: MaybeNumber, min: MaybeNumber, max: MaybeNumber): MaybeNumber {
    return maybeClamp(value, min, max);
}
export function maybeAdd(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : left + right;
}
export function maybe_add(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    return maybeAdd(left, right);
}
export function maybeSub(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    if (left === undefined)
        return undefined;
    return right === undefined ? left : left - right;
}
export function maybe_sub(left: MaybeNumber, right: MaybeNumber): MaybeNumber {
    return maybeSub(left, right);
}
export function maybeClampSize(value: Size, min: Size, max: Size): Size {
    return new Size(maybeClamp(value.width, min.width, max.width) ?? value.width, maybeClamp(value.height, min.height, max.height) ?? value.height);
}
export function maybe_clamp_size(value: Size, min: Size, max: Size): Size {
    return maybeClampSize(value, min, max);
}
export function maybeMinSize(value: Size, rhs: Size): Size {
    return new Size(maybeMin(value.width, rhs.width) ?? value.width, maybeMin(value.height, rhs.height) ?? value.height);
}
export function maybe_min_size(value: Size, rhs: Size): Size {
    return maybeMinSize(value, rhs);
}
export function maybeMaxSize(value: Size, rhs: Size): Size {
    return new Size(maybeMax(value.width, rhs.width) ?? value.width, maybeMax(value.height, rhs.height) ?? value.height);
}
export function maybe_max_size(value: Size, rhs: Size): Size {
    return maybeMaxSize(value, rhs);
}
export function maybeAddSize(value: Size, rhs: Size): Size {
    return new Size(maybeAdd(value.width, rhs.width) ?? value.width, maybeAdd(value.height, rhs.height) ?? value.height);
}
export function maybe_add_size(value: Size, rhs: Size): Size {
    return maybeAddSize(value, rhs);
}
export function maybeSubSize(value: Size, rhs: Size): Size {
    return new Size(maybeSub(value.width, rhs.width) ?? value.width, maybeSub(value.height, rhs.height) ?? value.height);
}
export function maybe_sub_size(value: Size, rhs: Size): Size {
    return maybeSubSize(value, rhs);
}
export function maybeClampOptionalSize(value: Size, min: Size, max: Size): Size {
    return new Size(maybeClamp(value.width, min.width, max.width), maybeClamp(value.height, min.height, max.height));
}
export function maybe_clamp_optional_size(value: Size, min: Size, max: Size): Size {
    return maybeClampOptionalSize(value, min, max);
}
export function maybeAddOptionalSize(value: Size, rhs: Size): Size {
    return new Size(maybeAdd(value.width, rhs.width), maybeAdd(value.height, rhs.height));
}
export function maybe_add_optional_size(value: Size, rhs: Size): Size {
    return maybeAddOptionalSize(value, rhs);
}
export function maybeSubOptionalSize(value: Size, rhs: Size): Size {
    return new Size(maybeSub(value.width, rhs.width), maybeSub(value.height, rhs.height));
}
export function maybe_sub_optional_size(value: Size, rhs: Size): Size {
    return maybeSubOptionalSize(value, rhs);
}
export function maybeMinOptionalSize(value: Size, rhs: Size): Size {
    return new Size(maybeMin(value.width, rhs.width), maybeMin(value.height, rhs.height));
}
export function maybe_min_optional_size(value: Size, rhs: Size): Size {
    return maybeMinOptionalSize(value, rhs);
}
export function maybeMaxOptionalSize(value: Size, rhs: Size): Size {
    return new Size(maybeMax(value.width, rhs.width), maybeMax(value.height, rhs.height));
}
export function maybe_max_optional_size(value: Size, rhs: Size): Size {
    return maybeMaxOptionalSize(value, rhs);
}
export function availableSpaceMaybeMin(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    if (space.type === "Definite") {
        const value = space.value as number;
        return AvailableSpace.definite(rhs === undefined ? value : f32Min(value, rhs));
    }
    return rhs === undefined ? space : AvailableSpace.definite(rhs);
}
export function available_space_maybe_min(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeMin(space, rhs);
}
export function availableSpaceMaybeMax(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    if (space.type === "Definite") {
        const value = space.value as number;
        return AvailableSpace.definite(rhs === undefined ? value : f32Max(value, rhs));
    }
    return space;
}
export function available_space_maybe_max(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeMax(space, rhs);
}
export function availableSpaceMaybeClamp(space: AvailableSpaceValue, min: MaybeNumber, max: MaybeNumber): AvailableSpaceValue {
    return space.type === "Definite"
        ? AvailableSpace.definite(maybeClamp(space.value as number, min, max) ?? space.value)
        : space;
}
export function available_space_maybe_clamp(space: AvailableSpaceValue, min: MaybeNumber, max: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeClamp(space, min, max);
}
export function availableSpaceMaybeAdd(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return space.type === "Definite"
        ? AvailableSpace.definite(rhs === undefined ? space.value : (space.value as number) + rhs)
        : space;
}
export function available_space_maybe_add(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeAdd(space, rhs);
}
export function availableSpaceMaybeSub(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return space.type === "Definite"
        ? AvailableSpace.definite(rhs === undefined ? space.value : (space.value as number) - rhs)
        : space;
}
export function available_space_maybe_sub(space: AvailableSpaceValue, rhs: MaybeNumber): AvailableSpaceValue {
    return availableSpaceMaybeSub(space, rhs);
}
