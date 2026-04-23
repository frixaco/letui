// Snake demo: classic arcade loop that exercises timer-driven rendering and styled cell updates.
//
// Data flow:
// keyboard direction input + timer tick -> snake state -> ff() effect -> score badges, board rows, and game-state copy

import { Column, Row, Text, $, ff, onKey, run } from "@";
import type { StyledText, TextSpan } from "@";

type Direction = "up" | "down" | "left" | "right";
type GameState = "running" | "paused" | "dead";
type Point = { x: number; y: number };

const BOARD_WIDTH = 24;
const BOARD_HEIGHT = 18;
const TICK_MS = 95;

const THEME = {
  shell: 0x08100c,
  panel: 0x111a15,
  board: 0x16251d,
  text: 0xf1f6dc,
  muted: 0x90a187,
  line: 0x32503f,
  head: 0xf4ff6d,
  body: 0x54f27d,
  tail: 0x25a857,
  food: 0xff6b6b,
  badgeInk: 0x0b120e,
  paused: 0xffcf70,
  dead: 0xff7c8f,
} as const;

const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const boardRows = Array.from({ length: BOARD_HEIGHT }, () =>
  Text({
    text: "",
    background: THEME.board,
  }),
);

const title = Text({
  text: "SNAKE // REACTIVE LOOP",
  foreground: THEME.head,
});
const meta = Text({ text: "", foreground: THEME.muted });
const scoreBadge = Text({
  text: "",
  foreground: THEME.badgeInk,
  background: THEME.head,
  paddingX: 1,
});
const bestBadge = Text({
  text: "",
  foreground: THEME.badgeInk,
  background: THEME.body,
  paddingX: 1,
});
const stateBadge = Text({
  text: "",
  foreground: THEME.badgeInk,
  background: THEME.paused,
  paddingX: 1,
});
const statusLine = Text({ text: "", foreground: THEME.text, wrap: "word" });
const helpLine = Text({
  text: "arrows / wasd steer   space pause   r restart   q quit",
  foreground: THEME.muted,
  wrap: "word",
});

function pointKey(point: Point): string {
  return `${point.x}:${point.y}`;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function initialSnake(): Point[] {
  return [
    { x: Math.floor(BOARD_WIDTH / 2), y: Math.floor(BOARD_HEIGHT / 2) },
    { x: Math.floor(BOARD_WIDTH / 2) - 1, y: Math.floor(BOARD_HEIGHT / 2) },
    { x: Math.floor(BOARD_WIDTH / 2) - 2, y: Math.floor(BOARD_HEIGHT / 2) },
  ];
}

function spawnFood(currentSnake: readonly Point[]): Point {
  const occupied = new Set(currentSnake.map(pointKey));

  while (true) {
    const candidate = { x: randomInt(BOARD_WIDTH), y: randomInt(BOARD_HEIGHT) };
    if (!occupied.has(pointKey(candidate))) {
      return candidate;
    }
  }
}

const startingSnake = initialSnake();
const snake = $<Point[]>(startingSnake);
const direction = $("right" as Direction);
const food = $<Point>(spawnFood(startingSnake));
const score = $(0);
const best = $(0);
const state = $("running" as GameState);
const tickCount = $(0);

let queuedDirection: Direction = "right";

function resetGame(): void {
  const freshSnake = initialSnake();
  snake(freshSnake);
  direction("right");
  queuedDirection = "right";
  food(spawnFood(freshSnake));
  score(0);
  tickCount(0);
  state("running");
}

function queueDirection(next: Direction): void {
  if (state() === "dead") return;
  const current = direction();
  if (next === current || next === OPPOSITE[current]) return;
  queuedDirection = next;
}

function nextHead(head: Point, dir: Direction): Point {
  const vector = DIRECTION_VECTORS[dir];
  return {
    x: head.x + vector.x,
    y: head.y + vector.y,
  };
}

function tailColor(index: number): number {
  if (index === 0) return THEME.head;
  if (index < 4) return THEME.body;
  return THEME.tail;
}

function buildBoardRow(
  rowIndex: number,
  snakeIndexByCell: Map<string, number>,
  currentFood: Point,
): StyledText {
  const text = " ".repeat(BOARD_WIDTH * 2);
  const spans: TextSpan[] = [];

  for (let x = 0; x < BOARD_WIDTH; x++) {
    const start = x * 2;
    const end = start + 2;
    const lookup = snakeIndexByCell.get(`${x}:${rowIndex}`);

    if (lookup !== undefined) {
      spans.push({
        start,
        end,
        background: tailColor(lookup),
      });
      continue;
    }

    if (currentFood.x === x && currentFood.y === rowIndex) {
      spans.push({
        start,
        end,
        background: THEME.food,
      });
    }
  }

  return { text, spans };
}

ff(() => {
  const currentSnake = snake();
  const currentFood = food();
  const currentScore = score();
  const currentBest = best();
  const currentState = state();
  const currentTick = tickCount();

  const snakeIndexByCell = new Map<string, number>();
  currentSnake.forEach((point, index) => {
    snakeIndexByCell.set(pointKey(point), index);
  });

  for (let rowIndex = 0; rowIndex < BOARD_HEIGHT; rowIndex++) {
    boardRows[rowIndex]!.setText(buildBoardRow(rowIndex, snakeIndexByCell, currentFood));
  }

  meta.setText(
    `cells ${BOARD_WIDTH}x${BOARD_HEIGHT}   length ${currentSnake.length}   tick ${currentTick}   heading ${direction()}`,
  );
  scoreBadge.setText(` score ${currentScore} `);
  bestBadge.setText(` best ${currentBest} `);

  if (currentState === "dead") {
    stateBadge.setText(" crashed ");
    stateBadge.setStyle({ background: THEME.dead, foreground: THEME.badgeInk });
    statusLine.setText("The snake hit a wall or its own body. Press r to restart the loop.");
    statusLine.setStyle({ foreground: THEME.dead });
  } else if (currentState === "paused") {
    stateBadge.setText(" paused ");
    stateBadge.setStyle({ background: THEME.paused, foreground: THEME.badgeInk });
    statusLine.setText("Paused mid-run. Space resumes instantly and keeps the current heading.");
    statusLine.setStyle({ foreground: THEME.paused });
  } else {
    stateBadge.setText(" running ");
    stateBadge.setStyle({ background: THEME.body, foreground: THEME.badgeInk });
    statusLine.setText("Eat the red cell, avoid the walls, and never reverse into your own body.");
    statusLine.setStyle({ foreground: THEME.text });
  }
});

const board = Column(
  {
    gap: 0,
    padding: "1 1",
    background: THEME.board,
    border: { color: THEME.line, style: "rounded" },
  },
  boardRows,
);

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: THEME.shell,
    alignItems: "center",
    justifyContent: "center",
  },
  [
    Column(
      {
        width: BOARD_WIDTH * 2 + 10,
        maxWidth: BOARD_WIDTH * 2 + 10,
        gap: 1,
        padding: "1 1",
        background: THEME.panel,
        border: { color: THEME.line, style: "rounded" },
      },
      [
        Row({ justifyContent: "spaceBetween", gap: 1, flexWrap: "wrap" }, [
          Column({ gap: 0 }, [title, meta]),
          Row({ gap: 1, flexWrap: "wrap" }, [scoreBadge, bestBadge, stateBadge]),
        ]),
        board,
        statusLine,
        helpLine,
      ],
    ),
  ],
);

