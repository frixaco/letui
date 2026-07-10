import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runGeneratedFixture } from "./generated-fixture-runner.ts";

const MIXED_FIXTURE_SUITES = [
    "blockgrid",
    "blockflex",
    "gridflex",
];

for (const suiteName of MIXED_FIXTURE_SUITES) {
    const fixtureDir = new URL(`../../vendor/taffy-upstream/tests/generated/${suiteName}/`, import.meta.url);

    for (const fixtureName of readdirSync(fixtureDir)
        .filter((name) => name.endsWith(".rs") && name !== "mod.rs")
        .sort()) {
        test(`imported upstream generated ${suiteName} fixture: ${fixtureName}`, () => {
            runGeneratedFixture(readFileSync(new URL(fixtureName, fixtureDir), "utf8"));
        });
    }
}
