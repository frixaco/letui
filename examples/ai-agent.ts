import {
  Column,
  Input,
  NODE_TYPE,
  Row,
  Text,
  ff,
  onKey,
  run,
} from "../index.ts";
import type { StyledText, TextSpan } from "../index.ts";

type PromptThread = {
  title: string;
  userPrompt: string;
  sections: PromptSection[];
};

type PromptSectionTone = "accent" | "blue" | "lime" | "amber";
type InlineTone = PromptSectionTone | "text" | "muted";

type PromptParagraphSegment = {
  text: string;
  tone?: InlineTone;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type PromptParagraph = PromptParagraphSegment[];

type PromptSection = {
  heading: string;
  tone: PromptSectionTone;
  paragraphs: PromptParagraph[];
};

const THREADS: PromptThread[] = [
  {
    title: "Rollout Plan",
    userPrompt: "Design rollout for terminal autocomplete with strict latency guardrails.",
    sections: [
      {
        heading: "Goal",
        tone: "accent",
        paragraphs: [
          [
            { text: "Ship a ", tone: "text" },
            { text: "flagged", tone: "accent", bold: true },
            { text: " autocomplete path that feels ", tone: "text" },
            { text: "fast", tone: "lime", bold: true, underline: true },
            { text: " on every keystroke while the first cohort stays ", tone: "text" },
            { text: "small", tone: "amber", italic: true },
            { text: " enough to debug in real time.", tone: "text" },
          ],
        ],
      },
      {
        heading: "Ramp",
        tone: "blue",
        paragraphs: [
          [
            { text: "Start with ", tone: "text" },
            { text: "internal terminals", tone: "blue", bold: true, underline: true },
            { text: ", then widen only after one ", tone: "text" },
            { text: "stable day", tone: "lime", bold: true },
            { text: " so rollback remains ", tone: "text" },
            { text: "cheap", tone: "amber", italic: true },
            { text: " and obvious.", tone: "text" },
          ],
        ],
      },
      {
        heading: "Metrics",
        tone: "lime",
        paragraphs: [
          [
            { text: "Track ", tone: "text" },
            { text: "p50 / p95", tone: "lime", bold: true, underline: true },
            { text: " completion latency beside acceptance and ", tone: "text" },
            { text: "undo rate", tone: "blue", italic: true },
            { text: " so the rollout cannot look good on speed alone.", tone: "text" },
          ],
        ],
      },
      {
        heading: "Fallback",
        tone: "amber",
        paragraphs: [
          [
            { text: "When the model times out or sends malformed output, swap to a ", tone: "text" },
            { text: "deterministic suggestion shell", tone: "accent", bold: true },
            { text: " and ", tone: "text" },
            { text: "never", tone: "amber", bold: true, underline: true },
            { text: " blank the active row.", tone: "text" },
          ],
        ],
      },
    ],
  },
  {
    title: "Render Incident",
    userPrompt: "Frame time jumps every few seconds during idle view. Give a fast triage path.",
    sections: [
      {
        heading: "Breakdown",
        tone: "accent",
        paragraphs: [
          [
            { text: "Split the frame into ", tone: "text" },
            { text: "serialize", tone: "blue", bold: true },
            { text: ", ", tone: "text" },
            { text: "text sync", tone: "lime", bold: true },
            { text: ", rust paint, sync, and flush so the spike gets a ", tone: "text" },
            { text: "name", tone: "accent", underline: true },
            { text: ".", tone: "text" },
          ],
          [
            { text: "Capture one ", tone: "text" },
            { text: "baseline trace", tone: "amber", bold: true },
            { text: " before tuning; otherwise every later claim becomes ", tone: "text" },
            { text: "fiction", tone: "amber", italic: true },
            { text: ".", tone: "text" },
          ],
        ],
      },
      {
        heading: "Suspects",
        tone: "amber",
        paragraphs: [
          [
            { text: "Audit timer-driven ", tone: "text" },
            { text: "setText", tone: "accent", bold: true, underline: true },
            { text: " bursts and hidden nodes still receiving updates; idle views should stay ", tone: "text" },
            { text: "boringly quiet", tone: "muted", italic: true },
            { text: ".", tone: "text" },
          ],
        ],
      },
    ],
  },
  {
    title: "Prompt History UX",
    userPrompt: "Prompt history should stay dense and fully keyboard driven under long sessions.",
    sections: [
      {
        heading: "List Shape",
        tone: "blue",
        paragraphs: [
          [
            { text: "Show ", tone: "text" },
            { text: "intent-rich labels", tone: "blue", bold: true },
            { text: " instead of raw prompt blobs so scanning stays ", tone: "text" },
            { text: "dense", tone: "lime", underline: true },
            { text: " even in a narrow sidebar.", tone: "text" },
          ],
          [
            { text: "Make the active row ", tone: "text" },
            { text: "bold", tone: "accent", bold: true },
            { text: ", keep the motion keys ", tone: "text" },
            { text: "symmetrical", tone: "blue", italic: true },
            { text: ", and avoid any state that depends on the mouse.", tone: "text" },
          ],
        ],
      },
      {
        heading: "Retention",
        tone: "lime",
        paragraphs: [
          [
            { text: "Long sessions need a list that still tells the operator what changed ", tone: "text" },
            { text: "recently", tone: "lime", bold: true, underline: true },
            { text: " without forcing rereads of the entire prompt.", tone: "text" },
          ],
        ],
      },
    ],
  },
  {
    title: "Degradation Strategy",
    userPrompt: "Model endpoint throws intermittent 502 and timeout bursts. Define graceful degradation.",
    sections: [
      {
        heading: "Recovery",
        tone: "lime",
        paragraphs: [
          [
            { text: "Retry ", tone: "text" },
            { text: "once", tone: "lime", bold: true, underline: true },
            { text: " with bounded backoff, then hand off to a local fallback summarizer before the UI starts to ", tone: "text" },
            { text: "stutter", tone: "amber", italic: true },
            { text: ".", tone: "text" },
          ],
          [
            { text: "Expose the degraded path with a ", tone: "text" },
            { text: "clear badge", tone: "accent", bold: true },
            { text: " so confidence stays ", tone: "text" },
            { text: "legible", tone: "blue", underline: true },
            { text: ".", tone: "text" },
          ],
        ],
      },
      {
        heading: "Paging",
        tone: "amber",
        paragraphs: [
          [
            { text: "Page only on ", tone: "text" },
            { text: "sustained breaches", tone: "amber", bold: true },
            { text: "; isolated spikes should be recorded but kept out of the alert stream to avoid ", tone: "text" },
            { text: "operator fatigue", tone: "muted", italic: true },
            { text: ".", tone: "text" },
          ],
        ],
      },
    ],
  },
  {
    title: "Release Gate",
    userPrompt: "Provide final pre-merge checklist for this TUI demo before sharing it.",
    sections: [
      {
        heading: "Checks",
        tone: "blue",
        paragraphs: [
          [
            { text: "Run ", tone: "text" },
            { text: "typecheck", tone: "blue", bold: true, underline: true },
            { text: " and the smoke path in the same terminal reviewers will use, because environment drift hides the most embarrassing failures.", tone: "text" },
          ],
          [
            { text: "Walk every keyboard path, especially ", tone: "text" },
            { text: "quit", tone: "accent", bold: true },
            { text: ", composer focus, and sidebar navigation without leaning on the mouse.", tone: "text" },
          ],
          [
            { text: "Validate narrow and wide layouts so wrapping stays ", tone: "text" },
            { text: "intentional", tone: "lime", italic: true, underline: true },
            { text: " rather than accidental.", tone: "text" },
          ],
        ],
      },
    ],
  },
  {
    title: "Context Compression",
    userPrompt: "How should long chat context be compacted before the next model call?",
    sections: [
      {
        heading: "Retention",
        tone: "accent",
        paragraphs: [
          [
            { text: "Keep facts, decisions, constraints, and unresolved questions; drop duplicate phrasing and ", tone: "text" },
            { text: "stylistic filler", tone: "muted", italic: true },
            { text: " first.", tone: "text" },
          ],
          [
            { text: "Preserve exact ", tone: "text" },
            { text: "paths, ids, versions, and owners", tone: "accent", bold: true, underline: true },
            { text: " because literals with operational meaning should never be paraphrased.", tone: "text" },
          ],
          [
            { text: "Keep a short timeline ordered from ", tone: "text" },
            { text: "oldest to newest", tone: "blue", bold: true },
            { text: " so recency remains ", tone: "text" },
            { text: "unambiguous", tone: "lime", italic: true },
            { text: ".", tone: "text" },
          ],
        ],
      },
    ],
  },
];

const THEME = {
  border: 0x3a3a5c,
  text: 0xf0f0f0,
  muted: 0x6e6e8a,
  accent: 0xff5ef5,
  blue: 0x00d4ff,
  lime: 0x00ff9f,
  amber: 0xffab40,
  badgeFg: 0x050510,
} as const;

const idleBorder = { color: THEME.border, style: "rounded" as const };
const focusBorder = { color: THEME.accent, style: "rounded" as const };

type SpanStyle = Omit<TextSpan, "start" | "end">;
type StyledSegment = SpanStyle & { text: string };

function textLength(text: string): number {
  return Array.from(text).length;
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

function sectionToneColor(tone: PromptSectionTone): number {
  switch (tone) {
    case "accent":
      return THEME.accent;
    case "blue":
      return THEME.blue;
    case "lime":
      return THEME.lime;
    case "amber":
      return THEME.amber;
  }
}

function inlineToneColor(tone: InlineTone | undefined): number | undefined {
  switch (tone) {
    case "accent":
      return THEME.accent;
    case "blue":
      return THEME.blue;
    case "lime":
      return THEME.lime;
    case "amber":
      return THEME.amber;
    case "muted":
      return THEME.muted;
    case "text":
    case undefined:
      return THEME.text;
  }
}

const promptSlots = Array.from({ length: 7 }, () =>
  Text({
    text: "",
    foreground: THEME.text,
    paddingX: 1,
  }),
);

const transcriptLines = Array.from({ length: 15 }, () =>
  Text({
    text: "",
    foreground: THEME.text,
  }),
);

const headerTitle = Text({
  text: styledLine([
    { text: "AI AGENT", foreground: THEME.accent, bold: true },
    { text: " // ", foreground: THEME.muted },
    { text: "KEYBOARD-FIRST", foreground: THEME.blue, bold: true },
    { text: " CONTROL ROOM", foreground: THEME.text },
  ]),
});

const headerMeta = Text({
  text: "",
  foreground: THEME.muted,
});

const threadBadge = Text({
  text: "",
  foreground: THEME.badgeFg,
  background: THEME.accent,
  paddingX: 1,
});

const modeBadge = Text({
  text: " static payload ",
  foreground: THEME.badgeFg,
  background: THEME.lime,
  paddingX: 1,
});

const sidebarHint = Text({
  text: styledLine([
    { text: "j/k", foreground: THEME.lime, bold: true },
    { text: " or ", foreground: THEME.muted },
    { text: "arrows", foreground: THEME.blue, bold: true },
    { text: " navigate   ", foreground: THEME.muted },
    { text: "Tab", foreground: THEME.accent, bold: true },
    { text: " focuses composer", foreground: THEME.muted },
  ]),
});

const promptViewport = Column({ gap: 1, flexGrow: 1 }, promptSlots);

const sidebar = Column(
  {
    gap: 1,
    padding: "1 1",
    borderRight: { color: THEME.border },
    flexGrow: 1,
    flexBasis: 30,
    minWidth: 28,
  },
  [
    Text({ text: "PROMPT HISTORY", foreground: THEME.blue }),
    sidebarHint,
    promptViewport,
  ],
);

const transcriptHeader = Text({
  text: "",
  foreground: THEME.accent,
});

const transcriptSubhead = Text({
  text: "dense transcript view with stable node identity and wrapped panes",
  foreground: THEME.muted,
});

const transcriptViewport = Column({ gap: 0, flexGrow: 1 }, transcriptLines);

const transcriptPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    flexGrow: 1,
  },
  [transcriptHeader, transcriptSubhead, transcriptViewport],
);

