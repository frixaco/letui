import { Column, Row, Text, run, onKey } from "@/components";
import { $, ff } from "@/signals";
import { saveMetrics } from "@/metrics";
import type { Node } from "@/types";

const DARK_BG = 0x0a0a0f;
const TICK_MS = 60;
const DEFAULT_BAR_COUNT = 120;
const MIN_FILL = 0.05;
const MAX_FILL = 0.95;

type Bar = {
  col: Node;
  gap: Node;
  bar: Node;
};

type PatternFn = (barIndex: number, tick: number, totalBars: number) => number;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function terminalBarCount(): number {
  return Math.max(1, process.stdout.columns ?? DEFAULT_BAR_COUNT);
}

function hslToHex(h: number, s = 1, l = 0.55): number {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = hue / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hPrime < 1) {
    r1 = c;
    g1 = x;
  } else if (hPrime < 2) {
    r1 = x;
    g1 = c;
  } else if (hPrime < 3) {
    g1 = c;
    b1 = x;
  } else if (hPrime < 4) {
    g1 = x;
    b1 = c;
  } else if (hPrime < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return (r << 16) | (g << 8) | b;
}

function pseudoNoise(seed: number): number {
  const noisy = Math.sin(seed * 12.9898) * 43758.5453123;
  const fractional = noisy - Math.floor(noisy);
  return fractional * 2 - 1;
}

function smoothWave(barIndex: number, tick: number, totalBars: number): number {
  const x = barIndex / totalBars;
  const t = tick * 0.05;
  const wave1 = Math.sin(x * Math.PI * 4 + t) * 0.3;
  const wave2 = Math.sin(x * Math.PI * 7 - t * 1.3) * 0.2;
  const wave3 = Math.sin(x * Math.PI * 13 + t * 0.7) * 0.1;
  const base = 0.35;
  return clamp(base + wave1 + wave2 + wave3, MIN_FILL, MAX_FILL);
}

function sharpPeaks(barIndex: number, tick: number, totalBars: number): number {
  const x = barIndex / totalBars;
  const t = tick * 0.08;
  const wave1 = Math.abs(Math.sin(x * Math.PI * 5 + t)) * 0.55;
  const wave2 = Math.abs(Math.sin(x * Math.PI * 11 - t * 1.4)) * 0.25;
  const base = 0.1;
  return clamp(base + wave1 + wave2, MIN_FILL, MAX_FILL);
}

function randomBounce(barIndex: number, tick: number, totalBars: number): number {
  const x = barIndex / totalBars;
  const t = tick * 0.1;
  const wave = Math.sin(x * Math.PI * 6 + t * 0.8) * 0.2;
  const peaks = Math.abs(Math.sin(x * Math.PI * 10 - t * 1.5)) * 0.2;
  const noise = pseudoNoise(barIndex * 0.77 + tick * 1.31) * 0.25;
  const base = 0.35;
  return clamp(base + wave + peaks + noise, MIN_FILL, MAX_FILL);
}

function createBar(barIndex: number, totalBars: number): Bar {
  const hue = (barIndex / totalBars) * 360;
  const color = hslToHex(hue);

  const gap = Text({
    text: " ",
    background: DARK_BG,
    foreground: DARK_BG,
    flexGrow: 60,
  });

  const bar = Text({
    text: " ",
    background: color,
    foreground: color,
    flexGrow: 40,
  });

  const col = Column({ flexGrow: 1, background: DARK_BG }, [gap, bar]);
  return { col, gap, bar };
}

function createBars(count: number): Bar[] {
  const nextBars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    nextBars.push(createBar(i, count));
  }
  return nextBars;
}

const tick = $(0);
const paused = $(false);
let pattern: PatternFn = smoothWave;
let bars = createBars(terminalBarCount());

const root = Row({ flexGrow: 1, background: DARK_BG }, bars.map((bar) => bar.col));

function syncBarsToTerminalWidth(): void {
  const nextCount = terminalBarCount();
  if (nextCount === bars.length) return;
  bars = createBars(nextCount);
  root.setChildren?.(bars.map((bar) => bar.col));
}

ff(() => {
  const t = tick();
  if (paused()) return;

  const totalBars = bars.length;
  for (let i = 0; i < totalBars; i++) {
    const currentBar = bars[i];
    if (!currentBar) continue;

    const fill = pattern(i, t, totalBars);
    const fillGrow = Math.max(1, Math.round(fill * 100));
    const gapGrow = Math.max(1, 100 - fillGrow);

    currentBar.bar.setStyle?.({ flexGrow: fillGrow });
    currentBar.gap.setStyle?.({ flexGrow: gapGrow });
  }
});

const timer = setInterval(() => {
  if (paused()) return;
  tick(tick() + 1);
}, TICK_MS);

const resizeHandler = () => syncBarsToTerminalWidth();
process.stdout.on("resize", resizeHandler);

const app = run(root, { debug: true });

let stopped = false;
function quit(): void {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  process.stdout.off("resize", resizeHandler);
  saveMetrics("dump/metrics-viz.txt");
  app.quit();
}

onKey("q", quit);
onKey(" ", () => paused(!paused()));
onKey("1", () => {
  pattern = smoothWave;
});
onKey("2", () => {
  pattern = sharpPeaks;
});
onKey("3", () => {
  pattern = randomBounce;
});
