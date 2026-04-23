// AI agent control room demo: dense two-pane workspace with keyboard-first thread review.
//
// Data flow:
// thread selection / composer actions -> signals + supplement buffers -> ff() effect ->
// thread cards, transcript scroll viewport, and composer chrome

import { Button, Column, Input, Row, ScrollView, Text, $, ff, onKey, run } from "@";
import type { StyledText } from "@";
import { styled, NAV_NEXT_KEYS, NAV_PREV_KEYS, NAV_TOGGLE_KEYS } from "./helpers.ts";
import type { StyledSegment } from "./helpers.ts";

type Pane = "threads" | "composer";

type ThreadSection = {
  label: string;
  accent: number;
  body: readonly StyledSegment[];
};

type ThreadData = {
  title: string;
  brief: string;
  subtitle: string;
  payload: string;
  draft: string;
  prompt: readonly StyledSegment[];
  sections: readonly ThreadSection[];
};

type ThreadRowView = {
  button: ReturnType<typeof Button>;
  title: ReturnType<typeof Text>;
  summary: ReturnType<typeof Text>;
};

const THEME = {
  shell: 0x0a0912,
  panel: 0x181421,
  panelAlt: 0x13111b,
  panelSoft: 0x21192a,
  ink: 0x090711,
  text: 0xf4edf8,
  muted: 0x867fa2,
  dim: 0x686180,
  line: 0x354067,
  lineSoft: 0x232739,
  magenta: 0xf25bf2,
  pink: 0xf04cd6,
  cyan: 0x22d7ff,
  green: 0x0dffab,
  amber: 0xffb347,
  violet: 0x8b86b4,
  selection: 0xe04bda,
  selectionSoft: 0x3b1f39,
} as const;

