// Fuzzy file search demo: fff-node indexes a root and letui renders a dense, keyboard-first search surface.
//
// Data flow:
//   Input query -> FileFinder.fileSearch() -> ranked file rows
//   Active row -> koffi access() probe -> details and pinned path panels

import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { FileFinder } from "@ff-labs/fff-node";
import type { FileFinder as FffFileFinder, FileItem, Score } from "@ff-labs/fff-node";
import * as koffi from "koffi";
import { $, Button, Column, Input, Row, ScrollView, Text, ff, onKey, run } from "@";
import type { Node, StyledText } from "@";
import { styled, NAV_NEXT_KEYS, NAV_PREV_KEYS } from "./helpers.ts";

function startFuzzyFileSearch(): ReturnType<typeof run> {
  const theme = SEARCH_THEME;
  const rootPath = resolveRoot(process.argv[2]);
  const native = createNativeProbe();
  const finderResult = FileFinder.create({
    basePath: rootPath,
    disableContentIndexing: true,
  });
  const finder = finderResult.ok ? finderResult.value : null;

  const query = $("");
  const results = $<ResultItem[]>([]);
  const activeIndex = $(0);
  const status = $(
    finderResult.ok ? `Indexing ${shortPath(rootPath)}` : `FFF failed: ${finderResult.error}`,
  );
  const indexedFiles = $(0);
  const isScanning = $(Boolean(finder));
  const pinnedPaths = $<string[]>([]);
  const layoutColumns = $(1);

  let resultButtons: ReturnType<typeof Button>[] = [];
  let resultSignature = "";
  let scanTimer: ReturnType<typeof setInterval> | null = null;

  const brand = Text({
    text: styled([
      { text: " ", foreground: theme.red },
      { text: "Supper File", foreground: theme.text, bold: true },
    ]),
  });
  const location = Text({ text: sidebarLocation(rootPath), foreground: theme.muted, wrap: "word" });
  const indexInfo = Text({ text: "", foreground: theme.muted, wrap: "word" });
  const pins = Text({ text: "", foreground: theme.muted, wrap: "word" });
  const shortcuts = Text({
    text: "/ focus    Enter pin\nr rescan   Ctrl+Q quit",
    foreground: theme.dim,
    wrap: "word",
  });
  const sidebar = Column(
    {
      width: 34,
      flexShrink: 0,
      padding: "1 2",
      gap: 1,
      background: theme.black,
    },
    [
      brand,
      Column({ gap: 0 }, [railSection("Root", theme), location]),
      Column({ gap: 0 }, [railSection("Index", theme), indexInfo]),
      Column({ gap: 0 }, [railSection("Pinned", theme), pins]),
      Column({ gap: 0 }, [railSection("Keys", theme), shortcuts]),
    ],
  );

  const pathHeader = Text({
    text: headerPath(rootPath, theme),
    foreground: theme.text,
    textOverflow: "ellipsis",
  });
  const tabSearch = Text({
    text: "Browser",
    foreground: theme.text,
    borderBottom: { color: theme.red },
  });
  const tabIndex = Text({ text: "Disks", foreground: theme.muted });
  const tabStrip = Row(
    {
      gap: 4,
      paddingX: 1,
      borderBottom: { color: theme.border },
    },
    [tabSearch, tabIndex],
  );
  const searchInput = Input({
    placeholder: "-> Type something",
    border: { color: theme.border, style: "square" },
    height: 3,
    minHeight: 3,
    maxHeight: 3,
    flexGrow: 0,
    flexShrink: 0,
    paddingX: 1,
    foreground: theme.text,
    onChange: (value) => {
      query(value);
      search(value);
    },
    onSubmit: () => pinActive(),
    onFocus: () => status("Typing fuzzy query"),
    onBlur: () => status(statusForResults(query(), results())),
  });
  const summary = Text({ text: "", foreground: theme.muted, textOverflow: "ellipsis" });
  const resultViewport = ScrollView(
    {
      flexGrow: 1,
      minHeight: 0,
      padding: "1 1",
      gap: 0,
      onScroll: ({ deltaY }) => resultViewport.scrollBy(deltaY),
    },
    [],
  );
  const processTitle = Text({
    text: styled([{ text: "Processes", foreground: theme.text, bold: true }]),
    borderBottom: { color: theme.red },
  });
  const processBody = Text({ text: "", foreground: theme.muted, wrap: "word" });
  const clipboardTitle = Text({
    text: styled([{ text: "Clipboard", foreground: theme.text, bold: true }]),
    borderBottom: { color: theme.red },
  });
  const clipboardBody = Text({ text: "", foreground: theme.muted, wrap: "word" });
  const bottomPanels = Row(
    {
      height: 8,
      flexShrink: 0,
      borderTop: { color: theme.border },
    },
    [
      Column(
        {
          flexGrow: 1,
          minWidth: 0,
          padding: "1 2",
          gap: 1,
          borderRight: { color: theme.border },
        },
        [processTitle, processBody],
      ),
      Column(
        { flexGrow: 1, minWidth: 0, padding: "1 2", gap: 1 },
        [clipboardTitle, clipboardBody],
      ),
    ],
  );

  const main = Column(
    {
      flexGrow: 1,
      minWidth: 0,
      border: { color: theme.redDim, style: "square" },
      background: theme.black,
    },
    [
      Row(
        {
          height: 3,
          flexShrink: 0,
          paddingX: 1,
          alignItems: "center",
          borderBottom: { color: theme.redDim },
        },
        [pathHeader],
      ),
      Column(
        {
          flexGrow: 1,
          minHeight: 0,
          paddingX: 1,
          gap: 1,
        },
        [tabStrip, searchInput, summary, resultViewport, bottomPanels],
      ),
    ],
  );

  const root = Row(
    {
      flexGrow: 1,
      minHeight: 0,
      padding: "1 2",
      gap: 1,
      background: theme.black,
    },
    [sidebar, main],
  );

  const app = run(root, { appearance: "dark" });
  const originalQuit = app.quit;
  app.quit = () => {
    stopScanTimer();
    finder?.destroy();
    native.close();
    originalQuit();
  };

  bindKeys();
  startScanTimer(finder);
  void waitForInitialScan(finder);
  searchInput.focus();

  async function waitForInitialScan(instance: FffFileFinder | null): Promise<void> {
    if (!instance) return;

    const scanned = await instance.waitForScan(5000);
    updateScanState(instance);

    if (!scanned.ok) {
      status(`Scan failed: ${scanned.error}`);
      return;
    }

    status(scanned.value ? "Index ready" : "Index still scanning");
    search(query());
  }

  function bindKeys(): void {
    onKey("/", () => searchInput.focus());
    onKey("r", () => rescan());
    onKey("\r", () => pinActive());

    for (const key of NAV_NEXT_KEYS) {
      onKey(key, () => moveActive(1));
    }

    for (const key of NAV_PREV_KEYS) {
      onKey(key, () => moveActive(-1));
    }
  }

  function startScanTimer(instance: FffFileFinder | null): void {
    if (!instance) return;

    scanTimer = setInterval(() => updateScanState(instance), 250);
  }

  function stopScanTimer(): void {
    if (!scanTimer) return;

    clearInterval(scanTimer);
    scanTimer = null;
  }

  function updateScanState(instance: FffFileFinder): void {
    const progress = instance.getScanProgress();
    if (!progress.ok) {
      status(`Scan status failed: ${progress.error}`);
      return;
    }

    indexedFiles(progress.value.scannedFilesCount);
    isScanning(progress.value.isScanning);
  }

  function search(value: string): void {
    const trimmed = value.trim();

    if (!finder) {
      results([]);
      activeIndex(0);
      return;
    }

    if (trimmed.length === 0) {
      results([]);
      activeIndex(0);
      status("Ready for fuzzy query");
      return;
    }

    const found = finder.fileSearch(trimmed, { pageSize: 80 });
    if (!found.ok) {
      results([]);
      activeIndex(0);
      status(`Search failed: ${found.error}`);
      return;
    }

    const next = found.value.items.map((item, index) =>
      toResultItem(rootPath, item, found.value.scores[index], native),
    );
    results(next);
    activeIndex(0);
    resultViewport.scrollToStart();
    status(`${found.value.totalMatched} matches for "${trimmed}"`);
  }

  function rescan(): void {
    if (!finder) return;

    const started = finder.scanFiles();
    if (!started.ok) {
      status(`Rescan failed: ${started.error}`);
      return;
    }

    isScanning(true);
    status("Rescanning index");
  }

  function moveActive(delta: number): void {
    searchInput.blur();
    if (results().length === 0) return;

    focusResult(activeIndex() + delta);
  }

  function focusResult(index: number): void {
    const nextIndex = clamp(index, results().length);
    activeIndex(nextIndex);

    const button = resultButtons[nextIndex];
    if (!button) return;

    button.focus();
    resultViewport.scrollNodeIntoView(button);
  }

  function pinActive(): void {
    const item = results()[activeIndex()];
    if (!item) return;

    pinnedPaths(
      [item.relativePath, ...pinnedPaths().filter((path) => path !== item.relativePath)].slice(
        0,
        6,
      ),
    );
    status(`Pinned ${item.relativePath}`);
  }

  ff(() => {
    const width = resultViewport.contentFrame.width;
    const nextColumns = width >= 86 ? 2 : 1;
    const cellWidth = Math.max(
      28,
      Math.floor((Math.max(width, 34) - (nextColumns - 1) * 2) / nextColumns),
    );
    const rows = results();
    const selectedIndex = clamp(activeIndex(), rows.length);
    const signature = `${nextColumns}:${cellWidth}:${rows.map(resultKey).join("\n")}`;
    const compactHeight = root.frameHeight() > 0 && root.frameHeight() < 30;

    if (layoutColumns() !== nextColumns) layoutColumns(nextColumns);
    if (selectedIndex !== activeIndex()) activeIndex(selectedIndex);
    bottomPanels.setStyle({ height: compactHeight ? 0 : 8 });

    indexInfo.setText(indexText(indexedFiles(), isScanning(), results().length, status()));
    pins.setText(pinsText(pinnedPaths()));
    summary.setText(summaryText(query(), rows));
    processBody.setText(detailsText(rows[selectedIndex]));
    clipboardBody.setText(clipboardText(rootPath, pinnedPaths()));

    if (signature !== resultSignature) {
      resultSignature = signature;
      rebuildResults(rows, nextColumns, cellWidth);
    }

    for (const [index, button] of resultButtons.entries()) {
      const active = index === selectedIndex && !searchInput.isFocused();
      button.setStyle({
        background: active ? theme.selection : undefined,
        foreground: theme.text,
      });
    }
  });

  function rebuildResults(items: readonly ResultItem[], columns: number, cellWidth: number): void {
    resultButtons = items.map((item, index) => createResultButton(item, index, cellWidth));

    const rows: Node[] = [];
    for (let index = 0; index < resultButtons.length; index += columns) {
      const rowButtons = resultButtons.slice(index, index + columns);
      rows.push(Row({ gap: 2, flexShrink: 0 }, rowButtons));
    }

    resultViewport.setChildren?.(rows);
  }

  function createResultButton(
    item: ResultItem,
    index: number,
    cellWidth: number,
  ): ReturnType<typeof Button> {
    const name = Text({
      text: resultName(item, theme),
      textOverflow: "ellipsis",
      wrap: "none",
    });

    return Button(
      {
        text: "",
        height: 1,
        width: cellWidth,
        minWidth: 28,
        paddingX: 1,
        onClick: () => {
          activeIndex(index);
          pinActive();
        },
        onFocus: () => activeIndex(index),
      },
      [name],
    );
  }

  return app;
}

