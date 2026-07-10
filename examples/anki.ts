// Anki flashcard demo: two-screen, keyboard-first deck selection and review UI.
//
// Data flow:
// keyboard / click navigation -> screen + selection signals -> ff() effect ->
// deck rows, review card, and rating controls

import { Button, Column, Row, ScrollView, Text, $, appearance, ff, onKey, run } from "@";
import type { StyledText } from "@";
import { styled, NAV_NEXT_KEYS, NAV_PREV_KEYS } from "./helpers.ts";

function startAnkiDemo(): ReturnType<typeof run> {
  const screen = $<Screen>("home");
  const activeDeckIndex = $(0);
  const activeCardIndex = $(0);
  const answerRevealed = $(false);
  const activeRatingIndex = $(2);

  let deckRows: DeckRowView[] = [];
  let ratingButtons: RatingButtonView[] = [];

  const brand = Text({
    text: brandText(THEME),
  });

  const header = Row({ flexShrink: 0, alignItems: "start" }, [brand]);

  const deckHint = Text({
    text: keyHintText(THEME, HOME_HINTS),
    wrap: "word",
  });
  const deckViewport = ScrollView(
    {
      ...FILL,
      gap: 1,
      onScroll: ({ deltaY }) => {
        if (deltaY === 0) return;
        deckViewport.scrollBy(deltaY);
      },
    },
    [],
  );
  const homePanel = Column(
    {
      ...FILL,
      gap: 2,
    },
    [deckViewport, deckHint],
  );

  const reviewDeckName = Text({
    text: "",
    foreground: THEME.accent,
    textOverflow: "ellipsis",
  });
  const reviewProgress = Text({ text: "", foreground: THEME.muted });
  const reviewHeader = Row(
    {
      width: CARD_WIDTH,
      justifyContent: "spaceBetween",
      alignItems: "center",
      gap: 2,
    },
    [reviewDeckName, reviewProgress],
  );
  const reviewHint = Text({
    width: CARD_WIDTH,
    text: keyHintText(THEME, REVIEW_HINTS),
    wrap: "word",
  });
  const promptText = createCardText();
  const answerText = createCardText();
  const promptLine = Row({ width: CARD_TEXT_WIDTH, justifyContent: "center" }, [promptText]);
  const answerLine = Row({ width: CARD_TEXT_WIDTH, justifyContent: "center" }, [answerText]);
  const cardPanel = Column(
    {
      width: CARD_WIDTH,
      minHeight: 8,
      flexShrink: 0,
      gap: 1,
      padding: "2 3",
      ...CENTER,
      border: { color: THEME.lineLight, style: "rounded" },
    },
    [promptLine, answerLine],
  );
  const ratingStrip = Row({ width: CARD_WIDTH, flexShrink: 0, gap: 1 }, []);
  const reviewPanel = Column(
    {
      ...FILL,
      gap: 2,
      ...CENTER,
    },
    [reviewHeader, cardPanel, ratingStrip, reviewHint],
  );

  const appFrame = Column(
    {
      width: APP_WIDTH,
      maxWidth: APP_WIDTH,
      flexShrink: 0,
      gap: 2,
      padding: "2 2",
    },
    [header, homePanel],
  );

  const root = Column(
    {
      ...FILL,
      padding: "2 2",
      gap: 1,
      alignItems: "center",
    },
    [appFrame],
  );

  function openDeck(index: number): void {
    const deck = DECKS[index];
    if (!deck) return;

    activeDeckIndex(index);
    activeCardIndex(0);
    answerRevealed(false);
    activeRatingIndex(2);
    screen("review");
    appFrame.setChildren([reviewPanel]);
    focusRating(2);
  }

  function returnHome(): void {
    screen("home");
    answerRevealed(false);
    appFrame.setChildren([header, homePanel]);
    focusDeck(activeDeckIndex());
  }

  function focusDeck(index: number): void {
    const row = deckRows[index];
    if (!row) return;

    activeDeckIndex(index);
    row.button.focus();
    deckViewport.scrollNodeIntoView(row.button);
  }

  function moveDeck(delta: number): void {
    const next = clamp(activeDeckIndex() + delta, 0, DECKS.length - 1);
    focusDeck(next);
  }

  function revealAnswer(): void {
    if (screen() !== "review") return;

    answerRevealed(true);
    focusRating(activeRatingIndex());
  }

  function focusRating(index: number): void {
    const rating = ratingButtons[index];
    if (!rating) return;

    activeRatingIndex(index);
    rating.button.focus();
  }

  function moveRating(delta: number): void {
    if (screen() !== "review" || !answerRevealed()) return;
    focusRating(clamp(activeRatingIndex() + delta, 0, RATINGS.length - 1));
  }

  function advanceCard(delta: number): void {
    if (screen() !== "review") return;

    const deck = DECKS[activeDeckIndex()];
    if (!deck) return;

    activeCardIndex(wrap(activeCardIndex() + delta, deck.cards.length));
    answerRevealed(false);
    activeRatingIndex(2);
    focusRating(2);
  }

  function chooseRating(index: number): void {
    if (screen() !== "review") return;

    if (!answerRevealed()) {
      revealAnswer();
      return;
    }

    activeRatingIndex(clamp(index, 0, RATINGS.length - 1));
    advanceCard(1);
  }

  function onDeckKeyDown(key: string): boolean {
    if (NAV_NEXT_KEYS.has(key)) {
      moveDeck(1);
    } else if (NAV_PREV_KEYS.has(key)) {
      moveDeck(-1);
    } else if (key === "\r") {
      openDeck(activeDeckIndex());
    } else {
      return false;
    }

    return true;
  }

  function onRatingKeyDown(key: string): boolean {
    if (key === "\x1b") {
      returnHome();
      return true;
    }

    if (!answerRevealed()) return false;

    if (RATING_PREV_KEYS.has(key)) {
      moveRating(-1);
    } else if (RATING_NEXT_KEYS.has(key)) {
      moveRating(1);
    } else if (key === "\r" || key === " ") {
      chooseRating(activeRatingIndex());
    } else {
      return false;
    }

    return true;
  }

  deckRows = DECKS.map((deck, index) =>
    createDeckRow(deck, index, {
      onFocus: focusDeck,
      onActivate: openDeck,
      onKeyDown: onDeckKeyDown,
    }),
  );
  deckViewport.setChildren(deckRows.map((row) => row.button));

  ratingButtons = RATINGS.map((rating, index) =>
    createRatingButton(rating, index, {
      onFocus: focusRating,
      onActivate: chooseRating,
      onKeyDown: onRatingKeyDown,
    }),
  );
  ratingStrip.setChildren(ratingButtons.map((rating) => rating.button));

  ff(() => {
    const theme = currentTheme();
    const deckIndex = activeDeckIndex();
    const deck = DECKS[deckIndex] ?? DECKS[0]!;
    const cardIndex = clamp(activeCardIndex(), 0, deck.cards.length - 1);
    const card = deck.cards[cardIndex]!;
    const revealed = answerRevealed();
    const ratingIndex = activeRatingIndex();

    brand.setText(brandText(theme));
    deckHint.setText(keyHintText(theme, HOME_HINTS));
    reviewHint.setText(keyHintText(theme, REVIEW_HINTS));
    reviewDeckName.setStyle({ foreground: theme.accent });
    reviewProgress.setStyle({ foreground: theme.muted });
    promptText.setStyle({ foreground: theme.text });

    for (const [index, row] of deckRows.entries()) {
      const source = DECKS[index]!;
      const isActive = index === deckIndex;
      row.title.setText(deckTitleText(source, isActive, theme));
      row.meta.setText(deckStatsText(source, isActive, theme));
    }

    reviewDeckName.setText(deck.name);
    reviewProgress.setText(`${cardIndex + 1}/${deck.cards.length}`);
    promptText.setText(card.front);
    answerText.setText(revealed ? card.back : "");
    answerText.setStyle({
      foreground: revealed ? theme.text : theme.dim,
    });
    cardPanel.setStyle({
      border: { color: revealed ? theme.accent : theme.lineLight, style: "rounded" },
    });

    for (const [index, rating] of ratingButtons.entries()) {
      const isActive = index === ratingIndex;
      const color = theme[rating.source.color];
      const activeColor = theme[rating.source.activeColor];

      rating.button.setStyle({
        foreground: revealed ? theme.text : theme.dim,
        border: revealed ? { color: isActive ? activeColor : color, style: "rounded" } : undefined,
      });
      rating.label.setText(revealed ? `${index + 1} ${rating.source.label}` : "");
      rating.label.setStyle({
        foreground: revealed && isActive ? activeColor : revealed ? color : theme.dim,
      });
    }
  });

  for (const key of NAV_NEXT_KEYS) onKey(key, () => screen() === "home" && moveDeck(1));
  for (const key of NAV_PREV_KEYS) onKey(key, () => screen() === "home" && moveDeck(-1));

  onKey("\r", () => screen() === "home" && openDeck(activeDeckIndex()));
  onKey(" ", revealAnswer);
  onKey("\x1b", returnHome);
  for (const [key, delta] of CARD_MOVE_KEYS) onKey(key, () => advanceCard(delta));

  for (const key of ["1", "2", "3", "4"]) {
    onKey(key, () => chooseRating(Number(key) - 1));
  }

  const app = run(root, { appearance: "auto" });
  onKey("q", () => app.quit());
  onKey("\x11", () => app.quit());

  focusDeck(0);
  return app;
}