const THREADS: readonly ThreadData[] = [
  {
    title: "Rollout Plan",
    brief: "Design rollout for terminal autocomplete with strict latency guardrails.",
    subtitle:
      "dense transcript view with stable node identity, wrapped panes, and longer explanatory copy that keeps flowing under narrow widths",
    payload: "static payload",
    draft:
      "Summarize rollout risk and rollback criteria.\nCall out the trigger metric, owner, and the exact rollback command path.",
    prompt: [{ text: "Design rollout for terminal autocomplete with strict latency guardrails." }],
    sections: [
      {
        label: "GOAL",
        accent: THEME.magenta,
        body: [
          { text: "  Ship a " },
          { text: "flagged", foreground: THEME.magenta, bold: true },
          { text: " autocomplete path that feels " },
          { text: "fast", foreground: THEME.green, bold: true, underline: true },
          { text: " on every keystroke while the first cohort stays " },
          { text: "small", foreground: THEME.amber, italic: true },
          { text: " enough to debug in real time." },
        ],
      },
      {
        label: "RAMP",
        accent: THEME.cyan,
        body: [
          { text: "  Start with " },
          { text: "internal terminals", foreground: THEME.cyan, bold: true, underline: true },
          { text: ", then widen only after one " },
          { text: "stable day", foreground: THEME.green, bold: true },
          { text: " so rollback remains " },
          { text: "cheap", foreground: THEME.amber, italic: true },
          { text: " and obvious." },
        ],
      },
      {
        label: "METRICS",
        accent: THEME.green,
        body: [
          { text: "  Track " },
          { text: "p50 / p95", foreground: THEME.green, bold: true },
          { text: " completion latency beside acceptance and " },
          { text: "undo rate", foreground: THEME.cyan, italic: true },
          { text: " so the rollout cannot look good on speed alone." },
        ],
      },
      {
        label: "FALLBACK",
        accent: THEME.amber,
        body: [
          { text: "  When the model times out or returns malformed output, swap to a " },
          { text: "deterministic suggestion shell", foreground: THEME.magenta, bold: true },
          { text: " and " },
          { text: "never", foreground: THEME.amber, bold: true, underline: true },
          { text: " blank the active row." },
        ],
      },
      {
        label: "IMPLEMENTATION DETAIL (1)",
        accent: THEME.pink,
        body: [
          {
            text: "  This filler paragraph is here to guarantee the transcript pane overflows the visible viewport so wheel scrolling can be tested end to end. ",
          },
          { text: "Section 1", foreground: THEME.green, bold: true },
          {
            text: " keeps enough narrative density to validate paging and wrapping across narrower terminal widths.",
          },
        ],
      },
      {
        label: "IMPLEMENTATION DETAIL (2)",
        accent: THEME.pink,
        body: [
          {
            text: "  Keep node identity stable under theme changes and thread switches so the Rust tree can stay hot while only text and style deltas move through the bridge.",
          },
        ],
      },
      {
        label: "COMPOSER",
        accent: THEME.cyan,
        body: [
          { text: "  Multiline composer demo: " },
          { text: "Enter", foreground: THEME.amber, bold: true },
          { text: " inserts a newline, " },
          { text: "Tab", foreground: THEME.magenta, bold: true },
          { text: " keeps the focus jump visible, and " },
          { text: "Ctrl+S", foreground: THEME.green, bold: true },
          { text: " appends a fake reply without leaving the keyboard." },
        ],
      },
    ],
  },
  {
    title: "Render Incident",
    brief: "Frame time jumps every few seconds during idle view. Give a fast triage path.",
    subtitle:
      "investigation flow that shows issue history on the left while the transcript stays long enough to stress wrapped paragraphs",
    payload: "latency trace",
    draft:
      "Write a triage note for tonight's incident.\nCall out the first metric to open and who owns the rollback.",
    prompt: [
      { text: "Frame time spikes every few seconds during idle view. Give a fast triage path." },
    ],
    sections: [
      {
        label: "OBSERVATION",
        accent: THEME.magenta,
        body: [
          { text: "  Worst frames cluster around " },
          { text: "flush", foreground: THEME.magenta, bold: true },
          {
            text: ", which suggests the renderer is still cheap while terminal writes occasionally burst above the guardrail.",
          },
        ],
      },
      {
        label: "CHECK FIRST",
        accent: THEME.cyan,
        body: [
          { text: "  Open the " },
          { text: "worst-frame bucket", foreground: THEME.cyan, underline: true },
          {
            text: " and compare it with PTY byte counts so we can separate layout churn from terminal churn before anyone rewrites a hot path.",
          },
        ],
      },
      {
        label: "TRIAGE RULE",
        accent: THEME.green,
        body: [
          { text: "  If " },
          { text: "render", foreground: THEME.green, bold: true },
          { text: " stays flat while " },
          { text: "flush", foreground: THEME.amber, bold: true },
          { text: " grows, fix output volume or terminal behavior before touching layout." },
        ],
      },
      {
        label: "FOLLOW-THROUGH",
        accent: THEME.amber,
        body: [
          {
            text: "  Ship a tiny reproduction, keep the transcript dense, and always leave an obvious ",
          },
          { text: "rollback command", foreground: THEME.magenta, bold: true },
          { text: " in the handoff so the demo feels operational instead of theatrical." },
        ],
      },
      {
        label: "DEEPER NOTE",
        accent: THEME.pink,
        body: [
          {
            text: "  Longer paragraphs here intentionally overflow the viewport. They make it easier to verify scrolling, badge updates, and focus shifts without relying on network data or terminal resize gymnastics.",
          },
        ],
      },
      {
        label: "COMPOSER",
        accent: THEME.cyan,
        body: [
          {
            text: "  Drafts are stored per thread, so switching incidents keeps every multiline note parked in place until you come back.",
          },
        ],
      },
    ],
  },
  {
    title: "Prompt History UX",
    brief: "Prompt history should stay dense and fully keyboard driven under long sessions.",
    subtitle:
      "history-focused transcript proving that wrapped labels, long summaries, and pane state stay understandable at full-screen sizes",
    payload: "dense archive",
    draft:
      "Suggest a compact prompt-history policy.\nPrioritize discoverability without adding heavy chrome.",
    prompt: [
      {
        text: "Prompt history should stay dense and fully keyboard driven under long sessions.",
      },
    ],
    sections: [
      {
        label: "INTENT",
        accent: THEME.magenta,
        body: [
          { text: "  Preserve " },
          { text: "continuity", foreground: THEME.magenta, bold: true },
          {
            text: " by showing the latest question, the working draft, and the last accepted answer without making the user open a secondary mode.",
          },
        ],
      },
      {
        label: "DENSITY",
        accent: THEME.cyan,
        body: [
          { text: "  A wrapped label is fine if the interaction remains " },
          { text: "predictable", foreground: THEME.cyan, underline: true },
          {
            text: ". Keep traversal on one axis and let the transcript pane carry the verbose detail.",
          },
        ],
      },
      {
        label: "RECOVERY",
        accent: THEME.green,
        body: [
          { text: "  Use stable card identity so revisiting a thread feels " },
          { text: "calm", foreground: THEME.green, italic: true },
          { text: " rather than like a list re-mounted underneath the cursor." },
        ],
      },
      {
        label: "TRADEOFF",
        accent: THEME.amber,
        body: [
          {
            text: "  Accept that the transcript will sometimes be longer than the viewport. The point of this demo is to prove ",
          },
          { text: "overflow discipline", foreground: THEME.amber, bold: true },
          { text: ", not pretend it never happens." },
        ],
      },
      {
        label: "IMPLEMENTATION DETAIL",
        accent: THEME.pink,
        body: [
          {
            text: "  Wrapped text plus button focus states make a better stress test for the renderer than a perfectly clipped, one-line-only navigation rail.",
          },
        ],
      },
    ],
  },
  {
    title: "Degradation Strategy",
    brief:
      "Model endpoint throws intermittent 502 and timeout bursts. Define graceful degradation.",
    subtitle:
      "operational transcript with explicit fallback language, long-form reasoning, and a composer seeded with rollback-oriented prompts",
    payload: "failure map",
    draft:
      "Draft the graceful degradation message.\nKeep it calm, specific, and useful when the model is flaky.",
    prompt: [
      {
        text: "Model endpoint throws intermittent 502 and timeout bursts. Define graceful degradation.",
      },
    ],
    sections: [
      {
        label: "NON-NEGOTIABLE",
        accent: THEME.magenta,
        body: [
          { text: "  The shell cannot go blank. If upstream fails, show the user a " },
          { text: "reliable local fallback", foreground: THEME.magenta, bold: true },
          { text: " in the same row." },
        ],
      },
      {
        label: "TONE",
        accent: THEME.cyan,
        body: [
          { text: "  Be " },
          { text: "calm", foreground: THEME.green, bold: true },
          {
            text: ", admit the failure quickly, and explain the exact reduced mode so the UI still feels deliberate.",
          },
        ],
      },
      {
        label: "WINDOW",
        accent: THEME.green,
        body: [
          { text: "  Retry inside a bounded " },
          { text: "cooldown", foreground: THEME.cyan, underline: true },
          { text: " and surface the next eligibility time instead of spamming invisible retries." },
        ],
      },
      {
        label: "ROLLBACK",
        accent: THEME.amber,
        body: [
          { text: "  Route every bad cohort behind one switch so rollback is a " },
          { text: "single-command action", foreground: THEME.amber, bold: true },
          { text: " during incident response." },
        ],
      },
      {
        label: "LONG NOTE",
        accent: THEME.pink,
        body: [
          {
            text: "  This section exists mostly to keep the transcript tall and readable while showing that dense explanatory copy can wrap without turning the layout into soup.",
          },
        ],
      },
    ],
  },
  {
    title: "Release Gate",
    brief: "Provide final pre-merge checklist for this TUI demo before sharing it.",
    subtitle:
      "pre-flight transcript that mixes concise checklist items with enough prose to keep the scrollable pane meaningful",
    payload: "ship list",
    draft:
      "Write the final release gate note.\nInclude lint, typecheck, and one manual smoke test in plain language.",
    prompt: [{ text: "Provide final pre-merge checklist for this TUI demo before sharing it." }],
    sections: [
      {
        label: "CHECKLIST",
        accent: THEME.magenta,
        body: [
          { text: "  " },
          { text: "lint", foreground: THEME.magenta, bold: true },
          { text: ", " },
          { text: "typecheck", foreground: THEME.cyan, bold: true },
          { text: ", and one " },
          { text: "manual terminal pass", foreground: THEME.green, bold: true },
          { text: " before the screenshot leaves your machine." },
        ],
      },
      {
        label: "VISUAL PASS",
        accent: THEME.cyan,
        body: [
          {
            text: "  Verify wrapped cards, transcript scrolling, and composer focus jumps so the demo still reads as ",
          },
          { text: "intentional", foreground: THEME.cyan, underline: true },
          { text: " under smaller panes." },
        ],
      },
      {
        label: "RISK",
        accent: THEME.green,
        body: [
          {
            text: "  Screenshot-heavy demos hide interaction bugs. Force yourself to use the keyboard path before declaring anything done.",
          },
        ],
      },
      {
        label: "HANDOFF",
        accent: THEME.amber,
        body: [
          {
            text: "  Leave the exact command in the transcript so whoever picks this up next has a ",
          },
          { text: "copyable", foreground: THEME.amber, italic: true },
          { text: " starting point." },
        ],
      },
    ],
  },
  {
    title: "Context Compression",
    brief: "How long should chat context stay compacted before the next model call?",
    subtitle:
      "conversation policy transcript tuned for long sessions where memory pressure and clarity have to coexist",
    payload: "memory budget",
    draft:
      "Outline a context-compression policy.\nKeep the answer practical for long-running terminals.",
    prompt: [
      {
        text: "How long should chat context stay compacted before the next model call?",
      },
    ],
    sections: [
      {
        label: "RULE",
        accent: THEME.magenta,
        body: [
          { text: "  Compress only after the current task has a " },
          { text: "stable summary anchor", foreground: THEME.magenta, bold: true },
          {
            text: " so the next completion is handed clean, recent intent instead of a lossy scramble.",
          },
        ],
      },
      {
        label: "KEEP",
        accent: THEME.cyan,
        body: [
          { text: "  Preserve " },
          { text: "constraints", foreground: THEME.cyan, underline: true },
          {
            text: ", latest edits, and unresolved risks. Throw away conversational throat-clearing first.",
          },
        ],
      },
      {
        label: "DROP",
        accent: THEME.green,
        body: [
          {
            text: "  Do not carry stale speculative branches longer than one turn if reality has already replaced them.",
          },
        ],
      },
      {
        label: "WHY",
        accent: THEME.amber,
        body: [
          { text: "  Long sessions degrade because history becomes " },
          { text: "wide", foreground: THEME.amber, italic: true },
          {
            text: " instead of useful. Compression is successful when the next call still feels like a continuation, not a reset.",
          },
        ],
      },
      {
        label: "LONG NOTE",
        accent: THEME.pink,
        body: [
          {
            text: "  This final block adds extra wrapped copy so the thread remains tall enough to demonstrate scroll position, max-scroll reporting, and pane chrome updates.",
          },
        ],
      },
    ],
  },
] as const;

