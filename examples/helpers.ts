/** Shared helpers for example demos. */

import type { StyledText, TextSpan } from "@";

export type StyledSegment = Omit<TextSpan, "start" | "end"> & { text: string };

/** Build a StyledText from inline segments (no manual start/end bookkeeping). */
export function styled(segments: readonly StyledSegment[]): StyledText {
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

/** Common keyboard navigation key sets for j/k + arrow demos. */
export const NAV_NEXT_KEYS = new Set(["j", "\x1b[B", "\x1bOB"]);
export const NAV_PREV_KEYS = new Set(["k", "\x1b[A", "\x1bOA"]);
export const NAV_TOGGLE_KEYS = new Set(["\t", "\x1b[Z"]);
