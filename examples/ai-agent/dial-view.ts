/** Dial presentation: app render state -> responsive dial composition and styled geometry. */

import { Column, Text } from "@";
import type { StyledText } from "@";
import { styled, type StyledSegment } from "../helpers.ts";
import { THEME } from "./theme.ts";

export class DialView {
  readonly node: ReturnType<typeof Column>;

  constructor() {
    this.node = Column(
      {
        position: "absolute",
        right: 0,
        bottom: 0,
        height: 9,
        minHeight: 9,
        maxHeight: 9,
        background: THEME.shell,
      },
      this.rows,
    );
  }

  render(state: DialRenderState): void {
    const boxWidth = Math.min(58, Math.max(38, state.width));
    this.node.setStyle({ width: boxWidth });
    if (state.efforts.length === 0) return;
    const selectedIndex = Math.max(
      0,
      state.efforts.findIndex((effort) => effort.reasoningEffort === state.selectedEffort),
    );
    const selected = state.efforts[selectedIndex]!;
    const innerWidth = boxWidth - 2;
    const barWidth = boxWidth - 4;
    const fillWidth = Math.max(1, Math.round(barWidth * state.animatedPosition));
    const hint = "←→ turn · esc";
    const boxLine = (value = ""): string =>
      `│${value.slice(0, innerWidth).padEnd(innerWidth, " ")}│`;
    const infoLine = (label: string, value: string): StyledText => {
      const prefix = ` ${label}:  `;
      const visibleValue = value.slice(0, Math.max(0, innerWidth - prefix.length));
      return styled([
        { text: "│", foreground: THEME.line },
        { text: prefix, foreground: THEME.text },
        { text: visibleValue, foreground: THEME.muted },
        {
          text: " ".repeat(Math.max(0, innerWidth - prefix.length - visibleValue.length)),
          foreground: THEME.muted,
        },
        { text: "│", foreground: THEME.line },
      ]);
    };
    this.rows[0]!.setText(
      styled([{ text: `╭${"─".repeat(innerWidth)}╮`, foreground: THEME.line }]),
    );
    this.rows[1]!.setText(
      styled([
        { text: "│ ", foreground: THEME.line },
        { text: "•".repeat(fillWidth), foreground: dialColor(selected.reasoningEffort) },
        { text: "·".repeat(Math.max(0, barWidth - fillWidth)), foreground: THEME.muted },
        { text: " │", foreground: THEME.line },
      ]),
    );
    this.rows[2]!.setText(
      styled([
        { text: "│ ", foreground: THEME.line },
        ...dialLabelSegments(state.efforts, selectedIndex, barWidth),
        { text: " │", foreground: THEME.line },
      ]),
    );
    this.rows[3]!.setText(boxLine());
    this.rows[4]!.setText(infoLine("Agent", `${state.model} ${selected.reasoningEffort}`));
    this.rows[5]!.setText(infoLine("Limit", state.rateLimit));
    this.rows[6]!.setText(boxLine());
    const description = ` ${selected.description}`.slice(0, innerWidth).padEnd(innerWidth, " ");
    this.rows[7]!.setText(
      styled([
        { text: "│", foreground: THEME.line },
        { text: description, foreground: THEME.muted },
        { text: "│", foreground: THEME.line },
      ]),
    );
    const bottomDashes = "─".repeat(Math.max(0, boxWidth - hint.length - 4));
    this.rows[8]!.setText(
      styled([
        { text: `╰${bottomDashes} `, foreground: THEME.line },
        { text: "←→", foreground: THEME.shortcut },
        { text: " turn · ", foreground: THEME.muted },
        { text: "esc", foreground: THEME.shortcut },
        { text: "─╯", foreground: THEME.line },
      ]),
    );
  }

  private readonly rows = Array.from({ length: 9 }, () =>
    Text({ text: "", height: 1, wrap: "none" }),
  );
}

export type DialRenderState = {
  width: number;
  selectedEffort: string;
  efforts: { reasoningEffort: string; description: string }[];
  animatedPosition: number;
  model: string;
  rateLimit: string;
};

export function dialEffortLabel(effort: string): string {
  return effort === "xhigh" ? "ultra" : effort;
}
export function dialColor(effort: string): number {
  if (effort === "low") return THEME.dialLow;
  if (effort === "medium") return THEME.dialMedium;
  if (effort === "high") return THEME.dialHigh;
  return THEME.dialUltra;
}
function dialLabelSegments(
  efforts: DialRenderState["efforts"],
  selectedIndex: number,
  width: number,
): StyledSegment[] {
  const segments: StyledSegment[] = [];
  let cursor = 0;
  for (const [index, effort] of efforts.entries()) {
    const label = dialEffortLabel(effort.reasoningEffort);
    const position =
      efforts.length === 1
        ? 0
        : Math.round((index / (efforts.length - 1)) * (width - label.length));
    if (position > cursor)
      segments.push({ text: " ".repeat(position - cursor), foreground: THEME.muted });
    segments.push({
      text: label,
      foreground: index === selectedIndex ? dialColor(effort.reasoningEffort) : THEME.muted,
      bold: index === selectedIndex,
    });
    cursor = position + label.length;
  }
  if (cursor < width) segments.push({ text: " ".repeat(width - cursor), foreground: THEME.muted });
  return segments;
}
