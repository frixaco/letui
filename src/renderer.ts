/** Direct TypeScript render pipeline: component tree -> Taffy layout -> terminal cells. */

import {
  AlignContent,
  AlignItems,
  AvailableSpace,
  BoxSizing,
  Dimension,
  FlexDirection,
  FlexWrap,
  LengthPercentage,
  LengthPercentageAuto,
  NodeId,
  Overflow,
  Point,
  Rect,
  Size,
  Style,
  TaffyTree,
  type AvailableSpaceValue,
  type Layout,
} from "../taffy-ts/dist/src/index.js";
import { getNodeRenderVersion, syncScrollViewMetrics } from "./components.ts";
import {
  CellBuffer,
  RESET_COLOR,
  Surface,
  fillHitmap,
  inheritedStyle,
  intersectRects,
  isEmptyRect,
  type ResolvedBorder,
  type SurfaceRect,
} from "./surface.ts";
import { textWidth, wrapText, type WrappedText } from "./text-layout.ts";
import {
  NODE_TYPE,
  type AlignItems as LetuiAlignItems,
  type AxisPair,
  type FlexWrap as LetuiFlexWrap,
  type JustifyContent,
  type Node,
  type NormalizedTextSpan,
  type ScrollViewNode,
  type TextOverflow,
  type TextWrap,
} from "./types.ts";

type RenderContext = {
  node: Node;
  text: string;
  spans: readonly NormalizedTextSpan[];
  foreground: number | undefined;
  background: number | undefined;
  border: ResolvedBorder;
  wrap: TextWrap;
  textOverflow: TextOverflow;
  scrollable: boolean;
  scrollY: number;
  measureCache?: Map<string, Size>;
  textLayoutCache?: Map<string, WrappedText>;
};

export type RenderResult = {
  hitmap: Uint32Array;
  scrollHitmap: Uint32Array;
  registry: Map<number, Node>;
  timings?: RenderTimings;
};

export type RenderTimings = {
  treeMs: number;
  layoutMs: number;
  measureMs: number;
  measureCount: number;
  framesMs: number;
  paintMs: number;
  rebuilt: boolean;
  nodeCount: number;
};

export class Renderer {
  private tree = TaffyTree.new();
  private rootId: NodeId<RenderContext> | null = null;
  private nodeIds = new Map<number, NodeId<RenderContext>>();
  private versions = new Map<number, number>();
  private layoutSnapshots = new Map<number, string>();
  private childSnapshots = new Map<number, number[]>();
  private width = 0;
  private height = 0;

  render(
    root: Node,
    width: number,
    height: number,
    buffer: CellBuffer,
    profile = false,
  ): RenderResult {
    let phaseStart = profile ? performance.now() : 0;
    let rebuilt = false;
    if (!this.rootId || !this.syncNodes(root, width, height)) {
      this.rebuild(root, width, height);
      rebuilt = true;
    }
    const treeMs = profile ? performance.now() - phaseStart : 0;

    const rootId = this.rootId;
    if (!rootId) throw new Error("Renderer has no root node");
    let measureMs = 0;
    let measureCount = 0;
    const measure = profile
      ? (...args: Parameters<typeof measureNode>): Size => {
          const started = performance.now();
          measureCount += 1;
          const measured = measureNode(...args);
          measureMs += performance.now() - started;
          return measured;
        }
      : measureNode;
    phaseStart = profile ? performance.now() : 0;
    this.tree.computeLayoutWithMeasure(
      rootId,
      new Size(AvailableSpace.definite(width), AvailableSpace.definite(height)),
      measure,
    );
    const layoutMs = profile ? performance.now() - phaseStart : 0;

    phaseStart = profile ? performance.now() : 0;
    const hitmap = new Uint32Array(width * height);
    const scrollHitmap = new Uint32Array(width * height);
    const registry = new Map<number, Node>();
    this.updateFrames(rootId, 0, 0, registry);
    const framesMs = profile ? performance.now() - phaseStart : 0;

    phaseStart = profile ? performance.now() : 0;
    buffer.clear();
    const surface = new Surface(buffer);
    const rootContext = this.tree.getNodeContext(rootId)!;
    const rootLayout = this.tree.layout(rootId);
    const rootRect = { x: 0, y: 0, width: rootLayout.size.width, height: rootLayout.size.height };
    const viewport = { x: 0, y: 0, width, height };
    const rootForeground = rootContext.foreground ?? RESET_COLOR;
    const rootBackground = rootContext.background ?? RESET_COLOR;
    surface.drawBackground(rootRect, viewport, rootBackground);
    this.paintNode(
      rootId,
      rootForeground,
      rootBackground,
      surface,
      hitmap,
      scrollHitmap,
      rootRect,
      viewport,
    );
    const paintMs = profile ? performance.now() - phaseStart : 0;
    return {
      hitmap,
      scrollHitmap,
      registry,
      timings: profile
        ? {
            treeMs,
            layoutMs,
            measureMs,
            measureCount,
            framesMs,
            paintMs,
            rebuilt,
            nodeCount: registry.size,
          }
        : undefined,
    };
  }

