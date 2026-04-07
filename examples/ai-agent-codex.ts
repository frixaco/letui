// AI agent Codex demo: threaded chat UI with streamed responses and layout sync.
//
// Data flow:
// User input → submitPrompt() → handleAgentStream() → SDK stream → handleThreadEvent() → UI update
// Keyboard events → cycleFocus() / moveThreadSelection() → thread state → refreshView() → sync functions

import { Codex, type Thread as CodexThread, type ThreadEvent, type Usage } from "@openai/codex-sdk";
import { createHighlighter, type Highlighter } from "shiki";

import { Button, Column, Input, Row, Text, ff, onKey, run } from "@";
import type { StyledText, TextSpan } from "@";

// --- Domain vocabulary ---

type SidebarMode = "prompts" | "threads";
type ThreadStatus = "idle" | "streaming" | "error";
type ChatRole = "user" | "assistant" | "error";
type PromptSectionTone = "accent" | "blue" | "lime";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type AgentThreadState = {
  sdkThread: CodexThread;
  title: string;
  prompts: string[];
  messages: ChatMessage[];
  status: ThreadStatus;
  lastLatencyMs: number | null;
  usage: Usage | null;
};

type StyledSegment = Omit<TextSpan, "start" | "end"> & { text: string };

type InlineStyle = {
  foreground?: number;
  background?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; lang: string | null; code: string };

// --- Primary abstraction ---

const MODEL = "gpt-5.4";
const REASONING: "medium" = "medium";
const SHIKI_THEME = "github-dark";

// --- Binary layout ---

const STACKED_BREAKPOINT = 86;
const COMPACT_BREAKPOINT = 108;
const TIGHT_BREAKPOINT = 72;

// --- Supporting types ---

const THEME = {
  bg: 0x0b1220,
  border: 0x233048,
  text: 0xe5e7eb,
  muted: 0x94a3b8,
  accent: 0x38bdf8,
  blue: 0x60a5fa,
  lime: 0x34d399,
  amber: 0xf59e0b,
  red: 0xf87171,
  codeInlineFg: 0xcbd5e1,
  codeFenceFg: 0x9ca3af,
} as const;

const idleBorder = { color: THEME.border, style: "rounded" as const };
const focusBorder = { color: THEME.accent, style: "rounded" as const };

const codex = new Codex();
let highlighter: Highlighter | null = null;

try {
  highlighter = await createHighlighter({
    themes: [SHIKI_THEME],
    langs: ["js", "ts", "rust"],
  });
} catch {
  highlighter = null;
}

// --- Internal state ---

let nextMessageId = 1;
let sidebarMode: SidebarMode = "threads";
let activeThreadIndex = 0;
const threads: AgentThreadState[] = [createThreadState()];

let promptRows: ReturnType<typeof Text>[] = [];
let transcriptRows: ReturnType<typeof Text>[] = [];

const codeBlockCache = new Map<string, StyledSegment[][]>();

// --- Core algorithm ---

function createThreadState(): AgentThreadState {
  return {
    sdkThread: codex.startThread({
      model: MODEL,
      modelReasoningEffort: REASONING,
      workingDirectory: process.cwd(),
    }),
    title: "New Thread",
    prompts: [],
    messages: [],
    status: "idle",
    lastLatencyMs: null,
    usage: null,
  };
}

function activeThread(): AgentThreadState {
  return threads[activeThreadIndex]!;
}

function textLength(text: string): number {
  return Array.from(text).length;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  const chars = Array.from(text);
  if (chars.length <= width) return text;
  if (width === 1) return "…";
  return `${chars.slice(0, width - 1).join("")}…`;
}

function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasSpanStyle(segment: StyledSegment): boolean {
  return (
    segment.foreground !== undefined ||
    segment.background !== undefined ||
    segment.bold !== undefined ||
    segment.italic !== undefined ||
    segment.underline !== undefined
  );
}

