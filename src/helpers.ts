/**
 * Small terminal parsing helpers shared by runtime and input dispatch.
 *
 * Data flow:
 *   raw stdin chunk -> extractMouseEvents / isIgnoredInputControlChar -> runtime handlers
 */

export function extractMouseEvents(data: string): MouseEventExtraction {
  const mouseEvents: ParsedMouseEvent[] = [];
  let remaining = "";
  let cursor = 0;

  while (cursor < data.length) {
    const start = data.indexOf(MOUSE_EVENT_PREFIX, cursor);
    if (start === -1) {
      remaining += data.slice(cursor);
      break;
    }

    remaining += data.slice(cursor, start);
    const consumed = consumeMouseEvent(data, start);
    if (consumed === null) {
      remaining += data.slice(start);
      break;
    }

    mouseEvents.push(consumed.event);
    cursor = consumed.end;
  }

  return { mouseEvents, remaining };
}

export type ParsedMouseEvent = {
  rawButton: number;
  button: number;
  x: number;
  y: number;
  kind: "press" | "release";
};

export function isIgnoredInputControlChar(ch: string): boolean {
  const codePoint = ch.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (
    (codePoint >= 0x00 && codePoint <= 0x09) ||
    codePoint === 0x0b ||
    codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f)
  );
}

type MouseEventExtraction = {
  mouseEvents: ParsedMouseEvent[];
  remaining: string;
};

type ConsumedMouseEvent = {
  event: ParsedMouseEvent;
  end: number;
};

type ConsumedNumber = {
  value: number;
  end: number;
};

const MOUSE_EVENT_PREFIX = "\u001b[<";

function consumeMouseEvent(data: string, start: number): ConsumedMouseEvent | null {
  if (!data.startsWith(MOUSE_EVENT_PREFIX, start)) {
    return null;
  }

  let index = start + MOUSE_EVENT_PREFIX.length;
  const rawButton = consumeNumber(data, index);
  if (rawButton === null || data[rawButton.end] !== ";") {
    return null;
  }

  index = rawButton.end + 1;
  const x = consumeNumber(data, index);
  if (x === null || data[x.end] !== ";") {
    return null;
  }

  index = x.end + 1;
  const y = consumeNumber(data, index);
  if (y === null) {
    return null;
  }

  const terminator = data[y.end];
  if (terminator !== "M" && terminator !== "m") {
    return null;
  }

  return {
    event: {
      rawButton: rawButton.value,
      button: rawButton.value & 0b11,
      x: x.value - 1,
      y: y.value - 1,
      kind: terminator === "M" ? "press" : "release",
    },
    end: y.end + 1,
  };
}

function consumeNumber(data: string, start: number): ConsumedNumber | null {
  let index = start;

  while (index < data.length) {
    const ch = data[index]!;
    if (ch < "0" || ch > "9") {
      break;
    }

    index += 1;
  }

  if (index === start) {
    return null;
  }

  return {
    value: Number(data.slice(start, index)),
    end: index,
  };
}
