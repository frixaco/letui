// Typing speed demo: keyboard trainer with live accuracy and pacing feedback.
//
// Data flow:
// Key press → typed/start/finish signals → ff() effect → stats, prompt, and key highlights

import { Column, Row, Text, $, ff, onKey, run } from "@";
import type { StyledText, TextSpan } from "@";

type KeyCell = {
  value: string;
  node: ReturnType<typeof Text>;
};

const KEY_WIDTH = 3;
const KEY_GAP = 1;
const HAND_GAP = 2;
const HAND_COLS = 5;
const HAND_ROWS = 3;
const HAND_PADDING_X = 1;
const HAND_PADDING_Y = 1;
const HAND_INNER_WIDTH = HAND_COLS * KEY_WIDTH + (HAND_COLS - 1) * KEY_GAP;
const HAND_BOX_WIDTH = HAND_INNER_WIDTH + HAND_PADDING_X * 2 + 2;
const HAND_BOX_HEIGHT = HAND_ROWS * 2 + HAND_PADDING_Y * 2 + 3;
const KEYBOARD_WIDTH = HAND_BOX_WIDTH * 2 + HAND_GAP;
const CLOCK_TICK_MS = 100;

const THEME = {
  border: 0x2d4a60,
  text: 0xe7f1fb,
  muted: 0x7b97aa,
  accent: 0x6de0b2,
  warn: 0xffc66d,
  fail: 0xff7d86,
  ok: 0x79d6ff,
  ink: 0x071017,
} as const;

const LEFT_ROWS = [
  ["q", "w", "f", "p", "b"],
  ["a", "r", "s", "t", "g"],
  ["z", "x", "c", "d", "v"],
] as const;

const RIGHT_ROWS = [
  ["j", "l", "u", "y", ""],
  ["m", "n", "e", "i", "o"],
  ["k", "h", "", "", ""],
] as const;

const PROMPTS = [
  "we drift toward a calmer typing rhythm",
  "small focused reps build real speed over time",
  "split boards reward soft hands and clean timing",
  "read ahead stay loose and keep the strokes light",
];

const DEFAULT_HINT = "type letters + space   backspace edit   enter next   esc quit";
const FINISHED_HINT = "enter next prompt   backspace revise   esc quit";

const promptIndex = $(0);
const typed = $("");
const startedAt = $<number | null>(null);
const finishedAt = $<number | null>(null);
const now = $(Date.now());

function currentPrompt(): string {
  return PROMPTS[promptIndex()] ?? PROMPTS[0]!;
}

function countErrors(prompt: string, value: string): number {
  let errors = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== prompt[i]) errors++;
  }
  return errors;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function resetPrompt(nextIndex = promptIndex()): void {
  promptIndex(nextIndex);
  typed("");
  startedAt(null);
  finishedAt(null);
}

function appendChar(char: string): void {
  const prompt = currentPrompt();
  const value = typed();

  if (finishedAt() !== null || value.length >= prompt.length) return;
  if (startedAt() === null) startedAt(Date.now());

  const nextValue = `${value}${char}`;
  typed(nextValue);
  if (nextValue.length === prompt.length) finishedAt(Date.now());
}

function backspace(): void {
  const value = typed();
  if (value.length === 0) return;

  typed(value.slice(0, -1));
  if (finishedAt() !== null) finishedAt(null);
}

function advancePrompt(): void {
  resetPrompt((promptIndex() + 1) % PROMPTS.length);
}

function keyLabel(value: string): string {
  return value.length === 0 ? "   " : ` ${value} `;
}

function createKeyboardHand(rows: readonly (readonly string[])[]): {
  node: ReturnType<typeof Column>;
  cells: KeyCell[];
} {
  const cells: KeyCell[] = [];

  return {
    cells,
    node: Column(
      {
        flexGrow: 1,
        height: HAND_BOX_HEIGHT,
        minWidth: HAND_BOX_WIDTH,
        padding: `${HAND_PADDING_Y} ${HAND_PADDING_X}`,
        justifyContent: "spaceEvenly",
        border: { color: THEME.border, style: "rounded" },
      },
      rows.map((row) =>
        Row(
          { gap: KEY_GAP, justifyContent: "center" },
          row.map((value) => {
            const cell = {
              value,
              node: Text({
                text: keyLabel(value),
                foreground: value.length === 0 ? undefined : THEME.muted,
              }),
            };

            if (value.length > 0) cells.push(cell);
            return cell.node;
          }),
        ),
      ),
    ),
  };
}