function styledLine(segments: readonly StyledSegment[]): StyledText {
  let text = "";
  let cursor = 0;
  const spans: TextSpan[] = [];

  for (const segment of segments) {
    const start = cursor;
    text += segment.text;
    cursor += textLength(segment.text);

    if (!hasSpanStyle(segment)) continue;

    spans.push({
      start,
      end: cursor,
      foreground: segment.foreground,
      background: segment.background,
      bold: segment.bold,
      italic: segment.italic,
      underline: segment.underline,
    });
  }

  return { text, spans };
}

function clippedLine(segments: readonly StyledSegment[], width: number): StyledText {
  return styledLine(clipSegments(segments, width));
}

function cloneSegments(segments: readonly StyledSegment[]): StyledSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

function segmentsWidth(segments: readonly StyledSegment[]): number {
  let width = 0;
  for (const segment of segments) {
    width += textLength(segment.text);
  }
  return width;
}

function trimTrailingWhitespace(segments: StyledSegment[]): StyledSegment[] {
  const trimmed = cloneSegments(segments);

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (!last) break;
    if (!/\s+$/.test(last.text)) break;

    const nextText = last.text.replace(/\s+$/g, "");
    if (nextText.length === 0) {
      trimmed.pop();
      continue;
    }

    last.text = nextText;
    break;
  }

  return trimmed;
}

function trimTrailingEmptyLines(lines: StyledText[]): void {
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last || last.text.length > 0) break;
    lines.pop();
  }
}

function segmentTokens(segments: readonly StyledSegment[]): StyledSegment[] {
  const tokens: StyledSegment[] = [];

  for (const segment of segments) {
    const parts = segment.text.split(/(\s+)/).filter(Boolean);
    for (const part of parts) {
      tokens.push({ ...segment, text: part });
    }
  }

  return tokens;
}

function wrapSegments(
  segments: readonly StyledSegment[],
  width: number,
  prefix: readonly StyledSegment[] = [],
): StyledText[] {
  const tokens = segmentTokens(segments);
  const lines: StyledText[] = [];
  let current = cloneSegments(prefix);
  let prefixWidth = segmentsWidth(current);
  let currentWidth = prefixWidth;

  const resetLine = () => {
    current = cloneSegments(prefix);
    prefixWidth = segmentsWidth(current);
    currentWidth = prefixWidth;
  };

  for (const token of tokens) {
    const isWhitespace = /^\s+$/.test(token.text);
    const tokenWidth = textLength(token.text);

    if (isWhitespace && currentWidth === prefixWidth) {
      continue;
    }

    if (currentWidth + tokenWidth <= width) {
      current.push({ ...token });
      currentWidth += tokenWidth;
      continue;
    }

    if (isWhitespace) {
      lines.push(styledLine(trimTrailingWhitespace(current)));
      resetLine();
      continue;
    }

    if (currentWidth > prefixWidth) {
      lines.push(styledLine(trimTrailingWhitespace(current)));
      resetLine();
    }

    const available = Math.max(1, width - currentWidth);
    const clipped = truncate(token.text, available);
    current.push({ ...token, text: clipped });
    currentWidth += textLength(clipped);
  }

  if (current.length > 0) {
    lines.push(styledLine(trimTrailingWhitespace(current)));
  }

  return lines;
}

function clipSegments(segments: readonly StyledSegment[], width: number): StyledSegment[] {
  if (width <= 0) return [];

  const clipped: StyledSegment[] = [];
  let remaining = width;

  for (const segment of segments) {
    if (remaining <= 0) break;

    const len = textLength(segment.text);
    if (len <= remaining) {
      clipped.push({ ...segment });
      remaining -= len;
      continue;
    }

    clipped.push({ ...segment, text: truncate(segment.text, remaining) });
    remaining = 0;
  }

  return clipped;
}

function shortPromptLabel(prompt: string, width: number): string {
  return truncate(prompt.replace(/\s+/g, " ").trim(), width);
}

function threadTitleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "New Thread";
  return truncate(normalized, 48);
}

