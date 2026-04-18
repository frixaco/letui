/** Lightweight frame metrics collector for smoke tests and perf debugging. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

export type FrameReason = "input" | "fetch" | "focus" | "resize" | "other";

type FrameSample = {
  id: number;
  reason: FrameReason;
  totalMs: number;
  jsMs: number;
  renderMs: number;
  syncMs: number;
  flushMs: number;
  textOps: number;
  textBytes: number;
  ffiBytes: number;
};

export type FrameCounters = {
  textOps: number;
  textBytes: number;
  ffiBytes: number;
};

interface Stats {
  avg: number;
  p95: number;
  max: number;
}

interface MetricsSummary {
  fps: number;
  heapMB: number;
  frameCount: number;
  total: Stats;
  js: Stats;
  render: Stats;
  sync: Stats;
  flush: Stats;
  textOps: Stats;
  textBytes: Stats;
  ffiBytes: Stats;
  worstFrame: FrameSample | null;
}

const MAX_SAMPLES = 200;

let frameSamples: FrameSample[] = [];
let frameCount = 0;
let nextFrameId = 1;
let currentFrame: FrameSample | null = null;
let worstFrame: FrameSample | null = null;

export function startFrame(reason: FrameReason = "other"): number {
  currentFrame = {
    id: nextFrameId++,
    reason,
    totalMs: 0,
    jsMs: 0,
    renderMs: 0,
    syncMs: 0,
    flushMs: 0,
    textOps: 0,
    textBytes: 0,
    ffiBytes: 0,
  };
  return performance.now();
}

export function startPhase(): number {
  return performance.now();
}

export function endJs(startTime: number, counters: FrameCounters): void {
  if (!currentFrame) return;
  currentFrame.jsMs = elapsedMs(startTime);
  currentFrame.textOps = counters.textOps;
  currentFrame.textBytes = counters.textBytes;
  currentFrame.ffiBytes = counters.ffiBytes;
}

export function endRender(startTime: number): void {
  if (!currentFrame) return;
  currentFrame.renderMs = elapsedMs(startTime);
}

export function endSync(startTime: number): void {
  if (!currentFrame) return;
  currentFrame.syncMs = elapsedMs(startTime);
}

export function endFlush(startTime: number): void {
  if (!currentFrame) return;
  currentFrame.flushMs = elapsedMs(startTime);
}

export function endFrame(startTime: number): void {
  if (!currentFrame) return;

  currentFrame.totalMs = elapsedMs(startTime);
  frameCount++;

  const sample = { ...currentFrame };
  frameSamples.push(sample);
  if (frameSamples.length > MAX_SAMPLES) {
    frameSamples.shift();
  }

  if (!worstFrame || sample.totalMs >= worstFrame.totalMs) {
    worstFrame = sample;
  }

  currentFrame = null;
}

export function getMetrics(): MetricsSummary {
  const fps =
    frameSamples.length > 0
      ? Math.round(1000 / calculateStats(frameSamples.map((sample) => sample.totalMs)).avg)
      : 0;

  return {
    fps,
    heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    frameCount,
    total: calculateStats(frameSamples.map((sample) => sample.totalMs)),
    js: calculateStats(frameSamples.map((sample) => sample.jsMs)),
    render: calculateStats(frameSamples.map((sample) => sample.renderMs)),
    sync: calculateStats(frameSamples.map((sample) => sample.syncMs)),
    flush: calculateStats(frameSamples.map((sample) => sample.flushMs)),
    textOps: calculateStats(frameSamples.map((sample) => sample.textOps)),
    textBytes: calculateStats(frameSamples.map((sample) => sample.textBytes)),
    ffiBytes: calculateStats(frameSamples.map((sample) => sample.ffiBytes)),
    worstFrame,
  };
}

export function formatMetrics(): string {
  const m = getMetrics();
  const worst = m.worstFrame;

  return [
    `${m.fps}fps | total ${fmt(m.total.avg)}ms avg (p95:${fmt(m.total.p95)} max:${fmt(m.total.max)}) | ${m.heapMB}MB | ${m.frameCount} frames`,
    `js:     ${fmt(m.js.avg)}ms avg (p95:${fmt(m.js.p95)} max:${fmt(m.js.max)}) | text ops:${fmt(m.textOps.avg)} avg ${fmt(m.textOps.max)} max | text bytes:${fmt(m.textBytes.avg)} avg ${fmt(m.textBytes.max)} max | ffi bytes:${fmt(m.ffiBytes.avg)} avg ${fmt(m.ffiBytes.max)} max`,
    `render: ${fmt(m.render.avg)}ms avg (p95:${fmt(m.render.p95)} max:${fmt(m.render.max)})`,
    `sync:   ${fmt(m.sync.avg)}ms avg (p95:${fmt(m.sync.p95)} max:${fmt(m.sync.max)})`,
    `flush:  ${fmt(m.flush.avg)}ms avg (p95:${fmt(m.flush.p95)} max:${fmt(m.flush.max)})`,
    formatWorstFrame(worst),
  ].join("\n");
}

export function resetMetrics(): void {
  frameSamples = [];
  frameCount = 0;
  nextFrameId = 1;
  currentFrame = null;
  worstFrame = null;
}

export const DEFAULT_METRICS_PATH = "dump/metrics.txt";

export function resolveMetricsPath(explicitPath?: string | false): string | null {
  if (explicitPath === false) {
    return null;
  }

  return explicitPath ?? process.env.LETUI_METRICS_PATH ?? null;
}

export function saveMetrics(filename: string = DEFAULT_METRICS_PATH): void {
  ensureParentDir(filename);
  writeFileSync(filename, formatMetrics() + "\n", "utf8");
}

function elapsedMs(startTime: number): number {
  return performance.now() - startTime;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;

  const clamped = Math.max(0, Math.min(1, p));
  const rank = clamped * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) return sorted[lower]!;

  const weight = rank - lower;
  const lowValue = sorted[lower]!;
  const highValue = sorted[upper]!;
  return lowValue + (highValue - lowValue) * weight;
}

function calculateStats(values: number[]): Stats {
  if (values.length === 0) return { avg: 0, p95: 0, max: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1]!,
  };
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function ensureParentDir(path: string): void {
  const parent = dirname(path);
  if (parent !== "." && parent.length > 0) {
    mkdirSync(parent, { recursive: true });
  }
}

function formatWorstFrame(sample: FrameSample | null): string {
  if (!sample) {
    return "worst: no frames";
  }

  return `worst: frame ${sample.id} ${fmt(sample.totalMs)}ms = js ${fmt(sample.jsMs)} + render ${fmt(sample.renderMs)} + sync ${fmt(sample.syncMs)} + flush ${fmt(sample.flushMs)} | reason:${sample.reason}`;
}
