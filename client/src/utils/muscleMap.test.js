import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MUSCLE_PICS, REGIONS, dayExercises, groupsOf, imagesFor, regionsFor, summaryLine, tallyOf, weekImages, weekTally } from "./muscleMap.js";
import { GYM_CATALOG } from "./gymCatalog.js";
import { libraryList } from "../data/workoutPlan.js";

test("incline press works the UPPER chest, decline the LOWER (so the picture shows which part)", () => {
  assert.deepEqual(regionsFor({ name: "Incline Dumbbell Press" }).primary, ["chest-upper"]);
  assert.deepEqual(regionsFor({ name: "Decline Barbell Bench Press" }).primary, ["chest-lower"]);
  assert.deepEqual(regionsFor({ name: "Flat Barbell Bench Press" }).primary, ["chest-mid"]);
});
test("names that hide another word still land right", () => {
  assert.deepEqual(regionsFor({ name: "Leg Curl (Machine)" }).primary, ["hamstrings"]);
  assert.deepEqual(regionsFor({ name: "Leg Extension (Machine)" }).primary, ["quad-outer", "quad-mid", "quad-inner"]);
  assert.deepEqual(regionsFor({ name: "Rear Delt Fly (Dumbbell)" }).primary, ["delt-rear"]);
  assert.deepEqual(regionsFor({ name: "Cable Glute Kickback" }).primary, ["glute-max"]);
  assert.deepEqual(regionsFor({ name: "Pike Push-Up" }).primary, ["delt-front", "delt-side"]);
  assert.deepEqual(regionsFor({ name: "Triceps Pushdown" }).primary, ["triceps"]);
});
test("stretches and mobility work nothing; cardio only a light touch", () => {
  assert.deepEqual(regionsFor({ name: "Hamstring Stretch", cat: "mobility" }), { primary: [], secondary: [] });
  const run = regionsFor({ name: "Treadmill Run", cat: "Cardio" });
  assert.equal(run.primary.length, 0);
  assert.ok(run.secondary.includes("calves"));
});
test("unknown names fall back to the smart-plan slot, then the muscle group", () => {
  assert.deepEqual(regionsFor({ name: "Mystery lift", slot: "lateral" }).primary, ["delt-side"]);
  assert.deepEqual(regionsFor({ name: "Mystery lift", targets: ["chest"] }).primary, ["chest-mid"]);
  assert.deepEqual(regionsFor({ name: "Mystery lift" }), { primary: [], secondary: [] });
});
test("tally: main beats helper, sets add up, groups list every muscle of a touched group", () => {
  const t = tallyOf([{ name: "Incline Dumbbell Press", sets: 3 }, { name: "Triceps Pushdown", sets: 2 }, { name: "Barbell Bench Press", sets: 3 }]);
  assert.equal(t["chest-upper"].level, "primary");
  assert.equal(t["chest-mid"].level, "primary");        // main in the bench press, helper in the incline
  assert.equal(t["chest-lower"].level, "secondary");
  assert.equal(t.triceps.level, "primary");
  const chest = groupsOf(t).find((g) => g.group === "chest");
  assert.equal(chest.regions.length, 3);
  assert.deepEqual(chest.regions.map((x) => x.level), ["primary", "primary", "secondary"]);
  assert.match(summaryLine(t), /Chest/);
  assert.equal(groupsOf({}).length, 0);
});
test("dayExercises reads both plan shapes and the week tally counts days", () => {
  const unified = { blocks: [{ type: "check", items: [{ name: "x" }] }, { type: "sets", items: [{ id: "a", name: "Pull-Up", targets: ["back"], sets: 3 }] }] };
  const custom = { items: [{ id: "b", name: "Goblet Squat", cat: "legs", sets: 3 }] };
  assert.deepEqual(dayExercises(unified).map((e) => e.name), ["Pull-Up"]);
  assert.deepEqual(dayExercises(custom).map((e) => e.name), ["Goblet Squat"]);
  assert.deepEqual(dayExercises(null), []);
  const w = weekTally([unified, custom, unified, { items: [] }]);
  assert.equal(w.byDay.length, 4);
  assert.equal(w.week.lats.days, 2);
  assert.equal(w.week["quad-mid"].days, 1);
});
test("every region is lit by at least one picture, so a trained muscle can always be shown", () => {
  for (const r of REGIONS) assert.ok(MUSCLE_PICS.some((p) => p.regions.includes(r.id)), `${r.id} has no picture`);
});
test("every exercise in the app maps without error and strength moves hit at least one muscle", () => {
  for (const e of [...libraryList(), ...GYM_CATALOG]) {
    const r = regionsFor(e);
    for (const id of [...r.primary, ...r.secondary]) assert.ok(REGIONS.some((x) => x.id === id), `${e.name}: ${id}`);
    const strength = !/mobility|cardio/i.test(e.cat || "") && !/stretch|yoga/i.test(e.name);
    if (strength) assert.ok(r.primary.length + r.secondary.length > 0, `${e.name} hits nothing`);
  }
});