function modeButtonStyle(mode: SidebarMode, buttonMode: SidebarMode, focused: boolean) {
  if (mode === buttonMode) {
    return {
      background: undefined,
      foreground: focused ? THEME.blue : THEME.text,
      borderBottom: { color: focused ? THEME.blue : THEME.accent },
    };
  }

  return {
    background: undefined,
    foreground: focused ? THEME.blue : THEME.muted,
    borderBottom: undefined,
  };
}

function applyModeStyles(): void {
  promptsTab.setStyle(modeButtonStyle(sidebarMode, "prompts", promptsTab.isFocused()));
  threadsTab.setStyle(modeButtonStyle(sidebarMode, "threads", threadsTab.isFocused()));
}

function setSidebarMode(mode: SidebarMode): void {
  sidebarMode = mode;
  applyModeStyles();
  refreshView();
}

function createInlineSegments(text: string, style: InlineStyle = {}): StyledSegment[] {
  const segments: StyledSegment[] = [];
  let plain = "";

  const flushPlain = () => {
    if (!plain) return;
    segments.push({ text: plain, ...style });
    plain = "";
  };

  for (let i = 0; i < text.length; ) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flushPlain();
        const inner = createInlineSegments(text.slice(i + 2, end), {
          ...style,
          bold: true,
        });
        segments.push(...inner);
        i = end + 2;
        continue;
      }
    }

    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        flushPlain();
        const inner = createInlineSegments(text.slice(i + 1, end), {
          ...style,
          italic: true,
        });
        segments.push(...inner);
        i = end + 1;
        continue;
      }
    }

    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flushPlain();
        segments.push({
          text: text.slice(i + 1, end),
          foreground: THEME.codeInlineFg,
        });
        i = end + 1;
        continue;
      }
    }

    plain += text[i]!;
    i += 1;
  }

  flushPlain();
  return segments;
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let inCode = false;
  let codeLang: string | null = null;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      type: "paragraph",
      text: paragraph.join(" ").trim(),
    });
    paragraph = [];
  };

  const flushCode = () => {
    blocks.push({
      type: "code",
      lang: codeLang,
      code: codeLines.join("\n"),
    });
    inCode = false;
    codeLang = null;
    codeLines = [];
  };

  for (const line of lines) {
    if (inCode) {
      if (line.startsWith("```")) {
        flushCode();
      } else {
        codeLines.push(line.replace(/\t/g, "  "));
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      const lang = line.slice(3).trim().toLowerCase();
      inCode = true;
      codeLang = lang.length > 0 ? lang : null;
      codeLines = [];
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line.trim());
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length as 1 | 2 | 3,
        text: headingMatch[2]!,
      });
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  if (inCode) flushCode();

  return blocks;
}

function headingTone(level: 1 | 2 | 3): PromptSectionTone {
  if (level === 1) return "accent";
  if (level === 2) return "blue";
  return "lime";
}

function sectionToneColor(tone: PromptSectionTone): number {
  switch (tone) {
    case "accent":
      return THEME.accent;
    case "blue":
      return THEME.blue;
    case "lime":
      return THEME.lime;
  }
}

function resolveCodeLang(lang: string | null): "js" | "ts" | "rust" | null {
  if (!lang) return null;
  const normalized = lang.toLowerCase();
  if (normalized === "js" || normalized === "javascript") return "js";
  if (normalized === "ts" || normalized === "typescript") return "ts";
  if (normalized === "rust" || normalized === "rs") return "rust";
  return null;
}

function hexToColor(hex: string | undefined): number | undefined {
  if (!hex || !hex.startsWith("#")) return undefined;
  const raw = hex.slice(1);
  if (raw.length !== 6) return undefined;
  return Number.parseInt(raw, 16);
}

