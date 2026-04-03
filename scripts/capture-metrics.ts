// Capture smoke-test metrics and assert the expected phase markers exist.

import { existsSync, readFileSync } from "fs";
import { runSmokeExample } from "./run-smoke-example";

// --- Internal state ---

const metricsPath = "dump/smoke.txt";

// --- Internal algorithm ---

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

// Verify the metrics dump still reports each top-level frame phase we care about.
for (const marker of ["js:", "render:", "sync:", "flush:", "worst:"]) {
  if (!metrics.includes(marker)) {
    throw new Error(`Metrics output missing marker: ${marker}`);
  }
}

console.log("metrics captured");
