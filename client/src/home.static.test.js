import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("Home has no auto-advance timer, slideshow or blurred scene banner", () => {
  for (const f of ["./components/home/HomeDashboard.jsx", "./components/home/HeroCard.jsx", "./utils/dailyLine.js"]) assert.doesNotMatch(read(f), /setInterval|hr-slide|hr-stage|pn-scene|SCENES|autoplay/i, f);
  for (const f of ["./components/home/HeroCarousel.jsx", "./components/MotivationCarousel.jsx", "./components/home/scenes.js"]) assert.equal(fs.existsSync(new URL(f, import.meta.url)), false, f);
});
test("the weekly review card starts collapsed and remembers nothing between visits", () => {
  const s = read("./components/OverDayCard.jsx");
  assert.match(s, /const \[open, setOpen\] = useState\(false\)/);
  assert.doesNotMatch(s, /localStorage|ff_overday_min/);
});
test("Home weight card goes through WeightReveal", () => {
  assert.match(read("./components/home/HomeDashboard.jsx"), /<WeightReveal[^>]*latestWeight/);
});
test("empty steps and exercise cards show a friendly line, not a bare goal", () => {
  const s = read("./components/home/HomeDashboard.jsx");
  assert.match(s, /Nothing yet\. A short walk counts/);
  assert.match(s, /Nothing yet\. A 10 minute walk counts/);
});
test("planner shows when it last updated and has a Refresh button", () => {
  const s = read("./pages/PlannerPage.jsx");
  assert.match(s, /Last updated/);
  assert.match(s, /↻ Refresh/);
});
test("Home stat cards all go through the shared StatCard (no per-card sticker rules)", () => {
  const s = read("./components/home/HomeDashboard.jsx");
  assert.equal((s.match(/<StatCard /g) || []).length, 4);
  assert.doesNotMatch(s, /<article className="sc sc-(water|steps|ex|w)"/);
  assert.doesNotMatch(read("./components/home/home.css"), /\.sc-water \.pk|\.sc-steps \.pk/);
});
test("the Eaten number opens today's meals with the portion editor and an Undo toast", () => {
  assert.match(read("./components/home/HomeDashboard.jsx"), /setSheet\("eaten"\)/);
  const e = read("./components/home/EatenSheet.jsx");
  assert.match(e, /PortionEdit/);
  assert.match(e, /undoNotice/);
});
test("portion edits can be undone in the food log and the planner", () => {
  assert.match(read("./pages/FoodLogger.jsx"), /undoNotice\(/);
  assert.match(read("./pages/PlannerPage.jsx"), /undoNotice\(/);
});
test("the planner has a one-tap Log what I planned per meal", () => {
  assert.match(read("./components/PlannerMeal.jsx"), /Log what I planned/);
  assert.match(read("./pages/PlannerPage.jsx"), /itemsToLogMeal/);
});
test("the weekly review is the went-well / change / one-thing summary", () => {
  const s = read("./components/WeeklyCoach.jsx");
  assert.match(s, /What went well/);
  assert.match(s, /One thing for next week/);
});
test("the portion editor remembers a usual amount and shows household counts", () => {
  const s = read("./components/PortionEdit.jsx");
  assert.match(s, /usualPortion/);
  assert.match(s, /isHousehold/);
});
