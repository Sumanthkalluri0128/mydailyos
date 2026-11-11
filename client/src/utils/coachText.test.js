import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeT, LANGS } from "../i18n/core.js";
import { advisoryText, tr, applyLabel, weeklyHeadline, weeklyMessages, nextText, refreshNote, offerTexts } from "./coachText.js";
const dicts = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(new URL(`../i18n/${l}.json`, import.meta.url), "utf8"))]));
const en = makeT(dicts, "en"), hi = makeT(dicts, "hi");

test("tr falls back to the server's English when no key exists", () => {
  assert.equal(tr(en, "coach.nope", null, "server text"), "server text");
  assert.equal(tr(en, "coach.next.log.title", null, "x"), "Log your first meal");
});
test("apply labels cover every change type, in the chosen language", () => {
  assert.equal(applyLabel(en, { type: "steps", stepsTarget: 11500 }), "Set my steps goal to 11,500");
  assert.equal(applyLabel(en, { type: "targetDate", byDate: "2027-06-01" }), "Move my target date to 2027-06-01");
  assert.equal(applyLabel(en, { type: "pace", weeklyPaceKg: 0.75, planPaceKg: 0.75, calorieTarget: 2040 }), "Raise my pace to 0.75 kg a week");
  assert.equal(applyLabel(en, { type: "pace", weeklyPaceKg: 0.4, calorieTarget: 1900 }), "Set my target to 1,900 kcal");
  assert.equal(applyLabel(en, { type: "dietBreak", days: 7 }), "Start a 7-day diet break");
  assert.match(applyLabel(hi, { type: "dietBreak", days: 7 }), /डाइट ब्रेक/);
  assert.equal(applyLabel(en, null), "");
});
test("weekly headline and message use the decision's own numbers, and untranslated actions keep the server text", () => {
  const w = { action: "ON_TRACK", headline: "On track", messages: ["server"], metrics: { rateKgWk: -0.52, targetLossKgWk: 0.5 } };
  assert.equal(weeklyHeadline(en, w), "On track");
  assert.deepEqual(weeklyMessages(en, w), ["Your trend is 0.52 kg a week against a plan of 0.50. Change nothing."]);
  assert.match(weeklyMessages(hi, w)[0], /0\.52/);
  const odd = { action: "SOMETHING_NEW", headline: "Server headline", messages: ["a", "b"], metrics: {} };
  assert.equal(weeklyHeadline(hi, odd), "Server headline"); assert.deepEqual(weeklyMessages(hi, odd), ["a", "b"]);
  const steps = { action: "LADDER_STEPS", headline: "x", messages: ["y"], metrics: {}, apply: { type: "steps", stepsTarget: 11500, from: 10000 } };
  assert.equal(weeklyHeadline(en, steps), "Step 1: raise steps to 11,500");
  assert.match(weeklyMessages(en, steps)[0], /\+1,500 steps/);
  const cyc = { action: "WAIT_CYCLE", headline: "x", messages: [], metrics: { cycleDay: 25, cycleLen: 28 } };
  assert.match(weeklyMessages(en, cyc)[0], /day 25 of a 28-day cycle/);
});
test("next-step text is translated by kind; the train line adds the recovery note", () => {
  assert.equal(nextText(en, { kind: "checkin", title: "s", detail: "s" }).title, "Do your 10-second check-in");
  assert.match(nextText(en, { kind: "train", title: "s", detail: "s" }, "amber").detail, /5% lighter/);
  assert.equal(nextText(en, { kind: "decision", title: "Server headline", detail: "s" }).title, "Server headline");
  assert.equal(refreshNote(en, { refreshReason: "recovery-low" }), "Updated early because your recovery has been low this week.");
  assert.equal(refreshNote(en, { refreshReason: "" }), "");
});
test("offer texts: both options, the caveat, and the reason when the pace is held back", () => {
  const o = { behindWeeks: 18, refDate: "2027-02-01", date: { newDate: "2027-06-10" }, pace: { toPace: 0.75, perDayLess: 280, kcal: 2040, finishDate: "2027-02-16", reachesDate: false }, paceBlocked: "" };
  const x = offerTexts(en, o);
  assert.match(x.title, /18 weeks/); assert.match(x.date.title, /2027-06-10/); assert.match(x.pace.detail, /accurate/);
  const held = offerTexts(en, { ...o, pace: null, paceBlocked: "recovery" });
  assert.equal(held.pace, null); assert.match(held.noPace, /recovery/);
  assert.equal(offerTexts(en, null), null);
});

test("advisories: fixed sentences are translated with their numbers; dynamic ones keep the server's text", () => {
  const p = advisoryText(en, { id: "protein-low", title: "x", detail: "y", vars: { avg: 82, target: 110 } });
  assert.equal(p.title, "Protein is under target"); assert.match(p.detail, /about 82 g against 110 g/);
  assert.match(advisoryText(hi, { id: "break-with-deload", title: "x", detail: "y", vars: { weeks: 7 } }).detail, /7/);
  const d = advisoryText(en, { id: "strength-down", title: "t", detail: "the server's own note" });
  assert.equal(d.title, "Strength is falling while you diet"); assert.equal(d.detail, "the server's own note");
  assert.deepEqual(advisoryText(en, { id: "unknown", title: "T", detail: "D" }), { title: "T", detail: "D" });
});