function highlightCodeBlock(code: string, lang: string | null): StyledSegment[][] {
  const cacheKey = `${lang ?? "plain"}\u0000${code}`;
  const cached = codeBlockCache.get(cacheKey);
  if (cached) return cached;

  const resolvedLang = resolveCodeLang(lang);
  if (!highlighter || !resolvedLang || code.trim().length === 0) {
    const fallback = code.split("\n").map((line) => [
      {
        text: line.length === 0 ? " " : line,
        foreground: THEME.codeFenceFg,
      },
    ]);
    codeBlockCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const tokens = highlighter.codeToTokens(code, {
      lang: resolvedLang,
      theme: SHIKI_THEME,
    }).tokens;
    const highlighted = tokens.map((line) =>
      line.map((token) => ({
        text: token.content.length === 0 ? " " : token.content,
        foreground: hexToColor(token.color) ?? THEME.codeFenceFg,
      })),
    );
    codeBlockCache.set(cacheKey, highlighted);
    return highlighted;
  } catch {
    const fallback = code.split("\n").map((line) => [
      {
        text: line.length === 0 ? " " : line,
        foreground: THEME.codeFenceFg,
      },
    ]);
    codeBlockCache.set(cacheKey, fallback);
    return fallback;
  }
}

function renderCodeBlock(
  code: string,
  lang: string | null,
  width: number,
  indent: readonly StyledSegment[],
): StyledText[] {
  const lines: StyledText[] = [];
  const label = lang ? lang.toUpperCase() : "TEXT";

  lines.push(
    clippedLine(
      clipSegments(
        [...indent, { text: `CODE ${label}`, foreground: THEME.codeFenceFg, bold: true }],
        width,
      ),
      width,
    ),
  );

  const highlighted = highlightCodeBlock(code, lang);
  for (const line of highlighted) {
    lines.push(styledLine(clipSegments([...indent, ...line], width)));
  }

  return lines;
}

function renderMarkdownToLines(text: string, width: number): StyledText[] {
  const blocks = parseMarkdownBlocks(text);
  const lines: StyledText[] = [];
  const paragraphIndent = [{ text: "  ", foreground: THEME.muted }];

  for (const block of blocks) {
    if (block.type === "heading") {
      const tone = headingTone(block.level);
      lines.push(
        ...wrapSegments(
          createInlineSegments(block.text, {
            foreground: sectionToneColor(tone),
            bold: true,
          }),
          width,
          paragraphIndent,
        ),
      );
      lines.push(styledLine([]));
      continue;
    }

    if (block.type === "paragraph") {
      lines.push(
        ...wrapSegments(
          createInlineSegments(block.text, {
            foreground: THEME.text,
          }),
          width,
          paragraphIndent,
        ),
      );
      lines.push(styledLine([]));
      continue;
    }

    lines.push(...renderCodeBlock(block.code, block.lang, width, paragraphIndent));
    lines.push(styledLine([]));
  }

  trimTrailingEmptyLines(lines);
  return lines;
}

function renderMessageLines(message: ChatMessage, width: number): StyledText[] {
  const lines: StyledText[] = [];

  if (message.role === "user") {
    lines.push(clippedLine([{ text: "YOU", foreground: THEME.amber, bold: true }], width));
    lines.push(
      ...wrapSegments(createInlineSegments(message.content, { foreground: THEME.text }), width, [
        { text: "  ", foreground: THEME.muted },
      ]),
    );
    lines.push(styledLine([]));
    return lines;
  }

  if (message.role === "error") {
    lines.push(clippedLine([{ text: "ERROR", foreground: THEME.red, bold: true }], width));
    lines.push(
      ...wrapSegments(createInlineSegments(message.content, { foreground: THEME.red }), width, [
        { text: "  ", foreground: THEME.muted },
      ]),
    );
    lines.push(styledLine([]));
    return lines;
  }

  lines.push(clippedLine([{ text: "AI", foreground: THEME.accent, bold: true }], width));

  if (message.content.trim().length === 0) {
    lines.push(
      clippedLine([{ text: "  thinking…", foreground: THEME.muted, italic: true }], width),
    );
    lines.push(styledLine([]));
    return lines;
  }

  lines.push(...renderMarkdownToLines(message.content, width));
  lines.push(styledLine([]));
  return lines;
}

