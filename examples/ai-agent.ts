/**
 * Amp-inspired coding agent: LeTUI renders the UI while Codex app-server runs the agent.
 *
 * Data flow:
 * composer / palette -> Codex JSONL RPC -> streamed turn items -> stable transcript nodes
 *                                \-> SQLite transcript + local thread references
 */

import { Box, Column, Input, ScrollView, Text, $, ff, onKey, run } from "@";
import type { Node, StyledText } from "@";
import { basename, relative } from "node:path";
import { styled } from "./helpers.ts";
import { DialView, dialColor, dialEffortLabel } from "./ai-agent/dial-view.ts";
import {
  createTranscriptEntryView,
  renderTranscriptEntry,
  shortcutRow,
  type TranscriptEntry,
  type TranscriptKind,
  type TranscriptEntryView,
} from "./ai-agent/transcript-view.ts";
import {
  CodexAppServer,
  type CodexAccount,
  type CodexModel,
  type CodexThread,
  type CodexThreadItem,
  type RateLimitSnapshot,
  type RpcMessage,
} from "./ai-agent/codex-client.ts";
import {
  asRateLimit,
  asRecord,
  asThreadItem,
  formatPlan,
  itemToTranscriptEntry,
  stringValue,
  userInputText,
} from "./ai-agent/codex-events.ts";
import {
  ThreadStore,
  type LocalMessage,
  type LocalThread,
  type StoredMessage,
} from "./ai-agent/thread-store.ts";
import { SearchIndex } from "./ai-agent/search-index.ts";
import {
  PickerView,
  emptyOption,
  filteredPickerOptions,
  type PickerOption,
  type PickerState,
} from "./ai-agent/picker-view.ts";
import {
  ACTIVITY_FRAMES,
  DEFAULT_DIAL_EFFORTS,
  LEFT_KEYS,
  NEXT_KEYS,
  PREV_KEYS,
  RIGHT_KEYS,
  THEME,
  logoText,
} from "./ai-agent/theme.ts";

const cwd = process.cwd();
const branch = readGitBranch(cwd);
const displayCwd = abbreviateHome(cwd);
const displayPath = `${displayCwd}${branch ? ` (${branch})` : ""}`;
const fallbackDisplayPath = basename(cwd);
const store = new ThreadStore();
const searchIndex = new SearchIndex(cwd);

let codex: CodexAppServer | null = null;
let account: CodexAccount = null;
let models: CodexModel[] = [];
let selectedModel: CodexModel | null = null;
let selectedEffort = "high";
let rateLimits: RateLimitSnapshot | null = null;
let activeThread: LocalThread | null = null;
let activeTurnId: string | null = null;
let picker: PickerState | null = null;
let mentionSuggestions: MentionSuggestion[] = [];
let mentionIndex = 0;
let mentionKind: "file" | "thread" | null = null;
let stickToBottom = true;
let lastEscapeAt = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let scrollToEndTimer: ReturnType<typeof setTimeout> | null = null;
let animationTimer: ReturnType<typeof setInterval> | null = null;
let logoAnimationTimer: ReturnType<typeof setInterval> | null = null;
let dialAnimationTimer: ReturnType<typeof setInterval> | null = null;
let quitPromptTimer: ReturnType<typeof setTimeout> | null = null;
let dialAnimationFrom = 0;
let dialAnimationTo = 0;
let cleanedUp = false;
let suspendTranscriptSync = false;
let reconciliationMatches: Set<string> | null = null;
let entryRefreshQueued = false;
let composerTopKey = "";
let composerBottomKey = "";

const MENTION_WIDTH = 31;
const MENTION_RESULT_COUNT = 18;

const entries: TranscriptEntry[] = [];
const entryByItem = new Map<string, TranscriptEntry>();
const entryViews = new Map<string, TranscriptEntryView>();
const pendingEntryRefreshes = new Set<TranscriptEntry>();
const queuedPrompts: QueuedPrompt[] = [];

const connectionState = $<"starting" | "ready" | "error">("starting");
const busy = $(false);
const view = $<"main" | "picker" | "help" | "dial">("main");
const transcriptVersion = $(0);
const modelVersion = $(0);
const rateLimitVersion = $(0);
const activeThreadVersion = $(0);
const mentionVersion = $(0);
const pickerVersion = $(0);
const detailsExpanded = $(false);
const animationFrame = $(0);
const logoAnimationFrame = $(0);
const dialAnimationProgress = $(1);
const quitPromptVisible = $(false);
const draft = $("");
const toastValue = $("");

const welcomeLogo = Text({ text: "", width: 50, wrap: "none" });
const welcomeTitle = Text({
  text: "Welcome to Amp",
  foreground: THEME.green,
  wrap: "word",
});
const welcomeHints = Text({
  text: styled([
    { text: "ctrl+o", foreground: THEME.text, bold: true },
    { text: " for commands\n", foreground: THEME.muted },
    { text: "?", foreground: THEME.text, bold: true },
    { text: " for shortcuts", foreground: THEME.muted },
  ]),
  wrap: "word",
});
const welcomeDetails = Column(
  {
    width: 50,
    maxWidth: 50,
    flexShrink: 0,
  },
  [welcomeTitle, Text({ text: "", height: 2 }), welcomeHints],
);
const welcomeStack = Box(
  {
    direction: "column",
    width: 50,
    maxWidth: 50,
    flexGrow: 1,
    minHeight: 0,
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  [welcomeLogo, welcomeDetails],
);
const welcome = Column({ flexGrow: 1, minHeight: 0, alignItems: "center" }, [welcomeStack]);

const transcriptSpacer = Column({ flexGrow: 1, flexShrink: 1, minHeight: 0 }, []);
const transcript = ScrollView(
  {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    gap: 1,
    justifyContent: "start",
    scrollY: 0,
    onScroll: ({ deltaY }) => {
      if (deltaY === 0) return;
      transcript.scrollBy(deltaY * 3);
      stickToBottom =
        deltaY > 0 && transcript.maxScrollY() - transcript.scrollY() <= Math.abs(deltaY * 3) + 2;
    },
  },
  [welcome],
);
const transcriptScrollbar = Text({
  text: "",
  position: "absolute",
  right: 0,
  bottom: 0,
  width: 0,
  flexShrink: 0,
  wrap: "none",
  foreground: THEME.scrollTrack,
});
const dialView = new DialView();

const pickerView = new PickerView();
const body = Column({ flexGrow: 1, minHeight: 0 }, [transcript, transcriptScrollbar]);

const mentionRows = Array.from({ length: MENTION_RESULT_COUNT + 2 }, () =>
  Text({ text: "", height: 0, paddingX: 1, wrap: "none", textOverflow: "ellipsis" }),
);
const mentionBox = Column(
  {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    gap: 0,
    background: THEME.panel,
  },
  mentionRows,
);

const composerActivity = Text({ text: "", height: 0, foreground: THEME.muted });
const composerSteerHint = Text({
  text: "",
  position: "absolute",
  right: 1,
  bottom: 1,
  width: 0,
  height: 1,
  wrap: "none",
  foreground: THEME.blue,
});
const composerTopLine = Text({
  text: "",
  height: 1,
  foreground: THEME.composerLine,
  wrap: "none",
});
const composer = Input({
  placeholder: "",
  minHeight: 3,
  maxHeight: 8,
  paddingX: 1,
  wrap: "word",
  foreground: THEME.text,
  background: THEME.shell,
  borderLeft: { color: THEME.composerLine },
  borderRight: { color: THEME.composerLine },
  onChange: (value) => {
    const previous = draft();
    if (!previous && (value === "?" || value === "/")) {
      draft("");
      composer.setText("");
      setTimeout(value === "?" ? openHelp : openCommandPalette, 0);
      return;
    }
    draft(value);
    refreshMentions(value);
  },
  onSubmit: (value) => void submitComposer(value),
});
const inactiveComposer = Text({
  text: "",
  minHeight: 3,
  maxHeight: 8,
  paddingX: 1,
  wrap: "word",
  foreground: THEME.text,
  background: THEME.shell,
  borderLeft: { color: THEME.composerLine },
  borderRight: { color: THEME.composerLine },
});
const helpSeparator = Text({
  text: "",
  height: 1,
  paddingX: 1,
  foreground: THEME.composerLine,
  wrap: "none",
});
const helpComposer = Column(
  {
    height: 15,
    minHeight: 15,
    maxHeight: 15,
    borderLeft: { color: THEME.composerLine },
    borderRight: { color: THEME.composerLine },
  },
  [
    shortcutRow("Ctrl+O", "command palette", "Ctrl+R", "prompt history"),
    shortcutRow("Ctrl+V", "paste images", "Shift+Enter", "newline"),
    shortcutRow("Ctrl+S", "switch modes", "Opt+D", "toggle reasoning effort"),
    shortcutRow("Ctrl+G", "edit in $EDITOR", "Opt+T", "expand/collapse details"),
    shortcutRow("@ / @@", "mention files/threads", "Tab/Shift+Tab", "navigate messages"),
    shortcutRow("?", "toggle this help"),
    Text({ text: "", height: 1 }),
    Text({ text: "Sidebar", height: 1, paddingX: 1, foreground: THEME.highlight }),
    shortcutRow("Opt+S", "toggle sidebar focus"),
    shortcutRow("Enter", "open selected thread"),
    shortcutRow("Cmd+Shift+E", "archive selected thread"),
    helpSeparator,
    Text({ text: "", height: 1 }),
    Text({ text: "", height: 1 }),
    Text({ text: "", height: 1 }),
  ],
);
const composerBottomLine = Text({
  text: "",
  height: 1,
  foreground: THEME.composerLine,
  wrap: "none",
});
const composerFrame = Column({ flexShrink: 0 }, [composerTopLine, composer, composerBottomLine]);
const toast = Text({
  text: "",
  height: 0,
  marginX: 1,
  paddingX: 1,
  foreground: THEME.text,
  background: THEME.selectionStrong,
  textOverflow: "ellipsis",
});
const pickerOverlay = Column(
  {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  },
  [],
);

const root = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    gap: 0,
    background: THEME.shell,
  },
  [body, toast, composerActivity, composerFrame, composerSteerHint, mentionBox, pickerOverlay],
);

