import {
  Column,
  Input,
  NODE_TYPE,
  Row,
  Text,
  createVirtualListController,
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

function generateFillerSections(count: number): PromptSection[] {
  const tones: PromptSectionTone[] = ["accent", "blue", "lime", "amber"];
  const headings = [
    "Implementation Detail",
    "Edge Case Analysis",
    "Performance Constraint",
    "Dependency Risk",
    "Migration Note",
    "Observability Gap",
    "Operational Guideline",
    "Rollback Path",
  ];
  const sections: PromptSection[] = [];
  for (let i = 0; i < count; i++) {
    sections.push({
      heading: headings[i % headings.length]! + ` (${i + 1})`,
      tone: tones[i % tones.length]!,
      paragraphs: [
        [
          { text: "This is filler paragraph ", tone: "text" },
          { text: `#${i + 1}`, tone: tones[i % tones.length], bold: true },
          {
            text: " added to guarantee the transcript pane overflows the visible viewport so wheel scrolling can be tested end-to-end.",
            tone: "text",
          },
        ],
        [
          { text: "Second line of section ", tone: "text" },
          { text: `${i + 1}`, tone: "lime", bold: true, underline: true },
          {
            text: " with enough detail to push layout beyond what fits on screen, validating that the virtual list controller correctly pages through rows.",
            tone: "muted",
            italic: true,
          },
        ],
      ],
    });
  }
  return sections;
}

for (const thread of THREADS) {
  thread.sections.push(...generateFillerSections(12));
}

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
    padding: "1 0",
    wrap: "word",
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
  wrap: "word",
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
    { text: " navigate wrapped labels", foreground: THEME.muted },
    { text: "\n", foreground: THEME.muted },
    { text: "Tab", foreground: THEME.accent, bold: true },
    { text: " focuses multiline composer", foreground: THEME.muted },
  ]),
  wrap: "word",
});

const promptViewport = Column({ gap: 1, flexGrow: 1, minHeight: 0 }, promptSlots);

const sidebar = Column(
  {
    gap: 1,
    padding: "1 1",
    borderRight: { color: THEME.border },
    flexGrow: 1,
    flexBasis: 30,
    minWidth: 28,
    minHeight: 0,
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
  text:
    "dense transcript view with stable node identity, wrapped panes, and longer explanatory copy that keeps flowing under narrow widths",
  foreground: THEME.muted,
  wrap: "word",
});

const transcriptViewport = Column({ gap: 0, flexGrow: 1, minHeight: 0 }, []);

const transcriptVirtualizer = createVirtualListController({
  container: transcriptViewport as any,
  createSlot: () =>
    Text({ text: "", foreground: THEME.text, wrap: "word" }),
});

const transcriptPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    flexGrow: 1,
    minHeight: 0,
  },
  [transcriptHeader, transcriptSubhead, transcriptViewport],
);

const composerHint = Text({
  text:
    "multiline composer demo: Enter inserts a newline, while Tab keeps the focus jump visible against the wrapped sidebar and transcript content",
  foreground: THEME.muted,
  wrap: "word",
});

