import assert from "node:assert/strict";
import { GUIDES, guideText } from "../../components/portionGuides";
import { LOCALES, speechAvailable } from "../speech";

test("portion guides: sizes grow, labels are plain, amounts are positive", () => {
  assert.ok(["katori", "roti", "ladle", "glass", "spoon"].every((id) => GUIDES.some((g) => g.id === id)));
  for (const g of GUIDES) {
    const amounts = g.items.map((i) => i.amount);
    assert.deepEqual([...amounts].sort((a, b) => a - b), amounts, `${g.id} not ascending`);
    for (const i of g.items) { assert.ok(i.amount > 0 && i.scale > 0 && i.label); assert.match(guideText(g, i), /about \d+ (ml|cm)/); }
  }
});
test("portion guides: standard spoon sizes", () => {
  const sp = GUIDES.find((g) => g.id === "spoon")!;
  assert.equal(sp.items.find((i) => i.id === "t")!.amount, 5);
  assert.equal(sp.items.find((i) => i.id === "tb")!.amount, 15);
});
test("voice: four locales, and the mic stays hidden when the speech package is not installed", () => {
  assert.deepEqual(LOCALES.map((l) => l[0]), ["en-IN", "hi-IN", "te-IN", "ta-IN"]);
  assert.equal(speechAvailable(), false); // not installed in the test environment
});