type ResultItem = {
  fileName: string;
  relativePath: string;
  fullPath: string;
  size: number;
  modifiedMs: number;
  gitStatus: string;
  score: number;
  readable: boolean;
};

type NativeProbe = {
  pid: number | null;
  available: boolean;
  canRead(path: string): boolean;
  close(): void;
};

type NativeLibrary = {
  lib: koffi.IKoffiLib;
  getpid(): number;
  access(path: string, mode: number): number;
};

type SearchTheme = {
  black: number;
  border: number;
  selection: number;
  text: number;
  muted: number;
  dim: number;
  red: number;
  redDim: number;
};

const READ_OK = 4;

const SEARCH_THEME: SearchTheme = {
  black: 0x000000,
  border: 0x303030,
  selection: 0x1a080c,
  text: 0xd8d8d8,
  muted: 0x929292,
  dim: 0x686868,
  red: 0xff4d62,
  redDim: 0x5c1d28,
};

function toResultItem(
  rootPath: string,
  item: FileItem,
  score: Score | undefined,
  native: NativeProbe,
): ResultItem {
  const fullPath = join(rootPath, item.relativePath);

  return {
    fileName: item.fileName,
    relativePath: item.relativePath,
    fullPath,
    size: item.size,
    modifiedMs: item.modified * 1000,
    gitStatus: item.gitStatus,
    score: score?.total ?? 0,
    readable: native.canRead(fullPath),
  };
}

