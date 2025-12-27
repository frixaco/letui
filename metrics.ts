interface MetricsData {
  frameTimes: number[];
  layoutTimes: number[];
  paintTimes: number[];
  frameCount: number;
  lastFrameTime: number;
}

const metrics: MetricsData = {
  frameTimes: [],
  layoutTimes: [],
  paintTimes: [],
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
  const layoutStats = calculateStats(metrics.layoutTimes);
  const paintStats = calculateStats(metrics.paintTimes);

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
    avgLayoutTime: Math.round(layoutStats.avg * 10) / 10,
    minLayoutTime: Math.round(layoutStats.min * 10) / 10,
    maxLayoutTime: Math.round(layoutStats.max * 10) / 10,
    avgPaintTime: Math.round(paintStats.avg * 10) / 10,
    minPaintTime: Math.round(paintStats.min * 10) / 10,
    maxPaintTime: Math.round(paintStats.max * 10) / 10,
  };
}

export function formatMetrics() {
  const m = getMetrics();
  return `${m.fps}fps | ${m.avgFrameTime}ms avg (${m.minFrameTime}-${m.maxFrameTime}) | ${m.heapMB}MB heap | ${m.frameCount} frames | ${m.avgLayoutTime}ms avg (${m.minLayoutTime}-${m.maxLayoutTime}) | ${m.avgPaintTime}ms avg (${m.minPaintTime}-${m.maxPaintTime})`;
}

export function resetMetrics() {
  metrics.frameTimes = [];
  metrics.layoutTimes = [];
  metrics.paintTimes = [];
  metrics.frameCount = 0;
  metrics.lastFrameTime = 0;
}