let app: ReturnType<typeof run>;

function appendEntry(entry: TranscriptEntry, persist = false): TranscriptEntry {
  entries.push(entry);
  entryByItem.set(entry.itemId, entry);
  if (persist) persistEntry(entry);
  if (!suspendTranscriptSync) bumpTranscript();
  return entry;
}

function upsertItem(item: CodexThreadItem, turnId: string | null, completed: boolean): void {
  if (item.type === "userMessage") {
    const text = userInputText(item.content);
    const clientId = stringValue(item.clientId);
    const existing = entryByItem.get(item.id) ?? (clientId ? entryByItem.get(clientId) : undefined);
    if (existing) {
      existing.turnId = turnId;
      existing.status = completed ? "completed" : existing.status;
      entryByItem.set(item.id, existing);
      if (completed) persistEntry(existing);
      if (!suspendTranscriptSync) refreshEntry(existing);
    } else if (text) {
      appendEntry(itemToTranscriptEntry(item, turnId, completed), completed);
    }
    return;
  }

  const mapped = itemToTranscriptEntry(item, turnId, completed);
  const identityMatch = entryByItem.get(item.id);
  const semanticMatch = reconciliationMatches
    ? entries.find(
        (entry) => !reconciliationMatches!.has(entry.id) && sameSemanticEntry(entry, mapped),
      )
    : undefined;
  const existing = identityMatch ?? semanticMatch;
  if (existing) {
    entryByItem.set(item.id, existing);
    reconciliationMatches?.add(existing.id);
    existing.role = mapped.role;
    existing.kind = mapped.kind;
    existing.text = mapped.text || existing.text;
    existing.detail = mapped.detail || existing.detail;
    existing.status = mapped.status;
    existing.turnId = turnId;
    if (completed) persistEntry(existing);
    if (!suspendTranscriptSync) refreshEntry(existing);
    return;
  }

  appendEntry(mapped, completed);
}

function updateDelta(itemId: string, delta: string, target: "text" | "detail"): void {
  const entry = entryByItem.get(itemId);
  if (!entry) return;
  entry[target] = trimStream(`${entry[target]}${delta}`, target === "detail" ? 30_000 : 80_000);
  refreshEntry(entry);
}

function refreshEntry(entry: TranscriptEntry): void {
  if (!entryViews.has(entry.id)) {
    bumpTranscript();
    return;
  }
  pendingEntryRefreshes.add(entry);
  if (entryRefreshQueued) return;
  entryRefreshQueued = true;
  queueMicrotask(flushEntryRefreshes);
}

function syncTranscript(): void {
  if (entries.length === 0) {
    transcript.setChildren([welcome]);
    return;
  }

  const expanded = detailsExpanded();
  const nodes = entries.map((entry) => {
    let entryView = entryViews.get(entry.id);
    if (!entryView) {
      entryView = createTranscriptEntryView();
      entryViews.set(entry.id, entryView);
    }

    renderTranscriptEntry(entry, entryView, expanded, 0, transcript.frameWidth());
    return entryView;
  });
  transcript.setChildren([transcriptSpacer, ...nodes.map((entryView) => entryView.container)]);

  scheduleScrollToEnd();
}

function flushEntryRefreshes(): void {
  entryRefreshQueued = false;
  if (cleanedUp) {
    pendingEntryRefreshes.clear();
    return;
  }

  const expanded = detailsExpanded();
  const frame = animationFrame();
  const width = transcript.frameWidth();
  for (const entry of pendingEntryRefreshes) {
    const entryView = entryViews.get(entry.id);
    if (entryView) renderTranscriptEntry(entry, entryView, expanded, frame, width);
  }
  pendingEntryRefreshes.clear();
  scheduleScrollToEnd();
}

function scheduleScrollToEnd(): void {
  if (!stickToBottom || scrollToEndTimer) return;
  scrollToEndTimer = setTimeout(() => {
    scrollToEndTimer = null;
    if (stickToBottom) transcript.scrollToEnd();
  }, 0);
}

function renderTranscriptScrollbar(): void {
  const viewportHeight = Math.max(0, Math.floor(transcript.viewportHeight()));
  const contentHeight = Math.max(0, Math.ceil(transcript.contentHeight()));
  const maxScroll = transcript.maxScrollY();
  if (viewportHeight === 0 || contentHeight <= viewportHeight) {
    transcript.setStyle({ width: undefined });
    transcriptScrollbar.setText("");
    transcriptScrollbar.setStyle({ width: 0, height: 0 });
    return;
  }

  transcript.setStyle({ width: Math.max(0, body.frameWidth() - 1) });
  if (stickToBottom && transcript.scrollY() !== maxScroll) {
    transcript.scrollToEnd();
    return;
  }

  const thumbHeight = clamp(
    Math.round((viewportHeight * viewportHeight) / contentHeight),
    1,
    viewportHeight,
  );
  const travel = viewportHeight - thumbHeight;
  const thumbStart = maxScroll > 0 ? Math.round((transcript.scrollY() / maxScroll) * travel) : 0;
  transcriptScrollbar.setText(
    styled(
      Array.from({ length: viewportHeight }, (_, index) => ({
        text: `█${index < viewportHeight - 1 ? "\n" : ""}`,
        foreground:
          index >= thumbStart && index < thumbStart + thumbHeight
            ? THEME.scrollThumb
            : THEME.scrollTrack,
      })),
    ),
  );
  transcriptScrollbar.setStyle({ width: 1, height: viewportHeight });
}

async function submitComposer(rawValue: string): Promise<void> {
  if (mentionSuggestions.length > 0) {
    acceptMention();
    return;
  }

  const prompt = rawValue.trim();
  if (busy()) {
    const queued = queuedPrompts.at(-1);
    if (prompt && queued) {
      queued.text = prompt;
      queued.entry.text = prompt;
      await steerLatestQueuedPrompt();
      return;
    }
    if (!prompt) return;

    const entry = createLocalEntry(
      "user",
      "user",
      prompt,
      "queued",
      `queued-${crypto.randomUUID()}`,
    );
    queuedPrompts.push({ text: prompt, entry });
    return;
  }

  if (!prompt) return;
  clearComposer();
  await sendPrompt(prompt);
}

