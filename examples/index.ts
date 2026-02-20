// TORRENT SEARCH APP
// - Search input with loading bar
// - Virtual windowing results list
// - Keyboard navigation (j/k/h/l/tab)

import { existsSync } from "fs";
import { COLORS } from "@/colors";
import { Button, Column, Input, Row, run, onKey } from "@/components";
import { LoadingBar } from "./progress-bar";
import { $, ff, whenSettled } from "@/signals";
import { saveMetrics } from "@/metrics";

// --- Types ---
type ScrapeResultItem = {
  title: string;
  size: string;
  date: string;
  magnet: string;
};

// --- State ---
const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);
const focusTarget = $<"input" | "results">("input");
const MPV_SOCKET_WAIT_MS = 5000;

// --- Loading Bars ---
const loadingBar = LoadingBar({
  dotColor: COLORS.default.green,
  trackColor: COLORS.default.bg_alt,
});

function toScrapeResults(payload: unknown): ScrapeResultItem[] {
  const rawResults =
    payload && typeof payload === "object" ? (payload as any).results : undefined;
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

  if (typeof infoHash !== "string" || !Array.isArray(files) || files.length === 0) {
    return null;
  }

  return {
    infoHash,
    fileIndex: files.length - 1,
  };
}

function resetResultsToInput(): void {
  results([]);
  selectedIndex(0);
  focusTarget("input");
}

