import { $, type Signal } from "./signals";
import type { BoxNode, Node } from "./types";

export type VirtualListSlice = {
  itemIndex: number;
  itemTopCutRows: number;
  itemBottomCutRows: number;
};

export type VirtualListSlot<TSlot extends Node = Node> = {
  node: TSlot;
  itemIndex: number | null;
  measuredRows: number;
};

export type VirtualListVisibleSlot<TSlot extends Node = Node> = {
  slot: VirtualListSlot<TSlot>;
  slice: VirtualListSlice;
};

export type VirtualListRenderWindow = {
  startItemIndex: number;
  endItemIndexExclusive: number;
  totalContentRows: number;
  maxScrollRows: number;
  viewportRows: number;
  scrollRows: number;
};

export type VirtualListOptions<TSlot extends Node = Node> = {
  container: BoxNode;
  createSlot: (slotIndex: number) => TSlot;
  overscanRows?: number;
  wheelRowsPerStep?: number;
};

type HeightLookup = (itemIndex: number) => number;

type WindowSlice = {
  itemIndex: number;
  itemTopCutRows: number;
  itemBottomCutRows: number;
};

type ComputedWindow = {
  slices: WindowSlice[];
  startItemIndex: number;
  endItemIndexExclusive: number;
  totalContentRows: number;
  maxScrollRows: number;
  viewportRows: number;
  scrollRows: number;
};

