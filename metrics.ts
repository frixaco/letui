interface MetricsData {
  frameTimes: number[];
  serializeTimes: number[];
  layoutTimes: number[];
  paintTimes: number[];
  flushTimes: number[];
  frameCount: number;
  lastFrameTime: number;
}

const metrics: MetricsData = {
  frameTimes: [],
  serializeTimes: [],
  layoutTimes: [],
  paintTimes: [],
  flushTimes: [],
  frameCount: 0,
  lastFrameTime: 0,
};

const MAX_SAMPLES = 120; // Keep last 120 frames for rolling average

export function startFrame() {
  return Bun.nanoseconds();
}

export function startPhase() {
  return Bun.nanoseconds();
}

export function endSerialize(startTime: number) {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  metrics.serializeTimes.push(elapsed);
  if (metrics.serializeTimes.length > MAX_SAMPLES) {
    metrics.serializeTimes.shift();
  }
}

export function endLayout(startTime: number) {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  metrics.layoutTimes.push(elapsed);
  if (metrics.layoutTimes.length > MAX_SAMPLES) {
    metrics.layoutTimes.shift();
  }
}

export function endPaint(startTime: number) {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  metrics.paintTimes.push(elapsed);
  if (metrics.paintTimes.length > MAX_SAMPLES) {
    metrics.paintTimes.shift();
  }
}

export function endFlush(startTime: number) {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  metrics.flushTimes.push(elapsed);
  if (metrics.flushTimes.length > MAX_SAMPLES) {
    metrics.flushTimes.shift();
  }
}

export function endFrame(startTime: number): void {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  metrics.frameTimes.push(elapsed);
  metrics.frameCount++;
  metrics.lastFrameTime = elapsed;
  if (metrics.frameTimes.length > MAX_SAMPLES) {
    metrics.frameTimes.shift();
  }
}

function calculateStats(times: number[]) {
  if (times.length === 0) return { avg: 0, min: 0, max: 0 };
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { avg, min, max };
}

export function getMetrics() {
  const frameStats = calculateStats(metrics.frameTimes);
  const serializeStats = calculateStats(metrics.serializeTimes);
  const layoutStats = calculateStats(metrics.layoutTimes);
  const paintStats = calculateStats(metrics.paintTimes);
  const flushStats = calculateStats(metrics.flushTimes);

  const fps =
    metrics.lastFrameTime > 0 ? Math.round(1000 / metrics.lastFrameTime) : 0;
  const memUsage = process.memoryUsage();
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  return {
    fps,
    avgFrameTime: Math.round(frameStats.avg * 10) / 10,
    minFrameTime: Math.round(frameStats.min * 10) / 10,
    maxFrameTime: Math.round(frameStats.max * 10) / 10,
    heapMB,
    frameCount: metrics.frameCount,
    avgSerializeTime: Math.round(serializeStats.avg * 10) / 10,
    minSerializeTime: Math.round(serializeStats.min * 10) / 10,
    maxSerializeTime: Math.round(serializeStats.max * 10) / 10,
    avgLayoutTime: Math.round(layoutStats.avg * 10) / 10,
    minLayoutTime: Math.round(layoutStats.min * 10) / 10,
    maxLayoutTime: Math.round(layoutStats.max * 10) / 10,
    avgPaintTime: Math.round(paintStats.avg * 10) / 10,
    minPaintTime: Math.round(paintStats.min * 10) / 10,
    maxPaintTime: Math.round(paintStats.max * 10) / 10,
    avgFlushTime: Math.round(flushStats.avg * 10) / 10,
    minFlushTime: Math.round(flushStats.min * 10) / 10,
    maxFlushTime: Math.round(flushStats.max * 10) / 10,
  };
}

export function formatMetrics() {
  const m = getMetrics();
  return [
    `${m.fps}fps | ${m.avgFrameTime}ms avg (${m.minFrameTime}-${m.maxFrameTime}) | ${m.heapMB}MB heap | ${m.frameCount} frames`,
    `  serialize: ${m.avgSerializeTime}ms (${m.minSerializeTime}-${m.maxSerializeTime})`,
    `  layout:    ${m.avgLayoutTime}ms (${m.minLayoutTime}-${m.maxLayoutTime})`,
    `  paint:     ${m.avgPaintTime}ms (${m.minPaintTime}-${m.maxPaintTime})`,
    `  flush:     ${m.avgFlushTime}ms (${m.minFlushTime}-${m.maxFlushTime})`,
  ].join('\n');
}

export function resetMetrics() {
  metrics.frameTimes = [];
  metrics.serializeTimes = [];
  metrics.layoutTimes = [];
  metrics.paintTimes = [];
  metrics.flushTimes = [];
  metrics.frameCount = 0;
  metrics.lastFrameTime = 0;
}

export function saveMetrics(filename: string) {
  const m = getMetrics();
  const lines = [
    `=== Performance Metrics ===`,
    `Frames: ${m.frameCount}`,
    ``,
    `Frame Time:`,
    `  avg: ${m.avgFrameTime}ms`,
    `  min: ${m.minFrameTime}ms`,
    `  max: ${m.maxFrameTime}ms`,
    ``,
    `Serialize Time:`,
    `  avg: ${m.avgSerializeTime}ms`,
    `  min: ${m.minSerializeTime}ms`,
    `  max: ${m.maxSerializeTime}ms`,
    ``,
    `Layout Time:`,
    `  avg: ${m.avgLayoutTime}ms`,
    `  min: ${m.minLayoutTime}ms`,
    `  max: ${m.maxLayoutTime}ms`,
    ``,
    `Paint Time:`,
    `  avg: ${m.avgPaintTime}ms`,
    `  min: ${m.minPaintTime}ms`,
    `  max: ${m.maxPaintTime}ms`,
    ``,
    `Flush Time:`,
    `  avg: ${m.avgFlushTime}ms`,
    `  min: ${m.minFlushTime}ms`,
    `  max: ${m.maxFlushTime}ms`,
    ``,
    `Memory: ${m.heapMB}MB heap`,
    `FPS (last frame): ${m.fps}`,
    ``,
    `Raw frame times (ms): ${metrics.frameTimes.map(t => t.toFixed(2)).join(', ')}`,
  ];
  Bun.write(filename, lines.join('\n') + '\n');
}
