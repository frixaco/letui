let frameCount = 0;
let frameTimes: number[] = [];
let lastReportTime = Bun.nanoseconds();

const MAX_SAMPLES = 120;
const REPORT_INTERVAL_MS = 500;

export function startFrame(): number {
  return Bun.nanoseconds();
}

export function endFrame(startTime: number): void {
  const elapsed = (Bun.nanoseconds() - startTime) / 1_000_000; // ms
  frameCount++;

  frameTimes.push(elapsed);
  if (frameTimes.length > MAX_SAMPLES) {
    frameTimes.shift();
  }
}

export function getMetrics(): {
  fps: number;
  avgFrameTime: number;
  maxFrameTime: number;
  minFrameTime: number;
  heapMB: number;
  frameCount: number;
} {
  const len = frameTimes.length;
  if (len === 0) {
    return {
      fps: 0,
      avgFrameTime: 0,
      maxFrameTime: 0,
      minFrameTime: 0,
      heapMB: 0,
      frameCount: 0,
    };
  }

  const sum = frameTimes.reduce((a, b) => a + b, 0);
  const avg = sum / len;
  const max = Math.max(...frameTimes);
  const min = Math.min(...frameTimes);
  const fps = avg > 0 ? 1000 / avg : 0;
  const heapMB = process.memoryUsage().heapUsed / 1_048_576;

  return {
    fps: Math.round(fps),
    avgFrameTime: Math.round(avg * 100) / 100,
    maxFrameTime: Math.round(max * 100) / 100,
    minFrameTime: Math.round(min * 100) / 100,
    heapMB: Math.round(heapMB * 10) / 10,
    frameCount,
  };
}

export function shouldReport(): boolean {
  const now = Bun.nanoseconds();
  if ((now - lastReportTime) / 1_000_000 >= REPORT_INTERVAL_MS) {
    lastReportTime = now;
    return true;
  }
  return false;
}

export function formatMetrics(): string {
  const m = getMetrics();
  return `${m.fps}fps | ${m.avgFrameTime}ms avg (${m.minFrameTime}-${m.maxFrameTime}) | ${m.heapMB}MB heap | ${m.frameCount} frames`;
}

export function resetMetrics(): void {
  frameCount = 0;
  frameTimes = [];
  lastReportTime = Bun.nanoseconds();
}
