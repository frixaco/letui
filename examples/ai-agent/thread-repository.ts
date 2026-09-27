/** Codex-backed thread access: list, read, prompt history, and referenced context. */

import type { CodexAppServer, CodexThread } from "./codex-client.ts";
import { stringValue, userInputText } from "./codex-events.ts";

export class ThreadRepository {
  constructor(
    private readonly codex: CodexAppServer,
    private readonly cwd: string,
  ) {}

  async list(
    options: { allWorkspaces?: boolean; archived?: boolean } = {},
  ): Promise<CodexThread[]> {
    const threads: CodexThread[] = [];
    let cursor: string | null = null;
    do {
      const response: ThreadListResponse = await this.codex.request<ThreadListResponse>(
        "thread/list",
        {
          cursor,
          limit: 100,
          archived: options.archived ?? false,
          ...(options.allWorkspaces ? {} : { cwd: this.cwd }),
        },
      );
      threads.push(...response.data);
      cursor = response.nextCursor;
    } while (cursor);
    return threads.sort((left, right) => threadTimestamp(right) - threadTimestamp(left));
  }

  async read(threadId: string): Promise<CodexThread> {
    const cached = this.history.get(threadId);
    if (cached) return cached;
    const response = await this.codex.request<{ thread: CodexThread }>("thread/read", {
      threadId,
      includeTurns: true,
    });
    this.history.set(threadId, response.thread);
    return response.thread;
  }

  peek(threadId: string): CodexThread | null {
    return this.history.get(threadId) ?? null;
  }

  invalidate(threadId: string): void {
    this.history.delete(threadId);
  }

  async promptHistory(threads: readonly CodexThread[]): Promise<PromptHistoryEntry[]> {
    const histories = await mapConcurrent(threads, 8, (thread) => this.read(thread.id));
    const prompts: PromptHistoryEntry[] = [];
    const seen = new Set<string>();
    for (const thread of histories) {
      for (const turn of thread.turns) {
        for (const item of turn.items) {
          if (item.type !== "userMessage") continue;
          const text = userInputText(item.content).trim();
          if (!text || seen.has(text)) continue;
          seen.add(text);
          prompts.push({ text, createdAt: (turn.startedAt ?? thread.updatedAt ?? 0) * 1_000 });
        }
      }
    }
    return prompts.sort((left, right) => right.createdAt - left.createdAt);
  }

  async referenceContext(threadIds: readonly string[]): Promise<string> {
    const uniqueIds = [...new Set(threadIds)];
    if (uniqueIds.length === 0) return "";
    const threads = await mapConcurrent(uniqueIds, 4, (threadId) => this.read(threadId));
    const sections: string[] = [];
    let remaining = 24_000;
    for (const thread of threads) {
      const messages: string[] = [];
      for (const turn of thread.turns) {
        for (const item of turn.items) {
          const text =
            item.type === "userMessage"
              ? userInputText(item.content)
              : item.type === "agentMessage"
                ? stringValue(item.text)
                : "";
          if (text) messages.push(`${item.type === "userMessage" ? "USER" : "ASSISTANT"}: ${text}`);
        }
      }
      const section =
        `THREAD ${thread.id} — ${threadLabel(thread)}\n${messages.join("\n\n")}`.slice(
          0,
          remaining,
        );
      if (!section) break;
      sections.push(section);
      remaining -= section.length;
      if (remaining <= 0) break;
    }
    return sections.length > 0
      ? `\n\n<referenced_threads>\n${sections.join("\n\n---\n\n")}\n</referenced_threads>`
      : "";
  }

  private readonly history = new Map<string, CodexThread>();
}

export function threadLabel(thread: CodexThread): string {
  return thread.name?.trim() || firstLine(thread.preview) || "New thread";
}

export function threadTimestamp(thread: CodexThread): number {
  return (thread.recencyAt ?? thread.updatedAt ?? thread.createdAt ?? 0) * 1_000;
}

export type PromptHistoryEntry = { text: string; createdAt: number };

type ThreadListResponse = { data: CodexThread[]; nextCursor: string | null };

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from({ length: values.length }) as R[];
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await map(values[index]!);
      }
    }),
  );
  return results;
}

function firstLine(value: string): string {
  return value.trim().split("\n", 1)[0] ?? "";
}