const composerHint = Text({
  text: "Enter does nothing here; demo is about layout, focus, and dense context",
  foreground: THEME.muted,
});

const composer = Input({
  placeholder: "Type follow-up...",
  border: idleBorder,
  padding: "1 0",
  foreground: THEME.text,
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (composer.type === NODE_TYPE.Input) {
  composer.setText("Summarize rollout risk and rollback criteria.");
}

const composerRow = Row(
  {
    minHeight: 3,
    alignItems: "stretch",
  },
  [composer],
);

const composerPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    flexShrink: 0,
  },
  [Text({ text: "COMPOSER", foreground: THEME.blue }), composerRow, composerHint],
);

const rightPane = Column(
  {
    flexGrow: 2,
    flexBasis: 54,
    minWidth: 42,
    gap: 1,
    justifyContent: "spaceBetween",
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

const header = Column(
  {
    gap: 1,
    padding: "1 1",
    borderBottom: { color: THEME.border },
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
        Row({ gap: 1, flexWrap: "wrap" }, [threadBadge, modeBadge]),
      ],
    ),
  ],
);

const root = Column(
  {
    flexGrow: 1,
    gap: 0,
    padding: "1 1",
  },
  [header, body],
);

let selectedIndex = 0;
let promptWindowStart = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(next: number): number {
  if (THREADS.length === 0) return 0;
  if (next < 0) return THREADS.length - 1;
  if (next >= THREADS.length) return 0;
  return next;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

function sectionHeadingLine(section: PromptSection): StyledText {
  return styledLine([
    { text: section.heading.toUpperCase(), foreground: sectionToneColor(section.tone), bold: true },
  ]);
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

function paragraphTokens(paragraph: PromptParagraph): StyledSegment[] {
  const tokens: StyledSegment[] = [];

  for (const segment of paragraph) {
    const parts = segment.text.split(/(\s+)/).filter(Boolean);
    for (const part of parts) {
      tokens.push({
        text: part,
        foreground: inlineToneColor(segment.tone),
        bold: segment.bold,
        italic: segment.italic,
        underline: segment.underline,
      });
    }
  }

  return tokens;
}

function wrapParagraphLines(
  paragraph: PromptParagraph,
  width: number,
  firstPrefix: readonly StyledSegment[] = [],
  continuationPrefix: readonly StyledSegment[] = [],
): StyledText[] {
  const tokens = paragraphTokens(paragraph);
  const lines: StyledText[] = [];
  let current = cloneSegments(firstPrefix);
  let prefixWidth = segmentsWidth(current);
  let currentWidth = prefixWidth;

  const resetLine = (prefix: readonly StyledSegment[]) => {
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
      resetLine(continuationPrefix);
      continue;
    }

    if (currentWidth > prefixWidth) {
      lines.push(styledLine(trimTrailingWhitespace(current)));
      resetLine(continuationPrefix);
    }

    const available = Math.max(1, width - currentWidth);
    const tokenText = truncate(token.text, available);
    current.push({ ...token, text: tokenText });
    currentWidth += textLength(tokenText);
  }

  if (current.length > 0) {
    lines.push(styledLine(trimTrailingWhitespace(current)));
  }

  return lines;
}

function wrappedPromptLines(prompt: string, width: number): StyledText[] {
  const prefix = "USER> ";
  return wrapParagraphLines(
    [{ text: prompt, tone: "amber" }],
    width,
    [{ text: prefix, foreground: THEME.blue, bold: true }],
    [{ text: " ".repeat(textLength(prefix)), foreground: THEME.muted }],
  );
}

function promptTextWidth(): number {
  return Math.max(18, Math.floor(promptViewport.frameWidth()) - 4);
}

function transcriptTextWidth(): number {
  return Math.max(28, Math.floor(transcriptViewport.frameWidth()) - 2);
}

function syncPromptWindow(): void {
  const visibleCount = promptSlots.length;
  promptWindowStart = clamp(
    selectedIndex - Math.floor(visibleCount / 2),
    0,
    Math.max(0, THREADS.length - visibleCount),
  );
}

function renderPromptSlots(): void {
  syncPromptWindow();
  const width = promptTextWidth();

  for (let slotIndex = 0; slotIndex < promptSlots.length; slotIndex++) {
    const threadIndex = promptWindowStart + slotIndex;
    const thread = THREADS[threadIndex];
    const slot = promptSlots[slotIndex];
    if (!slot) continue;

    if (!thread) {
      slot.setText("");
      slot.setStyle({
        foreground: THEME.muted,
      });
      continue;
    }

    const active = threadIndex === selectedIndex;
    const marker = active ? "● " : "○ ";
    const title = truncate(thread.title, Math.max(1, width - textLength(marker)));

    if (active) {
      slot.setText(
        styledLine([
          {
            text: `${marker}${title}`,
            foreground: THEME.badgeFg,
            bold: true,
          },
        ]),
      );
    } else {
      slot.setText(
        styledLine([
          { text: marker, foreground: THEME.muted },
          { text: title, foreground: THEME.text },
        ]),
      );
    }

    slot.setStyle({
      foreground: THEME.text,
      background: active ? THEME.accent : undefined,
      paddingX: 1,
    });
  }
}

function buildTranscriptLines(thread: PromptThread): Array<string | StyledText> {
  const width = transcriptTextWidth();
  const lines: Array<string | StyledText> = [];

  lines.push(...wrappedPromptLines(thread.userPrompt, width));
  lines.push("");

  for (const section of thread.sections) {
    lines.push(sectionHeadingLine(section));

    for (const paragraph of section.paragraphs) {
      lines.push(
        ...wrapParagraphLines(
          paragraph,
          width,
          [{ text: "  ", foreground: THEME.muted }],
          [{ text: "  ", foreground: THEME.muted }],
        ),
      );
    }

    lines.push("");
  }

  lines.push(sectionHeadingLine({ heading: "Renderer Notes", tone: "blue", paragraphs: [] }));
  lines.push(
    ...wrapParagraphLines(
      [
        { text: "The demo still runs through ", tone: "text" },
        { text: "bun + rust ffi", tone: "blue", bold: true, underline: true },
        { text: " so text styling exercises the same render path as the rest of the library.", tone: "text" },
      ],
      width,
      [{ text: "  ", foreground: THEME.muted }],
      [{ text: "  ", foreground: THEME.muted }],
    ),
  );
  lines.push(
    ...wrapParagraphLines(
      [
        { text: "Layout stays ", tone: "text" },
        { text: "wrapped", tone: "lime", bold: true },
        { text: " and keyboard-first, while the composer can take focus without losing sidebar context.", tone: "text" },
      ],
      width,
      [{ text: "  ", foreground: THEME.muted }],
      [{ text: "  ", foreground: THEME.muted }],
    ),
  );
  return lines;
}

function renderTranscript(): void {
  const thread = THREADS[selectedIndex];
  if (!thread) return;

  transcriptHeader.setText(
    styledLine([
      { text: "THREAD // ", foreground: THEME.accent, bold: true },
      { text: thread.title, foreground: THEME.text },
    ]),
  );
  headerMeta.setText(
    styledLine([
      { text: "active thread ", foreground: THEME.muted },
      {
        text: `${selectedIndex + 1}/${THREADS.length}`,
        foreground: THEME.blue,
        bold: true,
      },
      { text: "   prompt viewport ", foreground: THEME.muted },
      {
        text: `${Math.floor(promptViewport.frameWidth())}w`,
        foreground: THEME.lime,
      },
      { text: "   transcript viewport ", foreground: THEME.muted },
      {
        text: `${Math.floor(transcriptViewport.frameWidth())}w`,
        foreground: THEME.lime,
      },
    ]),
  );
  threadBadge.setText(
    styledLine([
      { text: " thread ", foreground: THEME.badgeFg },
      {
        text: `${selectedIndex + 1}/${THREADS.length}`,
        foreground: THEME.badgeFg,
        bold: true,
      },
      { text: " ", foreground: THEME.badgeFg },
    ]),
  );

  const lines = buildTranscriptLines(thread);
  for (let i = 0; i < transcriptLines.length; i++) {
    transcriptLines[i]?.setText(lines[i] !== undefined ? lines[i]! : "");
  }
}

function refreshView(): void {
  renderPromptSlots();
  renderTranscript();
}

function moveSelection(delta: number): void {
  selectedIndex = wrapIndex(selectedIndex + delta);
  refreshView();
}

ff(() => {
  promptViewport.frameWidth();
  transcriptViewport.frameWidth();
  refreshView();
});

const app = run(root);

onKey("q", () => app.quit());
onKey("\t", () => composer.focus());
onKey("j", () => moveSelection(1));
onKey("k", () => moveSelection(-1));
onKey("\x1b[B", () => moveSelection(1));
onKey("\x1b[A", () => moveSelection(-1));

composer.focus();
