import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runGeneratedFixture } from "./generated-fixture-runner.ts";

const LEAF_FIXTURE_DIR = new URL("../../vendor/taffy-upstream/tests/generated/leaf/", import.meta.url);

for (const fixtureName of readdirSync(LEAF_FIXTURE_DIR).filter((name) => name.endsWith(".rs") && name !== "mod.rs").sort()) {
    test(`imported upstream generated leaf fixture: ${fixtureName}`, () => {
        runGeneratedFixture(readFileSync(new URL(fixtureName, LEAF_FIXTURE_DIR), "utf8"));
    });
}
