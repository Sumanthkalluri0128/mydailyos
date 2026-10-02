# FlexFit — fixes for the 7 issues

## 1. Keyboard covering inputs
- Mobile: shared `Screen` now uses `KeyboardAvoidingView behavior="padding"` on both platforms (the old Android `height` mode left the field hidden on edge-to-edge devices) plus extra bottom padding. All 5 popup forms (custom food, workout template, habits, tasks, change password) lift above the keyboard. Tab bar hides while typing. `app.json`: `softwareKeyboardLayoutMode: "resize"`.
- Web: focused fields scroll into view on touch devices, `interactive-widget=resizes-content`, popups use `dvh`.

## 2. Food grouped by meal
- Mobile "Today's Food" is now Breakfast / Lunch / Dinner / Snacks sections with a calorie subtotal each. History → daily detail is grouped the same way. (Web already grouped by meal.)

## 3. Expected calories vs. what you ate (deficit / surplus)
- New `utils/energy` (mobile `.ts`, web `.js`): BMR (Mifflin-St Jeor) x activity = maintenance; goal weight decides lose (-500) / maintain / gain (+300).
- New "Calories for your weight" card (Home + Food screen, mobile and web): expected intake, maintenance, burned by exercise, eaten, remaining, and deficit/surplus with rough fat change.
- Needs weight, height and age in Profile; otherwise it asks you to complete them.

## 4. Exercise calories + totals + history
- "Calories burned" field on the log form (blank = auto-estimate from MET x weight x time, with a live estimate shown). Stored with `caloriesSource: manual | estimated`.
- "Burned today" total card, and a History list (7/14/30 days) grouped by day with per-day totals.
- Server: `POST /api/activities/logs` accepts `caloriesBurned`; `GET /api/activities/logs?from=&to=` returns a range.
- Web exercise page also used the UTC date (a day behind before 5:30 AM IST) — now uses the local date. Weight is prefilled from the profile instead of being required.

## 5. Progress bars
- New labelled `ProgressBar` (mobile) / `GoalBar` (web): value / target, fill, %, and amount left or over (calories turn red when over).
- Home goals use them instead of the four small rings.
- Progress charts rewritten with SVG: axes, gridlines, tap-a-bar value, average, dashed target line (the old chart drew lines with rotated Views, which rendered in the wrong place).

## 6. Water target from weight
- ~35 ml per kg, rounded to 50 ml, clamped 1.5–5 L. Shown on the Water screen with the formula, on Home, and as the target line in the water chart. Logging a new weight refreshes it.

## 7. Serving size when adding food
- Log form now has **Servings** and **Serving size** (in the food's unit), quick 0.5× / 1× / 1.5× / 2× chips, and a live calorie + macro preview. Total amount = servings x size.

## Tests
- Mobile: typecheck clean; 44 Jest tests pass (new `energy.test.ts`).
- Server: unit tests pass; new integration assertions for manual calories + range query need a MongoDB (`TEST_MONGO_URI`) and were not run here.
- Web: `vite build` succeeds; existing tests pass.
