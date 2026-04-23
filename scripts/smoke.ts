/**
 * Bun PTY smoke harness for the deterministic TUI smoke example.
 *
 * Data flow:
 *   scripted input -> Bun Terminal -> examples/smoke.ts -> asserted output markers
 */

import process from "node:process";

const WIDTH = 80;
const HEIGHT = 24;
const TIMEOUT_MS = 4_000;
const STEP_DELAY_MS = 80;

class TerminalScreen {
  private cols: number;
  private rows: number;
  private cursorX = 0;
  private cursorY = 0;
  private cells: string[][];

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = this.createCells(cols, rows);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.cursorX = Math.min(this.cursorX, cols - 1);
    this.cursorY = Math.min(this.cursorY, rows - 1);
    this.cells = this.createCells(cols, rows);
  }

  feed(input: string): void {
    for (let index = 0; index < input.length; ) {
      const ch = input[index]!;

      if (ch === "\x1b") {
        index = this.consumeEscape(input, index);
        continue;
      }

      if (ch === "\r") {
        this.cursorX = 0;
        index += 1;
        continue;
      }

      if (ch === "\n") {
        this.cursorY = Math.min(this.rows - 1, this.cursorY + 1);
        index += 1;
        continue;
      }

      if (ch >= " ") {
        this.put(ch);
      }

      index += 1;
    }
  }

  toString(): string {
    return this.cells.map((row) => row.join("").trimEnd()).join("\n");
  }

  private consumeEscape(input: string, start: number): number {
    const next = input[start + 1];

    if (next === "[") {
      return this.consumeCsi(input, start + 2);
    }

    if (next === "]") {
      return this.consumeOsc(input, start + 2);
    }

    return Math.min(input.length, start + 2);
  }

  private consumeCsi(input: string, start: number): number {
    let index = start;

    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        this.applyCsi(input.slice(start, index), input[index]!);
        return index + 1;
      }
      index += 1;
    }

    return input.length;
  }

  private consumeOsc(input: string, start: number): number {
    const bell = input.indexOf("\x07", start);
    const st = input.indexOf("\x1b\\", start);

    if (bell === -1 && st === -1) {
      return input.length;
    }

    if (bell !== -1 && (st === -1 || bell < st)) {
      return bell + 1;
    }

    return st + 2;
  }

  private applyCsi(params: string, final: string): void {
    const values = params
      .replace(/^\?/, "")
      .split(";")
      .filter(Boolean)
      .map((value) => Number(value));

    switch (final) {
      case "H":
      case "f": {
        this.cursorY = this.clamp((values[0] ?? 1) - 1, 0, this.rows - 1);
        this.cursorX = this.clamp((values[1] ?? 1) - 1, 0, this.cols - 1);
        break;
      }
      case "G": {
        this.cursorX = this.clamp((values[0] ?? 1) - 1, 0, this.cols - 1);
        break;
      }
      case "J": {
        if ((values[0] ?? 0) === 2) {
          this.cells = this.createCells(this.cols, this.rows);
        }
        break;
      }
      case "K": {
        const row = this.cells[this.cursorY];
        if (!row) break;
        for (let x = this.cursorX; x < this.cols; x++) {
          row[x] = " ";
        }
        break;
      }
    }
  }

  private put(ch: string): void {
    if (this.cursorX >= this.cols) {
      this.cursorX = 0;
      this.cursorY = Math.min(this.rows - 1, this.cursorY + 1);
    }

    this.cells[this.cursorY]![this.cursorX] = ch;
    this.cursorX += 1;
  }

  private createCells(cols: number, rows: number): string[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}

if (process.platform === "win32") {
  console.error("Bun PTY support is POSIX-only; smoke currently runs on macOS/Linux.");
  process.exit(1);
}

const decoder = new TextDecoder();
let output = "";
const screen = new TerminalScreen(WIDTH, HEIGHT);

const proc = Bun.spawn(["bun", "run", "examples/smoke.ts"], {
  cwd: process.cwd(),
  env: {
    ...Bun.env,
    TERM: "xterm-256color",
  },
  terminal: {
    cols: WIDTH,
    rows: HEIGHT,
    data(_terminal, data) {
      const text = decoder.decode(data, { stream: true });
      output += text;
      screen.feed(text);
    },
  },
});

const terminal = proc.terminal;
if (!terminal) {
  console.error("Failed to start smoke PTY.");
  process.exit(1);
}

try {
  await waitFor("LETUI SMOKE EXAMPLE");
  await waitFor("smoke-ready");

  await write("i");
  await waitFor("input focused");

  await write("alpha");
  await waitFor("input changed: alpha");

  await write("\r");
  await waitFor("submitted: alpha");

  await write("\t");
  await waitFor("tab blurred");

  await write("b");
  await waitFor("button focused");

  await write("\r");
  await waitFor("button clicked: 1");

  await write("j");
  await waitFor("keyboard scroll: 3");
  await waitFor("scroll-row-03");

  await write("\x1b[<65;5;15M");
  await waitFor("mouse scroll: 1");

  await write("t");
  await waitFor("theme toggled: accent");

  terminal.resize(72, 20);
  screen.resize(72, 20);
  await waitFor("size: 72x20");

  await write("\x11");
  const exitCode = await withTimeout(proc.exited, TIMEOUT_MS, "process exit");
  if (exitCode !== 0) {
    fail(`smoke example exited with code ${exitCode}`);
  }

  console.log("smoke passed");
} finally {
  if (!terminal.closed) {
    terminal.close();
  }
}

async function write(input: string): Promise<void> {
  terminal!.write(input);
  await sleep(STEP_DELAY_MS);
}

async function waitFor(marker: string): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < TIMEOUT_MS) {
    if (visibleOutput().includes(marker)) {
      return;
    }

    await sleep(25);
  }

  fail(`timed out waiting for ${JSON.stringify(marker)}`);
}

function plainOutput(): string {
  return Bun.stripANSI(output);
}

function visibleOutput(): string {
  return screen.toString();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: Timer | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message: string): never {
  const plain = visibleOutput();
  const tail = plain.slice(Math.max(0, plain.length - 4_000));
  console.error(`smoke failed: ${message}`);
  console.error("---- visible screen ----");
  console.error(tail);
  console.error("---- raw output tail ----");
  console.error(plainOutput().slice(Math.max(0, plainOutput().length - 2_000)));
  process.exit(1);
}
