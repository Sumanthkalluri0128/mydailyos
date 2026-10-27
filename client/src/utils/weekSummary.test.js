import test from "node:test";
import assert from "node:assert/strict";
import { weekSummary } from "./weekSummary.js";

const tips = [{ id: "a", icon: "💧", title: "Drink more water", detail: "Add a glass after lunch." }, { id: "b", icon: "🥬", title: "More veg", detail: "x" }, { id: "c", icon: "🚶", title: "Walk", detail: "y" }];
test("three kind sections from the coach numbers", () => {
  const s = weekSummary({ review: { headline: "Solid week", score: 72, loggedDays: 5, avgProtein: 96.4 }, tips, challenge: { defeated: true }, bossName: "Zoro" });
  assert.deepEqual(s.well, ["You logged 5 of 7 days.", "Protein averaged 96 g a day.", "You beat Zoro this week."]);
  assert.deepEqual(s.change.map((c) => c.id), ["a", "b"]);
  assert.equal(s.next.id, "a");
  assert.equal(s.next.detail, "Add a glass after lunch.");
});
test("few logged days still opens with something true and positive", () => {
  assert.deepEqual(weekSummary({ review: { loggedDays: 1 } }).well, ["You showed up and logged on 1 day."]);
  assert.match(weekSummary({ review: { loggedDays: 0 } }).well[0], /fresh start/);
});
test("the server win comes first and the list is capped at three", () => {
  const s = weekSummary({ review: { loggedDays: 6, avgProtein: 100 }, challenge: { defeated: true }, win: "3 days with all three quests done." });
  assert.equal(s.well.length, 3);
  assert.equal(s.well[0], "3 days with all three quests done.");
});
test("no tips: no change list and no next step", () => {
  const s = weekSummary({ review: { loggedDays: 3 } });
  assert.deepEqual(s.change, []);
  assert.equal(s.next, null);
});
