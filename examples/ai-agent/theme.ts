/**
 * AI-agent visual language: palette, motion, navigation, and logo presentation.
 * Animation frame -> quantized/coalesced orb spans -> styled logo text
 */

import type { StyledText } from "@";
import type { CodexModel } from "./codex-client.ts";
import { styled, type StyledSegment } from "../helpers.ts";

export const THEME = {
  shell: 0x16181a,
  panel: 0x16181a,
  panelRaised: 0x242628,
  selection: 0x273735,
  selectionStrong: 0x426969,
  text: 0xffffff,
  prose: 0xffffff,
  muted: 0x8b8c8d,
  dim: 0x545557,
  line: 0xffffff,
  composerLine: 0xffffff,
  lineSoft: 0x363839,
  highlight: 0xf1ff5d,
  shortcut: 0x5ea1ff,
  userPrompt: 0x8efc7f,
  markdownCode: 0xb0ba4b,
  syntaxBlue: 0x0091ff,
  mentionAt: 0x3ed4ff,
  mentionSelection: 0x3d4047,
  mentionAction: 0xf4ff78,
  scrollTrack: 0x30343a,
  scrollThumb: 0xe9e9e9,
  dialLow: 0xffd702,
  dialMedium: 0x3effa5,
  dialHigh: 0x3ed4ff,
  dialUltra: 0xd8b3ff,
  purple: 0x609e7b,
  violet: 0x548a74,
  blue: 0x549ab7,
  cyan: 0x549ab7,
  green: 0x62a27c,
  amber: 0xb79862,
  red: 0xc87373,
} as const;

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const ACTIVITY_FRAMES = ["⠿", "⠷", "⠯", "⠟", "⠻", "⠽"] as const;
export const NEXT_KEYS = new Set(["\x1b[B", "\x1bOB"]);
export const PREV_KEYS = new Set(["\x1b[A", "\x1bOA"]);
export const RIGHT_KEYS = new Set(["\x1b[C", "\x1bOC"]);
export const LEFT_KEYS = new Set(["\x1b[D", "\x1bOD"]);
export const DEFAULT_DIAL_EFFORTS = [
  { reasoningEffort: "low", description: "Fast responses for straightforward tasks" },
  { reasoningEffort: "medium", description: "Balanced reasoning for everyday tasks" },
  { reasoningEffort: "high", description: "Deep reasoning for hard tasks" },
  { reasoningEffort: "xhigh", description: "The most capable mode for hard, open-ended tasks" },
] satisfies CodexModel["supportedReasoningEfforts"];

const ORB_WIDTH = 48;
const ORB_HEIGHT = 39;
const ORB_ROWS = 21;
const ORB_ROW_OFFSET = 9;
const ORB_SPEED = 0.9;
const ORB_GLYPHS = [" ", ".", "·", "·", ":", ":", "•", "•", "●", "●"] as const;
const ORB_PRIMARY = 0x1a004d;
const ORB_SECONDARY = 0x3effa5;
const ORB_COLORS = createOrbPalette(8);
const orbNoise = createNoise2D(Date.now());