function buildTranscriptLines(thread: AgentThreadState, width: number): StyledText[] {
  const lines: StyledText[] = [];

  if (thread.messages.length === 0) {
    return [
      clippedLine([{ text: "AI AGENT", foreground: THEME.accent, bold: true }], width),
      ...wrapSegments(
        [{ text: "  Submit a prompt to start the thread.", foreground: THEME.muted }],
        width,
      ),
      ...wrapSegments([{ text: "  Ctrl+N creates a new thread.", foreground: THEME.muted }], width),
    ];
  }

  for (const message of thread.messages) {
    lines.push(...renderMessageLines(message, width));
  }

  trimTrailingEmptyLines(lines);
  return lines;
}

function visiblePromptLabels(thread: AgentThreadState, count: number): StyledText[] {
  const width = Math.max(1, Math.floor(sidebarListViewport.frameWidth()) - 2);

  if (thread.prompts.length === 0) {
    return [clippedLine([{ text: "No prompts yet.", foreground: THEME.muted }], width)];
  }

  return thread.prompts.slice(0, count).map((prompt, index) =>
    clippedLine(
      [
        { text: `${index + 1}. `, foreground: THEME.muted },
        { text: shortPromptLabel(prompt, width), foreground: THEME.text },
      ],
      width,
    ),
  );
}

function visibleThreadLabels(count: number): StyledText[] {
  const width = Math.max(1, Math.floor(sidebarListViewport.frameWidth()) - 2);
  return threads.slice(0, count).map((thread, index) => {
    const active = index === activeThreadIndex;
    const marker = active ? "● " : "○ ";
    const statusColor =
      thread.status === "streaming"
        ? THEME.lime
        : thread.status === "error"
          ? THEME.red
          : THEME.muted;

    const countLabel = ` ${thread.prompts.length}`;
    const titleBudget =
      width >= 14
        ? Math.max(1, width - textLength(marker) - textLength(countLabel))
        : Math.max(1, width - textLength(marker));

    return clippedLine(
      [
        {
          text: marker,
          foreground: active ? THEME.accent : THEME.muted,
          bold: active || undefined,
        },
        {
          text: truncate(thread.title, titleBudget),
          foreground: THEME.text,
          bold: active || undefined,
        },
        ...(width >= 14 ? [{ text: countLabel, foreground: statusColor }] : []),
      ],
      width,
    );
  });
}

function ensurePromptRows(count: number): void {
  if (promptRows.length === count) return;
  promptRows = Array.from({ length: count }, () =>
    Text({
      text: "",
      foreground: THEME.text,
      paddingX: 0,
    }),
  );
}

function ensureTranscriptRows(count: number): void {
  if (transcriptRows.length === count) return;
  transcriptRows = Array.from({ length: count }, () =>
    Text({
      text: "",
      foreground: THEME.text,
    }),
  );
}

function syncSidebarRows(): void {
  const rowCount = Math.max(1, Math.floor(sidebarListViewport.frameHeight()));
  ensurePromptRows(rowCount);
  sidebarListViewport.setChildren(promptRows);

  const thread = activeThread();
  const source =
    sidebarMode === "prompts"
      ? visiblePromptLabels(thread, rowCount)
      : visibleThreadLabels(rowCount);

  for (let i = 0; i < promptRows.length; i++) {
    const row = promptRows[i]!;
    const text = source[i];
    row.setText(text ?? "");
    row.setStyle({ background: undefined, foreground: THEME.text, paddingX: 0 });
  }
}

function syncTranscriptRows(): void {
  const rowCount = Math.max(1, Math.floor(transcriptViewport.frameHeight()));
  ensureTranscriptRows(rowCount);
  transcriptViewport.setChildren(transcriptRows);

  const width = Math.max(1, Math.floor(transcriptViewport.frameWidth()) - 1);
  const allLines = buildTranscriptLines(activeThread(), width);
  const visibleLines = allLines.slice(-rowCount);
  const topPad = Math.max(0, rowCount - visibleLines.length);

  for (let i = 0; i < transcriptRows.length; i++) {
    const line = transcriptRows[i]!;
    const visibleIndex = i - topPad;
    line.setText(visibleIndex >= 0 ? (visibleLines[visibleIndex] ?? "") : "");
  }
}

