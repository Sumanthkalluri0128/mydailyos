import test from "node:test";
import assert from "node:assert/strict";
import { questLine } from "./talk.js";

test("protein line never mixes '% of target' with a distance to the range", () => {
  const line = questLine({ id: "protein", title: "Land your protein in range", value: 123, target: 139, unit: "g", pct: 88, hint: "2 g more to be in range (125 to 160 g). Your target is 139 g." });
  assert.equal(line, "Land your protein in range: 123 g so far. 2 g more to be in range (125 to 160 g). Your target is 139 g.");
  assert.ok(!line.includes("88%"));
});

test("other quests keep value/target and percent", () => {
  assert.equal(questLine({ id: "water", title: "Drink your water", value: 1500, target: 3000, unit: "ml", pct: 50, hint: "1500 ml to go." }), "Drink your water: 1500/3000 ml (50%). 1500 ml to go.");
});
