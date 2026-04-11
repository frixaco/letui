/**
 * Runtime bridge that diffs the TS tree, syncs Rust ops, and drives terminal I/O.
 */

import { toArrayBuffer, type Pointer } from "bun:ffi";
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import api from "./ffi";
import { $, ff, type Signal } from "./signals";
import { getFocusedNode, getFocusVersion } from "./components";
import { dispatchInputChunk } from "./input";
import { NODE_TYPE, type Node, type NodeKind, type NormalizedStyledText } from "./types";
import {
  EMITTED_STYLE_PROPS,
  OpQueue,
  getDeleteTextRangeOpSize,
  getSetTextOpSize,
  type StylePropName,
  type StylePropValue,
} from "./ops";
import {
  startFrame,
  endFrame,
  startPhase,
  endJs,
  endRender,
  endSync,
  endFlush,
  formatMetrics,
  resolveMetricsPath,
} from "./metrics";
import { logWriter } from "./debug";

export type RunOptions = {
  debug?: boolean;
};

export type ScrollEvent = {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  target: Node | undefined;
};

export function run(root: Node, options?: RunOptions): { quit: () => void } {
  if (api.init_buffer() !== 1) {
    throw new Error("Failed to initialize letui buffer");
  }
  if (api.init_letui() !== 1) {
    api.free_buffer();
    throw new Error("Failed to initialize letui terminal");
  }
  api.clear_tree_state();

  terminalWidth = $(api.get_width());
  terminalHeight = $(api.get_height());
  globalKeyHandlers = globalKeyHandlers ?? new Map();
  globalScrollHandlers = globalScrollHandlers ?? new Set();
  nodeRegistry = new Map();
  ops = new OpQueue();
  previousSentTree = null;
  spatialLookup = new Uint32Array(terminalWidth() * terminalHeight());
  pressedNodeId = null;
  isRunning = true;
  let cleanedUp = false;

  const stdinHandler = (data: Buffer) => handleInput(data.toString());
  const writeDebugMetrics = () => {
    if (!options?.debug) return;
    const metricsPath = resolveMetricsPath();
    ensureParentDir(metricsPath);
    const stats = formatMetrics();
    writeFileSync(metricsPath, stats + "\n", "utf8");
    console.log(stats);
    logWriter.flush();
  };
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    isRunning = false;
    process.stdin.off("data", stdinHandler);
    process.stdout.off("resize", handleResize);
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    process.off("uncaughtException", handleUncaughtException);
    process.off("unhandledRejection", handleUnhandledRejection);

    try {
      api.clear_tree_state();
    } catch {}
    previousSentTree = null;

    try {
      api.free_buffer();
    } catch {}

    try {
      api.deinit_letui();
    } catch {}

    writeDebugMetrics();
  };
  const exitWith = (code: number, error?: unknown) => {
    cleanup();
    if (error) {
      console.error(error);
    }
    process.exit(code);
  };
  const handleSigint = () => exitWith(130);
  const handleSigterm = () => exitWith(143);
  const handleUncaughtException = (error: unknown) => exitWith(1, error);
  const handleUnhandledRejection = (reason: unknown) => exitWith(1, reason);

  process.stdin.on("data", stdinHandler);

  process.stdout.on("resize", handleResize);
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);
  process.on("uncaughtException", handleUncaughtException);
  process.on("unhandledRejection", handleUnhandledRejection);

  ff(() => {
    if (!isRunning) return;

    terminalWidth();
    terminalHeight();
    getFocusVersion();

    const frameStart = options?.debug ? startFrame() : 0;
    const jsStart = options?.debug ? startPhase() : 0;

    nodeRegistry.clear();
    const sentTree = buildSentNodeState(root);

    const textStats: TextOpStats = { opCount: 0, byteCount: 0 };
    if (!previousSentTree || !hasSameNodeShape(previousSentTree, sentTree)) {
      api.clear_tree_state();
      queueFullTreeInsert(sentTree, textStats);
      ops.setRoot(sentTree.id);
    } else {
      syncRenderTree(previousSentTree, sentTree, textStats);
    }
    const opBuffer = ops.drain();
    if (opBuffer.length > 0) {
      api.apply_ops(opBuffer, opBuffer.length);
    }
    if (options?.debug) {
      endJs(jsStart, {
        textOps: textStats.opCount,
        textBytes: textStats.byteCount,
        ffiBytes: opBuffer.length,
      });
    }
    previousSentTree = sentTree;

    const renderStart = options?.debug ? startPhase() : 0;
    api.render();
    if (options?.debug) endRender(renderStart);

    const syncStart = options?.debug ? startPhase() : 0;
    updateNodeFrames(root);
    if (options?.debug) endSync(syncStart);

    const flushStart = options?.debug ? startPhase() : 0;
    api.flush();
    if (options?.debug) endFlush(flushStart);

    if (options?.debug) endFrame(frameStart);
  });

  quitFn = () => {
    cleanup();
    process.exit(0);
  };

  return { quit: quitFn };
}