  private rebuild(root: Node, width: number, height: number): void {
    this.tree = TaffyTree.new();
    this.nodeIds.clear();
    this.versions.clear();
    this.layoutSnapshots.clear();
    this.childSnapshots.clear();
    this.rootId = this.insertNode(root, width, height, true);
    this.width = width;
    this.height = height;
  }

  private insertNode(
    node: Node,
    width: number,
    height: number,
    isRoot = false,
  ): NodeId<RenderContext> {
    const children = node.children?.() ?? [];
    const childIds = children.map((child) => this.insertNode(child, width, height));
    const resolved = resolveNode(node, isRoot ? { width, height } : undefined);
    const id = this.tree.newWithChildren(
      resolved.style,
      childIds,
    ) as unknown as NodeId<RenderContext>;
    this.tree.setNodeContext(id, resolved.context);
    this.nodeIds.set(node.id, id);
    this.versions.set(node.id, getNodeRenderVersion(node));
    this.layoutSnapshots.set(node.id, resolved.layoutSnapshot);
    this.childSnapshots.set(
      node.id,
      children.map((child) => child.id),
    );
    return id;
  }

  private syncNodes(root: Node, width: number, height: number): boolean {
    const rootResized = width !== this.width || height !== this.height;
    const visit = (node: Node, isRoot = false): boolean => {
      const id = this.nodeIds.get(node.id);
      if (!id) return false;
      const children = node.children?.() ?? [];
      if (!sameNodeIds(this.childSnapshots.get(node.id), children)) return false;

      const version = getNodeRenderVersion(node);
      if (version !== this.versions.get(node.id) || (isRoot && rootResized)) {
        const resolved = resolveNode(node, isRoot ? { width, height } : undefined);
        if (resolved.layoutSnapshot !== this.layoutSnapshots.get(node.id)) {
          this.tree.setStyle(id, resolved.style);
          this.tree.setNodeContext(id, resolved.context);
          this.layoutSnapshots.set(node.id, resolved.layoutSnapshot);
        } else {
          const context = this.tree.getNodeContext(id);
          if (context) {
            const measureCache = context.measureCache;
            const textLayoutCache =
              context.spans === resolved.context.spans ? context.textLayoutCache : undefined;
            Object.assign(context, resolved.context);
            context.measureCache = measureCache;
            context.textLayoutCache = textLayoutCache;
          }
        }
        this.versions.set(node.id, version);
      }
      for (const child of children) {
        if (!visit(child)) return false;
      }
      return true;
    };
    const matched = visit(root, true);
    if (matched) {
      this.width = width;
      this.height = height;
    }
    return matched;
  }

