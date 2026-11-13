# v70.1 - No more frozen screens: instant water entries, a live "Saving..." indicator, request timeouts (web + phone)
- Cause: adding water waited for the server (and on the phone for up to ~21 s of silent cold-start retries) plus a refetch before anything changed, and nothing said a request was running.
- Water: the glass and the total appear the moment you tap, the server confirms in the background, a failed save takes the glass back with a message, and nothing is disabled meanwhile (web `pages/WaterPage.jsx`, phone `app/water.tsx`).
- `packages/shared/src/netActivity.js` (synced to web and phone): one store that every request reports to. Under 0.7 s nothing shows; then a thin moving bar and a pill ("Saving..." / "Loading..."); after 5 s "still saving, your entry is safe"; while the server is waking, "Waking the server up". It never blocks a tap. Components: `NetworkActivity.jsx` (mounted in `main.jsx`) and `NetworkActivity.tsx` (mounted in `app/_layout.tsx`).
- Web `apiFetch` now stops a request that gets no answer (writes after 20 s, reads after 45 s). A stopped write is kept on the device and sent again later (the clientId stops duplicates); a stopped read falls back to the saved copy.
- Phone `request()` reports retries to the indicator. Tests: client `utils/netActivity.test.js` (+1). NOT run: vite build, phone typecheck/jest, a device.

# v70 - Targets follow your real progress; safer macros and pace; one diet break (server, web, phone)
- Shared model: `proteinRangeAt` and the day-budget option of `resolveTargets` now live in `packages/shared/src/energy.js`, the three copies are regenerated, and the energy fixture is one identical file in server, web and phone (the web copy was stale: it still expected a 100 % exercise credit). The translation files had 265 keys in the web and phone copies that the shared source lacked: they were merged into the source (web and phone were identical) so `syncShared --check` can pass.
- Fat: never under 0.6 g/kg (percentage still applies when higher); the fat range minimum follows.
- Pace: a loss pace is capped at 1 % of body weight a week when the target is worked out (`pace`, `paceAsked`, `paceCapped`). The weekly coach no longer proposes a pace above it. One `maxSafeWeeklyLossKg` for the whole app.
- Measured maintenance now feeds the target: `profile.measuredTdee` {ratio, confidence} is refreshed once a day (`lib/measuredMaintenance.js`) and blended into maintenance (`energy.blendTdee`: 60 % high, 35 % medium, low ignored, ratio clamped to +-20 %). The coach, diet break and day budget all read the same maintenance.
- Adaptive maintenance: a day counts as logged only above 35 % of the target (same rule as the weekly decision), and weigh-ins go through the outlier filter, so skipped meals and one salty reading no longer bias it low.
- One diet break: the plan screen now starts and ends the coach's break window (7 days by default, up to 14) instead of switching the calorie goal to a manual maintenance number. A break started by an older version is still handed back.
- Fibre: 14 g per 1,000 kcal but never under 30 g (men), 25 g (women).
- Minor: age advances by itself (`ageSetAt`); water can add ~15 ml per exercise minute (`resolveTargets(profile, { exerciseMinutes })`); protein for a large gap to the goal weight counts on an adjusted body weight; the lean and athletic waist goal is 0.47 of height (was 0.45); `docs/CALCULATIONS.md` brought up to date.
- Not done on purpose: a refeed day (optional, and a diet break plus the flex meal already cover it for this goal).
- Tests: server unit 646 pass (+16, new `test/gapFixes.unit.test.js`); the 6 failures need mongoose/express and are identical on the untouched upload. NOT run: client tests, vite build, phone typecheck/jest (no node_modules here).

