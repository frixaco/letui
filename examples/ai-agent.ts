import {
  COLORS,
  Column,
  Input,
  Row,
  Text,
  ff,
  onKey,
  run,
  type Node,
} from "../index.ts";

type PromptThread = {
  title: string;
  userPrompt: string;
  aiLines: string[];
};

const BASE_THREADS: PromptThread[] = [
  {
    title: "Rollout Plan With Guardrails",
    userPrompt:
      "Design rollout for AI autocomplete in terminal editor with strict latency and rollback rules.",
    aiLines: [
      "Ship behind a feature flag and limit the first cohort to internal developers.",
      "Track p50 and p95 completion latency and compare acceptance and undo rates.",
      "Use deterministic fallback when model calls exceed timeout or return malformed output.",
      "Promote cohorts only when error budget and latency budget stay stable for a full day.",
      "Prepare rollback trigger and operator runbook before opening to broader users.",
    ],
  },
  {
    title: "Render Spike Incident Triage",
    userPrompt:
      "Frame time jumps every few seconds during idle view. Give me a debugging sequence that is fast.",
    aiLines: [
      "Split timing into serialize, text sync, rust paint, and terminal flush phases.",
      "Check for timer-driven setText bursts and hidden nodes still receiving updates.",
      "Confirm no full subtree rebuilds happen during idle periods.",
      "Batch related text updates in one microtask and re-measure p95 frame time.",
      "Keep one baseline capture to prevent placebo fixes during tuning.",
    ],
  },
  {
    title: "Prompt History UX",
    userPrompt:
      "I need prompt history that stays useful under long sessions and works entirely from keyboard.",
    aiLines: [
      "Show intent-rich labels with short context preview rather than raw prompt blobs.",
      "Keep active thread obvious with border and color changes, not just a tiny cursor.",
      "Use j/k and arrow keys consistently in every list-like section.",
      "Preserve draft input when switching prompt threads so users never lose context.",
      "Avoid noisy decoration and preserve high information density.",
    ],
  },
  {
    title: "Backend Degradation Strategy",
    userPrompt:
      "Model endpoint throws intermittent 502 and timeout bursts. Define graceful degradation behavior.",
    aiLines: [
      "Retry once with bounded backoff and then switch to a local fallback summarizer.",
      "Tag output as degraded mode so users understand confidence and scope boundaries.",
      "Log structured failure events with route key and trace identifier.",
      "Alert only on sustained threshold breaches, not isolated spikes.",
      "Add synthetic probe for this failure mode after incident closure.",
    ],
  },
  {
    title: "Release Gate Checklist",
    userPrompt:
      "Provide final pre-merge checklist for this TUI demo before sharing with the team.",
    aiLines: [
      "Run typecheck and smoke test in the same terminal emulator used by reviewers.",
      "Verify all keyboard paths, including quit path, without relying on mouse interactions.",
      "Validate layout at 80x24, 120x35, and widescreen dimensions.",
      "Confirm no unrelated files changed in diff and no stale debug output remains.",
      "Add one short run instruction so teammates can launch immediately.",
    ],
  },
  {
    title: "Context Compression Rules",
    userPrompt:
      "How should long chat context be compacted before next model call while preserving decisions?",
    aiLines: [
      "Keep facts, decisions, constraints, and unresolved questions; drop social filler.",
      "Preserve identifiers such as versions, IDs, paths, and owners exactly.",
      "Store a short timeline to keep sequence and recency unambiguous.",
      "Apply hard section token budgets and reject over-budget summaries.",
      "Recompute summary only when meaningful state changes occur.",
    ],
  },
];

const PROMPT_THREADS: PromptThread[] = Array.from({ length: 160 }, (_, index) => {
  const seed = BASE_THREADS[index % BASE_THREADS.length];
  const batch = Math.floor(index / BASE_THREADS.length) + 1;
  if (!seed) {
    return {
      title: `Queue ${index + 1}`,
      userPrompt: "Fallback prompt payload.",
      aiLines: ["Fallback assistant payload."],
    };
  }

  return {
    title: `${seed.title} [H${batch}]`,
    userPrompt: seed.userPrompt,
    aiLines: seed.aiLines,
  };
});

const sidebarHeader = Text({
  text: "PROMPT HISTORY",
  foreground: COLORS.default.fg,
});

const sidebarHint = Text({
  text: "navigate: up/down or j/k",
  foreground: COLORS.default.grey,
});