function metric(label: string, value: string, valueColor: number, bold = false): StyledSegment[] {
  return [
    { text: `${label} `, foreground: THEME.muted },
    { text: value, foreground: valueColor, bold: bold || undefined },
  ];
}

function syncHeader(): void {
  const thread = activeThread();
  const latency = thread.lastLatencyMs !== null ? `${thread.lastLatencyMs}ms` : "—";
  const outputTokens = thread.usage?.output_tokens ?? 0;

  const statusColor =
    thread.status === "streaming"
      ? THEME.lime
      : thread.status === "error"
        ? THEME.red
        : THEME.muted;

  const values: StyledSegment[][] = [
    metric("MODEL", MODEL, THEME.text, true),
    metric("STATUS", thread.status, statusColor, true),
    metric("TOKENS", `${outputTokens}`, THEME.text),
    metric("LAT", latency, THEME.amber),
  ];

  for (let i = 0; i < headerMetrics.length; i++) {
    headerMetrics[i]!.setText(styledLine(values[i]!));
  }
}

function refreshView(): void {
  syncResponsiveLayout();
  applyModeStyles();
  syncHeader();
  syncSidebarRows();
  syncTranscriptRows();
}

function syncResponsiveLayout(): void {
  const bodyWidth = Math.floor(body.frameWidth());
  const bodyHeight = Math.floor(body.frameHeight());
  const sidebarWidth = Math.floor(sidebar.frameWidth());
  const composerWidth = Math.floor(composerPanel.frameWidth());
  const sidebarTextWidth = Math.max(1, sidebarWidth - 2);
  const composerTextWidth = Math.max(1, composerWidth - 2);

  const stacked = bodyWidth > 0 && bodyWidth < STACKED_BREAKPOINT;
  const compact = bodyWidth > 0 && bodyWidth < COMPACT_BREAKPOINT;
  const tight = bodyWidth > 0 && bodyWidth < TIGHT_BREAKPOINT;
  const stackedSidebarHeight = stacked ? clamp(6, Math.floor(bodyHeight * 0.35), 10) : undefined;

  body.setStyle({ direction: stacked ? "column" : "row" });
  header.setStyle({ padding: compact ? "0 1" : "1 1" });

  sidebar.setStyle({
    flexGrow: stacked ? 0 : 1,
    flexBasis: stacked ? undefined : compact ? 24 : 30,
    minWidth: stacked ? undefined : tight ? 20 : compact ? 24 : 28,
    height: stacked ? stackedSidebarHeight : undefined,
    minHeight: stacked ? stackedSidebarHeight : undefined,
    maxHeight: stacked ? stackedSidebarHeight : undefined,
    gap: compact ? 0 : 1,
    padding: compact ? "0 1" : "1 1",
    borderRight: stacked ? undefined : { color: THEME.border },
    borderBottom: stacked ? { color: THEME.border } : undefined,
  });

  rightPane.setStyle({
    flexGrow: 1,
    flexBasis: stacked ? 0 : compact ? 40 : 56,
    minWidth: stacked ? 0 : tight ? 24 : 32,
  });

  transcriptPanel.setStyle({ padding: compact ? "0 1" : "1 1" });
  composerPanel.setStyle({
    padding: compact ? "0 1" : "1 1",
    gap: compact ? 0 : 1,
  });

  if (sidebarWidth > 0 && sidebarWidth < 16) {
    promptsTab.setText("P");
    threadsTab.setText("T");
  } else {
    promptsTab.setText("Prompts");
    threadsTab.setText("Threads");
  }

  sidebarHint.setText(
    sidebarWidth > 0 && sidebarWidth < 24
      ? clippedLine(
          [
            { text: "^N", foreground: THEME.lime, bold: true },
            { text: " new", foreground: THEME.muted },
          ],
          sidebarTextWidth,
        )
      : clippedLine(
          [
            { text: "Ctrl+N", foreground: THEME.lime, bold: true },
            { text: " new   ", foreground: THEME.muted },
            { text: "↑↓", foreground: THEME.blue, bold: true },
            { text: " switch", foreground: THEME.muted },
          ],
          sidebarTextWidth,
        ),
  );

  composerHint.setText(
    composerWidth > 0 && composerWidth < 30
      ? clippedLine(
          [
            { text: "⏎", foreground: THEME.accent, bold: true },
            { text: " send", foreground: THEME.muted },
          ],
          composerTextWidth,
        )
      : clippedLine(
          [
            { text: "Enter", foreground: THEME.accent, bold: true },
            { text: " send   ", foreground: THEME.muted },
            { text: "Tab", foreground: THEME.blue, bold: true },
            { text: " focus", foreground: THEME.muted },
          ],
          composerTextWidth,
        ),
  );
}

