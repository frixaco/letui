/** Normalize loosely typed Codex protocol events into controller-safe values. */

import type { CodexThreadItem, RateLimitSnapshot } from "./codex-client.ts";
import type { TranscriptEntry } from "./transcript-view.ts";

export function itemToTranscriptEntry(
  item: CodexThreadItem,
  turnId: string | null,
  completed: boolean,
): TranscriptEntry {
  const status = itemStatus(item, completed);
  const base = { id: item.id, itemId: item.id, turnId, status, detail: "" } as const;

  switch (item.type) {
    case "userMessage":
      return { ...base, role: "user", kind: "user", text: userInputText(item.content) };
    case "agentMessage":
      return { ...base, role: "assistant", kind: "assistant", text: stringValue(item.text) };
    case "reasoning": {
      const summary = stringList(item.summary).join("\n");
      const content = stringList(item.content).join("\n");
      return {
        ...base,
        role: "assistant",
        kind: "reasoning",
        text: summary || content,
        detail: summary ? content : "",
      };
    }
    case "plan":
      return { ...base, role: "assistant", kind: "plan", text: stringValue(item.text) };
    case "commandExecution":
      return {
        ...base,
        role: "tool",
        kind: "command",
        text: stringValue(item.command) || "shell command",
        detail: stringValue(item.aggregatedOutput),
      };
    case "fileChange": {
      const changes = recordList(item.changes);
      const names = changes.map((change) => stringValue(change.path)).filter(Boolean);
      return {
        ...base,
        role: "tool",
        kind: "file",
        text: names.length > 0 ? `Edited ${compactList(names, 3)}` : "Applied file changes",
        detail: changes.map(describeFileChange).join("\n"),
      };
    }
    case "webSearch": {
      const query = stringValue(item.query) || stringValue(asRecord(item.action).query);
      return { ...base, role: "tool", kind: "search", text: query || "Searched the web" };
    }
    case "mcpToolCall":
      return {
        ...base,
        role: "tool",
        kind: "tool",
        text: `${stringValue(item.server)}/${stringValue(item.tool)}`,
        detail: formatUnknown(item.result ?? item.error),
      };
    case "dynamicToolCall":
      return {
        ...base,
        role: "tool",
        kind: "tool",
        text:
          [stringValue(item.namespace), stringValue(item.tool)].filter(Boolean).join("/") || "tool",
        detail: formatUnknown(item.contentItems),
      };
    case "collabAgentToolCall":
      return {
        ...base,
        role: "tool",
        kind: "subagent",
        text: `${stringValue(item.tool) || "subagent"}${item.prompt ? `: ${stringValue(item.prompt)}` : ""}`,
      };
    case "subAgentActivity":
      return {
        ...base,
        role: "tool",
        kind: "subagent",
        text: `${stringValue(item.kind) || "Subagent"} ${stringValue(item.agentPath)}`.trim(),
      };
    case "imageView":
      return { ...base, role: "tool", kind: "tool", text: `Viewed ${stringValue(item.path)}` };
    case "contextCompaction":
      return { ...base, role: "system", kind: "status", text: "Compacted thread context" };
    default:
      return { ...base, role: "tool", kind: "tool", text: humanize(item.type) };
  }
}

export function formatPlan(value: unknown): string {
  return recordList(value)
    .map(
      (step) => `${stringValue(step.status) === "completed" ? "✓" : "○"} ${stringValue(step.step)}`,
    )
    .join("\n");
}

export function userInputText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((input) => {
      const record = asRecord(input);
      return (
        stringValue(record.text) ||
        (record.type === "image" ? `[image: ${stringValue(record.path)}]` : "")
      );
    })
    .filter(Boolean)
    .join("\n");
}

export function asThreadItem(value: unknown): CodexThreadItem | null {
  const record = asRecord(value);
  const id = stringValue(record.id);
  const type = stringValue(record.type);
  return id && type ? ({ ...record, id, type } as CodexThreadItem) : null;
}

export function asRateLimit(value: unknown): RateLimitSnapshot | null {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? (record as unknown as RateLimitSnapshot) : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function itemStatus(item: CodexThreadItem, completed: boolean): TranscriptEntry["status"] {
  const raw = stringValue(item.status);
  if (!completed || raw === "inProgress") return "running";
  return ["failed", "declined", "error"].includes(raw) ? "failed" : "completed";
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function describeFileChange(change: Record<string, unknown>): string {
  const path = stringValue(change.path) || "file";
  const kind = stringValue(change.kind) || stringValue(change.type) || "update";
  return `${kind.padEnd(8)} ${path}`;
}
function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function compactList(values: string[], limit: number): string {
  return values.length <= limit
    ? values.join(", ")
    : `${values.slice(0, limit).join(", ")} +${values.length - limit}`;
}
function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (char) => char.toUpperCase());
}
