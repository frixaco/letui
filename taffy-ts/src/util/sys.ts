export function newVecWithCapacity<T = never>(_capacity: number): T[] {
    return [];
}
export const new_vec_with_capacity = newVecWithCapacity;
export function singleValueVec<T>(value: T): T[] {
    return [value];
}
export const single_value_vec = singleValueVec;
export function round(value: number): number {
    const fraction = value % 1;
    if (Number.isNaN(fraction) || Object.is(fraction, 0))
        return value;
    if (value > 0) {
        return fraction < 0.5 ? value - fraction : value - fraction + 1;
    }
    return -fraction < 0.5 ? value - fraction : value - fraction - 1;
}
export function ceil(value: number): number {
    return Math.ceil(value);
}
export function floor(value: number): number {
    return Math.floor(value);
}
export function abs(value: number): number {
    return Math.abs(value);
}
export function f32Max(left: number, right: number): number {
    if (Number.isNaN(left))
        return right;
    if (Number.isNaN(right))
        return left;
    return Math.max(left, right);
}
export const f32_max = f32Max;
export function f32Min(left: number, right: number): number {
    if (Number.isNaN(left))
        return right;
    if (Number.isNaN(right))
        return left;
    return Math.min(left, right);
}
export const f32_min = f32Min;
