import type { Node } from "./components";

enum CommandEnum {
  "set-text" = 1,
  "delete-text-range" = 2,
  "add-node" = 3,
  "delete-node" = 4,
  "update-style" = 5,
}

class OpQueue {
  buffer: Uint8Array = new Uint8Array();

  setText(node: Node, text: string) {}

  deleteTextRange(node: Node, start: number, end: number) {}

  addNode(node: Node) {}

  deleteNode(node: Node) {}

  updateStyle(node: Node, styles: Record<string, string | number>) {}

  reset() {}

  get() {
    return this.buffer;
  }
}
