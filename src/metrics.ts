/** Lightweight frame metrics collector for smoke tests and perf debugging. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import type { RenderTimings } from "./renderer.ts";

export type FrameReason = "input" | "fetch" | "focus" | "resize" | "other";

type FrameSample = {
  id: number;
  reason: FrameReason;
  totalMs: number;
  jsMs: number;
  renderMs: number;
  renderTreeMs: number;
  renderLayoutMs: number;
  renderMeasureMs: number;
  renderMeasureCount: number;
  renderFramesMs: number;
  renderPaintMs: number;
  renderRebuilt: boolean;
  nodeCount: number;
  syncMs: number;
  flushMs: number;
};

interface Stats {
  avg: number;
  p95: number;
  p99: number;
  max: number;
}

interface MetricsSummary {
  fps: number;
  heapMB: number;
  frameCount: number;
  total: Stats;
  js: Stats;
  render: Stats;
  renderTree: Stats;
  renderLayout: Stats;
  renderMeasure: Stats;
  renderFrames: Stats;
  renderPaint: Stats;
  sync: Stats;
  flush: Stats;
  worstFrame: FrameSample | null;
}

const MAX_SAMPLES = 200;

let frameSamples: FrameSample[] = [];
let frameCount = 0;
let nextFrameId = 1;
let currentFrame: FrameSample | null = null;

export function startFrame(reason: FrameReason = "other"): number {
  currentFrame = {
    id: nextFrameId++,
    reason,
    totalMs: 0,
    jsMs: 0,
    renderMs: 0,
    renderTreeMs: 0,
    renderLayoutMs: 0,
    renderMeasureMs: 0,
    renderMeasureCount: 0,
    renderFramesMs: 0,
    renderPaintMs: 0,
    renderRebuilt: false,
    nodeCount: 0,
    syncMs: 0,
    flushMs: 0,
  };
  return performance.now();
}

export function startPhase(): number {
  return performance.now();
}

export function endJs(startTime: number): void {
  if (!currentFrame) return;
  currentFrame.jsMs = elapsedMs(startTime);
}

export function endRender(startTime: number, timings?: RenderTimings): void {
  if (!currentFrame) return;
  currentFrame.renderMs = elapsedMs(startTime);
  if (!timings) return;
  currentFrame.renderTreeMs = timings.treeMs;
  currentFrame.renderLayoutMs = timings.layoutMs;
  currentFrame.renderMeasureMs = timings.measureMs;
  currentFrame.renderMeasureCount = timings.measureCount;
  currentFrame.renderFramesMs = timings.framesMs;
  currentFrame.renderPaintMs = timings.paintMs;
  currentFrame.renderRebuilt = timings.rebuilt;
  currentFrame.nodeCount = timings.nodeCount;
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

  currentFrame = null;
}

export function getMetrics(): MetricsSummary {
  const fps =
    frameSamples.length > 0
      ? Math.round(1000 / calculateStats(frameSamples.map((sample) => sample.totalMs)).avg)
      : 0;

  const worstFrame = frameSamples.reduce<FrameSample | null>(
    (worst, sample) => (!worst || sample.totalMs >= worst.totalMs ? sample : worst),
    null,
  );

  return {
    fps,
    heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    frameCount,
    total: calculateStats(frameSamples.map((sample) => sample.totalMs)),
    js: calculateStats(frameSamples.map((sample) => sample.jsMs)),
    render: calculateStats(frameSamples.map((sample) => sample.renderMs)),
    renderTree: calculateStats(frameSamples.map((sample) => sample.renderTreeMs)),
    renderLayout: calculateStats(frameSamples.map((sample) => sample.renderLayoutMs)),
    renderMeasure: calculateStats(frameSamples.map((sample) => sample.renderMeasureMs)),
    renderFrames: calculateStats(frameSamples.map((sample) => sample.renderFramesMs)),
    renderPaint: calculateStats(frameSamples.map((sample) => sample.renderPaintMs)),
    sync: calculateStats(frameSamples.map((sample) => sample.syncMs)),
    flush: calculateStats(frameSamples.map((sample) => sample.flushMs)),
    worstFrame,
  };
}

export function formatMetrics(): string {
  const m = getMetrics();
  const worst = m.worstFrame;

  return [
    `${m.fps}fps | total ${formatStats(m.total)} | ${m.heapMB}MB | ${formatFrameCount(m.frameCount)}`,
    `js:     ${formatStats(m.js)}`,
    `render: ${formatStats(m.render)}`,
    `  tree: ${formatStats(m.renderTree)} | layout: ${formatStats(m.renderLayout)} (measure ${formatStats(m.renderMeasure)})`,
    `  frame: ${formatStats(m.renderFrames)} | paint: ${formatStats(m.renderPaint)}`,
    `sync:   ${formatStats(m.sync)}`,
    `flush:  ${formatStats(m.flush)}`,
    formatWorstFrame(worst),
  ].join("\n");
}

export function resetMetrics(): void {
  frameSamples = [];
  frameCount = 0;
  nextFrameId = 1;
  currentFrame = null;
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
  if (values.length === 0) return { avg: 0, p95: 0, p99: 0, max: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1]!,
  };
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function formatStats(stats: Stats): string {
  return `${fmt(stats.avg)}ms avg (p95:${fmt(stats.p95)} p99:${fmt(stats.p99)} max:${fmt(stats.max)})`;
}

function formatFrameCount(count: number): string {
  return count > MAX_SAMPLES ? `${count} frames (stats: last ${MAX_SAMPLES})` : `${count} frames`;
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

  const renderDetail = `tree ${fmt(sample.renderTreeMs)} + layout ${fmt(sample.renderLayoutMs)} (measure ${fmt(sample.renderMeasureMs)}, ${sample.renderMeasureCount} calls) + frame ${fmt(sample.renderFramesMs)} + paint ${fmt(sample.renderPaintMs)}`;
  const treeState = sample.renderRebuilt ? "rebuild" : "sync";
  return `worst: frame ${sample.id} ${fmt(sample.totalMs)}ms = js ${fmt(sample.jsMs)} + render ${fmt(sample.renderMs)} [${renderDetail}; ${treeState}, ${sample.nodeCount} nodes] + sync ${fmt(sample.syncMs)} + flush ${fmt(sample.flushMs)} | reason:${sample.reason}`;
}
