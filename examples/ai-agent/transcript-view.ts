/**
 * Transcript entry presentation with cached styled projections.
 * Domain entry -> summary/detail cache -> stable transcript row
 */

import { Column, Text } from "@";
import type { StyledText } from "@";
import { styled, type StyledSegment } from "../helpers.ts";
import { SPINNER, THEME } from "./theme.ts";

export type TranscriptKind =
  | "user"
  | "assistant"
  | "reasoning"
  | "plan"
  | "command"
  | "file"
  | "search"
  | "tool"
  | "subagent"
  | "status"
  | "error";

export type TranscriptEntry = {
  id: string;
  itemId: string;
  turnId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  kind: TranscriptKind;
  text: string;
  detail: string;
  status: "running" | "completed" | "failed" | "queued" | "interrupted";
  createdAt?: number;
};

export type TranscriptEntryView = {
  container: ReturnType<typeof Column>;
  summary: ReturnType<typeof Text>;
  detail: ReturnType<typeof Text>;
  renderedKind: TranscriptKind | null;
  renderedStatus: TranscriptEntry["status"] | null;
  renderedText: string | null;
  renderedHasDetail: boolean;
  renderedFrame: number;
  renderedWidth: number;
  renderedColor: number | null;
  renderedDetail: string | null;
  detailVisible: boolean;
};

export function createTranscriptEntryView(): TranscriptEntryView {
  const summary = Text({
    text: "",
    foreground: THEME.prose,
    background: THEME.shell,
    paddingX: 1,
    wrap: "word",
  });
  const detail = Text({ text: "", foreground: THEME.dim, wrap: "char", paddingX: 2 });
  return {
    container: Column({ gap: 0 }, [summary]),
    summary,
    detail,
    renderedKind: null,
    renderedStatus: null,
    renderedText: null,
    renderedHasDetail: false,
    renderedFrame: -1,
    renderedWidth: -1,
    renderedColor: null,
    renderedDetail: null,
    detailVisible: false,
  };
}

export function renderTranscriptEntry(
  entry: TranscriptEntry,
  entryView: TranscriptEntryView,
  expanded: boolean,
  frame: number,
  transcriptWidth: number,
): void {
  const hasDetail = entry.detail.length > 0;
  const renderedFrame = animatedEntryFrame(entry, frame);
  const renderedWidth = entry.kind === "user" ? Math.floor(transcriptWidth) : 0;
  if (
    entryView.renderedKind !== entry.kind ||
    entryView.renderedStatus !== entry.status ||
    entryView.renderedText !== entry.text ||
    entryView.renderedHasDetail !== hasDetail ||
    entryView.renderedFrame !== renderedFrame ||
    entryView.renderedWidth !== renderedWidth
  ) {
    entryView.renderedKind = entry.kind;
    entryView.renderedStatus = entry.status;
    entryView.renderedText = entry.text;
    entryView.renderedHasDetail = hasDetail;
    entryView.renderedFrame = renderedFrame;
    entryView.renderedWidth = renderedWidth;
    entryView.summary.setText(entrySummary(entry, renderedFrame, transcriptWidth));
  }

  const color = entryColor(entry);
  if (entryView.renderedColor !== color) {
    entryView.renderedColor = color;
    entryView.summary.setStyle({ foreground: color });
  }

  const showDetail = expanded && /\S/.test(entry.detail);
  if (showDetail && entryView.renderedDetail !== entry.detail) {
    entryView.renderedDetail = entry.detail;
    entryView.detail.setText(detailText(entry.detail));
  } else if (!showDetail && entryView.renderedDetail !== null) {
    entryView.renderedDetail = null;
    entryView.detail.setText("");
  }
  if (entryView.detailVisible !== showDetail) {
    entryView.detailVisible = showDetail;
    entryView.container.setChildren(
      showDetail ? [entryView.summary, entryView.detail] : [entryView.summary],
    );
  }
}

function animatedEntryFrame(entry: TranscriptEntry, frame: number): number {
  if (entry.status !== "running") return 0;
  if (entry.kind === "assistant" && entry.text) return 0;
  if (
    entry.kind === "user" ||
    entry.kind === "error" ||
    entry.kind === "status" ||
    entry.kind === "plan"
  ) {
    return 0;
  }
  return frame % SPINNER.length;
}