async function handleAgentStream(
  thread: AgentThreadState,
  assistantMessage: ChatMessage,
  prompt: string,
): Promise<void> {
  if (thread.status === "streaming") return;

  thread.status = "streaming";
  thread.lastLatencyMs = null;
  thread.usage = null;
  thread.prompts.unshift(prompt);
  if (thread.title === "New Thread") {
    thread.title = threadTitleFromPrompt(prompt);
  }
  thread.messages.push({ id: `msg-${nextMessageId++}`, role: "user", content: prompt });
  thread.messages.push(assistantMessage);
  refreshView();

  const startedAt = Date.now();

  try {
    const { events } = await thread.sdkThread.runStreamed(prompt);

    for await (const event of events) {
      handleThreadEvent(thread, assistantMessage, event);
      refreshView();
    }

    thread.status = "idle";
  } catch (error) {
    thread.status = "error";
    const message = error instanceof Error ? error.message : String(error);
    if (assistantMessage.content.trim().length === 0) {
      assistantMessage.role = "error";
      assistantMessage.content =
        message.includes("login") || message.includes("auth")
          ? `${message}\n\nRun \`codex login\` in this terminal, then submit again.`
          : message;
    } else {
      thread.messages.push({
        id: `msg-${nextMessageId++}`,
        role: "error",
        content: message,
      });
    }
  } finally {
    thread.lastLatencyMs = Date.now() - startedAt;
    refreshView();
  }
}

function handleThreadEvent(
  thread: AgentThreadState,
  assistantMessage: ChatMessage,
  event: ThreadEvent,
): void {
  if (
    (event.type === "item.started" ||
      event.type === "item.updated" ||
      event.type === "item.completed") &&
    event.item.type === "agent_message"
  ) {
    assistantMessage.content = event.item.text;
    return;
  }

  if (event.type === "turn.completed") {
    thread.usage = event.usage;
    return;
  }

  if (event.type === "turn.failed") {
    thread.status = "error";
    assistantMessage.role = "error";
    assistantMessage.content = event.error.message;
    return;
  }

  if (event.type === "error") {
    thread.status = "error";
    assistantMessage.role = "error";
    assistantMessage.content = event.message;
  }
}

function submitPrompt(rawPrompt: string): void {
  const prompt = rawPrompt.trim();
  if (prompt.length === 0) return;

  const thread = activeThread();
  if (thread.status === "streaming") return;

  composer.setText("");
  composer.focus();

  const assistantMessage: ChatMessage = {
    id: `msg-${nextMessageId++}`,
    role: "assistant",
    content: "",
  };

  void handleAgentStream(thread, assistantMessage, prompt);
}

function createNewThread(): void {
  threads.unshift(createThreadState());
  activeThreadIndex = 0;
  refreshView();
  composer.setText("");
  composer.focus();
}

function moveThreadSelection(delta: number): void {
  if (sidebarMode !== "threads" || threads.length === 0) return;
  activeThreadIndex = Math.max(0, Math.min(threads.length - 1, activeThreadIndex + delta));
  refreshView();
}

