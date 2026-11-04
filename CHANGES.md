# v60 - numbers that agree, keep-or-fresh start, last weigh-in (server + web)
- ROOT CAUSES from the v59 screenshots: (1) the scale-jump headline compared your reading with the trend BEFORE the weigh-in but the sentence quoted the trend AFTER it, so "1.9 kg" and "78.96" never matched; the trend was also smoothed over a 28-day window seeded at its first reading. Now it smooths all history and the text quotes expected weight, scale reading and new trend. (2) "Likely arrival" started from a smoothed line (which lags a recent drop) instead of the goal card's "now" (average of the last 7 days), so its distance did not match "To go". Now both use `recentAverage` and the plan's target (`lib/trendWeight.js`, `routes/coachRoutes.js`). (3) The arrival chart spanned up to 2 years with no dates and drew the line flat along the goal after arrival: it now fits the likely date, has date labels, and stops at a labelled arrival dot (`utils/coneGeometry.js`, shared with the phone). (4) Protein: "88%" (of the 139 g target) next to "2 g to go" (to the bottom of the 125 to 160 g range) used two yardsticks; the line now says what you have and the distance to the range.
- Goal card finish date now comes from the SAME estimate as the Weight page's "Likely arrival" (`goalRange`). It used the change between two ends of the smoothed line over 14 days, which one dip could double, so a card could say "A little behind" and "arrive in 6 weeks" at once. Too few weigh-ins: falls back to the plan's pace.
- Goal card: `checkLine` / `lastWeighIn` ("Started at 80.3 kg · Last weigh-in: 77.4 kg, today · 7-day average: 77.6 kg"), shown through the tap-to-reveal so the numbers stay hidden until you tap.
- Re-saving a plan no longer restarts progress at 0: `PUT /api/plan` takes `startMode` ("keep" | "fresh"). With an active plan and no choice (an older app) it KEEPS the old start. The plan panel asks "Keep your old start, or start fresh?" (`lib/planStart.js`).
- `/api/health` now reports `apiLevel` (60) and `features`; `tools/checkServerReady.mjs <url>` says whether the phone app is safe to release. See DEPLOY_ORDER.md.
- Tests: server 486 pass / 2 fail (same 2 as v59: "apply saves the body goal..." equipment cleanup, and Google sign-in which needs MongoDB). Client 159 pass; `npm run build` OK. New: numbersAgree, planStart, apiLevel, coneGeometry, talk.
- NOT done here: a real server with MongoDB; the goal card's own arrival estimate (`etaRange`) is still a separate calculation from the Weight page's.

