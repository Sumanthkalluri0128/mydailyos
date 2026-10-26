import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeT, missingKeys, placeholderProblems, LANGS, fill } from "./core.js";
const load = (l) => JSON.parse(readFileSync(new URL(`./${l}.json`, import.meta.url), "utf8"));
const dicts = Object.fromEntries(LANGS.map((l) => [l, load(l)]));

test("falls back to English, then to the key", () => {
  const d = { en: { a: "Hello {n}", b: "Only English" }, hi: { a: "नमस्ते {n}", b: "" } };
  const t = makeT(d, "hi");
  assert.equal(t("a", { n: 3 }), "नमस्ते 3");
  assert.equal(t("b"), "Only English");       // empty translation falls back
  assert.equal(t("zzz"), "zzz");               // unknown key never crashes
  assert.equal(makeT(d, "te")("a", { n: 1 }), "Hello 1"); // language with no file at all
});
test("missing placeholder value is left visible instead of 'undefined'", () => {
  assert.equal(fill("Hi {name}", {}), "Hi {name}");
  assert.equal(fill("Hi {name}", { name: 0 }), "Hi 0");
});
test("every shipped language covers all English keys with matching placeholders", () => {
  for (const l of ["hi", "te", "ta"]) {
    const miss = missingKeys(dicts, l).filter((k) => !k.startsWith("lang."));
    assert.deepEqual(miss, [], `${l} is missing ${miss.join(", ")}`);
    assert.deepEqual(placeholderProblems(dicts, l), [], `${l} placeholder mismatch`);
    assert.equal(dicts[l]._meta.needsReview, true);       // honest flag until a native speaker signs off
  }
  assert.equal(dicts.en._meta.needsReview, false);
});
test("translations stay in their own script", () => {
  const range = { hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/, ta: /[஀-௿]/ };
  for (const l of ["hi", "te", "ta"]) assert.ok(range[l].test(dicts[l]["nav.home"]) && range[l].test(dicts[l]["next.breakfast.text"]));
});
