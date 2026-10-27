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
