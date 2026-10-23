import test from "node:test";
import assert from "node:assert/strict";
import { GUIDES, guideText } from "./portionGuides.js";
import { readFileSync } from "node:fs";

test("portion guides: ascending sizes and readable text", () => {
  for (const g of GUIDES) {
    const a = g.items.map((i) => i.amount);
    assert.deepEqual([...a].sort((x, y) => x - y), a);
    for (const i of g.items) assert.match(guideText(g, i), /about \d+ (ml|cm)/);
  }
});
test("the data file is byte-identical to the mobile copy", () => {
  try {
    const m = readFileSync(new URL("../../../../mobile/src/components/portionGuides.js", import.meta.url), "utf8");
    assert.equal(m, readFileSync(new URL("./portionGuides.js", import.meta.url), "utf8"));
  } catch (e) { if (e.code !== "ENOENT") throw e; }
});
