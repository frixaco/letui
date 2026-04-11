// ANITRACK torrent search demo: terminal-first search and stream launcher.
//
// Data flow:
// Search input → fetchResults() → scrape API → toScrapeResults() → results signal → ff() effect → result row tree render
// Keyboard / wheel → pane + scroll signals → ScrollView viewport → Rust paint-time clipping / hit-testing

import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  Button,
  Column,
  Input,
  Row,
  ScrollView,
  Text,
  $,
  ff,
  onKey,
  onScroll,
  run,
} from "@";
import { saveMetrics } from "@/metrics";
import type { StyledText, TextSpan } from "@";
import { COLORS } from "./colors.ts";
import { LoadingBar } from "./progress-bar";

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

  type ResultRow = {
    button: ReturnType<typeof Button>;
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
      await Bun.sleep(Math.min(timeoutMs, 150));
      return;
    }

    const deadline = Date.now() + timeoutMs;
    while (!existsSync(path) && Date.now() < deadline) {
      await Bun.sleep(50);
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
      payload && typeof payload === "object"
        ? (payload as any).results
        : undefined;

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

    if (
      typeof infoHash !== "string" ||
      !Array.isArray(files) ||
      files.length === 0
    ) {
      return null;
    }

    return { infoHash, fileIndex: files.length - 1 };
  }

  function resultTitleText(item: ScrapeResultItem): StyledText {
    return styled([
      { text: "  ", foreground: T.muted },
      { text: item.title, foreground: T.fg },
    ]);
  }

  function resultMetaText(item: ScrapeResultItem): StyledText {
    return styled([
      { text: `  ${item.size}`, foreground: T.accent },
      { text: "  ·  ", foreground: T.border },
      { text: item.date, foreground: T.muted, italic: true },
    ]);
  }

  function isPointInside(
    node: { frame: { x: number; y: number; width: number; height: number } },
    x: number,
    y: number,
  ): boolean {
    return (
      x >= node.frame.x &&
      y >= node.frame.y &&
      x < node.frame.x + node.frame.width &&
      y < node.frame.y + node.frame.height
    );
  }

  const MPV_SOCKET_WAIT_MS = 5000;

  const T = {
    fg: COLORS.default.fg,
    muted: COLORS.default.grey,
    accent: COLORS.default.cyan,
    active: COLORS.default.green,
    warn: COLORS.default.yellow,
    border: COLORS.default.surfaceHighlight,
    badgeFg: COLORS.default.surface,
  } as const;

  const idleBorder = { color: T.border, style: "rounded" as const };
  const focusBorder = { color: T.active, style: "rounded" as const };

  const results = $<ScrapeResultItem[]>([]);
  const loading = $(false);
  const resultsScrollY = $(0);
  const focusTarget = $<Pane>("input");
  const loadingBar = LoadingBar({
    dotColor: T.accent,
    trackColor: T.border,
  });

  let lastResultsSnapshot: ScrapeResultItem[] | null = null;
  let resultRows: ResultRow[] = [];

  const headerTitle = Text({
    text: "ANITRACK // TORRENT SEARCH",
    foreground: T.accent,
  });

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
      paddingX: 1,
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
    paddingX: 1,
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

  const searchPanel = Column(
    {
      gap: 1,
      paddingX: 1,
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

  const resultsSummary = Text({
    text: "",
    foreground: T.muted,
  });

  const resultsViewport = ScrollView(
    {
      flexGrow: 1,
      minHeight: 0,
      gap: 0,
      scrollY: 0,
    },
    [],
  );

  const helpLine = Text({
    text: "/ search   Tab pane   j/k or wheel scroll   h top   l +10   Enter/click stream   q quit",
    foreground: T.muted,
  });

  const resultsPanel = Column(
    {
      gap: 1,
      paddingX: 1,
      flexGrow: 1,
      minHeight: 0,
    },
    [
      Text({ text: "RESULTS", foreground: T.accent }),
      resultsSummary,
      resultsViewport,
      helpLine,
    ],
  );

  const root = Column({ flexGrow: 1 }, [header, searchPanel, resultsPanel]);

  function setPane(target: Pane): void {
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
    resultsScrollY(0);
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
      resultsScrollY(0);
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
      const response = await fetch(
        "https://rqbit.anitrack.frixaco.com/torrents",
        {
          method: "post",
          body: magnet,
        },
      );

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

  function createResultRow(item: ScrapeResultItem): ResultRow {
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
        foreground: T.fg,
        onFocus: () => {
          setPane("results");
        },
        onClick: () => {
          setPane("results");
          if (item.magnet.length > 0) streamResult(item.magnet);
        },
      },
      [Column({ gap: 0 }, [title, meta])],
    );

    return { button };
  }

  function rebuildResultRows(items: readonly ScrapeResultItem[]): void {
    resultRows = items.map((item) => createResultRow(item));
    lastResultsSnapshot = [...items];
    resultsViewport.setChildren?.(resultRows.map((row) => row.button));
  }

  function scrollResults(offset: number): void {
    if (focusTarget() !== "results") return;
    resultsScrollY(Math.max(0, resultsScrollY() + offset));
  }

  function scrollResultsFromPointer(deltaY: number, x: number, y: number): void {
    if (deltaY === 0 || results().length === 0) return;
    if (!isPointInside(resultsViewport, x, y)) return;

    setPane("results");
    scrollResults(deltaY);
  }

  function resetScroll(): void {
    if (focusTarget() !== "results") return;
    resultsScrollY(0);
  }

  function togglePane(): void {
    setPane(focusTarget() === "input" ? "results" : "input");
  }

  ff(() => {
    const all = results();
    const isLoading = loading();
    const activePane = focusTarget();
    const scrollY = resultsScrollY();

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
        ? `focus ${activePane}   scrollY ${scrollY}`
        : `focus ${activePane}`,
    );

    resultsSummary.setText(
      all.length === 0
        ? "no results - enter a query to search"
        : `${all.length} results   scrollY ${scrollY}`,
    );
    resultsSummary.setStyle({
      foreground: all.length === 0 ? T.muted : T.accent,
    });
    resultsViewport.setStyle({ scrollY });

    if (all.length === 0) {
      resultRows = [];
      lastResultsSnapshot = [];
      resultsViewport.setChildren?.([]);
      if (activePane === "results") setPane("input");
      return;
    }

    const resultsChanged =
      all.length !== lastResultsSnapshot?.length ||
      all.some((item, index) => lastResultsSnapshot?.[index] !== item);

    if (resultsChanged) {
      rebuildResultRows(all);
    }
  });

  onKey("/", () => setPane("input"));

  for (const key of ["\t", "\x1b[Z"]) {
    onKey(key, () => togglePane());
  }

  for (const key of ["j", "\x1b[B"]) {
    onKey(key, () => scrollResults(1));
  }

  for (const key of ["k", "\x1b[A"]) {
    onKey(key, () => scrollResults(-1));
  }

  for (const key of ["h"]) {
    onKey(key, () => resetScroll());
  }

  for (const key of ["l"]) {
    onKey(key, () => scrollResults(10));
  }

  const app = run(root, { debug: true });

  onKey("q", () => {
    saveMetrics();
    app.quit();
  });

  onScroll(({ deltaY, x, y }) => {
    scrollResultsFromPointer(deltaY, x, y);
  });

  setPane("input");
  return app;
}

startAniTrackDemo();
