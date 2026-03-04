import { ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { writeFileSync } from "fs";
import { COLORS } from "./colors";
import api from "./ffi";
import { $, ff, type Signal } from "./signals";
import { getFocusedNode } from "./components";
import type { Node } from "./types";
import {
  startFrame,
  endFrame,
  startPhase,
  endSerialize,
  endTextSync,
  endRust,
  endSync,
  endFlush,
  formatMetrics,
  DEFAULT_METRICS_PATH,
} from "./metrics";
import { logWriter } from "./debug";

export type RunOptions = {
  debug?: boolean;
};

let terminalWidth: Signal<number>;
let terminalHeight: Signal<number>;
let spatialLookup: (number | undefined)[];
let nodeRegistry: Map<number, Node>;
let textRegistry: Map<number, string>;
let globalKeyHandlers: Map<string, () => void>;
let pressedNodeId: number | null = null;
let isRunning = false;
let quitFn: (() => void) | null = null;

type TreeCmd = [number, ];
let treeCmds: TreeCmd[] = [];

function getNodeAt(x: number, y: number): Node | undefined {
  const id = spatialLookup[y * terminalWidth() + x];
  return id !== undefined ? nodeRegistry.get(id) : undefined;
}

const EMPTY_TEXT_PAYLOAD = new Uint8Array(1);
const FIELDS_PER_NODE = 12;
const textEncoder = new TextEncoder();
const TEXT_OP_UPSERT = 1;
const TEXT_OP_DELETE = 2;
const MOUSE_EVENT_PATTERN = /\x1b\[<\d+;\d+;\d+[Mm]/g;

function writeU32LE(target: number[], value: number): void {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function queueUpsertTextOp(target: number[], nodeId: number, text: string): void {
  const encoded = textEncoder.encode(text);
  target.push(TEXT_OP_UPSERT);
  writeU32LE(target, nodeId >>> 0);
  writeU32LE(target, encoded.length >>> 0);
  for (const byte of encoded) {
    target.push(byte);
  }
}

function queueDeleteTextOp(target: number[], nodeId: number): void {
  target.push(TEXT_OP_DELETE);
  writeU32LE(target, nodeId >>> 0);
  writeU32LE(target, 0);
}

function syncTextOperations(
  textOps: number[],
  textOpCount: number,
  collectMetrics: boolean,
): void {
  if (collectMetrics) {
    const textSyncStart = startPhase();
    if (textOps.length > 0) {
      const payload = Uint8Array.from(textOps);
      api.sync_text_ops(payload, payload.length);
    }
    endTextSync(textSyncStart, textOpCount, textOps.length);
    return;
  }

  if (textOps.length > 0) {
    const payload = Uint8Array.from(textOps);
    api.sync_text_ops(payload, payload.length);
  }
}

function countNodes(node: Node): number {
  const children = node.children?.() ?? [];
  return 1 + children.reduce((sum, child) => sum + countNodes(child), 0);
}

function serialize(
  root: Node,
  collectMetrics = false,
): {
  nodeData: Float32Array;
} {
  const nodeCount = countNodes(root);
  const nodeData = new Float32Array(nodeCount * FIELDS_PER_NODE);
  const nextTextRegistry = new Map<number, string>();
  const textOps: number[] = [];
  let textOpCount = 0;

  let offset = 0;

  function serializeNode(node: Node): void {
    // Node type: 1=row, 2=column, 3=button, 4=input, 5=text
    let nodeType: number;
    if (node.type === "box") {
      nodeType = node.props.direction?.() === "row" ? 1 : 2;
    } else if (node.type === "button") {
      nodeType = 3;
    } else if (node.type === "input") {
      nodeType = 4;
    } else {
      nodeType = 5; // text
    }

    // Read props (auto-subscribes render effect)
    const gap = (node.props as any).gap?.() ?? 0;
    const padding = node.props.padding?.() ?? 0;
    let paddingX: number, paddingY: number;
    if (typeof padding === "string") {
      [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
    } else {
      paddingX = paddingY = padding;
    }

    const border = node.props.border?.();
    const hasBorder = border ? 1 : 0;
    const borderColor = border?.color ?? COLORS.default.bg;
    const borderStyle =
      border?.style === "rounded" ? 1 : border?.style === "square" ? 2 : 0;

    const background = node.props.background?.() ?? COLORS.default.bg;
    const foreground = node.props.foreground?.() ?? COLORS.default.fg;
    const flexGrow = node.props.flexGrow?.() ?? 0;

    // Children count
    const children = node.children?.() ?? [];
    const childCount = children.length;

    // Text content (for text/input/button)
    let textContent = "";
    if (
      node.type === "text" ||
      node.type === "input" ||
      node.type === "button"
    ) {
      textContent = (node.props as any).text?.() ?? "";
      nextTextRegistry.set(node.id, textContent);

      if (textRegistry.get(node.id) !== textContent) {
        queueUpsertTextOp(textOps, node.id, textContent);
        textOpCount++;
      }
    }

    // Write 12 fields
    nodeData[offset++] = nodeType;
    nodeData[offset++] = gap;
    nodeData[offset++] = paddingX;
    nodeData[offset++] = paddingY;
    nodeData[offset++] = hasBorder;
    nodeData[offset++] = childCount;
    nodeData[offset++] = background;
    nodeData[offset++] = foreground;
    nodeData[offset++] = borderColor;
    nodeData[offset++] = borderStyle;
    nodeData[offset++] = node.id;
    nodeData[offset++] = flexGrow;

    for (const child of children) {
      serializeNode(child);
    }
  }

  serializeNode(root);

  for (const id of textRegistry.keys()) {
    if (!nextTextRegistry.has(id)) {
      queueDeleteTextOp(textOps, id);
      textOpCount++;
    }
  }
  syncTextOperations(textOps, textOpCount, collectMetrics);

  textRegistry = nextTextRegistry;

  return { nodeData };
}

function updateNodeFrames(root: Node): void {
  const framesPtr = api.get_frames_ptr()!;
  const framesLen = Number(api.get_frames_len()!);
  const framesArray = new Float32Array(
    toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4),
  );

  let idx = 0;
  const width = terminalWidth();
  const height = terminalHeight();

  function markInteractiveHitArea(node: Node): void {
    if (node.type !== "input" && node.type !== "button") return;

    const startX = Math.max(0, Math.floor(node.frame.x));
    const startY = Math.max(0, Math.floor(node.frame.y));
    const endX = Math.min(width, Math.ceil(node.frame.x + node.frame.width));
    const endY = Math.min(height, Math.ceil(node.frame.y + node.frame.height));

    if (startX >= endX || startY >= endY) return;

    for (let y = startY; y < endY; y++) {
      const rowOffset = y * width;
      for (let x = startX; x < endX; x++) {
        spatialLookup[rowOffset + x] = node.id;
      }
    }
  }

  function updateFrames(node: Node): void {
    nodeRegistry.set(node.id, node);

    node.frame.x = framesArray[idx++]!;
    node.frame.y = framesArray[idx++]!;
    node.frame.width = framesArray[idx++]!;
    node.frame.height = framesArray[idx++]!;

    node.frameWidth(node.frame.width);
    node.frameHeight(node.frame.height);
    markInteractiveHitArea(node);

    const children = node.children?.() ?? [];
    for (const child of children) {
      updateFrames(child);
    }
  }

  updateFrames(root);
}

function dispatchToNode(node: Node, data: string): boolean {
  if (node.type === "input") {
    const handlers = node.handlers;
    const currentText = (node.props as any).text();

    // Backspace
    if (data === "\x7f") {
      node.setText!(currentText.slice(0, -1));
      handlers.onChange?.(node.props.text());
      return true;
    }

    // Enter (Handle \r, \n, or \r\n)
    if (data.includes("\r") || data.includes("\n")) {
      handlers.onSubmit?.(currentText);
      return true;
    }

    // Printable characters
    if (data.length === 1) {
      const code = data.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        node.setText!(currentText + data);
        handlers.onChange?.((node.props as any).text());
        return true;
      }
    }

    return false;
  }

  if (node.type === "button") {
    const handlers = node.handlers;

    // Enter or Space triggers click
    if (data.includes("\r") || data.includes("\n") || data === " ") {
      handlers.onClick();
      return true;
    }

    // Custom key handler
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

  // If a node is focused, try its handlers first
  if (focused) {
    const handled = dispatchToNode(focused, data);
    if (handled) return;
  }

  // Fall back to global handlers
  const globalHandler = globalKeyHandlers.get(data);
  if (globalHandler) {
    globalHandler();
  }
}

function handleMouseEvent(data: string): void {
  // Parse: \x1b[<btn;x;y[Mm]
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
  if (
    !Number.isFinite(rawBtn) ||
    !Number.isFinite(rawX) ||
    !Number.isFinite(rawY)
  ) {
    return;
  }

  const btn = rawBtn & 0b11;
  const x = rawX - 1; // 1-indexed -> 0-indexed
  const y = rawY - 1;

  const isLeftButton = btn === 0;
  const target = getNodeAt(x, y);

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
      if (target.type === "button") {
        target.handlers.onClick();
      }
    }
    pressedNodeId = null;
  }
}

function handleInput(data: string): void {
  // Ctrl+Q to quit
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

  // Reallocate buffer BEFORE updating signals (which trigger render)
  api.free_buffer();
  api.init_buffer();

  // Now update signals - this triggers render with correct buffer
  terminalWidth(api.get_width());
  terminalHeight(api.get_height());
  spatialLookup = new Array(terminalWidth() * terminalHeight());
}

export function onKey(key: string, callback: () => void): void {
  if (!globalKeyHandlers) {
    globalKeyHandlers = new Map();
  }
  globalKeyHandlers.set(key, callback);
}

export function run(root: Node, options?: RunOptions): { quit: () => void } {
  // 1. Initialize terminal (Rust side) - MUST be first to set TERMINAL_SIZE
  api.init_buffer();
  api.init_letui();
  api.clear_text_registry();

  // 2. Initialize state (after init_buffer so terminal size is available)
  terminalWidth = $(api.get_width());
  terminalHeight = $(api.get_height());
  globalKeyHandlers = globalKeyHandlers ?? new Map();
  nodeRegistry = new Map();
  textRegistry = new Map();
  spatialLookup = new Array(terminalWidth() * terminalHeight());
  pressedNodeId = null;
  isRunning = true;

  const stdinHandler = (data: Buffer) => handleInput(data.toString());

  // 3. Setup stdin for keyboard/mouse input
  process.stdin.on("data", stdinHandler);

  // 4. Setup resize handler
  process.stdout.on("resize", handleResize);

  // 5. Create render effect
  ff(() => {
    if (!isRunning) return;

    // Subscribe to terminal size changes (triggers re-render on resize)
    terminalWidth();
    terminalHeight();

    const frameStart = options?.debug ? startFrame() : 0;

    // Clear state for this frame
    spatialLookup.fill(undefined);
    nodeRegistry.clear();

    // Phase 1: Serialize node tree to flat arrays
    const serializeStart = options?.debug ? startPhase() : 0;
    const { nodeData } = serialize(root, !!options?.debug);
    if (options?.debug) endSerialize(serializeStart);

    // Phase 2: Rust FFI (taffy layout + buffer paint)
    const rustStart = options?.debug ? startPhase() : 0;
    api.paint(
      ptr(nodeData),
      nodeData.length,
      ptr(EMPTY_TEXT_PAYLOAD),
      0,
    );
    if (options?.debug) endRust(rustStart);

    // Phase 3: Sync frame data back to JS nodes
    const syncStart = options?.debug ? startPhase() : 0;
    updateNodeFrames(root);
    if (options?.debug) endSync(syncStart);

    // Phase 4: Flush buffer to terminal
    const flushStart = options?.debug ? startPhase() : 0;
    api.flush();
    if (options?.debug) endFlush(flushStart);

    if (options?.debug) endFrame(frameStart);
  });

  // 6. Create and store quit function
  quitFn = () => {
    isRunning = false;
    process.stdin.off("data", stdinHandler);
    process.stdout.off("resize", handleResize);
    api.clear_text_registry();
    api.free_buffer();
    api.deinit_letui();
    if (options?.debug) {
      const stats = formatMetrics();
      writeFileSync(DEFAULT_METRICS_PATH, stats + "\n", "utf8");
      console.log(stats);
      logWriter.flush();
    }
    process.exit(0);
  };

  return { quit: quitFn };
}
