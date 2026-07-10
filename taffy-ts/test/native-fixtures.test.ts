import test from "node:test";
import { loadNativeFixtures, runNativeFixture } from "./native-fixture-runner.ts";

const fixtures = loadNativeFixtures();

for (const { suite, name, fixture } of fixtures) {
  test(`generated layout fixture: ${suite}/${name}`, () => runNativeFixture(fixture));
}

test("native fixture archive contains the complete generated corpus", () => {
  if (fixtures.length !== 1_027) {
    throw new Error(`Expected 1,027 generated fixtures, received ${fixtures.length}`);
  }
});