export function logoText(frame: number, start = 0, end: number = ORB_ROWS): StyledText {
  const segments: StyledSegment[] = [];
  const firstRow = clamp(start, 0, ORB_ROWS);
  const lastRow = clamp(end, firstRow, ORB_ROWS);
  const time = frame / 30;
  const centerX = ORB_WIDTH / 2;
  const centerY = (ORB_HEIGHT - 1) / 2;
  const baseRadius = Math.min(centerX - 1, ORB_HEIGHT - 1) / ((1 + 0.055) * 1.06);
  const breath = Math.sin(time * 1.35 * ORB_SPEED);
  const breathStrength = (breath * 0.5 + 0.5) ** 2;
  const radius = baseRadius * (1 + breath * 0.055);
  const radiusSquared = (radius * 1.06) ** 2;
  const lightTime = time * 0.45 * ORB_SPEED;
  const lightX = -0.56 + Math.sin(lightTime) * 0.16;
  const lightY = -0.66 + Math.cos(lightTime * 0.7) * 0.1;
  const glintX = Math.cos(time * 1.55 * ORB_SPEED) * 0.38 - 0.18;
  const glintY = Math.sin(time * 1.15 * ORB_SPEED) * 0.25 - 0.26;

  for (let row = firstRow; row < lastRow; row++) {
    const virtualRow = row + ORB_ROW_OFFSET;
    appendLogoSegment(segments, " ".repeat((50 - ORB_WIDTH) / 2));
    for (let column = 0; column < ORB_WIDTH; column++) {
      const x = column - centerX;
      const y = (virtualRow - centerY) * 2;
      const distanceSquared = x * x + y * y;
      if (distanceSquared >= radiusSquared) {
        appendLogoSegment(segments, " ");
        continue;
      }

      const distance = Math.sqrt(distanceSquared) / radius;
      if (distance > 1) {
        const noise = sampleOrbNoise(
          column * 1.35 + Math.sin(time * 1.3 * ORB_SPEED) * 8,
          virtualRow * 1.1 - time * 7 * ORB_SPEED,
          time * 1.6,
          ORB_SPEED,
        );
        const edge = Math.max(0, 1 - (distance - 1) / 0.06);
        const facing = Math.max(0, 0.25 + (x / radius) * 0.85 - (y / radius) * 0.18);
        const intensity =
          edge * edge * (0.045 + noise * 0.04 + facing * 0.12) * (0.96 + breathStrength * 0.16);
        if (intensity < 0.055) {
          appendLogoSegment(segments, " ");
          continue;
        }
        appendLogoSegment(
          segments,
          intensity > 0.14 ? "·" : ".",
          orbColor(clamp(intensity * 1.8, 0, 1)),
        );
        continue;
      }

      const normalizedX = x / radius;
      const normalizedY = y / radius;
      const depth = Math.sqrt(Math.max(0, 1 - distance * distance));
      const rotation =
        time * 1.35 * ORB_SPEED +
        depth * 3.2 +
        Math.sin(normalizedY * 4.4 + time * 0.85 * ORB_SPEED) * 0.7;
      const rotationCos = Math.cos(rotation);
      const rotationSin = Math.sin(rotation);
      const rotatedX = normalizedX * rotationCos - normalizedY * rotationSin;
      const rotatedY = normalizedX * rotationSin + normalizedY * rotationCos;
      const broadNoise = sampleOrbNoise(
        rotatedX * radius * 1.35 + depth * 7 + Math.sin(time * 1.3 * ORB_SPEED) * 8,
        rotatedY * radius * 1.1 - time * 7 * ORB_SPEED,
        time * 1.6,
        ORB_SPEED,
      );
      const fineNoise = sampleOrbNoise(
        rotatedX * radius * 0.58 - time * 9 * ORB_SPEED,
        rotatedY * radius * 1.65 + Math.cos(time * 1.05 * ORB_SPEED) * 6,
        time * 1.1,
        ORB_SPEED * 0.7,
      );
      const surfaceRipple =
        Math.sin(rotatedX * 3.8 + rotatedY * 2.6 + time * 1.4 * ORB_SPEED) * 0.15 +
        Math.sin(rotatedY * 6.2 - time * 0.9 * ORB_SPEED) * 0.055;
      const light = normalizedX * lightX + normalizedY * lightY + depth * 0.6 + surfaceRipple;
      const diffuse = smoothstep(clamp((light + 0.08) / 1.06, 0, 1));
      const lit = diffuse ** 0.82;
      const shadow = Math.max(0, 1 - diffuse) ** 1.45;
      const rim = Math.max(0, 1 - depth) ** 2.45;
      const rightEdge = Math.max(0, 0.32 + normalizedX * 1.05 - normalizedY * 0.18) ** 1.25;
      const edgeHighlight = rim * rightEdge;
      const edgeGlint =
        Math.exp(-((normalizedX - 0.74) ** 2 * 34 + (normalizedY + 0.02) ** 2 * 2.8)) *
        edgeHighlight;
      const movingGlint = Math.exp(
        -((normalizedX - glintX) ** 2 * 58 + (normalizedY - glintY) ** 2 * 130),
      );
      const noise = broadNoise * 0.64 + fineNoise * 0.36;
      const noisePeak = Math.max(0, (noise - 0.58) / 0.42) ** 1.7;
      const streakA = Math.sin(rotatedY * 11 + rotatedX * 3.5 + depth * 5 + time * 4.6 * ORB_SPEED);
      const streakB = Math.sin(
        rotatedX * 8.5 - rotatedY * 4.5 + depth * 7 - time * 3.6 * ORB_SPEED,
      );
      const texture =
        (noise - 0.5) * 0.12 +
        noisePeak * 0.09 +
        Math.max(0, streakA * 0.5 + 0.5) ** 4 * 0.12 +
        Math.max(0, streakB * 0.5 + 0.5) ** 5 * 0.14;
      const minimum = 0.105 + (1 - distance) * 0.035 + broadNoise * 0.012;
      const intensity = clamp(
        Math.max(
          minimum,
          (0.045 + lit * 0.72 + depth * 0.055 - shadow * 0.105) * (0.88 + texture) +
            edgeHighlight * 0.26 +
            edgeGlint * 0.95 +
            movingGlint * (0.38 + lit) * 1.28,
        ) *
          (0.96 + breathStrength * 0.16),
        0,
        1,
      );
      const glyphIndex = clamp(Math.floor(intensity * ORB_GLYPHS.length), 1, ORB_GLYPHS.length - 1);
      const colorIntensity = clamp(intensity * 0.58 + lit * 0.3 + edgeHighlight * 0.12, 0, 1);
      appendLogoSegment(segments, ORB_GLYPHS[glyphIndex]!, orbColor(colorIntensity));
    }
    if (row < lastRow - 1) appendLogoSegment(segments, "\n");
  }
  return styled(segments);
}