function createNativeProbe(): NativeProbe {
  const loaded = loadNativeLibrary();
  if (!loaded) {
    return {
      pid: null,
      available: false,
      canRead: () => true,
      close: () => {},
    };
  }

  return {
    pid: Number(loaded.getpid()),
    available: true,
    canRead: (path) => loaded.access(path, READ_OK) === 0,
    close: () => loaded.lib.unload(),
  };
}

function loadNativeLibrary(): NativeLibrary | null {
  const path =
    process.platform === "darwin"
      ? "/usr/lib/libSystem.B.dylib"
      : process.platform === "linux"
        ? "libc.so.6"
        : null;

  if (!path) return null;

  try {
    const lib = koffi.load(path);
    return {
      lib,
      getpid: lib.func("int getpid(void)") as () => number,
      access: lib.func("int access(const char *path, int mode)") as (
        path: string,
        mode: number,
      ) => number,
    };
  } catch {
    return null;
  }
}

function resolveRoot(value: string | undefined): string {
  const target = resolve(value ?? process.cwd());
  const stat = safeLstat(target);

  if (stat?.isDirectory()) return target;
  if (stat) return dirname(target);
  return process.cwd();
}

function safeLstat(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function railSection(label: string, theme: SearchTheme): Node {
  return Text({
    text: styled([{ text: label, foreground: theme.red, bold: true }]),
    borderBottom: { color: theme.redDim },
  });
}

function headerPath(rootPath: string, theme: SearchTheme): StyledText {
  return styled([
    { text: " ", foreground: theme.red },
    { text: shortPath(rootPath), foreground: theme.text, bold: true },
  ]);
}

function sidebarLocation(rootPath: string): StyledText {
  return styled([{ text: shortPath(rootPath), foreground: SEARCH_THEME.text }]);
}

function resultName(item: ResultItem, theme: SearchTheme): StyledText {
  return styled([
    { text: " ", foreground: theme.red },
    { text: item.fileName, foreground: theme.text },
  ]);
}

function shortResultPath(path: string): string {
  if (path.length <= 96) return path;

  return `...${path.slice(-93)}`;
}

function indexText(
  files: number,
  scanning: boolean,
  renderedResults: number,
  currentStatus: string,
): string {
  return [
    currentStatus,
    `${files} files ${scanning ? "scanning" : "ready"}`,
    `${renderedResults} visible matches`,
  ].join("\n");
}

function pinsText(paths: readonly string[]): string {
  if (paths.length === 0) return "No pinned matches";

  return paths.map((path) => `|- ${shortResultPath(path)}`).join("\n");
}

function summaryText(query: string, items: readonly ResultItem[]): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return "Type a fuzzy query";

  return `${items.length} ranked matches for "${trimmed}"`;
}

function detailsText(item: ResultItem | undefined): string {
  if (!item) return "No match selected";

  return [
    item.relativePath,
    `${item.readable ? "Readable" : "Not readable"}   ${formatBytes(item.size)}`,
    `score ${Math.round(item.score)}   ${item.gitStatus}`,
  ].join("\n");
}

function clipboardText(rootPath: string, paths: readonly string[]): string {
  if (paths.length === 0) return "Pinned matches appear here";

  return paths.map((path) => shortPath(join(rootPath, path))).join("\n");
}

function statusForResults(value: string, items: readonly ResultItem[]): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Ready for fuzzy query";

  return `${items.length} matches for "${trimmed}"`;
}

function resultKey(item: ResultItem): string {
  return [
    item.relativePath,
    item.size,
    item.modifiedMs,
    item.gitStatus,
    item.score,
    item.readable ? "read" : "locked",
  ].join("|");
}

function clamp(index: number, length: number): number {
  if (length <= 0) return 0;

  return Math.max(0, Math.min(index, length - 1));
}

function shortPath(path: string): string {
  const home = homedir();

  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

startFuzzyFileSearch();