const DEFAULT_OVERSCAN_ROWS = 4;
const DEFAULT_WHEEL_ROWS_PER_STEP = 3;
const RUNAWAY_OVERSCAN_GROWTH_LIMIT = 2;

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensurePositiveRows(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function ensureNonNegativeRows(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function buildPrefixSums(itemCount: number, getRows: HeightLookup): number[] {
  const prefix: number[] = new Array(itemCount + 1);
  prefix[0] = 0;
  for (let i = 0; i < itemCount; i++) {
    const prev = prefix[i] ?? 0;
    prefix[i + 1] = prev + ensurePositiveRows(getRows(i));
  }
  return prefix;
}

function findFirstVisibleItem(prefix: readonly number[], row: number): number {
  const itemCount = Math.max(0, prefix.length - 1);
  if (itemCount === 0) return 0;

  let left = 0;
  let right = itemCount - 1;
  let answer = itemCount - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const nextStart = prefix[mid + 1] ?? 0;
    if (nextStart > row) {
      answer = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return answer;
}

function computeWindow(
  itemCount: number,
  viewportRows: number,
  scrollRows: number,
  overscanRows: number,
  getRows: HeightLookup,
): ComputedWindow {
  if (itemCount <= 0) {
    return {
      slices: [],
      startItemIndex: 0,
      endItemIndexExclusive: 0,
      totalContentRows: 0,
      maxScrollRows: 0,
      viewportRows,
      scrollRows: 0,
    };
  }

  const prefix = buildPrefixSums(itemCount, getRows);
  const totalContentRows = prefix[itemCount] ?? 0;
  const maxScrollRows = Math.max(0, totalContentRows - viewportRows);
  const clampedScrollRows = clamp(0, scrollRows, maxScrollRows);
  const topRow = Math.max(0, clampedScrollRows - overscanRows);
  const bottomRow = Math.min(totalContentRows, clampedScrollRows + viewportRows + overscanRows);

  const firstVisible = findFirstVisibleItem(prefix, topRow);
  const slices: WindowSlice[] = [];

  let itemIndex = firstVisible;
  while (itemIndex < itemCount) {
    const itemStartRow = prefix[itemIndex] ?? 0;
    if (itemStartRow >= bottomRow) {
      break;
    }

    const itemEndRow = prefix[itemIndex + 1] ?? itemStartRow;
    const itemRows = Math.max(1, itemEndRow - itemStartRow);
    const topCut = Math.max(0, topRow - itemStartRow);
    const visibleBottom = Math.min(itemEndRow, bottomRow);
    const visibleRows = Math.max(0, visibleBottom - (itemStartRow + topCut));
    if (visibleRows <= 0) {
      itemIndex += 1;
      continue;
    }

    const bottomCut = Math.max(0, itemRows - topCut - visibleRows);
    slices.push({
      itemIndex,
      itemTopCutRows: topCut,
      itemBottomCutRows: bottomCut,
    });
    itemIndex += 1;
  }

  const startItemIndex = slices[0]?.itemIndex ?? itemCount;
  const endItemIndexExclusive =
    slices.length > 0
      ? (slices[slices.length - 1]?.itemIndex ?? (itemCount - 1)) + 1
      : startItemIndex;

  return {
    slices,
    startItemIndex,
    endItemIndexExclusive,
    totalContentRows,
    maxScrollRows,
    viewportRows,
    scrollRows: clampedScrollRows,
  };
}

export class VirtualListController<TSlot extends Node = Node> {
  readonly scrollRowsSignal: Signal<number>;

  private readonly container: BoxNode;
  private readonly createSlot: (slotIndex: number) => TSlot;
  private activeOverscanRows: number;
  private readonly wheelRowsPerStep: number;
  private readonly slots: VirtualListSlot<TSlot>[] = [];

  private itemCount = 0;
  private fallbackMeasuredRows = 1;
  private readonly itemRows = new Map<number, number>();
  private lastViewportRowsForPool = 0;
  private runawayOverscanGrowthCount = 0;
  private warnedRunawayOverscan = false;

  private scrollRowsFloat = 0;
  private scrollRows = 0;
  private lastWindow: ComputedWindow = {
    slices: [],
    startItemIndex: 0,
    endItemIndexExclusive: 0,
    totalContentRows: 0,
    maxScrollRows: 0,
    viewportRows: 1,
    scrollRows: 0,
  };

  constructor(options: VirtualListOptions<TSlot>) {
    this.container = options.container;
    this.createSlot = options.createSlot;
    this.activeOverscanRows = ensureNonNegativeRows(options.overscanRows ?? DEFAULT_OVERSCAN_ROWS);
    this.wheelRowsPerStep = Math.max(
      0.1,
      options.wheelRowsPerStep ?? DEFAULT_WHEEL_ROWS_PER_STEP,
    );
    this.scrollRowsSignal = $(0);

    this.container.handlers.onWheel = (event) => this.onWheel(event.deltaY);
  }

  setItemCount(count: number): void {
    this.itemCount = Math.max(0, Math.floor(count));

    if (this.itemCount === 0) {
      this.itemRows.clear();
      this.scrollRows = 0;
      this.scrollRowsFloat = 0;
      this.scrollRowsSignal(0);
      return;
    }

    for (const key of this.itemRows.keys()) {
      if (key >= this.itemCount) {
        this.itemRows.delete(key);
      }
    }

    this.clampScrollToContent();
    this.scrollRowsSignal(this.scrollRows);
  }

  setMeasuredRows(itemIndex: number, measuredRows: number): void {
    if (itemIndex < 0 || itemIndex >= this.itemCount) return;
    const rows = ensurePositiveRows(measuredRows);
    this.itemRows.set(itemIndex, rows);
    this.fallbackMeasuredRows = Math.max(1, rows);
  }

  setScrollRows(nextScrollRows: number): void {
    if (!Number.isFinite(nextScrollRows)) return;
    this.scrollRowsFloat = Math.max(0, nextScrollRows);
    this.scrollRows = Math.floor(this.scrollRowsFloat);
    this.clampScrollToContent();
    this.scrollRowsSignal(this.scrollRows);
  }

  scrollToEnd(): void {
    const maxScrollRows = this.computeMaxScrollRows();
    this.scrollRows = maxScrollRows;
    this.scrollRowsFloat = maxScrollRows;
    this.scrollRowsSignal(this.scrollRows);
  }

  onWheel(deltaY: number): boolean {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return false;
    }

    const maxScrollRows = this.computeMaxScrollRows();
    if (maxScrollRows <= 0) {
      return false;
    }

    this.scrollRowsFloat += deltaY * this.wheelRowsPerStep;
    this.scrollRowsFloat = clamp(0, this.scrollRowsFloat, maxScrollRows);

    const nextScroll = Math.floor(this.scrollRowsFloat);
    if (nextScroll === this.scrollRows) {
      return false;
    }

    this.scrollRows = nextScroll;
    this.scrollRowsSignal(this.scrollRows);
    return true;
  }

  render(
    bindSlot: (
      slot: VirtualListSlot<TSlot>,
      slice: VirtualListSlice | null,
    ) => void,
  ): {
    visibleSlots: VirtualListVisibleSlot<TSlot>[];
    window: VirtualListRenderWindow;
    slots: readonly VirtualListSlot<TSlot>[];
  } {
    this.syncSlotPool();
    this.lastWindow = computeWindow(
      this.itemCount,
      this.viewportRows(),
      this.scrollRows,
      this.activeOverscanRows,
      (itemIndex) => this.getItemRows(itemIndex),
    );

    this.scrollRows = this.lastWindow.scrollRows;
    this.scrollRowsFloat = this.scrollRows;
    this.scrollRowsSignal(this.scrollRows);

    const visibleSlots: VirtualListVisibleSlot<TSlot>[] = [];
    for (let slotIndex = 0; slotIndex < this.slots.length; slotIndex++) {
      const slot = this.slots[slotIndex]!;
      const slice = this.lastWindow.slices[slotIndex] ?? null;

      if (slice) {
        slot.itemIndex = slice.itemIndex;
        slot.measuredRows = this.getItemRows(slice.itemIndex);
        visibleSlots.push({ slot, slice });
      } else {
        slot.itemIndex = null;
        slot.measuredRows = this.fallbackMeasuredRows;
      }

      bindSlot(slot, slice);
    }

    return {
      visibleSlots,
      window: {
        startItemIndex: this.lastWindow.startItemIndex,
        endItemIndexExclusive: this.lastWindow.endItemIndexExclusive,
        totalContentRows: this.lastWindow.totalContentRows,
        maxScrollRows: this.lastWindow.maxScrollRows,
        viewportRows: this.lastWindow.viewportRows,
        scrollRows: this.lastWindow.scrollRows,
      },
      slots: this.slots,
    };
  }

  private viewportRows(): number {
    return Math.max(1, Math.floor(this.container.frameHeight()));
  }

  private getItemRows(itemIndex: number): number {
    return ensurePositiveRows(this.itemRows.get(itemIndex) ?? this.fallbackMeasuredRows);
  }

  private computeMaxScrollRows(): number {
    const prefix = buildPrefixSums(this.itemCount, (itemIndex) => this.getItemRows(itemIndex));
    const totalContentRows = prefix[this.itemCount] ?? 0;
    return Math.max(0, totalContentRows - this.viewportRows());
  }

  private clampScrollToContent(): void {
    const maxScrollRows = this.computeMaxScrollRows();
    this.scrollRows = clamp(0, this.scrollRows, maxScrollRows);
    this.scrollRowsFloat = clamp(0, this.scrollRowsFloat, maxScrollRows);
  }

  private detectRunawayOverscan(viewportRows: number): void {
    if (this.activeOverscanRows <= 0) {
      this.runawayOverscanGrowthCount = 0;
      return;
    }

    if (this.slots.length === 0 || this.lastViewportRowsForPool <= 0) {
      this.runawayOverscanGrowthCount = 0;
      return;
    }

    const expectedGrowth = this.activeOverscanRows * 2;
    const actualGrowth = viewportRows - this.lastViewportRowsForPool;

    if (actualGrowth === expectedGrowth) {
      this.runawayOverscanGrowthCount += 1;
    } else {
      this.runawayOverscanGrowthCount = 0;
    }

    if (this.runawayOverscanGrowthCount < RUNAWAY_OVERSCAN_GROWTH_LIMIT) {
      return;
    }

    this.activeOverscanRows = 0;
    this.runawayOverscanGrowthCount = 0;

    if (this.warnedRunawayOverscan) {
      return;
    }

    this.warnedRunawayOverscan = true;
    // Guard against slot-pool feedback loops in flow layouts (virtual rows changing
    // container height, which then requests even more slots).
    console.warn(
      "[letui/virtual-list] Overscan caused repeated viewport growth; overscan disabled for stability. " +
        "Use a fixed-height viewport if you need overscan.",
    );
  }

  private syncSlotPool(): void {
    const viewportRows = this.viewportRows();
    this.detectRunawayOverscan(viewportRows);

    const neededSlots = Math.max(1, viewportRows + this.activeOverscanRows * 2);
    if (neededSlots === this.slots.length) {
      this.lastViewportRowsForPool = viewportRows;
      return;
    }

    this.slots.length = 0;
    for (let i = 0; i < neededSlots; i++) {
      this.slots.push({
        node: this.createSlot(i),
        itemIndex: null,
        measuredRows: this.fallbackMeasuredRows,
      });
    }

    this.container.setChildren(this.slots.map((slot) => slot.node));
    this.lastViewportRowsForPool = viewportRows;
  }
}

export function createVirtualListController<TSlot extends Node = Node>(
  options: VirtualListOptions<TSlot>,
): VirtualListController<TSlot> {
  return new VirtualListController(options);
}
