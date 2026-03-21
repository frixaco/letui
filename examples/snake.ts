import { Column, Row, Text, $, ff, onKey, run } from "../index.ts";

const BOARD_WIDTH = 16;
const BOARD_HEIGHT = 12;
const TICK_MS = 130;
const CELL_WIDTH = CELL_TEXT_WIDTH();
const BOARD_RENDER_WIDTH = BOARD_WIDTH * CELL_WIDTH;
const BOARD_FRAME_WIDTH = BOARD_RENDER_WIDTH + 2;

function CELL_TEXT_WIDTH(): number {
  return 2;
}

const THEME = {
  border: 0x23445d,
  text: 0xe5f2ff,
  muted: 0x84a3be,
  accent: 0x51e3a5,
  accentDim: 0x2f8a67,
  food: 0xff7b72,
  pause: 0xffc670,
  fail: 0xff5c7a,
  win: 0x7ed7ff,
} as const;

type Direction = "up" | "down" | "left" | "right";
type Status = "running" | "paused" | "lost" | "won";
type Point = { x: number; y: number };
type GameState = {
  snake: Point[];
  direction: Direction;
  food: Point;
  status: Status;
  score: number;
  best: number;
  tick: number;
};

const EMPTY = 0;
const BODY = 1;
const HEAD = 2;
const FOOD = 3;

const CELL_TEXT = "  ";
const EMPTY_STYLE = {
  text: CELL_TEXT,
  background: undefined,
  foreground: undefined,
};
const BODY_STYLE = {
  text: CELL_TEXT,
  background: THEME.accentDim,
  foreground: THEME.accentDim,
};
const HEAD_STYLE = {
  text: CELL_TEXT,
  background: THEME.accent,
  foreground: THEME.accent,
};
const FOOD_STYLE = {
  text: "• ",
  background: undefined,
  foreground: THEME.food,
};

function isSamePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

function nextHead(head: Point, direction: Direction): Point {
  if (direction === "up") return { x: head.x, y: head.y - 1 };
  if (direction === "down") return { x: head.x, y: head.y + 1 };
  if (direction === "left") return { x: head.x - 1, y: head.y };
  return { x: head.x + 1, y: head.y };
}

function spawnFood(snake: Point[]): Point | null {
  const occupied = new Set(snake.map((segment) => `${segment.x}:${segment.y}`));
  const free: Point[] = [];

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (!occupied.has(`${x}:${y}`)) {
        free.push({ x, y });
      }
    }
  }

  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)] ?? null;
}

function createInitialState(best = 0): GameState {
  const midY = Math.floor(BOARD_HEIGHT / 2);
  const midX = Math.floor(BOARD_WIDTH / 2);
  const snake = [
    { x: midX + 1, y: midY },
    { x: midX, y: midY },
    { x: midX - 1, y: midY },
  ];
  const food = spawnFood(snake) ?? { x: 1, y: 1 };

  return {
    snake,
    direction: "right",
    food,
    status: "running",
    score: 0,
    best,
    tick: 0,
  };
}

function advance(state: GameState, direction: Direction): GameState {
  const head = state.snake[0];
  if (!head) return { ...state, status: "lost" };

  const candidate = nextHead(head, direction);
  const hitWall =
    candidate.x < 0 ||
    candidate.y < 0 ||
    candidate.x >= BOARD_WIDTH ||
    candidate.y >= BOARD_HEIGHT;
  if (hitWall) {
    return {
      ...state,
      direction,
      status: "lost",
      best: Math.max(state.best, state.score),
      tick: state.tick + 1,
    };
  }

  const grows = isSamePoint(candidate, state.food);
  const collisionBody = grows ? state.snake : state.snake.slice(0, -1);
  const hitSelf = collisionBody.some((segment) => isSamePoint(segment, candidate));
  if (hitSelf) {
    return {
      ...state,
      direction,
      status: "lost",
      best: Math.max(state.best, state.score),
      tick: state.tick + 1,
    };
  }

  const nextSnake = [candidate, ...state.snake];
  if (!grows) nextSnake.pop();

  if (!grows) {
    return {
      ...state,
      snake: nextSnake,
      direction,
      tick: state.tick + 1,
    };
  }

  const nextScore = state.score + 1;
  const nextBest = Math.max(state.best, nextScore);
  const nextFood = spawnFood(nextSnake);
  return {
    snake: nextSnake,
    direction,
    food: nextFood ?? candidate,
    status: nextFood ? "running" : "won",
    score: nextScore,
    best: nextBest,
    tick: state.tick + 1,
  };
}

function statusLabel(status: Status): string {
  if (status === "paused") return "paused";
  if (status === "lost") return "crashed";
  if (status === "won") return "cleared";
  return "running";
}

const state = $(createInitialState());
let pendingDirection: Direction | null = null;

const title = Text({
  text: "snake",
  foreground: THEME.accent,
});

const statsLine = Text({
  text: "",
  foreground: THEME.text,
});