const NEXT_KEYS = NAV_NEXT_KEYS;
const PREV_KEYS = NAV_PREV_KEYS;
const TOGGLE_KEYS = NAV_TOGGLE_KEYS;

function sectionText(section: ThreadSection): StyledText {
  return styled([
    { text: `${section.label}\n`, foreground: section.accent, bold: true },
    ...section.body,
  ]);
}

function makeSupplementResponse(
  threadTitle: string,
  prompt: string,
  revision: number,
): readonly StyledSegment[] {
  return [
    { text: "  Thread " },
    { text: threadTitle, foreground: THEME.magenta, bold: true },
    { text: " can answer this with a " },
    { text: "tight operational summary", foreground: THEME.green, bold: true },
    {
      text: ": start with the risk, name the owner, then end on the one command or decision that unblocks the next move. ",
    },
    { text: `Revision ${revision + 1}`, foreground: THEME.cyan, underline: true },
    { text: " keeps the wording short while reacting to: " },
    { text: `"${prompt.trim()}"`, foreground: THEME.amber, italic: true },
    { text: "." },
  ];
}

function buildTranscriptNodes(
  thread: ThreadData,
  supplements: readonly ThreadSection[],
): ReturnType<typeof Text>[] {
  const nodes: ReturnType<typeof Text>[] = [
    Text({
      text: styled([
        { text: "THREAD // ", foreground: THEME.magenta, bold: true },
        { text: thread.title.toUpperCase(), foreground: THEME.text, bold: true },
      ]),
      wrap: "word",
    }),
    Text({
      text: thread.subtitle,
      foreground: THEME.muted,
      wrap: "word",
    }),
    Text({
      text: styled([{ text: "USER> ", foreground: THEME.cyan, bold: true }, ...thread.prompt]),
      foreground: THEME.amber,
      wrap: "word",
    }),
  ];

  for (const section of thread.sections) {
    nodes.push(Text({ text: sectionText(section), foreground: THEME.text, wrap: "word" }));
  }

  for (const section of supplements) {
    nodes.push(Text({ text: sectionText(section), foreground: THEME.text, wrap: "word" }));
  }

  return nodes;
}

