// TORRENT SEARCH APP
// - Search input with loading bar
// - Paginated results list
// - Keyboard navigation (j/k/h/l)

import { COLORS } from "./colors";
import { Box, Button, Column, Input, Row, Text, run, onKey } from "./components";
import { ProgressBar } from "./progress-bar";
import { $, ff, whenSettled } from "./signals";

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
const maxItems = $(1);
const page = $(0);

// --- Progress Bar ---
const progressBar = ProgressBar({
  width: 40,
  filledColor: COLORS.default.green,
  unfilledColor: COLORS.default.bg_alt,
});

// --- API ---
async function fetchResults(query: string) {
  loading(true);
  progressBar.start(90, 1000); // Animate to 90% over 1 second

  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  page(0);
  loading(false);
  progressBar.complete(); // Snap to 100%

  // Focus first result after effects run
  whenSettled(() => {
    if (resultButtons.length > 0) {
      resultButtons[0]?.focus();
    }
  });
}

async function streamResult(magnet: string) {
  const response = await fetch("https://rqbit.anitrack.frixaco.com/torrents", {
    method: "post",
    body: magnet,
  });
  const data = (await response.json()) as TorrentResponse;
  const streamUrl = `https://rqbit.anitrack.frixaco.com/torrents/${data.details.info_hash}/stream/${
    data.details.files.length - 1
  }`;
  Bun.spawn({
    cmd: ["mpv", streamUrl],
    stdout: "ignore",
    stderr: "ignore",
  });
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

const loadingBar = progressBar.node;

const resultsList = Column({ gap: 1, padding: "1 0" }, []);

const root = Column(
  { border: borderStyle, gap: 1, padding: "1 0" },
  [Column({ padding: "1 0" }, [searchInput, loadingBar]), resultsList],
);

// --- Keep track of result buttons for focus management ---
let resultButtons: ReturnType<typeof Button>[] = [];

// --- Reactive effects ---

// Update results list when results/page/maxItems change
ff(() => {
  const currentResults = results().slice(
    page() * maxItems(),
    (page() + 1) * maxItems(),
  );

  resultButtons = currentResults.map((item) =>
    Button({
      text: item.title,
      border: borderStyle,
      padding: "1 0",
      onClick: () => streamResult(item.magnet),
    }),
  );

  resultsList.setChildren?.(resultButtons);
});

// --- Keyboard navigation ---
onKey("/", () => searchInput.focus());

onKey("j", () => focusNext());
onKey("\x1b[B", () => focusNext()); // Arrow Down

onKey("k", () => focusPrev());
onKey("\x1b[A", () => focusPrev()); // Arrow Up

onKey("l", () => pageNext());
onKey("\x1b[C", () => pageNext()); // Arrow Right

onKey("h", () => pagePrev());
onKey("\x1b[D", () => pagePrev()); // Arrow Left

onKey("q", () => app.quit());

function focusNext() {
  const currentIndex = resultButtons.findIndex((b) => b.isFocused());
  if (currentIndex < resultButtons.length - 1) {
    resultButtons[currentIndex + 1]?.focus();
  }
}

function focusPrev() {
  const currentIndex = resultButtons.findIndex((b) => b.isFocused());
  if (currentIndex > 0) {
    resultButtons[currentIndex - 1]?.focus();
  } else if (currentIndex === 0) {
    searchInput.focus();
  }
}

function pageNext() {
  const totalPages = Math.ceil(results().length / maxItems());
  if (page() < totalPages - 1) {
    page(page() + 1);
    whenSettled(() => resultButtons[0]?.focus());
  }
}

function pagePrev() {
  if (page() > 0) {
    page(page() - 1);
    whenSettled(() => resultButtons[0]?.focus());
  }
}

// --- Start app ---
const app = run(root, { debug: true });
