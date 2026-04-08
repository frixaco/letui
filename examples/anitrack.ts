// ANITRACK torrent search demo: keyboard-first results browsing with stream staging.
//
// Data flow:
// Search input → fetchResults() → API call → toScrapeResults() → results signal update → ff() effect → result row rendering
// Keyboard → moveSelection()/jumpSelection() → selectedIndex signal → ff() effect → UI highlight update

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
type ResultRow = {
  button: ReturnType<typeof Button>;
  setActive: (isActive: boolean) => void;
  measuredHeight: () => number;
};

// --- Supporting types ---

const T = {
  bgAlt: COLORS.default.bg_alt,
  fg: COLORS.default.fg,
  muted: COLORS.default.grey,
  accent: COLORS.default.cyan,
  active: COLORS.default.green,
  warn: COLORS.default.yellow,
  border: COLORS.default.bg_highlight,
  badgeFg: COLORS.default.bg,
} as const;

const MPV_SOCKET_WAIT_MS = 5000;

// --- Internal state ---

const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);
const focusTarget = $<"input" | "results">("input");
let renderedButtons: ReturnType<typeof Button>[] = [];
let lastResultsSnapshot: ScrapeResultItem[] | null = null;
let lastResultsListWidth = -1;
let resultRows: ResultRow[] = [];

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