function cycleFocus(delta: number): void {
  const focusables = [promptsTab, threadsTab, composer] as const;
  const currentIndex = focusables.findIndex((node) => node.isFocused());
  const nextIndex =
    currentIndex === -1
      ? delta > 0
        ? 0
        : focusables.length - 1
      : (currentIndex + delta + focusables.length) % focusables.length;
  focusables[nextIndex]!.focus();
}

const headerMetrics = Array.from({ length: 4 }, () => Text({ text: "", foreground: THEME.text }));

const promptsTab = Button({
  text: "Prompts",
  foreground: THEME.muted,
  height: 1,
  onClick: () => setSidebarMode("prompts"),
  onFocus: () => applyModeStyles(),
  onBlur: () => applyModeStyles(),
});

const threadsTab = Button({
  text: "Threads",
  foreground: THEME.muted,
  height: 1,
  onClick: () => setSidebarMode("threads"),
  onFocus: () => applyModeStyles(),
  onBlur: () => applyModeStyles(),
});

const sidebarHint = Text({
  text: styledLine([
    { text: "Ctrl+N", foreground: THEME.lime, bold: true },
    { text: " new   ", foreground: THEME.muted },
    { text: "↑↓", foreground: THEME.blue, bold: true },
    { text: " switch", foreground: THEME.muted },
  ]),
});

const sidebarListViewport = Column(
  {
    gap: 0,
    flexGrow: 1,
  },
  [],
);

const sidebar = Column(
  {
    flexGrow: 1,
    flexBasis: 30,
    minWidth: 28,
    gap: 0,
    padding: "1 1",
    borderRight: { color: THEME.border },
  },
  [Row({ gap: 1, minHeight: 1 }, [promptsTab, threadsTab]), sidebarHint, sidebarListViewport],
);

const transcriptViewport = Column(
  {
    gap: 0,
    flexGrow: 1,
  },
  [],
);

const transcriptPanel = Column(
  {
    gap: 0,
    flexGrow: 1,
    padding: "1 1",
  },
  [transcriptViewport],
);

const composerHint = Text({
  text: styledLine([
    { text: "Enter", foreground: THEME.accent, bold: true },
    { text: " send   ", foreground: THEME.muted },
    { text: "Tab", foreground: THEME.blue, bold: true },
    { text: " focus", foreground: THEME.muted },
  ]),
});

const composer = Input({
  placeholder: "Type a prompt…",
  border: idleBorder,
  padding: "1 0",
  foreground: THEME.text,
  onSubmit: submitPrompt,
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

const composerRow = Row({ alignItems: "stretch" }, [composer]);

const composerPanel = Column(
  {
    gap: 0,
    padding: "1 1",
    flexShrink: 0,
  },
  [composerRow, composerHint],
);

const rightPane = Column(
  {
    flexGrow: 2,
    flexBasis: 56,
    minWidth: 40,
    gap: 0,
  },
  [transcriptPanel, composerPanel],
);

const body = Row(
  {
    flexGrow: 1,
    gap: 0,
    alignItems: "stretch",
  },
  [sidebar, rightPane],
);

const header = Row(
  {
    gap: 2,
    padding: "1 1",
    minHeight: 1,
    borderBottom: { color: THEME.border },
  },
  headerMetrics,
);

const root = Column(
  {
    flexGrow: 1,
    gap: 0,
    background: THEME.bg,
  },
  [header, body],
);

ff(() => {
  refreshView();
});

const app = run(root);

onKey("q", () => app.quit());
onKey("\x0e", () => createNewThread()); // Ctrl+N
onKey("\x1b[B", () => moveThreadSelection(1)); // Arrow Down
onKey("\x1b[A", () => moveThreadSelection(-1)); // Arrow Up
onKey("\t", () => cycleFocus(1));
onKey("\x1b[Z", () => cycleFocus(-1)); // Shift+Tab

applyModeStyles();
refreshView();
composer.focus();
