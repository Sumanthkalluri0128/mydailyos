import test from "node:test";
import assert from "node:assert/strict";
import { SKINS, poolFor, pickSkin, shuffleSkin, dayNumber, skinCss } from "./skins.js";

const dates = (start, n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));

test("four skins for each group, and women only get the women's set", () => {
  assert.equal(poolFor("female").length, 4);
  assert.equal(poolFor("male").length, 4);
  assert.equal(poolFor("").length, 8);
  assert.ok(poolFor("female").every((s) => s.sex === "female"));
  assert.ok(poolFor("male").every((s) => s.sex === "male"));
});

test("same day, same skin; the pick is deterministic", () => {
  for (const sex of ["female", "male", ""]) assert.equal(pickSkin({ sex, date: "2026-10-12" }).id, pickSkin({ sex, date: "2026-10-12" }).id);
});

test("never the same skin two days in a row, and every skin shows up within a round", () => {
  for (const sex of ["female", "male", ""]) {
    for (const salt of ["", "a@b.com", "someone-else"]) {
      const picks = dates(0, 120).map((date) => pickSkin({ sex, date, salt }).id);
      for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], `${sex}/${salt} repeated on day ${i}`);
      assert.equal(new Set(picks).size, poolFor(sex).length);
    }
  }
});

test("women's days and men's days stay inside their own set", () => {
  for (const date of dates(0, 60)) {
    assert.equal(pickSkin({ sex: "female", date }).sex, "female");
    assert.equal(pickSkin({ sex: "male", date }).sex, "male");
  }
});

test("shuffle always returns a different skin from the same set", () => {
  for (const sex of ["female", "male"]) for (const s of poolFor(sex)) {
    for (const r of [0, 0.3, 0.99]) { const n = shuffleSkin({ sex, currentId: s.id, rnd: () => r }); assert.notEqual(n.id, s.id); assert.equal(n.sex, sex); }
  }
});

test("dayNumber ignores timezone and handles month ends", () => {
  assert.equal(dayNumber("2026-03-01") - dayNumber("2026-02-28"), 1);
  assert.equal(dayNumber("2026-10-13") - dayNumber("2026-10-12"), 1);
});

test("generated css covers every skin, and dark-only skins have no light block", () => {
  const css = skinCss();
  for (const s of SKINS) { assert.ok(css.includes(`data-ff-skin="${s.id}"][data-theme="dark"]`)); assert.equal(css.includes(`data-ff-skin="${s.id}"][data-theme="light"]`), !!s.light); }
});

test("every skin uses a character that has a sprite set", () => {
  assert.deepEqual([...new Set(SKINS.map((s) => s.char))].sort(), ["gojo", "goku", "luffy", "naruto", "zoro"]);
});

test("every theme's dashboard layout only names cards that exist", () => {
  const known = new Set(["nutrition", "macros", "weight", "goals", "tasks", "quick", "motto", "trail"]);
  for (const s of SKINS) {
    assert.ok(Array.isArray(s.layout) && s.layout.length > 0, `${s.id} has no layout`);
    for (const row of s.layout) for (const k of [].concat(row)) assert.ok(known.has(typeof k === "string" ? k : k.k), `${s.id}: unknown card ${k}`);
  }
});
