import { existsSync, readFileSync } from "fs";
import { runSmokeExample } from "./run-smoke-example";

const metricsPath = "dump/smoke.txt";

const result = await runSmokeExample({
  env: {
    LETUI_SMOKE_DEBUG: "1",
    LETUI_METRICS_PATH: metricsPath,
  },
  screenPath: "dump/screen.txt",
});

if (result.exitCode !== 0) {
  throw new Error(`Metrics smoke exited with code ${result.exitCode}`);
}

if (!existsSync(metricsPath)) {
  throw new Error(`Metrics file missing: ${metricsPath}`);
}

const metrics = readFileSync(metricsPath, "utf8");

for (const marker of ["serialize:", "textSync:", "rust:", "flush:"]) {
  if (!metrics.includes(marker)) {
    throw new Error(`Metrics output missing marker: ${marker}`);
  }
}

console.log("metrics captured");
