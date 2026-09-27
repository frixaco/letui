import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "./settings-store.ts";

let temporaryDirectory: string | null = null;

afterEach(() => {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe("Letty settings", () => {
  test("persists model and effort without owning thread history", () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "lty-settings-test-"));
    const path = join(temporaryDirectory, "settings.json");
    const settings = new SettingsStore(path);
    settings.set("model", "gpt-example");
    settings.set("effort", "low");

    const restored = new SettingsStore(path);
    expect(restored.get("model")).toBe("gpt-example");
    expect(restored.get("effort")).toBe("low");
  });
});
