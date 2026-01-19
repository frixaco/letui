import { ptr, toArrayBuffer, type Pointer } from "bun:ffi";
import { COLORS } from "./colors";
import api from "./ffi";
import { $, ff, type Signal } from "./signals";
import { getFocusedNode } from "./components";
import type { Node, BorderStyle } from "./types";
import {
  startFrame,
  endFrame,
  startPhase,
  endSerialize,
  endRust,
  endSync,
  endFlush,
  formatMetrics,
} from "./metrics";
import { logWriter } from "./debug";

// =============================================================================
// TYPES
// =============================================================================

export type RunOptions = {
  debug?: boolean;
};

// =============================================================================
// STATE
// =============================================================================

let buffer: BigUint64Array;
let stagingBuffer: Uint32Array = null!; // Staging buffer for batched setCell writes
let terminalWidth: Signal<number>;
let terminalHeight: Signal<number>;
let spatialLookup: (number | undefined)[];
let nodeRegistry: Map<number, Node>;
let globalKeyHandlers: Map<string, () => void>;
let pressedNodeId: number | null = null;
let isRunning = false;
let quitFn: (() => void) | null = null;

// =============================================================================
// HELPERS
// =============================================================================

function getBuffer(): BigUint64Array {
  const bufPtr = api.get_buffer_ptr()!;
  const bufLen = Number(api.get_buffer_len()!);
  return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
}

function getNodeAt(x: number, y: number): Node | undefined {
  const id = spatialLookup[y * terminalWidth() + x];
  return id !== undefined ? nodeRegistry.get(id) : undefined;
}

// =============================================================================
// SERIALIZATION
// =============================================================================

const FIELDS_PER_NODE = 13;

function countNodes(node: Node): number {
  const children = node.children?.() ?? [];
  return 1 + children.reduce((sum, child) => sum + countNodes(child), 0);
}

function serialize(root: Node): {
  nodeData: Float32Array;
  textData: Uint8Array;
} {
  const nodeCount = countNodes(root);
  const nodeData = new Float32Array(nodeCount * FIELDS_PER_NODE);
  const texts: string[] = [];

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
    }
    const textLength = new TextEncoder().encode(textContent).length; // Byte length for Rust

    if (textContent) {
      texts.push(textContent);
    }

    // Write 13 fields
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
    nodeData[offset++] = textLength;
    nodeData[offset++] = flexGrow;

    // Recurse into children
    for (const child of children) {
      serializeNode(child);
    }
  }

  serializeNode(root);

  const textData = new TextEncoder().encode(texts.join(""));

  return { nodeData, textData };
}

// =============================================================================
// LAYOUT (reads frames from Rust after paint computes layout)
// =============================================================================

