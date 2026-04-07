// ANITRACK torrent search demo: keyboard-first results browsing with stream staging.
//
// Data flow:
// Search input → fetchResults() → API call → toScrapeResults() → results signal update → ff() effect → result row rendering
// Keyboard → selectNext/selectPrev → selectedIndex signal → ff() effect → UI highlight update

import { existsSync } from "fs";
import { COLORS, Button, Column, Input, Row, Text, $, ff, onKey, run } from "@";
import { LoadingBar } from "./progress-bar";
import { tmpdir } from "os";
import { join } from "path";
import { saveMetrics } from "@/metrics";
import type { StyledText, TextSpan } from "@";

// --- Domain vocabulary ---

type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

type StyledSegment = Omit<TextSpan, "start" | "end"> & { text: string };

// --- Supporting types ---

const T = {
  bg: COLORS.default.bg,
  bgAlt: COLORS.default.bg_alt,
  bgHi: COLORS.default.bg_highlight,
  fg: COLORS.default.fg,
  muted: COLORS.default.grey,
  accent: COLORS.default.cyan,
  active: COLORS.default.green,
  warn: COLORS.default.yellow,
  dim: COLORS.default.grey,
  border: COLORS.default.bg_highlight,
  pink: COLORS.default.pink,
  purple: COLORS.default.purple,
  orange: COLORS.default.orange,
  badgeFg: COLORS.default.bg,
} as const;

const MPV_SOCKET_WAIT_MS = 5000;

// --- Internal state ---

const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);
const focusTarget = $<"input" | "results">("input");

// --- Core algorithm ---

function createMpvIpcPath(): string {
  const suffix = `${process.pid}-${Date.now()}`;

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\mpv-socket-${suffix}`;
  }

  return join(tmpdir(), `mpv-socket-${suffix}`);
}

async function waitForMpvIpc(path: string, timeoutMs: number): Promise<void> {
  if (process.platform === "win32") {
    await Bun.sleep(Math.min(timeoutMs, 150));
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) {
    await Bun.sleep(50);
  }
}

const loadingBar = LoadingBar({
  dotColor: T.accent,
  trackColor: T.border,
});

function textLength(text: string): number {
  return Array.from(text).length;
}

function styled(segments: readonly StyledSegment[]): StyledText {
  let text = "";
  let cursor = 0;
  const spans: TextSpan[] = [];
  for (const seg of segments) {
    const start = cursor;
    text += seg.text;
    cursor += textLength(seg.text);
    if (
      seg.foreground !== undefined ||
      seg.background !== undefined ||
      seg.bold !== undefined ||
      seg.italic !== undefined ||
      seg.underline !== undefined
    ) {
      spans.push({
        start,
        end: cursor,
        foreground: seg.foreground,
        background: seg.background,
        bold: seg.bold,
        italic: seg.italic,
        underline: seg.underline,
      });
    }
  }
  return { text, spans };
}

function toScrapeResults(payload: unknown): ScrapeResultItem[] {
  const rawResults = payload && typeof payload === "object" ? (payload as any).results : undefined;
  if (!Array.isArray(rawResults)) return [];

  const normalized: ScrapeResultItem[] = [];
  for (const item of rawResults) {
    if (!item || typeof item !== "object") continue;
    normalized.push({
      title: String((item as any).title ?? ""),
      size: String((item as any).size ?? ""),
      date: String((item as any).date ?? ""),
      magnet: String((item as any).magnet ?? ""),
    });
  }
  return normalized;
}

function toStreamTarget(payload: unknown): { infoHash: string; fileIndex: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const details = (payload as any).details;
  if (!details || typeof details !== "object") return null;
  const infoHash = details.info_hash;
  const files = details.files;
  if (typeof infoHash !== "string" || !Array.isArray(files) || files.length === 0) return null;
  return { infoHash, fileIndex: files.length - 1 };
}

function resetResultsToInput(): void {
  results([]);
  selectedIndex(0);
  focusInput();
}

function blurSearchInputIfFocused(): void {
  if (searchInput.isFocused()) {
    searchInput.blur();
  }
}

function focusResults(): void {
  focusTarget("results");
  blurSearchInputIfFocused();
}

async function fetchResults(query: string) {
  loading(true);
  loadingBar.start();
  try {
    const response = await fetch(
      `https://scrape.anitrack.frixaco.com/scrape?q=${encodeURIComponent(query)}`,
    );
    if (!response.ok) throw new Error(`Search failed with status ${response.status}`);
    const payload = await response.json();
    const parsedResults = toScrapeResults(payload);
    results(parsedResults);
    selectedIndex(0);
    if (parsedResults.length > 0) {
      focusResults();
    } else {
      focusInput();
    }
  } catch {
    resetResultsToInput();
  } finally {
    loading(false);
    loadingBar.stop();
  }
}