function entrySummary(
  entry: TranscriptEntry,
  frame: number,
  transcriptWidth: number,
): StyledText | string {
  const spinner = SPINNER[frame % SPINNER.length]!;
  const running = entry.status === "running";
  const failed = entry.status === "failed";
  const queued = entry.status === "queued";
  const disclosure = entry.detail ? " ▸" : "";

  switch (entry.kind) {
    case "user":
      return userPromptText(entry.text, queued, transcriptWidth);
    case "assistant":
      return running && !entry.text
        ? styled([
            { text: `${spinner} `, foreground: THEME.purple },
            { text: "Working", foreground: THEME.muted },
          ])
        : markdownText(entry.text);
    case "reasoning":
      return styled([
        { text: running ? `${spinner} ` : "◉ ", foreground: THEME.violet },
        { text: entry.text || "Thinking", foreground: THEME.muted, italic: true },
        { text: disclosure, foreground: THEME.dim },
      ]);
    case "command": {
      const classified = classifiedCommandSummary(entry);
      if (classified) return classified;
      const command = displayCommand(entry.text);
      return styled([
        {
          text: running ? `${spinner} ` : "$ ",
          foreground: running ? THEME.blue : THEME.userPrompt,
        },
        { text: command, foreground: THEME.prose },
        {
          text: failed ? " (failed)" : "",
          foreground: failed ? THEME.red : THEME.blue,
        },
        { text: running ? "" : disclosure, foreground: THEME.dim },
      ]);
    }
    case "file":
      return toolSummary(entry, running ? spinner : failed ? "✗" : "✓", THEME.purple, disclosure);
    case "search":
      return toolSummary(entry, running ? spinner : failed ? "✗" : "✓", THEME.cyan, disclosure);
    case "subagent":
      return toolSummary(entry, running ? spinner : failed ? "✗" : "✓", THEME.violet, disclosure);
    case "error":
      return styled([
        { text: "✗ ", foreground: THEME.red, bold: true },
        { text: entry.text, foreground: THEME.red },
      ]);
    case "status":
      return styled([
        { text: "◇ ", foreground: THEME.dim },
        { text: entry.text, foreground: THEME.muted },
      ]);
    case "plan":
      return styled([
        { text: "Plan\n", foreground: THEME.purple, bold: true },
        { text: entry.text, foreground: THEME.prose },
      ]);
    default:
      return toolSummary(entry, running ? spinner : failed ? "✗" : "✓", THEME.blue, disclosure);
  }
}

function toolSummary(
  entry: TranscriptEntry,
  icon: string,
  color: number,
  disclosure: string,
): StyledText {
  return styled([
    {
      text: `${icon} `,
      foreground:
        entry.status === "completed"
          ? THEME.userPrompt
          : entry.status === "failed"
            ? THEME.red
            : color,
      bold: true,
    },
    { text: entry.text, foreground: THEME.prose },
    { text: disclosure, foreground: THEME.dim },
  ]);
}

function userPromptText(value: string, queued: boolean, transcriptWidth: number): StyledText {
  const lineWidth = Math.max(12, Math.floor(transcriptWidth || 74) - 5);
  const lines = wrapWords(value, lineWidth);
  return styled(
    lines.flatMap((line, index) => [
      {
        text: queued ? "┊ " : "┃ ",
        foreground: queued ? THEME.amber : THEME.userPrompt,
        bold: true,
      },
      {
        text: `${line}${index < lines.length - 1 ? "\n" : ""}`,
        foreground: queued ? THEME.muted : THEME.userPrompt,
        italic: true,
      },
    ]),
  );
}

function markdownText(value: string): StyledText {
  const lines: StyledSegment[][] = [];
  let codeLanguage: string | null = null;

  for (const line of value.replaceAll("\r\n", "\n").split("\n")) {
    const fence = line.match(/^\s*```([\w+-]*)\s*$/);
    if (fence) {
      codeLanguage = codeLanguage === null ? fence[1] || "text" : null;
      continue;
    }

    if (codeLanguage !== null) {
      lines.push(codeLineSegments(line, codeLanguage));
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading) {
      lines.push(
        inlineMarkdownSegments(heading[1]!).map((segment) => ({
          ...segment,
          foreground: THEME.shortcut,
          bold: true,
        })),
      );
      continue;
    }

    const bullet = line.match(/^(\s*[-+*]\s+)(.*)$/);
    if (bullet) {
      lines.push([
        { text: bullet[1]!, foreground: THEME.prose },
        ...inlineMarkdownSegments(bullet[2]!),
      ]);
      continue;
    }

    const ordered = line.match(/^(\s*\d+[.)]\s+)(.*)$/);
    if (ordered) {
      lines.push([
        { text: ordered[1]!, foreground: THEME.prose },
        ...inlineMarkdownSegments(ordered[2]!),
      ]);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      lines.push([
        { text: "│ ", foreground: THEME.dim },
        ...inlineMarkdownSegments(quote[1]!).map((segment) => ({
          ...segment,
          foreground: segment.foreground ?? THEME.muted,
          italic: true,
        })),
      ]);
      continue;
    }

    lines.push(inlineMarkdownSegments(line));
  }

  return styled(
    lines.flatMap((line, index) => [
      ...line,
      ...(index < lines.length - 1 ? [{ text: "\n" }] : []),
    ]),
  );
}

function inlineMarkdownSegments(value: string): StyledSegment[] {
  const segments: StyledSegment[] = [];
  const tokens = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;

  for (const match of value.matchAll(tokens)) {
    const start = match.index;
    if (start > cursor)
      segments.push({ text: value.slice(cursor, start), foreground: THEME.prose });
    const token = match[0];

    if (token.startsWith("`")) {
      segments.push({
        text: token.slice(1, -1),
        foreground: THEME.markdownCode,
        bold: true,
      });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      segments.push({ text: token.slice(2, -2), foreground: THEME.prose, bold: true });
    } else if (token.startsWith("*")) {
      segments.push({ text: token.slice(1, -1), foreground: THEME.prose, italic: true });
    } else {
      const link = token.match(/^\[([^\]]+)\]\([^)]+\)$/);
      segments.push({
        text: link?.[1] ?? token,
        foreground: THEME.syntaxBlue,
        underline: true,
      });
    }
    cursor = start + token.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor), foreground: THEME.prose });
  return segments.length > 0 ? segments : [{ text: "", foreground: THEME.prose }];
}

