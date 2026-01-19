// TORRENT SEARCH APP - Pi-mono TUI Port
// Demonstrating API differences from letui

import { existsSync } from "fs";
import {
  TUI,
  ProcessTerminal,
  Input,
  SelectList,
  Text,
  Container,
  Loader,
  type Component,
  type SelectItem,
  matchesKey,
} from "pi-monorepo/packages/tui/src/index";
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

// --- State ---
let results: ScrapeResultItem[] = [];
let loading = false;
let selectedIndex = 0;
let mode: "search" | "results" = "search";

// --- Theme helpers ---
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const white = (s: string) => `\x1b[37m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const inverse = (s: string) => `\x1b[7m${s}\x1b[27m`;

// --- Custom Components ---

// Loading bar component (pi-mono style)
class LoadingBar implements Component {
  private active = false;
  private frame = 0;
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private ui: TUI | null = null;

  setUI(ui: TUI) {
    this.ui = ui;
  }

  start() {
    this.active = true;
    this.intervalId = setInterval(() => {
      this.frame = (this.frame + 1) % this.frames.length;
      this.ui?.requestRender();
    }, 80);
  }

  stop() {
    this.active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.ui?.requestRender();
  }

  invalidate() {}

  render(width: number): string[] {
    if (!this.active) return [];
    return [green(this.frames[this.frame]) + " Loading..."];
  }
}

// Results list component (manual implementation)
class ResultsList implements Component {
  private items: ScrapeResultItem[] = [];
  private selected = 0;
  private maxVisible = 10;
  public onSelect?: (item: ScrapeResultItem) => void;

  setItems(items: ScrapeResultItem[]) {
    this.items = items;
    this.selected = 0;
  }

  setSelected(idx: number) {
    this.selected = Math.max(0, Math.min(idx, this.items.length - 1));
  }

  getSelected() {
    return this.selected;
  }

  getSelectedItem() {
    return this.items[this.selected];
  }

  invalidate() {}

  render(width: number): string[] {
    if (this.items.length === 0) {
      return [dim("  No results. Press / to search.")];
    }

    const lines: string[] = [];

    // Virtual windowing
    let start = this.selected - Math.floor(this.maxVisible / 2);
    start = Math.max(0, Math.min(start, this.items.length - this.maxVisible));
    const end = Math.min(start + this.maxVisible, this.items.length);

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const isSelected = i === this.selected;
      const prefix = isSelected ? green("▶ ") : "  ";
      const title = item.title.slice(0, width - 4);
      const line = prefix + (isSelected ? bold(title) : title);
      lines.push(line);
    }

    // Scroll indicator
    if (this.items.length > this.maxVisible) {
      lines.push(dim(`  (${this.selected + 1}/${this.items.length})`));
    }

    return lines;
  }

  handleInput(data: string) {
    // Navigation handled externally
  }
}

// Main app container
class TorrentApp implements Component {
  private searchInput: Input;
  private resultsList: ResultsList;
  private loadingBar: LoadingBar;
  private ui: TUI;

  constructor(ui: TUI) {
    this.ui = ui;
    this.searchInput = new Input();
    this.resultsList = new ResultsList();
    this.loadingBar = new LoadingBar();
    this.loadingBar.setUI(ui);

    this.searchInput.onSubmit = (value) => {
      this.fetchResults(value);
    };

    this.searchInput.onEscape = () => {
      mode = "results";
      this.ui.setFocus(this);
      this.ui.requestRender();
    };

    this.resultsList.onSelect = (item) => {
      this.streamResult(item.magnet);
    };
  }

  private async fetchResults(query: string) {
    loading = true;
    this.loadingBar.start();
    this.ui.requestRender();

    try {
      const response = await fetch(
        `https://scrape.anitrack.frixaco.com/scrape?q=${query}`
      );
      const data = (await response.json()) as ScrapeResult;
      results = data.results;
      this.resultsList.setItems(results);
      mode = "results";
      this.ui.setFocus(this);
    } finally {
      loading = false;
      this.loadingBar.stop();
    }
  }

  private async streamResult(magnet: string) {
    this.loadingBar.start();

    try {
      const response = await fetch(
        "https://rqbit.anitrack.frixaco.com/torrents",
        {
          method: "post",
          body: magnet,
        }
      );
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
    } finally {
      this.loadingBar.stop();
    }
  }

  invalidate() {
    this.searchInput.invalidate?.();
    this.resultsList.invalidate();
    this.loadingBar.invalidate();
  }

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(bold("┌─ Torrent Search " + "─".repeat(width - 18) + "┐"));

    // Search input (always visible)
    const inputLines = this.searchInput.render(width - 4);
    for (const line of inputLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Loading indicator
    const loaderLines = this.loadingBar.render(width - 4);
    for (const line of loaderLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Separator
    lines.push("├" + "─".repeat(width - 2) + "┤");

    // Results
    const resultLines = this.resultsList.render(width - 4);
    for (const line of resultLines) {
      lines.push("│ " + line.padEnd(width - 4) + " │");
    }

    // Footer
    lines.push("└" + "─".repeat(width - 2) + "┘");

    // Help line
    const helpText =
      mode === "search"
        ? dim("Enter: search | Esc: browse results")
        : dim("j/k: navigate | Enter: play | /: search | q: quit");
    lines.push(helpText);

    return lines;
  }

  handleInput(data: string) {
    if (mode === "search") {
      this.searchInput.handleInput(data);
      this.ui.requestRender();
      return;
    }

    // Results mode navigation
    if (matchesKey(data, "j") || data === "\x1b[B") {
      // j or down
      const max = results.length - 1;
      if (this.resultsList.getSelected() < max) {
        this.resultsList.setSelected(this.resultsList.getSelected() + 1);
        this.ui.requestRender();
      }
    } else if (matchesKey(data, "k") || data === "\x1b[A") {
      // k or up
      if (this.resultsList.getSelected() > 0) {
        this.resultsList.setSelected(this.resultsList.getSelected() - 1);
        this.ui.requestRender();
      }
    } else if (matchesKey(data, "l") || data === "\x1b[C") {
      // l or right - last
      this.resultsList.setSelected(results.length - 1);
      this.ui.requestRender();
    } else if (matchesKey(data, "h") || data === "\x1b[D") {
      // h or left - first
      this.resultsList.setSelected(0);
      this.ui.requestRender();
    } else if (data === "\r" || data === "\n") {
      // Enter - select
      const item = this.resultsList.getSelectedItem();
      if (item) {
        this.streamResult(item.magnet);
      }
    } else if (matchesKey(data, "/")) {
      // / - focus search
      mode = "search";
      this.ui.setFocus(this);
      this.ui.requestRender();
    } else if (matchesKey(data, "q") || data === "\x03") {
      // q or Ctrl+C - quit
      saveMetrics("metrics-pimono.txt");
      this.ui.stop();
      process.exit(0);
    }
  }
}