const composer = Input({
  placeholder: "Type follow-up...",
  border: idleBorder,
  padding: "0 0",
  foreground: THEME.text,
  multiline: true,
  wrap: "word",
  height: 5,
  maxHeight: 5,
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (composer.type === NODE_TYPE.Input) {
  composer.setText(
    "Summarize rollout risk and rollback criteria.\nCall out the trigger metric, owner, and the exact rollback command path.",
  );
}

const composerRow = Row(
  {
    minHeight: 5,
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
    minHeight: 0,
    gap: 1,
    justifyContent: "spaceBetween",
  },
  [transcriptPanel, composerPanel],
);

const body = Row(
  {
    flexGrow: 1,
    minHeight: 0,
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

function paragraphSegments(
  paragraph: PromptParagraph,
  prefix = "  ",
): StyledSegment[] {
  const segments: StyledSegment[] = [
    { text: prefix, foreground: THEME.muted },
  ];

  for (const segment of paragraph) {
    segments.push({
      text: segment.text,
      foreground: inlineToneColor(segment.tone),
      bold: segment.bold,
      italic: segment.italic,
      underline: segment.underline,
    });
  }

  return segments;
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
    slot.setText(
      styledLine([
        {
          text: active ? "● " : "○ ",
          foreground: active ? THEME.badgeFg : THEME.muted,
          bold: active,
        },
        {
          text: thread.title,
          foreground: active ? THEME.badgeFg : THEME.text,
          bold: true,
        },
        { text: "\n", foreground: active ? THEME.badgeFg : THEME.muted },
        {
          text: thread.userPrompt,
          foreground: active ? THEME.badgeFg : THEME.muted,
          italic: !active,
        },
      ]),
    );

    slot.setStyle({
      foreground: THEME.text,
      background: active ? THEME.accent : undefined,
      paddingX: 1,
    });
  }
}

function buildTranscriptLines(thread: PromptThread): StyledText[] {
  const lines: StyledText[] = [];

  lines.push(
    styledLine([
      { text: "USER> ", foreground: THEME.blue, bold: true },
      { text: thread.userPrompt, foreground: THEME.amber },
    ]),
  );
  lines.push(styledLine([]));

  for (const section of thread.sections) {
    lines.push(
      styledLine([
        { text: section.heading.toUpperCase(), foreground: sectionToneColor(section.tone), bold: true },
      ]),
    );

    for (const paragraph of section.paragraphs) {
      lines.push(styledLine(paragraphSegments(paragraph)));
    }

    lines.push(styledLine([]));
  }

  lines.push(
    styledLine([
      { text: "RENDERER NOTES", foreground: THEME.blue, bold: true },
    ]),
  );
  lines.push(
    styledLine([
      { text: "  The demo still runs through ", foreground: THEME.text },
      { text: "bun + rust ffi", foreground: THEME.blue, bold: true, underline: true },
      { text: " so text styling exercises the same render path as the rest of the library.", foreground: THEME.text },
    ]),
  );
  lines.push(
    styledLine([
      { text: "  Layout stays ", foreground: THEME.text },
      { text: "wrapped", foreground: THEME.lime, bold: true },
      { text: " and keyboard-first, while the composer can take focus without losing sidebar context.", foreground: THEME.text },
    ]),
  );

  return lines;
}

let cachedTranscriptLines: StyledText[] = [];

function renderTranscript(): void {
  const thread = THREADS[selectedIndex];
  if (!thread) return;

  cachedTranscriptLines = buildTranscriptLines(thread);

  transcriptVirtualizer.setItemCount(cachedTranscriptLines.length);
  for (let i = 0; i < cachedTranscriptLines.length; i++) {
    transcriptVirtualizer.setMeasuredRows(i, 1);
  }

  transcriptVirtualizer.render((slot, slice) => {
    if (!slice) {
      slot.node.setText("");
      return;
    }
    const line = cachedTranscriptLines[slice.itemIndex];
    slot.node.setText(line ?? "");
  });

  transcriptHeader.setText(
    styledLine([
      { text: "THREAD // ", foreground: THEME.accent, bold: true },
      { text: thread.title, foreground: THEME.text },
    ]),
  );

  const scrollInfo = transcriptVirtualizer.scrollRowsSignal();
  headerMeta.setText(
    styledLine([
      { text: "active thread ", foreground: THEME.muted },
      {
        text: `${selectedIndex + 1}/${THREADS.length}`,
        foreground: THEME.blue,
        bold: true,
      },
      { text: "   scroll ", foreground: THEME.muted },
      {
        text: `${scrollInfo}`,
        foreground: THEME.accent,
        bold: true,
      },
      { text: `/${cachedTranscriptLines.length} lines`, foreground: THEME.muted },
      { text: "\ntranscript viewport ", foreground: THEME.muted },
      {
        text: `${Math.floor(transcriptViewport.frameWidth())}w`,
        foreground: THEME.lime,
      },
      { text: "   composer lines ", foreground: THEME.muted },
      {
        text: `${composer.props.text().split("\n").length}`,
        foreground: THEME.accent,
        bold: true,
      },
      { text: " lines", foreground: THEME.muted },
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
  transcriptViewport.frameHeight();
  transcriptVirtualizer.scrollRowsSignal();
  composer.props.text();
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