export function onKey(key: string, callback: () => void): void {
  if (!globalKeyHandlers) {
    globalKeyHandlers = new Map();
  }
  globalKeyHandlers.set(key, callback);
}

export function onScroll(callback: (event: ScrollEvent) => void): void {
  if (!globalScrollHandlers) {
    globalScrollHandlers = new Set();
  }
  globalScrollHandlers.add(callback);
}

type SentStyleState = Partial<Record<StylePropName, StylePropValue>>;

type SentNodeState = {
  id: number;
  type: NodeKind;
  style: SentStyleState;
  text: string;
  styledText: NormalizedStyledText | undefined;
  children: SentNodeState[];
};

type TextOpStats = {
  opCount: number;
  byteCount: number;
};

type ResolvedBorderState = {
  topWidth?: 1;
  rightWidth?: 1;
  bottomWidth?: 1;
  leftWidth?: 1;
  topColor?: number;
  rightColor?: number;
  bottomColor?: number;
  leftColor?: number;
  style?: "square" | "rounded";
};

const MOUSE_EVENT_PATTERN = /\x1b\[<\d+;\d+;\d+[Mm]/g;

function buildSentNodeState(node: Node): SentNodeState {
  const text =
    node.type === NODE_TYPE.Text || node.type === NODE_TYPE.Input || node.type === NODE_TYPE.Button
      ? ((node.props as any).text?.() ?? "")
      : "";
  const styledText = node.type === NODE_TYPE.Text ? (node.props as any).styledText?.() : undefined;
  const children = node.children?.() ?? [];

  return {
    id: node.id,
    type: node.type,
    style: readSentStyleState(node),
    text,
    styledText,
    children: children.map(buildSentNodeState),
  };
}

function hasSameNodeShape(previous: SentNodeState, current: SentNodeState): boolean {
  if (previous.id !== current.id || previous.type !== current.type) {
    return false;
  }

  if (previous.children.length !== current.children.length) {
    return false;
  }

  for (let i = 0; i < previous.children.length; i++) {
    const previousChild = previous.children[i];
    const currentChild = current.children[i];
    if (!previousChild || !currentChild) {
      return false;
    }
    if (!hasSameNodeShape(previousChild, currentChild)) {
      return false;
    }
  }

  return true;
}

function readSentStyleState(node: Node): SentStyleState {
  const style: SentStyleState = {};
  const props = node.props as any;

  const gap = props.gap?.();
  if (gap !== undefined && gap !== 0) {
    style.gap = gap;
  }

  const padding = props.padding?.();
  if (padding !== undefined && padding !== 0) {
    style.padding = padding;
  }

  const paddingX = props.paddingX?.();
  if (paddingX !== undefined && paddingX !== 0) {
    style.paddingX = paddingX;
  }

  const paddingY = props.paddingY?.();
  if (paddingY !== undefined && paddingY !== 0) {
    style.paddingY = paddingY;
  }

  const border = resolveBorderState(props);
  if (border.topWidth !== undefined) {
    style.borderTopWidth = border.topWidth;
  }
  if (border.rightWidth !== undefined) {
    style.borderRightWidth = border.rightWidth;
  }
  if (border.bottomWidth !== undefined) {
    style.borderBottomWidth = border.bottomWidth;
  }
  if (border.leftWidth !== undefined) {
    style.borderLeftWidth = border.leftWidth;
  }
  if (border.topColor !== undefined) {
    style.borderTopColor = border.topColor;
  }
  if (border.rightColor !== undefined) {
    style.borderRightColor = border.rightColor;
  }
  if (border.bottomColor !== undefined) {
    style.borderBottomColor = border.bottomColor;
  }
  if (border.leftColor !== undefined) {
    style.borderLeftColor = border.leftColor;
  }
  if (border.style !== undefined) {
    style.borderStyle = border.style;
  }

  const background = props.background?.();
  if (background !== undefined) {
    style.background = background;
  }

  const foreground = props.foreground?.();
  if (foreground !== undefined) {
    style.foreground = foreground;
  }

  const flexGrow = props.flexGrow?.();
  if (flexGrow !== undefined && flexGrow !== 0) {
    style.flexGrow = flexGrow;
  }

  const direction = props.direction?.();
  if (
    direction !== undefined &&
    !(
      (node.type === NODE_TYPE.Row && direction === "row") ||
      (node.type === NODE_TYPE.Column && direction === "column")
    )
  ) {
    style.direction = direction;
  }

  const width = props.width?.();
  if (width !== undefined) {
    style.width = width;
  }

  const height = props.height?.();
  if (height !== undefined) {
    style.height = height;
  }

  const minWidth = props.minWidth?.();
  if (minWidth !== undefined) {
    style.minWidth = minWidth;
  }

  const minHeight = props.minHeight?.();
  if (minHeight !== undefined) {
    style.minHeight = minHeight;
  }

  const maxWidth = props.maxWidth?.();
  if (maxWidth !== undefined) {
    style.maxWidth = maxWidth;
  }

  const maxHeight = props.maxHeight?.();
  if (maxHeight !== undefined) {
    style.maxHeight = maxHeight;
  }

  const margin = props.margin?.();
  if (margin !== undefined && margin !== 0) {
    style.margin = margin;
  }

  const marginX = props.marginX?.();
  if (marginX !== undefined && marginX !== 0) {
    style.marginX = marginX;
  }

  const marginY = props.marginY?.();
  if (marginY !== undefined && marginY !== 0) {
    style.marginY = marginY;
  }

  const alignItems = props.alignItems?.();
  if (alignItems !== undefined) {
    style.alignItems = alignItems;
  }

  const justifyContent = props.justifyContent?.();
  if (justifyContent !== undefined) {
    style.justifyContent = justifyContent;
  }

  const alignSelf = props.alignSelf?.();
  if (alignSelf !== undefined) {
    style.alignSelf = alignSelf;
  }

  const flexShrink = props.flexShrink?.();
  if (flexShrink !== undefined && flexShrink !== 1) {
    style.flexShrink = flexShrink;
  }

  const flexBasis = props.flexBasis?.();
  if (flexBasis !== undefined) {
    style.flexBasis = flexBasis;
  }

  const flexWrap = props.flexWrap?.();
  if (flexWrap !== undefined && flexWrap !== "noWrap") {
    style.flexWrap = flexWrap;
  }

  const boxSizing = props.boxSizing?.();
  if (boxSizing !== undefined) {
    style.boxSizing = boxSizing;
  }

  const wrap = props.wrap?.();
  if (wrap !== undefined) {
    style.wrap = wrap;
  }

  if (node.type === NODE_TYPE.Column) {
    const overflow = props.overflow?.();
    if (overflow === true || overflow === "scroll") {
      style.overflow = "scroll";
    }

    const scrollY = props.scrollY?.();
    if (scrollY !== undefined) {
      style.scrollY = Number.isNaN(scrollY) ? 0 : scrollY;
    }
  }

  const textOverflow = props.textOverflow?.();
  if (textOverflow !== undefined) {
    style.textOverflow = textOverflow;
  }

  if (node.type === NODE_TYPE.Input && node.isFocused()) {
    style.cursorVisible = 1;
  }

  return style;
}

function resolveBorderState(props: any): ResolvedBorderState {
  const border = props.border?.();
  const borderTop = props.borderTop?.();
  const borderRight = props.borderRight?.();
  const borderBottom = props.borderBottom?.();
  const borderLeft = props.borderLeft?.();

  const topColor = borderTop?.color ?? border?.color;
  const rightColor = borderRight?.color ?? border?.color;
  const bottomColor = borderBottom?.color ?? border?.color;
  const leftColor = borderLeft?.color ?? border?.color;

  const hasAnySide =
    topColor !== undefined ||
    rightColor !== undefined ||
    bottomColor !== undefined ||
    leftColor !== undefined;
  const hasSideOverride =
    borderTop !== undefined ||
    borderRight !== undefined ||
    borderBottom !== undefined ||
    borderLeft !== undefined;
  const fullBorderStyle =
    border !== undefined && !hasSideOverride
      ? border.style === "rounded"
        ? "rounded"
        : "square"
      : undefined;

  return {
    topWidth: topColor !== undefined ? 1 : undefined,
    rightWidth: rightColor !== undefined ? 1 : undefined,
    bottomWidth: bottomColor !== undefined ? 1 : undefined,
    leftWidth: leftColor !== undefined ? 1 : undefined,
    topColor,
    rightColor,
    bottomColor,
    leftColor,
    style: hasAnySide ? fullBorderStyle : undefined,
  };
}

function recordTextSet(stats: TextOpStats, text: string): void {
  stats.opCount++;
  stats.byteCount += getSetTextOpSize(text);
}

function recordTextDelete(stats: TextOpStats): void {
  stats.opCount++;
  stats.byteCount += getDeleteTextRangeOpSize();
}

function queueFullTreeInsert(node: SentNodeState, textStats: TextOpStats): void {
  ops.addNode(node.id, node.type);

  for (const prop of EMITTED_STYLE_PROPS) {
    const value = node.style[prop];
    if (value !== undefined) {
      ops.updateStyle(node.id, prop, value);
    }
  }

  if (node.text.length > 0) {
    ops.setText(node.id, node.text);
    recordTextSet(textStats, node.text);
  }

  if (node.type === NODE_TYPE.Text && node.styledText !== undefined) {
    ops.setTextSpans(node.id, node.styledText.spans);
  }

  for (const child of node.children) {
    queueFullTreeInsert(child, textStats);
    ops.appendChild(child.id, node.id);
  }
}

function syncNodeStyle(id: number, previous: SentStyleState, current: SentStyleState): void {
  for (const prop of EMITTED_STYLE_PROPS) {
    if (!sameStyleValue(previous[prop], current[prop])) {
      ops.updateStyle(id, prop, current[prop]);
    }
  }
}

function syncNodeText(id: number, previous: string, current: string, textStats: TextOpStats): void {
  if (previous === current) {
    return;
  }

  const previousChars = Array.from(previous);
  const currentChars = Array.from(current);

  let prefixLength = 0;
  while (
    prefixLength < previousChars.length &&
    prefixLength < currentChars.length &&
    previousChars[prefixLength] === currentChars[prefixLength]
  ) {
    prefixLength++;
  }

  const sharedPrefix = previousChars.slice(0, prefixLength).join("");
  const previousTail = previousChars.slice(prefixLength).join("");
  const currentTail = currentChars.slice(prefixLength).join("");

  if (previousTail.length > 0) {
    const startByte = textEncoder.encode(sharedPrefix).length;
    const endByte = startByte + textEncoder.encode(previousTail).length;
    ops.deleteTextRange(id, startByte, endByte);
    recordTextDelete(textStats);
  }

  if (currentTail.length > 0) {
    ops.setText(id, currentTail);
    recordTextSet(textStats, currentTail);
  }
}

function hasSameStyledText(
  previous: NormalizedStyledText | undefined,
  current: NormalizedStyledText | undefined,
): boolean {
  if (previous === current) {
    return true;
  }

  if (previous === undefined || current === undefined) {
    return false;
  }

  if (
    previous.text !== current.text ||
    previous.length !== current.length ||
    previous.byteLength !== current.byteLength ||
    previous.spans.length !== current.spans.length
  ) {
    return false;
  }

  for (let i = 0; i < previous.spans.length; i++) {
    const left = previous.spans[i];
    const right = current.spans[i];
    if (
      !left ||
      !right ||
      left.start !== right.start ||
      left.end !== right.end ||
      left.startByte !== right.startByte ||
      left.endByte !== right.endByte ||
      left.foreground !== right.foreground ||
      left.background !== right.background ||
      left.bold !== right.bold ||
      left.italic !== right.italic ||
      left.underline !== right.underline
    ) {
      return false;
    }
  }

  return true;
}

function syncNodeTextSpans(
  node: SentNodeState,
  previous: NormalizedStyledText | undefined,
  current: NormalizedStyledText | undefined,
): void {
  if (node.type !== NODE_TYPE.Text) {
    return;
  }

  if (hasSameStyledText(previous, current)) {
    return;
  }

  ops.setTextSpans(node.id, current?.spans ?? []);
}

function syncRenderTree(
  previous: SentNodeState,
  current: SentNodeState,
  textStats: TextOpStats,
): void {
  syncNodeStyle(current.id, previous.style, current.style);
  syncNodeText(current.id, previous.text, current.text, textStats);
  syncNodeTextSpans(current, previous.styledText, current.styledText);

  for (let i = 0; i < current.children.length; i++) {
    const previousChild = previous.children[i];
    const currentChild = current.children[i];
    if (!previousChild || !currentChild) {
      continue;
    }
    syncRenderTree(previousChild, currentChild, textStats);
  }
}

function updateNodeFrames(root: Node): void {
  const framesPtr = api.get_frames_ptr()!;
  const framesLen = Number(api.get_frames_len()!);
  const framesArray = new Float32Array(toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4));
  const hitmapPtr = api.get_hitmap_ptr?.();
  const hitmapLen = Number(api.get_hitmap_len?.() ?? 0);

  spatialLookup =
    hitmapPtr && hitmapLen > 0
      ? new Uint32Array(toArrayBuffer(hitmapPtr as Pointer, 0, hitmapLen * 4))
      : new Uint32Array(terminalWidth() * terminalHeight());

  let idx = 0;

  function updateFrames(node: Node): void {
    nodeRegistry.set(node.id, node);

    node.frame.x = framesArray[idx++]!;
    node.frame.y = framesArray[idx++]!;
    node.frame.width = framesArray[idx++]!;
    node.frame.height = framesArray[idx++]!;

    node.frameWidth(node.frame.width);
    node.frameHeight(node.frame.height);

    const children = node.children?.() ?? [];
    for (const child of children) {
      updateFrames(child);
    }
  }

  updateFrames(root);
}