async function sendPrompt(prompt: string, queuedEntry?: TranscriptEntry): Promise<void> {
  if (!codex || connectionState() !== "ready") {
    showToast("Codex is still starting");
    restoreComposer(prompt);
    return;
  }
  if (account?.type !== "chatgpt") {
    showToast("Sign in with ChatGPT from Ctrl+O to use your Codex subscription");
    restoreComposer(prompt);
    return;
  }

  let submitted = false;
  try {
    await ensureActiveThread(prompt);
    if (!activeThread || !selectedModel) return;

    const userEntry = queuedEntry ?? createLocalEntry("user", "user", prompt, "completed");
    userEntry.status = "completed";
    if (!entries.includes(userEntry)) appendEntry(userEntry);
    persistEntry(userEntry);
    submitted = true;

    const references = referencedThreadIds(prompt);
    const context = store.referenceContext(references, activeThread.id);
    busy(true);
    activeTurnId = null;
    bumpTranscript();

    const response = await codex.request<{ turn: { id: string } }>("turn/start", {
      threadId: activeThread.codexThreadId,
      clientUserMessageId: userEntry.itemId,
      input: [{ type: "text", text: `${prompt}${context}` }],
      model: selectedModel.id,
      effort: selectedEffort,
    });
    activeTurnId = response.turn.id;
  } catch (error) {
    busy(false);
    if (!submitted) restoreComposer(prompt);
    appendError(errorMessage(error));
  }
}

async function ensureActiveThread(firstPrompt: string): Promise<void> {
  if (activeThread || !codex || !selectedModel) return;
  const response = await codex.request<{
    thread: CodexThread;
    model: string;
    reasoningEffort: string | null;
  }>("thread/start", {
    cwd,
    model: selectedModel.id,
    approvalPolicy: "never",
    sandbox: "workspace-write",
    config: { model_reasoning_effort: selectedEffort },
    ephemeral: false,
  });

  activeThread = store.createThread({
    codexThreadId: response.thread.id,
    cwd,
    model: response.model,
    effort: response.reasoningEffort ?? selectedEffort,
  });
  const title = threadTitle(firstPrompt);
  store.updateThread(activeThread.id, { title });
  activeThread = { ...activeThread, title };
  void indexThreads().catch(reportSearchError);
  activeThreadVersion(activeThreadVersion() + 1);
  void codex
    .request("thread/name/set", { threadId: response.thread.id, name: title })
    .catch(() => {});
}

async function steerLatestQueuedPrompt(): Promise<void> {
  if (!codex || !activeThread || !activeTurnId) return;
  const queued = queuedPrompts.pop();
  if (!queued) return;

  try {
    await codex.request("turn/steer", {
      threadId: activeThread.codexThreadId,
      expectedTurnId: activeTurnId,
      clientUserMessageId: queued.entry.itemId,
      input: [{ type: "text", text: queued.text }],
    });
    queued.entry.status = "completed";
    if (!entries.includes(queued.entry)) appendEntry(queued.entry);
    persistEntry(queued.entry);
    bumpTranscript();
    clearComposer();
  } catch (error) {
    queuedPrompts.push(queued);
    showToast(errorMessage(error));
  }
}

async function drainQueue(): Promise<void> {
  if (busy()) return;
  const next = queuedPrompts.shift();
  if (!next) return;
  if (draft().trim() === next.text) clearComposer();
  await sendPrompt(next.text, next.entry);
}

function dialEfforts(): CodexModel["supportedReasoningEfforts"] {
  const efforts = selectedModel?.supportedReasoningEfforts ?? DEFAULT_DIAL_EFFORTS;
  if (efforts.length <= 4) return efforts;
  const withoutMinimal = efforts.filter((effort) => effort.reasoningEffort !== "minimal");
  return (withoutMinimal.length >= 4 ? withoutMinimal : efforts).slice(0, 4);
}

function handleNotification(message: RpcMessage): void {
  const method = message.method ?? "";
  const params = message.params ?? {};

  if (method === "account/login/completed") {
    if (params.success === true) {
      showToast("Signed in with ChatGPT");
      void refreshAccountAndLimits();
    } else {
      showToast(stringValue(params.error) || "ChatGPT sign-in failed");
    }
    return;
  }
  if (method === "account/updated") {
    void refreshAccountAndLimits();
    return;
  }
  if (method === "account/rateLimits/updated") {
    rateLimits = asRateLimit(params.rateLimits) ?? rateLimits;
    rateLimitVersion(rateLimitVersion() + 1);
    return;
  }

  const eventThreadId = stringValue(params.threadId);
  if (eventThreadId && eventThreadId !== activeThread?.codexThreadId) return;

  switch (method) {
    case "turn/started": {
      const turn = asRecord(params.turn);
      activeTurnId = stringValue(turn.id) || activeTurnId;
      busy(true);
      break;
    }
    case "item/started": {
      const item = asThreadItem(params.item);
      if (item) upsertItem(item, stringValue(params.turnId) || activeTurnId, false);
      break;
    }
    case "item/agentMessage/delta":
      updateDelta(stringValue(params.itemId), stringValue(params.delta), "text");
      break;
    case "item/reasoning/summaryTextDelta":
      updateDelta(stringValue(params.itemId), stringValue(params.delta), "text");
      break;
    case "item/reasoning/textDelta":
      updateDelta(stringValue(params.itemId), stringValue(params.delta), "detail");
      break;
    case "item/commandExecution/outputDelta":
    case "item/fileChange/outputDelta":
    case "item/fileChange/patchUpdated":
      updateDelta(stringValue(params.itemId), stringValue(params.delta ?? params.patch), "detail");
      break;
    case "item/completed": {
      const item = asThreadItem(params.item);
      if (item) upsertItem(item, stringValue(params.turnId) || activeTurnId, true);
      break;
    }
    case "turn/plan/updated": {
      const text = stringValue(params.explanation) || formatPlan(params.plan);
      const id = `plan-${stringValue(params.turnId) || activeTurnId}`;
      const existing = entryByItem.get(id);
      if (existing) {
        existing.text = text;
        refreshEntry(existing);
      } else if (text) {
        appendEntry(createLocalEntry("assistant", "plan", text, "running", id));
      }
      break;
    }
    case "thread/compacted":
      appendEntry(
        createLocalEntry("system", "status", "Compacted thread context", "completed"),
        true,
      );
      break;
    case "warning":
    case "guardianWarning":
      appendEntry(
        createLocalEntry(
          "system",
          "status",
          stringValue(params.message) || "Codex warning",
          "completed",
        ),
        true,
      );
      break;
    case "error":
      appendError(
        stringValue(asRecord(params.error).message) || stringValue(params.message) || "Codex error",
      );
      break;
    case "turn/completed": {
      const turn = asRecord(params.turn);
      const status = stringValue(turn.status);
      for (const entry of entries) {
        if (entry.turnId === stringValue(turn.id) && entry.status === "running") {
          entry.status =
            status === "completed"
              ? "completed"
              : status === "interrupted"
                ? "interrupted"
                : "failed";
          persistEntry(entry);
        }
      }
      if (status === "failed") {
        appendError(stringValue(asRecord(turn.error).message) || "Turn failed");
      } else if (status === "interrupted") {
        appendEntry(createLocalEntry("system", "status", "Turn interrupted", "interrupted"), true);
      }
      activeTurnId = null;
      busy(false);
      bumpTranscript();
      void refreshRateLimits();
      void drainQueue();
      break;
    }
  }
}

function handleServerRequest(message: RpcMessage): void {
  if (!codex || message.id === undefined) return;
  const method = message.method ?? "";
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  ) {
    codex.respond(message.id, { decision: "decline" });
    appendError(
      "Codex unexpectedly requested approval; the LeTUI agent runs workspace tools with approvalPolicy=never",
    );
    return;
  }
  if (method === "item/tool/requestUserInput") {
    codex.respond(message.id, { answers: {} });
    return;
  }
  codex.reject(message.id, -32601, `Unsupported Codex server request: ${method}`);
}

async function initializeAgent(): Promise<void> {
  try {
    codex = await CodexAppServer.connect({ cwd });
    codex.onNotification(handleNotification);
    codex.onServerRequest(handleServerRequest);
    codex.onStderr((line) => {
      if (/\b(error|failed)\b/i.test(line)) showToast("Codex app-server reported an error");
    });

    const [accountResult, modelResult, rateResult] = await Promise.all([
      codex.request<{ account: CodexAccount }>("account/read", { refreshToken: false }),
      codex.request<{ data: CodexModel[] }>("model/list", { includeHidden: false }),
      codex.request<RateLimitResponse>("account/rateLimits/read"),
    ]);
    account = accountResult.account;
    models = modelResult.data;
    selectInitialModel();
    rateLimits = selectFiveHourSnapshot(rateResult);
    connectionState("ready");
    modelVersion(modelVersion() + 1);
    rateLimitVersion(rateLimitVersion() + 1);
  } catch (error) {
    connectionState("error");
    appendError(errorMessage(error));
  }

  if (picker?.title === "Command Palette") {
    picker.options = commandPaletteOptions();
    picker.search = undefined;
    void preparePickerSearch(picker);
    pickerVersion(pickerVersion() + 1);
  }
}

