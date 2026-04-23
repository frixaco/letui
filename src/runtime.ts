/**
 * Runtime bridge that diffs the TS tree, syncs Rust ops, and drives terminal I/O.
 */

import { toArrayBuffer, type Pointer } from "bun:ffi";
import { Buffer } from "node:buffer";
import process from "node:process";
import {
  cleanupAppearanceSession,
  configureAppearanceSession,
  refreshAppearance as refreshRuntimeAppearance,
  stripAppearanceResponses,
} from "./appearance.ts";
import api from "./ffi.ts";
import { $, ff, type Signal } from "./signals.ts";
import { getFocusedNode, getFocusVersion, syncScrollViewMetrics } from "./components.ts";
import { dispatchInputChunk } from "./input.ts";
import { NODE_TYPE, type AppearanceMode, type Node, type ScrollEvent } from "./types.ts";
import { OpQueue } from "./ops.ts";
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
  saveMetrics,
} from "./metrics.ts";
import { logWriter } from "./debug.ts";
import { extractMouseEvents, type ParsedMouseEvent } from "./helpers.ts";
import { prepareRenderTreeSync, type SentNodeState } from "./sync.ts";

export type RunOptions = {
  debug?: boolean;
  metricsPath?: string | false;
  appearance?: AppearanceMode;
};

export { appearance, refreshAppearance } from "./appearance.ts";
export type { ScrollEvent } from "./types.ts";

export function run(root: Node, options?: RunOptions): { quit: () => void } {
  configureAppearanceSession(options?.appearance ?? "auto");

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
  nodeRegistry = new Map();
  ops = new OpQueue();
  previousSentTree = null;
  spatialLookup = new Uint32Array(terminalWidth() * terminalHeight());
  scrollSpatialLookup = new Uint32Array(terminalWidth() * terminalHeight());
  pressedNodeId = null;
  isRunning = true;
  let cleanedUp = false;

  const stdinHandler = (data: Buffer) => handleInput(data.toString());
  const writeDebugMetrics = () => {
    if (!options?.debug) return;
    const stats = formatMetrics();
    const metricsPath = resolveMetricsPath(options?.metricsPath);
    if (metricsPath) {
      saveMetrics(metricsPath);
    }
    console.log(stats);
    logWriter.flush();
  };
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    isRunning = false;
    cleanupAppearanceSession();
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
  void refreshRuntimeAppearance();

  ff(() => {
    if (!isRunning) return;

    terminalWidth();
    terminalHeight();
    getFocusVersion();

    const frameStart = options?.debug ? startFrame() : 0;
    const jsStart = options?.debug ? startPhase() : 0;

    nodeRegistry.clear();
    const { sentTree, textStats, requiresTreeReset } = prepareRenderTreeSync(
      root,
      previousSentTree,
      ops,
    );
    if (requiresTreeReset) {
      api.clear_tree_state();
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

function updateNodeFrames(root: Node): void {
  const framesPtr = api.get_frames_ptr()!;
  const framesLen = Number(api.get_frames_len()!);
  const framesArray = new Float32Array(toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4));
  const hitmapPtr = api.get_hitmap_ptr?.();
  const hitmapLen = Number(api.get_hitmap_len?.() ?? 0);
  const scrollHitmapPtr = api.get_scroll_hitmap_ptr?.();
  const scrollHitmapLen = Number(api.get_scroll_hitmap_len?.() ?? 0);

  spatialLookup =
    hitmapPtr && hitmapLen > 0
      ? new Uint32Array(toArrayBuffer(hitmapPtr as Pointer, 0, hitmapLen * 4))
      : new Uint32Array(terminalWidth() * terminalHeight());
  scrollSpatialLookup =
    scrollHitmapPtr && scrollHitmapLen > 0
      ? new Uint32Array(toArrayBuffer(scrollHitmapPtr as Pointer, 0, scrollHitmapLen * 4))
      : new Uint32Array(terminalWidth() * terminalHeight());

  let idx = 0;

  function updateFrames(node: Node): void {
    nodeRegistry.set(node.id, node);

    node.frame.x = framesArray[idx++]!;
    node.frame.y = framesArray[idx++]!;
    node.frame.width = framesArray[idx++]!;
    node.frame.height = framesArray[idx++]!;
    node.contentFrame.x = framesArray[idx++]!;
    node.contentFrame.y = framesArray[idx++]!;
    node.contentFrame.width = framesArray[idx++]!;
    node.contentFrame.height = framesArray[idx++]!;
    idx++;
    const maxScrollY = framesArray[idx++]!;

    node.frameWidth(node.frame.width);
    node.frameHeight(node.frame.height);

    if ("scrollTo" in node) {
      syncScrollViewMetrics(node, {
        viewportHeight: node.contentFrame.height,
        maxScrollY,
      });
    }

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
      return handlers.onKeyDown(data) === true;
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

function handleMouseEvent(event: ParsedMouseEvent): void {
  const isPress = event.kind === "press";
  const isRelease = event.kind === "release";
  const rawBtn = event.rawButton;
  const btn = event.button;
  const x = event.x;
  const y = event.y;
  const target = getNodeAt(x, y);
  const scrollTarget = getScrollNodeAt(x, y);

  if ((rawBtn & 0b0100_0000) !== 0 && isPress) {
    const wheel = rawBtn & 0b11;
    const deltaX = wheel === 2 ? -1 : wheel === 3 ? 1 : 0;
    const deltaY = wheel === 0 ? -1 : wheel === 1 ? 1 : 0;

    if (deltaX !== 0 || deltaY !== 0) {
      dispatchScrollEvent({ x, y, deltaX, deltaY, target }, scrollTarget);
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
  data = stripAppearanceResponses(data);
  if (data.length === 0) return;

  if (data === "\x11") {
    quitFn?.();
    return;
  }

  const { mouseEvents, remaining } = extractMouseEvents(data);
  if (mouseEvents.length > 0) {
    for (const event of mouseEvents) {
      handleMouseEvent(event);
    }

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
  scrollSpatialLookup = new Uint32Array(terminalWidth() * terminalHeight());
}

let terminalWidth: Signal<number>;
let terminalHeight: Signal<number>;
let spatialLookup: Uint32Array;
let scrollSpatialLookup: Uint32Array;
let nodeRegistry: Map<number, Node>;
let globalKeyHandlers: Map<string, () => void>;
let pressedNodeId: number | null = null;
let isRunning = false;
let quitFn: (() => void) | null = null;
let ops: OpQueue;
let previousSentTree: SentNodeState | null = null;

function getNodeAt(x: number, y: number): Node | undefined {
  if (x < 0 || y < 0 || x >= terminalWidth() || y >= terminalHeight()) {
    return undefined;
  }
  const id = spatialLookup[y * terminalWidth() + x] ?? 0;
  return id !== 0 ? nodeRegistry.get(id) : undefined;
}

function getScrollNodeAt(x: number, y: number): Node | undefined {
  if (x < 0 || y < 0 || x >= terminalWidth() || y >= terminalHeight()) {
    return undefined;
  }
  const id = scrollSpatialLookup[y * terminalWidth() + x] ?? 0;
  return id !== 0 ? nodeRegistry.get(id) : undefined;
}

function dispatchScrollEvent(event: ScrollEvent, scrollTarget: Node | undefined): void {
  const handler = (
    scrollTarget?.handlers as { onScroll?: (event: ScrollEvent) => void } | undefined
  )?.onScroll;
  if (handler) {
    handler(event);
    return;
  }
}