type Screen = "home" | "review";

type Deck = {
  name: string;
  due: number;
  newCards: number;
  cards: readonly Flashcard[];
};

type Flashcard = {
  front: string;
  back: string;
};

type Rating = {
  label: string;
  color: ThemeColor;
  activeColor: ThemeColor;
};

type DeckRowView = {
  button: ReturnType<typeof Button>;
  title: ReturnType<typeof Text>;
  meta: ReturnType<typeof Text>;
};

type RatingButtonView = {
  source: Rating;
  button: ReturnType<typeof Button>;
  label: ReturnType<typeof Text>;
};

type ButtonHandlers = {
  onFocus: (index: number) => void;
  onActivate: (index: number) => void;
  onKeyDown: (key: string) => boolean;
};

type ThemeColor =
  | "text"
  | "muted"
  | "dim"
  | "lineLight"
  | "accent"
  | "red"
  | "redBright"
  | "amber"
  | "amberBright"
  | "green"
  | "greenBright"
  | "cyan"
  | "cyanBright";
type Theme = Record<ThemeColor, number>;
type HintPart = readonly [key: string, text: string];

const APP_WIDTH = 56;
const CARD_WIDTH = 44;
const CARD_TEXT_WIDTH = 34;
const FILL = { flexGrow: 1, minHeight: 0 } as const;
const CENTER = { alignItems: "center", justifyContent: "center" } as const;