  private updateFrames(
    id: NodeId<RenderContext>,
    offsetX: number,
    offsetY: number,
    registry: Map<number, Node>,
  ): void {
    const layout = this.tree.layout(id);
    const context = this.tree.getNodeContext(id)!;
    const node = context.node;
    const x = offsetX + layout.location.x;
    const y = offsetY + layout.location.y;
    node.frame.x = x;
    node.frame.y = y;
    node.frame.width = layout.size.width;
    node.frame.height = layout.size.height;
    node.contentFrame.x = offsetX + layout.contentBoxX();
    node.contentFrame.y = offsetY + layout.contentBoxY();
    node.contentFrame.width = layout.contentBoxWidth();
    node.contentFrame.height = layout.contentBoxHeight();
    node.frameWidth(node.frame.width);
    node.frameHeight(node.frame.height);
    registry.set(node.id, node);

    if (context.scrollable) {
      syncScrollViewMetrics(node as ScrollViewNode, {
        viewportHeight: node.contentFrame.height,
        maxScrollY: layout.scrollHeight(),
      });
    }
    for (const child of this.tree.children(id))
      this.updateFrames(child as NodeId<RenderContext>, x, y, registry);
  }

  private paintNode(
    id: NodeId<RenderContext>,
    parentForeground: number,
    parentBackground: number,
    surface: Surface,
    hitmap: Uint32Array,
    scrollHitmap: Uint32Array,
    origin: SurfaceRect,
    viewport: SurfaceRect,
  ): void {
    if (isEmptyRect(viewport)) return;
    const layout = this.tree.layout(id);
    const context = this.tree.getNodeContext(id)!;
    const rect = {
      x: origin.x + layout.location.x,
      y: origin.y + layout.location.y,
      width: layout.size.width,
      height: layout.size.height,
    };
    const contentRect = {
      x: origin.x + layout.contentBoxX(),
      y: origin.y + layout.contentBoxY(),
      width: layout.contentBoxWidth(),
      height: layout.contentBoxHeight(),
    };
    const visibleRect = intersectRects(rect, viewport);
    if (!visibleRect) return;
    const contentClip = intersectRects(viewport, contentRect);
    const style = inheritedStyle(
      context.foreground,
      context.background,
      parentForeground,
      parentBackground,
    );
    surface.drawBackground(rect, viewport, style.background);
    surface.drawBorder(rect, viewport, context.border, style.background);

    if (context.node.type === NODE_TYPE.Input) {
      const wrapped = layoutText(
        context,
        contentRect.width,
        contentRect.height,
        context.wrap,
        "clip",
      );
      if (contentClip) {
        wrapped.lines.forEach((line, index) =>
          surface.drawText(
            { x: contentRect.x, y: contentRect.y + index, width: contentRect.width, height: 1 },
            contentClip,
            line.text,
            style,
            [],
          ),
        );
        if (context.node.isFocused()) {
          const lastLine = wrapped.lines[wrapped.lines.length - 1];
          const cursorRow = Math.max(0, wrapped.lines.length - 1);
          const cursorColumn = Math.min(
            textWidth(lastLine?.text ?? ""),
            Math.max(1, contentRect.width) - 1,
          );
          surface.drawCursor(
            { x: contentRect.x, y: contentRect.y + cursorRow, width: contentRect.width, height: 1 },
            contentClip,
            cursorColumn,
            style,
          );
        }
      }
    } else if (context.node.type === NODE_TYPE.Text) {
      const wrapped = layoutText(
        context,
        contentRect.width,
        contentRect.height,
        context.wrap,
        context.textOverflow,
      );
      if (contentClip)
        wrapped.lines.forEach((line, index) =>
          surface.drawText(
            { x: contentRect.x, y: contentRect.y + index, width: contentRect.width, height: 1 },
            contentClip,
            line.text,
            style,
            line.spans,
          ),
        );
    } else if (context.node.type === NODE_TYPE.Button && contentClip) {
      surface.drawText(contentRect, contentClip, context.text, style, []);
    }

    const { width, height } = surface.buffer;
    if (context.node.type === NODE_TYPE.Input || context.node.type === NODE_TYPE.Button) {
      fillHitmap(hitmap, width, height, visibleRect, context.node.id);
    }
    if (context.scrollable) fillHitmap(scrollHitmap, width, height, visibleRect, context.node.id);

    let childOrigin = rect;
    let childViewport = viewport;
    if (context.scrollable) {
      const clipped = intersectRects(viewport, contentRect);
      if (!clipped) return;
      childViewport = clipped;
      childOrigin = { ...rect, y: rect.y - sanitizeScrollY(layout, context.scrollY) };
    }
    for (const child of this.tree.children(id)) {
      this.paintNode(
        child as NodeId<RenderContext>,
        style.foreground,
        style.background,
        surface,
        hitmap,
        scrollHitmap,
        childOrigin,
        childViewport,
      );
    }
  }
}