// --- Main ---
function main() {
  resetMetrics();
  
  const terminal = new ProcessTerminal();
  const ui = new TUI(terminal);

  // Wrap requestRender to measure frame times
  // Pi-mono schedules doRender via process.nextTick, so use setTimeout(0)
  // to measure AFTER render + terminal I/O completes
  const originalRequestRender = ui.requestRender.bind(ui);
  ui.requestRender = () => {
    frameStartTime = startFrame();
    originalRequestRender();
    setTimeout(() => {
      if (frameStartTime > 0) {
        endFrame(frameStartTime);
        frameStartTime = 0;
      }
    }, 0);
  };

  const app = new TorrentApp(ui);
  ui.addChild(app);
  ui.setFocus(app);

  ui.start();
}

main();

/*
 * API COMPARISON NOTES - Pi-mono vs letui:
 *
 * 1. COMPONENT CREATION:
 *    - Pi-mono: Class implementing `Component` interface with `render(width): string[]`
 *    - letui:   `Button({...})` factory functions returning node objects
 *
 * 2. STATE MANAGEMENT:
 *    - Pi-mono: Manual class properties + `invalidate()` + `ui.requestRender()`
 *    - letui:   Signals `$()` with automatic dependency tracking
 *
 * 3. RENDERING MODEL:
 *    - Pi-mono: Components return `string[]` (lines) - pure string-based diffing
 *    - letui:   Component tree serialized to Rust, Taffy layout, cell-based diffing
 *
 * 4. LAYOUT:
 *    - Pi-mono: 1D only - `width` passed to render(), height is implicit (line count)
 *    - letui:   Full 2D flexbox via Taffy (gap, padding, flexGrow, etc.)
 *
 * 5. CHILDREN:
 *    - Pi-mono: Manual composition in render() - return child.render() lines
 *    - letui:   Declarative `Column({}, [child1, child2])` arrays
 *
 * 6. FOCUS:
 *    - Pi-mono: `ui.setFocus(component)` - focused component receives handleInput
 *    - letui:   `input.focus()` with signals tracking focus state
 *
 * 7. KEYBOARD:
 *    - Pi-mono: `handleInput(data: string)` method on focused component
 *    - letui:   `onKey("/", handler)` global registration + component handlers
 *
 * 8. STYLING:
 *    - Pi-mono: Manual ANSI escape codes in render output
 *    - letui:   Style props on components (border: {...}, padding: "1 0")
 *
 * 9. BUILT-IN COMPONENTS:
 *    - Pi-mono: Input, SelectList, Text, Loader, Editor, Markdown, Image
 *    - letui:   Input, Button, Row, Column, Box (more layout-focused)
 *
 * VERDICT: Pi-mono is simpler but requires more manual work for layout.
 *          The string[] return model is very explicit - you see exactly what renders.
 *          letui's 2D layout and signals make complex UIs easier to build.
 *
 * KEY INSIGHT: Pi-mono's 1D model means you must manually handle box-drawing
 *              and compose layouts. letui's Taffy integration handles this.
 */