function dispatchToNode(node: Node, data: string): boolean {
  if (node.type === NODE_TYPE.Input) {
    return dispatchInputChunk(
      {
        getText: () => node.props.text(),
        setText: (value) => node.setText(value),
        multiline: node.props.multiline() === true,
        onChange: node.handlers.onChange,
        onSubmit: node.handlers.onSubmit,
      },
      data,
    );
  }

  if (node.type === NODE_TYPE.Button) {
    const handlers = node.handlers;

    if (data.includes("\r") || data.includes("\n") || data === " ") {
      handlers.onClick();
      return true;
    }

    if (handlers.onKeyDown) {
      handlers.onKeyDown(data);
      return true;
    }

    return false;
  }

  return false;
}

function handleKeyboardEvent(data: string): void {
  const focused = getFocusedNode();

  if (focused) {
    const handled = dispatchToNode(focused, data);
    if (handled) return;
  }

  const globalHandler = globalKeyHandlers.get(data);
  if (globalHandler) {
    globalHandler();
  }
}

function handleMouseEvent(data: string): void {
  const i = data.indexOf("<") + 1;
  const j = data.length - 1;
  if (i <= 0 || j <= i) return;
  const parts = data.slice(i, j).split(";");
  if (parts.length !== 3) return;

  const isPress = data.endsWith("M");
  const isRelease = data.endsWith("m");
  const rawBtn = Number(parts[0]);
  const rawX = Number(parts[1]);
  const rawY = Number(parts[2]);
  if (!Number.isFinite(rawBtn) || !Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return;
  }

  const btn = rawBtn & 0b11;
  const x = rawX - 1;
  const y = rawY - 1;
  const target = getNodeAt(x, y);

  if ((rawBtn & 0b0100_0000) !== 0 && isPress) {
    const wheel = rawBtn & 0b11;
    const deltaX = wheel === 2 ? -1 : wheel === 3 ? 1 : 0;
    const deltaY = wheel === 0 ? -1 : wheel === 1 ? 1 : 0;

    if (deltaX !== 0 || deltaY !== 0) {
      dispatchScrollEvent({ x, y, deltaX, deltaY, target });
    }
    return;
  }

  const isLeftButton = btn === 0;

  if (isPress && isLeftButton) {
    if (target) {
      pressedNodeId = target.id;
      target.focus();
    } else {
      pressedNodeId = null;
      const focused = getFocusedNode();
      if (focused) focused.blur();
    }
    return;
  }

  if (isRelease && isLeftButton) {
    if (pressedNodeId !== null && target && target.id === pressedNodeId) {
      if (target.type === NODE_TYPE.Button) {
        target.handlers.onClick();
      }
    }
    pressedNodeId = null;
  }
}

