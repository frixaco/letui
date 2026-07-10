import { Size } from "../geometry.js";
import { availableSpaceIsRoughlyEqual } from "../style/available-space.js";
import { LayoutInput, LayoutOutput, RunMode } from "./layout.js";
const CACHE_SIZE = 9;

type AvailableSpaceValue =
    | { type: "Definite"; value: number }
    | { type: "MinContent" }
    | { type: "MaxContent" };

type CacheEntry<TContent> = {
    knownDimensions: Size;
    availableSpace: Size;
    content: TContent;
};

export enum ClearState {
    Cleared = "Cleared",
    AlreadyEmpty = "AlreadyEmpty",
}

export class Cache {
    finalLayoutEntry?: CacheEntry<LayoutOutput>;
    measureEntries: Array<Array<CacheEntry<Size>>>;
    measureEntryMap = new Map<string, CacheEntry<Size>>();
    empty: boolean = true;
    static new() {
        return new Cache();
    }
    static default() {
        return Cache.new();
    }
    constructor() {
        this.measureEntries = Array.from({ length: CACHE_SIZE }, () => []);
    }
    get(input: LayoutInput): LayoutOutput | undefined {
        const knownDimensions = input.knownDimensions;
        const availableSpace = input.availableSpace;
        switch (input.runMode) {
            case RunMode.PerformLayout:
                if (this.finalLayoutEntry === undefined)
                    return undefined;
                if (cacheEntryMatchesExactly(this.finalLayoutEntry, knownDimensions, availableSpace)) {
                    return this.finalLayoutEntry.content;
                }
                if (cacheEntryMatches(this.finalLayoutEntry, knownDimensions, availableSpace, this.finalLayoutEntry.content.size))
                    return this.finalLayoutEntry.content;
                return undefined;
            case RunMode.ComputeSize:
                {
                    const exactEntry = this.measureEntryMap.get(cacheEntryKey(knownDimensions, availableSpace));
                    if (exactEntry !== undefined)
                        return LayoutOutput.fromOuterSize(exactEntry.content);
                }
                for (const entries of this.measureEntries) {
                    for (const entry of entries) {
                        if (cacheEntryMatches(entry, knownDimensions, availableSpace, entry.content)) {
                            return LayoutOutput.fromOuterSize(entry.content);
                        }
                    }
                }
                return undefined;
            case RunMode.PerformHiddenLayout:
                return undefined;
        }
    }
    getExact(input: LayoutInput): LayoutOutput | undefined {
        const knownDimensions = input.knownDimensions;
        const availableSpace = input.availableSpace;
        switch (input.runMode) {
            case RunMode.PerformLayout:
                if (this.finalLayoutEntry === undefined)
                    return undefined;
                return cacheEntryMatchesExactly(this.finalLayoutEntry, knownDimensions, availableSpace)
                    ? this.finalLayoutEntry.content
                    : undefined;
            case RunMode.ComputeSize:
                {
                    const exactEntry = this.measureEntryMap.get(cacheEntryKey(knownDimensions, availableSpace));
                    return exactEntry === undefined ? undefined : LayoutOutput.fromOuterSize(exactEntry.content);
                }
            case RunMode.PerformHiddenLayout:
                return undefined;
        }
    }
    store(input: LayoutInput, layoutOutput: LayoutOutput): void {
        const knownDimensions = input.knownDimensions;
        const availableSpace = input.availableSpace;
        switch (input.runMode) {
            case RunMode.PerformLayout:
                this.empty = false;
                this.finalLayoutEntry = { knownDimensions, availableSpace, content: layoutOutput };
                break;
            case RunMode.ComputeSize:
                this.empty = false;
                {
                    const key = cacheEntryKey(knownDimensions, availableSpace);
                    if (this.measureEntryMap.has(key))
                        break;
                    const entry = { knownDimensions, availableSpace, content: layoutOutput.size };
                    this.measureEntryMap.set(key, entry);
                    this.measureEntries[computeCacheSlot(knownDimensions, availableSpace)].push(entry);
                }
                break;
            case RunMode.PerformHiddenLayout:
                break;
        }
    }
    clear(): ClearState {
        if (this.empty) {
            return ClearState.AlreadyEmpty;
        }
        this.empty = true;
        this.finalLayoutEntry = undefined;
        this.measureEntries = Array.from({ length: CACHE_SIZE }, () => []);
        this.measureEntryMap.clear();
        return ClearState.Cleared;
    }
    isEmpty(): boolean {
        return this.finalLayoutEntry === undefined && this.measureEntryMap.size === 0;
    }
    is_empty() {
        return this.isEmpty();
    }
}
function cacheEntryKey(knownDimensions: Size, availableSpace: Size): string {
    return `${knownDimensions.width ?? ""},${knownDimensions.height ?? ""}|${availableSpaceKey(availableSpace.width)},${availableSpaceKey(availableSpace.height)}`;
}
function availableSpaceKey(space: AvailableSpaceValue): string {
    return space.type === "Definite" ? `Definite:${space.value}` : space.type;
}
function computeCacheSlot(knownDimensions: Size, availableSpace: Size): number {
    const hasKnownWidth = knownDimensions.width !== undefined;
    const hasKnownHeight = knownDimensions.height !== undefined;
    if (hasKnownWidth && hasKnownHeight)
        return 0;
    if (hasKnownWidth && !hasKnownHeight)
        return 1 + (availableSpace.height.type === "MinContent" ? 1 : 0);
    if (hasKnownHeight && !hasKnownWidth)
        return 3 + (availableSpace.width.type === "MinContent" ? 1 : 0);
    if (availableSpace.width.type !== "MinContent" && availableSpace.height.type !== "MinContent")
        return 5;
    if (availableSpace.width.type !== "MinContent" && availableSpace.height.type === "MinContent")
        return 6;
    if (availableSpace.width.type === "MinContent" && availableSpace.height.type !== "MinContent")
        return 7;
    return 8;
}
function cacheEntryMatchesExactly<TContent>(entry: CacheEntry<TContent>, knownDimensions: Size, availableSpace: Size): boolean {
    return (knownDimensions.width === entry.knownDimensions.width &&
        knownDimensions.height === entry.knownDimensions.height &&
        availableSpaceMatchesExactly(availableSpace.width, entry.availableSpace.width) &&
        availableSpaceMatchesExactly(availableSpace.height, entry.availableSpace.height));
}
function availableSpaceMatchesExactly(left: AvailableSpaceValue, right: AvailableSpaceValue): boolean {
    if (left.type !== right.type)
        return false;
    return left.type !== "Definite" || right.type !== "Definite" || left.value === right.value;
}
function cacheEntryMatches<TContent>(entry: CacheEntry<TContent>, knownDimensions: Size, availableSpace: Size, cachedSize: Size): boolean {
    return ((knownDimensions.width === entry.knownDimensions.width ||
        knownDimensions.width === cachedSize.width) &&
        (knownDimensions.height === entry.knownDimensions.height ||
            knownDimensions.height === cachedSize.height) &&
        (knownDimensions.width !== undefined ||
            availableSpaceIsRoughlyEqual(entry.availableSpace.width, availableSpace.width)) &&
        (knownDimensions.height !== undefined ||
            availableSpaceIsRoughlyEqual(entry.availableSpace.height, availableSpace.height)));
}