const THEME = {
  text: 0xe7e0d3,
  muted: 0x8a8580,
  dim: 0x5c5854,
  lineLight: 0x6f6a64,
  accent: 0x88a7cf,
  red: 0xb56f69,
  redBright: 0xe1958e,
  amber: 0xb8944c,
  amberBright: 0xe2bd68,
  green: 0x7ea271,
  greenBright: 0xa8cf97,
  cyan: 0x78a8a7,
  cyanBright: 0xa1d3d0,
} as const;

const LIGHT_THEME: Theme = {
  text: 0x27231f,
  muted: 0x70675f,
  dim: 0x9a8f84,
  lineLight: 0x9f9488,
  accent: 0x4b6f9f,
  red: 0xb85f55,
  redBright: 0xd8483c,
  amber: 0x9f7622,
  amberBright: 0xc88612,
  green: 0x5d874d,
  greenBright: 0x3f8f2f,
  cyan: 0x4d8786,
  cyanBright: 0x2a9694,
};

const DECKS: readonly Deck[] = [
  deck("Japanese Core", 18, 6, [
    card(
      "What does 便利 mean?",
      "Convenient or useful. Often used for tools, locations, and services.",
    ),
    card(
      "Complete: 駅まで歩いて___。",
      "駅まで歩いて行きます。Use 行きます to describe going by walking.",
    ),
    card(
      "How do you soften a request with ください?",
      "Attach it after the te-form: 見てください, 書いてください, 待ってください.",
    ),
  ]),
  deck("Systems Design", 12, 3, [
    card(
      "Why add backpressure to a queue consumer?",
      "To stop intake from exceeding processing capacity and pushing failure downstream.",
    ),
    card(
      "Name the main risk of cache-aside.",
      "Stale reads after writes unless invalidation or expiry is handled deliberately.",
    ),
    card(
      "What should a retry policy always include?",
      "A limit, jittered backoff, and idempotency or duplicate protection.",
    ),
  ]),
  deck("TypeScript Patterns", 9, 4, [
    card(
      "When should a function accept &str instead of String?",
      "When it only needs to read borrowed text and should not require ownership.",
    ),
    card(
      "What does ? do inside a function returning Result?",
      "It returns early on Err and unwraps the Ok value on success.",
    ),
    card(
      "Why prefer an enum over stringly typed states?",
      "The compiler can check exhaustiveness and prevent invalid state names.",
    ),
  ]),
];

