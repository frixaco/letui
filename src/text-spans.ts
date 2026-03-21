import type {
  NormalizedStyledText,
  NormalizedTextSpan,
  StyledText,
  TextSpan,
} from "./types";

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

function toIndexedSpan(
  span: unknown,
  sourceIndex: number,
  _textLength: number,
): IndexedTextSpan | null {
  const candidate = span as TextSpan;

  if (candidate.start === candidate.end) {
    return null;
  }

  return {
    start: candidate.start,
    end: candidate.end,
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
  textLength: number,
  byteOffsets: number[],
): PreparedTextSpan[] {
  const spans = spansInput
    .map((span, sourceIndex) => toIndexedSpan(span, sourceIndex, textLength))
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

  const { length, byteLength, byteOffsets } = getCodePointMetadata(input.text);
  const spans = prepareSpans(input.spans, length, byteOffsets).map(
    ({ sourceIndex: _sourceIndex, ...span }) => span,
  );

  return {
    text: input.text,
    spans,
    length,
    byteLength,
  };
}
