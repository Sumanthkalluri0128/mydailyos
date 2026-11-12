import test from "node:test";
import assert from "node:assert/strict";
import * as G from "./gymMath";
import { backupJson, bodyCsv, csvCell, parseBackup, workoutsCsv } from "./gymExport";
import { sane } from "./gymClean";
import { GYM_CATALOG, mergeCatalog } from "./gymCatalog";

const E = (id, date, exId, sets, o = {}) => ({ id, date, exId, name: exId, cat: "chest", unit: "reps", sets: sets.map(([kg, reps]) => ({ kg, reps })), at: Number(id.replace(/\D/g, "")) || 0, ...o });
const B = (date, o = {}) => ({ id: `b${date}`, date, sites: {}, at: 1, ...o });

test("e1rm, volume, set line", () => {
  assert.equal(G.e1rm(100, 10), 133.3);
  assert.equal(G.entryVolume(E("e1", "2026-11-01", "bench", [[40, 10], [40, 8]])), 720);
  assert.equal(G.setsLine(E("e1", "d", "x", [[40, 10], [40, 10], [40, 10]])), "3 × 10 @ 40 kg");
});
test("personal records: first log is none, heavier is a weight PR", () => {
  const a = E("e1", "2026-11-01", "bench", [[40, 10]]);
  assert.deepEqual(G.detectPRs([], a), []);
  assert.equal(G.detectPRs([a], E("e2", "2026-11-08", "bench", [[45, 8]]))[0].kind, "weight");
});
test("goal progress and ETA for a steady loss", () => {
  const b = [90, 89, 88, 87, 86].map((v, i) => B(G.shiftDate("2026-10-01", i * 7), { weightKg: v }));
  const g = G.goalProgress(b, "weightKg", 80, { startDate: "2026-10-01" }, "2026-10-29");
  assert.equal(g.pct, 40); assert.equal(g.ratePerWeek, -1); assert.equal(g.etaDate, "2026-12-10");
});
test("Navy body fat matches the server formula", () => {
  assert.equal(G.navyBodyFat({ sex: "male", heightCm: 175, waistCm: 90, neckCm: 38 }), 20.7);
});
test("CSV is safe and has one row per valid set", () => {
  assert.equal(csvCell("=1+1"), "'=1+1"); assert.equal(csvCell("a,b"), '"a,b"');
  const lines = workoutsCsv([E("e1", "2026-11-01", "bench", [[40, 10], [0, 0], [42.5, 8]], { name: "Bench press, flat" })]).replace("\uFEFF", "").trim().split("\r\n");
  assert.equal(lines.length, 3); assert.ok(lines[1].startsWith('2026-11-01,"Bench press, flat",chest,1,40,88.2,10,reps,53.3,400,9.2'));
  assert.equal(bodyCsv([B("2026-11-01", { weightKg: 80, sites: { waist: 90 } })], { unit: "kg" }).split("\r\n")[0].split(",").length, 17);
});
test("backup round-trips and junk is rejected", () => {
  const st = { profile: { unit: "lb" }, goal: null, entries: [E("e1", "2026-11-01", "bench", [[40, 10]])], body: [B("2026-11-01", { weightKg: 80 })] };
  const s = sane(parseBackup(backupJson(st)));
  assert.equal(s.entries.length, 1); assert.equal(s.profile.unit, "lb"); assert.equal(s.body[0].weightKg, 80);
  assert.equal(parseBackup("nope"), null);
  assert.deepEqual(sane({ entries: [null, { id: 1 }], body: ["x"], goal: 5 }).entries, []);
});

test("calories burned use the app formula and the logged body weight", () => {
  const e = E("e1", "2026-11-05", "bench", [[40, 10]], { name: "Bench press" });
  assert.equal(G.entryKcal(e, 80), Math.round(5 * 3.5 * 80 / 200 * 1.5));
  assert.equal(G.kcalIn([e], [B("2026-11-01", { weightKg: 80 })], "2026-11-01", "2026-11-07"), G.entryKcal(e, 80));
  assert.equal(G.kcalIn([e], [], "2026-11-01", "2026-11-07"), G.entryKcal(e, 70));
  assert.equal(G.entryKcal(E("e2", "d", "run", [[0, 30]], { name: "Treadmill Run", cat: "cardio", unit: "min" }), 70), 331);
});
test("exercise catalogue is large, unique and merges without duplicates", () => {
  assert.ok(GYM_CATALOG.length > 190);
  assert.equal(new Set(GYM_CATALOG.map((c) => c.id)).size, GYM_CATALOG.length);
  assert.equal(mergeCatalog([{ name: "Plank", id: "p" }]).filter((m) => m.name === "Plank").length, 1);
});
