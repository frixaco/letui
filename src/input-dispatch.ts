import {
  reduceEditor,
  type EditorCommand,
  type EditorState,
} from "./input-editor";
import { prepareTextInput } from "./text-spans";

const IGNORED_INPUT_CONTROL_PATTERN = /[\x00-\x09\x0B\x0C\x0E-\x1F]/;

export type InputDispatchTarget = {
  getState: () => EditorState;
  setState: (state: EditorState) => void;
  multiline: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
};

function pushInsertCommand(ops: EditorCommand[], buffer: string[]): void {
  if (buffer.length === 0) return;
  ops.push({ type: "insertText", text: buffer.join("") });
  buffer.length = 0;
}

export function parseInputCommands(data: string): EditorCommand[] {
  const normalized = prepareTextInput(data).text;
  const ops: EditorCommand[] = [];
  const buffer: string[] = [];

  for (const ch of normalized) {
    if (ch === "\x7f") {
      pushInsertCommand(ops, buffer);
      ops.push({ type: "deleteBackward" });
      continue;
    }

    if (ch === "\n") {
      pushInsertCommand(ops, buffer);
      ops.push({ type: "insertLineBreak" });
      continue;
    }

    if (IGNORED_INPUT_CONTROL_PATTERN.test(ch)) {
      continue;
    }

    buffer.push(ch);
  }

  pushInsertCommand(ops, buffer);
  return ops;
}

export function dispatchInputChunk(
  target: InputDispatchTarget,
  data: string,
): boolean {
  if (data.includes("\x1b")) {
    return false;
  }

  const ops = parseInputCommands(data);
  if (ops.length === 0) {
    return false;
  }

  let handled = false;

  for (const op of ops) {
    handled = true;
    const result = reduceEditor(target.getState(), op, {
      multiline: target.multiline,
    });

    if (result.changed) {
      target.setState(result.state);
      target.onChange?.(result.state.text);
    }

    if (result.submit !== undefined) {
      target.onSubmit?.(result.submit);
    }
  }

  return handled;
}