// ---------------------------------------------------------------------------------------------------------------- muscle pictures
const P = (ids) => Object.fromEntries(ids.map((id) => [id, { level: "primary", sets: 3 }]));
test("every picture in the library exists on web and phone, and only names real regions", () => {
  const ids = new Set(REGIONS.map((x) => x.id));
  assert.equal(MUSCLE_PICS.length, 63);
  assert.equal(new Set(MUSCLE_PICS.map((x) => x.file)).size, 63);
  for (const p of MUSCLE_PICS) {
    assert.ok(fs.existsSync(new URL(`../../public/muscles/${p.file}.webp`, import.meta.url)), `missing web picture ${p.file}`);
    assert.ok(p.regions.length && p.regions.every((id) => ids.has(id)), `${p.key} names an unknown region`);
  }
});
test("a single trained muscle gets its own picture, a part of a group gets the part", () => {
  assert.deepEqual(imagesFor(P(["biceps"])).map((x) => x.key), ["biceps"]);
  assert.deepEqual(imagesFor(P(["chest-upper"])).map((x) => x.key), ["upper-chest"]);
  assert.deepEqual(imagesFor(P(["chest-upper", "chest-mid", "chest-lower"])).map((x) => x.key), ["chest"]);
  assert.deepEqual(imagesFor(P(["delt-rear"])).map((x) => x.key), ["rear-delts"]);
});
test("a combination in the library gets the combination picture", () => {
  assert.deepEqual(imagesFor(P(["chest-upper", "chest-mid", "chest-lower", "delt-front", "delt-side", "delt-rear", "triceps"])).map((x) => x.key), ["chest+shoulders+triceps"]);
  assert.deepEqual(imagesFor(P(["quad-outer", "quad-mid", "quad-inner", "hamstrings", "glute-max", "glute-med"])).map((x) => x.key), ["quads+hamstrings+glutes"]);
  assert.deepEqual(imagesFor(P(["lats", "traps-mid", "biceps"])).map((x) => x.key), ["back+biceps"]);
});
test("legs and a custom pairing get their own pictures", () => {
  assert.deepEqual(imagesFor(P(["biceps", "triceps"])).map((x) => x.key), ["biceps+triceps"]);
  assert.deepEqual(imagesFor(P(["adductors"])).map((x) => x.key), ["inner-thighs"]);
  assert.deepEqual(imagesFor(P(["chest-upper", "chest-mid", "chest-lower", "lats", "traps-mid"])).map((x) => x.key), ["chest+back"]);
});
test("a day no picture covers gets the best one first, then one picture per leftover muscle (at most `max`)", () => {
  const upper = imagesFor(P(["chest-mid", "chest-lower", "lats", "traps-mid", "biceps", "triceps", "delt-front", "delt-side", "abs-upper", "abs-lower"]));
  assert.equal(upper[0].key, "upper-body");
  assert.deepEqual(upper.slice(1).map((x) => x.key), ["abs"]);
  assert.ok(imagesFor(P(["biceps", "triceps", "calves", "abs-upper", "glute-max", "lats", "chest-mid"]), 3).length <= 3);
  assert.deepEqual(imagesFor(P(["lower-back", "obliques"])).map((x) => x.key).sort(), ["lower-back", "obliques"]);
});
test("a day with only helper muscles (cardio) is shown from those; a rest day has no picture", () => {
  const run = tallyOf([{ name: "Treadmill Run", cat: "Cardio" }]);
  const pics = imagesFor(run);
  assert.ok(pics.length > 0 && pics.every((x) => x.level === "secondary"));
  assert.deepEqual(imagesFor({}), []);
  assert.deepEqual(imagesFor(null), []);
});
test("the week: one picture per trained muscle, most days first, nothing for an untrained one", () => {
  const w = weekTally([{ items: [{ name: "Barbell Bench Press", sets: 3 }] }, { items: [{ name: "Barbell Bench Press", sets: 3 }, { name: "Barbell Curl", sets: 3 }] }, { items: [] }]).week;
  const pics = weekImages(w);
  assert.equal(pics[0].key, "chest");
  assert.equal(pics[0].days, 2);
  assert.ok(pics.some((x) => x.key === "biceps" && x.days === 1));
  assert.ok(!pics.some((x) => x.key === "calves"));
  assert.deepEqual(weekImages({}), []);
});