# v69 - Exercise lists sorted properly; My plans picker has every exercise, with steps and pictures (web + phone)
- Sorting: one rule everywhere (`utils/exerciseDetail.js` `sortExercises`): your recent exercises, then muscle group (chest, back, shoulders, arms, legs, glutes, core, full body, cardio, mobility), then A-Z. Used by the Library, the Gym log picker, the My plans picker and (phone) the gym log. Exercise page order is now: Today summary, Log an exercise, Training hub, Log by time, History. The "Log by time" dropdown is grouped (Strength, Walking, Running... Cult.fit, Sports) instead of one long A-Z list.
- My plans picker: now offers the built-in library plus the whole gym catalogue (about 250 exercises, was 43), with a picture, tap-for-steps, sensible default sets x reps (compound 3x8-12, isolation 3x10-15, core 3x12-15, holds in seconds, cardio in minutes), "Show more" paging, and "Add my own exercise".
- BUG: in `customToDays` a comment swallowed `bw`, `timed`, `perSide` and `unit`, so a plank in your own plan ran as reps and bodyweight moves asked for kg. Fixed.
- Anything added to a plan opens with steps, avoid-tips, muscles and a picture (`utils/exerciseLookup.js`, `detailFor`), also catalogue and typed exercises.
- Routines builder (Training): the exercise list showed nothing until you typed, and only 8 matches. Now it lists by group at once (Strength first), with search across all groups.
- Phone: routine template builder gets search + group chips + taller list; gym log sorted by muscle group.
- Tests: client 215 (+5). NOT run: vite build, phone typecheck/jest (no node_modules), a device.

# v67 - HOTFIX: blank page "Failed to fetch dynamically imported module ... AssistantPanel-*.js 404" (web)
- Cause: every deploy renames the built files. A tab or saved page from before the deploy asked for `AssistantPanel-<old hash>.js`, which no longer exists. The assistant/palette are loaded late by `LateMount` with no error handling, so the failed import crashed React's root and the whole page went blank.
- Fix: `utils/chunkRecovery.js` recognises stale-file errors (Chrome, Firefox, Safari, Vite preload), retries once, then clears the saved shell/service worker and reloads ONCE (max one automatic reload a minute, so no loop). Installed in `main.jsx` (also for `vite:preloadError` and unhandled rejections).
- `LateMount` now has a `SilentBoundary`: if the assistant or palette cannot load, it just does not appear. All page chunks and the sign-in page use the same retry. The whole app is wrapped in a root error boundary.
- Service worker cache renamed `ff-shell-v3`, so every old saved shell is deleted on the next visit.
- Tests: client 200 pass (+3 in `utils/chunkRecovery.test.js`). NOT run: Vite build, a real browser (no node_modules/network here). The phone is unchanged.

# v63.3 - HOTFIX: blank Home page ("Cannot access 'ee' before initialization") (web)
- Cause: v63.2 moved the declaration of `T` in `components/home/HomeDashboard.jsx` below `bal`, but the next line (`const e = T?.energy`) still read it first. That is a use-before-declaration error, thrown as soon as Home renders (minified in production as `'ee'`), so the whole app showed a blank page. Fixed: it reads `T0?.energy` (the same object, declared above).
- New `src/home.render.test.js` renders the real Home screen (esbuild + react-dom/server) and checks its macro gauges use the budget-sized targets. It FAILS with the exact production error on the v63.2 code and passes now. Nothing in the old test suite rendered Home, which is why it was missed.
- Verified: client 198 pass (+1), server unit 630 pass (6 need express/mongoose/jsonwebtoken, absent here, same on the untouched upload), whole client bundles with esbuild. NOT run: a real browser, Vite itself, the phone. The phone has no change (v63.2 phone build is still current).

# v63.2 - one yardstick for the day: Macros card, Home gauges and quests all use today's budget (web + server + phone)
- Bug (seen on a phone screenshot): Home's ring uses the day's real budget, but the Macros card and Home gauges used the BASE target. Protein showed "Aim 93-140 g, goal 140 g, above maximum" at 146 g (the 35%-of-calories ceiling is lower on the base target and is forced down to the goal), while the same card said carbs/fat/fibre were in range and the quests said "not reached". `resolveTargets(profile, { budget })` (web `utils/energy.js` and phone `utils/energy.ts`, kept identical) now sizes macros, ranges and limits to the day's budget; the protein GOAL stays the plan's. Home (web), `MacroCard` (web + phone) and the phone food screen pass the budget. Without a budget everything is exactly as before.
- The server's quest protein ceiling (`energy.proteinRangeAt`) uses the same numbers; `test/dayBudgetTargets.unit.test.js` checks client == server on 800 people and reproduces the 146 g case.
- Phone bars: Protein, Carbs and Fat turn red only past the healthy range maximum, not merely past the goal (carbs at 151% of goal were red while "in range").
- Tests: server unit 630 pass (+3); client 197 pass. The 6 server failures need express/mongoose/jsonwebtoken, absent here (same on the untouched upload). NOT run: the apps, the phone's jest/typecheck, mongo-backed tests.

