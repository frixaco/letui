/** Text normalization and span preparation shared by text components and ops. */

import type {
  NormalizedStyledText,
  NormalizedTextSpan,
  StyledText,
  TextSpan,
} from "./types";

// --- Supporting types ---
const textEncoder = new TextEncoder();
const BOOLEAN_STYLE_KEYS = ["bold", "italic", "underline"] as const;

type BooleanStyleKey = (typeof BOOLEAN_STYLE_KEYS)[number];
type TextSpanStyle = Pick<
  TextSpan,
  "foreground" | "background" | BooleanStyleKey
>;
type IndexedTextSpan = TextSpan & {
  sourceIndex: number;
};
type PreparedTextSpan = NormalizedTextSpan & {
  sourceIndex: number;
};
type PreparedTextInput = {
  text: string;
  boundaryMap: (number | null)[];
};

// --- Public API ---
export function prepareTextInput(text: string): PreparedTextInput {
  const chars = Array.from(text);
  const normalizedChars: string[] = [];
  const boundaryMap = new Array<number | null>(chars.length + 1).fill(null);

  let oldIndex = 0;
  let newIndex = 0;
  boundaryMap[0] = 0;

  while (oldIndex < chars.length) {
    const ch = chars[oldIndex]!;

    if (ch === "\r" && chars[oldIndex + 1] === "\n") {
      normalizedChars.push("\n");
      newIndex += 1;
      boundaryMap[oldIndex + 1] = null;
      oldIndex += 2;
      boundaryMap[oldIndex] = newIndex;
      continue;
    }

    normalizedChars.push(ch === "\r" ? "\n" : ch === "\t" ? " " : ch);
    newIndex += 1;
    oldIndex += 1;
    boundaryMap[oldIndex] = newIndex;
  }

  return {
    text: normalizedChars.join(""),
    boundaryMap,
  };
}

// --- Internal algorithm ---
function compareSpans(a: IndexedTextSpan, b: IndexedTextSpan): number {
  if (a.start !== b.start) {
    return a.start - b.start;
  }

  if (a.end !== b.end) {
    return a.end - b.end;
  }

  return a.sourceIndex - b.sourceIndex;
}

function hasSameStyle(left: TextSpanStyle, right: TextSpanStyle): boolean {
  return (
    Object.is(left.foreground, right.foreground) &&
    Object.is(left.background, right.background) &&
    Object.is(left.bold, right.bold) &&
    Object.is(left.italic, right.italic) &&
    Object.is(left.underline, right.underline)
  );
}

function getCodePointMetadata(text: string): {
  length: number;
  byteLength: number;
  byteOffsets: number[];
} {
  const chars = Array.from(text);
  const byteOffsets = new Array<number>(chars.length + 1);
  byteOffsets[0] = 0;

  let byteLength = 0;
  for (let i = 0; i < chars.length; i++) {
    byteLength += textEncoder.encode(chars[i]!).length;
    byteOffsets[i + 1] = byteLength;
  }

  return {
    length: chars.length,
    byteLength,
    byteOffsets,
  };
}

function mapSourceBoundary(
  boundaryMap: readonly (number | null)[],
  index: number,
  sourceIndex: number,
  label: "start" | "end",
): number {
  if (!Number.isInteger(index) || index < 0 || index >= boundaryMap.length) {
    throw new Error(
      `Invalid TextSpan at index ${sourceIndex}: ${label} must be an integer between 0 and ${boundaryMap.length - 1}`,
    );
  }

  const mapped = boundaryMap[index];
  if (mapped === null || mapped === undefined) {
    throw new Error(
      `Invalid TextSpan at index ${sourceIndex}: ${label} splits a normalized CRLF sequence`,
    );
  }

  return mapped;
}

function toIndexedSpan(
  span: unknown,
  sourceIndex: number,
  boundaryMap: readonly (number | null)[],
): IndexedTextSpan | null {
  const candidate = span as TextSpan;
  const start = mapSourceBoundary(
    boundaryMap,
    candidate.start,
    sourceIndex,
    "start",
  );
  const end = mapSourceBoundary(
    boundaryMap,
    candidate.end,
    sourceIndex,
    "end",
  );

  if (start > end) {
    throw new Error(
      `Invalid TextSpan at index ${sourceIndex}: start must be <= end`,
    );
  }

  if (start === end) {
    return null;
  }

  return {
    start,
    end,
    foreground: candidate.foreground,
    background: candidate.background,
    bold: candidate.bold,
    italic: candidate.italic,
    underline: candidate.underline,
    sourceIndex,
  };
}

function prepareSpans(
  spansInput: readonly TextSpan[],
  byteOffsets: number[],
  boundaryMap: readonly (number | null)[],
): PreparedTextSpan[] {
  const spans = spansInput
    .map((span, sourceIndex) => toIndexedSpan(span, sourceIndex, boundaryMap))
    .filter((span): span is IndexedTextSpan => span !== null)
    .sort(compareSpans);

  const normalized: PreparedTextSpan[] = [];
  for (const span of spans) {
    const previous = normalized[normalized.length - 1];
    if (previous && span.start < previous.end) {
      throw new Error(
        `Invalid TextSpan at index ${span.sourceIndex}: overlaps span at index ${previous.sourceIndex}`,
      );
    }

    if (previous && previous.end === span.start && hasSameStyle(previous, span)) {
      previous.end = span.end;
      previous.endByte = byteOffsets[span.end]!;
      continue;
    }

    normalized.push({
      ...span,
      startByte: byteOffsets[span.start]!,
      endByte: byteOffsets[span.end]!,
    });
  }

  return normalized;
}

export function normalizeStyledText(input: StyledText): NormalizedStyledText {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid StyledText: expected an object");
  }

  if (typeof input.text !== "string") {
    throw new Error("Invalid StyledText: text must be a string");
  }

  if (!Array.isArray(input.spans)) {
    throw new Error("Invalid StyledText: spans must be an array");
  }

  const preparedText = prepareTextInput(input.text);
  const { length, byteLength, byteOffsets } = getCodePointMetadata(
    preparedText.text,
  );
  const spans = prepareSpans(
    input.spans,
    byteOffsets,
    preparedText.boundaryMap,
  ).map(({ sourceIndex: _sourceIndex, ...span }) => span);

  return {
    text: preparedText.text,
    spans,
    length,
    byteLength,
  };
}