function updateNodeFrames(root: Node): void {
  const framesPtr = api.get_frames_ptr()!;
  const framesLen = Number(api.get_frames_len()!);
  const framesArray = new Float32Array(
    toArrayBuffer(framesPtr as Pointer, 0, framesLen * 4),
  );

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

// =============================================================================
// DRAWING HELPERS
// =============================================================================

// Write to staging buffer (no BigInt conversion)
// function setCell(offset: number, char: string, fg: number, bg: number): void {
//   stagingBuffer[offset] = char.codePointAt(0)!;
//   stagingBuffer[offset + 1] = fg;
//   stagingBuffer[offset + 2] = bg;
// }

// Flush staging buffer to BigUint64Array in one pass
// function flushStagingBuffer(): void {
//   const len = stagingBuffer.length;
//   for (let i = 0; i < len; i++) {
//     buffer[i] = BigInt(stagingBuffer[i]!);
//   }
// }

// function drawBackground(node: Node, bg: number): void {
//   const tw = terminalWidth();
//   const { x, y, width, height } = node.frame;
//
//   for (let row = y; row < y + height; row++) {
//     for (let col = x; col < x + width; col++) {
//       setCell((row * tw + col) * 3, " ", COLORS.default.fg, bg);
//     }
//   }
// }
//
// function drawBorder(
//   node: Node,
//   style: BorderStyle,
//   fg: number,
//   bg: number,
// ): void {
//   const tw = terminalWidth();
//   const { x, y, width, height } = node.frame;
//
//   const topLeft = y * tw + x;
//   const topRight = topLeft + width - 1;
//   const bottomLeft = topLeft + (height - 1) * tw;
//   const bottomRight = bottomLeft + width - 1;
//
//   // Corners
//   const [tl, tr, bl, br] =
//     style === "square" ? ["┌", "┐", "└", "┘"] : ["╭", "╮", "╰", "╯"];
//
//   setCell(topLeft * 3, tl, fg, bg);
//   setCell(topRight * 3, tr, fg, bg);
//   setCell(bottomLeft * 3, bl, fg, bg);
//   setCell(bottomRight * 3, br, fg, bg);
//
//   // Horizontal edges
//   for (let i = 1; i < width - 1; i++) {
//     setCell((topLeft + i) * 3, "─", fg, bg);
//     setCell((bottomLeft + i) * 3, "─", fg, bg);
//   }
//
//   // Vertical edges
//   for (let i = 1; i < height - 1; i++) {
//     setCell((topLeft + i * tw) * 3, "│", fg, bg);
//     setCell((topRight + i * tw) * 3, "│", fg, bg);
//   }
// }
//
// function drawText(node: Node, text: string, fg: number, bg: number): void {
//   const tw = terminalWidth();
//   const { x, y } = node.frame;
//
//   const padding = node.props.padding?.() ?? 0;
//   let paddingX: number, paddingY: number;
//   if (typeof padding === "string") {
//     [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
//   } else {
//     paddingX = paddingY = padding;
//   }
//
//   const border = node.props.border?.();
//   const borderOffset = border ? 1 : 0;
//
//   const startX = x + paddingX + borderOffset;
//   const startY = y + paddingY + borderOffset;
//
//   let col = 0;
//   for (const char of text) {
//     const offset = (startY * tw + startX + col) * 3;
//     setCell(offset, char, fg, bg);
//     col++;
//   }
// }
//
// function drawCursor(
//   node: Node,
//   textLength: number,
//   fg: number,
//   bg: number,
// ): void {
//   const tw = terminalWidth();
//   const { x, y } = node.frame;
//
//   const padding = node.props.padding?.() ?? 0;
//   let paddingX: number, paddingY: number;
//   if (typeof padding === "string") {
//     [paddingX, paddingY] = padding.split(" ").map(Number) as [number, number];
//   } else {
//     paddingX = paddingY = padding;
//   }
//
//   const border = node.props.border?.();
//   const borderOffset = border ? 1 : 0;
//
//   const cursorX = x + paddingX + borderOffset + textLength;
//   const cursorY = y + paddingY + borderOffset;
//
//   const offset = (cursorY * tw + cursorX) * 3;
//   setCell(offset, "▌", fg, bg);
// }
//
// function registerHit(node: Node): void {
//   const tw = terminalWidth();
//   const { x, y, width, height } = node.frame;
//
//   for (let row = y; row < y + height; row++) {
//     for (let col = x; col < x + width; col++) {
//       spatialLookup[row * tw + col] = node.id;
//     }
//   }
// }

// =============================================================================
// PAINT
// =============================================================================

// function paint(node: Node, overrideBg: number): void {
//   // Register in nodeRegistry for hit testing
//   nodeRegistry.set(node.id, node);
//
//   const bg = node.props.background?.() ?? overrideBg;
//   const fg = node.props.foreground?.() ?? COLORS.default.fg;
//   const border = node.props.border?.();
//
//   // Draw background
//   drawBackground(node, bg);
//
//   // Draw border
//   if (border) {
//     const isFocused = node.isFocused();
//     const borderFg = isFocused ? COLORS.default.green : border.color;
//     drawBorder(node, border.style, borderFg, bg);
//   }
//
//   // Type-specific rendering
//   if (node.type === "text") {
//     const text = (node.props as any).text?.() ?? "";
//     drawText(node, text, fg, bg);
//   }
//
//   if (node.type === "input") {
//     const isFocused = node.isFocused();
//     const text = (node.props as any).text?.() ?? "";
//     const placeholder = (node.props as any).placeholder?.() ?? "";
//     const displayText = text || placeholder;
//     const displayFg = text ? fg : COLORS.default.grey;
//
//     drawText(node, displayText, displayFg, bg);
//
//     // Show cursor if focused
//     if (isFocused) {
//       drawCursor(node, text.length, fg, bg);
//     }
//
//     registerHit(node);
//   }
//
//   if (node.type === "button") {
//     const isPressed = pressedNodeId === node.id;
//     const isFocused = node.isFocused();
//     const text = (node.props as any).text?.() ?? "";
//
//     // Invert colors when pressed
//     const drawBg = isPressed ? fg : bg;
//     const drawFg = isPressed ? bg : fg;
//
//     // Redraw background with correct color for pressed state
//     if (isPressed) {
//       drawBackground(node, drawBg);
//     }
//
//     // Redraw border with focus indicator
//     if (border) {
//       const borderFg = isFocused ? COLORS.default.green : border.color;
//       drawBorder(node, border.style, borderFg, drawBg);
//     }
//
//     drawText(node, text, drawFg, drawBg);
//     registerHit(node);
//   }
//
//   // Recurse into children
//   const children = node.children?.() ?? [];
//   for (const child of children) {
//     paint(child, bg);
//   }
// }

// =============================================================================
// INPUT HANDLING
// =============================================================================

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
  const parts = data.slice(i, j).split(";");

  const isPress = data.endsWith("M");
  const isRelease = data.endsWith("m");
  const btn = Number(parts[0]) & 0b11;
  const x = Number(parts[1]) - 1; // 1-indexed -> 0-indexed
  const y = Number(parts[2]) - 1;

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

function handleInput(data: string, options?: RunOptions): void {
  // Ctrl+Q to quit
  if (data === "\x11") {
    quitFn?.();
    return;
  }

  // Mouse events
  if (data.startsWith("\x1b[<")) {
    handleMouseEvent(data);
    return;
  }

  // Keyboard events
  handleKeyboardEvent(data);
}

function handleResize(): void {
  api.update_terminal_size();

  // Reallocate buffer BEFORE updating signals (which trigger render)
  api.free_buffer();
  api.init_buffer();
  buffer = getBuffer();
  stagingBuffer = new Uint32Array(buffer.length);

  // Now update signals - this triggers render with correct buffer
  terminalWidth(api.get_width());
  terminalHeight(api.get_height());
  spatialLookup = new Array(terminalWidth() * terminalHeight());
}

// =============================================================================
// PUBLIC API
// =============================================================================

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
  buffer = getBuffer();
  stagingBuffer = new Uint32Array(buffer.length);

  // 2. Initialize state (after init_buffer so terminal size is available)
  terminalWidth = $(api.get_width());
  terminalHeight = $(api.get_height());
  globalKeyHandlers = globalKeyHandlers ?? new Map();
  nodeRegistry = new Map();
  spatialLookup = new Array(terminalWidth() * terminalHeight());
  pressedNodeId = null;
  isRunning = true;

  // 3. Setup stdin for keyboard/mouse input
  process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdin.on("data", (data) => handleInput(data.toString(), options));

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
    const { nodeData, textData } = serialize(root);
    if (options?.debug) endSerialize(serializeStart);

    // Phase 2: Rust FFI (taffy layout + buffer paint)
    const rustStart = options?.debug ? startPhase() : 0;
    const safeTextData = textData.length > 0 ? textData : new Uint8Array(1);
    api.paint(
      ptr(nodeData),
      nodeData.length,
      ptr(safeTextData),
      textData.length,
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
    api.free_buffer();
    api.deinit_letui();
    if (options?.debug) {
      const stats = formatMetrics();
      Bun.write("metrics.txt", stats + "\n");
      console.log(stats);
      logWriter.flush();
    }
    process.exit(0);
  };

  return { quit: quitFn };
}
