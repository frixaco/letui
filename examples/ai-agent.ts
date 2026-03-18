import {
  COLORS,
  Column,
  Input,
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

const idleBorder = {
  color: COLORS.default.bg_highlight,
  style: "square" as const,
};

const focusBorder = {
  color: COLORS.default.green,
  style: "square" as const,
};

const sidebarHeader = Text({
  text: "PROMPT HISTORY",
  foreground: COLORS.default.green,
});

const sidebarHint = Text({
  text: "j/k or arrows navigate    Tab focuses composer",
  foreground: COLORS.default.grey,
});

const promptSlots = Array.from({ length: 8 }, () =>
  Text({
    text: "",
    foreground: COLORS.default.fg,
  }),
);

const promptViewport = Column({ flexGrow: 1, gap: 0 }, promptSlots);

const sidebar = Column(
  {
    border: idleBorder,
    padding: "1 1",
    gap: 1,
    flexGrow: 2,
  },
  [sidebarHeader, sidebarHint, promptViewport],
);

const transcriptHeader = Text({
  text: "",
  foreground: COLORS.default.cyan,
});

const transcriptHint = Text({
  text: "static demo payload // keyboard-first flow",
  foreground: COLORS.default.grey,
});

const transcriptLines = Array.from({ length: 14 }, () =>
  Text({
    text: "",
    foreground: COLORS.default.fg,
  }),
);

const transcriptViewport = Column({ flexGrow: 1, gap: 0 }, transcriptLines);

const transcriptPanel = Column(
  {
    border: idleBorder,
    padding: "1 1",
    gap: 1,
    flexGrow: 1,
  },
  [transcriptHeader, transcriptHint, transcriptViewport],
);

const composer = Input({
  placeholder: "Type follow-up...",
  border: idleBorder,
  padding: "1 0",
  onSubmit: () => {},
  onFocus: (self) => self.setStyle({ border: focusBorder }),
  onBlur: (self) => self.setStyle({ border: idleBorder }),
});

if (composer.type === "input") {
  composer.setText("Summarize rollout risk and rollback criteria.");
}

const rightPane = Column(
  {
    flexGrow: 5,
    gap: 1,
  },
  [transcriptPanel, composer],
);

const root = Row(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: COLORS.default.bg,
  },
  [sidebar, rightPane],
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
  const width = Math.floor(promptViewport.frameWidth()) - 2;
  return Math.max(16, width);
}

function transcriptTextWidth(): number {
  const width = Math.floor(transcriptViewport.frameWidth()) - 2;
  return Math.max(24, width);
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
      slot.setText?.("");
      slot.setStyle?.({ foreground: COLORS.default.grey });
      continue;
    }

    const prefix = threadIndex === selectedIndex ? ">" : " ";
    const label = truncate(`${prefix} ${thread.title}`, width);
    slot.setText?.(label);
    slot.setStyle?.({
      foreground:
        threadIndex === selectedIndex
          ? COLORS.default.green
          : COLORS.default.fg,
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
  lines.push(...wrapWords("- mode: static demo payload with keyboard navigation", width));
  lines.push(...wrapWords("- goal: dense context without layout collisions", width));
  return lines;
}

function renderTranscript(): void {
  const thread = THREADS[selectedIndex];
  if (!thread) return;

  transcriptHeader.setText(`THREAD // ${thread.title}`);

  const lines = buildTranscriptLines(thread);
  for (let i = 0; i < transcriptLines.length; i++) {
    transcriptLines[i]?.setText?.(lines[i] ?? "");
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

function quit(): void {
  app.quit();
}

onKey("q", quit);
onKey("\t", () => composer.focus());
onKey("j", () => moveSelection(1));
onKey("k", () => moveSelection(-1));
onKey("\x1b[B", () => moveSelection(1));
onKey("\x1b[A", () => moveSelection(-1));

composer.focus();
