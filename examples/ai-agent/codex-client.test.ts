import { describe, expect, test } from "bun:test";
import { codexVersionIsAtLeast } from "./codex-client.ts";

describe("Codex version compatibility", () => {
  test("accepts the minimum and newer versions", () => {
    expect(codexVersionIsAtLeast("0.157.0", "0.157.0")).toBe(true);
    expect(codexVersionIsAtLeast("0.158.0", "0.157.0")).toBe(true);
    expect(codexVersionIsAtLeast("1.0.0", "0.157.0")).toBe(true);
  });

  test("rejects old and malformed versions", () => {
    expect(codexVersionIsAtLeast("0.156.9", "0.157.0")).toBe(false);
    expect(codexVersionIsAtLeast("0.157", "0.157.0")).toBe(false);
    expect(codexVersionIsAtLeast("latest", "0.157.0")).toBe(false);
  });
});
