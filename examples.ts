// TORRENT SEARCH APP
// - Search input with loading bar
// - Paginated results list
// - Keyboard navigation (j/k/h/l)

import { COLORS } from "./colors";
import {
  Box,
  Button,
  Col,
  Input,
  Row,
  Text,
  run,
  onKey,
} from "./components";
import { $, ff } from "./signals";

// --- State ---
const searchText = $("");
const results = $<ScrapeResultItem[]>([]);
const loading = $(false);
const maxItems = $(1);
const page = $(0);

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

type TorrentFile = {};

type TorrentDetails = {
  id: number;
  info_hash: string;
  name: string;
  files: TorrentFile[];
};

type TorrentResponse = {
  id: number;
  details: TorrentDetails;
};

// --- Logging ---
const logFile = Bun.file("logs.txt");
const logWriter = logFile.writer();

function log(txt: string, ...args: string[]) {
  logWriter.write(txt + " " + args.join(" ") + "\n");
}

// --- API ---
async function fetchResults(query: string) {
  loading(true);
  
  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`,
  );
  const data = (await response.json()) as ScrapeResult;

  results(data.results);
  page(0);
  loading(false);
  
  // Focus first result when results arrive
  if (data.results.length > 0 && resultButtons.length > 0) {
    resultButtons[0].focus();
  }
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
  onChange: (val: string) => searchText(val),
  onSubmit: (val) => {
    log("onSubmit: " + val);
    fetchResults(val);
  },
  onFocus: (self) => {
    self.setStyle({ border: focusedBorderStyle });
  },
  onBlur: (self) => {
    self.setStyle({ border: borderStyle });
  },
});

const loadingBar = Box({
  height: 1,
  bg: COLORS.default.green,
  width: 0,  // starts hidden
});

const resultsList = Col({
  gap: 1,
  padding: "1 0",
  onLayout: (self) => {
    const h = self.frame.height;
    const child = self.children[0];
    if (!h || !child) return;

    const childH = child.frame.height;
    if (!childH) return;

    // Calculate available height
    let paddingY = 0;
    const { padding } = self.props;
    if (typeof padding === "number") {
      paddingY = padding;
    } else if (typeof padding === "string") {
      const parts = padding.split(" ").map(Number);
      paddingY = parts[0] ?? 0;
    }

    const availableH = h - paddingY * 2;
    const capacity = Math.ceil(availableH / childH);

    if (maxItems() !== capacity && capacity > 0) {
      maxItems(capacity);
    }
  },
});

const statusText = Text("");

const root = Col(
  {
    border: borderStyle,
    gap: 1,
    padding: "1 0",
  },
  [
    Row({ gap: 1, padding: "1 0" }, [searchInput]),
    loadingBar,
    resultsList,
    statusText,
  ]
);

// --- Keep track of result buttons for focus management ---
let resultButtons: ReturnType<typeof Button>[] = [];

// --- Reactive effects ---

// Loading bar animation
ff(() => {
  if (loading()) {
    // Expand to full width (match input)
    loadingBar.setStyle({ width: "100%", bg: COLORS.default.yellow });
  } else if (results().length > 0) {
    // Shrink to thin line after results loaded
    loadingBar.setStyle({ width: "100%", height: 1, bg: COLORS.default.green });
  } else {
    // Hidden when no results and not loading
    loadingBar.setStyle({ width: 0 });
  }
});

// Update status text
ff(() => {
  if (loading()) {
    statusText.setText("Loading...");
  } else if (results().length > 0) {
    const totalPages = Math.ceil(results().length / maxItems());
    statusText.setText(`Page ${page() + 1}/${totalPages} | ${results().length} results`);
  } else {
    statusText.setText("Type to search");
  }
});

// Update results list when results/page/maxItems change
ff(() => {
  const currentResults = results()
    .slice(page() * maxItems(), (page() + 1) * maxItems());

  resultButtons = currentResults.map((item, i) =>
    Button({
      text: item.title,
      border: borderStyle,
      padding: "1 0",
      onPress: () => {
        streamResult(item.magnet);
        log(`Clicked: ${item.title}`);
      },
      onFocus: (self) => {
        self.setStyle({ border: focusedBorderStyle });
      },
      onBlur: (self) => {
        self.setStyle({ border: borderStyle });
      },
    })
  );

  resultsList.setChildren(resultButtons);
});

// --- Keyboard navigation ---
onKey("/", () => searchInput.focus());

onKey("j", () => focusNext());
onKey("ArrowDown", () => focusNext());

onKey("k", () => focusPrev());
onKey("ArrowUp", () => focusPrev());

onKey("l", () => pageNext());
onKey("ArrowRight", () => pageNext());

onKey("h", () => pagePrev());
onKey("ArrowLeft", () => pagePrev());

onKey("q", () => app.quit());

function focusNext() {
  const currentIndex = resultButtons.findIndex((b) => b.isFocused());
  if (currentIndex < resultButtons.length - 1) {
    resultButtons[currentIndex + 1].focus();
  }
}

function focusPrev() {
  const currentIndex = resultButtons.findIndex((b) => b.isFocused());
  if (currentIndex > 0) {
    resultButtons[currentIndex - 1].focus();
  } else if (currentIndex === 0) {
    searchInput.focus();
  }
}

function pageNext() {
  const totalPages = Math.ceil(results().length / maxItems());
  if (page() < totalPages - 1) {
    page(page() + 1);
    // Focus first item on new page after effect runs
    setTimeout(() => resultButtons[0]?.focus(), 0);
  }
}

function pagePrev() {
  if (page() > 0) {
    page(page() - 1);
    setTimeout(() => resultButtons[0]?.focus(), 0);
  }
}

// --- Start app ---
const app = run(root);

logWriter.flush();
