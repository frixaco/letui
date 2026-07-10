import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runGeneratedFixture } from "./generated-fixture-runner.ts";

const BLOCK_FIXTURE_DIR = new URL("../../vendor/taffy-upstream/tests/generated/block/", import.meta.url);

for (const fixtureName of readdirSync(BLOCK_FIXTURE_DIR)
    .filter((name) => name.endsWith(".rs") && name !== "mod.rs")
    .sort()) {
    test(`imported upstream generated block fixture: ${fixtureName}`, () => {
        runGeneratedFixture(readFileSync(new URL(fixtureName, BLOCK_FIXTURE_DIR), "utf8"));
    });
}