function resolveNode(
  node: Node,
  rootSize?: { width: number; height: number },
): { style: Style; context: RenderContext; layoutSnapshot: string } {
  const props = node.props as any;
  const [paddingX, paddingY] = resolveAxes(
    props.padding?.(),
    props.paddingX?.(),
    props.paddingY?.(),
  );
  const [marginX, marginY] = resolveAxes(props.margin?.(), props.marginX?.(), props.marginY?.());
  const border = resolveBorder(props);
  const scrollable =
    node.type === NODE_TYPE.Column &&
    (props.overflow?.() === true || props.overflow?.() === "scroll");
  const text = supportsText(node) ? (props.text?.() ?? "") : "";
  const styledText = node.type === NODE_TYPE.Text ? props.styledText?.() : undefined;
  const direction = props.direction?.() ?? (node.type === NODE_TYPE.Row ? "row" : "column");
  const flexGrow =
    node.type === NODE_TYPE.Input && (props.flexGrow?.() ?? 0) === 0
      ? 1
      : (props.flexGrow?.() ?? 0);
  const context: RenderContext = {
    node,
    text,
    spans: styledText?.spans ?? [],
    foreground: props.foreground?.(),
    background: props.background?.(),
    border,
    wrap: props.wrap?.() ?? (node.type === NODE_TYPE.Text ? "word" : "none"),
    textOverflow: props.textOverflow?.() ?? "clip",
    scrollable,
    scrollY: finiteNumber(props.scrollY?.(), 0),
  };
  const style = new Style({
    gap: new Size(LengthPercentage.length(finiteNumber(props.gap?.(), 0)), LengthPercentage.zero()),
    padding: new Rect(
      LengthPercentage.length(paddingX),
      LengthPercentage.length(paddingX),
      LengthPercentage.length(paddingY),
      LengthPercentage.length(paddingY),
    ),
    border: new Rect(
      LengthPercentage.length(border.left.width),
      LengthPercentage.length(border.right.width),
      LengthPercentage.length(border.top.width),
      LengthPercentage.length(border.bottom.width),
    ),
    margin: new Rect(
      LengthPercentageAuto.length(marginX),
      LengthPercentageAuto.length(marginX),
      LengthPercentageAuto.length(marginY),
      LengthPercentageAuto.length(marginY),
    ),
    flexGrow,
    flexShrink: finiteNumber(props.flexShrink?.(), 1),
    size: new Size(
      dimension(rootSize?.width ?? props.width?.()),
      dimension(rootSize?.height ?? props.height?.()),
    ),
    minSize: new Size(dimension(props.minWidth?.()), dimension(props.minHeight?.())),
    maxSize: new Size(dimension(props.maxWidth?.()), dimension(props.maxHeight?.())),
    flexBasis: dimension(props.flexBasis?.()),
    flexWrap: resolveFlexWrap(props.flexWrap?.()),
    alignItems:
      resolveAlignItems(props.alignItems?.()) ??
      (node.type === NODE_TYPE.Column ? AlignItems.Stretch : undefined),
    justifyContent: resolveJustifyContent(props.justifyContent?.()),
    alignSelf: resolveAlignItems(props.alignSelf?.()),
    boxSizing: props.boxSizing?.() === "contentBox" ? BoxSizing.ContentBox : BoxSizing.BorderBox,
    flexDirection: resolveDirection(direction),
    overflow:
      node.type === NODE_TYPE.Column
        ? new Point(
            scrollable ? Overflow.Clip : Overflow.Hidden,
            scrollable ? Overflow.Scroll : Overflow.Hidden,
          )
        : new Point(Overflow.Visible, Overflow.Visible),
    scrollbarWidth: 0,
  });
  const layoutSnapshot = JSON.stringify({
    paddingX,
    paddingY,
    marginX,
    marginY,
    border: [border.top.width, border.right.width, border.bottom.width, border.left.width],
    text,
    wrap: context.wrap,
    textOverflow: context.textOverflow,
    scrollable,
    direction,
    flexGrow,
    rootSize,
    gap: props.gap?.(),
    flexShrink: props.flexShrink?.(),
    width: props.width?.(),
    height: props.height?.(),
    minWidth: props.minWidth?.(),
    minHeight: props.minHeight?.(),
    maxWidth: props.maxWidth?.(),
    maxHeight: props.maxHeight?.(),
    flexBasis: props.flexBasis?.(),
    flexWrap: props.flexWrap?.(),
    alignItems: props.alignItems?.(),
    justifyContent: props.justifyContent?.(),
    alignSelf: props.alignSelf?.(),
    boxSizing: props.boxSizing?.(),
  });
  return { style, context, layoutSnapshot };
}

