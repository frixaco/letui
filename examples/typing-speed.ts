// Typing speed demo: keyboard trainer with live accuracy and pacing feedback.
//
// Data flow:
// Key press → handleTypedChar() → typed signal update → ff() effect → UI sync (stats, highlight, key states)

import { Column, Row, Text, $, ff, onKey, run } from "@";

// --- Domain vocabulary ---

type KeyNode = {
  value: string;
  node: ReturnType<typeof Text>;
};

// --- Binary layout ---

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

// --- Supporting types ---

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

// --- Internal state ---

const promptIndex = $(0);
const typed = $("");
const startedAt = $<number | null>(null);
const finishedAt = $<number | null>(null);
const now = $(Date.now());

// --- Core algorithm ---

function cyclePrompt(index: number): number {
  return (index + 1) % PROMPTS.length;
}

function countErrors(prompt: string, typed: string): number {
  let errors = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== prompt[i]) errors++;
  }
  return errors;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

function keyLabel(value: string): string {
  return value.length === 0 ? "   " : ` ${value} `;
}

function createKey(value: string): KeyNode {
  return {
    value,
    node: Text({
      text: keyLabel(value),
      foreground: value.length === 0 ? undefined : THEME.muted,
    }),
  };
}

function createKeyRow(keys: readonly string[], store: KeyNode[]): ReturnType<typeof Row> {
  const nodes = keys.map((value) => {
    const key = createKey(value);
    if (value.length > 0) store.push(key);
    return key.node;
  });
  return Row({ gap: KEY_GAP, justifyContent: "center" }, nodes);
}

// --- View state ---

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

const typedLine = Text({
  text: "",
  foreground: THEME.muted,
});

const hintLine = Text({
  text: "type letters + space   backspace edit   enter next   esc quit",
  foreground: THEME.muted,
});

const allKeys: KeyNode[] = [];
const leftBox = Column(
  {
    flexGrow: 1,
    height: HAND_BOX_HEIGHT,
    minWidth: HAND_BOX_WIDTH,
    padding: `${HAND_PADDING_Y} ${HAND_PADDING_X}`,
    justifyContent: "spaceEvenly",
    border: { color: THEME.border, style: "rounded" },
  },
  LEFT_ROWS.map((row) => createKeyRow(row, allKeys)),
);

const rightBox = Column(
  {
    flexGrow: 1,
    height: HAND_BOX_HEIGHT,
    minWidth: HAND_BOX_WIDTH,
    padding: `${HAND_PADDING_Y} ${HAND_PADDING_X}`,
    justifyContent: "spaceEvenly",
    border: { color: THEME.border, style: "rounded" },
  },
  RIGHT_ROWS.map((row) => createKeyRow(row, allKeys)),
);

const spacebarLabel = Text({
  text: "               space               ",
  foreground: THEME.muted,
});

const spacebarBox = Column(
  {
    minHeight: 3,
    padding: "0 1",
    alignItems: "center",
    justifyContent: "center",
    border: { color: THEME.border, style: "rounded" },
  },
  [spacebarLabel],
);

const keyboard = Column(
  {
    width: KEYBOARD_WIDTH,
    gap: 1,
  },
  [
    Row(
      {
        width: KEYBOARD_WIDTH,
        gap: HAND_GAP,
        alignItems: "stretch",
      },
      [leftBox, rightBox],
    ),
    spacebarBox,
  ],
);

const content = Column(
  {
    gap: 1,
    alignItems: "center",
  },
  [title, statsLine, promptLine, typedLine, keyboard, hintLine],
);

const root = Column(
  {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: "1 1",
  },
  [content],
);

// --- Interaction helpers ---

function resetTest(nextIndex = promptIndex()): void {
  promptIndex(nextIndex);
  typed("");
  startedAt(null);
  finishedAt(null);
}

function nextPrompt(): void {
  resetTest(cyclePrompt(promptIndex()));
}

