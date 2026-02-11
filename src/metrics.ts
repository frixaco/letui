interface MetricsData {
  frameTimes: number[];
  serializeTimes: number[];
  rustTimes: number[]; // FFI call: taffy layout + buffer paint
  syncTimes: number[]; // Reading frames back to JS
  flushTimes: number[];
  frameCount: number;
}

const metrics: MetricsData = {
  frameTimes: [],
  serializeTimes: [],
  rustTimes: [],
  syncTimes: [],
  flushTimes: [],
  frameCount: 0,
};

const MAX_SAMPLES = 120;

export function startFrame(): number {
  return Bun.nanoseconds();
}

export function startPhase(): number {
  return Bun.nanoseconds();
}

function recordTime(arr: number[], startTime: number): void {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000;
  arr.push(elapsed);
  if (arr.length > MAX_SAMPLES) arr.shift();
}

export function endSerialize(startTime: number): void {
  recordTime(metrics.serializeTimes, startTime);
}

export function endRust(startTime: number): void {
  recordTime(metrics.rustTimes, startTime);
}

export function endSync(startTime: number): void {
  recordTime(metrics.syncTimes, startTime);
}

export function endFlush(startTime: number): void {
  recordTime(metrics.flushTimes, startTime);
}

export function endFrame(startTime: number): void {
  recordTime(metrics.frameTimes, startTime);
  metrics.frameCount++;
}

interface Stats {
  avg: number;
  min: number;
  max: number;
  p99: number;
}

function calculateStats(times: number[]): Stats {
  if (times.length === 0) return { avg: 0, min: 0, max: 0, p99: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p99Idx = Math.floor(sorted.length * 0.99);
  const p99 = sorted[p99Idx] ?? max;
  return { avg, min, max, p99 };
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function getMetrics() {
  const frame = calculateStats(metrics.frameTimes);
  const serialize = calculateStats(metrics.serializeTimes);
  const rust = calculateStats(metrics.rustTimes);
  const sync = calculateStats(metrics.syncTimes);
  const flush = calculateStats(metrics.flushTimes);

  const fps = frame.avg > 0 ? Math.round(1000 / frame.avg) : 0;
  const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  return {
    fps,
    heapMB,
    frameCount: metrics.frameCount,
    frame,
    serialize,
    rust,
    sync,
    flush,
  };
}

export function formatMetrics(): string {
  const m = getMetrics();
  const f = m.frame;
  return [
    `${m.fps}fps | ${fmt(f.avg)}ms avg (${fmt(f.min)}-${fmt(f.max)}, p99:${fmt(f.p99)}) | ${m.heapMB}MB | ${m.frameCount} frames`,
    `  serialize: ${fmt(m.serialize.avg)}ms (${fmt(m.serialize.min)}-${fmt(m.serialize.max)})`,
    `  rust:      ${fmt(m.rust.avg)}ms (${fmt(m.rust.min)}-${fmt(m.rust.max)}) [layout+paint]`,
    `  sync:      ${fmt(m.sync.avg)}ms (${fmt(m.sync.min)}-${fmt(m.sync.max)}) [frames→JS]`,
    `  flush:     ${fmt(m.flush.avg)}ms (${fmt(m.flush.min)}-${fmt(m.flush.max)}) [terminal I/O]`,
  ].join("\n");
}

export function resetMetrics(): void {
  metrics.frameTimes = [];
  metrics.serializeTimes = [];
  metrics.rustTimes = [];
  metrics.syncTimes = [];
  metrics.flushTimes = [];
  metrics.frameCount = 0;
}

export function saveMetrics(filename: string): void {
  Bun.write(filename, formatMetrics() + "\n");
}
