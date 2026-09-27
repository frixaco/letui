import { describe, expect, test } from "bun:test";
import { formatFileChanges, itemToTranscriptEntry, userInputText } from "./codex-events.ts";

describe("Codex event normalization", () => {
  test("preserves a failed command and its output", () => {
    const entry = itemToTranscriptEntry(
      {
        type: "commandExecution",
        id: "command-1",
        command: "false",
        aggregatedOutput: "exit code 1",
        status: "failed",
      },
      "turn-1",
      true,
    );

    expect(entry).toMatchObject({
      kind: "command",
      text: "false",
      detail: "exit code 1",
      status: "failed",
      turnId: "turn-1",
    });
  });

  test("keeps a started item running even when it reports a terminal status", () => {
    const entry = itemToTranscriptEntry(
      { type: "agentMessage", id: "message-1", text: "partial", status: "completed" },
      "turn-1",
      false,
    );

    expect(entry.status).toBe("running");
  });

  test("formats current file patch notifications", () => {
    expect(
      formatFileChanges([
        { path: "src/changed.ts", kind: "update", diff: "changed" },
        { path: "src/new.ts", kind: "add", diff: "new" },
      ]),
    ).toBe("update   src/changed.ts\nadd      src/new.ts");
  });

  test("extracts text and image inputs without serializing unknown values", () => {
    expect(
      userInputText([
        { type: "text", text: "hello" },
        { type: "image", path: "/tmp/example.png" },
        { type: "unknown", value: 3 },
      ]),
    ).toBe("hello\n[image: /tmp/example.png]");
  });

  test("hides transport-only referenced thread context from user prompts", () => {
    expect(
      userInputText([
        {
          type: "text",
          text: "What token was produced?\n\n<referenced_threads>\nTHREAD hidden\n</referenced_threads>",
        },
      ]),
    ).toBe("What token was produced?");
  });
});
