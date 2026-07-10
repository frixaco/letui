/** Cached direct-render benchmark and the project's sub-millisecond performance gate. */

import { Column, Row, Text } from "../src/components.ts";
import { Renderer } from "../src/renderer.ts";
import { CellBuffer } from "../src/surface.ts";

const iterations = Number(process.env.LETUI_BENCH_ITERATIONS ?? 2_000);
const budgetMs = Number(process.env.LETUI_RENDER_BUDGET_MS ?? 1);
const changingLabel = Text({ text: "frame 0", foreground: 0x8bd450 });
const rows = Array.from({ length: 20 }, (_, index) =>
  Row({ gap: 1 }, [
    Text({ text: `row ${index.toString().padStart(2, "0")}`, foreground: 0x9aa7b4 }),
    Text({ text: "representative content", foreground: 0xf4f7fa }),
  ]),
);
const root = Column({ padding: 1, gap: 1, background: 0x101418 }, [changingLabel, ...rows]);
const renderer = new Renderer();
const buffer = new CellBuffer(80, 24);

for (let index = 0; index < 200; index += 1) renderer.render(root, 80, 24, buffer);

const started = performance.now();
for (let index = 0; index < iterations; index += 1) {
  changingLabel.setText(`frame ${index}`);
  renderer.render(root, 80, 24, buffer);
}
const elapsed = performance.now() - started;
const average = elapsed / iterations;

console.log(`direct-render: ${average.toFixed(4)} ms avg (${iterations} iterations, 62 nodes)`);
if (average >= budgetMs) {
  console.error(`render budget exceeded: ${average.toFixed(4)} ms >= ${budgetMs.toFixed(4)} ms`);
  process.exit(1);
}
