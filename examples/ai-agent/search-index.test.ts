import { describe, expect, test } from "bun:test";
import { SearchIndex } from "./search-index.ts";

describe("FFF application catalogs", () => {
  test("keeps scopes isolated and refreshes values without rebuilding unchanged text", async () => {
    const index = new SearchIndex(process.cwd());
    const first = { id: "first" };
    const refreshed = { id: "refreshed" };
    const history = { id: "history" };

    try {
      await index.index("threads", [{ text: "Alpha thread", value: first }]);
      await index.index("history", [{ text: "Alpha prompt", value: history }]);
      expect(index.search("threads", "alpha", 5)).toEqual([first]);
      expect(index.search("history", "alpha", 5)).toEqual([history]);

      await index.index("threads", [{ text: "Alpha thread", value: refreshed }]);
      expect(index.search("threads", "alpha", 5)).toEqual([refreshed]);
    } finally {
      index.destroy();
    }
  });
});