async function refreshAccountAndLimits(): Promise<void> {
  if (!codex) return;
  try {
    const result = await codex.request<{ account: CodexAccount }>("account/read", {
      refreshToken: false,
    });
    account = result.account;
    await refreshRateLimits();
  } catch (error) {
    showToast(errorMessage(error));
  }
}

async function refreshRateLimits(): Promise<void> {
  if (!codex || account?.type !== "chatgpt") return;
  try {
    rateLimits = selectFiveHourSnapshot(
      await codex.request<RateLimitResponse>("account/rateLimits/read"),
    );
    rateLimitVersion(rateLimitVersion() + 1);
  } catch {}
}

async function loginWithChatGPT(): Promise<void> {
  if (!codex) return;
  try {
    const result = await codex.request<Record<string, unknown>>("account/login/start", {
      type: "chatgpt",
    });
    const authUrl = stringValue(result.authUrl);
    if (!authUrl) throw new Error("Codex did not return a ChatGPT sign-in URL");
    openExternal(authUrl);
    showToast("Complete ChatGPT sign-in in your browser");
  } catch (error) {
    showToast(errorMessage(error));
  }
}

async function logout(): Promise<void> {
  if (!codex) return;
  try {
    await codex.request("account/logout");
    account = null;
    rateLimits = null;
    rateLimitVersion(rateLimitVersion() + 1);
    showToast("Signed out");
  } catch (error) {
    showToast(errorMessage(error));
  }
}

function commandPaletteOptions(): PickerOption[] {
  const ready = connectionState() === "ready";
  const unavailableDescription =
    connectionState() === "starting" ? "Codex is still starting" : "Codex failed to start";
  const signedInAccount = account?.type === "chatgpt" ? account : null;
  const signedIn = signedInAccount !== null;
  return [
    { category: "thread", title: "new", description: "Start a fresh local thread", run: newThread },
    {
      category: "thread",
      title: "switch",
      description: ready
        ? `${store.listThreads().length} local SQLite threads`
        : unavailableDescription,
      enabled: ready,
      run: openThreadPicker,
    },
    {
      category: "thread",
      title: "reference previous",
      description: "Insert a local thread reference into the composer",
      run: openReferencePicker,
    },
    {
      category: "thread",
      title: "archive",
      description: !ready
        ? unavailableDescription
        : activeThread
          ? activeThread.title
          : "No active thread",
      enabled: ready && activeThread !== null,
      run: archiveActiveThread,
    },
    {
      category: "model",
      title: "select",
      description: ready
        ? (selectedModel?.displayName ?? "No models available")
        : unavailableDescription,
      enabled: ready && models.length > 0,
      run: openModelPicker,
    },
    {
      category: "model",
      title: "the dial",
      description: ready ? selectedEffort : unavailableDescription,
      enabled: ready && selectedModel !== null,
      run: openDial,
      shortcut: "Ctrl+S",
    },
    {
      category: "view",
      title: detailsExpanded() ? "collapse tool details" : "expand tool details",
      description: "Show reasoning and tool output in the transcript",
      shortcut: "Alt+T",
      run: toggleDetails,
    },
    {
      category: "thread",
      title: "prompt history",
      description: "Reuse a previous prompt",
      shortcut: "Ctrl+R",
      run: openPromptHistory,
    },
    {
      category: "account",
      title: signedIn ? "sign out" : "sign in with ChatGPT",
      description: signedInAccount
        ? `${signedInAccount.email} · ${signedInAccount.planType}`
        : ready
          ? "Use a Codex/ChatGPT subscription"
          : unavailableDescription,
      enabled: ready,
      run: signedIn ? logout : loginWithChatGPT,
    },
    {
      category: "account",
      title: "refresh 5h limit",
      description: !ready
        ? unavailableDescription
        : signedIn
          ? formatRateLimit(rateLimits)
          : "Sign in with ChatGPT first",
      enabled: ready && signedIn,
      run: refreshRateLimits,
    },
    {
      category: "account",
      title: "subscription status",
      description: !ready
        ? unavailableDescription
        : signedInAccount
          ? `${signedInAccount.planType} · ${formatRateLimit(rateLimits)}`
          : "Not signed in",
      enabled: ready,
      run: () => showToast(signedIn ? formatRateLimit(rateLimits) : "Not signed in"),
    },
    {
      category: "amp",
      title: "show welcome",
      description: "Return to the welcome screen",
      run: newThread,
    },
    {
      category: "amp",
      title: "show version",
      description: "LeTUI agent clone using Codex app-server",
      run: () => showToast("LeTUI Agent · Codex app-server"),
    },
    {
      category: "amp",
      title: "help",
      description: "Keyboard map and supported features",
      run: openHelp,
    },
    {
      category: "amp",
      title: "quit",
      description: "Close LeTUI Agent",
      shortcut: "Ctrl+C Ctrl+C",
      run: () => app.quit(),
    },
  ];
}

function openCommandPalette(): void {
  openPicker("Command Palette", commandPaletteOptions());
}

function openThreadPicker(): void {
  const threads = store.listThreads();
  openPicker(
    "Switch Thread",
    threads.length > 0
      ? threads.map((thread) => ({
          category: relativeTime(thread.updatedAt),
          title: thread.title,
          description: `${abbreviateHome(thread.cwd)} · ${shortId(thread.id)}`,
          preview: (width: number) => threadPreview(thread, width),
          run: () => resumeThread(thread),
        }))
      : [emptyOption("No local threads yet", "Send a message to create one")],
    "split",
  );
}

