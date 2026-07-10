import { Point, Size } from "../geometry.js";
import { AvailableSpace, type AvailableSpaceValue } from "../style/available-space.js";
import { Clear, FloatDirection } from "../style/style.js";

type ClearValue = Clear;
type FloatDirectionValue = FloatDirection;
type FloatSlot = 0 | 1;
type Insets = [number, number];
type Range = { start: number; end: number };
type FloatSegment = { y: Range; insets: Insets };
type PlacedFloat = { width: number; height: number; y: number; xInset: number; x_inset: number };
type ContentSlot = {
    segmentId: number | undefined;
    segment_id: number | undefined;
    x: number;
    y: number;
    width: number;
    height: number;
};
type PlacementRange = { start: number; end: number };

class FloatFitter {
    bfcWidth: number;
    slotHeight: number;
    insets: Insets;
    constructor(bfcWidth: number, slotHeight: number, insets: Insets) {
        this.bfcWidth = bfcWidth;
        this.slotHeight = slotHeight;
        this.insets = insets;
    }
    unionInsets(insets: Insets): void {
        this.insets[0] = Math.max(this.insets[0], insets[0]);
        this.insets[1] = Math.max(this.insets[1], insets[1]);
    }
    fitsHorizontally(width: number): boolean {
        return ((this.insets[0] === 0 && this.insets[1] === 0) ||
            this.bfcWidth - this.insets[0] - this.insets[1] - width >= 0);
    }
    addHeight(height: number): void {
        this.slotHeight += height;
    }
    fitsVertically(height: number): boolean {
        return this.slotHeight >= height;
    }
    inset(slot: FloatSlot): number {
        return this.insets[slot];
    }
}
export class FloatContext {
    availableWidth = 0;
    containsFloats = false;
    placedLeftFloats: PlacedFloat[] = [];
    placedRightFloats: PlacedFloat[] = [];
    segments: FloatSegment[] = [];
    lastPlacedFloats: [PlacementRange, PlacementRange] = [
        { start: 0, end: 0 },
        { start: 0, end: 0 },
    ];
    static new() {
        return new FloatContext();
    }
    hasFloats(): boolean {
        return this.containsFloats;
    }
    has_floats(): boolean {
        return this.hasFloats();
    }
    hasActiveFloats(minY: number): boolean {
        return this.containsFloats && (this.segments.at(-1)?.y.end ?? 0) > minY;
    }
    has_active_floats(minY: number): boolean {
        return this.hasActiveFloats(minY);
    }
    setWidth(availableWidth: number): void {
        this.availableWidth = availableWidth;
    }
    set_width(availableWidth: number): void {
        this.setWidth(availableWidth);
    }
    leftFloats(): PlacedFloat[] {
        return [...this.placedLeftFloats];
    }
    left_floats(): PlacedFloat[] {
        return this.leftFloats();
    }
    rightFloats(): PlacedFloat[] {
        return [...this.placedRightFloats];
    }
    right_floats(): PlacedFloat[] {
        return this.rightFloats();
    }
    placeFloatedBox(floatedBox: Size, minY: number, containingBlockInsets: Insets, direction: FloatDirectionValue, clear: ClearValue): Point {
        this.containsFloats = true;
        const placedBox = this.placeFloatedBoxInner(floatedBox, minY, containingBlockInsets, direction, clear);
        if (direction === FloatDirection.Left) {
            this.placedLeftFloats.push(placedBox);
            return new Point(placedBox.xInset, placedBox.y);
        }
        this.placedRightFloats.push(placedBox);
        return new Point(this.availableWidth - placedBox.xInset - floatedBox.width, placedBox.y);
    }
    place_floated_box(floatedBox: Size, minY: number, containingBlockInsets: Insets, direction: FloatDirectionValue, clear: ClearValue): Point {
        return this.placeFloatedBox(floatedBox, minY, containingBlockInsets, direction, clear);
    }
    clearedThreshold(clear: ClearValue): number | undefined {
        const segment = this.clearedSegment(clear);
        if (segment === undefined)
            return undefined;
        return this.segments[Math.max(segment, 1) - 1]?.y.end;
    }
    cleared_threshold(clear: ClearValue): number | undefined {
        return this.clearedThreshold(clear);
    }
    findContentSlot(minY: number, containingBlockInsets: Insets, clear: ClearValue, after: number | undefined): ContentSlot {
        if (!this.hasActiveFloats(minY)) {
            return {
                segmentId: undefined,
                segment_id: undefined,
                x: containingBlockInsets[0],
                y: minY,
                width: this.availableWidth - containingBlockInsets[0] - containingBlockInsets[1],
                height: Number.POSITIVE_INFINITY,
            };
        }
        const atLeast = after === undefined ? 0 : after + 1;
        const clearedSegment = this.clearedSegment(clear);
        const hwm = Math.max(atLeast, clearedSegment === undefined ? 0 : clearedSegment + 1);
        const startIdx = this.segments.slice(hwm).findIndex((segment: FloatSegment) => segment.y.end > minY);
        const segment = this.segments[startIdx < 0 ? this.segments.length : startIdx + hwm];
        if (segment === undefined) {
            return {
                segmentId: undefined,
                segment_id: undefined,
                x: containingBlockInsets[0],
                y: minY,
                width: this.availableWidth - containingBlockInsets[0] - containingBlockInsets[1],
                height: Number.POSITIVE_INFINITY,
            };
        }
        const insetLeft = Math.max(segment.insets[0], containingBlockInsets[0]);
        const insetRight = Math.max(segment.insets[1], containingBlockInsets[1]);
        const segmentId = startIdx < 0 ? undefined : startIdx + hwm;
        return {
            segmentId,
            segment_id: segmentId,
            x: insetLeft,
            y: Math.max(segment.y.start, minY),
            width: this.availableWidth - insetLeft - insetRight,
            height: Number.POSITIVE_INFINITY,
        };
    }
    find_content_slot(minY: number, containingBlockInsets: Insets, clear: ClearValue, after: number | undefined): ContentSlot {
        return this.findContentSlot(minY, containingBlockInsets, clear, after);
    }
    placeFloatedBoxInner(floatedBox: Size, minY: number, containingBlockInsets: Insets, direction: FloatDirectionValue, clear: ClearValue): PlacedFloat {
        const slot = floatDirectionSlot(direction);
        const hwm = this.highWaterMark(slot, clear);
        const firstCandidate = this.segments.slice(hwm).findIndex((segment: FloatSegment) => segment.y.end > minY);
        let startIdx = firstCandidate < 0 ? this.segments.length : firstCandidate + hwm;
        let startY = minY;
        let endIdx = startIdx;
        let start: number | undefined;
        let end: number | undefined;
        let placedInset = containingBlockInsets[slot];
        search: while (true) {
            const startSegment = this.segments[startIdx];
            if (startSegment === undefined) {
                start = undefined;
                end = undefined;
                placedInset = containingBlockInsets[slot];
                break;
            }
            if (!segmentFitsFloatWidth(startSegment, floatedBox, direction, this.availableWidth)) {
                startIdx += 1;
                endIdx = Math.max(endIdx, startIdx);
                continue;
            }
            startY = Math.max(startY, startSegment.y.start);
            const availableHeight = startSegment.y.end - startY;
            const fitter = new FloatFitter(this.availableWidth, availableHeight, [
                containingBlockInsets[0],
                containingBlockInsets[1],
            ]);
            fitter.unionInsets(startSegment.insets);
            while (true) {
                const endSegment = this.segments[endIdx];
                if (endSegment === undefined) {
                    start = startIdx;
                    end = undefined;
                    placedInset = fitter.inset(slot);
                    break search;
                }
                fitter.unionInsets(endSegment.insets);
                if (!fitter.fitsHorizontally(floatedBox.width)) {
                    startIdx += 1;
                    endIdx = Math.max(endIdx, startIdx);
                    continue search;
                }
                if (endIdx !== startIdx) {
                    fitter.addHeight(endSegment.y.end - endSegment.y.start);
                }
                if (!fitter.fitsVertically(floatedBox.height)) {
                    endIdx += 1;
                    continue;
                }
                start = startIdx;
                end = endIdx;
                placedInset = fitter.inset(slot);
                break search;
            }
        }
        if (floatedBox.width === 0 || floatedBox.height === 0) {
            return {
                width: floatedBox.width,
                height: floatedBox.height,
                y: startY,
                xInset: placedInset,
                x_inset: placedInset,
            };
        }
        if (start === undefined) {
            const lastYEnd = this.segments.at(-1)?.y.end ?? 0;
            if (startY > lastYEnd) {
            this.segments.push({ y: { start: lastYEnd, end: startY }, insets: [0, 0] });
            }
            startY = Math.max(lastYEnd, startY);
            const insets: Insets = [containingBlockInsets[0], containingBlockInsets[1]];
            insets[slot] += floatedBox.width;
            this.segments.push({ y: { start: startY, end: startY + floatedBox.height }, insets });
            const newStartIdx = this.segments.length - 1;
            this.updateLastPlacedFloat(direction, { start: newStartIdx, end: newStartIdx + 1 });
            return {
                width: floatedBox.width,
                height: floatedBox.height,
                y: startY,
                xInset: containingBlockInsets[slot],
                x_inset: containingBlockInsets[slot],
            };
        }
        startIdx = start;
        if (startY !== this.segments[startIdx].y.start) {
            this.subdivideSegment(startIdx, startY);
            startIdx += 1;
            if (end !== undefined)
                end += 1;
        }
        const finalEndIdx = end === undefined
            ? this.endIndexForFloatBeyondSegments(minY)
            : this.endIndexAfterSubdivision(end, startY + floatedBox.height);
        const placedInsetPlusWidth = placedInset + floatedBox.width;
        for (let index = startIdx; index <= finalEndIdx; index += 1) {
            this.segments[index].insets[slot] = placedInsetPlusWidth;
        }
        this.updateLastPlacedFloat(direction, { start: startIdx, end: finalEndIdx + 1 });
        return {
            width: floatedBox.width,
            height: floatedBox.height,
            y: startY,
            xInset: placedInset,
            x_inset: placedInset,
        };
    }
    endIndexForFloatBeyondSegments(minY: number): number {
        const lastYEnd = this.segments.at(-1)?.y.end ?? 0;
        if (minY > lastYEnd) {
            this.segments.push({ y: { start: lastYEnd, end: minY }, insets: [0, 0] });
        }
        return this.segments.length - 1;
    }
    endIndexAfterSubdivision(endIdx: number, endY: number): number {
        if (endY !== this.segments[endIdx].y.end) {
            this.subdivideSegment(endIdx, endY);
        }
        return endIdx;
    }
    subdivideSegment(index: number, divideAtY: number): void {
        const oldSegment = this.segments[index];
        if (oldSegment === undefined)
            throw new Error("Float segment index is out of range");
        if (!rangeContains(oldSegment.y, divideAtY) || oldSegment.y.start === divideAtY) {
            throw new Error("Float segment can only be subdivided inside the segment range");
        }
        const newSegment = {
            y: { start: divideAtY, end: oldSegment.y.end },
            insets: [oldSegment.insets[0], oldSegment.insets[1]] as Insets,
        };
        oldSegment.y.end = divideAtY;
        this.segments.splice(index + 1, 0, newSegment);
    }
    updateLastPlacedFloat(direction: FloatDirectionValue, placement: PlacementRange): void {
        const slot = floatDirectionSlot(direction);
        this.lastPlacedFloats[slot].start = Math.max(this.lastPlacedFloats[slot].start, placement.start);
        this.lastPlacedFloats[slot].end = Math.max(this.lastPlacedFloats[slot].end, placement.end);
    }
    clearedSegment(clear: ClearValue): number | undefined {
        switch (clear) {
            case Clear.Left:
                return this.lastPlacedFloats[0].end;
            case Clear.Right:
                return this.lastPlacedFloats[1].end;
            case Clear.Both:
                return Math.max(this.lastPlacedFloats[0].end, this.lastPlacedFloats[1].end);
            case Clear.None:
                return undefined;
        }
    }
    highWaterMark(slot: FloatSlot, clear: ClearValue): number {
        const floatDirectionStart = this.lastPlacedFloats[slot].start;
        switch (clear) {
            case Clear.Left:
                return Math.max(floatDirectionStart, this.lastPlacedFloats[0].end + 1);
            case Clear.Right:
                return Math.max(floatDirectionStart, this.lastPlacedFloats[1].end + 1);
            case Clear.Both:
                return Math.max(this.lastPlacedFloats[0].end, this.lastPlacedFloats[1].end) + 1;
            case Clear.None:
                return floatDirectionStart;
        }
        return floatDirectionStart;
    }
}
export class FloatIntrinsicWidthCalculator {
    availableWidth: AvailableSpaceValue;
    contribution = 0;
    constructor(availableWidth: AvailableSpaceValue) {
        this.availableWidth = availableWidth;
    }
    static new(availableWidth: AvailableSpaceValue): FloatIntrinsicWidthCalculator {
        return new FloatIntrinsicWidthCalculator(availableWidth);
    }
    addFloat(width: number, _direction: FloatDirectionValue, _clear: ClearValue): void {
        switch (this.availableWidth.type) {
            case "Definite":
                return;
            case "MinContent":
                this.contribution = Math.max(this.contribution, width);
                return;
            case "MaxContent":
                this.contribution += width;
                return;
        }
    }
    add_float(width: number, direction: FloatDirectionValue, clear: ClearValue): void {
        this.addFloat(width, direction, clear);
    }
    result(): number {
        return this.contribution;
    }
}
function floatDirectionSlot(direction: FloatDirectionValue): FloatSlot {
    return direction === FloatDirection.Left ? 0 : 1;
}
function segmentFitsFloatWidth(segment: FloatSegment, floatedBox: Size, direction: FloatDirectionValue, bfcWidth: number): boolean {
    const slot = floatDirectionSlot(direction);
    return segment.insets[slot] === 0 || bfcWidth - floatedBox.width - segmentInsetSum(segment) >= 0;
}
function segmentInsetSum(segment: FloatSegment): number {
    return segment.insets[0] + segment.insets[1];
}
function rangeContains(range: Range, value: number): boolean {
    return range.start <= value && value < range.end;
}