function codeLineSegments(value: string, language: string): StyledSegment[] {
  const segments: StyledSegment[] = [{ text: "    ", foreground: THEME.prose }];
  if (!/^(?:js|jsx|ts|tsx|javascript|typescript)$/i.test(language)) {
    segments.push({ text: value, foreground: THEME.prose });
    return segments;
  }

  const tokens =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b(?:async|await|class|const|else|export|extends|false|for|from|function|if|import|interface|let|new|null|return|true|type|undefined|var|while)\b|\b\d+(?:\.\d+)?\b)/g;
  let cursor = 0;
  for (const match of value.matchAll(tokens)) {
    const start = match.index;
    if (start > cursor)
      segments.push({ text: value.slice(cursor, start), foreground: THEME.prose });
    const token = match[0];
    segments.push({
      text: token,
      foreground: token.startsWith("//")
        ? THEME.muted
        : /^['"`]/.test(token)
          ? THEME.userPrompt
          : /^\d/.test(token)
            ? THEME.markdownCode
            : THEME.syntaxBlue,
      italic: token.startsWith("//"),
    });
    cursor = start + token.length;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), foreground: THEME.prose });
  return segments;
}

function classifiedCommandSummary(entry: TranscriptEntry): StyledText | null {
  if (entry.status !== "completed") return null;
  const command = entry.text.toLowerCase();
  const isSearch = /(^|[\s"'])rg([\s"']|$)|\b(?:grep|find|fd)\b/.test(command);
  const isRead = /\b(?:cat|sed|head|tail|wc)\b/.test(command);
  if (!isSearch && !isRead) return null;
  return styled([
    { text: "✓ ", foreground: THEME.userPrompt, bold: true },
    { text: "Explored ", foreground: THEME.prose },
    { text: `1 ${isSearch ? "search" : "file"}`, foreground: THEME.muted },
    { text: entry.detail ? " ▸" : "", foreground: THEME.text },
  ]);
}

function displayCommand(value: string): string {
  const shellWrapper = value.match(/^\/bin\/(?:zsh|bash|sh) -lc (['"])([\s\S]*)\1$/);
  const command = shellWrapper ? shellWrapper[2]!.replaceAll(`'"'"'`, `'`) : value;
  return command.replaceAll("; ", "; \\\n    ").replaceAll(" && ", " && \\\n    ");
}

export function shortcutRow(
  leftKey: string,
  leftDescription: string,
  rightKey = "",
  rightDescription = "",
): ReturnType<typeof Text> {
  const leftLength = leftKey.length + leftDescription.length + 1;
  return Text({
    text: styled([
      { text: leftKey, foreground: THEME.shortcut },
      { text: ` ${leftDescription}`, foreground: THEME.muted },
      { text: " ".repeat(Math.max(1, 32 - leftLength)), foreground: THEME.muted },
      { text: rightKey, foreground: THEME.shortcut },
      { text: rightKey ? ` ${rightDescription}` : "", foreground: THEME.muted },
    ]),
    height: 1,
    paddingX: 1,
    wrap: "none",
  });
}

function wrapWords(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const sourceLine of value.split("\n")) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
      } else if (line.length + word.length + 1 <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function entryColor(entry: TranscriptEntry): number {
  if (entry.kind === "error") return THEME.red;
  if (entry.kind === "reasoning" || entry.kind === "status") return THEME.muted;
  if (entry.status === "failed") return THEME.red;
  return THEME.text;
}

function detailText(value: string): string {
  const lines = value.trimEnd().split("\n");
  const visible = lines.length > 80 ? [...lines.slice(0, 40), "…", ...lines.slice(-40)] : lines;
  return visible.map((line) => `  ${line}`).join("\n");
}