function threadPreview(thread: LocalThread, width: number): Node[] {
  const messages = store.listMessages(thread.id);
  const seen = new Set<string>();
  const nodes = messages
    .filter((message) => {
      const fingerprint = `${message.turnId}\0${message.role}\0${message.kind}\0${message.text}`;
      if (message.itemId.startsWith("item-") && seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    })
    .map((message) => {
      const entry = { ...message, kind: message.kind as TranscriptKind };
      const entryView = createTranscriptEntryView();
      renderTranscriptEntry(entry, entryView, false, 0, width);
      return entryView.container;
    });
  return nodes.length > 0 ? nodes : [Text({ text: "No transcript yet", foreground: THEME.muted })];
}

function openReferencePicker(): void {
  openMentionThreadPicker();
}

function openMentionThreadPicker(): void {
  const threads = store.listThreads().filter((thread) => thread.id !== activeThread?.id);
  openPicker(
    "Mention Thread",
    threads.length > 0
      ? threads.map((thread) => ({
          category: relativeTime(thread.updatedAt),
          title: thread.title,
          description: `${shortId(thread.id)} · inserted as @${thread.id}`,
          preview: (width: number) => threadPreview(thread, width),
          run: () => insertThreadMention(thread),
        }))
      : [emptyOption("No other local threads", "Create another thread first")],
    "split",
  );
}

function insertThreadMention(thread: LocalThread): void {
  restoreComposer(`${draft().replace(/@@[^\s@]*$/, `@${thread.id}`)} `);
}

function openModelPicker(): void {
  openPicker(
    "Select Model",
    models.map((model) => ({
      category: model.isDefault ? "default" : "model",
      title: model.displayName,
      description: model.description,
      run: () => selectModel(model),
    })),
  );
}

function openPromptHistory(): void {
  const storedPrompts = store
    .listThreads()
    .flatMap((thread) => store.listMessages(thread.id))
    .filter((message) => message.role === "user" && message.status !== "queued");
  const prompts = [
    ...entries.filter((entry) => entry.role === "user" && entry.status !== "queued"),
    ...storedPrompts,
  ]
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .filter(
      (entry, index, all) => all.findIndex((candidate) => candidate.text === entry.text) === index,
    );
  openPicker(
    "Prompt History",
    prompts.length > 0
      ? prompts.map((entry) => ({
          category: "",
          title: firstLine(entry.text),
          description: entry.text.replaceAll("\n", " "),
          run: () => restoreComposer(entry.text),
        }))
      : [emptyOption("No prompt history", "Send a message first")],
    "wide",
  );
}

function openHelp(): void {
  if (view() === "help") {
    closeHelp();
    return;
  }
  picker = null;
  view("help");
  pickerVersion(pickerVersion() + 1);
  composer.blur();
}

function closeHelp(): void {
  view("main");
  setTimeout(() => composer.focus(), 0);
}

function openDial(): void {
  if (view() === "dial") {
    moveDial(1);
    return;
  }
  const efforts = dialEfforts();
  if (efforts.length === 0) {
    showToast("The selected model has no reasoning effort controls");
    return;
  }
  const selectedIndex = Math.max(
    0,
    efforts.findIndex((effort) => effort.reasoningEffort === selectedEffort),
  );
  const position = efforts.length === 1 ? 1 : selectedIndex / (efforts.length - 1);
  picker = null;
  startDialAnimation(position, position);
  view("dial");
  pickerVersion(pickerVersion() + 1);
  composer.blur();
}

function closeDial(): void {
  if (dialAnimationTimer) clearInterval(dialAnimationTimer);
  dialAnimationTimer = null;
  view("main");
  setTimeout(() => composer.focus(), 0);
}

function moveDial(delta: number): void {
  const efforts = dialEfforts();
  if (efforts.length === 0) return;
  const current = Math.max(
    0,
    efforts.findIndex((effort) => effort.reasoningEffort === selectedEffort),
  );
  const next = (current + delta + efforts.length) % efforts.length;
  const nextPosition = efforts.length === 1 ? 1 : next / (efforts.length - 1);
  startDialAnimation(currentDialPosition(), nextPosition);
  setEffort(efforts[next]!.reasoningEffort, false);
}

function currentDialPosition(): number {
  const progress = dialAnimationProgress();
  const easedProgress = 1 - Math.pow(1 - progress, 3);
  return dialAnimationFrom + (dialAnimationTo - dialAnimationFrom) * easedProgress;
}

function startDialAnimation(from: number, to: number): void {
  if (dialAnimationTimer) clearInterval(dialAnimationTimer);
  dialAnimationTimer = null;
  dialAnimationFrom = from;
  dialAnimationTo = to;
  if (from === to) {
    dialAnimationProgress(1);
    return;
  }
  const startedAt = performance.now();
  dialAnimationProgress(0);
  dialAnimationTimer = setInterval(() => {
    const progress = clamp((performance.now() - startedAt - 24) / 300, 0, 1);
    dialAnimationProgress(progress);
    if (progress < 1) return;
    if (dialAnimationTimer) clearInterval(dialAnimationTimer);
    dialAnimationTimer = null;
  }, 16);
}

function openPicker(
  title: string,
  options: PickerOption[],
  layout: PickerState["layout"] = "list",
): void {
  const state: PickerState = { title, options, query: "", selectedIndex: 0, layout };
  picker = state;
  view("picker");
  pickerVersion(pickerVersion() + 1);
  hideMentions();
  composer.blur();
  void preparePickerSearch(state);
}

async function preparePickerSearch(state: PickerState): Promise<void> {
  const options = state.options;
  try {
    await searchIndex.index(
      "picker",
      options.map((option) => ({
        value: option,
        text: `${option.category} ${option.title} ${option.description}`,
      })),
    );
  } catch (error) {
    if (picker === state) reportSearchError(error);
    return;
  }
  if (picker !== state || state.options !== options) return;
  state.search = (query) => searchIndex.search("picker", query, options.length);
  pickerVersion(pickerVersion() + 1);
}

function closePicker(): void {
  picker = null;
  void searchIndex.clear("picker").catch(reportSearchError);
  view("main");
  pickerVersion(pickerVersion() + 1);
  setTimeout(() => {
    if (view() === "main") composer.focus();
  }, 0);
}

function renderPicker(): void {
  if (!picker) return;
  const overlay = usesPickerOverlay();
  pickerView.render(
    picker,
    {
      width: overlay ? root.frameWidth() : body.frameWidth(),
      height: overlay ? root.frameHeight() : body.frameHeight(),
      decorateEmptyState: entries.length === 0,
    },
    runPickerOption,
    handlePickerKey,
  );
}

function usesPickerOverlay(): boolean {
  return (
    picker?.layout === "split" &&
    Math.floor(root.frameWidth()) >= 90 &&
    Math.floor(root.frameHeight()) >= 26
  );
}

function handlePickerKey(key: string): boolean {
  if (!picker) return false;
  if (NEXT_KEYS.has(key)) {
    movePicker(1);
    return true;
  }
  if (PREV_KEYS.has(key)) {
    movePicker(-1);
    return true;
  }
  if (key === "\x08" || key === "\x7f") {
    picker.query = Array.from(picker.query).slice(0, -1).join("");
    picker.selectedIndex = 0;
    pickerVersion(pickerVersion() + 1);
    return true;
  }
  if (key.length === 1 && key >= "!" && key <= "~") {
    picker.query += key;
    picker.selectedIndex = 0;
    pickerVersion(pickerVersion() + 1);
    return true;
  }
  return false;
}

function movePicker(delta: number): void {
  if (!picker) return;
  const count = filteredPickerOptions(picker).length;
  picker.selectedIndex = clamp(picker.selectedIndex + delta, 0, Math.max(0, count - 1));
  pickerVersion(pickerVersion() + 1);
}

function runPickerOption(option: PickerOption): void {
  if (option.enabled === false) {
    showToast(option.description);
    return;
  }
  closePicker();
  void Promise.resolve(option.run()).catch((error) => showToast(errorMessage(error)));
}

function refreshMentions(value: string): void {
  const threadMatch = value.match(/(?:^|\s)@@([^\s@]*)$/);
  const fileMatch = !threadMatch ? value.match(/(?:^|\s)@([^\s@]*)$/) : null;
  if (!threadMatch && !fileMatch) {
    hideMentions();
    return;
  }

  const query = (threadMatch?.[1] ?? fileMatch?.[1] ?? "").toLowerCase();
  if (threadMatch && query.length === 0) {
    hideMentions();
    setTimeout(() => {
      if (view() === "main" && /(?:^|\s)@@$/.test(draft())) openMentionThreadPicker();
    }, 0);
    return;
  }
  mentionKind = threadMatch ? "thread" : "file";
  mentionSuggestions =
    mentionKind === "thread"
      ? (query ? searchIndex.search<LocalThread>("threads", query, 10) : store.listThreads())
          .filter((thread) => thread.id !== activeThread?.id)
          .slice(0, MENTION_RESULT_COUNT)
          .map((thread) => ({
            label: thread.title,
            detail: shortId(thread.id),
            insert: `@${thread.id}`,
            kind: "thread" as const,
          }))
      : [
          ...searchIndex.searchPaths(query, MENTION_RESULT_COUNT).map(({ path, kind }) => ({
            label: path,
            detail: "",
            insert: `@${path}`,
            kind,
          })),
          {
            label: "@: mention a commit",
            detail: "",
            insert: "@:",
            kind: "action" as const,
          },
          {
            label: "@@ mention a thread",
            detail: "",
            insert: "@@",
            kind: "action" as const,
          },
        ];
  mentionIndex = clamp(mentionIndex, 0, Math.max(0, mentionSuggestions.length - 1));
  mentionVersion(mentionVersion() + 1);
}

function renderMentions(): void {
  if (!mentionKind || mentionSuggestions.length === 0) {
    mentionBox.setStyle({ right: 0, bottom: 0, width: 0, height: 0, border: undefined });
    for (const row of mentionRows) {
      row.setText("");
      row.setStyle({ height: 0 });
    }
    return;
  }

  const bottom =
    Math.floor(composerFrame.frameHeight()) +
    Math.floor(composerActivity.frameHeight()) +
    Math.floor(toast.frameHeight()) -
    1;
  mentionBox.setStyle({
    right: Math.max(0, Math.floor(root.frameWidth()) - MENTION_WIDTH - 2),
    bottom: Math.max(0, bottom),
    width: MENTION_WIDTH,
    height: mentionSuggestions.length + 2,
    border: { color: THEME.line, style: "rounded" },
  });
  for (const [index, row] of mentionRows.entries()) {
    const suggestion = mentionSuggestions[index];
    row.setText(suggestion ? mentionSuggestionText(suggestion, index === mentionIndex) : "");
    row.setStyle({
      height: suggestion ? 1 : 0,
      foreground: THEME.text,
      background: THEME.panel,
    });
  }
}

function mentionSuggestionText(suggestion: MentionSuggestion, selected: boolean): StyledText {
  const selection = selected ? THEME.mentionSelection : undefined;
  if (suggestion.kind === "action") {
    return styled([
      { text: suggestion.label, foreground: THEME.mentionAction, background: selection },
    ]);
  }
  const prefix = mentionKind === "thread" ? "@@" : "@";
  return styled([
    { text: prefix, foreground: THEME.mentionAt, background: selection },
    { text: suggestion.label, foreground: THEME.text, background: selection },
    ...(suggestion.detail
      ? [
          {
            text: `  ${suggestion.detail}`,
            foreground: THEME.muted,
            background: selection,
          },
        ]
      : []),
  ]);
}

function acceptMention(): void {
  const suggestion = mentionSuggestions[mentionIndex];
  if (!suggestion) return;
  const matcher = mentionKind === "thread" ? /@@[^\s@]*$/ : /@[^\s@]*$/;
  if (suggestion.kind === "action" && suggestion.insert === "@@") {
    restoreComposer(draft().replace(matcher, suggestion.insert));
    return;
  }
  const next = `${draft().replace(matcher, suggestion.insert)} `;
  restoreComposer(next);
  hideMentions();
}

function hideMentions(): void {
  if (mentionSuggestions.length === 0 && mentionKind === null) return;
  mentionSuggestions = [];
  mentionKind = null;
  mentionIndex = 0;
  mentionVersion(mentionVersion() + 1);
}

async function newThread(): Promise<void> {
  if (busy()) {
    showToast("Interrupt or finish the active turn before starting a new thread");
    return;
  }
  if (codex && activeThread) {
    void codex
      .request("thread/unsubscribe", { threadId: activeThread.codexThreadId })
      .catch(() => {});
  }
  activeThread = null;
  activeTurnId = null;
  entries.length = 0;
  queuedPrompts.length = 0;
  entryByItem.clear();
  entryViews.clear();
  activeThreadVersion(activeThreadVersion() + 1);
  bumpTranscript(false);
}

async function resumeThread(thread: LocalThread): Promise<void> {
  if (!codex || busy()) {
    showToast(busy() ? "Finish the active turn before switching threads" : "Codex is not ready");
    return;
  }
  try {
    const response = await codex.request<{
      thread: CodexThread;
      model: string;
      reasoningEffort: string | null;
    }>("thread/resume", { threadId: thread.codexThreadId });
    activeThread = thread;
    entries.length = 0;
    entryByItem.clear();
    entryViews.clear();
    for (const message of store.listMessages(thread.id)) loadStoredMessage(message);
    loadCodexHistory(response.thread);
    const matchingModel = models.find(
      (model) => model.id === thread.model || model.id === response.model,
    );
    if (matchingModel) selectedModel = matchingModel;
    selectedEffort = response.reasoningEffort ?? thread.effort;
    activeThreadVersion(activeThreadVersion() + 1);
    modelVersion(modelVersion() + 1);
    stickToBottom = true;
    bumpTranscript();
  } catch (error) {
    showToast(`Could not resume thread: ${errorMessage(error)}`);
  }
}

async function archiveActiveThread(): Promise<void> {
  if (!activeThread || !codex) return;
  if (busy()) {
    showToast("Finish or interrupt the active turn before archiving");
    return;
  }
  try {
    await codex.request("thread/archive", { threadId: activeThread.codexThreadId });
    store.archiveThread(activeThread.id);
    void indexThreads().catch(reportSearchError);
    await newThread();
    showToast("Thread archived locally");
  } catch (error) {
    showToast(errorMessage(error));
  }
}

function loadCodexHistory(thread: CodexThread): void {
  suspendTranscriptSync = true;
  reconciliationMatches = new Set();
  try {
    for (const turn of thread.turns) {
      for (const item of turn.items) upsertItem(item, turn.id, true);
    }
  } finally {
    suspendTranscriptSync = false;
    reconciliationMatches = null;
  }
}

function loadStoredMessage(message: LocalMessage): void {
  const entry: TranscriptEntry = { ...message, kind: message.kind as TranscriptKind };
  const duplicate = entries.find((candidate) => sameSemanticEntry(candidate, entry));
  if (duplicate && message.itemId.startsWith("item-")) {
    entryByItem.set(message.itemId, duplicate);
    return;
  }
  entries.push(entry);
  entryByItem.set(entry.itemId, entry);
}

function selectInitialModel(): void {
  const savedModel = store.getSetting("model");
  selectedModel =
    models.find((model) => model.id === savedModel) ??
    models.find((model) => model.isDefault) ??
    models[0] ??
    null;
  if (!selectedModel) return;
  const efforts = selectedModel.supportedReasoningEfforts.map((option) => option.reasoningEffort);
  const savedEffort = store.getSetting("effort");
  selectedEffort =
    savedEffort && efforts.includes(savedEffort)
      ? savedEffort
      : efforts.includes("high")
        ? "high"
        : selectedModel.defaultReasoningEffort;
}

function selectModel(model: CodexModel): void {
  selectedModel = model;
  const efforts = model.supportedReasoningEfforts.map((option) => option.reasoningEffort);
  if (!efforts.includes(selectedEffort)) selectedEffort = model.defaultReasoningEffort;
  store.setSetting("model", model.id);
  store.setSetting("effort", selectedEffort);
  if (activeThread)
    store.updateThread(activeThread.id, { model: model.id, effort: selectedEffort });
  modelVersion(modelVersion() + 1);
  showToast(`${model.displayName} · ${selectedEffort}`);
}

function setEffort(effort: string, notify = true): void {
  selectedEffort = effort;
  store.setSetting("effort", effort);
  if (activeThread) store.updateThread(activeThread.id, { effort });
  modelVersion(modelVersion() + 1);
  if (notify) showToast(`Reasoning effort: ${effort}`);
}

function toggleDetails(): void {
  detailsExpanded(!detailsExpanded());
  showToast(
    detailsExpanded()
      ? "Thinking and tool details expanded"
      : "Thinking and tool details collapsed",
  );
}

async function interruptTurn(): Promise<void> {
  if (!codex || !activeThread || !activeTurnId) return;
  try {
    await codex.request("turn/interrupt", {
      threadId: activeThread.codexThreadId,
      turnId: activeTurnId,
    });
    showToast("Interrupting after the current step…");
  } catch (error) {
    showToast(errorMessage(error));
  }
}

function bumpTranscript(autoScroll = true): void {
  if (autoScroll && entries.length > 0 && transcript.maxScrollY() - transcript.scrollY() <= 3) {
    stickToBottom = true;
  }
  transcriptVersion(transcriptVersion() + 1);
}

function persistEntry(entry: TranscriptEntry): void {
  if (!activeThread || entry.status === "queued") return;
  const message: StoredMessage = { ...entry };
  store.saveMessage(activeThread.id, message);
}

function appendError(message: string): void {
  appendEntry(createLocalEntry("system", "error", message, "failed"), activeThread !== null);
}

function createLocalEntry(
  role: TranscriptEntry["role"],
  kind: TranscriptEntry["kind"],
  text: string,
  status: TranscriptEntry["status"],
  itemId = `local-${crypto.randomUUID()}`,
): TranscriptEntry {
  return {
    id: itemId,
    itemId,
    turnId: activeTurnId,
    role,
    kind,
    text,
    detail: "",
    status,
    createdAt: Date.now(),
  };
}

function clearComposer(): void {
  draft("");
  composer.setText("");
  hideMentions();
}

function restoreComposer(text: string): void {
  draft(text);
  composer.setText(text);
  refreshMentions(text);
  setTimeout(() => composer.focus(), 0);
}

function showToast(message: string): void {
  toastValue(message.replaceAll("\n", " "));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastValue(""), 3_200);
}