const INPUT_BORDER_IDLE = { color: COLORS.default.bg_highlight, style: "square" as const };
const INPUT_BORDER_FOCUSED = { color: COLORS.default.green, style: "square" as const };

const promptSlots: Node[] = Array.from({ length: 80 }, () =>
  Text({
    text: "",
    foreground: COLORS.default.fg,
  }),
);

const promptViewport = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    overflow: "hidden",
    rowGap: 0,
  },
  promptSlots,
);

const sidebar = Column(
  {
    width: 66,
    minWidth: 40,
    maxWidth: 72,
    flexGrow: 0,
    flexShrink: 0,
    border: { color: COLORS.default.bg_highlight, style: "square" },
    padding: "1 0",
    rowGap: 0,
    overflow: "hidden",
  },
  [sidebarHeader, sidebarHint, promptViewport],
);

const transcriptHeader = Text({
  text: "",
  foreground: COLORS.default.cyan,
});

const transcriptHint = Text({
  text: "demo mode: hardcoded response stream",
  foreground: COLORS.default.grey,
});

const transcriptLines: Node[] = Array.from({ length: 120 }, () =>
  Text({
    text: "",
    foreground: COLORS.default.fg,
  }),
);

const transcriptViewport = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    overflow: "hidden",
    rowGap: 0,
  },
  transcriptLines,
);

const transcriptPanel = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    border: { color: COLORS.default.bg_highlight, style: "square" },
    padding: "1 0",
    rowGap: 0,
    overflow: "hidden",
  },
  [transcriptHeader, transcriptHint, transcriptViewport],
);

const composer = Input({
  placeholder: "Type follow-up...",
  border: INPUT_BORDER_IDLE,
  padding: "1 0",
  height: 9,
  minHeight: 9,
  maxHeight: 9,
  onSubmit: () => {},
  onFocus: (self) => {
    self.setStyle({ border: INPUT_BORDER_FOCUSED });
  },
  onBlur: (self) => {
    self.setStyle({ border: INPUT_BORDER_IDLE });
  },
});

if (composer.type === "input") {
  composer.setText("Summarize risk + rollback criteria before merge.");
}

const rightPane = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    rowGap: 0,
    overflow: "hidden",
  },
  [transcriptPanel, composer],
);

const root = Row(
  {
    flexGrow: 1,
    columnGap: 1,
    overflow: "hidden",
  },
  [sidebar, rightPane],
);

let selectedIndex = 0;
let promptWindowStart = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(next: number): number {
  const total = PROMPT_THREADS.length;
  if (total === 0) return 0;
  if (next < 0) return total - 1;
  if (next >= total) return 0;
  return next;
}

function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

function wrapWords(text: string, width: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [""];
  if (width <= 2) return [truncate(trimmed, width)];

  const words = trimmed.split(/\s+/);
  const rows: string[] = [];
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

    rows.push(current);
    current = truncate(word, width);
  }

  rows.push(current);
  return rows;
}

function promptViewportRows(): number {
  const h = Math.floor(promptViewport.frameHeight());
  if (h <= 0) return Math.min(12, promptSlots.length);
  return clamp(h, 1, promptSlots.length);
}

function promptTextWidth(): number {
  const w = Math.floor(promptViewport.frameWidth());
  if (w <= 0) return 48;
  return Math.max(12, w - 6);
}

function syncPromptWindow(): void {
  const rows = promptViewportRows();
  if (selectedIndex < promptWindowStart) {
    promptWindowStart = selectedIndex;
  }
  if (selectedIndex >= promptWindowStart + rows) {
    promptWindowStart = selectedIndex - rows + 1;
  }

  const maxStart = Math.max(0, PROMPT_THREADS.length - rows);
  promptWindowStart = clamp(promptWindowStart, 0, maxStart);
}

function promptLabel(thread: PromptThread, index: number, width: number): string {
  const ordinal = String(index + 1).padStart(2, "0");
  const raw = `${ordinal} ${thread.title} :: ${thread.userPrompt}`;
  return truncate(raw, width);
}

function renderSidebar(): void {
  syncPromptWindow();
  const width = promptTextWidth();

  for (let slotIndex = 0; slotIndex < promptSlots.length; slotIndex++) {
    const node = promptSlots[slotIndex];
    if (!node || node.type !== "text") continue;

    const threadIndex = promptWindowStart + slotIndex;
    const thread = PROMPT_THREADS[threadIndex];
    if (!thread) {
      node.setText("");
      node.setStyle({ foreground: COLORS.default.fg });
      continue;
    }

    const isActive = threadIndex === selectedIndex;
    const marker = isActive ? ">" : " ";
    const framed = `[ ${promptLabel(thread, threadIndex, width)} ]`;
    node.setText(`${marker} ${framed}`);
    node.setStyle({
      foreground: isActive ? COLORS.default.green : COLORS.default.fg,
    });
  }
}

