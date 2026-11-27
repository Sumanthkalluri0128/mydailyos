import test from "node:test";
import assert from "node:assert/strict";
import { editRequest } from "./logEdit.js";

const orig = { durationMinutes: 60, caloriesBurned: 410, notes: "", date: "2026-11-22" };
const form = (over = {}) => ({ minutes: "60", kcal: "410", kcalTouched: false, notes: "", date: "2026-11-22", ...over });
const MAX = "2026-11-24";

test("nothing changed: nothing to send", () => {
  const r = editRequest(orig, form(), MAX);
  assert.deepEqual(r, { ok: true, body: {}, changed: false });
});

test("a note-only edit sends only the note, so calories typed by hand are not reset", () => {
  const r = editRequest(orig, form({ notes: "felt good" }), MAX);
  assert.deepEqual(r.body, { notes: "felt good" });
  assert.equal("durationMinutes" in r.body, false);
  assert.equal("caloriesBurned" in r.body, false);
});

test("new minutes without touching calories: only minutes are sent (the server makes the calories follow)", () => {
  assert.deepEqual(editRequest(orig, form({ minutes: "30" }), MAX).body, { durationMinutes: 30 });
});

test("calories the person typed are sent, with or without new minutes", () => {
  assert.deepEqual(editRequest(orig, form({ kcal: "250", kcalTouched: true }), MAX).body, { caloriesBurned: 250 });
  assert.deepEqual(editRequest(orig, form({ minutes: "45", kcal: "250", kcalTouched: true }), MAX).body, { durationMinutes: 45, caloriesBurned: 250 });
  assert.deepEqual(editRequest(orig, form({ kcal: "0", kcalTouched: true }), MAX).body, { caloriesBurned: 0 }, "zero is a real number");
  assert.deepEqual(editRequest(orig, form({ kcal: "250,5", kcalTouched: true }), MAX).body, { caloriesBurned: 250.5 }, "a comma decimal");
});

test("a calorie box that was touched and then emptied counts as left alone", () => {
  assert.deepEqual(editRequest(orig, form({ kcal: "", kcalTouched: true, notes: "x" }), MAX).body, { notes: "x" });
});

test("moving to another day sends only the day", () => {
  assert.deepEqual(editRequest(orig, form({ date: "2026-11-20" }), MAX).body, { date: "2026-11-20" });
});

test("bad input is refused with a plain message, before anything is sent", () => {
  for (const m of ["", "0", "abc", "1441", "-5", "0.5"]) assert.equal(editRequest(orig, form({ minutes: m }), MAX).ok, false, `minutes ${m}`);
  for (const k of ["abc", "-1", "20001"]) assert.equal(editRequest(orig, form({ kcal: k, kcalTouched: true }), MAX).ok, false, `kcal ${k}`);
  for (const d of ["", "monday", "2026-13-40", "22/11/2026"]) assert.equal(editRequest(orig, form({ date: d }), MAX).ok, false, `date ${d}`);
  assert.equal(editRequest(orig, form({ date: "2026-11-25" }), MAX).ok, false, "a day that has not happened");
  assert.equal(editRequest(orig, form({ date: "2026-11-24" }), MAX).ok, true, "up to the limit is fine");
  assert.equal(editRequest(orig, form({ notes: "x".repeat(301) }), MAX).ok, false);
  assert.equal(editRequest(orig, form({ notes: "x".repeat(300) }), MAX).ok, true);
  assert.match(editRequest(orig, form({ minutes: "0" }), MAX).error, /minutes/i);
});

test("a missing original or form does not crash", () => {
  assert.equal(editRequest(undefined, undefined, MAX).ok, false);
  assert.equal(editRequest({}, form(), MAX).ok, true);
});
