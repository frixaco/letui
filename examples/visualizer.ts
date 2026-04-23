// Visualizer demo: responsive color field driven by a light spring simulation.
//
// Data flow:
// resize + speed controls + timer tick -> bar heights -> row StyledText buffers -> ff() effect -> chrome badges and color field

import { Column, Row, Text, $, ff, onKey, run } from "@";
import type { StyledText, TextSpan } from "@";

type SpeedKey = "1" | "2" | "3";

type SpeedPreset = {
  label: string;
  interval: number;
  spring: number;
  damping: number;
  drift: number;
  retargetChance: number;
};

const SPEEDS: Record<SpeedKey, SpeedPreset> = {
  "1": {
    label: "slow",
    interval: 120,
    spring: 0.14,
    damping: 0.78,
    drift: 0.04,
    retargetChance: 0.06,
  },
  "2": {
    label: "cruise",
    interval: 68,
    spring: 0.21,
    damping: 0.8,
    drift: 0.06,
    retargetChance: 0.08,
  },
  "3": {
    label: "warp",
    interval: 36,
    spring: 0.28,
    damping: 0.82,
    drift: 0.08,
    retargetChance: 0.1,
  },
};

const THEME = {
  shell: 0x060b14,
  panel: 0x0c1421,
  panelAlt: 0x101d2d,
  canvas: 0x15283b,
  chrome: 0x264d74,
  text: 0xe7f1fb,
  muted: 0x97add1,
  cyan: 0x55e1c8,
  amber: 0xffc96a,
  ink: 0x071017,
} as const;

const title = Text({
  text: "VISUALIZER // TERMINAL COLOR FIELD",
  foreground: THEME.cyan,
});
const meta = Text({ text: "", foreground: THEME.muted, wrap: "word" });
const patternBadge = Text({
  text: " random bounce ",
  foreground: THEME.ink,
  background: THEME.cyan,
  paddingX: 1,
});
const speedBadge = Text({
  text: "",
  foreground: THEME.ink,
  background: THEME.amber,
  paddingX: 1,
});
const statusBadge = Text({
  text: "",
  foreground: THEME.ink,
  background: THEME.cyan,
  paddingX: 1,
});
const helpLine = Text({
  text: "1 slow   2 cruise   3 warp   space pause   q save metrics + quit",
  foreground: THEME.muted,
  wrap: "word",
});
const noteLine = Text({
  text: "responsive field uses actual panel width, stable row nodes, and timer swaps when the speed preset changes",
  foreground: THEME.muted,
  wrap: "word",
});

const barsHost = Column(
  {
    flexGrow: 1,
    minHeight: 12,
    gap: 0,
    background: THEME.canvas,
  },
  [],
);

const frame = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    padding: "1 1",
    background: THEME.panelAlt,
    border: { color: THEME.chrome, style: "rounded" },
  },
  [barsHost, helpLine],
);

const root = Column(
  {
    flexGrow: 1,
    padding: "1 1",
    gap: 1,
    background: THEME.shell,
  },
  [
    Column(
      {
        flexGrow: 1,
        gap: 1,
        padding: "1 1",
        background: THEME.panel,
        border: { color: THEME.chrome, style: "rounded" },
      },
      [
        Row({ justifyContent: "spaceBetween", gap: 1, flexWrap: "wrap" }, [
          Column({ gap: 0 }, [title, meta]),
          Row({ gap: 1, flexWrap: "wrap" }, [patternBadge, speedBadge, statusBadge]),
        ]),
        frame,
        noteLine,
      ],
    ),
  ],
);

const speed = $("2" as SpeedKey);
const paused = $(false);
const frameCount = $(0);