function cleanup(): void {
  if (cleanedUp) return;
  cleanedUp = true;
  if (animationTimer) clearInterval(animationTimer);
  if (logoAnimationTimer) clearInterval(logoAnimationTimer);
  if (dialAnimationTimer) clearInterval(dialAnimationTimer);
  if (scrollToEndTimer) clearTimeout(scrollToEndTimer);
  if (quitPromptTimer) clearTimeout(quitPromptTimer);
  codex?.dispose();
  searchIndex.destroy();
  store.close();
}

ff(() => {
  transcriptVersion();
  detailsExpanded();
  transcript.frameWidth();
  syncTranscript();
});

ff(() => {
  transcriptVersion();
  setLogoAnimationEnabled(entries.length === 0);
});

ff(() => {
  transcript.viewportHeight();
  transcript.contentHeight();
  transcript.maxScrollY();
  transcript.scrollY();
  renderTranscriptScrollbar();
});

ff(() => {
  const frame = logoAnimationFrame();
  const currentView = view();
  if (entries.length === 0) {
    if (currentView === "main" || currentView === "dial" || currentView === "help")
      welcomeLogo.setText(logoText(frame));
    else pickerView.animateLogo(frame);
  }
});

ff(() => {
  const frame = animationFrame();
  for (const entry of entries) {
    if (
      entry.status !== "running" ||
      entry.kind === "user" ||
      entry.kind === "error" ||
      entry.kind === "status" ||
      entry.kind === "plan" ||
      (entry.kind === "assistant" && entry.text)
    ) {
      continue;
    }
    const entryView = entryViews.get(entry.id);
    if (entryView)
      renderTranscriptEntry(entry, entryView, detailsExpanded(), frame, transcript.frameWidth());
  }
});