function stepGame(): void {
  if (state() !== "running") return;

  const currentSnake = snake();
  const currentHead = currentSnake[0];
  if (!currentHead) return;

  const nextDirectionValue = queuedDirection;
  const upcomingHead = nextHead(currentHead, nextDirectionValue);
  direction(nextDirectionValue);
  const ateFood = upcomingHead.x === food().x && upcomingHead.y === food().y;

  const hitWall =
    upcomingHead.x < 0 ||
    upcomingHead.y < 0 ||
    upcomingHead.x >= BOARD_WIDTH ||
    upcomingHead.y >= BOARD_HEIGHT;

  const bodyToCheck = ateFood ? currentSnake : currentSnake.slice(0, -1);
  const hitBody = bodyToCheck.some(
    (segment) => segment.x === upcomingHead.x && segment.y === upcomingHead.y,
  );

  if (hitWall || hitBody) {
    state("dead");
    best(Math.max(best(), score()));
    return;
  }

  const nextSnake = [upcomingHead, ...currentSnake];

  if (!ateFood) {
    nextSnake.pop();
  } else {
    const nextScore = score() + 1;
    score(nextScore);
    best(Math.max(best(), nextScore));
  }

  snake(nextSnake);

  if (ateFood) {
    food(spawnFood(nextSnake));
  }

  tickCount(tickCount() + 1);
}

const timer = setInterval(stepGame, TICK_MS);
resetGame();
const app = run(root, { debug: true, metricsPath: "dump/metrics.txt", appearance: "dark" });

onKey("w", () => queueDirection("up"));
onKey("a", () => queueDirection("left"));
onKey("s", () => queueDirection("down"));
onKey("d", () => queueDirection("right"));
onKey("\x1b[A", () => queueDirection("up"));
onKey("\x1bOA", () => queueDirection("up"));
onKey("\x1b[B", () => queueDirection("down"));
onKey("\x1bOB", () => queueDirection("down"));
onKey("\x1b[C", () => queueDirection("right"));
onKey("\x1bOC", () => queueDirection("right"));
onKey("\x1b[D", () => queueDirection("left"));
onKey("\x1bOD", () => queueDirection("left"));
onKey(" ", () => {
  if (state() === "dead") return;
  state(state() === "paused" ? "running" : "paused");
});
onKey("r", resetGame);
onKey("q", () => {
  clearInterval(timer);
  app.quit();
});
