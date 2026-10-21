import test from "node:test";
import assert from "node:assert/strict";
import { addWord, answerText, askLine, chosenLabels, dotsFor, draftValid, draftValue, emptyDraft, introLine, knownLine, reactLine, toggleMulti } from "./sensei.js";

const lines = {
  intro: { cheer: ["Welcome!"], calm: ["Hello."], strict: ["Setup."] }, update: { cheer: ["Welcome back!"], calm: ["Back."], strict: ["Update."] },
  ask: { cheer: ["Quick one!"], calm: ["One small question."], strict: ["Answer this."] }, react: { cheer: ["Got it!"], calm: ["Noted."], strict: ["Noted."] },
  skip: { cheer: ["Skipped!"], calm: ["Fine."], strict: ["Skipped."] }, usual: { cheer: ["Your usual!"], calm: ["Usual."], strict: ["Usual kept."] }, done: { cheer: ["All set!"], calm: ["Done."], strict: ["Done."] },
  specific: { avoid: { any: { cheer: ["{v} stays out."], calm: ["{v} stays out."], strict: ["{v} excluded."] }, none: { cheer: ["Nothing to avoid!"], calm: ["None."], strict: ["None."] } }, prep: { twice: { cheer: ["Cook once, eat twice!"], calm: ["x"], strict: ["x"] } } },
  coach: { zoro: { open: "Hm.", close: "Fuel first." }, luffy: { open: "Shishishi!", close: "Eat well!" } },
};
const avoid = { id: "avoid", type: "multi", allowNone: true, ask: "Anything to keep out?", groups: [{ id: "allergy", options: [{ id: "allergy:peanut", label: "Peanuts" }, { id: "allergy:milk", label: "Milk / dairy" }] }], usual: [] };

test("lines: the first question opens with the coach, later ones use the tone; tone changes the words", () => {
  assert.match(askLine({ lines, who: "zoro", tone: "cheer", question: avoid, index: 0 }), /^Hm\. Anything to keep out\?/);
  assert.match(askLine({ lines, who: "zoro", tone: "calm", question: avoid, index: 1 }), /^One small question\./);
  assert.notEqual(askLine({ lines, who: "luffy", tone: "strict", question: avoid, index: 1 }), askLine({ lines, who: "luffy", tone: "cheer", question: avoid, index: 1 }));
  assert.equal(introLine({ lines, who: "zoro", tone: "calm", mode: "update" }), "Hm. Back.");
  assert.equal(askLine({ lines: {}, who: "x", tone: "weird", question: avoid }), "Anything to keep out?");
});

test("reactions: allergy answers promise exclusion, 'nothing' and skip and usual have their own lines, finishing adds the coach close", () => {
  const v = ["allergy:peanut", "allergy:milk"];
  assert.equal(reactLine({ lines, who: "zoro", tone: "calm", qid: "avoid", value: v, labels: chosenLabels(avoid, v) }), "Peanuts, Milk / dairy stays out.");
  assert.equal(reactLine({ lines, who: "zoro", tone: "cheer", qid: "avoid", value: ["none"] }), "Nothing to avoid!");
  assert.equal(reactLine({ lines, who: "zoro", tone: "cheer", qid: "prep", value: "twice" }), "Cook once, eat twice!");
  assert.equal(reactLine({ lines, who: "zoro", tone: "cheer", qid: "budget", value: "low" }), "Got it!");
  assert.equal(reactLine({ lines, who: "zoro", tone: "cheer", qid: "avoid", skipped: true }), "Skipped!");
  assert.equal(reactLine({ lines, who: "zoro", tone: "strict", qid: "avoid", usual: true }), "Usual kept.");
  assert.equal(reactLine({ lines, who: "zoro", tone: "cheer", done: true }), "All set! Fuel first.");
});

test("chips: none is exclusive, other chips clear none, words are cleaned and limited", () => {
  assert.deepEqual(toggleMulti([], "allergy:milk"), ["allergy:milk"]);
  assert.deepEqual(toggleMulti(["allergy:milk"], "none"), ["none"]);
  assert.deepEqual(toggleMulti(["none"], "allergy:soy"), ["allergy:soy"]);
  assert.deepEqual(toggleMulti(["allergy:soy"], "allergy:soy"), []);
  assert.deepEqual(addWord([], " <b>Karela</b> "), ["Karela"]);
  assert.deepEqual(addWord(["Karela"], "karela"), ["Karela"]);
  assert.deepEqual(addWord(["a1"], "x"), ["a1"]);
  assert.equal(addWord(Array.from({ length: 30 }, (_, i) => `w${i}`), "more").length, 30);
});

test("drafts: forms start from the usual answer and are valid only when every single-choice row is chosen", () => {
  const q = { id: "cookTime", type: "form", usual: { breakfast: "20", lunch: "20", dinner: "40" }, fields: [{ id: "breakfast", type: "single", options: [{ id: "10", label: "10 min" }, { id: "20", label: "20 min" }] }, { id: "lunch", type: "single", options: [{ id: "10", label: "10 min" }] }] };
  assert.deepEqual(emptyDraft(q), { breakfast: "20", lunch: "20", dinner: "40" });
  assert.equal(draftValid(q, { breakfast: "10", lunch: "" }), false); assert.equal(draftValid(q, { breakfast: "10", lunch: "10" }), true);
  assert.equal(draftValid({ type: "single" }, ""), false); assert.equal(draftValid({ type: "multi" }, []), true);
  assert.equal(draftValid({ type: "dates" }, { from: "2026-10-20", to: "2026-10-19" }), false); assert.equal(draftValid({ type: "dates" }, { from: "2026-10-20" }), true);
  assert.deepEqual(draftValue(avoid, []), ["none"]); assert.deepEqual(draftValue(avoid, ["allergy:soy"]), ["allergy:soy"]);
  assert.equal(answerText(avoid, []), "Nothing to avoid"); assert.equal(answerText(avoid, ["allergy:milk"]), "Milk / dairy");
  assert.equal(answerText(q, { breakfast: "10", lunch: "10" }), "breakfast: 10 min · lunch: 10 min");
});

test("progress dots and the 'already known' line", () => {
  assert.deepEqual(dotsFor(1, 4), ["done", "now", "todo", "todo"]);
  assert.match(knownLine([{ label: "Goal", value: "Lose weight" }, { label: "Daily calories", value: "1,800 kcal" }]), /^I already know your goal \(Lose weight\), daily calories \(1,800 kcal\), so I will not ask again\.$/);
  assert.equal(knownLine([]), "");
});