# v63.1 - quests judged against the day's real budget; typed set parsing (server)
- Bug: the calorie and protein quests (and XP, weekly missions, goal progress) used the BASE calorie target, while Home shows the day's budget (base + credited activity + festival/trip room). On a training day you could be under budget on Home and still "over" in the quest; the protein ceiling (35% of calories) also shrank with the base. Now `journeyData.attachDayBudgets` gives each day its `dayBalance` budget and a protein ceiling from `energy.proteinRangeAt`; `eventExtraPure.calorieTargetFor` / `proteinMaxFor` read them. Phone needs no change.
- New `lib/setText.js` and `POST /api/training/parse-sets`: typed notes ("bench 3x10 @ 60kg, squats 4x8 @ 80") -> sets matched to the Body plan library and the Activity list; unsure matches come back as options, unknown names unmatched. Nothing is saved by it.
- Tests: server unit 627 pass (+9: journey regression with the real numbers, 8 for setText); the 6 that fail need express/mongoose/jsonwebtoken, absent here (same 6 fail on the untouched upload). NOT run: the app, mongo-backed tests.

# v62 - one version, CI, security headers, streak forgiveness, phone Workout tab finished (web + server + phone)
- ONE version: `version.json` (62.0.0). `node tools/syncVersion.mjs` writes it into every package.json and the phone's app.json; `--check` runs in CI. Sentry release name is NOT wired yet.
- Docs: the loose `.md` files moved into `web/docs/`; this is the single changelog (the phone's `CHANGES.md` keeps its older history and points here).
- CI: `.github/workflows/ci.yml` (server tests, client tests + build, phone tsc + jest, shared files, API parity, version, translations).
- Security: Content-Security-Policy and other headers in `web/client/vercel.json`; stricter sign-in limits (`server/lib/authLimits.js`: login 5/15 min per email and 30 per IP, sign-up 5/hour per IP, forgot-password 3/hour per email). Tests set `AUTH_LIMITS_SCALE`.
- Streaks: a rest day or ONE missed day a week no longer resets the Home, water, habit, badge and XP streaks (`computeStreaks` takes `restDates`; `computeStreak(..., { forgive: true })`).
- Service worker: exercise photos, stickers and scenes are cached at run time (capped at 120).
- Translations: the four `lang.*` keys added to hi/ta/te (web and phone); tests no longer exclude them; drift tests; web and phone language files must be identical (`checkSharedFiles`).
- Tests: `mongodb-memory-server` helper (`server/test/helpers/mongo.js`); the API integration test uses it. Phone jest transforms `react-native-android-widget` (for the widgetTree suite).
- PHONE WORKOUT TAB (Smart days): Gym / Home match / Quick 20 chips, "Not today" with a reason (queued offline), the "This week" card with one-tap suggestions, pain chips on the finish screen (sent to the server), and the plan's own warm-up and cool-down in the live workout. `smartPlan.ts`: `wayList`, `variantDay`, `skipPayload`; `workoutEngine`: `buildSession(..., way)`, `finishSession({ pain })`.
- Backups (#16): the weekly backup email now carries an expiring (48 h) signed download link instead of the data as an attachment. `BACKUP_MODE=attach` restores the old behaviour. New route `GET /api/email/backup-download` (limited to 10 tries / 15 min per IP).
- Error boundaries (#8): each tab and each Home card is wrapped; crashes go to Sentry tagged with the tab or card name. Sentry release is `mydailyos@<version>` on web, server and phone (#27). NOTE: `@sentry/react` must still be added to `web/client/package.json` (`npm i @sentry/react`) for web reports to be sent.
- Check-in (#2): one-tap "How did you sleep? / How is your energy?" card on Home (web and phone). Sleep hours from Health Connect count automatically (device hours beat a tapped answer, and a tap never overwrites them); then only energy is asked. The coach turns it into a calm suggestion (easy day -> Quick 20 or a walk; well rested -> good day for the harder session); the plan itself is never changed. New: `GET/POST /api/coach/checkin`, `checkin` in `/api/coach/state`, `energy` health-log type (1 to 5), `server/lib/checkin.js`.
- Recipe import (#4): "Import recipe" on web and phone takes a link or pasted text (a whole recipe page, or Title / Serves 4 / Ingredients / Method). Links are read from the page's schema.org recipe data. Each ingredient is matched to your food database and calories and macros PER SERVING are worked out. A servings stepper scales every amount (per-serving macros stay the same). Nothing is saved until you press Save in the normal recipe editor. New: `POST /api/recipes/import` (10 a minute), `server/lib/recipeImport.js`, `server/lib/safeFetch.js` (blocks private/internal addresses on every redirect, 8 s, 1.5 MB), web `RecipeImport.jsx`, phone `RecipeImport.tsx`, `recipeScale` on both.
- Performance (#17, 18, 19): phone Recipes and History now use a virtualized list (`ListScreen` in `UI.tsx`, backed by `FlatList`). Server: cursor paging on health, weight and activity logs (`limit` + `cursor`; responses add `hasMore` and `nextCursor`; old clients are unaffected). Per-person per-day cache for Wrapped and the progress summaries (history, streaks, coach, micro, achievements, weekly, plateau), cleared by any write that person makes (`X-Cache: hit|miss` header; `lib/userCache.js`). Images were already WebP; stickers and exercise pictures below the fold are lazy-loaded on web; `tools/checkAssetBudget.mjs` (in CI) fails if a picture folder grows past its budget.
- Restore (#11): there was no way to restore a backup. Added `lib/restore.js`, `scripts/restoreBackup.js` (dry run by default, `--apply` to restore, safe to repeat), `npm run restore:drill` (`test/restoreDrill.test.js`) and `docs/RESTORE_DRILL.md`. Backups now also include recipes, saved meals and meal plans (they were missing).
- Security (#12, #15): (a) Request schemas: `server/lib/schema.js`, a small zod-style layer with no dependency. The coach check-in, rough-day, diet-break and features routes and the plan focus and break routes now refuse wrong types, out-of-range numbers and oversized lists with a plain 400, and drop unknown fields. Most other write routes already clean their input by hand (whitelists in `clean()` and `lib/validate.js`), so I did not rewrite those; `/api/goals/check-target` and `/api/coach/next-step` take free-form values and are left as they were. (b) Website sign-in cookie, OFF by default: see `docs/COOKIE_AUTH.md`. httpOnly session cookie + CSRF header + Origin check, sliding 14-day renewal, Google sign-in via a 60-second one-time code, `POST /api/auth/logout` and `/api/auth/exchange`, CORS credentials, `client/src/auth/session.js`, `/api/*` rewrite in `vercel.json`. The phone is unchanged.
- Phone error boundaries (#8): each tab exports `ScreenError` as its Expo Router `ErrorBoundary` (friendly retry screen, reported to Sentry), and the Home hero, first-week checklist, check-in, rough day, event mode, craving timer and plate card are wrapped in `CardBoundary`. The calorie / stat cards are drawn inline by Home itself, so they are covered by the tab boundary only.
- Maestro (#9): `mobile/MyDailyOSMobile/.maestro/` has `log_food`, `run_workout` and `offline_sync` flows, a login helper and a README. `testID`s added to the food search box and add button. Written without a device: expect to adjust a few words on the first run.
- Rollouts (#10): the one-plan Smart program (web and phone) is behind the `smart-program` flag; it stays ON for everyone until you create the flag, then only the people it names get it (`docs/FEATURE_FLAGS.md`). BUG FIXED on the phone: `flagStore.ts` looked for the signed-in person in AsyncStorage but the app keeps it in SecureStore, so no flag was ever loaded; it now uses `getStoredUser()` (regression test `flagStore.test.ts`).
- Quieter Home (#21): optional Home cards appear after you have used the app a few days (check-in day 2, side quest day 3, event mode day 7; server rule `HOME_CARDS` in `lib/features.js`, returned as `homeCards` in `/api/coach/state`; "show all" reveals everything). Open counts per card (`card.<id>`) are collected from the web stat cards via `POST /api/telemetry/card` so you can retire cards nobody opens. Phone does not send open counts yet.
- Notifications (#22): already on the phone (daily cap `maxPerDay`, quiet hours, water nudges that wait after a water log, skip when done); nothing to add.
- Accessibility (#23): `mobile/.../tools/auditA11y.mjs` (in CI) finds buttons a screen reader cannot name. Real count: 400 pressables, 378 have words inside, 174 have a label; 11 icon-only or ambiguous buttons were labelled (habit tick, goal +1/-1, reminder chips, character picker, tab icons). No `allowFontScaling={false}` anywhere. Only light and dark palettes exist and both are contrast-tested.
- Translations (#24): 15 more strings (the check-in card) in all four languages, now 111 keys, still marked "needs native review".
- CSS (#25): `!important` cut from 29 to 16, all in reduced-motion / calm-mode / print / gentle-mode rules (`tools/checkImportant.mjs` and `web/client/.stylelintrc.json`, both in CI). The layered override files (`redesign.css`, `polish.css`, `stability.css`) were NOT merged into tokens plus per-component CSS: that is a visual refactor to do with the app running.
- Shared code (#26): `packages/shared/` is the one source for `exerciseFigure`, `training`, `coneGeometry` and the four language files; `node tools/syncShared.mjs` copies them into web and phone and `--check` (CI) fails on any hand edit. React 18 (web) vs 19 (phone) is left as is on purpose; shared code must not import React (the tool refuses it). See `packages/shared/README.md`.
- File split (#28): `notifications.ts` 1165 -> 1034 lines (reminder types, defaults and date helpers now in `notificationPrefs.ts`, re-exported); `food.tsx` 680 -> 539 (`components/food/`: `FoodEditorModal`, `MyFoodsTab`, `TodayFoodList`, `foodHelpers`); `ProfilePage.jsx` 755 -> 469 (`components/profile/`: Personal, Body, Daily goals and Weight goal cards); `FoodLogger.jsx` 1049 -> 546 (`components/foodlogger/`: `LoggerCard`, `TodayLogCard`). These are straight moves: every piece gets what it needs as props, found by the type checker (no undefined names in any of the files). The phone pieces take `props: any`, so their props are not individually typed yet.
- Validation (#15): every one of the 101 write routes that read a body now validates it (schema, `v.*` check or `clean*()` helper); the last seven got schemas (`s.any`, `passthrough` added to `lib/schema.js`) and `tools/checkWriteValidation.mjs` (in CI) fails if a new write route does not.
- Type errors (#7): found with a type-checker stand-in that treats missing libraries as `any`. Fixed: `plateCalc` options typing (JSDoc in the shared `training.js`), two `flagStore.ts` return types, and a missing `useT` import in the phone check-in card that I had introduced. Four of the seven original `tsc` errors in `Training.tsx` involve React Native's own types and could not be reproduced without the real packages.
- NOT run here (no npm/network): `npm install`, `tsc`, jest, `vite build`, the app on a device. Logic was run against the real server fixture with a transpile harness. NOT done: the two stub-based server tests, the 7 tsc errors, and roadmap items 2-4, 8-12, 15-19, 21-23, 25, 26, 28.

# v60 - numbers that agree, keep-or-fresh start, last weigh-in (server + web)
- Stickers removed on request (6): kakashi think-0, read-1, chill-0 and bakugo noodles-0, laugh-0, game-0. Taken out of the generated manifest (`motion/stickerManifest.js`), the server catalogue (`server/data/stickerCatalog.json`) and added to `stickerBlocklist.json`, so regenerating the lists cannot bring them back. (The web `public/stickers` folder never had these 6 image files; the lists still pointed at them.)
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