function handleTypedChar(char: string): void {
  const prompt = PROMPTS[promptIndex()] ?? PROMPTS[0]!;
  const current = typed();
  if (finishedAt() !== null || current.length >= prompt.length) return;
  if (startedAt() === null) startedAt(Date.now());

  const nextTyped = `${current}${char}`;
  typed(nextTyped);
  if (nextTyped.length === prompt.length) {
    finishedAt(Date.now());
  }
}

function handleBackspace(): void {
  const current = typed();
  if (current.length === 0) return;
  typed(current.slice(0, -1));
  if (finishedAt() !== null) finishedAt(null);
}

// --- Reactive sync ---

ff(() => {
  const prompt = PROMPTS[promptIndex()] ?? PROMPTS[0]!;
  const currentTyped = typed();
  const errors = countErrors(prompt, currentTyped);
  const elapsedMs =
    startedAt() === null ? 0 : Math.max(1, (finishedAt() ?? now()) - (startedAt() ?? now()));
  const minutes = elapsedMs / 60000;
  const grossWpm = minutes > 0 ? currentTyped.length / 5 / minutes : 0;
  const accuracy =
    currentTyped.length === 0
      ? 100
      : clampPercent(((currentTyped.length - errors) / currentTyped.length) * 100);
  const finished = finishedAt() !== null;
  const lastTyped = currentTyped[currentTyped.length - 1] ?? "";
  const lastExpected = prompt[currentTyped.length - 1] ?? "";
  const lastWasCorrect = lastTyped.length > 0 && lastTyped === lastExpected;

  statsLine.setText(
    `wpm ${grossWpm.toFixed(1)}   acc ${accuracy.toFixed(0)}%   errors ${errors}   time ${formatSeconds(elapsedMs)}s`,
  );
  statsLine.setStyle({
    foreground: finished ? THEME.ok : errors > 0 ? THEME.warn : THEME.text,
  });

  promptLine.setText(prompt);
  promptLine.setStyle({ foreground: THEME.text });

  typedLine.setText(currentTyped.length === 0 ? "start typing" : currentTyped);
  typedLine.setStyle({
    foreground:
      finished && errors === 0
        ? THEME.accent
        : errors > 0 && lastTyped !== prompt[currentTyped.length - 1]
          ? THEME.fail
          : THEME.muted,
  });

  for (const key of allKeys) {
    const isLastPressed = key.value === lastTyped && lastTyped.length > 0;
    key.node.setStyle({
      foreground: isLastPressed ? THEME.ink : THEME.muted,
      background: isLastPressed ? (lastWasCorrect ? THEME.ok : THEME.fail) : undefined,
    });
  }

  const lastWasSpace = lastTyped === " ";
  spacebarLabel.setStyle({
    foreground: lastWasSpace ? THEME.ink : THEME.muted,
    background: lastWasSpace ? (lastWasCorrect ? THEME.ok : THEME.fail) : undefined,
  });

  if (finished) {
    hintLine.setText("enter next prompt   backspace revise   esc quit");
    hintLine.setStyle({
      foreground: errors === 0 ? THEME.ok : THEME.warn,
    });
    return;
  }

  hintLine.setText("type letters + space   backspace edit   enter next   esc quit");
  hintLine.setStyle({ foreground: THEME.muted });
});

// --- Runtime ---

const clock = setInterval(() => {
  if (startedAt() === null || finishedAt() !== null) return;
  now(Date.now());
}, CLOCK_TICK_MS);

const app = run(root);

let stopped = false;
function quit(): void {
  if (stopped) return;
  stopped = true;
  clearInterval(clock);
  app.quit();
}

for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  onKey(letter, () => handleTypedChar(letter));
}

onKey(" ", () => handleTypedChar(" "));
onKey("\x08", handleBackspace);
onKey("\x7f", handleBackspace);
onKey("\r", nextPrompt);
onKey("\n", nextPrompt);
onKey("\x1b", quit);
