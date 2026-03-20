import api from "./ffi";
import { NODE_KIND, type NodeKind, type NodeKindNum } from "./types";

enum OpEnum {
  SetText = 1,
  DeleteTextRange = 2,
  AddNode = 3,
  DeleteNode = 4,
  UpdateStyle = 5,
  SetRoot = 6,
  AppendChild = 7,
}

const OP_SIZE = 1;
const ID_SIZE = 4;
const KIND_SIZE = 1;
const LEN_SIZE = 4;

class OpQueue {
  chunks: Uint8Array[] = [];

  get buffer() {
    const totalLength = this.chunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    const buffer = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of this.chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    return buffer;
  }

  setRoot(id: number) {
    const buffer = new Uint8Array(OP_SIZE + ID_SIZE + LEN_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.SetRoot);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, 0, true);

    this.chunks.push(buffer);
  }

  addNode(id: number, kind: NodeKind) {
    const kindNum: NodeKindNum = NODE_KIND[kind];
    const buffer = new Uint8Array(OP_SIZE + ID_SIZE + LEN_SIZE + KIND_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.AddNode);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, KIND_SIZE, true);
    view.setUint8(OP_SIZE + ID_SIZE + LEN_SIZE, kindNum);

    this.chunks.push(buffer);
  }

  deleteNode(id: number) {
    const buffer = new Uint8Array(OP_SIZE + ID_SIZE + LEN_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.DeleteNode);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, 0, true);

    this.chunks.push(buffer);
  }

  appendChild(childId: number, parentId: number) {
    const buffer = new Uint8Array(OP_SIZE + ID_SIZE + LEN_SIZE + ID_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.AppendChild);
    view.setUint32(OP_SIZE, parentId, true);
    view.setUint32(OP_SIZE + ID_SIZE, ID_SIZE, true);
    view.setUint32(OP_SIZE + ID_SIZE + LEN_SIZE, childId, true);

    this.chunks.push(buffer);
  }
}

const ops = new OpQueue();

ops.addNode(1, "Column");
ops.setRoot(1);
ops.addNode(2, "Text");
ops.addNode(3, "Button");
ops.deleteNode(3);
ops.appendChild(2, 1);

api.apply_ops(ops.buffer)
