import { NODE_KIND_ID, type NodeKind, type NodeKindNum } from "./types";

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
const RECORD_HEADER_SIZE = OP_SIZE + ID_SIZE + LEN_SIZE;
const DELETE_TEXT_RANGE_PAYLOAD_SIZE = ID_SIZE * 2;

const STYLE_VALUE_RESET = 0;
const STYLE_VALUE_NUMBER = 1;
const STYLE_VALUE_STRING = 2;

const textEncoder = new TextEncoder();

export type StylePropName =
  | "gap"
  | "padding"
  | "paddingX"
  | "paddingY"
  | "borderWidth"
  | "background"
  | "foreground"
  | "borderColor"
  | "borderStyle"
  | "flexGrow"
  | "direction"
  | "width"
  | "height"
  | "minWidth"
  | "minHeight"
  | "maxWidth"
  | "maxHeight"
  | "margin"
  | "marginX"
  | "marginY"
  | "alignItems"
  | "justifyContent"
  | "alignSelf"
  | "flexShrink"
  | "flexBasis"
  | "flexWrap";

export type StylePropValue = number | string | undefined;

export const EMITTED_STYLE_PROPS = [
  "gap",
  "padding",
  "paddingX",
  "paddingY",
  "borderWidth",
  "background",
  "foreground",
  "borderColor",
  "borderStyle",
  "flexGrow",
  "direction",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "margin",
  "marginX",
  "marginY",
  "alignItems",
  "justifyContent",
  "alignSelf",
  "flexShrink",
  "flexBasis",
  "flexWrap",
] as const satisfies readonly StylePropName[];

function encodeShortString(value: string) {
  const bytes = textEncoder.encode(value);
  if (bytes.length > 255) {
    throw new Error(`String too long for style op: ${value}`);
  }

  const buffer = new Uint8Array(1 + bytes.length);
  buffer[0] = bytes.length;
  buffer.set(bytes, 1);
  return buffer;
}

function encodeStyleValue(value: StylePropValue) {
  if (value === undefined) {
    return Uint8Array.of(STYLE_VALUE_RESET);
  }

  if (typeof value === "number") {
    const buffer = new Uint8Array(1 + 8);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, STYLE_VALUE_NUMBER);
    view.setFloat64(1, value, true);
    return buffer;
  }

  const stringBuffer = encodeShortString(value);
  const buffer = new Uint8Array(1 + stringBuffer.length);
  buffer[0] = STYLE_VALUE_STRING;
  buffer.set(stringBuffer, 1);
  return buffer;
}

export function getSetTextOpSize(text: string): number {
  return RECORD_HEADER_SIZE + textEncoder.encode(text).length;
}

export function getDeleteTextRangeOpSize(): number {
  return RECORD_HEADER_SIZE + DELETE_TEXT_RANGE_PAYLOAD_SIZE;
}

export class OpQueue {
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
    const buffer = new Uint8Array(RECORD_HEADER_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.SetRoot);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, 0, true);

    this.chunks.push(buffer);
  }

  addNode(id: number, kind: NodeKind) {
    const kindNum: NodeKindNum = NODE_KIND_ID[kind];
    const buffer = new Uint8Array(RECORD_HEADER_SIZE + KIND_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.AddNode);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, KIND_SIZE, true);
    view.setUint8(OP_SIZE + ID_SIZE + LEN_SIZE, kindNum);

    this.chunks.push(buffer);
  }

  deleteNode(id: number) {
    const buffer = new Uint8Array(RECORD_HEADER_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.DeleteNode);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, 0, true);

    this.chunks.push(buffer);
  }

  appendChild(childId: number, parentId: number) {
    const buffer = new Uint8Array(RECORD_HEADER_SIZE + ID_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.AppendChild);
    view.setUint32(OP_SIZE, parentId, true);
    view.setUint32(OP_SIZE + ID_SIZE, ID_SIZE, true);
    view.setUint32(OP_SIZE + ID_SIZE + LEN_SIZE, childId, true);

    this.chunks.push(buffer);
  }

  setText(id: number, text: string) {
    const payload = textEncoder.encode(text);
    const buffer = new Uint8Array(RECORD_HEADER_SIZE + payload.length);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.SetText);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, payload.length, true);
    buffer.set(payload, RECORD_HEADER_SIZE);

    this.chunks.push(buffer);
  }

  deleteTextRange(id: number, startByte: number, endByte: number) {
    const buffer = new Uint8Array(RECORD_HEADER_SIZE + DELETE_TEXT_RANGE_PAYLOAD_SIZE);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.DeleteTextRange);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, DELETE_TEXT_RANGE_PAYLOAD_SIZE, true);
    view.setUint32(RECORD_HEADER_SIZE, startByte, true);
    view.setUint32(RECORD_HEADER_SIZE + ID_SIZE, endByte, true);

    this.chunks.push(buffer);
  }

  updateStyle(id: number, prop: StylePropName, value: StylePropValue) {
    const propBuffer = encodeShortString(prop);
    const valueBuffer = encodeStyleValue(value);
    const payloadLength = propBuffer.length + valueBuffer.length;
    const buffer = new Uint8Array(RECORD_HEADER_SIZE + payloadLength);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, OpEnum.UpdateStyle);
    view.setUint32(OP_SIZE, id, true);
    view.setUint32(OP_SIZE + ID_SIZE, payloadLength, true);
    buffer.set(propBuffer, RECORD_HEADER_SIZE);
    buffer.set(valueBuffer, RECORD_HEADER_SIZE + propBuffer.length);

    this.chunks.push(buffer);
  }

  clear() {
    this.chunks.length = 0;
  }

  drain(): Uint8Array {
    if (this.chunks.length === 0) {
      return new Uint8Array(0);
    }
    const buf = this.buffer;
    this.clear();
    return buf;
  }
}