function measureNode(
  known: Size,
  available: Size,
  _id: NodeId<RenderContext>,
  context: RenderContext | undefined,
): Size {
  if (known.width !== undefined && known.height !== undefined)
    return new Size(known.width, known.height);
  if (!context || !supportsText(context.node)) return Size.zero();
  const cacheKey = measurementKey(known, available);
  const measureCache = (context.measureCache ??= new Map());
  const cached = measureCache.get(cacheKey);
  if (cached) return cached;
  const maxWidth =
    available.width?.type === "Definite"
      ? Math.max(0, available.width.value)
      : Number.POSITIVE_INFINITY;
  const maxHeight =
    available.height?.type === "Definite"
      ? Math.max(0, available.height.value)
      : Number.POSITIVE_INFINITY;
  const wrap = context.node.type === NODE_TYPE.Button ? "none" : context.wrap;
  const overflow = context.node.type === NODE_TYPE.Text ? context.textOverflow : "clip";
  const wrapped = layoutText(context, maxWidth, maxHeight, wrap, overflow);
  const measuredWidth = wrapped.lines.reduce((max, line) => Math.max(max, textWidth(line.text)), 0);
  const measured = new Size(known.width ?? measuredWidth, known.height ?? wrapped.lines.length);
  measureCache.set(cacheKey, measured);
  return measured;
}

