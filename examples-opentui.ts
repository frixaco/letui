// TORRENT SEARCH APP - OpenTUI Port
// Demonstrating API differences from letui

import { existsSync } from "fs";
import {
  createCliRenderer,
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import {
  startFrame,
  endFrame,
  saveMetrics,
  resetMetrics,
} from "./metrics";

// --- Metrics state ---
let frameStartTime = 0;

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

// --- State (manual, no signals) ---
let results: ScrapeResultItem[] = [];
let loading = false;
let selectedIndex = 0;

// --- Renderer & Components (declared for later init) ---
let renderer: CliRenderer;
let searchInput: InputRenderable;
let loadingText: TextRenderable;
let resultsList: BoxRenderable;
let resultButtons: TextRenderable[] = [];

// --- Loading Animation ---
const loaderFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let loaderFrame = 0;
let loaderInterval: ReturnType<typeof setInterval> | null = null;

function startLoader() {
  if (loaderInterval) return;
  loaderInterval = setInterval(() => {
    loaderFrame = (loaderFrame + 1) % loaderFrames.length;
    if (loadingText) {
      loadingText.content = `${loaderFrames[loaderFrame]} Loading...`;
      renderer.requestRender();
    }
  }, 80);
}

function stopLoader() {
  if (loaderInterval) {
    clearInterval(loaderInterval);
    loaderInterval = null;
  }
  if (loadingText) {
    loadingText.content = "";
    renderer.requestRender();
  }
}

// --- API ---
async function fetchResults(query: string) {
  loading = true;
  startLoader();

  const response = await fetch(
    `https://scrape.anitrack.frixaco.com/scrape?q=${query}`
  );
  const data = (await response.json()) as ScrapeResult;

  results = data.results;
  selectedIndex = 0;
  loading = false;
  stopLoader();
  updateResultsList();
}

async function streamResult(magnet: string) {
  startLoader();

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

  while (!existsSync(ipcPath)) {
    await Bun.sleep(50);
  }

  stopLoader();
}

// --- Update Results List (manual re-render) ---
function updateResultsList() {
  // Remove old result buttons
  for (const btn of resultButtons) {
    resultsList.remove(btn.id);
    btn.destroy();
  }
  resultButtons = [];

  if (results.length === 0) return;

  // Virtual windowing calculation
  const availableHeight = renderer.height - 10; // Approximate
  const itemHeight = 3;
  const visibleCount = Math.max(1, Math.floor(availableHeight / itemHeight));

  let start = selectedIndex - visibleCount + 1;
  start = Math.max(0, Math.min(start, results.length - visibleCount));
  const end = Math.min(start + visibleCount, results.length);
  const visible = results.slice(start, end);

  visible.forEach((item, i) => {
    const globalIdx = start + i;
    const isActive = globalIdx === selectedIndex;

    const btn = new TextRenderable(renderer, {
      id: `result-${globalIdx}`,
      content: `${isActive ? "▶ " : "  "}${item.title}`,
      width: "100%",
      height: 1,
      fg: isActive ? "#00FF00" : "#FFFFFF",
      onMouseDown() {
        streamResult(item.magnet);
      },
    });

    resultsList.add(btn);
    resultButtons.push(btn);
  });

  renderer.requestRender();
}

// --- Navigation ---
function selectNext() {
  const max = results.length - 1;
  if (selectedIndex < max) {
    selectedIndex++;
    updateResultsList();
  }
}

function selectPrev() {
  if (selectedIndex > 0) {
    selectedIndex--;
    updateResultsList();
  }
}

function selectFirst() {
  selectedIndex = 0;
  updateResultsList();
}

function selectLast() {
  const max = results.length - 1;
  if (max >= 0) {
    selectedIndex = max;
    updateResultsList();
  }
}

function selectCurrent() {
  if (results[selectedIndex]) {
    streamResult(results[selectedIndex].magnet);
  }
}

// --- Main ---
async function main() {
  resetMetrics();
  
  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useKittyKeyboard: { disambiguate: true },
  });

  // Wrap requestRender to measure frame times
  // OpenTUI schedules activateFrame via nextTick/setTimeout, so use setTimeout(0)
  // to measure AFTER render + native Zig I/O completes
  const originalRequestRender = renderer.requestRender.bind(renderer);
  renderer.requestRender = () => {
    frameStartTime = startFrame();
    originalRequestRender();
    setTimeout(() => {
      if (frameStartTime > 0) {
        endFrame(frameStartTime);
        frameStartTime = 0;
      }
    }, 0);
  };

  renderer.setBackgroundColor("#1a1a2e");

  // Root container
  const root = new BoxRenderable(renderer, {
    id: "root",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: 1,
    border: true,
    borderColor: "#FFFFFF",
    gap: 1,
  });
  renderer.root.add(root);

  // Search row
  const searchRow = new BoxRenderable(renderer, {
    id: "search-row",
    flexDirection: "column",
    width: "100%",
    gap: 1,
  });
  root.add(searchRow);

  // Search input
  searchInput = new InputRenderable(renderer, {
    id: "search-input",
    width: "100%",
    height: 1,
    placeholder: "Search torrents...",
    textColor: "#FFFFFF",
    backgroundColor: "#2a2a4e",
    focusedBackgroundColor: "#3a3a6e",
    cursorColor: "#00FF00",
  });
  searchRow.add(searchInput);

  // Handle submit
  searchInput.on(InputRenderableEvents.ENTER, (value: string) => {
    fetchResults(value);
  });

  // Loading text
  loadingText = new TextRenderable(renderer, {
    id: "loading-text",
    content: "",
    width: "100%",
    height: 1,
    fg: "#00FF00",
  });
  searchRow.add(loadingText);

  // Results container
  resultsList = new BoxRenderable(renderer, {
    id: "results-list",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    gap: 1,
    padding: 1,
  });
  root.add(resultsList);

  // Keyboard handler
  renderer.keyInput.on("keypress", (key) => {
    // Global keys (when not focused on input)
    if (!searchInput.focused) {
      switch (key.name) {
        case "slash":
          searchInput.focus();
          break;
        case "j":
        case "down":
          selectNext();
          break;
        case "k":
        case "up":
          selectPrev();
          break;
        case "l":
        case "right":
          selectLast();
          break;
        case "h":
        case "left":
          selectFirst();
          break;
        case "return":
        case "linefeed":
          selectCurrent();
          break;
        case "q":
          saveMetrics("metrics-opentui.txt");
          renderer.destroy();
          process.exit(0);
          break;
      }
    } else {
      // ESC to blur input
      if (key.name === "escape") {
        searchInput.blur();
      }
    }
  });

  // Focus input initially
  searchInput.focus();

  renderer.start();
}

