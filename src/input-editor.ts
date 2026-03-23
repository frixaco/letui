import { prepareTextInput } from "./text-spans";
import type { InputNode } from "./types";

export type EditorState = {
  text: string;
  cursor: number;
  anchor: number | null;
};

export type EditorCommand =
  | { type: "insertText"; text: string }
  | { type: "deleteBackward" }
  | { type: "insertLineBreak" };

export type EditorResult = {
  state: EditorState;
  changed: boolean;
  submit?: string;
};

const editorStateByNode = new WeakMap<InputNode, EditorState>();

function codepointLength(text: string): number {
  return Array.from(text).length;
}

function splitCodepoints(text: string): string[] {
  return Array.from(text);
}

function selectionRange(
  state: EditorState,
): { start: number; end: number } | null {
  if (state.anchor === null || state.anchor === state.cursor) {
    return null;
  }

  return {
    start: Math.min(state.anchor, state.cursor),
    end: Math.max(state.anchor, state.cursor),
  };
}

function createCollapsedState(text: string, cursor: number): EditorState {
  return { text, cursor, anchor: null };
}

function replaceSelection(
  state: EditorState,
  nextText: string,
): EditorState {
  const chars = splitCodepoints(state.text);
  const range = selectionRange(state);

  if (range === null) {
    const nextCursor = state.cursor + codepointLength(nextText);
    chars.splice(state.cursor, 0, ...splitCodepoints(nextText));
    return createCollapsedState(chars.join(""), nextCursor);
  }

  chars.splice(
    range.start,
    range.end - range.start,
    ...splitCodepoints(nextText),
  );
  return createCollapsedState(
    chars.join(""),
    range.start + codepointLength(nextText),
  );
}

function deleteSelection(state: EditorState): EditorState {
  const range = selectionRange(state);
  if (range === null) {
    return state;
  }

  const chars = splitCodepoints(state.text);
  chars.splice(range.start, range.end - range.start);
  return createCollapsedState(chars.join(""), range.start);
}

function deletePreviousCodepoint(state: EditorState): EditorState {
  const selected = deleteSelection(state);
  if (selected !== state) {
    return selected;
  }

  if (state.cursor === 0) {
    return state;
  }

  const chars = splitCodepoints(state.text);
  chars.splice(state.cursor - 1, 1);
  return createCollapsedState(chars.join(""), state.cursor - 1);
}

export function createEditorState(text: string): EditorState {
  const normalized = prepareTextInput(text).text;
  return createCollapsedState(normalized, codepointLength(normalized));
}

export function getInputEditorState(node: InputNode): EditorState {
  return editorStateByNode.get(node) ?? createEditorState(node.props.text());
}

export function setInputEditorState(
  node: InputNode,
  state: EditorState,
): void {
  editorStateByNode.set(node, state);
  node.props.text(state.text);
}

export function resetInputEditorText(node: InputNode, text: string): void {
  setInputEditorState(node, createEditorState(text));
}

export function reduceEditor(
  state: EditorState,
  command: EditorCommand,
  opts: { multiline: boolean },
): EditorResult {
  switch (command.type) {
    case "insertText": {
      const nextState = replaceSelection(state, command.text);
      return {
        state: nextState,
        changed: nextState.text !== state.text,
      };
    }
    case "deleteBackward": {
      const nextState = deletePreviousCodepoint(state);
      return {
        state: nextState,
        changed: nextState.text !== state.text,
      };
    }
    case "insertLineBreak": {
      if (!opts.multiline) {
        return {
          state,
          changed: false,
          submit: state.text,
        };
      }

      const nextState = replaceSelection(state, "\n");
      return {
        state: nextState,
        changed: nextState.text !== state.text,
      };
    }
  }
}