function setKeyState(node: ReturnType<typeof Text>, active: boolean, correct: boolean): void {
  node.setStyle({
    foreground: active ? THEME.ink : THEME.muted,
    background: active ? (correct ? THEME.ok : THEME.fail) : undefined,
  });
}

function buildPromptText(prompt: string, value: string): StyledText {
  const spans: TextSpan[] = [];

  for (let index = 0; index < value.length && index < prompt.length; index++) {
    spans.push({
      start: index,
      end: index + 1,
      foreground: value[index] === prompt[index] ? THEME.muted : THEME.fail,
    });
  }

  if (value.length < prompt.length) {
    spans.push({
      start: value.length,
      end: value.length + 1,
      foreground: THEME.accent,
      bold: true,
      underline: true,
    });
  }

  return { text: prompt, spans };
}

const title = Text({
  text: "typing speed // colemak mod dh",
  foreground: THEME.accent,
});

const statsLine = Text({
  text: "",
  foreground: THEME.text,
});

const promptLine = Text({
  text: "",
  foreground: THEME.text,
});

const hintLine = Text({
  text: DEFAULT_HINT,
  foreground: THEME.muted,
});

const leftHand = createKeyboardHand(LEFT_ROWS);
const rightHand = createKeyboardHand(RIGHT_ROWS);
const keyCells = [...leftHand.cells, ...rightHand.cells];
const spacebarLabel = Text({
  text: "               space               ",
  foreground: THEME.muted,
});

const keyboard = Column({ width: KEYBOARD_WIDTH, gap: 1 }, [
  Row(
    {
      width: KEYBOARD_WIDTH,
      gap: HAND_GAP,
      alignItems: "stretch",
    },
    [leftHand.node, rightHand.node],
  ),
  Column(
    {
      minHeight: 3,
      padding: "0 1",
      alignItems: "center",
      justifyContent: "center",
      border: { color: THEME.border, style: "rounded" },
    },
    [spacebarLabel],
  ),
]);

const root = Column(
  {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: "1 1",
  },
  [
    Column(
      {
        gap: 1,
        alignItems: "center",
      },
      [title, statsLine, promptLine, keyboard, hintLine],
    ),
  ],
);

ff(() => {
  const prompt = currentPrompt();
  const value = typed();
  const errors = countErrors(prompt, value);
  const start = startedAt();
  const finish = finishedAt();
  const elapsedMs = start === null ? 0 : Math.max(1, (finish ?? now()) - start);
  const minutes = elapsedMs / 60000;
  const wpm = minutes > 0 ? value.length / 5 / minutes : 0;
  const accuracy =
    value.length === 0 ? 100 : clampPercent(((value.length - errors) / value.length) * 100);
  const finished = finish !== null;
  const lastTyped = value[value.length - 1] ?? "";
  const lastExpected = prompt[value.length - 1] ?? "";
  const lastWasCorrect = lastTyped.length > 0 && lastTyped === lastExpected;

  statsLine.setText(
    `wpm ${wpm.toFixed(1)}   acc ${accuracy.toFixed(0)}%   errors ${errors}   time ${formatSeconds(elapsedMs)}s`,
  );
  statsLine.setStyle({
    foreground: finished ? THEME.ok : errors > 0 ? THEME.warn : THEME.text,
  });

  promptLine.setText(buildPromptText(prompt, value));

  for (const key of keyCells) {
    setKeyState(key.node, key.value === lastTyped && lastTyped.length > 0, lastWasCorrect);
  }

  setKeyState(spacebarLabel, lastTyped === " ", lastWasCorrect);

  hintLine.setText(finished ? FINISHED_HINT : DEFAULT_HINT);
  hintLine.setStyle({
    foreground: finished ? (errors === 0 ? THEME.ok : THEME.warn) : THEME.muted,
  });
});

const clock = setInterval(() => {
  if (startedAt() === null || finishedAt() !== null) return;
  now(Date.now());
}, CLOCK_TICK_MS);

const app = run(root, { debug: true, metricsPath: "dump/metrics.txt" });

let stopped = false;
function quit(): void {
  if (stopped) return;
  stopped = true;
  clearInterval(clock);
  app.quit();
}

for (const key of "abcdefghijklmnopqrstuvwxyz ") {
  onKey(key, () => appendChar(key));
}

for (const key of ["\x08", "\x7f"]) {
  onKey(key, backspace);
}

for (const key of ["\r", "\n"]) {
  onKey(key, advancePrompt);
}

onKey("\x1b", quit);
