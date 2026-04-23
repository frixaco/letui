/**
 * Keyboard input parser that normalizes terminal chunks into text mutations.
 */

import { prepareTextInput } from "./text.ts";
import { isIgnoredInputControlChar } from "./helpers.ts";

export function parseInputChunk(data: string): InputChunkOp[] {
  const normalized = prepareTextInput(data).text;
  const ops: InputChunkOp[] = [];
  const buffer: string[] = [];

  for (const ch of normalized) {
    if (ch === "\x08" || ch === "\x7f") {
      pushInsertOp(ops, buffer);
      ops.push({ type: "backspace" });
      continue;
    }

    if (ch === "\n") {
      pushInsertOp(ops, buffer);
      ops.push({ type: "newline" });
      continue;
    }

    if (isIgnoredInputControlChar(ch)) {
      continue;
    }

    buffer.push(ch);
  }

  pushInsertOp(ops, buffer);
  return ops;
}

export function dispatchInputChunk(target: InputDispatchTarget, data: string): boolean {
  if (data === "\t") {
    return false;
  }

  if (data.includes("\x1b")) {
    return false;
  }

  const ops = parseInputChunk(data);
  if (ops.length === 0) {
    return false;
  }

  let draft = target.getText();
  let handled = false;
  let hasPendingInsert = false;

  const commitDraft = (): void => {
    if (!hasPendingInsert) {
      return;
    }

    target.setText(draft);
    target.onChange?.(target.getText());
    draft = target.getText();
    hasPendingInsert = false;
  };

  for (const op of ops) {
    handled = true;

    switch (op.type) {
      case "insert":
        draft += op.text;
        hasPendingInsert = true;
        break;
      case "backspace":
        commitDraft();
        target.setText(deletePreviousCodepoint(target.getText()));
        target.onChange?.(target.getText());
        draft = target.getText();
        break;
      case "newline":
        if (target.multiline) {
          commitDraft();
          target.setText(target.getText() + "\n");
          target.onChange?.(target.getText());
          draft = target.getText();
          break;
        }

        commitDraft();
        target.onSubmit?.(target.getText());
        draft = target.getText();
        break;
    }
  }

  commitDraft();
  return handled;
}

type InputChunkOp = { type: "insert"; text: string } | { type: "backspace" } | { type: "newline" };

export type InputDispatchTarget = {
  getText: () => string;
  setText: (value: string) => void;
  multiline: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
};

function deletePreviousCodepoint(text: string): string {
  const chars = Array.from(text);
  chars.pop();
  return chars.join("");
}

function pushInsertOp(ops: InputChunkOp[], buffer: string[]): void {
  if (buffer.length === 0) return;
  ops.push({ type: "insert", text: buffer.join("") });
  buffer.length = 0;
}