ff(() => {
  setActivityAnimationEnabled(busy());
});

ff(() => {
  modelVersion();
  rateLimitVersion();
  activeThreadVersion();
  busy();
  const width = root.frameWidth();
  const working = busy();
  const queued = queuedPrompts.length;
  const frame = animationFrame();
  const activity = summarizeTurnActivity(working);
  const showActivity =
    activity.runningToolCount > 0 &&
    (activity.finishedToolCount > 0 || activity.runningToolCount > 1);
  composerActivity.setText(showActivity ? activityText(frame, queued, activity) : "");
  composerActivity.setStyle({ height: showActivity ? 1 : 0 });
  composerSteerHint.setText(working && queued > 0 ? "Enter to steer" : "");
  composerSteerHint.setStyle({ width: working && queued > 0 ? 14 : 0 });
  renderComposerChrome(width, working, frame, showActivity, activity);
});

ff(() => {
  mentionVersion();
  renderMentions();
});

ff(() => {
  const message = toastValue();
  toast.setText(message);
  toast.setStyle({ height: message ? 1 : 0 });
});

ff(() => {
  const currentView = view();
  modelVersion();
  const bodyWidth = body.frameWidth();
  const rootWidth = root.frameWidth();
  const rootHeight = root.frameHeight();
  const welcomeHeight = welcomeStack.frameHeight();
  const pickerIsOverlay = currentView === "picker" && usesPickerOverlay();
  helpSeparator.setText("─".repeat(Math.max(0, Math.floor(rootWidth) - 4)));
  const wideWelcome = bodyWidth >= 100;
  welcomeLogo.setStyle({ position: "relative", right: wideWelcome ? -2 : 0 });
  welcomeStack.setStyle({
    direction: wideWelcome ? "row" : "column",
    width: wideWelcome ? 106 : 50,
    maxWidth: wideWelcome ? 106 : 50,
    gap: wideWelcome ? 1 : 5,
    alignItems: "center",
    justifyContent: wideWelcome ? "start" : "center",
  });
  welcomeDetails.setStyle({
    width: wideWelcome ? 30 : 50,
    maxWidth: wideWelcome ? 30 : 50,
    position: wideWelcome ? "absolute" : "relative",
    right: wideWelcome ? 25 : 0,
    bottom: wideWelcome ? Math.max(0, Math.floor((welcomeHeight - 21) / 2) + 11) : 0,
  });
  if (pickerIsOverlay) {
    const overlayWidth = clamp(Math.floor(rootWidth) - 10, 82, 140);
    const overlayHeight = clamp(Math.floor(rootHeight) - 4, 24, 45);
    body.setChildren([]);
    pickerOverlay.setStyle({
      right: Math.floor((rootWidth - overlayWidth) / 2),
      bottom: Math.floor((rootHeight - overlayHeight) / 2),
      width: overlayWidth,
      height: overlayHeight,
    });
    pickerOverlay.setChildren([pickerView.node]);
  } else {
    pickerOverlay.setChildren([]);
    pickerOverlay.setStyle({ right: 0, bottom: 0, width: 0, height: 0 });
  }
  const content =
    currentView === "picker"
      ? [pickerView.node]
      : currentView === "dial"
        ? [transcript, transcriptScrollbar, dialView.node]
        : [transcript, transcriptScrollbar];
  if (!pickerIsOverlay) body.setChildren(content);
  inactiveComposer.setText(draft());
  composerFrame.setChildren(
    currentView === "main"
      ? [composerTopLine, composer, composerBottomLine]
      : currentView === "help"
        ? [composerTopLine, helpComposer, composerBottomLine]
        : [composerTopLine, inactiveComposer, composerBottomLine],
  );
  if (currentView === "dial")
    dialView.render({
      width: Math.floor(bodyWidth || 74),
      selectedEffort,
      efforts: dialEfforts(),
      animatedPosition: currentDialPosition(),
      model: selectedModel?.displayName ?? "Codex",
      rateLimit: formatRateLimit(rateLimits),
    });
});

ff(() => {
  pickerVersion();
  body.frameWidth();
  body.frameHeight();
  root.frameWidth();
  root.frameHeight();
  if (picker) renderPicker();
});

onKey("\x0f", openCommandPalette);
onKey("\x13", openDial);
onKey("\x12", openPromptHistory);
onKey("\x03", () => {
  if (quitPromptVisible()) {
    app.quit();
    return;
  }
  quitPromptVisible(true);
  if (quitPromptTimer) clearTimeout(quitPromptTimer);
  quitPromptTimer = setTimeout(() => {
    quitPromptTimer = null;
    quitPromptVisible(false);
  }, 1_500);
});
onKey("\x1bt", toggleDetails);
onKey("\x1bT", toggleDetails);
onKey("?", () => {
  if (view() === "help") closeHelp();
});
onKey("\t", () => {
  if (mentionSuggestions.length > 0) acceptMention();
});
for (const key of RIGHT_KEYS) {
  onKey(key, () => {
    if (view() === "dial") moveDial(1);
  });
}
for (const key of LEFT_KEYS) {
  onKey(key, () => {
    if (view() === "dial") moveDial(-1);
  });
}
for (const key of NEXT_KEYS) {
  onKey(key, () => {
    if (picker) movePicker(1);
    else if (mentionSuggestions.length > 0) {
      mentionIndex = clamp(mentionIndex + 1, 0, mentionSuggestions.length - 1);
      mentionVersion(mentionVersion() + 1);
    } else transcript.scrollBy(2);
  });
}
for (const key of PREV_KEYS) {
  onKey(key, () => {
    if (picker) movePicker(-1);
    else if (mentionSuggestions.length > 0) {
      mentionIndex = clamp(mentionIndex - 1, 0, mentionSuggestions.length - 1);
      mentionVersion(mentionVersion() + 1);
    } else transcript.scrollBy(-2);
  });
}
onKey("\x1b", () => {
  if (quitPromptVisible()) {
    if (quitPromptTimer) clearTimeout(quitPromptTimer);
    quitPromptTimer = null;
    quitPromptVisible(false);
    return;
  }
  if (picker) {
    closePicker();
    return;
  }
  if (view() === "help") {
    closeHelp();
    return;
  }
  if (view() === "dial") {
    closeDial();
    return;
  }
  if (mentionSuggestions.length > 0) {
    hideMentions();
    return;
  }
  if (!busy()) return;
  const now = Date.now();
  if (now - lastEscapeAt < 600) void interruptTurn();
  else showToast("Press Esc again to interrupt the active turn");
  lastEscapeAt = now;
});

const debug = process.env.LETUI_AGENT_DEBUG === "1";
app = run(root, {
  appearance: "dark",
  debug,
  metricsPath: debug ? (process.env.LETUI_METRICS_PATH ?? "dump/ai-agent-metrics.txt") : false,
});
composer.focus();

process.once("exit", () => {
  cleanup();
});
void initializeAgent();
void initializeSearch();

type MentionSuggestion = {
  label: string;
  detail: string;
  insert: string;
  kind: "file" | "directory" | "thread" | "action";
};
type QueuedPrompt = { text: string; entry: TranscriptEntry };
type TurnActivity = {
  runningToolCount: number;
  finishedToolCount: number;
  onlyRunningCommands: boolean;
  runningReasoning: boolean;
  runningAssistant: boolean;
};
type RateLimitResponse = {
  rateLimits?: RateLimitSnapshot | null;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot>;
};