function handleInput(data: string): void {
  if (data === "\x11") {
    quitFn?.();
    return;
  }

  const mouseEvents = data.match(MOUSE_EVENT_PATTERN);
  if (mouseEvents && mouseEvents.length > 0) {
    for (const ev of mouseEvents) {
      handleMouseEvent(ev);
    }

    const remaining = data.replace(MOUSE_EVENT_PATTERN, "");
    if (remaining.length > 0) {
      handleKeyboardEvent(remaining);
    }
    return;
  }

  handleKeyboardEvent(data);
}

function handleResize(): void {
  api.update_terminal_size();

  api.free_buffer();
  api.init_buffer();

  terminalWidth(api.get_width());
  terminalHeight(api.get_height());
  spatialLookup = new Uint32Array(terminalWidth() * terminalHeight());
}

let terminalWidth: Signal<number>;
let terminalHeight: Signal<number>;
let spatialLookup: Uint32Array;
let nodeRegistry: Map<number, Node>;
let globalKeyHandlers: Map<string, () => void>;
let globalScrollHandlers: Set<(event: ScrollEvent) => void>;
let pressedNodeId: number | null = null;
let isRunning = false;
let quitFn: (() => void) | null = null;
let ops: OpQueue;
let previousSentTree: SentNodeState | null = null;

const textEncoder = new TextEncoder();

function getNodeAt(x: number, y: number): Node | undefined {
  if (x < 0 || y < 0 || x >= terminalWidth() || y >= terminalHeight()) {
    return undefined;
  }
  const id = spatialLookup[y * terminalWidth() + x] ?? 0;
  return id !== 0 ? nodeRegistry.get(id) : undefined;
}

function dispatchScrollEvent(event: ScrollEvent): void {
  for (const handler of globalScrollHandlers) {
    handler(event);
  }
}

function sameStyleValue(left: StylePropValue, right: StylePropValue): boolean {
  if (left === right) return true;
  return typeof left === "number" && typeof right === "number" && Number.isNaN(left) && Number.isNaN(right);
}

function ensureParentDir(path: string): void {
  const parent = dirname(path);
  if (parent !== "." && parent.length > 0) {
    mkdirSync(parent, { recursive: true });
  }
}