let rows: ReturnType<typeof Text>[] = [];
let rowTemplate = "";
let chartWidth = 0;
let chartHeight = 0;
let heights: number[] = [];
let velocities: number[] = [];
let targets: number[] = [];
let palette: number[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;

function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = c * (1 - Math.abs((huePrime % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (huePrime >= 0 && huePrime < 1) {
    r = c;
    g = x;
  } else if (huePrime < 2) {
    r = x;
    g = c;
  } else if (huePrime < 3) {
    g = c;
    b = x;
  } else if (huePrime < 4) {
    g = x;
    b = c;
  } else if (huePrime < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const m = lightness - c / 2;
  const red = Math.round((r + m) * 255);
  const green = Math.round((g + m) * 255);
  const blue = Math.round((b + m) * 255);
  return (red << 16) | (green << 8) | blue;
}

function styled(text: string, spans: TextSpan[]): StyledText {
  return { text, spans };
}

function buildRow(targetHeight: number): StyledText {
  const spans: TextSpan[] = [];

  for (let x = 0; x < chartWidth; x++) {
    if ((heights[x] ?? 0) >= targetHeight) {
      spans.push({
        start: x,
        end: x + 1,
        background: palette[x],
      });
    }
  }

  return styled(rowTemplate, spans);
}

function renderBars(): void {
  if (chartWidth === 0 || chartHeight === 0 || rows.length === 0) return;

  for (let rowIndex = 0; rowIndex < chartHeight; rowIndex++) {
    const threshold = chartHeight - rowIndex;
    rows[rowIndex]!.setText(buildRow(threshold));
  }
}

function rebuildField(width: number, height: number): void {
  chartWidth = Math.max(0, Math.floor(width));
  chartHeight = Math.max(0, Math.floor(height));

  rowTemplate = " ".repeat(chartWidth);
  rows = Array.from({ length: chartHeight }, () =>
    Text({
      text: rowTemplate,
      background: THEME.canvas,
    }),
  );
  barsHost.setChildren(rows);

  heights = Array.from({ length: chartWidth }, () => 1 + Math.random() * chartHeight * 0.7);
  velocities = Array.from({ length: chartWidth }, () => 0);
  targets = Array.from({ length: chartWidth }, () => 2 + Math.random() * chartHeight * 0.85);
  palette = Array.from({ length: chartWidth }, (_, index) =>
    hslToRgb((index / Math.max(1, chartWidth)) * 360, 1, 0.56),
  );

  renderBars();
}

function restartTicker(): void {
  if (ticker) clearInterval(ticker);

  const preset = SPEEDS[speed()];
  ticker = setInterval(() => {
    if (paused() || chartWidth === 0 || chartHeight === 0) return;

    const frameNumber = frameCount() + 1;
    const ceiling = Math.max(2, chartHeight);

    for (let index = 0; index < chartWidth; index++) {
      if (Math.random() < preset.retargetChance) {
        targets[index] = 2 + Math.random() * ceiling * 0.9;
      }

      const drift =
        Math.sin(frameNumber * preset.drift + index * 0.17) * ceiling * 0.18 +
        Math.sin(frameNumber * preset.drift * 0.6 + index * 0.07) * ceiling * 0.12;
      const target = Math.max(2, Math.min(ceiling, (targets[index] ?? 0) + drift));

      velocities[index] =
        (velocities[index] ?? 0) + (target - (heights[index] ?? 0)) * preset.spring;
      velocities[index] = (velocities[index] ?? 0) * preset.damping;
      heights[index] = Math.max(1, Math.min(ceiling, (heights[index] ?? 0) + velocities[index]!));
    }

    frameCount(frameNumber);
    renderBars();
  }, preset.interval);
}

ff(() => {
  const width = barsHost.frameWidth();
  const height = barsHost.frameHeight();
  const currentSpeed = speed();
  const preset = SPEEDS[currentSpeed];
  const running = !paused();
  const tick = frameCount();

  if (width > 0 && height > 0 && (width !== chartWidth || height !== chartHeight)) {
    rebuildField(width, height);
  }

  meta.setText(
    `bars ${chartWidth}   tick ${tick}   viewport ${chartWidth}w   speed ${preset.label} from actual panel width`,
  );
  speedBadge.setText(` speed ${currentSpeed} // ${preset.label} `);
  statusBadge.setText(running ? " running " : " paused ");
  statusBadge.setStyle({
    background: running ? THEME.amber : THEME.cyan,
    foreground: THEME.ink,
  });
});

function setSpeed(next: SpeedKey): void {
  if (speed() === next) return;
  speed(next);
  restartTicker();
}

onKey("1", () => setSpeed("1"));
onKey("2", () => setSpeed("2"));
onKey("3", () => setSpeed("3"));
onKey(" ", () => paused(!paused()));

const app = run(root, {
  debug: true,
  metricsPath: "dump/metrics.txt",
  appearance: "dark",
});

onKey("q", () => {
  if (ticker) clearInterval(ticker);
  app.quit();
});

restartTicker();