// --- API ---
async function fetchResults(query: string) {
  loading(true);
  loadingBar.start();

  try {
    const response = await fetch(
      `https://scrape.anitrack.frixaco.com/scrape?q=${encodeURIComponent(query)}`,
    );
    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }
    const payload = await response.json();
    const parsedResults = toScrapeResults(payload);
    results(parsedResults);
    selectedIndex(0);
    focusTarget(parsedResults.length > 0 ? "results" : "input");
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
    if (!response.ok) {
      throw new Error(`Stream failed with status ${response.status}`);
    }

    const payload = await response.json();
    const target = toStreamTarget(payload);
    if (!target) return;

    const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${target.infoHash}/stream/${target.fileIndex}`;

    const ipcPath = `/tmp/mpv-socket-${Date.now()}`;
    Bun.spawn({
      cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
      stdout: "ignore",
      stderr: "ignore",
    });

    // Poll until socket exists (mpv fully initialized), but avoid infinite waits.
    const deadline = Date.now() + MPV_SOCKET_WAIT_MS;
    while (!existsSync(ipcPath) && Date.now() < deadline) {
      await Bun.sleep(50);
    }
  } catch {
    // Keep UI alive even when backend endpoints are unavailable.
  } finally {
    loadingBar.stop();
  }
}

// --- Styles ---
const borderStyle = {
  color: COLORS.default.fg,
  style: "square" as const,
};

const focusedBorderStyle = {
  color: COLORS.default.green,
  style: "square" as const,
};

// --- Nodes ---
const searchInput = Input({
  placeholder: "Search torrents...",
  border: borderStyle,
  padding: "1 0",
  flexGrow: 1,
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
    self.setStyle({ border: focusedBorderStyle });
  },
  onBlur: (self) => self.setStyle({ border: borderStyle }),
});
whenSettled(() => focusInput());

const loadingBars = Row({ flexGrow: 1 }, [loadingBar.node]);

const resultsList = Column({ gap: 1, padding: "1 0", flexGrow: 1 }, []);

const root = Column({ border: borderStyle, gap: 1, padding: "1 0" }, [
  Column({ padding: "1 0" }, [searchInput, loadingBars]),
  resultsList,
]);

// --- Keep track of result buttons for focus management ---
let resultButtons: ReturnType<typeof Button>[] = [];
let visibleStartIndex = 0;

// --- Reactive effects ---

// Update results list with virtual windowing
ff(() => {
  const all = results();
  const selected = selectedIndex();

  if (all.length === 0) {
    visibleStartIndex = 0;
    resultButtons = [];
    resultsList.setChildren?.([]);
    if (focusTarget() === "results") {
      focusInput();
    }
    return;
  }

  const clampedSelected = Math.max(0, Math.min(selected, all.length - 1));
  if (clampedSelected !== selected) {
    selectedIndex(clampedSelected);
    return;
  }

  // Use actual computed frame height from Taffy
  const availableHeight = resultsList.frameHeight();

  // Each item: border(2) + text(1) = 3, plus gap(1) between items
  const itemHeight = 3;
  const visibleCount = Math.max(1, Math.floor(availableHeight / itemHeight));

  // Calculate window with selection at bottom (scroll only when needed)
  let start = selected - visibleCount + 1;
  start = Math.max(0, Math.min(start, all.length - visibleCount));
  const end = Math.min(start + visibleCount, all.length);
  const visible = all.slice(start, end);
  visibleStartIndex = start;

  resultButtons = visible.map((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selected;
    return Button({
      text: `${isActive ? "▶ " : "  "}${item.title}`,
      border: isActive ? focusedBorderStyle : borderStyle,
      padding: "1 0",
      onFocus: () => {
        focusTarget("results");
        if (selectedIndex() !== globalIdx) {
          selectedIndex(globalIdx);
        }
      },
      onClick: () => {
        focusTarget("results");
        selectedIndex(globalIdx);
        streamResult(item.magnet);
      },
    });
  });

  resultsList.setChildren?.(resultButtons);

  // Focus selected result only when results pane is active target.
  if (focusTarget() === "results") {
    focusSelectedResult();
  }
});

// --- Keyboard navigation ---
onKey("/", () => focusInput());
onKey("\t", () => toggleFocusTarget());
onKey("\x1b[Z", () => toggleFocusTarget()); // Shift+Tab
onKey("j", () => selectNext());
onKey("\x1b[B", () => selectNext()); // Arrow Down
onKey("k", () => selectPrev());
onKey("\x1b[A", () => selectPrev()); // Arrow Up
onKey("l", () => selectLast());
onKey("\x1b[C", () => selectLast()); // Arrow Right - jump to end
onKey("h", () => selectFirst());
onKey("\x1b[D", () => selectFirst()); // Arrow Left - jump to start

onKey("q", () => {
  saveMetrics("dump/metrics-letui.txt");
  app.quit();
});

function selectNext() {
  if (focusTarget() !== "results") return;
  const max = results().length - 1;
  if (selectedIndex() < max) {
    selectedIndex(selectedIndex() + 1);
  }
}

function selectPrev() {
  if (focusTarget() !== "results") return;
  if (selectedIndex() > 0) {
    selectedIndex(selectedIndex() - 1);
  }
}

function selectFirst() {
  if (focusTarget() !== "results") return;
  selectedIndex(0);
}

function selectLast() {
  if (focusTarget() !== "results") return;
  const max = results().length - 1;
  if (max >= 0) {
    selectedIndex(max);
  }
}

function focusInput() {
  focusTarget("input");
  searchInput.focus();
}

function focusSelectedResult() {
  if (results().length === 0) {
    focusInput();
    return;
  }
  focusTarget("results");
  const selectedVisibleIndex = selectedIndex() - visibleStartIndex;
  const selectedButton = resultButtons[selectedVisibleIndex];
  if (selectedButton) {
    selectedButton.focus();
    return;
  }
  resultButtons[0]?.focus();
}

function toggleFocusTarget() {
  if (results().length === 0) {
    focusInput();
    return;
  }
  if (focusTarget() === "input") {
    focusSelectedResult();
  } else {
    focusInput();
  }
}

// --- Start app ---
const app = run(root, {
  debug: true,
  testSocket: process.env.LETUI_TEST_SOCKET,
  testMode: process.env.LETUI_TEST_MODE === "1",
});
