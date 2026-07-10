/** Unicode-aware terminal text wrapping from source text to styled display lines. */

import type { NormalizedTextSpan, TextOverflow, TextWrap } from "./types.ts";

export type WrappedLine = {
  text: string;
  spans: NormalizedTextSpan[];
};

export type WrappedText = {
  lines: WrappedLine[];
};

type TextSegment = {
  text: string;
  start: number;
  end: number;
  startByte: number;
  endByte: number;
  width: number;
};

type LineDraft = {
  text: string;
  sourceStartByte: number;
  sourceEndByte: number;
};

export function wrapText(
  text: string,
  spans: readonly NormalizedTextSpan[],
  maxWidth: number,
  maxHeight: number,
  wrap: TextWrap,
  overflow: TextOverflow,
): WrappedText {
  maxWidth = normalizeLimit(maxWidth);
  maxHeight = normalizeLimit(maxHeight);
  if (maxWidth === 0 || maxHeight === 0) return { lines: [] };

  const drafts: LineDraft[] = [];
  let byteOffset = 0;
  const hardLines = text.split("\n");

  for (const hardLine of hardLines) {
    const lines = wrapSingleLine(hardLine, byteOffset, maxWidth, wrap, overflow);
    drafts.push(...lines);
    byteOffset += byteLength(hardLine) + 1;
  }

  if (drafts.length > maxHeight) {
    drafts.length = maxHeight;
    if (overflow === "ellipsis") {
      applyEllipsis(drafts[drafts.length - 1]!, maxWidth);
    }
  }

  return { lines: finalizeLines(drafts, spans) };
}

export function textWidth(text: string): number {
  return Bun.stringWidth(text);
}

function wrapSingleLine(
  text: string,
  lineStartByte: number,
  maxWidth: number,
  wrap: TextWrap,
  overflow: TextOverflow,
): LineDraft[] {
  if (wrap === "none") return clipSingleLine(text, lineStartByte, maxWidth, overflow);
  if (wrap === "char") {
    return wrapBySegments(text, lineStartByte, collectSegments(text, graphemeSegmenter), maxWidth);
  }
  return wrapByWords(text, lineStartByte, maxWidth);
}

function clipSingleLine(
  text: string,
  lineStartByte: number,
  maxWidth: number,
  overflow: TextOverflow,
): LineDraft[] {
  const graphemes = collectSegments(text, graphemeSegmenter);
  let visibleEnd = 0;
  let visibleEndByte = 0;
  let visibleWidth = 0;

  for (const grapheme of graphemes) {
    if (visibleWidth + grapheme.width > maxWidth) break;
    visibleWidth += grapheme.width;
    visibleEnd = grapheme.end;
    visibleEndByte = grapheme.endByte;
  }

  const line: LineDraft = {
    text: text.slice(0, visibleEnd),
    sourceStartByte: lineStartByte,
    sourceEndByte: lineStartByte + visibleEndByte,
  };
  if (visibleEnd < text.length && overflow === "ellipsis") applyEllipsis(line, maxWidth);
  return [line];
}

function wrapByWords(text: string, lineStartByte: number, maxWidth: number): LineDraft[] {
  const words = collectSegments(text, wordSegmenter);
  const lines: LineDraft[] = [];
  let lineStart = 0;
  let lineEnd = 0;
  let lineStartByteOffset = 0;
  let lineEndByteOffset = 0;
  let lineWidth = 0;

  for (const word of words) {
    if (word.width > maxWidth) {
      if (lineStart < lineEnd) {
        pushLine(
          lines,
          text,
          lineStartByte,
          lineStart,
          lineEnd,
          lineStartByteOffset,
          lineEndByteOffset,
        );
        lineWidth = 0;
      }
      lines.push(
        ...wrapBySegments(
          word.text,
          lineStartByte + word.startByte,
          collectSegments(word.text, graphemeSegmenter),
          maxWidth,
        ),
      );
      lineStart = word.end;
      lineEnd = word.end;
      lineStartByteOffset = word.endByte;
      lineEndByteOffset = word.endByte;
      continue;
    }

    if (lineStart === lineEnd) {
      lineStart = word.start;
      lineEnd = word.end;
      lineStartByteOffset = word.startByte;
      lineEndByteOffset = word.endByte;
      lineWidth = word.width;
      continue;
    }

    if (lineWidth + word.width > maxWidth) {
      pushLine(
        lines,
        text,
        lineStartByte,
        lineStart,
        lineEnd,
        lineStartByteOffset,
        lineEndByteOffset,
      );
      lineStart = word.start;
      lineEnd = word.end;
      lineStartByteOffset = word.startByte;
      lineEndByteOffset = word.endByte;
      lineWidth = word.width;
      continue;
    }

    lineEnd = word.end;
    lineEndByteOffset = word.endByte;
    lineWidth += word.width;
  }

  if (lineStart < text.length) {
    pushLine(
      lines,
      text,
      lineStartByte,
      lineStart,
      text.length,
      lineStartByteOffset,
      byteLength(text),
    );
  }
  if (lines.length === 0) lines.push(emptyLine(lineStartByte));
  return lines;
}

