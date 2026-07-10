import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runGeneratedFixture } from "./generated-fixture-runner.ts";

const GRID_FIXTURE_DIR = new URL("../../vendor/taffy-upstream/tests/generated/grid/", import.meta.url);
const KNOWN_GRID_PARITY_GAPS = new Set<string>();

for (const fixtureName of readdirSync(GRID_FIXTURE_DIR)
    .filter((name) => name.endsWith(".rs") && name !== "mod.rs" && !KNOWN_GRID_PARITY_GAPS.has(name))
    .sort()) {
    test(`imported upstream generated grid fixture: ${fixtureName}`, () => {
        runGeneratedFixture(readFileSync(new URL(fixtureName, GRID_FIXTURE_DIR), "utf8"));
    });
}