async function streamResult(magnet: string) {
  loadingBar.start();
  try {
    const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
      method: "post",
      body: magnet,
    });
    if (!response.ok) throw new Error(`Stream failed with status ${response.status}`);
    const payload = await response.json();
    const target = toStreamTarget(payload);
    if (!target) return;
    const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${target.infoHash}/stream/${target.fileIndex}`;
    const ipcPath = createMpvIpcPath();
    Bun.spawn({
      cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForMpvIpc(ipcPath, MPV_SOCKET_WAIT_MS);
  } catch {
    // Ignore launch failures so the demo keeps responding.
  } finally {
    loadingBar.stop();
  }
}

const idleBorder = { color: T.border, style: "rounded" as const };
const focusBorder = { color: T.active, style: "rounded" as const };

const headerTitle = Text({
  text: styled([
    { text: "ANITRACK", foreground: T.accent, bold: true },
    { text: " // ", foreground: T.muted },
    { text: "TORRENT SEARCH", foreground: T.fg, bold: true },
  ]),
});

const headerMeta = Text({
  text: "",
  foreground: T.muted,
  wrap: "word",
});

const statusBadge = Text({
  text: " idle ",
  foreground: T.badgeFg,
  background: T.muted,
  paddingX: 1,
});

const countBadge = Text({
  text: "",
  foreground: T.badgeFg,
  background: T.accent,
  paddingX: 1,
});

const header = Column(
  {
    padding: "1 1",
    borderBottom: { color: T.border },
  },
  [
    Row(
      {
        justifyContent: "spaceBetween",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
      },
      [
        Column({ gap: 0 }, [headerTitle, headerMeta]),
        Row({ gap: 1, flexWrap: "wrap" }, [statusBadge, countBadge]),
      ],
    ),
  ],
);

const searchInput = Input({
  placeholder: "search torrents...",
  border: idleBorder,
  padding: "1 1",
  foreground: T.fg,
  onSubmit: (val) => {
    const query = val.trim();
    if (query.length === 0) {
      resetResultsToInput();
      return;
    }
    fetchResults(query);
  },
  onFocus: (self) => {
    focusTarget("input");
    self.setStyle({ border: focusBorder });
  },
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

const searchHint = Text({
  text: styled([
    { text: "Enter", foreground: T.accent, bold: true },
    { text: " search", foreground: T.muted },
    { text: "   ", foreground: T.muted },
    { text: "Tab", foreground: T.accent, bold: true },
    { text: " results", foreground: T.muted },
  ]),
});

const searchPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    borderBottom: { color: T.border },
    flexShrink: 0,
  },
  [
    Row({ gap: 1, alignItems: "center", flexWrap: "wrap" }, [
      Text({ text: "SEARCH", foreground: T.accent }),
      searchHint,
    ]),
    Row({ alignItems: "stretch" }, [searchInput]),
    Row({}, [loadingBar.node]),
  ],
);

// --- Results Panel ---
const resultsSummary = Text({
  text: "",
  foreground: T.muted,
});

const resultsList = Column({ padding: "0 0", flexGrow: 1, gap: 0 }, []);

const helpLine = Text({
  text: styled([
    { text: "/", foreground: T.accent, bold: true },
    { text: " search", foreground: T.muted },
    { text: "  ", foreground: T.muted },
    { text: "j/k", foreground: T.active, bold: true },
    { text: " navigate", foreground: T.muted },
    { text: "  ", foreground: T.muted },
    { text: "h/l", foreground: T.active, bold: true },
    { text: " jump", foreground: T.muted },
    { text: "  ", foreground: T.muted },
    { text: "Enter", foreground: T.orange, bold: true },
    { text: " stream", foreground: T.muted },
    { text: "  ", foreground: T.muted },
    { text: "q", foreground: T.pink, bold: true },
    { text: " quit", foreground: T.muted },
  ]),
});

const resultsPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    flexGrow: 1,
    minHeight: 0,
  },
  [Text({ text: "RESULTS", foreground: T.accent }), resultsSummary, resultsList, helpLine],
);

// --- Layout ---
const root = Column({ flexGrow: 1 }, [header, searchPanel, resultsPanel]);

// --- Result Row Pool ---
let resultButtons: ReturnType<typeof Button>[] = [];
let visibleStartIndex = 0;
let lastResultsSnapshot: ScrapeResultItem[] | null = null;
const resultHeights = new Map<number, number>();

type ResultRow = {
  button: ReturnType<typeof Button>;
  title: ReturnType<typeof Text>;
  meta: ReturnType<typeof Text>;
  setItem: (item: ScrapeResultItem, globalIdx: number, isActive: boolean) => void;
};

const resultRows: ResultRow[] = [];

function createResultRow(): ResultRow {
  let globalIdx = 0;
  let magnet = "";
  let currentItem: ScrapeResultItem | null = null;
  let currentActive = false;
  let currentGlobalIdx = -1;

  const title = Text({
    text: "",
    wrap: "word",
    foreground: T.fg,
  });
  const meta = Text({
    text: "",
    wrap: "word",
    foreground: T.muted,
  });

  const button = Button(
    {
      text: "",
      border: undefined,
      padding: "0 1",
      foreground: T.fg,
      onFocus: () => {
        if (focusTarget() !== "results") focusTarget("results");
        if (selectedIndex() !== globalIdx) selectedIndex(globalIdx);
      },
      onClick: () => {
        if (focusTarget() !== "results") focusTarget("results");
        if (selectedIndex() !== globalIdx) selectedIndex(globalIdx);
        if (magnet.length > 0) streamResult(magnet);
      },
    },
    [Column({ gap: 0 }, [title, meta])],
  );

  return {
    button,
    title,
    meta,
    setItem: (item, nextGlobalIdx, isActive) => {
      const itemChanged = currentItem !== item;
      const activeChanged = currentActive !== isActive;
      const indexChanged = currentGlobalIdx !== nextGlobalIdx;

      globalIdx = nextGlobalIdx;
      magnet = item.magnet;

      if (!itemChanged && !activeChanged && !indexChanged) {
        return;
      }

      currentItem = item;
      currentActive = isActive;
      currentGlobalIdx = nextGlobalIdx;

      const marker = isActive ? "▸ " : "  ";

      if (itemChanged || activeChanged) {
        title.setText(
          styled([
            { text: marker, foreground: isActive ? T.active : T.muted },
            {
              text: item.title,
              foreground: isActive ? T.active : T.fg,
              bold: isActive,
            },
          ]),
        );
        meta.setText(
          styled([
            {
              text: `  ${item.size}`,
              foreground: isActive ? T.accent : T.muted,
            },
            { text: "  ·  ", foreground: T.border },
            {
              text: item.date,
              foreground: isActive ? T.accent : T.muted,
              italic: true,
            },
          ]),
        );
      }

      if (itemChanged || activeChanged) {
        button.setStyle({
          background: isActive ? T.bgAlt : undefined,
        });
      }
    },
  };
}

function ensureResultRows(count: number): void {
  while (resultRows.length < count) {
    resultRows.push(createResultRow());
  }
}

// --- Reactive effects ---
ff(() => {
  const all = results();
  const selected = selectedIndex();
  const isLoading = loading();
  const activePane = focusTarget();

  // Update header badges.
  if (isLoading) {
    statusBadge.setText(" searching ");
    statusBadge.setStyle({ background: T.warn });
  } else if (all.length > 0) {
    statusBadge.setText(" ready ");
    statusBadge.setStyle({ background: T.active });
  } else {
    statusBadge.setText(" idle ");
    statusBadge.setStyle({ background: T.muted });
  }

  countBadge.setText(all.length > 0 ? ` ${all.length} results ` : "");
  countBadge.setStyle({
    background: all.length > 0 ? T.accent : undefined,
  });

  // Update header metadata.
  headerMeta.setText(
    styled([
      { text: "focus ", foreground: T.muted },
      {
        text: activePane,
        foreground: activePane === "input" ? T.active : T.accent,
        bold: true,
      },
      ...(all.length > 0
        ? [
            { text: "   viewing ", foreground: T.muted },
            {
              text: `${Math.min(all.length, selected + 1)}/${all.length}`,
              foreground: T.accent,
              bold: true as const,
            },
          ]
        : []),
    ]),
  );

  // Update the results summary line.
  resultsSummary.setText(
    all.length === 0
      ? "no results — enter a query to search"
      : `${all.length} results · navigating with ${activePane === "results" ? "keyboard" : "mouse"}`,
  );
  resultsSummary.setStyle({
    foreground: all.length === 0 ? T.muted : activePane === "results" ? T.active : T.accent,
  });

  if (all !== lastResultsSnapshot) {
    resultHeights.clear();
    lastResultsSnapshot = all;
  }

  for (let i = 0; i < resultButtons.length; i++) {
    const measuredHeight = Math.floor(resultButtons[i]?.frameHeight() ?? 0);
    if (measuredHeight > 0) {
      resultHeights.set(visibleStartIndex + i, measuredHeight);
    }
  }

  if (all.length === 0) {
    visibleStartIndex = 0;
    resultButtons = [];
    resultsList.setChildren?.([]);
    if (focusTarget() === "results") focusInput();
    return;
  }

  const clampedSelected = Math.max(0, Math.min(selected, all.length - 1));
  if (clampedSelected !== selected) {
    selectedIndex(clampedSelected);
    return;
  }

  // Window the visible results to the measured viewport height.
  const availableHeight = Math.max(1, Math.floor(resultsList.frameHeight()));
  const fallbackHeight = Math.max(
    1,
    Math.floor(
      resultHeights.get(selected) ?? resultButtons[0]?.frameHeight() ?? searchInput.frameHeight(),
    ),
  );
  const itemHeightAt = (index: number) =>
    Math.max(1, Math.floor(resultHeights.get(index) ?? fallbackHeight));

  let start = selected;
  let usedHeight = 0;
  while (start >= 0) {
    const height = itemHeightAt(start);
    if (usedHeight + height > availableHeight) {
      if (usedHeight > 0) start += 1;
      break;
    }
    usedHeight += height;
    if (start === 0) break;
    start -= 1;
  }
  start = Math.max(0, start);

  let end = start;
  let windowHeight = 0;
  while (end < all.length) {
    const height = itemHeightAt(end);
    if (windowHeight + height > availableHeight) {
      if (end === start) end += 1;
      break;
    }
    windowHeight += height;
    end += 1;
  }

  const visible = all.slice(start, end);
  visibleStartIndex = start;
  ensureResultRows(visible.length);
  const nextButtons = visible.map((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selected;
    const row = resultRows[i]!;
    row.setItem(item, globalIdx, isActive);
    return row.button;
  });

  const buttonsChanged =
    nextButtons.length !== resultButtons.length ||
    nextButtons.some((button, i) => resultButtons[i] !== button);

  if (buttonsChanged) {
    resultButtons = nextButtons;
    resultsList.setChildren?.(resultButtons);
  }
});

// --- Keyboard navigation ---
onKey("/", () => focusInput());
onKey("\t", () => toggleFocusTarget());
onKey("\x1b[Z", () => toggleFocusTarget());
onKey("j", () => selectNext());
onKey("\x1b[B", () => selectNext());
onKey("k", () => selectPrev());
onKey("\x1b[A", () => selectPrev());
onKey("l", () => selectLast());
onKey("\x1b[C", () => selectLast());
onKey("h", () => selectFirst());
onKey("\x1b[D", () => selectFirst());
onKey("\r", () => streamSelectedResult());
onKey("\n", () => streamSelectedResult());

onKey("q", () => {
  saveMetrics();
  app.quit();
});

function selectNext() {
  if (focusTarget() !== "results") return;
  const max = results().length - 1;
  if (selectedIndex() < max) selectedIndex(selectedIndex() + 1);
}

function selectPrev() {
  if (focusTarget() !== "results") return;
  if (selectedIndex() > 0) selectedIndex(selectedIndex() - 1);
}

function selectFirst() {
  if (focusTarget() !== "results") return;
  selectedIndex(0);
}

function selectLast() {
  if (focusTarget() !== "results") return;
  const max = results().length - 1;
  if (max >= 0) selectedIndex(max);
}

function focusInput() {
  focusTarget("input");
  searchInput.focus();
}

function streamSelectedResult() {
  if (focusTarget() !== "results") return;
  const item = results()[selectedIndex()];
  if (!item || item.magnet.length === 0) return;
  streamResult(item.magnet);
}

function focusResultsPane() {
  if (results().length === 0) {
    focusInput();
    return;
  }
  focusResults();
}

function toggleFocusTarget() {
  if (results().length === 0) {
    focusInput();
    return;
  }
  if (focusTarget() === "input") {
    focusResultsPane();
  } else {
    focusInput();
  }
}

// --- Start ---
const app = run(root, { debug: true });
focusInput();