function wrapBySegments(
  text: string,
  lineStartByte: number,
  segments: readonly TextSegment[],
  maxWidth: number,
): LineDraft[] {
  const lines: LineDraft[] = [];
  let lineStart = 0;
  let lineStartByteOffset = 0;
  let lineWidth = 0;

  for (const segment of segments) {
    if (segment.width > maxWidth) {
      if (lineStart < segment.start) {
        pushLine(
          lines,
          text,
          lineStartByte,
          lineStart,
          segment.start,
          lineStartByteOffset,
          segment.startByte,
        );
      }
      pushLine(
        lines,
        text,
        lineStartByte,
        segment.start,
        segment.end,
        segment.startByte,
        segment.endByte,
      );
      lineStart = segment.end;
      lineStartByteOffset = segment.endByte;
      lineWidth = 0;
      continue;
    }

    if (lineWidth + segment.width > maxWidth && lineStart < segment.start) {
      pushLine(
        lines,
        text,
        lineStartByte,
        lineStart,
        segment.start,
        lineStartByteOffset,
        segment.startByte,
      );
      lineStart = segment.start;
      lineStartByteOffset = segment.startByte;
      lineWidth = 0;
    }
    lineWidth += segment.width;
  }

  if (lineStart < text.length) {
    pushLine(
      lines,
      text,
      lineStartByte,
      lineStart,
      text.length,
      lineStartByteOffset,
      byteLength(text),
    );
  }
  if (lines.length === 0) lines.push(emptyLine(lineStartByte));
  return lines;
}

function pushLine(
  lines: LineDraft[],
  text: string,
  baseByte: number,
  start: number,
  end: number,
  startByte: number,
  endByte: number,
): void {
  lines.push({
    text: text.slice(start, end),
    sourceStartByte: baseByte + startByte,
    sourceEndByte: baseByte + endByte,
  });
}

function applyEllipsis(line: LineDraft, maxWidth: number): void {
  if (maxWidth === 0) {
    line.text = "";
    line.sourceEndByte = line.sourceStartByte;
    return;
  }

  const ellipsisWidth = textWidth("…");
  while (line.text && textWidth(line.text) + ellipsisWidth > maxWidth) {
    const segments = collectSegments(line.text, graphemeSegmenter);
    const last = segments[segments.length - 1];
    if (!last) break;
    line.text = line.text.slice(0, last.start);
    line.sourceEndByte = line.sourceStartByte + last.startByte;
  }
  if (ellipsisWidth <= maxWidth) line.text += "…";
}

function finalizeLines(
  lines: readonly LineDraft[],
  spans: readonly NormalizedTextSpan[],
): WrappedLine[] {
  return lines.map((line) => ({
    text: line.text,
    spans: spans.flatMap((span) => {
      const startByte = Math.max(span.startByte, line.sourceStartByte);
      const endByte = Math.min(span.endByte, line.sourceEndByte);
      return startByte < endByte
        ? [
            {
              ...span,
              startByte: startByte - line.sourceStartByte,
              endByte: endByte - line.sourceStartByte,
            },
          ]
        : [];
    }),
  }));
}

function collectSegments(text: string, segmenter: Intl.Segmenter): TextSegment[] {
  const segments: TextSegment[] = [];
  let byteOffset = 0;
  for (const item of segmenter.segment(text)) {
    const end = item.index + item.segment.length;
    const endByte = byteOffset + byteLength(item.segment);
    segments.push({
      text: item.segment,
      start: item.index,
      end,
      startByte: byteOffset,
      endByte,
      width: textWidth(item.segment),
    });
    byteOffset = endByte;
  }
  return segments;
}

function emptyLine(sourceStartByte: number): LineDraft {
  return { text: "", sourceStartByte, sourceEndByte: sourceStartByte };
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(value));
}

function byteLength(text: string): number {
  return Buffer.byteLength(text);
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
