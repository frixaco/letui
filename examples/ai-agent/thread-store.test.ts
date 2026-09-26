import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ThreadStore } from "./thread-store.ts";

let temporaryDirectory: string | null = null;

afterEach(() => {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe("local thread storage", () => {
  test("persists, references, and archives local conversations", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "lty-store-test-"));
    const store = new ThreadStore(join(temporaryDirectory, "threads.sqlite"));
    const referenced = store.createThread({
      codexThreadId: "codex-reference",
      cwd: "/workspace/reference",
      model: "model-a",
      effort: "medium",
    });
    const active = store.createThread({
      codexThreadId: "codex-active",
      cwd: "/workspace/active",
      model: "model-b",
      effort: "high",
    });

    store.updateThread(referenced.id, { title: "Reference thread" });
    store.saveMessage(referenced.id, {
      id: "message-user",
      role: "user",
      kind: "user",
      text: "Remember asymmetric value 17",
      detail: "",
      status: "completed",
      turnId: "turn-reference",
      itemId: "item-user",
    });
    store.saveMessage(referenced.id, {
      id: "message-tool",
      role: "tool",
      kind: "command",
      text: "printf hidden-tool-output",
      detail: "hidden-tool-output",
      status: "completed",
      turnId: "turn-reference",
      itemId: "item-tool",
    });

    const context = store.referenceContext([referenced.id], active.id);
    expect(context).toContain("THREAD ");
    expect(context).toContain("USER: Remember asymmetric value 17");
    expect(context).not.toContain("hidden-tool-output");
    expect(store.listMessages(referenced.id)).toHaveLength(2);

    store.archiveThread(referenced.id);
    expect(store.listThreads().map((thread) => thread.id)).toEqual([active.id]);
    expect(store.listThreads({ archived: true }).map((thread) => thread.id)).toEqual([
      referenced.id,
    ]);
    store.close();
  });
});