function renderComposerChrome(
  width: number,
  working: boolean,
  frame: number,
  showActivity: boolean,
  activity: TurnActivity,
): void {
  if (width < 8) {
    if (composerTopKey !== "empty") {
      composerTopKey = "empty";
      composerTopLine.setText("");
    }
    if (composerBottomKey !== "empty") {
      composerBottomKey = "empty";
      composerBottomLine.setText("");
    }
    return;
  }

  const displayedEffort = dialEffortLabel(selectedEffort);
  let usageLabel = working || entries.length > 0 ? fiveHourLabel(rateLimits) : "";
  let topLabel = usageLabel ? `${usageLabel} ─ ${displayedEffort}` : displayedEffort;
  if (topLabel.length + 5 > width) topLabel = displayedEffort;
  if (topLabel === displayedEffort) usageLabel = "";
  const nextTopKey = `${width}\0${usageLabel}\0${displayedEffort}`;
  if (composerTopKey !== nextTopKey) {
    composerTopKey = nextTopKey;
    const topDashes = "─".repeat(Math.max(0, width - topLabel.length - 5));
    composerTopLine.setText(
      styled([
        { text: `╭${topDashes} `, foreground: THEME.composerLine },
        { text: usageLabel, foreground: THEME.muted },
        { text: usageLabel ? " ─ " : "", foreground: THEME.composerLine },
        { text: displayedEffort, foreground: dialColor(selectedEffort) },
        { text: " ─╮", foreground: THEME.composerLine },
      ]),
    );
  }

  const path = displayPath.length + 5 <= width ? displayPath : fallbackDisplayPath;
  const hasRunningTool = activity.runningToolCount > 0;
  const status = working
    ? hasRunningTool
      ? "Running Tools"
      : activity.runningReasoning
        ? "Thinking"
        : activity.runningAssistant
          ? "Generating"
          : "Sending"
    : "";
  const statusIcon = hasRunningTool
    ? showActivity
      ? ["≋", "≈", "≋", "∼"][frame % 4]!
      : "∼"
    : activity.runningReasoning
      ? "✻"
      : activity.runningAssistant
        ? "✦"
        : "∼";
  const nextBottomKey = `${width}\0${path}\0${status}\0${statusIcon}`;
  if (composerBottomKey === nextBottomKey) return;
  composerBottomKey = nextBottomKey;
  const idleDashCount = Math.max(0, width - path.length - 5);
  if (!status || status.length + path.length + 8 > width) {
    composerBottomLine.setText(
      styled([
        { text: `╰${"─".repeat(idleDashCount)} `, foreground: THEME.composerLine },
        { text: path, foreground: THEME.muted },
        { text: " ─╯", foreground: THEME.composerLine },
      ]),
    );
    return;
  }

  const middleDashes = "─".repeat(Math.max(0, width - status.length - path.length - 9));
  composerBottomLine.setText(
    styled([
      { text: "╰ ", foreground: THEME.composerLine },
      { text: statusIcon, foreground: THEME.blue, bold: true },
      { text: ` ${status} `, foreground: THEME.muted },
      { text: `${middleDashes} `, foreground: THEME.composerLine },
      { text: path, foreground: THEME.muted },
      { text: " ─╯", foreground: THEME.composerLine },
    ]),
  );
}

function activityText(frame: number, queued: number, activity: TurnActivity): StyledText {
  const runningCount = Math.max(1, activity.runningToolCount);
  const noun = activity.onlyRunningCommands ? "command" : "tool";
  return styled([
    { text: `${ACTIVITY_FRAMES[frame % ACTIVITY_FRAMES.length]} `, foreground: THEME.blue },
    {
      text: `Running ${runningCount} ${noun}${runningCount === 1 ? "" : "s"}`,
      foreground: THEME.text,
    },
    {
      text: activity.finishedToolCount > 0 ? `, ${activity.finishedToolCount} finished` : "",
      foreground: THEME.muted,
    },
    { text: queued > 0 ? `, ${queued} queued` : "", foreground: THEME.amber },
    { text: " ▸", foreground: THEME.text },
  ]);
}

function summarizeTurnActivity(working: boolean): TurnActivity {
  const activity: TurnActivity = {
    runningToolCount: 0,
    finishedToolCount: 0,
    onlyRunningCommands: true,
    runningReasoning: false,
    runningAssistant: false,
  };
  if (!working) return activity;

  for (const entry of entries) {
    if (activeTurnId && entry.turnId !== activeTurnId) continue;
    if (entry.status === "running") {
      if (entry.role === "tool") {
        activity.runningToolCount++;
        if (entry.kind !== "command") activity.onlyRunningCommands = false;
      } else if (entry.kind === "reasoning") {
        activity.runningReasoning = true;
      } else if (entry.kind === "assistant") {
        activity.runningAssistant = true;
      }
    } else if (entry.role === "tool" && entry.status === "completed") {
      activity.finishedToolCount++;
    }
  }
  return activity;
}

function setActivityAnimationEnabled(enabled: boolean): void {
  if (enabled === (animationTimer !== null)) return;
  if (enabled) {
    animationTimer = setInterval(() => animationFrame(animationFrame() + 1), 90);
    return;
  }
  clearInterval(animationTimer!);
  animationTimer = null;
}

function setLogoAnimationEnabled(enabled: boolean): void {
  if (enabled === (logoAnimationTimer !== null)) return;
  if (enabled) {
    logoAnimationTimer = setInterval(() => logoAnimationFrame(logoAnimationFrame() + 1), 1000 / 30);
    return;
  }
  clearInterval(logoAnimationTimer!);
  logoAnimationTimer = null;
}

function fiveHourLabel(snapshot: RateLimitSnapshot | null): string {
  if (!snapshot) return "5h —";
  const window =
    snapshot.primary?.windowDurationMins === 300
      ? snapshot.primary
      : snapshot.secondary?.windowDurationMins === 300
        ? snapshot.secondary
        : snapshot.primary;
  return window ? `5h ${clamp(Math.round(100 - window.usedPercent), 0, 100)}%` : "5h —";
}

function sameSemanticEntry(left: TranscriptEntry, right: TranscriptEntry): boolean {
  return (
    left.turnId === right.turnId &&
    left.role === right.role &&
    left.kind === right.kind &&
    left.text === right.text
  );
}

function trimStream(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `…${value.slice(value.length - maxLength)}`;
}

function referencedThreadIds(prompt: string): string[] {
  return prompt.match(/@T-[0-9a-f-]{36}/gi)?.map((value) => value.slice(1)) ?? [];
}

function selectFiveHourSnapshot(response: RateLimitResponse): RateLimitSnapshot | null {
  const snapshots = [
    response.rateLimits ?? null,
    ...Object.values(response.rateLimitsByLimitId ?? {}),
  ].filter((value): value is RateLimitSnapshot => value !== null);
  return (
    snapshots.find(
      (snapshot) =>
        snapshot.primary?.windowDurationMins === 300 ||
        snapshot.secondary?.windowDurationMins === 300,
    ) ??
    snapshots.find((snapshot) => snapshot.limitId === "codex") ??
    null
  );
}

function formatRateLimit(snapshot: RateLimitSnapshot | null): string {
  if (!snapshot) return account?.type === "chatgpt" ? "5h —" : "signed out";
  const window =
    snapshot.primary?.windowDurationMins === 300
      ? snapshot.primary
      : snapshot.secondary?.windowDurationMins === 300
        ? snapshot.secondary
        : snapshot.primary;
  if (!window) return "5h —";
  const remaining = clamp(Math.round(100 - window.usedPercent), 0, 100);
  return `5h ${remaining}% left${window.resetsAt ? ` · ${resetText(window.resetsAt)}` : ""}`;
}

function resetText(timestampSeconds: number): string {
  const milliseconds = timestampSeconds * 1_000 - Date.now();
  if (milliseconds <= 0) return "resetting";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `resets ${minutes}m`;
  return `resets ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function threadTitle(prompt: string): string {
  const title = firstLine(prompt).replace(/^\s+|\s+$/g, "");
  return title.length > 72 ? `${title.slice(0, 69)}…` : title || "New thread";
}

function firstLine(value: string): string {
  return value.split("\n", 1)[0] ?? value;
}

function shortId(id: string): string {
  return `${id.slice(0, 10)}…${id.slice(-4)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

async function initializeSearch(): Promise<void> {
  try {
    await searchIndex.ready();
    await indexThreads();
    if (searchIndex.error) showToast(searchIndex.error);
    if (mentionKind) refreshMentions(draft());
  } catch (error) {
    reportSearchError(error);
  }
}

function indexThreads(): Promise<void> {
  return searchIndex.index(
    "threads",
    store.listThreads().map((thread) => ({
      value: thread,
      text: `${thread.title} ${thread.id} ${thread.cwd}`,
    })),
  );
}

function reportSearchError(error: unknown): void {
  showToast(`FFF search: ${errorMessage(error)}`);
}

function readGitBranch(rootPath: string): string {
  const result = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: rootPath,
    stdout: "pipe",
    stderr: "ignore",
  });
  return result.exitCode === 0 ? result.stdout.toString().trim() : "";
}

function abbreviateHome(path: string): string {
  const home = process.env.HOME;
  return home && (path === home || path.startsWith(`${home}/`))
    ? `~/${relative(home, path)}`.replace(/\/$/, "")
    : path;
}

function openExternal(url: string): void {
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
