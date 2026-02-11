// TORRENT SEARCH APP
// - Search input with loading bar
// - Virtual windowing results list
// - Keyboard navigation (j/k/h/l)

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

type ScrapeResult = {
  results: ScrapeResultItem[];
};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: unknown[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

// --- State ---
const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const selectedIndex = $(0);

// --- Loading Bars ---
const loadingBar = LoadingBar({
  dotColor: COLORS.default.green,
  trackColor: COLORS.default.bg_alt,
});

// --- API ---
async function fetchResults(query: string) {
  loading(true);
  loadingBar.start();

  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  selectedIndex(0);
  loading(false);
  loadingBar.stop();
}

async function streamResult(magnet: string) {
  loadingBar.start();

  const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
    method: "post",
    body: magnet,
  });
  const data = (await response.json()) as TorrentResponse;
  const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
    data.details.files.length - 1
  }`;

  const ipcPath = `/tmp/mpv-socket-${Date.now()}`;
  Bun.spawn({
    cmd: ["mpv", `--input-ipc-server=${ipcPath}`, streamUrl],
    stdout: "ignore",
    stderr: "ignore",
  });

  // Poll until socket exists (mpv fully initialized)
  while (!existsSync(ipcPath)) {
    await Bun.sleep(50);
  }

  loadingBar.stop();
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
  onSubmit: (val) => fetchResults(val),
  onFocus: (self) => self.setStyle({ border: focusedBorderStyle }),
  onBlur: (self) => self.setStyle({ border: borderStyle }),
});
whenSettled(() => searchInput.focus());

const loadingBars = Row({ flexGrow: 1 }, [loadingBar.node]);

const resultsList = Column({ gap: 1, padding: "1 0", flexGrow: 1 }, []);

const root = Column({ border: borderStyle, gap: 1, padding: "1 0" }, [
  Column({ padding: "1 0" }, [searchInput, loadingBars]),
  resultsList,
]);

// --- Keep track of result buttons for focus management ---
let resultButtons: ReturnType<typeof Button>[] = [];

// --- Reactive effects ---

// Update results list with virtual windowing
ff(() => {
  const all = results();
  const selected = selectedIndex();

  if (all.length === 0) {
    resultsList.setChildren?.([]);
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

  resultButtons = visible.map((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selected;
    return Button({
      text: `${isActive ? "▶ " : "  "}${item.title}`,
      border: isActive ? focusedBorderStyle : borderStyle,
      padding: "1 0",
      onClick: () => streamResult(item.magnet),
    });
  });

  resultsList.setChildren?.(resultButtons);

  // Focus the selected button
  const selectedVisibleIndex = selected - start;
  if (resultButtons[selectedVisibleIndex]) {
    resultButtons[selectedVisibleIndex].focus();
  }
});

// --- Keyboard navigation ---
onKey("/", () => searchInput.focus());

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
  const max = results().length - 1;
  if (selectedIndex() < max) {
    selectedIndex(selectedIndex() + 1);
  }
}

function selectPrev() {
  if (selectedIndex() > 0) {
    selectedIndex(selectedIndex() - 1);
  }
}

function selectFirst() {
  selectedIndex(0);
}

function selectLast() {
  const max = results().length - 1;
  if (max >= 0) {
    selectedIndex(max);
  }
}

// --- Start app ---
const app = run(root, { debug: true });
