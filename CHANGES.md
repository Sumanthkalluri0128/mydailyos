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
# FlexFit — round 2: full feature upgrade

## Steps (10,000/day) and automatic calories burned
- Steps goal defaults to 10,000 (changeable in Profile: 6k / 8k / 10k / 12k) and is a bar on Home, a card on Home, a chart on Progress, and the Health screen.
- Mobile counts steps from the phone's pedometer (`expo-sensors`). iOS reads today's total directly; Android counts live while the app runs and keeps a running total. Manual entry fills any gap.
- Calories from steps = steps x body weight x 0.0005 (10,000 steps at 70 kg ≈ 350 kcal). They are added to **Calories burned** automatically everywhere: Home, Food balance card (deficit/surplus), Exercise "Burned today", daily history, Progress charts, weekly totals. The server does the math, so web and mobile always agree.
- Note: if you log a "Walking" workout *and* your phone counts those same steps, that walk is counted twice. Prefer the step count for walking.

## Food logging
- 127 everyday foods seeded on first server start (Indian staples first: roti, idli, dosa, dal, biryani, sambar, paneer dishes, fruit, snacks, sweets...) with household measures (katori, piece, glass, tbsp...). Tap a measure to set the serving size.
- Barcode scanner (camera or typed number) -> Open Food Facts -> review -> save and log. Remembers products by barcode.
- "Same as yesterday" for any meal, and Saved meals (save a meal slot, log it in one tap, long-press to delete).
- Macros card: protein / carbs / fat targets that add up to your calorie target.

## Targets, pace and plan
- Weight-change pace (0.25-1 kg/week) now sets the calorie target (7,700 kcal per kg) with a safe minimum (1,500 men / 1,200 women); the app tells you if the pace was held back.
- Onboarding collects age, sex, height, weight, goal weight, activity and pace, then shows your plan: calories, macros, water, steps and weeks to goal.
- Profile has an editable "Your plan" card and a medical disclaimer.

## Retention
- Logging streak (current/best, last 14 days) on Home.
- Smart in-app nudges based on time of day (missed meals, water behind schedule, steps behind).
- "Fits the rest of your day": your own foods ranked by remaining calories and protein.
- Insights on Progress: consistency, calories vs goal, weekend protein dips, hydration, steps, activity.

## Health
- Health screen: steps, sleep, heart rate, blood pressure, glucose, body measurements (waist/chest/hips/arm/thigh), each with a chart and history.
- Fasting timer (12:12 to 20:4) with stages and history.
- Progress photos stored only on the phone (never uploaded), with a before/after compare.
- Strength training: record sets (reps x kg), personal records with estimated 1-rep max, rest timer.

## Accounts
- Forgot password on mobile and web: emailed 8-character code (30 min, 5 attempts, single use, same reply whether or not the email exists). Set `SMTP_URL` on the server to actually send mail; in development the code is printed to the server log.
- Data export and account deletion now include the new data.

## Web app
Forgot password, Health & Steps page, steps on the dashboard, step calories in Calories Burned, steps and burned charts on Progress, "same as yesterday", household measures. (Barcode, photos, fasting, saved meals, rest timer and strength records are mobile-only for now.)

## Verification
- Mobile: `tsc` clean, 54 Jest tests pass (new: energy/pace/macros, insights, nudges, suggestions, step sync).
- Server: all files parse; unit tests pass (steps->kcal, streaks, records, barcode conversion, catalogue sanity check that every food's calories agree with its macros). New integration tests (steps summary, health validation, saved meals, fasting, streaks, strength sets, password reset) are written but **need MongoDB to run**: `TEST_MONGO_URI=... npm test`.
- Web: production build succeeds, 0 lint errors.
- Not tested on a real phone: camera scanning, the pedometer, photo picking and the keyboard changes need a device build.