main().catch(console.error);

/*
 * API COMPARISON NOTES - OpenTUI vs letui:
 *
 * 1. COMPONENT CREATION:
 *    - OpenTUI: `new InputRenderable(renderer, {...})` - class instantiation, requires renderer context
 *    - letui:   `Input({...})` - factory function, no context needed
 *
 * 2. STATE MANAGEMENT:
 *    - OpenTUI: Manual state variables + explicit `renderer.requestRender()` calls
 *    - letui:   Signals `$()` with automatic dependency tracking, `ff()` for effects
 *
 * 3. CHILDREN MANAGEMENT:
 *    - OpenTUI: `parent.add(child)` / `parent.remove(id)` - imperative
 *    - letui:   `Column({}, [children])` + `setChildren([])` - declarative arrays
 *
 * 4. EVENT HANDLING:
 *    - OpenTUI: `input.on(EventEnum, handler)` - EventEmitter pattern
 *    - letui:   `onSubmit: (val) => {}` - props-based callbacks
 *
 * 5. FOCUS MANAGEMENT:
 *    - OpenTUI: `input.focus()` / `input.blur()` - explicit methods
 *    - letui:   `input.focus()` - same, but `onFocus`/`onBlur` callbacks in props
 *
 * 6. KEYBOARD HANDLING:
 *    - OpenTUI: `renderer.keyInput.on("keypress", handler)` - global EventEmitter
 *    - letui:   `onKey("/", handler)` - declarative key binding
 *
 * 7. LAYOUT:
 *    - OpenTUI: Yoga layout with explicit props (flexGrow, flexDirection, etc.)
 *    - letui:   Taffy via FFI with simplified props (gap, padding as strings)
 *
 * 8. RENDERING:
 *    - OpenTUI: Native Zig renderer, framebuffer-based
 *    - letui:   Rust FFI diffing, TypeScript orchestration
 *
 * VERDICT: OpenTUI is more verbose but offers fine-grained control.
 *          letui's signal system reduces boilerplate significantly.
 */
