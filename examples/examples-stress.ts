import { Column, Text, run, onKey } from "@/components";
import { COLORS } from "@/colors";

const args = Bun.argv.slice(2);
const width = parseInt(args[0]!, 10) || 32;
const height = parseInt(args[1]!, 10) || 32;
const iterations = parseInt(args[2]!, 10) || 1000;

const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";

const randomInt = (max: number) => Math.floor(Math.random() * max);
const randomColor = () => randomInt(0xffffff + 1);

function randomLine(): string {
  let out = "";
  for (let i = 0; i < width; i++) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

console.log(
  `Running letui stress: ${width}x${height} characters for ${iterations} frames...`,
);

const lines = Array.from({ length: height }, () =>
  Text({
    text: " ".repeat(width),
    foreground: COLORS.default.fg,
    background: COLORS.default.bg,
  }),
);

const root = Column(
  { gap: 0, padding: 0, background: COLORS.default.bg, flexGrow: 1 },
  lines,
);

const app = run(root, { debug: true });

onKey("q", () => app.quit());

const durationMs = 1000;
const start = Bun.nanoseconds();

async function runTest() {
  let frames = 0;
  while (frames < iterations) {
    const elapsedMs = (Bun.nanoseconds() - start) / 1e6;
    if (elapsedMs >= durationMs) break;

    for (let y = 0; y < height; y++) {
      lines[y]!.setText(randomLine());
      lines[y]!.setStyle({ foreground: randomColor() });
    }
    frames++;
    await Promise.resolve();
  }

  const totalTimeMs = (Bun.nanoseconds() - start) / 1e6;
  console.log("\n");
  console.log("Done! updates stopped");
  console.log(`Total Time: ${totalTimeMs.toFixed(2)} ms`);
  console.log(`Frames: ${frames}`);
  console.log(
    `Average per frame: ${(totalTimeMs / Math.max(1, frames)).toFixed(4)} ms`,
  );
}

void runTest();
