import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runGeneratedFixture } from "./generated-fixture-runner.ts";

const FLEX_FIXTURE_DIR = new URL("../../vendor/taffy-upstream/tests/generated/flex/", import.meta.url);
const KNOWN_FLEX_PARITY_GAPS = new Set<string>();

for (const fixtureName of readdirSync(FLEX_FIXTURE_DIR)
    .filter((name) => name.endsWith(".rs") && name !== "mod.rs" && !KNOWN_FLEX_PARITY_GAPS.has(name))
    .sort()) {
    test(`imported upstream generated flex fixture: ${fixtureName}`, () => {
        runGeneratedFixture(readFileSync(new URL(fixtureName, FLEX_FIXTURE_DIR), "utf8"));
    });
}