function layoutText(
  context: RenderContext,
  maxWidth: number,
  maxHeight: number,
  wrap: TextWrap,
  overflow: TextOverflow,
): WrappedText {
  const cache = (context.textLayoutCache ??= new Map());
  const key = `${maxWidth}:${maxHeight}:${wrap}:${overflow}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const wrapped = wrapText(context.text, context.spans, maxWidth, maxHeight, wrap, overflow);
  cache.set(key, wrapped);
  return wrapped;
}

function measurementKey(known: Size, available: Size): string {
  return `${known.width ?? "u"}:${known.height ?? "u"}|${availableSpaceKey(available.width)}:${availableSpaceKey(available.height)}`;
}

function availableSpaceKey(space: AvailableSpaceValue | undefined): string {
  if (!space) return "u";
  return space.type === "Definite" ? `d${space.value}` : space.type;
}

function resolveAxes(
  pair: AxisPair | undefined,
  x: number | undefined,
  y: number | undefined,
): [number, number] {
  let pairX = 0;
  let pairY = 0;
  if (typeof pair === "number") pairX = pairY = finiteNumber(pair, 0);
  else if (typeof pair === "string") {
    const values = pair.trim().split(/\s+/).map(Number);
    pairY = finiteNumber(values[0], 0);
    pairX = finiteNumber(values[1], pairY);
  }
  return [finiteNumber(x, pairX), finiteNumber(y, pairY)];
}

function sameNodeIds(previous: number[] | undefined, children: readonly Node[]): boolean {
  return (
    previous !== undefined &&
    previous.length === children.length &&
    previous.every((id, index) => id === children[index]?.id)
  );
}

function resolveBorder(props: any): ResolvedBorder {
  const all = props.border?.();
  const top = props.borderTop?.();
  const right = props.borderRight?.();
  const bottom = props.borderBottom?.();
  const left = props.borderLeft?.();
  const topColor = top?.color ?? all?.color;
  const rightColor = right?.color ?? all?.color;
  const bottomColor = bottom?.color ?? all?.color;
  const leftColor = left?.color ?? all?.color;
  const hasOverride =
    top !== undefined || right !== undefined || bottom !== undefined || left !== undefined;
  return {
    top: { width: topColor === undefined ? 0 : 1, color: topColor ?? RESET_COLOR },
    right: { width: rightColor === undefined ? 0 : 1, color: rightColor ?? RESET_COLOR },
    bottom: { width: bottomColor === undefined ? 0 : 1, color: bottomColor ?? RESET_COLOR },
    left: { width: leftColor === undefined ? 0 : 1, color: leftColor ?? RESET_COLOR },
    style: all && !hasOverride ? (all.style === "rounded" ? "rounded" : "square") : "none",
  };
}

function resolveAlignItems(value: LetuiAlignItems | undefined): AlignItems | undefined {
  switch (value) {
    case "start":
      return AlignItems.Start;
    case "end":
      return AlignItems.End;
    case "flexStart":
      return AlignItems.FlexStart;
    case "flexEnd":
      return AlignItems.FlexEnd;
    case "center":
      return AlignItems.Center;
    case "baseline":
      return AlignItems.Baseline;
    case "stretch":
      return AlignItems.Stretch;
    default:
      return undefined;
  }
}

function resolveJustifyContent(value: JustifyContent | undefined): AlignContent | undefined {
  switch (value) {
    case "start":
      return AlignContent.Start;
    case "end":
      return AlignContent.End;
    case "flexStart":
      return AlignContent.FlexStart;
    case "flexEnd":
      return AlignContent.FlexEnd;
    case "center":
      return AlignContent.Center;
    case "stretch":
      return AlignContent.Stretch;
    case "spaceBetween":
      return AlignContent.SpaceBetween;
    case "spaceEvenly":
      return AlignContent.SpaceEvenly;
    case "spaceAround":
      return AlignContent.SpaceAround;
    default:
      return undefined;
  }
}

function resolveFlexWrap(value: LetuiFlexWrap | undefined): FlexWrap {
  if (value === "wrap") return FlexWrap.Wrap;
  if (value === "wrapReverse") return FlexWrap.WrapReverse;
  return FlexWrap.NoWrap;
}

function resolveDirection(value: string): FlexDirection {
  if (value === "row") return FlexDirection.Row;
  if (value === "rowReverse") return FlexDirection.RowReverse;
  if (value === "columnReverse") return FlexDirection.ColumnReverse;
  return FlexDirection.Column;
}

function dimension(value: unknown): Dimension {
  return typeof value === "number" && Number.isFinite(value)
    ? Dimension.length(value)
    : Dimension.auto();
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function supportsText(node: Node): boolean {
  return (
    node.type === NODE_TYPE.Text || node.type === NODE_TYPE.Input || node.type === NODE_TYPE.Button
  );
}

function sanitizeScrollY(layout: Layout, requested: number): number {
  return Math.floor(
    Math.min(Number.isFinite(requested) && requested > 0 ? requested : 0, layout.scrollHeight()),
  );
}
