// ANITRACK torrent search demo: terminal-first search and stream launcher.
//
// Data flow:
// Search input → fetchResults() → scrape API → toScrapeResults() → results signal → ff() effect → result row tree render
// Keyboard / wheel → pane focus → ScrollView methods → Rust layout metrics → clamped viewport state

import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Button, Column, Input, Row, ScrollView, Text, $, appearance, ff, onKey, run } from "@";
import type { Appearance, StyledText, TextSpan } from "@";
import { COLORS } from "./colors.ts";
import { LoadingBar } from "./progress-bar.ts";

function startAniTrackDemo(): ReturnType<typeof run> {
  type Pane = "input" | "results";

  type ScrapeResultItem = {
    title: string;
    size: string;
    date: string;
    magnet: string;
  };

  type StreamTarget = {
    infoHash: string;
    fileIndex: number;
  };

  type StyledSegment = Omit<TextSpan, "start" | "end"> & { text: string };

  type DemoTheme = {
    surface: number;
    surfaceHighlight: number;
    fg: number;
    muted: number;
    accent: number;
    active: number;
    warn: number;
    badgeFg: number;
  };

  function createMpvIpcPath(): string {
    const suffix = `${process.pid}-${Date.now()}`;

    if (process.platform === "win32") {
      return `\\\\.\\pipe\\mpv-socket-${suffix}`;
    }

    return join(tmpdir(), `mpv-socket-${suffix}`);
  }

  async function waitForMpvIpc(path: string, timeoutMs: number): Promise<void> {
    if (process.platform === "win32") {
      await sleep(Math.min(timeoutMs, 150));
      return;
    }

    const deadline = Date.now() + timeoutMs;
    while (!existsSync(path) && Date.now() < deadline) {
      await sleep(50);
    }
  }

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

  function toStreamTarget(payload: unknown): StreamTarget | null {
    if (!payload || typeof payload !== "object") return null;

    const details = (payload as any).details;
    if (!details || typeof details !== "object") return null;

    const infoHash = details.info_hash;
    const files = details.files;

    if (typeof infoHash !== "string" || !Array.isArray(files) || files.length === 0) {
      return null;
    }

    return { infoHash, fileIndex: files.length - 1 };
  }

  function resultTitleText(item: ScrapeResultItem): StyledText {
    const theme = currentTheme();
    return styled([
      { text: "  ", foreground: theme.muted },
      { text: item.title, foreground: theme.fg },
    ]);
  }

  function resultMetaText(item: ScrapeResultItem): StyledText {
    const theme = currentTheme();
    return styled([
      { text: `  ${item.size}`, foreground: theme.accent },
      { text: "  ·  ", foreground: theme.surfaceHighlight },
      { text: item.date, foreground: theme.muted, italic: true },
    ]);
  }

  const MPV_SOCKET_WAIT_MS = 5000;

  function themeForAppearance(mode: Appearance): DemoTheme {
    const palette = mode === "light" ? COLORS.light : COLORS.default;
    return {
      surface: palette.surface,
      surfaceHighlight: palette.surfaceHighlight,
      fg: palette.fg,
      muted: palette.grey,
      accent: palette.cyan,
      active: palette.green,
      warn: palette.yellow,
      badgeFg: palette.surface,
    };
  }

  function currentTheme(): DemoTheme {
    return themeForAppearance(appearance());
  }

  function idleBorder() {
    return {
      color: currentTheme().surfaceHighlight,
      style: "rounded" as const,
    };
  }

  function focusBorder() {
    return { color: currentTheme().active, style: "rounded" as const };
  }

  const initialTheme = currentTheme();

  const results = $<ScrapeResultItem[]>([]);
  const loading = $(false);
  const focusTarget = $<Pane>("input");
  const activeResultIndex = $(0);
  const loadingBar = LoadingBar({
    dotColor: initialTheme.accent,
    trackColor: initialTheme.surfaceHighlight,
  });

  let lastResultsSnapshot: ScrapeResultItem[] | null = null;
  let lastAppearanceMode: Appearance | null = null;
  let resultButtons: ReturnType<typeof Button>[] = [];

  const headerTitle = Text({
    text: "ANITRACK // TORRENT SEARCH",
    foreground: initialTheme.accent,
  });

  const headerMeta = Text({ text: "", foreground: initialTheme.muted });
  const searchTitle = Text({ text: "SEARCH", foreground: initialTheme.accent });
  const searchHint = Text({
    text: "Enter search   Tab results",
    foreground: initialTheme.muted,
  });
  const resultsTitle = Text({
    text: "RESULTS",
    foreground: initialTheme.accent,
  });

  const statusBadge = Text({
    text: " idle ",
    foreground: initialTheme.badgeFg,
    background: initialTheme.muted,
    paddingX: 1,
  });

  const countBadge = Text({
    text: "",
    foreground: initialTheme.badgeFg,
    background: initialTheme.accent,
    paddingX: 1,
  });

  const header = Column(
    {
      paddingX: 1,
      borderBottom: { color: initialTheme.surfaceHighlight },
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
    border: idleBorder(),
    paddingX: 1,
    foreground: initialTheme.fg,
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
      self.setStyle({ border: focusBorder() });
    },
    onBlur: (self) => self.setStyle({ border: idleBorder() }),
  });

  const searchPanel = Column(
    {
      gap: 1,
      paddingX: 1,
      borderBottom: { color: initialTheme.surfaceHighlight },
      flexShrink: 0,
    },
    [
      Row({ gap: 1, alignItems: "center", flexWrap: "wrap" }, [searchTitle, searchHint]),
      Row({ alignItems: "stretch" }, [searchInput]),
      Row({}, [loadingBar.node]),
    ],
  );

  const resultsSummary = Text({
    text: "",
    foreground: initialTheme.muted,
  });

  const resultsViewport = ScrollView(
    {
      flexGrow: 1,
      minHeight: 0,
      gap: 0,
      scrollY: 0,
      onScroll: ({ deltaY, x, y }) => {
        scrollResultsFromPointer(deltaY, x, y);
      },
    },
    [],
  );

  const helpLine = Text({
    text: "/ search   Tab pane   arrows move   j/k or wheel scroll   h top   l +10   Enter/click stream   q quit",
    foreground: initialTheme.muted,
  });

  const resultsPanel = Column(
    {
      gap: 1,
      paddingX: 1,
      flexGrow: 1,
      minHeight: 0,
    },
    [resultsTitle, resultsSummary, resultsViewport, helpLine],
  );

  const root = Column({ flexGrow: 1, background: initialTheme.surface }, [
    header,
    searchPanel,
    resultsPanel,
  ]);

  const nextResultKeys = new Set(["j", "\x1b[B", "\x1bOB"]);
  const prevResultKeys = new Set(["k", "\x1b[A", "\x1bOA"]);
  const togglePaneKeys = new Set(["\t", "\x1b[Z"]);

  function setPane(target: Pane): void {
    if (target === "results" && results().length > 0) {
      focusTarget("results");
      if (searchInput.isFocused()) searchInput.blur();
      focusResult(activeResultIndex());
      return;
    }

    focusTarget("input");
    searchInput.focus();
  }

  function clearResults(): void {
    results([]);
    resultsViewport.scrollToStart();
    activeResultIndex(0);
    resultButtons = [];
    setPane("input");
  }

  async function fetchResults(query: string): Promise<void> {
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
      resultsViewport.scrollToStart();
      setPane(parsedResults.length > 0 ? "results" : "input");
    } catch {
      clearResults();
    } finally {
      loading(false);
      loadingBar.stop();
    }
  }

  async function streamResult(magnet: string): Promise<void> {
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

  function createResultRow(item: ScrapeResultItem, index: number): ReturnType<typeof Button> {
    const title = Text({
      text: resultTitleText(item),
      wrap: "word",
    });

    const meta = Text({
      text: resultMetaText(item),
      wrap: "word",
    });

    const button = Button(
      {
        text: "",
        border: undefined,
        paddingX: 1,
        foreground: currentTheme().fg,
        onKeyDown: (key) => handleResultKey(key),
        onFocus: () => {
          focusTarget("results");
          activeResultIndex(index);
          resultsViewport.scrollNodeIntoView(button);
        },
        onClick: () => {
          focusResult(index);
          if (item.magnet.length > 0) streamResult(item.magnet);
        },
      },
      [Column({ gap: 0 }, [title, meta])],
    );

    return button;
  }

  function rebuildResultRows(items: readonly ScrapeResultItem[]): void {
    lastResultsSnapshot = [...items];
    resultButtons = items.map(createResultRow);
    resultsViewport.setChildren?.(resultButtons);
  }

  function scrollResults(offset: number): void {
    if (focusTarget() !== "results") return;
    resultsViewport.scrollBy(offset);
  }

  function scrollResultsFromPointer(deltaY: number, _x: number, _y: number): void {
    if (deltaY === 0 || results().length === 0) return;

    setPane("results");
    resultsViewport.scrollBy(deltaY);
  }

  function resetScroll(): void {
    if (focusTarget() !== "results") return;
    resultsViewport.scrollToStart();
  }

  function clampResultIndex(index: number): number {
    return Math.max(0, Math.min(index, resultButtons.length - 1));
  }

  function focusResult(index: number): void {
    if (resultButtons.length === 0) return;

    const nextIndex = clampResultIndex(index);
    const button = resultButtons[nextIndex];
    if (!button) return;

    activeResultIndex(nextIndex);
    focusTarget("results");
    button.focus();
    resultsViewport.scrollNodeIntoView(button);
  }

  function moveResultFocus(delta: number): void {
    if (focusTarget() !== "results" || resultButtons.length === 0) return;
    focusResult(activeResultIndex() + delta);
  }

  function handleResultKey(key: string): boolean {
    if (focusTarget() !== "results" || resultButtons.length === 0) return false;

    if (nextResultKeys.has(key)) {
      moveResultFocus(1);
      return true;
    }

    if (prevResultKeys.has(key)) {
      moveResultFocus(-1);
      return true;
    }

    if (togglePaneKeys.has(key)) {
      togglePane();
      return true;
    }

    return false;
  }

  function togglePane(): void {
    setPane(focusTarget() === "input" ? "results" : "input");
  }

  ff(() => {
    const all = results();
    const isLoading = loading();
    const activePane = focusTarget();
    const activeIndex = activeResultIndex();
    const scrollY = resultsViewport.scrollY();
    const appearanceMode = appearance();
    const theme = themeForAppearance(appearanceMode);
    const themeChanged = appearanceMode !== lastAppearanceMode;

    root.setStyle({ background: theme.surface });
    header.setStyle({
      borderBottom: { color: theme.surfaceHighlight },
    });
    searchPanel.setStyle({
      borderBottom: { color: theme.surfaceHighlight },
    });
    searchInput.setStyle({
      foreground: theme.fg,
      border: searchInput.isFocused() ? focusBorder() : idleBorder(),
    });
    headerTitle.setStyle({ foreground: theme.accent });
    headerMeta.setStyle({ foreground: theme.muted });
    searchTitle.setStyle({ foreground: theme.accent });
    searchHint.setStyle({ foreground: theme.muted });
    resultsTitle.setStyle({ foreground: theme.accent });
    helpLine.setStyle({ foreground: theme.muted });
    loadingBar.setColors({
      dotColor: theme.accent,
      trackColor: theme.surfaceHighlight,
    });

    if (isLoading) {
      statusBadge.setText(" searching ");
      statusBadge.setStyle({
        foreground: theme.badgeFg,
        background: theme.warn,
      });
    } else if (all.length > 0) {
      statusBadge.setText(" ready ");
      statusBadge.setStyle({
        foreground: theme.badgeFg,
        background: theme.active,
      });
    } else {
      statusBadge.setText(" idle ");
      statusBadge.setStyle({
        foreground: theme.badgeFg,
        background: theme.muted,
      });
    }

    countBadge.setText(all.length > 0 ? ` ${all.length} results ` : "");
    countBadge.setStyle({
      foreground: theme.badgeFg,
      background: all.length > 0 ? theme.accent : undefined,
    });

    headerMeta.setText(
      all.length > 0 ? `focus ${activePane}   scrollY ${scrollY}` : `focus ${activePane}`,
    );

    resultsSummary.setText(
      all.length === 0
        ? "no results - enter a query to search"
        : `${all.length} results   scrollY ${scrollY}`,
    );
    resultsSummary.setStyle({
      foreground: all.length === 0 ? theme.muted : theme.accent,
    });

    if (all.length === 0) {
      lastResultsSnapshot = [];
      lastAppearanceMode = appearanceMode;
      resultButtons = [];
      resultsViewport.setChildren?.([]);
      if (activePane === "results") setPane("input");
      return;
    }

    const resultsChanged =
      all.length !== lastResultsSnapshot?.length ||
      all.some((item, index) => lastResultsSnapshot?.[index] !== item);

    if (resultsChanged || themeChanged) {
      rebuildResultRows(all);

      if (resultsChanged) {
        activeResultIndex(0);
        focusResult(0);
      } else {
        activeResultIndex(clampResultIndex(activeIndex));
        if (activePane === "results") {
          focusResult(activeResultIndex());
        }
      }
    }

    const selectedIndex = clampResultIndex(activeResultIndex());
    for (const [index, button] of resultButtons.entries()) {
      const isActive = index === selectedIndex;
      button.setStyle({
        foreground: theme.fg,
        border: isActive ? focusBorder() : idleBorder(),
      });
    }

    lastAppearanceMode = appearanceMode;
  });

  onKey("/", () => setPane("input"));

  for (const key of togglePaneKeys) {
    onKey(key, () => togglePane());
  }

  for (const key of nextResultKeys) {
    onKey(key, () => moveResultFocus(1));
  }

  for (const key of prevResultKeys) {
    onKey(key, () => moveResultFocus(-1));
  }

  for (const key of ["h"]) {
    onKey(key, () => resetScroll());
  }

  for (const key of ["l"]) {
    onKey(key, () => scrollResults(10));
  }

  const app = run(root, { debug: true });

  onKey("q", () => {
    app.quit();
  });

  setPane("input");
  return app;
}

startAniTrackDemo();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