function createThreadRow(
  thread: ThreadData,
  index: number,
  onFocusThread: (index: number) => void,
  onActivateThread: (index: number) => void,
  onKeyDown: (key: string) => boolean,
): ThreadRowView {
  const title = Text({
    text: `○ ${thread.title}`,
    foreground: THEME.text,
    wrap: "word",
  });
  const summary = Text({
    text: thread.brief,
    foreground: THEME.dim,
    wrap: "word",
  });

  const button = Button(
    {
      text: "",
      padding: "1 1",
      border: { color: THEME.lineSoft, style: "rounded" },
      background: THEME.panelAlt,
      onKeyDown,
      onFocus: () => onFocusThread(index),
      onClick: () => onActivateThread(index),
    },
    [Column({ gap: 0 }, [title, summary])],
  );

  return { button, title, summary };
}

function startAIAgentDemo(): ReturnType<typeof run> {
  const activeThreadIndex = $(0);
  const activePane = $<Pane>("threads");
  const transcriptVersion = $(0);
  const composerValue = $(THREADS[0]!.draft);

  const drafts = THREADS.map((thread) => thread.draft);
  const supplements: ThreadSection[][] = THREADS.map(() => []);

  let pendingScroll: "start" | "end" | null = "start";
  let lastTranscriptKey = "";
  let threadRows: ThreadRowView[] = [];

  const chrome = Column(
    {
      flexGrow: 1,
      gap: 1,
      padding: "1 1",
      background: THEME.panel,
      border: { color: THEME.line, style: "rounded" },
    },
    [],
  );

  const title = Text({
    text: styled([
      { text: "AI AGENT", foreground: THEME.magenta, bold: true },
      { text: " // ", foreground: THEME.dim },
      { text: "KEYBOARD-FIRST", foreground: THEME.cyan, bold: true },
      { text: " CONTROL ROOM", foreground: THEME.text },
    ]),
  });
  const meta = Text({ text: "", foreground: THEME.muted });
  const threadBadge = Text({
    text: "",
    foreground: THEME.ink,
    background: THEME.selection,
    paddingX: 1,
  });
  const payloadBadge = Text({
    text: "",
    foreground: THEME.ink,
    background: THEME.green,
    paddingX: 1,
  });

  const header = Column(
    {
      gap: 0,
      paddingY: 1,
      borderBottom: { color: THEME.line },
    },
    [
      Row({ justifyContent: "spaceBetween", alignItems: "center", gap: 1, flexWrap: "wrap" }, [
        Column({ gap: 0 }, [title, meta]),
        Row({ gap: 1, flexWrap: "wrap" }, [threadBadge, payloadBadge]),
      ]),
    ],
  );

  const threadTitle = Text({
    text: "PROMPT HISTORY",
    foreground: THEME.cyan,
  });
  const threadHint = Text({
    text: styled([
      { text: "j/k", foreground: THEME.green, bold: true },
      { text: " or ", foreground: THEME.muted },
      { text: "arrows", foreground: THEME.cyan, bold: true },
      { text: " navigate wrapped labels\n", foreground: THEME.muted },
      { text: "Tab", foreground: THEME.magenta, bold: true },
      { text: " focuses multiline composer", foreground: THEME.muted },
    ]),
    wrap: "word",
  });

  const threadViewport = ScrollView(
    {
      flexGrow: 1,
      minHeight: 0,
      gap: 1,
      scrollY: 0,
      onScroll: ({ deltaY }) => {
        if (deltaY === 0) return;
        activePane("threads");
        threadViewport.scrollBy(deltaY);
      },
    },
    [],
  );

  const transcriptTitle = Text({ text: "", foreground: THEME.magenta });
  const transcriptViewport = ScrollView(
    {
      flexGrow: 1,
      minHeight: 0,
      gap: 1,
      scrollY: 0,
      onScroll: ({ deltaY }) => {
        if (deltaY === 0) return;
        transcriptViewport.scrollBy(deltaY);
      },
    },
    [],
  );
  const composerTitle = Text({ text: "COMPOSER", foreground: THEME.cyan });
  const composer = Input({
    multiline: true,
    border: { color: THEME.magenta, style: "rounded" },
    background: THEME.panelAlt,
    foreground: THEME.text,
    minHeight: 6,
    padding: "1 1",
    wrap: "word",
    onChange: (value) => {
      drafts[activeThreadIndex()] = value;
      composerValue(value);
    },
    onFocus: (self) => {
      activePane("composer");
      self.setStyle({ border: { color: THEME.magenta, style: "rounded" } });
    },
    onBlur: (self) => {
      self.setStyle({ border: { color: THEME.lineSoft, style: "rounded" } });
    },
  });
  const composerHint = Text({
    text: styled([
      { text: "Ctrl+S", foreground: THEME.green, bold: true },
      { text: " send   ", foreground: THEME.muted },
      { text: "Ctrl+R", foreground: THEME.cyan, bold: true },
      { text: " regenerate   ", foreground: THEME.muted },
      { text: "Esc", foreground: THEME.amber, bold: true },
      { text: " threads   ", foreground: THEME.muted },
      { text: "Ctrl+Q", foreground: THEME.magenta, bold: true },
      { text: " quit", foreground: THEME.muted },
    ]),
    wrap: "word",
  });

  const leftPanel = Column(
    {
      width: 42,
      minWidth: 32,
      gap: 1,
      borderRight: { color: THEME.line },
      flexShrink: 0,
      minHeight: 0,
    },
    [threadTitle, threadHint, threadViewport],
  );

  const rightPanel = Column(
    {
      flexGrow: 1,
      minHeight: 0,
      gap: 1,
      paddingX: 1,
    },
    [transcriptTitle, transcriptViewport, composerTitle, composer, composerHint],
  );

  const body = Row(
    {
      flexGrow: 1,
      minHeight: 0,
      alignItems: "stretch",
      gap: 0,
    },
    [leftPanel, rightPanel],
  );

  chrome.setChildren([header, body]);

  const root = Column(
    {
      flexGrow: 1,
      padding: "1 1",
      background: THEME.shell,
    },
    [chrome],
  );

  function refreshComposerDraft(): void {
    const nextDraft = drafts[activeThreadIndex()] ?? "";
    composerValue(nextDraft);
    composer.setText(nextDraft);
  }

  function selectThread(index: number): void {
    if (index < 0 || index >= THREADS.length) return;
    activeThreadIndex(index);
    pendingScroll = "start";
    refreshComposerDraft();
  }

  function focusThread(index: number): void {
    const row = threadRows[index];
    if (!row) return;
    activePane("threads");
    row.button.focus();
    threadViewport.scrollNodeIntoView(row.button);
  }

  function setPane(next: Pane): void {
    activePane(next);

    if (next === "threads") {
      composer.blur();
      focusThread(activeThreadIndex());
      return;
    }

    composer.focus();
  }

  function moveThread(delta: number): void {
    const next = Math.max(0, Math.min(THREADS.length - 1, activeThreadIndex() + delta));
    focusThread(next);
  }

  function onThreadKeyDown(key: string): boolean {
    if (NEXT_KEYS.has(key)) {
      moveThread(1);
      return true;
    }

    if (PREV_KEYS.has(key)) {
      moveThread(-1);
      return true;
    }

    if (TOGGLE_KEYS.has(key)) {
      setPane("composer");
      return true;
    }

    return false;
  }

  function appendSupplement(section: ThreadSection): void {
    supplements[activeThreadIndex()]!.push(section);
    transcriptVersion(transcriptVersion() + 1);
  }

  function sendDraft(): void {
    const index = activeThreadIndex();
    const current = drafts[index]?.trim() ?? "";
    if (current.length === 0) return;

    appendSupplement({
      label: "USER FOLLOW-UP",
      accent: THEME.cyan,
      body: [{ text: `  ${current}`, foreground: THEME.amber }],
    });
    appendSupplement({
      label: "AGENT RESPONSE",
      accent: THEME.green,
      body: makeSupplementResponse(THREADS[index]!.title, current, supplements[index]!.length),
    });

    drafts[index] = "";
    composerValue("");
    composer.setText("");
    pendingScroll = "end";
    setPane("threads");
  }

  function regenerateReply(): void {
    const index = activeThreadIndex();
    const threadSupplements = supplements[index]!;
    const last = threadSupplements[threadSupplements.length - 1];

    if (!last || last.label !== "AGENT RESPONSE") {
      appendSupplement({
        label: "AGENT RESPONSE",
        accent: THEME.green,
        body: makeSupplementResponse(
          THREADS[index]!.title,
          drafts[index] ?? THREADS[index]!.brief,
          0,
        ),
      });
      pendingScroll = "end";
      return;
    }

    last.body = makeSupplementResponse(
      THREADS[index]!.title,
      drafts[index] || THREADS[index]!.brief,
      threadSupplements.length,
    );
    transcriptVersion(transcriptVersion() + 1);
    pendingScroll = "end";
  }

  threadRows = THREADS.map((thread, index) =>
    createThreadRow(
      thread,
      index,
      (threadIndex) => {
        activePane("threads");
        selectThread(threadIndex);
        const row = threadRows[threadIndex];
        if (row) threadViewport.scrollNodeIntoView(row.button);
      },
      (threadIndex) => {
        selectThread(threadIndex);
        focusThread(threadIndex);
      },
      onThreadKeyDown,
    ),
  );
  threadViewport.setChildren(threadRows.map((row) => row.button));
  refreshComposerDraft();

  ff(() => {
    const index = activeThreadIndex();
    const version = transcriptVersion();
    const pane = activePane();
    const scrollY = transcriptViewport.scrollY();
    const maxScrollY = transcriptViewport.maxScrollY();
    const thread = THREADS[index]!;
    const transcriptKey = `${index}:${version}`;

    if (transcriptKey !== lastTranscriptKey) {
      transcriptViewport.setChildren(buildTranscriptNodes(thread, supplements[index]!));
      lastTranscriptKey = transcriptKey;
    }

    if (pendingScroll === "start") {
      transcriptViewport.scrollToStart();
      pendingScroll = null;
    } else if (pendingScroll === "end" && maxScrollY >= 0) {
      transcriptViewport.scrollToEnd();
      pendingScroll = null;
    }

    meta.setText(
      `active thread ${index + 1}/${THREADS.length}   scroll ${scrollY}/${maxScrollY} lines`,
    );
    threadBadge.setText(` thread ${index + 1}/${THREADS.length} `);
    payloadBadge.setText(` ${thread.payload} `);
    transcriptTitle.setText(`THREAD // ${thread.title.toUpperCase()}`);
    composerHint.setStyle({ foreground: pane === "composer" ? THEME.text : THEME.muted });

    for (const [threadIndex, row] of threadRows.entries()) {
      const isActive = threadIndex === index;
      row.button.setStyle({
        background: isActive ? THEME.selection : THEME.panelAlt,
        border: {
          color: isActive ? THEME.selection : pane === "threads" ? THEME.line : THEME.lineSoft,
          style: "rounded",
        },
      });
      row.title.setText(`${isActive ? "●" : "○"} ${THREADS[threadIndex]!.title}`);
      row.title.setStyle({
        foreground: isActive ? THEME.ink : THEME.text,
      });
      row.summary.setStyle({
        foreground: isActive ? THEME.ink : THEME.dim,
      });
    }

    composer.setStyle({
      background: THEME.panelAlt,
      foreground: THEME.text,
      border: { color: pane === "composer" ? THEME.magenta : THEME.lineSoft, style: "rounded" },
    });
    composerTitle.setStyle({ foreground: pane === "composer" ? THEME.magenta : THEME.cyan });
    threadHint.setStyle({ foreground: pane === "threads" ? THEME.text : THEME.muted });
    composerValue();
  });

  onKey("\x13", sendDraft);
  onKey("\x12", regenerateReply);
  onKey("\x1b", () => setPane("threads"));

  for (const key of TOGGLE_KEYS) {
    onKey(key, () => {
      setPane(activePane() === "threads" ? "composer" : "threads");
    });
  }

  for (const key of NEXT_KEYS) {
    onKey(key, () => {
      if (activePane() === "composer") {
        transcriptViewport.scrollBy(1);
      }
    });
  }

  for (const key of PREV_KEYS) {
    onKey(key, () => {
      if (activePane() === "composer") {
        transcriptViewport.scrollBy(-1);
      }
    });
  }

  const app = run(root, { debug: true, metricsPath: "dump/metrics.txt", appearance: "dark" });

  setPane("threads");
  return app;
}

startAIAgentDemo();
