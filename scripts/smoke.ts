import { runSmokeExample } from "./run-smoke-example";

function assertContains(haystack: string, needle: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing smoke marker: ${needle}`);
  }
}

const result = await runSmokeExample({
  screenPath: "dump/screen.txt",
});

if (result.exitCode !== 0) {
  throw new Error(`Smoke example exited with code ${result.exitCode}`);
}

assertContains(result.raw, "letui smoke");
assertContains(result.raw, "[smoke:input] typed");
assertContains(result.raw, "[smoke:submit] typed");
assertContains(result.raw, "[smoke:status] ready");
assertContains(result.raw, "[smoke:scroll]");

if (!/[┌┐└┘│─]/.test(result.screen)) {
  throw new Error("Smoke output missing visible border glyphs");
}

console.log("smoke ok");