const cellNodes: ReturnType<typeof Text>[][] = [];
const boardRows = Array.from({ length: BOARD_HEIGHT }, () => {
  const rowCells = Array.from({ length: BOARD_WIDTH }, () =>
    Text({
      text: EMPTY_STYLE.text,
      background: EMPTY_STYLE.background,
      foreground: EMPTY_STYLE.foreground,
    }),
  );
  cellNodes.push(rowCells);
  return Row({ gap: 0 }, rowCells);
});

const board = Column(
  {
    gap: 0,
    padding: "0 0",
  },
  boardRows,
);

const boardPanel = Column(
  {
    gap: 0,
    width: BOARD_FRAME_WIDTH,
    minWidth: BOARD_FRAME_WIDTH,
    maxWidth: BOARD_FRAME_WIDTH,
    padding: "0 0",
    border: { color: THEME.border, style: "rounded" },
  },
  [board],
);

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    alignItems: "flexStart",
  },
  [title, statsLine, boardPanel],
);

function paintCell(x: number, y: number, kind: number): void {
  const node = cellNodes[y]?.[x];
  if (!node) return;

  if (kind === BODY) {
    node.setText(BODY_STYLE.text);
    node.setStyle({
      background: BODY_STYLE.background,
      foreground: BODY_STYLE.foreground,
    });
    return;
  }

  if (kind === HEAD) {
    node.setText(HEAD_STYLE.text);
    node.setStyle({
      background: HEAD_STYLE.background,
      foreground: HEAD_STYLE.foreground,
    });
    return;
  }

  if (kind === FOOD) {
    node.setText(FOOD_STYLE.text);
    node.setStyle({
      background: FOOD_STYLE.background,
      foreground: FOOD_STYLE.foreground,
    });
    return;
  }

  node.setText(EMPTY_STYLE.text);
  node.setStyle({
    background: EMPTY_STYLE.background,
    foreground: EMPTY_STYLE.foreground,
  });
}

let renderedKinds = new Uint8Array(BOARD_WIDTH * BOARD_HEIGHT);
renderedKinds.fill(255);

ff(() => {
  const current = state();
  const status = statusLabel(current.status);
  statsLine.setText(
    `score ${current.score}   best ${current.best}   len ${current.snake.length}   status ${status}`,
  );
  statsLine.setStyle({
    foreground:
      current.status === "paused"
        ? THEME.pause
        : current.status === "lost"
          ? THEME.fail
          : current.status === "won"
            ? THEME.win
            : THEME.text,
  });

  const nextKinds = new Uint8Array(BOARD_WIDTH * BOARD_HEIGHT);

  for (let i = current.snake.length - 1; i >= 1; i--) {
    const segment = current.snake[i];
    if (!segment) continue;
    nextKinds[segment.y * BOARD_WIDTH + segment.x] = BODY;
  }

  const head = current.snake[0];
  if (head) {
    nextKinds[head.y * BOARD_WIDTH + head.x] = HEAD;
  }

  if (current.status !== "won") {
    nextKinds[current.food.y * BOARD_WIDTH + current.food.x] = FOOD;
  }

  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const index = y * BOARD_WIDTH + x;
      const kind = nextKinds[index] ?? EMPTY;
      if (renderedKinds[index] === kind) continue;
      renderedKinds[index] = kind;
      paintCell(x, y, kind);
    }
  }
});

function queueDirection(next: Direction): void {
  const current = state();
  if (current.status === "lost" || current.status === "won") return;

  if (current.status === "paused") {
    if (isOpposite(current.direction, next)) return;
    state({ ...current, direction: next });
    return;
  }

  const reference = pendingDirection ?? current.direction;
  if (isOpposite(reference, next)) return;
  pendingDirection = next;
}

function restart(): void {
  pendingDirection = null;
  state(createInitialState(state().best));
}

function togglePause(): void {
  const current = state();
  if (current.status === "lost" || current.status === "won") return;
  state({
    ...current,
    status: current.status === "paused" ? "running" : "paused",
  });
}

const timer = setInterval(() => {
  const current = state();
  if (current.status !== "running") return;

  const direction = pendingDirection ?? current.direction;
  pendingDirection = null;
  state(advance(current, direction));
}, TICK_MS);

const app = run(root);

let stopped = false;
function quit(): void {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  app.quit();
}

onKey("w", () => queueDirection("up"));
onKey("a", () => queueDirection("left"));
onKey("s", () => queueDirection("down"));
onKey("d", () => queueDirection("right"));
onKey("k", () => queueDirection("up"));
onKey("h", () => queueDirection("left"));
onKey("j", () => queueDirection("down"));
onKey("l", () => queueDirection("right"));
onKey("\x1b[A", () => queueDirection("up"));
onKey("\x1b[D", () => queueDirection("left"));
onKey("\x1b[B", () => queueDirection("down"));
onKey("\x1b[C", () => queueDirection("right"));
onKey(" ", togglePause);
onKey("r", restart);
onKey("q", quit);
