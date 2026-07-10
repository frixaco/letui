import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CompactLength,
  Dimension,
  GridTemplateRepetition,
  LengthPercentage,
  LengthPercentageAuto,
  Line,
  MaxTrackSizingFunction,
  MinTrackSizingFunction,
  Point,
  Rect,
  Size,
  Style,
  TaffyTree,
  TrackSizingFunction,
} from "../src/index.js";
import type { AvailableSpaceValue, NodeId } from "../src/index.js";

type AxisName = "width" | "height";
type WritingMode = "horizontal" | "vertical";
type TextMeasureContext = { type: "ahemText"; text: string; writingMode: WritingMode };
type FixtureNode = {
  name: string;
  style: Style;
  context: TextMeasureContext | undefined;
  children: string[];
};
type ExpectedLayout = { x: number; y: number; width: number; height: number };
type NativeFixture = {
  cases: Array<{
    name: string;
    nodes: FixtureNode[];
    root: string;
    availableSpace: Size;
    expected: Map<string, ExpectedLayout>;
  }>;
};
export type NativeFixtureRecord = { suite: string; name: string; fixture: NativeFixture };

export function loadNativeFixtures(): NativeFixtureRecord[] {
  const source = readFileSync(
    new URL("./fixtures/generated-layouts.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(source, reviveFixtureValue) as NativeFixtureRecord[];
}

export function runNativeFixture(fixture: NativeFixture): void {
  for (const fixtureCase of fixture.cases) {
    const taffy = TaffyTree.new();
    const nodes = new Map<string, NodeId<unknown>>();

    for (const node of fixtureCase.nodes) {
      if (node.children.length === 0) {
        nodes.set(
          node.name,
          node.context === undefined
            ? taffy.newLeaf(node.style)
            : taffy.newLeafWithContext(node.style, node.context),
        );
      } else {
        nodes.set(
          node.name,
          taffy.newWithChildren(
            node.style,
            node.children.map((child) => requireNode(nodes, child)),
          ),
        );
      }
    }

    const root = requireNode(nodes, fixtureCase.root);
    taffy.computeLayoutWithMeasure(root, fixtureCase.availableSpace, measureText);

    for (const [nodeName, expected] of fixtureCase.expected) {
      const layout = taffy.layout(requireNode(nodes, nodeName));
      assert.deepEqual(
        layout.location,
        new Point(expected.x, expected.y),
        `${fixtureCase.name} ${nodeName} location`,
      );
      assert.deepEqual(
        layout.size,
        new Size(expected.width, expected.height),
        `${fixtureCase.name} ${nodeName} size`,
      );
    }
  }
}

function reviveFixtureValue(_key: string, value: any): any {
  if (!value || typeof value !== "object" || typeof value.$type !== "string") return value;
  const { $type, ...fields } = value;
  switch ($type) {
    case "Map":
      return new Map(fields.entries);
    case "CompactLength":
      return new CompactLength(fields.tagValue, fields.numericValue, fields.opaqueValue);
    case "Dimension":
      return new Dimension(fields.raw);
    case "LengthPercentage":
      return new LengthPercentage(fields.raw);
    case "LengthPercentageAuto":
      return new LengthPercentageAuto(fields.raw);
    case "Line":
      return new Line(fields.start, fields.end);
    case "Point":
      return new Point(fields.x, fields.y);
    case "Rect":
      return new Rect(fields.left, fields.right, fields.top, fields.bottom);
    case "Size":
      return new Size(fields.width, fields.height);
    case "MaxTrackSizingFunction":
      return new MaxTrackSizingFunction(fields.value);
    case "MinTrackSizingFunction":
      return new MinTrackSizingFunction(fields.value);
    case "TrackSizingFunction":
      return new TrackSizingFunction(fields.min, fields.max);
    case "GridTemplateRepetition":
      return new GridTemplateRepetition(fields.count, fields.tracks, fields.lineNames);
    case "Style":
      return new Style(fields);
    default:
      throw new Error(`Unknown native fixture value type: ${$type}`);
  }
}

function requireNode(nodes: Map<string, NodeId<unknown>>, name: string): NodeId<unknown> {
  const node = nodes.get(name);
  if (node === undefined) throw new Error(`Missing fixture node: ${name}`);
  return node;
}

function measureText(
  knownDimensions: Size,
  availableSpace: Size,
  _nodeId: NodeId<TextMeasureContext>,
  context: TextMeasureContext | undefined,
): Size {
  if (knownDimensions.width !== undefined && knownDimensions.height !== undefined) {
    return new Size(knownDimensions.width, knownDimensions.height);
  }
  const measured = context
    ? measureTextContext(context, knownDimensions, availableSpace)
    : Size.zero();
  return new Size(
    knownDimensions.width ?? measured.width,
    knownDimensions.height ?? measured.height,
  );
}

function measureTextContext(context: TextMeasureContext, known: Size, available: Size): Size {
  const inlineAxis: AxisName = context.writingMode === "horizontal" ? "width" : "height";
  const blockAxis: AxisName = inlineAxis === "width" ? "height" : "width";
  const lines = context.text.split("\u200b");
  const minLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const maxLineLength = lines.reduce((sum, line) => sum + line.length, 0);
  const inlineSize = Math.max(
    known[inlineAxis] ??
      resolveAvailableInlineSize(available[inlineAxis], minLineLength, maxLineLength),
    minLineLength * 10,
  );
  const blockSize = known[blockAxis] ?? computeBlockSize(lines, inlineSize);
  return context.writingMode === "horizontal"
    ? new Size(inlineSize, blockSize)
    : new Size(blockSize, inlineSize);
}

function resolveAvailableInlineSize(
  available: AvailableSpaceValue,
  minLineLength: number,
  maxLineLength: number,
): number {
  if (available.type === "MinContent") return minLineLength * 10;
  if (available.type === "MaxContent") return maxLineLength * 10;
  return Math.min(available.value, maxLineLength * 10);
}

function computeBlockSize(lines: string[], inlineSize: number): number {
  const inlineLineLength = Math.floor(inlineSize / 10);
  let lineCount = 1;
  let currentLineLength = 0;
  for (const line of lines) {
    if (currentLineLength + line.length > inlineLineLength) {
      if (currentLineLength > 0) lineCount += 1;
      currentLineLength = line.length;
    } else {
      currentLineLength += line.length;
    }
  }
  return lineCount * 10;
}