function sampleOrbNoise(x: number, y: number, time: number, speed: number): number {
  return (orbNoise(x / 20, y / 20 + time * speed) + 1) * 0.5;
}

function orbColor(intensity: number): number {
  return ORB_COLORS[Math.round(intensity * (ORB_COLORS.length - 1))]!;
}

function smoothstep(value: number): number {
  return value * value * (3 - value * 2);
}

function createNoise2D(seed: number): (x: number, y: number) => number {
  const random = mulberry32(seed);
  const permutation = Array.from({ length: 256 }, (_, index) => index);
  for (let index = permutation.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [permutation[index], permutation[swap]] = [permutation[swap]!, permutation[index]!];
  }
  const table = Array.from({ length: 512 }, (_, index) => permutation[index & 255]!);
  const gradients = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const skew = (Math.sqrt(3) - 1) / 2;
  const unskew = (3 - Math.sqrt(3)) / 6;

  return (x, y) => {
    const cell = Math.floor(x + (x + y) * skew);
    const row = Math.floor(y + (x + y) * skew);
    const offset = (cell + row) * unskew;
    const x0 = x - (cell - offset);
    const y0 = y - (row - offset);
    const stepX = x0 > y0 ? 1 : 0;
    const stepY = x0 > y0 ? 0 : 1;
    const x1 = x0 - stepX + unskew;
    const y1 = y0 - stepY + unskew;
    const x2 = x0 - 1 + 2 * unskew;
    const y2 = y0 - 1 + 2 * unskew;
    const corner = (dx: number, dy: number, gradient: readonly [number, number]) => {
      const falloff = 0.5 - dx * dx - dy * dy;
      return falloff <= 0 ? 0 : falloff ** 4 * (gradient[0] * dx + gradient[1] * dy);
    };
    const gradient0 = gradients[table[(cell & 255) + table[row & 255]!]! & 7]!;
    const gradient1 = gradients[table[((cell + stepX) & 255) + table[(row + stepY) & 255]!]! & 7]!;
    const gradient2 = gradients[table[((cell + 1) & 255) + table[(row + 1) & 255]!]! & 7]!;
    return 70 * (corner(x0, y0, gradient0) + corner(x1, y1, gradient1) + corner(x2, y2, gradient2));
  };
}

function mulberry32(seed: number): () => number {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createOrbPalette(size: number): number[] {
  const primaryRed = (ORB_PRIMARY >> 16) & 0xff;
  const primaryGreen = (ORB_PRIMARY >> 8) & 0xff;
  const primaryBlue = ORB_PRIMARY & 0xff;
  const secondaryRed = (ORB_SECONDARY >> 16) & 0xff;
  const secondaryGreen = (ORB_SECONDARY >> 8) & 0xff;
  const secondaryBlue = ORB_SECONDARY & 0xff;

  return Array.from({ length: size }, (_, index) => {
    const intensity = index / (size - 1);
    const red = Math.round(primaryRed + (secondaryRed - primaryRed) * intensity);
    const green = Math.round(primaryGreen + (secondaryGreen - primaryGreen) * intensity);
    const blue = Math.round(primaryBlue + (secondaryBlue - primaryBlue) * intensity);
    return (red << 16) | (green << 8) | blue;
  });
}

function appendLogoSegment(segments: StyledSegment[], text: string, foreground?: number): void {
  const previous = segments[segments.length - 1];
  if (previous && previous.foreground === foreground) {
    previous.text += text;
    return;
  }
  segments.push({ text, foreground });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