function transcriptWidth(): number {
  const w = Math.floor(transcriptViewport.frameWidth());
  if (w <= 0) return 80;
  return Math.max(20, w - 2);
}

function transcriptRows(): number {
  const h = Math.floor(transcriptViewport.frameHeight());
  if (h <= 0) return 30;
  return clamp(h, 1, transcriptLines.length);
}

function buildTranscriptLines(thread: PromptThread, width: number): string[] {
  const out: string[] = [];
  out.push(...wrapWords(`USER> ${thread.userPrompt}`, width));
  out.push("");
  out.push("ASSISTANT>");
  for (const line of thread.aiLines) {
    out.push(...wrapWords(`- ${line}`, width));
  }
  out.push("");
  out.push("SYSTEM CONTEXT>");
  out.push(...wrapWords("- runtime: bun + rust ffi renderer", width));
  out.push(...wrapWords("- mode: static demo payload with keyboard navigation", width));
  out.push(...wrapWords("- constraint: parent clipping must hide overflow text", width));
  out.push(...wrapWords("- input submit intentionally disabled for this demo", width));
  out.push("");
  out.push("OPERATOR NOTES>");
  out.push(...wrapWords("- keep p95 frame time under visual jitter threshold", width));
  out.push(...wrapWords("- inspect borders after every resize at narrow widths", width));
  out.push(...wrapWords("- ensure prompt list and transcript never paint over parent borders", width));
  out.push(...wrapWords("- keyboard path: j/k and arrows should remain deterministic", width));
  out.push("");

  let filler = 1;
  while (out.length < transcriptLines.length) {
    out.push(
      truncate(
        `context-buffer ${String(filler).padStart(2, "0")}: deterministic snapshot for dense viewport rendering`,
        width,
      ),
    );
    filler += 1;
  }

  return out;
}

function lineColor(text: string): number {
  if (text.startsWith("USER>")) return COLORS.default.blue;
  if (text.startsWith("ASSISTANT>")) return COLORS.default.green;
  if (text.startsWith("SYSTEM CONTEXT>")) return COLORS.default.cyan;
  if (text.startsWith("OPERATOR NOTES>")) return COLORS.default.cyan;
  if (text.startsWith("- ")) return COLORS.default.fg;
  if (text.startsWith("context-buffer")) return COLORS.default.grey;
  return COLORS.default.fg;
}

function renderTranscript(): void {
  const active = PROMPT_THREADS[selectedIndex];
  if (!active) return;

  if (transcriptHeader.type === "text") {
    transcriptHeader.setText(`THREAD ${selectedIndex + 1}/${PROMPT_THREADS.length} :: ${active.title}`);
  }

  const lines = buildTranscriptLines(active, transcriptWidth());
  const rowBudget = transcriptRows();

  for (let i = 0; i < transcriptLines.length; i++) {
    const node = transcriptLines[i];
    if (!node || node.type !== "text") continue;

    if (i >= rowBudget) {
      node.setText("");
      continue;
    }

    const text = lines[i] ?? "";
    node.setText(text);
    node.setStyle({ foreground: lineColor(text) });
  }
}

function render(): void {
  renderSidebar();
  renderTranscript();
}

function moveSelection(delta: number): void {
  if (PROMPT_THREADS.length === 0) return;
  selectedIndex = wrapIndex(selectedIndex + delta);
  render();
}

function toggleFocus(): void {
  if (composer.isFocused()) {
    composer.blur();
    return;
  }
  composer.focus();
}

function navigateHistory(delta: number): void {
  if (composer.isFocused()) return;
  moveSelection(delta);
}

const app = run(root, {
  debug: true,
});
let stopped = false;
composer.blur();

ff(() => {
  promptViewport.frameHeight();
  promptViewport.frameWidth();
  transcriptViewport.frameHeight();
  transcriptViewport.frameWidth();
  render();
});

function quit(): void {
  if (stopped) return;
  stopped = true;
  app.quit();
}

onKey("q", quit);
onKey("\t", toggleFocus);
onKey("j", () => navigateHistory(1));
onKey("k", () => navigateHistory(-1));
onKey("\x1b[B", () => navigateHistory(1));
onKey("\x1b[A", () => navigateHistory(-1));

render();