function styled(segments: readonly StyledSegment[]): StyledText {
  let text = "";
  let cursor = 0;
  const spans: TextSpan[] = [];
  for (const seg of segments) {
    const start = cursor;
    text += seg.text;
    cursor += Array.from(seg.text).length;
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
    setPane(parsedResults.length > 0 ? "results" : "input");
  } catch {
    clearResults();
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

const headerTitle = Text({ text: "ANITRACK // TORRENT SEARCH", foreground: T.accent });
const headerMeta = Text({ text: "", foreground: T.muted });

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
      clearResults();
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

function setPane(target: "input" | "results"): void {
  if (target === "results" && results().length > 0) {
    focusTarget("results");
    if (searchInput.isFocused()) searchInput.blur();
    return;
  }

  focusTarget("input");
  searchInput.focus();
}

function clearResults(): void {
  results([]);
  selectedIndex(0);
  setPane("input");
}

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
      Text({ text: "Enter search   Tab results", foreground: T.muted }),
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
  text: "/ search   j/k move   h/l jump   Enter stream   q quit",
  foreground: T.muted,
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

function resultTitleText(item: ScrapeResultItem, isActive: boolean): StyledText {
  return styled([
    { text: isActive ? "▸ " : "  ", foreground: isActive ? T.active : T.muted },
    {
      text: item.title,
      foreground: isActive ? T.active : T.fg,
      bold: isActive,
    },
  ]);
}

function resultMetaText(item: ScrapeResultItem, isActive: boolean): StyledText {
  return styled([
    { text: `  ${item.size}`, foreground: isActive ? T.accent : T.muted },
    { text: "  ·  ", foreground: T.border },
    {
      text: item.date,
      foreground: isActive ? T.accent : T.muted,
      italic: true,
    },
  ]);
}

function createResultRow(
  item: ScrapeResultItem,
  index: number,
  isActive: boolean,
): ResultRow {
  const title = Text({
    text: resultTitleText(item, isActive),
    wrap: "word",
  });

  const meta = Text({
    text: resultMetaText(item, isActive),
    wrap: "word",
  });

  const button = Button(
    {
      text: "",
      border: undefined,
      padding: "0 1",
      foreground: T.fg,
      background: isActive ? T.bgAlt : undefined,
      onFocus: () => {
        setPane("results");
        if (selectedIndex() !== index) selectedIndex(index);
      },
      onClick: () => {
        setPane("results");
        if (selectedIndex() !== index) selectedIndex(index);
        if (item.magnet.length > 0) streamResult(item.magnet);
      },
    },
    [Column({ gap: 0 }, [title, meta])],
  );

  let active = isActive;

  return {
    button,
    setActive: (nextActive) => {
      if (nextActive === active) return;

      active = nextActive;
      title.setText(resultTitleText(item, nextActive));
      meta.setText(resultMetaText(item, nextActive));
      button.setStyle({ background: nextActive ? T.bgAlt : undefined });
    },
    measuredHeight: () => Math.floor(button.frameHeight()),
  };
}

function visibleWindow(
  rows: readonly ResultRow[],
  selected: number,
  availableHeight: number,
): { start: number; end: number } {
  if (rows.length === 0) {
    return { start: 0, end: 0 };
  }

  const clampedSelected = Math.max(0, Math.min(selected, rows.length - 1));
  const rowHeightAt = (index: number) => Math.max(1, rows[index]?.measuredHeight() ?? 0);

  let start = clampedSelected;
  let end = clampedSelected + 1;
  let usedHeight = rowHeightAt(clampedSelected);
  let heightBeforeSelection = 0;
  const targetHeightBeforeSelection = Math.max(0, Math.floor((availableHeight - usedHeight) / 2));

  while (start > 0) {
    const nextHeight = rowHeightAt(start - 1);
    if (usedHeight + nextHeight > availableHeight) break;
    if (heightBeforeSelection + nextHeight > targetHeightBeforeSelection) break;

    start -= 1;
    usedHeight += nextHeight;
    heightBeforeSelection += nextHeight;
  }

  while (end < rows.length) {
    const nextHeight = rowHeightAt(end);
    if (usedHeight + nextHeight > availableHeight) break;

    usedHeight += nextHeight;
    end += 1;
  }

  while (start > 0) {
    const nextHeight = rowHeightAt(start - 1);
    if (usedHeight + nextHeight > availableHeight) break;

    start -= 1;
    usedHeight += nextHeight;
  }

  return {
    start,
    end,
  };
}

function setVisibleButtons(nextButtons: ReturnType<typeof Button>[]): void {
  const buttonsChanged =
    nextButtons.length !== renderedButtons.length ||
    nextButtons.some((button, index) => renderedButtons[index] !== button);

  if (!buttonsChanged) return;

  renderedButtons = nextButtons;
  resultsList.setChildren?.(nextButtons);
}

function rebuildResultRows(items: readonly ScrapeResultItem[], selected: number, listWidth: number): void {
  resultRows = items.map((item, index) => createResultRow(item, index, index === selected));
  lastResultsSnapshot = [...items];
  lastResultsListWidth = listWidth;
  renderedButtons = [];
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

  headerMeta.setText(
    all.length > 0
      ? `focus ${activePane}   viewing ${Math.min(all.length, selected + 1)}/${all.length}`
      : `focus ${activePane}`,
  );

  resultsSummary.setText(
    all.length === 0 ? "no results - enter a query to search" : `${all.length} results`,
  );
  resultsSummary.setStyle({
    foreground: all.length === 0 ? T.muted : T.accent,
  });

  if (all.length === 0) {
    resultRows = [];
    lastResultsSnapshot = [];
    lastResultsListWidth = -1;
    setVisibleButtons([]);
    if (activePane === "results") setPane("input");
    return;
  }

  const clampedSelected = Math.max(0, Math.min(selected, all.length - 1));
  if (clampedSelected !== selected) {
    selectedIndex(clampedSelected);
    return;
  }

  const listWidth = Math.floor(resultsList.frameWidth());
  const resultsChanged =
    all.length !== lastResultsSnapshot?.length || all.some((item, index) => lastResultsSnapshot?.[index] !== item);

  if (resultsChanged || listWidth !== lastResultsListWidth) {
    rebuildResultRows(all, clampedSelected, listWidth);
  } else {
    for (let index = 0; index < resultRows.length; index++) {
      resultRows[index]?.setActive(index === clampedSelected);
    }
  }

  const allButtons = resultRows.map((row) => row.button);
  const allMeasured = resultRows.every((row) => row.measuredHeight() > 0);
  if (!allMeasured) {
    // Mount every row for one render pass so the layout engine can measure them.
    setVisibleButtons(allButtons);
    return;
  }

  const availableHeight = Math.max(1, Math.floor(resultsList.frameHeight()));
  const { start, end } = visibleWindow(resultRows, clampedSelected, availableHeight);
  setVisibleButtons(allButtons.slice(start, end));
});

// --- Keyboard navigation ---
onKey("/", () => setPane("input"));
for (const key of ["\t", "\x1b[Z"]) {
  onKey(key, () => togglePane());
}

for (const key of ["j", "\x1b[B"]) {
  onKey(key, () => moveSelection(1));
}

for (const key of ["k", "\x1b[A"]) {
  onKey(key, () => moveSelection(-1));
}

for (const key of ["h", "\x1b[D"]) {
  onKey(key, () => jumpSelection(0));
}

for (const key of ["l", "\x1b[C"]) {
  onKey(key, () => jumpSelection(results().length - 1));
}

for (const key of ["\r", "\n"]) {
  onKey(key, () => streamSelectedResult());
}

onKey("q", () => {
  saveMetrics();
  app.quit();
});

function moveSelection(offset: number): void {
  if (focusTarget() !== "results") return;

  const max = results().length - 1;
  if (max < 0) return;

  selectedIndex(Math.max(0, Math.min(selectedIndex() + offset, max)));
}

function jumpSelection(index: number): void {
  if (focusTarget() !== "results") return;

  const max = results().length - 1;
  if (max < 0) return;

  selectedIndex(Math.max(0, Math.min(index, max)));
}

function streamSelectedResult(): void {
  if (focusTarget() !== "results") return;

  const item = results()[selectedIndex()];
  if (!item || item.magnet.length === 0) return;
  streamResult(item.magnet);
}

function togglePane(): void {
  setPane(focusTarget() === "input" ? "results" : "input");
}

// --- Start ---
const app = run(root, { debug: true });
setPane("input");
