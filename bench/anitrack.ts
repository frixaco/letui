/** AniTrack-shaped p99 render benchmark: result population -> focus navigation -> cell diff. */

import { Button, Column, Row, ScrollView, Text } from "../src/components.ts";
import { Renderer, type RenderTimings } from "../src/renderer.ts";
import { CellBuffer } from "../src/surface.ts";
import { diffFrame } from "../src/terminal.ts";

const WIDTH = 150;
const HEIGHT = 49;
const RESULT_COUNT = 105;
const RUNS = Number(process.env.LETUI_ANITRACK_BENCH_RUNS ?? 5);
const P99_BUDGET_MS = Number(process.env.LETUI_P99_BUDGET_MS ?? 12);
const RUN_NAVIGATION = process.env.LETUI_ANITRACK_BENCH_NAVIGATION !== "0";

type Sample = RenderTimings & {
  totalMs: number;
  flushMs: number;
  phase: "initial" | "populate" | "navigate";
};

const samples: Sample[] = [];

for (let run = 0; run < RUNS; run += 1) {
  runScenario();
}

const totals = samples.map((sample) => sample.totalMs);
const p99 = percentile(totals, 0.99);
const population = samples.filter((sample) => sample.phase === "populate");
const navigation = samples.filter((sample) => sample.phase === "navigate");
const worst = samples.reduce((left, right) => (left.totalMs > right.totalMs ? left : right));

console.log(
  [
    `anitrack-render: ${formatStats(totals)} (${samples.length} frames, ${RESULT_COUNT} results, ${WIDTH}x${HEIGHT})`,
    `populate: ${formatStats(population.map((sample) => sample.totalMs))}`,
    `navigate: ${formatStats(navigation.map((sample) => sample.totalMs))}`,
    `worst: ${format(worst.totalMs)}ms ${worst.phase} = tree ${format(worst.treeMs)} + layout ${format(worst.layoutMs)} (measure ${format(worst.measureMs)}, ${worst.measureCount} calls) + frame ${format(worst.framesMs)} + paint ${format(worst.paintMs)} + flush ${format(worst.flushMs)}`,
  ].join("\n"),
);

if (p99 >= P99_BUDGET_MS) {
  console.error(`AniTrack p99 budget exceeded: ${format(p99)}ms >= ${format(P99_BUDGET_MS)}ms`);
  process.exit(1);
}

function runScenario(): void {
  const viewport = ScrollView({ flexGrow: 1, minHeight: 0, gap: 0 }, []);
  const root = buildShell(viewport);
  const renderer = new Renderer();
  const current = new CellBuffer(WIDTH, HEIGHT);
  const previous = new CellBuffer(WIDTH, HEIGHT);

  render("initial");

  const buttons = Array.from({ length: RESULT_COUNT }, (_, index) => resultRow(index));
  viewport.setChildren?.(buttons);
  buttons[0]!.focus();
  render("populate");

  let activeIndex = 0;
  const moveTo = (nextIndex: number) => {
    const previousButton = buttons[activeIndex]!;
    const nextButton = buttons[nextIndex]!;
    previousButton.setStyle({ border: idleBorder() });
    nextButton.setStyle({ border: activeBorder() });
    nextButton.focus();
    viewport.scrollNodeIntoView(nextButton);
    activeIndex = nextIndex;
    render("navigate");
  };

  if (RUN_NAVIGATION) {
    for (let index = 1; index < buttons.length; index += 1) moveTo(index);
    for (let index = buttons.length - 2; index >= 0; index -= 1) moveTo(index);
    for (let iteration = 0; iteration < 10; iteration += 1) {
      moveTo(1);
      moveTo(0);
    }
  }

  function render(phase: Sample["phase"]): void {
    const started = performance.now();
    const result = renderer.render(root, WIDTH, HEIGHT, current, true);
    const flushStarted = performance.now();
    diffFrame(current, previous);
    previous.copyFrom(current);
    const flushMs = performance.now() - flushStarted;
    const totalMs = performance.now() - started;
    samples.push({ ...result.timings!, totalMs, flushMs, phase });
  }
}

function buildShell(viewport: ReturnType<typeof ScrollView>) {
  const header = Column({ paddingX: 1, borderBottom: idleBorder() }, [
    Row({ justifyContent: "spaceBetween", alignItems: "center", gap: 1 }, [
      Column({ gap: 0 }, [label("ANITRACK // TORRENT SEARCH"), label("focus results")]),
      Row({ gap: 1 }, [label(" ready "), label(` ${RESULT_COUNT} results `)]),
    ]),
  ]);
  const search = Column({ gap: 1, paddingX: 1, borderBottom: idleBorder() }, [
    Row({ gap: 1 }, [label("SEARCH"), label("Enter search   Tab results")]),
    Row({}, [label("shangri-la")]),
    Row({}, [label("━━━━━━━━━━━━━━━━━━━━")]),
  ]);
  const results = Column({ gap: 1, paddingX: 1, flexGrow: 1, minHeight: 0 }, [
    label("RESULTS"),
    label(`${RESULT_COUNT} results   scrollY 0`),
    viewport,
    label("/ search   Tab pane   arrows move   j/k or wheel scroll"),
    Row({}, [label("Enter stream"), label("q quit")]),
  ]);
  return Column({ flexGrow: 1, background: 0x101418 }, [header, search, results]);
}

function resultRow(index: number) {
  const number = index.toString().padStart(3, "0");
  return Button(
    {
      text: "",
      border: index === 0 ? activeBorder() : idleBorder(),
      paddingX: 1,
      foreground: 0xf4f7fa,
      onClick: () => {},
    },
    [
      Column({ gap: 0 }, [
        label(`  Shangri-La Frontier S02E${number} 1080p WEB-DL AAC2.0 H.264`),
        label(`  1.${index % 10} GiB  ·  2026-07-${String((index % 28) + 1).padStart(2, "0")}`),
      ]),
    ],
  );
}

function label(text: string) {
  return Text({ text, foreground: 0xc9d1d9, wrap: "word" });
}

function idleBorder() {
  return { color: 0x33404d, style: "rounded" as const };
}

function activeBorder() {
  return { color: 0x57c785, style: "rounded" as const };
}

function percentile(values: readonly number[], position: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const rank = Math.max(0, Math.min(1, position)) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower);
}

function formatStats(values: readonly number[]): string {
  if (values.length === 0) return "no samples";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${format(average)}ms avg (p95:${format(percentile(values, 0.95))} p99:${format(percentile(values, 0.99))} max:${format(Math.max(...values))})`;
}

function format(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}