# v59 - Goal progress reads your real weigh-ins; "in range" now means done (server, web, phone)
- GOAL CARD ("0.4 kg done of 7.4 kg"): "now" used to be a smoothing line that started at your start weight and trailed behind real change, so progress read too low and the "above where your plan expected you" gap looked bigger than it is. `planTrendKg` now uses the AVERAGE of your weigh-ins in the 7 days up to your latest one (counted from the plan's start weight). No weigh-in since the start = 0 kg done. A small line under the card says how it is counted (`goal.basisLine`, web + phone).
- IN RANGE = DONE: protein is completed when the day lands inside the min to max range shown on the Targets screen (new `proteinMin` / `proteinMax` on the day's targets, `proteinInRange()` in `lib/journey.js`). Used by the daily quest, XP, weekly habit counts and the north-star adherence. The quest hint now says "In range (96 to 160 g)" or how much is left. Calories already used a range; water, steps and training are "at least" goals.
- Tests: `test/inRangeAndGoal.unit.test.js` (5). Full server suite: 476 pass, 2 fail (the same 2 fail on v58: bodyPlanRoutes "apply saves..." and Google sign-in callback).
- NOT run: web build, the app on a device, real MongoDB.

# v58 - Web and phone kept in step (web)
- Removed 16 exercise photos nothing referenced (`public/exercises`, -244 KB). 73 remain, the same 73 the phone now ships.
- `data/exerciseImages.js` is now the single source for the photo map: the phone's `exerciseImages.ts` is generated from it (`tools/syncExerciseImages.mjs` in the phone project). Change it here, then regenerate there.
- New checks (run from the folder that holds `web/` and `mobile/`): `node tools/checkSharedFiles.mjs` (exerciseFigure, training, photo map, photo files identical) and `node tools/checkApiParity.mjs` (every /api path the web or phone calls has a server route; 272 paths checked, none missing).
- NOT run: `vite build`, client tests, the app in a browser.

# v57 - ONE workout plan (Today, My plan, Body and the live workout now share it) + duplicates removed (web)
- Two plans used to run side by side: the fixed 7-day plan on Today / My plan, and the server's "Smart program" in the Body tab. They never shared exercises or logs. Now `utils/unifiedPlan.js` turns the smart program into the same day shape as the fixed plan, so Today, My plan, day overview, live workout, History, Library and the exercise sheet all run on ONE plan. Smart is used whenever the server has a plan for you; "My plan > Your plan" switches to the Classic 7-day plan (works fully offline).
- Smart days: Gym / Home match / Quick 20 chips, "Not today" (the week slides), "Train anyway", the server's today target per exercise, a "This week" card (what changed, one-tap suggestions, is it working), pain chips on the finish screen. Finished workouts go to `POST /api/body-plan/session` (queued offline, safe to repeat).
- Duplicates fixed: a passed slot (missed / skipped / before you started) no longer lists its session again (Mon "Upper 1" and Tue "Upper 1"); the Smart program tab no longer repeats every day's exercises under the picked day; "Jump to" (same as the tab bar), the phase bar on Today (same as My plan), the streak chip (same as the Streak tile), the muscles card (same as the hero line) and the repeated body-fat numbers are gone; library names are unique; ONE request for the plan instead of two; a finished smart workout is no longer also logged as a separate exercise (calories counted twice).
- Body tab is now Eating / Me / More (the training sections live under My plan). Last plan is kept in the browser so the page opens at once and works offline.
- Tests: client 153 pass (17 new in `unifiedPlan.test.js`, real server plan fixture); `npm run e2e:workout` clicks through Today, quick/gym, a full workout, History, My plan, Library, Body and Classic in Chromium. NOT run: `vite build` (npm is blocked here; bundled with esbuild + React 19 instead; the app pins 18.3.1), real server/MongoDB.

# v56 - One Workout & Body page, your exercise photos, and the "can't click / jumps up and down" fix (web)
- ROOT CAUSE of the jumping and unclickable sheets: `<main>` (polish.css) and every `.card` (fun.css) had `backdrop-filter`. That makes them the containing block of every `position: fixed` sheet inside them, so pop-ups were sized to the whole page and landed far above or below the screen. Removed. Also: cards no longer lift/tilt on hover or replay their entrance, buttons and headings no longer repaint forever, page changes no longer use View Transitions (they froze taps), `scroll-behavior: smooth` removed, every page opens at its top, the exercise sheet no longer re-steals focus / scrolls the page / locks the body, it is rendered in a portal, the roaming characters hide while a sheet or live workout is open and stand lower, sticky bars sit under the header (`--nav-top`). New `styles/stability.css` (loaded last).
- Body plan + Workouts are ONE page: "Workout & Body" with tabs Today / My plan / Body / Library / History. Body = goal, calories, eating, tape measurements, analysis and the auto-adjusting "Smart program". Today shows your body-goal numbers. `bodyPlan` links still work (they open the Body tab). One nav entry instead of two.
- Your four exercise sheets are used as real photos: `public/exercises/*.webp` (cropped), mapped by exercise name in `data/exerciseImages.js` (56 of the 73 library exercises; others keep the drawn figure). Thumbnails everywhere, step-by-step photo strip + tips in the exercise sheet (tap to enlarge). Exercises that are only in the sheets were added to the Library (`data/libraryExtra.js`, with a Cardio filter).
- Checked: 136 client unit tests pass; built with esbuild and clicked through in Chromium on phone and desktop size (sheet fills the screen, live-workout buttons not covered). NOT run: `npm run build` with Vite (npm registry blocked here; tested with React 19, the app pins 18.3.1), real server.

# v55 - Body plan adapts to what you do + clear exercise pictures (server, web, phone)
- ADAPTIVE PLAN. The plan now reads the sessions you log (and other workouts, weigh-ins, waist tape) and re-works the week. New `server/lib/bodyPlanAdapt.js`; `GET /api/body-plan` returns `plan.adapt` and every exercise carries `next` (today's target) and `setsToday`.
  * Top of the rep range on every set -> heavier by a small step (+2 kg upper, +5 kg lower, max 10 %); otherwise +1 rep; reps down 2+ two sessions in a row -> same weight, one set fewer.
  * Skipped a session -> it slides to the next open day (never Sunday, never 3 lifting days in a row, sessions follow rotation order); if no day fits it is let go, never doubled up.
  * Easy week from evidence (hard sessions, dipping reps, pain) or every 5-6 trained weeks, never twice in a row, and it stays easy until Sunday.
  * Back after a break: 8-14 days x0.95, 15-28 days x0.9, over 28 days x0.8 with one set fewer.
  * Consistent and fresh -> +1 set on muscles under their weekly range (never above it). Doing more than planned for weeks with good recovery -> offers one more day (capped at the plan's maximum). More lifting on top of full volume is called out honestly.
  * Pain noted twice -> offers to remove the moves that load that joint (one tap). Dizziness / chest pressure -> stop and see a doctor.
  * Cardio ramps +10 min from what you did last week. Weight trend, waist and lift trend give a plain "is it working" verdict (too fast / on track / stalled -> steps first, not less food).
- New: `models/BodyPlanSession` (in export and account deletion), `Profile.goals.bodyPlanStartedOn`, `POST /api/body-plan/session`, `GET /api/body-plan/sessions`, `DELETE /api/body-plan/session/:id`. A logged session also counts as exercise in the day's totals (Strength Training). Calories are NOT changed by this feature.
- Web + phone Workout tab: "This week" card (what changed and why, one-tap suggestions), week strip with done / planned / not done, today's target on each exercise, a set logger prefilled from the target, feel + soreness, "Not today" with a reason.
- PICTURES. Stick figures replaced by illustrated figures (`utils/exerciseFigure.js` / `.ts`, shared by web and phone): body with clothes, the equipment you hold (barbell, dumbbell, kettlebell, bag, handle), benches / machines / cables / bars drawn in, the working muscles lit up, the whole range of motion in one picture (faint finish behind the start + dashed arrow), 3 tappable key frames, and a Play loop. 49 poses; each of the 130 exercises gets the right one (push-up, pull-up, leg press, hip thrust, lateral raise... no longer share a standing squat picture). `ExercisePic` now takes the whole exercise (`ex`); an `image` URL still wins.
- Every exercise now has a short "Set up / Move / Breathe / Avoid" guide (`form`) and the helper muscles (`helpers`).
- More tab: "Where this plan comes from".
- Tests: server `bodyPlanAdapt.unit.test.js` (21), route tests extended (6 new, stub the new models), client `exerciseFigure.test.js` (5). NOT run here: web build, the app on a device, real MongoDB. The route tests were run against tiny stand-ins for express and mongoose because npm is not available here; run `npm test` in server and client before deploying.
- Both `exerciseFigure` files must stay identical (web `.js`, phone `.ts` with a ts-nocheck first line).

## Body plan page simplified: 4 tabs, today's workout first
- Goal = four buttons. Headline numbers + one save button in a top card. Then tabs: Workout (default, today picked), Eating, Me (setup + tape), More (analysis, progress, cardio, safety).
- Workout tab: week strip with today marked, then Gym / Home / Quick switch, exercises with picture + "3 sets, 8-12 reps, rest 90 s" badges. Replaces 12 folded cards.

## Body plan is now its own tab (with exercise pictures)
- Body plan sits in the main navigation instead of being hidden behind Profile / Home. It is always visible (not locked by simple mode).
- Every exercise shows a Start -> Finish stick-figure picture (ExercisePic). Poses are a few angles per movement, so there are no image files to download. An exercise can carry an `image` URL to show a real photo instead.
- bodyplan.css rewritten in 7 labelled sections with four colour variables at the top. Class names unchanged.

# v54 - Body plan: full training program + body analysis (server and web)
- The Body plan's training advice was 3 fixed lines per goal. It is now a body analysis and a complete weekly program that adapts to the person's size, shape, age, sex, goal, experience, where they train and what hurts. Full write-up, with the findings and what was NOT changed: `docs/BODYPLAN_TRAINING.md`.
- New `server/lib/exerciseLibrary.js` (130 exercises with swap logic) and `server/lib/trainingPlan.js`. `lib/bodyPlan.js` returns `plan.analysis` and `plan.training.program` (the old `plan.training.sessions` lines are kept for older apps).
- Every exercise lists what to do when the machine is busy or missing (different kinds of equipment), with only dumbbells, or with nothing. Every day has a home version and a 20-minute quick circuit. Active-day menu with calories for your weight, cardio zones, progression, easy weeks, safety.
- Injury limits (knee, back, shoulder, wrist, elbow, heart/blood pressure) remove the moves that aggravate them everywhere, including swaps.
- Fix: when the calorie floor limits the pace, the plan now slows the pace so weeks and checkpoints are honest (`pace-slowed` notice).
- API: `GET /api/body-plan` accepts `place, level, days, minutes, equipment, limits, focus` to preview; `POST /api/body-plan/apply` accepts `training` and saves it in the new `Profile.training`. Older apps that send only `type` keep working.
- Web: `BodyPlanPage.jsx` + new `TrainingSections.jsx` (setup, analysis, program, busy/home/quick, active days, progression, safety), CSS in `bodyplan.css`.
- Tests: `trainingPlan.unit.test.js` (18) and `bodyPlanRoutes.unit.test.js` (6) added; with dependencies installed the whole server suite is 458 tests with 1 failure, the same Google web sign-in test that fails on the untouched original. NOT run: the web build (`npm run build`), the web unit tests, the Playwright smoke test, the app in a browser. The new web components were server-rendered with React against real plans (4 body types, 7 sections each) and the JSX was syntax-checked.

# Web: Body plan screen (was missing) + weight estimate for the analysis
- The server and the phone app had the Body plan, but the web app had no screen for it, so it never asked for a body goal. New `client/src/pages/BodyPlanPage.jsx` (+ `bodyplan.css`): pick lean / athletic / muscular / balanced, add tape measurements, see the plan, "Use this plan" saves it (GET /api/body-plan, POST /api/body-plan/apply). Reached from a Home card (shown until a body goal is chosen, not for gain goals; same rule as the phone) and from Profile > Weight Goal. Page id: `bodyPlan` (`ff:goto` works too).
- Weight estimate from the food log when weigh-ins are missing or old: `server/lib/weightEstimate.js`; used by over-days advice, plateau card, weekly email, diet-break advice and the assistant. Analysis only: never charted, never saved, not used by safety checks or the "kg lost" progress. Tests: `server/test/weightEstimate.unit.test.js` (12).
- Checked here: JSX syntax of the edited files (esbuild) and the 119 client unit tests. NOT run: `npm run build`, the app in a browser.

# v53 - smarter "ate heavy for a few days" advice (weekly ledger engine)
- New `server/lib/overEngine.js`; `lib/intakeAdvice.js` now delegates to it (same output shape, so the banners AND the meal planner use the same numbers). Rules: each day is judged against its own budget (target + earned activity); days with almost nothing logged are UNKNOWN, not zero; lighter days earn capped credit (30 % of target); a weekly surplus under 5 % of the weekly target gets NO cut; otherwise only a share (50 % one day, 60 % a streak, 40 % a heavy week) is recovered, over 3 / 4 / 5 days at most, max 12 % of target or 250 kcal a day, never below the 1200 / 1500 floor; a heavy day right after a very light day = restrict-overeat cycle, so no cut ("eat regular meals"); weight NOT rising after a heavy week = the target or log is probably off, so no cut; target already at the floor = no cut, easier pace suggested; gain goals never get a cut. "Over" is the same 8 % line as the rest of the app.
- `GET /api/plan/over-days` now returns the engine's tier, cause, easier pace, `advice.ledger` (surplus, recovered, honest leftover, days it delays the goal, confidence), `walkKcal` and `engine: 'ledger-v1'`; `correction` is still sent for older apps, derived from the same advice.
- `POST /api/plan/rescue-day` honours an optional `goal` (tomorrow's trimmed kcal), clamped between the safe floor and the normal target, so the planner matches the card.
- Planner: no longer restricts treats when the advice is "no cut needed" (e.g. after a very light day).
- Web: Over-day card and Fix my day show the engine's advice, hide "Plan a gentle day" when no cut is needed, the walk line is weight-based, and the see-saw case says not to skip meals.
- Tests: `server/test/overEngine.unit.test.js` (16, passing). Server unit suite: 297 pass, 3 fail (the same 3 as in v52: album `owned`, features, v8_features; not touched). Existing smartPlan / fatloss / autoPlan / planSensei tests still pass unchanged.
- NOT run here (no npm registry): the web build (`npm run build`), web tests, API integration tests (need MongoDB), and the app in a browser. The two edited JSX files were only syntax-checked.

# v52 - everything from the 11-point list
- Home "Eaten" kcal opens today's meals (`components/home/EatenSheet.jsx`) with the portion editor; closes after a save so the Undo toast shows.
- Undo toast (5 s) after editing a portion: food log, planner, Eaten sheet (`undoNotice` in utils/undo.js).
- Planner: "✓ Log what I planned" per meal (today only).
- Portion editor: "Usual" chip per food (after 2 uses, this device) and household count chips (`utils/portionPresets.js`, 4 tests).
- Weekly review: went-well / what-to-change / one-thing card (`utils/weekSummary.js`, 4 tests).
- Shared `components/home/StatCard.jsx`; per-card `.sc-water .pk` / `.sc-steps .pk` rules replaced by one `.sc-has-plus` rule.
- Visual checks at 1280 / 1024 / 360 px: `npm run build && npm run e2e:home` (e2e/home-layout.mjs, screenshots in e2e-shots/). NOT run here (no Playwright/Chromium).
- Server: 3 unit tests already failed in v50 (palettes, `owned` album view, features/v8). Not touched.

# v51 - goal reason, planner freshness, empty states
- Goal card: `statusWhy` line explains "A little behind" (no weigh-in since start / N days quiet / only N weigh-ins / gap to plan line). Server `lib/simpleGoals.js`, test `server/test/goalWhy.unit.test.js` (5, passing).
- Planner: "Last updated" time and a Refresh button.
- Empty steps / exercise cards: "Nothing yet. A short walk counts".
- NOT built here (no npm registry): run `npm run build` in client.

# v49 - Phase 3 Section M: platform part 2
- Weekly backup email (opt-in): your data export (JSON + CSV) attached, own one-tap stop link. Mailer now supports attachments on every provider.
- Admin server health page (`#admin`, `ADMIN_EMAILS` only): cold starts, failed syncs, dropped offline writes, errors, keep-alive status.
- Feature flags: per person, allow/deny lists or a percentage; cached on the apps for 6 hours.
- Web tests: `npm test` (101) and a Playwright smoke test (`npm run e2e`). Auth gate decisions moved to `auth/gateLogic.js`.
- Speed: first-load JavaScript 264,967 B to 248,669 B (sign-in pages, setup page, assistant and quick-add now load later).
- Includes your v48 fixes (album `owned` list, GoalsPage). Docs: `docs/PHASE3_PLATFORM2.md`.

# v47 - Phase 3 Section L: platform part 1
- Instant open: "Your last saved day, updated X min ago" strip with the day's character while the saved copy is on screen.
- Hot-day water goal (opt-in, Open-Meteo, shown with the reason; silent offline). Server: device sleep readings never overwrite typed ones; workouts import route `POST /api/activities/import` with duplicate protection; activity logs remember their source and heart rate. Imported entries show "from Samsung Health".
- Docs: `docs/PHASE3_PLATFORM1.md` (free / native-build answers per item, widget and Wear OS plan).

# v46 - Phase 3 Section K: strength and training
- Routines can carry target sets, reps, kg and rest (old duration-only routines still work). Workout mode steps through exercises with sets prefilled from last time, a rest timer and a "power up" scene when a record is beaten. New web Routines screen.
- Estimated 1RM (Epley and Brzycki, formulas shown), beat-last-time hint, best set and volume history, weekly sets per muscle, deload nudge, plate calculator (kg and lb). Muscle groups added to the activity catalogue plus 23 strength moves.
- Beginner training arcs (4, 6 and 8 weeks) with weekly episodes, a rest arc and a +500 steps a week goal capped by your profile.
- Daily workout suggestion with reasons; guided meditate and stretch (3 to 10 minutes, breathing circle, logged as an activity).
- Server: `lib/strength`, `lib/muscles`, `lib/programs`, `lib/workoutSuggest`, `lib/guided`, `lib/workoutBuild`, `routes/trainingRoutes`, `TrainingProgram` model (in export and account deletion). Details: `docs/PHASE3_TRAINING.md`.

# v45 - Phase 3 Section J: UI part 2
- Accessibility: palette checker (`tools/a11y-check.js`) + fixes (status colours, button contrast, orange), large-text mode (web), label fix.
- Measurement trends next to weight; web progress photos (private, IndexedDB) with before/after date slider.
- Medicine and supplement checklist with quiet-hours reminders, in export and deletion.
- Monthly season recap card (made on the device, health numbers opt-in).
- Optional accountability link (one person, chosen fields, revocable, hashed secret).
- Fix: measure-trends path is `/api/health-logs/...`.
- Tests: `a11y` (4), `measurements` (4), `medicines` (5), `wrapped` (5), `shareLink` (4), web `photoCompare` (3), `wrappedCard` (4).

# v44 - Phase 3 Section I: UI part 1
- Simple/advanced mode (server `features.js`, `/api/coach/features`), Profile "Show all features", sensei unlock messages.
- Adaptive Home step (`nextStep.js`, `/api/coach/next-step`) in the existing hero.
- Undo toast replaces single-item delete confirms (food, weight, task, habit, water, exercise, foods, recipes, templates); real confirm kept for bulk/irreversible.
- UI language: Hindi, Telugu, Tamil (first drafts, flagged for review), English fallback, `tools/i18n.js` CSV round trip.
- Ctrl/Cmd+K quick add, `?` shortcuts, wide-screen and tablet CSS.
- Tests: `uiOne.unit.test.js` (6), `undoCore.test.js` (5), `quickCommand.test.js` (4), `i18n.test.js` (4).

# v43 - Phase 3 / Section H: coaching and insights, part 2 (web + server)
- Coach tone (gentle / strict / funny), gentle mode with plate balance and support note, craving timer with swaps from your own foods, habit anchors, festival / wedding / trip mode, optional diet break on a plateau. Weekly per-day figure is never below the calorie floor.
- Fix: the phone app's habit edit used PUT; the server now accepts PUT as well as PATCH.
- Tests: server/test/coachH.unit.test.js (7). Docs: docs/PHASE3_COACHING2.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v42 - Phase 3 / Section G: coaching and insights, part 1 (web + server)
- Rough-day "rest arc", 7-day side quests with sticker, scale-jump explainer, sleep-to-eating link, goal-date range cone, coach that learns (resettable in Profile), weekly treat allowance inside the weekly budget.
- Tests: server/test/coachG.unit.test.js (9). Docs: docs/PHASE3_COACHING1.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v41 - Phase 3 / Section F: faster food logging, part 2 (web + server)
- Fit preview protein line; "What can I cook?"; glycemic tags, pairing tips and diabetes-friendly view (published values only); CSV import with dry run; tomorrow's lunch planner with canteen favourites; grocery list by aisle with tick-off, "have it" and share.
- Tests: server/test/logging2.unit.test.js (15). Docs: docs/PHASE3_LOGGING2.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v40 - Phase 3 / Section E: faster food logging, part 1 (web + server)
- **Copy / repeat**: "Copy yesterday's lunch" and "Same as last time" open a preview with editable amounts before anything is saved. **Select several** foods from search and add them in one tap (`/api/food-logs/bulk`).
- **Voice logging**: Speak button (hidden where the browser has no speech recognition) with English, Hindi, Telugu, Tamil. The heard text goes through the existing meal parser into an editable review. Sticker for the first spoken meal.
- **Shared pot**: "I cooked a pot" (servings and/or total cooked weight), then "I ate" by servings or grams; nutrition scales from the recipe and the pot's servings left go down. Sticker for the first one.
- **Paste ingredients** into a recipe ("2 cups rice, 1 cup toor dal, 2 tbsp oil"): amounts converted to grams, raw rice and dal converted to cooked weight (calories kept), warnings where it had to assume, added-oil line. Nothing guessed: unknown weights are left for you.
- **Portion guides**: drawn katori, roti, ladle, glass and spoon sizes next to the quantity box.
- **Chai and coffee counter**: cups, sugar spoons, milk, cup size; calories from the catalogue's milk and sugar; weekly "hidden calories" note in kind wording.
- Tests: server/test/logging1.unit.test.js (10), client portionGuides.test.js (2). Docs: docs/PHASE3_LOGGING1.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v39 - Phase 3 / Section D: food data accuracy and trust (web + server)
- **Vitamins and minerals** (iron, calcium, potassium, magnesium, zinc, A, B12, C, D, folate): power-up card on Progress with the macro arrows, a character reaction, bars against adult ICMR-NIN ranges, and tap-a-low-nutrient for foods you already log that help. Too little data shows "Not enough data", never a zero.
- **Confidence label** on every food (Verified / Typical / Added by you) and **Report wrong values** (reports saved for the admin list; `GET /api/admin/food-reports`, `ADMIN_EMAILS` env var).
- Optional vitamin/mineral inputs in the food form (blank = unknown). Open Food Facts scans now import vitamins and minerals when present.
- Weekly coach: "Low on iron 3 weeks in a row" with foods from your own log.
- Data pipeline with no invented values: `server/data/foodMicros.json` is empty on purpose; fill `foodMicros.template.csv` from IFCT/USDA and run `node scripts/importMicros.js --import file.csv`. `rdaIcmrNin.json` is marked unverified: check it against the ICMR-NIN 2020 PDF.
- Food reports are included in export and account deletion. Migration: none. Docs: CALCULATIONS.md, docs/PHASE3_FOOD_TRUST.md.
- Tests: server/test/micro.unit.test.js (12).
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v38 - Phase 3 / Section C: a real onboarding and app tour (web + server)
- **Welcome (3 screens)**: what the app gives you, your goal (pre-filled from your profile), your coach (saved with the Planning sensei coach). Opens once after sign-up; "Not now" and "Don't show again" on every screen.
- **First-win steps (max 5, goal-based path)**: the person does the thing ("Tap + and log a glass of water", "Search 'dal' and add it", "Plan tomorrow"). Real actions are detected from successful API writes (`flexfit:api-write`, offline-queued writes count too), the coach cheers with a power-up scene.
- **Real spotlight**: dimmed page with a cut-out around the actual element (measured with getBoundingClientRect, follows scroll / resize / keyboard), pulse ring, pointer, tooltip that flips to fit (tested at 360 x 640). A missing anchor skips that step instead of breaking. Anchors are `data-tour="..."`.
- **Your first week checklist** on Home (log a meal, water, weight, plan tomorrow, meet your coach), "3 of 5", collapsible, dismissible, resumable; finishing shows the **Rookie** sticker.
- **Coachmarks**: 1-3 hints the first time you open Log, Planner, Progress, Tasks, Profile, with "Got it" and a "?" button that replays them. **What's new** dots from one config list.
- **Control**: Skip tour at any time (resume from Home or Profile), replay and resume from Profile > Help and tour. Short copy (max 20 words, tested).
- **Accessibility**: focus trap and Esc on the welcome and spotlight, polite screen-reader announcements, 44 px targets, reduced-motion respected.
- **One shared content file**: `client/src/tour/tourContent.js` + `tourEngine.js` are byte-identical to the mobile copies. Progress is kept in the browser and on the server (`GET/PUT /api/tour`, merged so nothing completed is lost). No third-party library or tracker (custom component, no licence needed).
- Server: `Profile.tour`, `routes/tourRoutes.js`, `lib/tourState.js`. Migration: none.
- Tests: client/src/tour/tourEngine.test.js (14), server/test/tourState.unit.test.js.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---

# v37 - Phase 3 / Section B: one goal, one daily focus, one level, one badge shelf (web + server)
- Server: lib/simpleGoals.js (pure, tested) + lib/simpleData.js; new GET /api/goals/simple and POST /api/goals/check-target; journey endpoint now shares the one level and the 3 quests. Copy is written once on the server and sent to web and mobile.
- Web: components/simple (GoalCard, FocusCard, LevelBar, BadgeShelf, DetailsPanel, TargetsPanel). Home: one goal card; Goals page: the simplified block, then Plan/rewards and Stickers folded away. Removed FatLossCard, JourneyCard, the duplicate quest list and the Real progress badge card. Weekly review shows the Weekly score parts and one win.
- Badge mapping, before/after list: docs/PHASE3_GOALS_SIMPLE.md.
- Tests: server/test/simpleGoals.unit.test.js (16), simpleData.unit.test.js. NOT built or run in the authoring environment (no npm registry): please run `npm run build` in client.
---

# v36 - Phase 3: the Planning sensei (web + server)
- **Chat-style planning** replaces the meals / mode / diet chips: a character-led conversation (typing animation, quick-reply chips, progress dots, Skip, "Use my usual", Back) asks 3-4 questions per session (3 on later "Improve my plan" check-ins) and ends with an editable **Your plan setup** card, then the plan preview. Finishing setup unlocks the **Meal Sensei** sticker. Coach and tone (cheerful / calm / straight to the point) are chosen on the card; the day's character is the default.
- **Questions** (adaptive, never what the profile already knows): diet (veg, egg, non-veg, vegan, Jain, sattvic), allergies / intolerances / religious rules, a private health note (pregnancy, medical), cook time per meal (10 / 20 / 40), dislikes, cuisines (North Indian, Punjabi, Gujarati, Maharashtrian, Bengali, Tamil Nadu, Kerala, Karnataka, Andhra, Telangana, and more), who eats (portion scaling), eating out, protein sources, kitchen and equipment (incl. no stove), budget, spice and oil, batch-cook / leftovers, big breakfast or big dinner, snacks and sweet cravings, loved foods, variety vs repeat, fasting (eating window, vrat days, Ramadan), festival / trip, what you already have. Answers are saved one by one into a private Food Preferences profile (`FoodPreference`).
- **Allergies are never overridden**: `lib/foodSafety.js` (allergen words + "often made with" dishes, intolerances, religious, Jain / sattvic / vegan, dislikes with spellings) filters the plan, swaps, add-ons, suggestions, the gentle day, the assistant's diet day, templates, copy-week and manual add (refused with a clear message). A last gate removes any leak before anything is shown or saved. Recipes are judged by their ingredients.
- **Smarter engine** (deterministic, seeded): a solver nudges portions so each day lands within a few percent of the calorie target with protein at or above the minimum and carbs / fat in range; never below the calorie floor. Variety rule: a main dish at most twice a week unless "repeat my favourites"; protein sources rotate. Cook time, equipment, budget, cuisine, spice, fasting windows, vrat days, Ramadan (suhoor / iftar), festival room, travel days, eaten-out meals (calories reserved), big-meal shares, sweet plan, loved foods, foods at home. **Cook once, eat twice** and **Sunday batch-cook** (leftover lunches flagged "no cooking").
- **Explain and learn**: "Why this plate?" per meal in one sentence; Swap shows the top 3 with a reason each; feedback chips per food (loved / too heavy / too long to cook / not available) change future ranking, stored per person and resettable; **lock a meal** to keep it while re-shuffling; **save a week as a template** and load it back (re-checked against your current exclusions); grocery list merges ingredients (recipes expanded), moves what you already have to "You already have", scales for adults / kids / elders.
- **Safety**: pregnancy, under 18 and medical conditions get a short "check with a doctor or dietitian" note and a steady (maintenance) target instead of a cut. No punishing language (tested).
- **Food tags**: `server/scripts/tagFoods.js` writes `server/data/foodTags.json` (cuisine, diet, cook time, equipment, spice, cost tier) from names and catalogue sections ONLY, and `foodTags.gaps.csv` listing every food with an empty field. Nothing is guessed. Fill the CSV (or `foodTags.overrides.json`) and run `node scripts/tagFoods.js --import data/foodTags.gaps.csv`.
- New routes: `/api/food-prefs` (flow, answer, complete, coach, feedback, reset), `/api/meal-plans/templates`, `POST /api/meal-plans/lock`. Changed: `/auto`, `/view`, `/alternatives`, `/swap`, `/shopping-list` (now `{ items, alreadyHave, people }`), `/copy-week`. Account export and deletion now include FoodPreference and PlanTemplate.
- Migration: none (new collections; new optional MealPlan fields locked, leftover, cookMin, cookNote).
- Tests: server/test/planSensei.unit.test.js (27), client/src/utils/sensei.test.js. See docs/PHASE3_PLANNING_SENSEI.md.
---

# v35 - Phase 2: the meal planner shows what you logged and plans around it (web + server)
- **Server**: new `GET /api/meal-plans/view` (logged + planned merged, day budget like Home, add-ons, chef hints); lib/dayView.js. `/auto` skips past days, uses Home's budget today, treats logged food as fixed and returns `fixed` and `addOns`. Rescue day respects logged meals.
- **No double counting**: MealPlan.logId pairs a plan row with its FoodLog; logging is idempotent; a food logged by hand marks the matching plan done; `Log day` skips logged items. Fixed an old bug where eaten plan rows were counted on top of their logs when planning.
- `POST /api/meal-plans` is idempotent by clientId and can plan a new healthy food by name. Plans cannot be created in the past.
- **Web**: planner shows Logged / Planned / Suggested, day bar, chef (hungry empty meals, victory on a complete day); offline queue now accepts plan logging and add-to-plan, shown before sync.
- Migration: none (new optional fields logId, clientId).
- Tests: server/test/dayView.unit.test.js, client/src/utils/mealView.test.js
---

# v34 - Phase 1: calm Home, cut-off stickers removed, weight blurred until tapped (web + server)
- **Weekly review card** always starts collapsed (slim line with the character's face, smooth open/close, no saved state).
- **Home**: sliding hero images, the blurred scene banner and all auto-advance timers removed. Static hero card with ONE character and one line of the day (changes once per day). Deleted HeroCarousel, MotivationCarousel (unused), home/scenes.js and the matching CSS.
- **Stickers**: tools/stickers/audit_stickers.py (Pillow) flags cut-off / tiny / mostly-empty stickers and writes client/src/motion/stickerBlocklist.json; manifest and server/data/stickerCatalog.json pruned (goku/lift-0, jinwoo/peace-0, tanjiro/chill-1); chars.js filters at runtime.
- **Layout**: corner stickers use container queries and disappear instead of being cropped or covering the plus button; the nutrition, habit and task cards no longer carry a corner sticker over their rows and inputs; the Progress card reserves space for its sticker.
- **WeightReveal** on Home, Weight page, trend chart, Goals, North Star, fat-loss card, Progress, Profile, Insights, Weekly coach. Blurred by default, tap to reveal with dissolve, roll-up, accent glow, buzz and a tiny character; re-blurs after 8 s, when the tab is hidden or when you leave the page.
- "Hide numbers" is now "Hide calorie numbers". Character lines no longer contain weight numbers.
- No server routes or calculations changed. No new environment variables, no migrations.

---

## Body plan, festival arcs, safe intake (this update)
- Newest item on top inside each meal in the planner (eaten first, then planned) - server dayView + phone mealView.
- Festival / trip / diet-break room now widens the day's calorie budget everywhere (Home, Food, planner, widget, quests, level, fat-loss score, over-day advice). Server: lib/eventExtra.js + eventExtraPure.js; /api/progress/day, /history and food-log summary return eventExtra.
- New Body plan (Profile > Body plan, and a Home card until a body goal is chosen): lean / athletic / muscular / balanced + tape measurements -> target weight and waist, safe pace, calories, macros, training, vitamins to watch. Server: lib/bodyPlan.js, routes/bodyPlanRoutes.js (GET /api/body-plan, POST /api/body-plan/apply). Phone: app/body-plan.tsx.
- Protein target is now automatic by default (goals.proteinTarget null); the old default of 140 always overrode the automatic value. Type a number to override.
- Vitamins & minerals are collapsed under the macros (tap to open), with the nutrients that run short while eating less listed first.
- Safe intake: components/SafeIntakeCard.tsx + utils/intakeSafety.ts show effects and what to do when intake is too low or too heavy; Profile warns on unsafe typed calories and pace.
- Not run here: phone TypeScript check, jest, web build, DB-backed server tests (no npm access). Run them before release.