const RATINGS: readonly Rating[] = [
  { label: "Again", color: "red", activeColor: "redBright" },
  { label: "Hard", color: "amber", activeColor: "amberBright" },
  { label: "Good", color: "green", activeColor: "greenBright" },
  { label: "Easy", color: "cyan", activeColor: "cyanBright" },
];

const HOME_HINTS: readonly HintPart[] = [
  ["j/k", " move   "],
  ["enter", " review   "],
  ["q", " quit"],
];
const REVIEW_HINTS: readonly HintPart[] = [
  ["space", " reveal   "],
  ["1-4", " grade   "],
  ["n/p", " move   "],
  ["esc", " decks"],
];

const RATING_PREV_KEYS = new Set(["\x1b[D", "\x1bOD", "h"]);
const RATING_NEXT_KEYS = new Set(["\x1b[C", "\x1bOC", "l"]);
const CARD_MOVE_KEYS = [
  ["n", 1],
  ["\x1b[C", 1],
  ["\x1bOC", 1],
  ["p", -1],
  ["\x1b[D", -1],
  ["\x1bOD", -1],
] as const;

function createDeckRow(deck: Deck, index: number, handlers: ButtonHandlers): DeckRowView {
  const title = Text({ text: deckTitleText(deck, false), wrap: "none", textOverflow: "ellipsis" });
  const meta = Text({ text: deckStatsText(deck, false), width: 12, flexShrink: 0 });

  const button = Button(
    {
      text: "",
      padding: "0 0",
      onFocus: () => handlers.onFocus(index),
      onClick: () => handlers.onActivate(index),
      onKeyDown: handlers.onKeyDown,
    },
    [
      Row({ gap: 2, alignItems: "start" }, [
        Column({ gap: 0, minWidth: 0, flexGrow: 1 }, [title]),
        meta,
      ]),
    ],
  );

  return { button, title, meta };
}

function createRatingButton(
  rating: Rating,
  index: number,
  handlers: ButtonHandlers,
): RatingButtonView {
  const label = Text({
    text: "",
    foreground: THEME.text,
  });
  const button = Button(
    {
      text: "",
      minWidth: 9,
      flexGrow: 1,
      padding: "1 1",
      onFocus: () => handlers.onFocus(index),
      onClick: () => handlers.onActivate(index),
      onKeyDown: handlers.onKeyDown,
    },
    [label],
  );

  return { source: rating, button, label };
}

function createCardText(): ReturnType<typeof Text> {
  return Text({ text: "", maxWidth: CARD_TEXT_WIDTH, foreground: THEME.text, wrap: "word" });
}

function deck(name: string, due: number, newCards: number, cards: readonly Flashcard[]): Deck {
  return { name, due, newCards, cards };
}

function card(front: string, back: string): Flashcard {
  return { front, back };
}

function currentTheme(): Theme {
  return appearance() === "light" ? LIGHT_THEME : THEME;
}

function brandText(theme: Theme): StyledText {
  return styled([{ text: "anki", foreground: theme.accent, bold: true }]);
}

function keyHintText(theme: Theme, parts: readonly HintPart[]): StyledText {
  return styled(
    parts.flatMap(([key, text]) => [
      { text: key, foreground: theme.accent, bold: true },
      { text, foreground: theme.muted },
    ]),
  );
}

function deckTitleText(deck: Deck, active: boolean, theme: Theme = THEME): StyledText {
  return styled([
    { text: active ? "> " : "  ", foreground: active ? theme.accent : theme.dim },
    {
      text: deck.name,
      foreground: active ? theme.text : theme.muted,
      bold: true,
    },
  ]);
}

function deckStatsText(deck: Deck, active: boolean, theme: Theme = THEME): StyledText {
  const fg = active ? theme.text : theme.dim;
  return styled([
    { text: `${deck.due} / ${deck.newCards} / ${deck.cards.length}`.padStart(12), foreground: fg },
  ]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

startAnkiDemo();
