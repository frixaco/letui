// Visualizer demo: animated color-field bars that resize with the viewport.

import { Column, Row, Text, run, onKey } from "@/components";
import { $, ff } from "@/signals";
import { saveMetrics } from "@/metrics";
import type { Node } from "@/types";

// --- Request/Result types ---

type Bar = {
  col: Node;
  gap: Node;
  bar: Node;
};

type Pattern = {
  label: string;
  fn: (barIndex: number, tick: number, totalBars: number) => number;
};

// --- Internal state ---

const THEME = {
  bg: 0x060b13,
  panel: 0x0b1420,
  panelAlt: 0x102032,
  border: 0x25425f,
  text: 0xe5f0ff,
  muted: 0x85a0c4,
  accent: 0x48e7c3,
  amber: 0xffc568,
  rose: 0xff7d91,
} as const;

const TICK_MS = 60;
const MIN_FILL = 0.05;
const MAX_FILL = 0.95;

// --- Internal algorithm ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  return clamp(0.35 + wave1 + wave2 + wave3, MIN_FILL, MAX_FILL);
}

function sharpPeaks(barIndex: number, tick: number, totalBars: number): number {
  const x = barIndex / totalBars;
  const t = tick * 0.08;
  const wave1 = Math.abs(Math.sin(x * Math.PI * 5 + t)) * 0.55;
  const wave2 = Math.abs(Math.sin(x * Math.PI * 11 - t * 1.4)) * 0.25;
  return clamp(0.1 + wave1 + wave2, MIN_FILL, MAX_FILL);
}

function randomBounce(barIndex: number, tick: number, totalBars: number): number {
  const x = barIndex / totalBars;
  const t = tick * 0.1;
  const wave = Math.sin(x * Math.PI * 6 + t * 0.8) * 0.2;
  const peaks = Math.abs(Math.sin(x * Math.PI * 10 - t * 1.5)) * 0.2;
  const noise = pseudoNoise(barIndex * 0.77 + tick * 1.31) * 0.25;
  return clamp(0.35 + wave + peaks + noise, MIN_FILL, MAX_FILL);
}

const PATTERNS: Pattern[] = [
  { label: "smooth wave", fn: smoothWave },
  { label: "sharp peaks", fn: sharpPeaks },
  { label: "random bounce", fn: randomBounce },
];

function createBar(barIndex: number, totalBars: number): Bar {
  const hue = (barIndex / totalBars) * 360;
  const color = hslToHex(hue);

  const gap = Text({
    text: " ",
    background: THEME.panelAlt,
    foreground: THEME.panelAlt,
    flexGrow: 60,
  });

  const bar = Text({
    text: " ",
    background: color,
    foreground: color,
    flexGrow: 40,
  });

  const col = Column({ flexGrow: 1, background: THEME.panelAlt }, [gap, bar]);
  return { col, gap, bar };
}

function createBars(count: number): Bar[] {
  const total = Math.max(1, count);
  return Array.from({ length: total }, (_, index) => createBar(index, total));
}

// --- View state ---

const tick = $(0);
const paused = $(false);
const patternIndex = $(0);
const barCount = $(40);

const title = Text({
  text: "VISUALIZER // TERMINAL COLOR FIELD",
  foreground: THEME.accent,
});

const meta = Text({
  text: "",
  foreground: THEME.muted,
});

const patternBadge = Text({
  text: "",
  foreground: THEME.bg,
  background: THEME.accent,
  paddingX: 1,
});

const stateBadge = Text({
  text: "",
  foreground: THEME.bg,
  background: THEME.amber,
  paddingX: 1,
});

const viewport = Row(
  {
    flexGrow: 1,
    background: THEME.panelAlt,
    alignItems: "stretch",
  },
  [],
);

const hintLine = Text({
  text: "1/2/3 pattern   space pause   q save metrics + quit",
  foreground: THEME.muted,
});

const footer = Text({
  text: "",
  foreground: THEME.muted,
});

const root = Column(
  {
    flexGrow: 1,
    gap: 1,
    padding: "1 1",
    background: THEME.bg,
  },
  [
    Column(
      {
        gap: 1,
        padding: "1 1",
        border: { color: THEME.border, style: "rounded" },
        background: THEME.panel,
      },
      [
        Row(
          {
            justifyContent: "spaceBetween",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          },
          [
            Column({ gap: 0 }, [title, meta]),
            Row({ gap: 1, flexWrap: "wrap" }, [patternBadge, stateBadge]),
          ],
        ),
      ],
    ),
    Column(
      {
        flexGrow: 1,
        gap: 1,
        padding: "1 1",
        border: { color: THEME.border, style: "rounded" },
        background: THEME.panel,
        minHeight: 12,
      },
      [viewport, hintLine],
    ),
    footer,
  ],
);

// --- Reactive sync ---

let bars = createBars(barCount());
viewport.setChildren?.(bars.map((bar) => bar.col));

function syncBarsToViewportWidth(): void {
  const measuredWidth = Math.floor(viewport.frameWidth());
  const nextCount = Math.max(12, measuredWidth > 0 ? measuredWidth - 2 : 40);
  if (nextCount === barCount()) return;
  barCount(nextCount);
}

ff(() => {
  viewport.frameWidth();
  syncBarsToViewportWidth();
});

ff(() => {
  const total = barCount();
  if (bars.length === total) return;
  bars = createBars(total);
  viewport.setChildren?.(bars.map((bar) => bar.col));
});

ff(() => {
  const currentTick = tick();
  const currentPattern = PATTERNS[patternIndex()] ?? PATTERNS[0]!;
  const isPaused = paused();

  title.setStyle({ foreground: isPaused ? THEME.rose : THEME.accent });
  meta.setText(
    `bars ${bars.length}   tick ${currentTick}   viewport ${Math.floor(viewport.frameWidth())}w   responsive count from actual panel width`,
  );
  patternBadge.setText(` ${currentPattern.label} `);
  stateBadge.setText(isPaused ? " paused " : " running ");
  stateBadge.setStyle({
    background: isPaused ? THEME.rose : THEME.amber,
  });
  footer.setText(
    "outer chrome uses minHeight + wrapped header badges while bar field stays stable under resize",
  );

  if (isPaused) return;

  const totalBars = bars.length;
  for (let i = 0; i < totalBars; i++) {
    const currentBar = bars[i];
    if (!currentBar) continue;

    const fill = currentPattern.fn(i, currentTick, totalBars);
    const fillGrow = Math.max(1, Math.round(fill * 100));
    const gapGrow = Math.max(1, 100 - fillGrow);

    currentBar.bar.setStyle?.({ flexGrow: fillGrow });
    currentBar.gap.setStyle?.({ flexGrow: gapGrow });
  }
});

// --- Runtime ---

const timer = setInterval(() => {
  if (paused()) return;
  tick(tick() + 1);
}, TICK_MS);

const app = run(root, { debug: true });

let stopped = false;
function quit(): void {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  saveMetrics("dump/metrics-viz.txt");
  app.quit();
}

onKey("q", quit);
onKey(" ", () => paused(!paused()));
onKey("1", () => patternIndex(0));
onKey("2", () => patternIndex(1));
onKey("3", () => patternIndex(2));
