import test from "node:test";
import assert from "node:assert/strict";
import { searchExercises, stem, distance, tokens } from "./exerciseSearch.js";

const L = [
  ["sq", "Barbell Back Squat", "legs", "barbell"], ["gs", "Goblet Squat", "legs", "dumbbell"], ["bp", "Bench Press", "chest", "barbell"],
  ["ibp", "Incline Dumbbell Press", "chest", "dumbbell"], ["pu", "Push-up", "chest", ""], ["pl", "Plank", "core", ""], ["cr", "Cable Crunch", "core", "cable"],
  ["lu", "Walking Lunges", "legs", ""], ["bc", "Dumbbell Biceps Curl", "arms", "dumbbell"], ["pd", "Triceps Pushdown", "arms", "cable"],
  ["dl", "Romanian Deadlift", "legs", "barbell"], ["lr", "Lateral Raise", "shoulders", "dumbbell"], ["tm", "Treadmill Run", "cardio", ""], ["pull", "Pull-up", "back", ""],
].map(([id, name, cat, gear]) => ({ id, name, cat, gear }));
const ids = (q) => searchExercises(L, q).hits.map((e) => e.id);

test("exact and partial words", () => { assert.equal(ids("plank")[0], "pl"); assert.ok(ids("sq").includes("sq")); assert.ok(ids("dumb curl").includes("bc")); });
test("plurals and endings", () => { assert.ok(ids("squats").includes("sq") && ids("squats").includes("gs")); assert.ok(ids("lunge").includes("lu")); assert.ok(ids("curls").includes("bc")); });
test("typos", () => { assert.equal(ids("sqaut")[0] === "sq" || ids("sqaut")[0] === "gs", true); assert.ok(ids("benhc press").includes("bp")); assert.ok(ids("planck").includes("pl")); assert.ok(ids("dedlift").includes("dl")); });
test("joined and split words", () => { assert.ok(ids("benchpress").includes("bp")); assert.ok(ids("push up").includes("pu")); assert.ok(ids("pushup").includes("pu")); assert.ok(ids("pullup").includes("pull")); });
test("word order", () => { assert.ok(ids("press bench").includes("bp")); assert.ok(ids("curl biceps").includes("bc")); });
test("short forms and everyday words", () => { assert.ok(ids("db press").includes("ibp")); assert.ok(ids("abs").includes("pl") && ids("abs").includes("cr")); assert.ok(ids("tummy").includes("cr")); assert.ok(ids("jog").includes("tm")); assert.ok(ids("quads").includes("sq")); });
test("muscle group and gear words", () => { assert.ok(ids("chest").includes("bp") && ids("chest").includes("pu")); assert.ok(ids("cable").includes("pd")); assert.ok(ids("barbell legs").includes("sq")); });
test("unrelated words find nothing, and similar shows partial matches", () => {
  assert.deepEqual(ids("zzzz"), []);
  const r = searchExercises(L, "goblet plank"); assert.equal(r.hits.length, 0); assert.ok(r.similar.some((e) => e.id === "gs") && r.similar.some((e) => e.id === "pl"));
});
test("short words stay exact (no wild matches)", () => { assert.deepEqual(ids("ox"), []); });
test("helpers", () => { assert.equal(stem("lunges"), "lunge"); assert.equal(stem("curling"), "curl"); assert.equal(stem("flies"), "fly"); assert.equal(distance("squat", "sqaut", 2), 1); assert.deepEqual(tokens("Push-up (wide)"), ["push", "up", "wide"]); });
test("empty query returns the list", () => { assert.equal(searchExercises(L, "  ").hits.length, L.length); });
