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

type PromptThread = {
  title: string;
  userPrompt: string;
  aiLines: string[];
};

const THREADS: PromptThread[] = [
  {
    title: "Rollout Plan",
    userPrompt: "Design rollout for terminal autocomplete with strict latency guardrails.",
    aiLines: [
      "Ship behind a flag and limit first cohort to internal users.",
      "Track p50 and p95 completion latency plus acceptance and undo rates.",
      "Keep deterministic fallback when model call times out or returns malformed data.",
      "Promote gradually only after one stable day inside the latency budget.",
    ],
  },
  {
    title: "Render Incident",
    userPrompt: "Frame time jumps every few seconds during idle view. Give a fast triage path.",
    aiLines: [
      "Split timing into serialize, text sync, rust paint, sync, and flush.",
      "Check timer-driven setText bursts and hidden nodes still receiving updates.",
      "Capture one baseline before tuning so the comparison stays honest.",
    ],
  },
  {
    title: "Prompt History UX",
    userPrompt: "Prompt history should stay dense and fully keyboard driven under long sessions.",
    aiLines: [
      "Show intent-rich labels instead of raw prompt blobs.",
      "Keep active item obvious with border and color changes.",
      "Use j/k and arrows consistently across list-like surfaces.",
    ],
  },
  {
    title: "Degradation Strategy",
    userPrompt: "Model endpoint throws intermittent 502 and timeout bursts. Define graceful degradation.",
    aiLines: [
      "Retry once with bounded backoff then switch to a local fallback summarizer.",
      "Label output as degraded mode so confidence stays legible.",
      "Alert only on sustained threshold breaches, not isolated spikes.",
    ],
  },
  {
    title: "Release Gate",
    userPrompt: "Provide final pre-merge checklist for this TUI demo before sharing it.",
    aiLines: [
      "Run typecheck and smoke test in the same terminal used by reviewers.",
      "Verify all keyboard paths including quit path without relying on mouse input.",
      "Validate layout at narrow and wide terminal sizes.",
    ],
  },
  {
    title: "Context Compression",
    userPrompt: "How should long chat context be compacted before the next model call?",
    aiLines: [
      "Keep facts, decisions, constraints, and unresolved questions.",
      "Preserve exact identifiers such as paths, ids, versions, and owners.",
      "Store a short timeline so recency and sequence remain unambiguous.",
    ],
  },
];

const THEME = {
  bg: 0x09111b,
  panel: 0x0f1825,
  panelAlt: 0x152132,
  border: 0x26415e,
  text: 0xdbe7ff,
  muted: 0x88a0c0,
  accent: 0x57e2cc,
  blue: 0x73b8ff,
  lime: 0xcce66c,
  amber: 0xffc870,
} as const;

const idleBorder = { color: THEME.border, style: "rounded" as const };
const focusBorder = { color: THEME.accent, style: "rounded" as const };

const promptSlots = Array.from({ length: 7 }, () =>
  Text({
    text: "",
    foreground: THEME.text,
    background: THEME.panelAlt,
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
  text: "AI AGENT // KEYBOARD-FIRST CONTROL ROOM",
  foreground: THEME.accent,
});

const headerMeta = Text({
  text: "",
  foreground: THEME.muted,
});

const threadBadge = Text({
  text: "",
  foreground: THEME.bg,
  background: THEME.accent,
  paddingX: 1,
});

const modeBadge = Text({
  text: " static payload ",
  foreground: THEME.bg,
  background: THEME.lime,
  paddingX: 1,
});

const sidebarHint = Text({
  text: "j/k or arrows navigate   Tab focuses composer",
  foreground: THEME.muted,
});

const promptViewport = Column({ gap: 1, flexGrow: 1 }, promptSlots);

const sidebar = Column(
  {
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panel,
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
    border: idleBorder,
    background: THEME.panel,
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
  background: THEME.panelAlt,
  foreground: THEME.text,
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (composer.type === NODE_TYPE.Input) {
  composer.setText("Summarize rollout risk and rollback criteria.");
}

const composerPanel = Column(
  {
    gap: 1,
    padding: "1 1",
    border: idleBorder,
    background: THEME.panel,
  },
  [Text({ text: "COMPOSER", foreground: THEME.blue }), composer, composerHint],
);

const rightPane = Column(
  {
    flexGrow: 2,
    flexBasis: 54,
    minWidth: 42,
    gap: 1,
  },
  [transcriptPanel, composerPanel],
);

const footer = Text({
  text: "",
  foreground: THEME.muted,
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: THEME.bg,
  },
  [
    Column(
      {
        gap: 1,
        padding: "1 1",
        border: idleBorder,
        background: THEME.panel,
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
    ),
    Row(
      {
        flexGrow: 1,
        gap: 1,
        flexWrap: "wrap",
        alignItems: "stretch",
      },
      [sidebar, rightPane],
    ),
    footer,
  ],
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

function wrapWords(text: string, width: number): string[] {
  if (width <= 2) return [truncate(text.trim(), width)];

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = truncate(word, width);
      continue;
    }

    const next = `${current} ${word}`;
    if (next.length <= width) {
      current = next;
      continue;
    }

    lines.push(current);
    current = truncate(word, width);
  }

  lines.push(current);
  return lines;
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
        background: THEME.panelAlt,
      });
      continue;
    }

    const active = threadIndex === selectedIndex;
    slot.setText(truncate(`${active ? ">" : " "} ${thread.title}`, width));
    slot.setStyle({
      foreground: active ? THEME.bg : THEME.text,
      background: active ? THEME.accent : THEME.panelAlt,
      paddingX: 1,
    });
  }
}

function buildTranscriptLines(thread: PromptThread): string[] {
  const width = transcriptTextWidth();
  const lines: string[] = [];

  lines.push(...wrapWords(`USER> ${thread.userPrompt}`, width));
  lines.push("");

  for (const aiLine of thread.aiLines) {
    lines.push(...wrapWords(`- ${aiLine}`, width));
  }

  lines.push("");
  lines.push(...wrapWords("- runtime: bun + rust ffi renderer", width));
  lines.push(...wrapWords("- layout: wrapped panes with minWidth / flexBasis", width));
  lines.push(...wrapWords("- focus: composer can take over without losing sidebar context", width));
  return lines;
}

function renderTranscript(): void {
  const thread = THREADS[selectedIndex];
  if (!thread) return;

  transcriptHeader.setText(`THREAD // ${thread.title}`);
  headerMeta.setText(
    `active thread ${selectedIndex + 1}/${THREADS.length}   prompt viewport ${Math.floor(promptViewport.frameWidth())}w   transcript viewport ${Math.floor(transcriptViewport.frameWidth())}w`,
  );
  threadBadge.setText(` thread ${selectedIndex + 1}/${THREADS.length} `);

  const lines = buildTranscriptLines(thread);
  for (let i = 0; i < transcriptLines.length; i++) {
    transcriptLines[i]?.setText(lines[i] ?? "");
  }
}

function refreshView(): void {
  renderPromptSlots();
  renderTranscript();
  footer.setText(
    "responsive behavior: sidebar minWidth 28, transcript stack minWidth 42   q quit",
  );
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
