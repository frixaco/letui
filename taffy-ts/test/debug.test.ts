import assert from "node:assert/strict";
import test from "node:test";
import {
    DebugLogger,
    debugLog,
    debugPopNode,
    debugPushNode,
    debug_log,
    debug_pop_node,
    debug_push_node,
    time,
} from "../src/index.js";

test("DebugLogger stays silent until explicitly enabled", () => {
    const lines: string[] = [];
    const logger = new DebugLogger((line: string) => lines.push(line));

    logger.pushNode("NodeId(1)");
    logger.log("layout");
    logger.labelledLog("known_dimensions", "{ width: 10 }");
    logger.popNode();

    assert.deepEqual(lines, []);
});

test("DebugLogger mirrors Rust node indentation and labelled log helpers", () => {
    const lines: string[] = [];
    const logger = new DebugLogger((line: string) => lines.push(line));
    logger.enable();

    debugPushNode("NodeId(1)", logger);
    debugLog("FLEX", logger);
    logger.labelledDebugLog("known_dimensions", { width: 10, height: undefined });
    debug_push_node("NodeId(2)", logger);
    debug_log("RESULT", "Size(10, 5)", logger);
    debug_pop_node(logger);
    debugPopNode(logger);

    assert.equal(lines[0], "    NodeId(1): ");
    assert.equal(lines[1], "    NodeId(1): FLEX");
    assert.equal(lines[2].startsWith("    NodeId(1): known_dimensions "), true);
    assert.equal(lines[3], "        NodeId(2): ");
    assert.equal(lines[4], "        NodeId(2): RESULT Size(10, 5)");
});

test("time helper preserves callback result and logs elapsed work when enabled", () => {
    const lines: string[] = [];
    let now = 100;
    const logger = new DebugLogger((line: string) => lines.push(line), () => now);

    assert.equal(time("layout", () => 7, logger), 7);
    assert.deepEqual(lines, []);

    logger.enable();
    const result = time("layout", () => {
        now = 117.9;
        return "done";
    }, logger);

    assert.equal(result, "done");
    assert.deepEqual(lines, [": Performed layout in 17ms"]);
});
