# v75 - Weighing scales (phone). Matches web v75 (deploy the server first). New `components/WeightScales.tsx` and a scale picker on the Weight screen; each weigh-in carries a `scaleId` and every number comes back calibrated by the server (`weightKg`), with `rawKg` = what the scale showed. The chart uses one calibrated point per day; history lists every entry with its scale. The daily check-in uses the scale you used last. The offline queue (`utils/optimistic.ts`) keeps one entry per day PER scale and shows queued entries calibrated. Scale changes need the network.
- NOT run: `npm run typecheck`, `npm test`, the app on a device (no node_modules here); files were syntax-checked with esbuild only.

# v72 - Matches web v72 (deploy the server first). `utils/energy.ts` regenerated from the shared source: `resolveTargets` returns `macroBasisNote`, new `macroMismatch` / `kcalFromMacros`. The Macros card shows which calories it is sized to; My Plan says its macros are the base numbers Home resizes; the food screen flags entries whose calories and macros disagree (`components/FoodMismatchNote.tsx`). Autopilot (safe auto-adjust) is on until you switch it off: the Coach switch now reflects the server's answer.
- NOT run: `npm run typecheck`, `npm test`, the app on a device (no node_modules here).

# v63.2 - Macros card sized to today's budget; bars red only past the range maximum (phone)
- Matches web v63.2 (deploy the server first). `utils/energy.ts` `resolveTargets(profile, { budget })` is identical to the web copy; `MacroCard` takes `budget` and the food screen passes the day's budget, so protein/carbs/fat/fibre/sugar are judged by the same number as the Home ring and the quests.
- Protein, Carbs and Fat bars are red only above the range maximum.
- NOT run: `npm run typecheck`, `npm test`, the app on a device.

# v63.1 - typed set logging client (phone)
- `src/utils/parseSets.ts`: typed client for the server's new `POST /api/training/parse-sets` (typed gym notes -> sets matched to known exercises) plus `readyToLog` / `entryLine`. No screen uses it yet. Quest fix needs no phone change: quests come from the server (deploy the server first).
- NOT run: `npm run typecheck`, `npm test` (no node_modules here), the app on a device.

# v62 - see the web project's docs/CHANGELOG.md (one changelog for web, server and phone). Phone: the Workout tab now has the Gym / Home / Quick 20 chips, "Not today", the "This week" card, pain chips and the plan's own warm-up and cool-down (the v61 "not ported yet" list below is now done).

# v61 - phone catches up with the web (phone)
- Stickers removed on request (6): kakashi think-0, read-1, chill-0 and bakugo noodles-0, laugh-0, game-0. Deleted from `assets/stickers`, removed from `motion/stickerImages.ts` and added to `stickerBlocklist.json`. Every remaining `require()` in the sticker map points at a file that exists.
- ONE workout plan on the phone (web v57): `utils/smartPlan.ts` turns the server's Smart program into the phone's plan days; `data/workoutPlan.ts` now has an active plan (`activeDays()`, `setActiveDays()`), so Today, Plan, day overview, live workout and History all run on it. Smart is used when the server has a plan for THIS week; the Workout tab has a "Smart · built for you / Classic 7-day" switch (saved). Server exercises are added to the library without replacing built-in ones. A workout remembers the day as it was when it started (`snap`), and a finished Smart workout goes to `POST /api/body-plan/session` (queued offline, safe to repeat) and is NOT also logged as a separate exercise. Easy-cardio and rest slots have nothing to start.
- Not ported yet: Gym / Home match / Quick 20 chips, "Not today" and the "This week" card on the Workout tab (the Body tab still has them), pain chips on the finish screen, and the plan's own warm-up/cool-down lists (the live workout still uses the phone's generic ones).
- Daily check-in on Home: asks only for what is missing today (weigh-in; protein and water from 14:00), saves with the offline-safe writes, "Not today" hides it for that date. Protein is logged as an estimate of 4 kcal per gram (the quick-add route needs calories) and the card says so.
- Goal card: last weigh-in / start / 7-day average line (tap to reveal). Plan screen asks "Keep your old start, or start fresh?" before re-saving. Arrival chart has dates and stops at the arrival. Protein speech line fixed.
- `tsconfig.json` now excludes `src/data/__tests__` like the other test folders: typecheck errors 29 -> 7 (5 in Training.tsx and 2 in flagStore.ts were already there).
- Tests: jest 433 pass; 1 suite fails as in v60 (widgetTree: react-native-android-widget is not transformed). NOT run: on a device or emulator (none here). Release only after the server is deployed: see DEPLOY_ORDER.md.

# v60 - Goal card shows how progress is counted (phone)
- Matches web v59 (deploy the server first). The goal card shows `goal.basisLine`. Protein "done" and the new goal progress come from the server payload, so nothing else changes on the phone.
- NOT run: `npm run typecheck`, `npm test`, the app on a device.

# v59 - Real exercise photos on the phone, same as the web app (phone)
- The 73 photos cut from the plan sheets (`assets/exercises/*.webp`, 1.1 MB) are now used on the phone: thumbnails in every exercise list and the live workout, the step-by-step photo strip (tap to enlarge) and the sheet's tips on the exercise screen. An exercise with no photo keeps the drawn figure.
- `src/data/exerciseImages.ts` is GENERATED from the web app's `data/exerciseImages.js` (`node tools/syncExerciseImages.mjs`), so the two cannot drift. A few phone-only spellings of the SAME movement are added in the script (Floor Glute Bridge, Lying Leg Curl, Treadmill Walk...). 26 of the 108 phone exercises get a photo; the rest have no matching picture on the sheets.
- New `components/ExercisePhoto.tsx`; `ExerciseThumb` shows the photo first.
- Tests: `src/data/__tests__/exerciseImages.test.ts` (5) and a Jest image stub (`jest.config.js`). NOT run: `npm test`, `npm run typecheck`, the app on a device (no Expo toolchain here). The photo-name matching was checked with a plain Node script: 26 matches.
- NOT done yet: the web's v57 "one workout plan" (smart program on Today / Plan / live workout) is not on the phone. The phone still has a classic Workout tab and a separate Body tab with the smart program.

# v58 - Workout tab: your 7-day beginner plan (phone)
- New tab "Workout" (Today / Plan / Library / History). Day 1-7: Upper A, Lower A, Active, Upper B, Lower B, Conditioning, Rest. Data in `src/data/workoutPlan.ts` (every exercise has 3 steps, a tip, muscles, and 3-4 alternatives from the plan sheets; plus warm-up, cool-down and mobility rows).
- Live workout (`app/workout-session.tsx`): warm-up checklist, one exercise at a time, weight/reps steppers (kg or lb), tick sets, auto rest timer, swap to an alternative, "beat last time" hint, pause, cool-down, summary with personal bests, feel + notes. Saved after every tap, so Resume works after closing the app.
- Day screen with swap per exercise; exercise screen with illustrated figure, How to / Muscles / Alternatives; Library with search, filters, saved hearts; History week / month / all time with totals, minutes chart, personal bests, delete with Undo.
- Everything is stored on the phone (`utils/workoutStore.ts`). Finished workouts are also sent to `/api/activities/logs` (Strength activity, offline-queue, clientId = session id) when "Add to daily exercise log" is on. NOT tested against the server (server code is not in this zip).
- Tab bar: Workout added; Body icon changed to a body so the two do not share a barbell. Swipe order updated.
- Assumed (not on the sheets): Day 5 Lower B and Day 6 Conditioning contents. Edit them in `workoutPlan.ts`.
- Tests: `utils/__tests__/workoutEngine.test.ts` (26). `tsc` shows the same 7 errors as before this change; none in the new files. NOT run: the app on a device.

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

# v57 - Body plan: full training program + body analysis (phone)
- Matches the server's v54 (it must be deployed first: the plan is built on the server). New `components/TrainingSections.tsx` and `app/body-plan.tsx`: training setup (where, experience, days, minutes, home equipment, anything that hurts, focus), body analysis, weekly program with a tap-a-day week strip, per-exercise weight tips and alternatives (machine busy, dumbbells only, no equipment), a home version and a 20-minute quick circuit for every day, active-day menu with calories, cardio zones, progression and safety.
- "Use this plan" now saves the setup together with the body goal. Without a connection the screen shows the usual "needs a connection" message.
- Checked here: syntax of both files, and the components rendered with mocked React Native primitives against real plans from the server engine (3 body types, 7 sections each). NOT run: `npm run typecheck`, `npm test`, the app on a device (no Expo toolchain here).

## Widget: daily anime artwork (themed)
- New `FlexFitWidget`: live date, streak, calories, protein, steps, water drops and 4 mission ticks drawn over 7 daily artworks (`assets/widget/`).
- Zones for each artwork in `src/widgets/widgetZones.ts`; backgrounds in `widgetBackgrounds.ts`. Monday (zoro) uses the Jin-Woo art for now.
- Widget now resizable (4x2 default). Home screen also pushes protein, steps and streak to the widget.
- Water drops are tappable (+250 ml); everything else opens the app.

# v56 - smarter "ate heavy for a few days" advice (weekly ledger engine)
- New `utils/overEngine.ts` (pure, tested) decides tier and how much to trim. Rules: each day is judged against its own budget (target + earned activity); days with almost nothing logged are UNKNOWN, not zero (no fake deficit); lighter days earn capped credit (30 % of target) toward the week; a weekly surplus under 5 % of the weekly target gets NO cut; otherwise only a share (50 % one day, 60 % a streak, 40 % a heavy week) is recovered, spread over 3 / 4 / 5 days at most, max 12 % of target or 250 kcal a day, never below the 1200 / 1500 floor; heavy day right after a very light day = restrict-overeat cycle, so no cut and "eat regular meals"; gain goals never get a cut; target already at the floor = no cut, easier pace suggested instead.
- It also reports the honest leftover (what a capped trim cannot recover) and roughly how many days it delays the goal, plus fat-equivalent grams vs water weight.
- `hooks/useOverAdvice.ts` feeds it the last 7 days of `/api/progress/history` and the profile (works offline from the saved copy). `OverDayCard` and `FixMyDay` use it, so Home and Fix my day always agree; the server still supplies root causes and easier-pace numbers, and its advice is the fallback if history cannot load.
- Fix my day: the walk line is now weight-based (was a fixed "60 to 80 kcal"); the cycle case says not to skip meals; the "Plan a gentle day" button is hidden when the engine says no cut is needed.
- New test: `utils/__tests__/overEngine.test.ts` (17 cases). Run here with a small jest shim: 17 pass. NOT run here (no npm registry): full `npm run typecheck`, `npm test`, and the app on a device. The rescue-day button now sends `goal` (tomorrow's trimmed kcal): the SERVER must honour it for the planner to match the card (server code is not in this zip).

# v55 - Companion 2.0: the floating character now thinks, analyses and interacts
- **Tap** the floating character: it opens an interactive panel (`motion/CompanionPanel.tsx`). First it "thinks out loud" using your real numbers, then shows: a 0-100 **day score**, **pace bars** per quest with a tick for where you *should* be at this hour (ahead / on pace / behind / late / over), a **forecast** ("at this pace water ends the day around 62%"), one **best next move** with a working button (logs +250 ml itself, or jumps to Food / Exercise / Weight / Habits / Fix my day), a **mood check-in** (Pumped / Okay / Tired / Stressed) that changes its advice, a **60-second challenge** with a live countdown that earns bond, and an **ask box**.
- Typed questions are answered **on the phone first** (water / calories / protein / steps / exercise / streak / level / weight goal / what's next / how am I doing / jokes / tired / stressed), so they work offline and instantly; anything else goes to the existing `/api/assistant/ask`. "Open the full chat" is one tap away.
- A small **pulsing badge** on the character shows your biggest gap (💧 🍽️ 👟 💪, 🔥 streak at risk, ✨ all done).
- It **speaks up only when something is worth saying** (checked every 30 s, quiet 22:00-07:00, never the same nudge twice in a row) and **backs off if you ignore it** (45 min, then 90, 135, 180); tapping it resets that. Nudges have a "See why" button.
- Bond now has titles (New face > Acquaintance > Buddy > Training partner > Rival-friend > Nakama > Legendary duo) and a progress bar; logging water or finishing a challenge earns bond.
- Unchanged: drag and throw, double-tap celebrate, hold for quick menu, snacks, character swap, per-character voices, Reduce Motion support.
- New files: `motion/brain.ts` (pure logic), `motion/companionStore.ts` (bond, mood, challenges, nudge back-off; stored on the phone only), `motion/CompanionPanel.tsx`, test `utils/__tests__/companionBrain.test.ts` (16 cases). `Companions.tsx` edited (bond moved to the store, panel + badge + adaptive nudges). No new dependencies, no server change.
- Checked here: `brain.ts` compiles cleanly and all 16 tests pass (run with a small jest shim). NOT run here (no npm registry): full `npm run typecheck`, `npm test`, and the app on a device. Please run those and tell me anything that looks off.

# v54 - habits on Home and Tasks
- New `components/HabitsToday.tsx`: today's habits as a tick list with a done count and a Manage button. It now shows on Home right under Your Progress and on the Tasks tab (for the day being viewed), so habits no longer exist only on their own screen. Ticking saves straight away, works offline and syncs like the Habits screen.

# v52 - smaller floating character
- The floating anime companion is smaller (80 px to 56 px) so it covers less of the screen. Drag, throw, tap and hold-for-menu still work; speech bubble and hearts scale with it. One constant changed in `motion/Companions.tsx` (`SIZE`).

# v51 - new Home hero scenes
- Home hero now uses 11 new wide scenes (Inosuke, Zenitsu, Tanjiro x2, Killua, Asta, Gojo, Luffy, Goku x2, Naruto) instead of the old 10; cropped to the card edge, 1200 px webp. Old Jin-Woo, Kakashi and Zoro scenes removed. One scene per day, no other code change.

# v47 - everything from the 11-point list
- Home "Eaten" kcal opens today's meals in a sheet with the portion editor (`components/home/EatenSheet.tsx`); closes after a save so the Undo toast shows.
- Undo toast (5 s) after editing a portion: food log, planner and the Eaten sheet.
- Planner: "✓ Log what I planned" per meal (today only); each item keeps its Edit button.
- Portion editor remembers your usual amount per food (after 2 uses, on this device) as a "Usual" chip; household units (roti, katori, glass...) get count chips 0.5 / 1 / 1.5 / 2 / 3.
- Weekly review: compact went-well / what-to-change / one-thing-for-next-week card with one character (`utils/weekSummary.ts`).
- One shared `StatCard` for water, steps, exercise, weight; the sticker maths lives only there.
- New tests: homeCards, homeLayout, portionPresets, weekSummary (jest). NOT run here: run `npm run typecheck` and `npm test`.

# v46 - Home grouping, planner freshness, goal reason
- Home: Rough day, Event and Craving are now one row of chips (each opens full width when used). Side quest and the weekly summary sit after the stat cards.
- Planner: "Last updated" time and a tap-to-refresh line (pull-down already worked).
- Goal card: one line says why it reads "behind" (from the server `statusWhy`).
- Empty steps / exercise cards say "Nothing yet. A short walk counts".
- Test: `src/utils/__tests__/homeLayout.test.ts`. NOT built or run here (no npm registry): run `npm run typecheck` and `npm test`.

# v44 (mobile) - Phase 3 Section M: platform part 2
- Opt-in weekly data backup email (Profile).
- Feature flags cached on the phone (6 hours); health numbers (slow wake-ups, failed syncs, dropped changes) are reported anonymously so the admin page can show them.
- Widget header shows the day's character. Past fasts list shows 5 at a time.
- Built on your updated code (widget, album fixes). Docs: `docs/PHASE3_PLATFORM2.md`.

## Widget + sticker album fixes
* **Home-screen widget now shows real data** (calories left, water, bars, +250 ml button) instead of static labels; rows no longer collapse together.
* **Sticker album crash fixed** (`TypeError: number 1 is not iterable` on Goals/Your Progress): the server's `/api/album` response let a count overwrite the `owned` list.
  `owned` is always the list of sticker ids now; the count is `ownedCount`. Web and mobile clients also accept the old shape.
* Food screen: `diabetesView` was read before it was declared (render-time ReferenceError risk).
* Meal reminders: `loggedMealsToday()` called an undefined `today()`, so reminders ignored what you had already logged.
* Micro-nutrient card used a non-existent mascot scene (`think`); photo-compare date maths typed correctly.

# v43 (mobile) - Phase 3 Section L: platform part 1
- Needs a NEW native build: biometric app lock (`expo-local-authentication`) and extra Health Connect permissions (sleep, heart rate, exercise).
- Instant-open strip, optional app lock with guard-pose screen, hot-day water goal, Health Connect sleep / heart rate / workouts with per-type switches, widget data snapshot. Details: `docs/PHASE3_PLATFORM1.md`.

# v42 (mobile) - Phase 3 Section K: strength and training
- Exercise screen has a Training tab: today's suggestion with reasons, workout mode (prefilled sets, rest timer, power-up scene), progress and power level, plate calculator, training arcs, guided meditate and stretch with a breathing circle and gentle haptics.
- Template builder takes sets, reps, kg and rest per exercise; templates can be started in workout mode or logged as planned.
- Server changes are shared with the web app v46. Details: `docs/PHASE3_TRAINING.md`.

# v41 (mobile) - Phase 3 Section J: UI part 2
- Accessibility: colour-blind and contrast fixes (new `primarySolid` / `dangerSolid` tokens), labels; text follows the phone's font size.
- Measurement trends on Weight; photos screen now has a before/after date scrubber and Undo delete; photos removed with the account.
- Medicines and supplements screen with local quiet-hours reminders (`medNudge.ts`).
- Season recap card (SVG to PNG share), health numbers opt-in.
- Share a weekly summary with one person (Profile > Your data).
- Tests: `a11yPalette`, `medNudge`, `wrappedCard`.

# v40 (mobile) - Phase 3 Section I: UI part 1
- Simple/advanced mode with Profile switch; Profile and Home links follow it.
- Adaptive Home step in the hero (server rules).
- Undo toast (with sensei) for recipes, saved meals, foods, workouts and templates; only bulk/irreversible actions still ask.
- Hindi, Telugu, Tamil UI strings (first drafts, flagged for review), English fallback; translated tabs and meal reminders.
- Fix: Rough day card imported a reminders function that does not exist; now calls `refreshReminders(true)`.
- Test: `utils/__tests__/i18n.test.ts`.

# v39 (mobile) - Phase 3 / Section H: coaching and insights, part 2
- Same tone, gentle mode, craving timer, festival mode and diet break as web v43, plus habit-anchor reminders and tone-aware meal / tiffin reminders (quiet hours and daily cap respected). Needs server v43.
- Tests: src/utils/__tests__/anchorNudge.test.ts (5).
- NOT built or run here (no npm registry): run `npx tsc --noEmit` and `npx jest`.
---
# v38 (mobile) - Phase 3 / Section G: coaching and insights, part 1
- Same cards as web v42 (Home: rough day + side quest; Weight: explainer, arrival range, sleep link; Weekly: treat allowance, "I'll try this"; Profile: coach reset). Rough-day mode also reduces that day's reminders. Needs server v42.
- NOT built or run here (no npm registry): run `npx tsc --noEmit` and `npx jest`.
---
# v37 (mobile) - Phase 3 / Section F: faster food logging, part 2
- Same cook ideas, glycemic tags and diabetes view, tomorrow's lunch planner, aisle grocery list and CSV import (Profile > Your data) as web v41. Needs server v41.
- New optional evening "Plan tomorrow's lunch" reminder (Reminders screen; quiet hours and daily cap respected).
- Tests: src/utils/__tests__/tiffinNudge.test.ts (5). File picking needs `npx expo install expo-document-picker`; paste works without it.
- NOT built or run here (no npm registry): run `npx tsc --noEmit` and `npx jest`.
---
# v36 (mobile) - Phase 3 / Section E: faster food logging, part 1
- Same copy preview, "Select several", shared pot, pasted ingredients, portion guide (react-native-svg) and chai counter as the web (v40). Needs server v40.
- **Voice**: character mic in "Type a meal", on-device only. Needs a DEVELOPMENT BUILD and `npx expo install expo-speech-recognition` plus its config plugin (see docs/PHASE3_LOGGING1.md); without it the mic is hidden and nothing else changes. Package not added to package.json here (lockfile cannot be regenerated offline); Expo SDK 57 support of the package is unverified.
- Tests: src/utils/__tests__/logging1.test.ts (3).
- NOT built or run here (no npm registry): run `npx tsc --noEmit`, `npx jest` and a dev build.
---
# v35 (mobile) - Phase 3 / Section D: food data accuracy and trust
- Same vitamin and mineral power-up card (Weekly screen), Verified / Typical / Added by you label and Report wrong values on the selected food, optional vitamin/mineral fields in the food editor (blank = unknown), and "Power-ups to look at" in the weekly coach. Needs server v39.
- NOT built or run here (no npm registry): run `npx tsc --noEmit`, `npx jest` and a dev build.
---
# v34 (mobile) - Phase 3 / Section C: a real onboarding and app tour
- Same welcome, first-win steps, spotlight, first-week checklist, hints with "?" and what's-new dots as the web (v38). The old card-above-the-tab-bar tour (components/Tour.tsx, utils/tour.ts) is removed.
- Spotlight: dim overlay with a cut-out around the real element, measured with measureInWindow every 400 ms (follows scroll, rotation, keyboard), Animated pulse ring, pointer, tooltip that flips to fit. Home scrolls an anchor below the fold into view. Missing anchor: step skipped. Android back button leaves the tour.
- Anchors (`testID="tour-..."`): add-water, coach, goal-card (Home), food-search (Food), weight-add (Weight), planner-plan (Planner).
- Real actions come from the API layer and the offline queue (`tour/events.ts`). Progress is stored in AsyncStorage and on the server (`/api/tour`, needs server v38).
- Accessibility: announcements for each step, accessibilityViewIsModal, 44 pt targets.
- Profile > Help: Replay the app tour, Resume where I stopped, Show first-week checklist.
- Shared files: `src/tour/tourContent.js` and `tourEngine.js` are byte-identical to the web files (types in the .d.ts files).
- Tests: src/utils/__tests__/tour.test.ts (15). jest transform now also covers .js.
- NOT built or run here (no npm registry): run `npx tsc --noEmit`, `npx jest` and a dev build.
---

# v33 (mobile) - Phase 3 / Section B: one goal, one daily focus, one level, one badge shelf
- Same payload as web (needs server v37). components/simple/SimpleProgress.tsx, utils/simple.ts, utils/simpleBadges.ts. Home: Your Progress (level + 3 quests) and one goal card. Goals screen: the simplified block first, then Plan/rewards link and a folded Stickers section. Achievements: next badge, last earned, See all by shelf; stickers still unlock from the same badges. Removed FatLossCard and JourneyCard.
- Before/after and badge mapping: docs/PHASE3_GOALS_SIMPLE.md.
- Tests: src/utils/__tests__/simple.test.ts. Not run under jest here (no npm registry); please run `npx jest` and `npx tsc --noEmit`.
---

# v32 (mobile) - Phase 3: the Planning sensei
- Same flow as the web: a chat with the day's character (or your coach, in your tone) that asks 3-4 questions with quick-reply chips, a typing animation, progress dots, Skip, "Use my usual" and Back, saves every answer at once, and ends with an editable **Your plan setup** card. Finishing setup unlocks the **Meal Sensei** sticker.
- Plan my week now shows your setup, the doctor / dietitian note when it applies, per-day notes (eaten out, vrat, Ramadan, feast room) and **Use it and make my grocery list**.
- Planner: **Lock** a meal, **Why this plate?**, how-was-it feedback chips, top-3 swaps with reasons, week **templates**, grocery list with "You already have" and household scaling, "Improve my plan" prompt.
- Needs server v36 (new /api/food-prefs, templates and lock routes).
- Tests: src/utils/__tests__/sensei.test.ts.
---

# v31 (mobile) - Phase 2: the meal planner shows what you logged and plans around it
- **One merged day** (GET /api/meal-plans/view, cached): each meal lists Logged and Planned foods together with kcal and protein, plus Suggested add-ons. Day bar = eaten / planned / left, same budget as Home.
- **Plan around logged food**: Plan this day / Plan my week / gentle day treat logged meals as fixed; the budget is what is left. Partly-logged meals get add-ons ("add low-fat paneer or tofu for protein"), only for real gaps.
- **Under each meal with food**: up to 3 add-ons, `+ Plan` or `Log`, `Show more`.
- **No double counting**: a planned item that is logged (or logged by hand) is counted once; Log day skips what is already logged; past days are read-only history.
- **Offline**: the week is prefetched; queued logs / add-to-plan show in the planner and in Home with the same numbers (utils/mealView.ts, optimistic.ts).
- **Chef**: comments in the day character's voice ("Dinner is open: 420 kcal and 25 g protein to go"); empty meals show a hungry character; finishing a day plays the victory scene with confetti.
- Tests: src/utils/__tests__/mealView.test.ts
---

# v30 (mobile) - Phase 1: calm Home, cut-off stickers removed, weight blurred until tapped
- **Weekly review card** (OverDayCard) always starts hidden: one slim "Weekly review" line with the day's character; tap to expand with a smooth height animation, Hide to collapse. Nothing is remembered between launches.
- **Home**: the sliding scene banner, the HeroCarousel and its auto-advance timer are gone. The hero is a calm static card (date, greeting, ONE character, the coach's next step, one line of the day that changes once per day). Deleted: HeroCarousel, MotivationCarousel (was unused), home/scenes.ts.
- **Stickers**: tools/audit_stickers.py flags cut-off / tiny / mostly-empty stickers and writes src/motion/stickerBlocklist.json (flagged: goku/lift-0, jinwoo/peace-0, tanjiro/chill-1). The generated list is pruned and pickSticker / stickerFor / stickerById / stickersOf skip blocklisted ids.
- **Layout**: floating characters stop below the status bar; speech bubbles stay inside the screen; corner stickers on the Home stat cards get a reserved slot and are hidden (not cropped, not over the plus button) on narrow phones; the Progress card reserves room for its sticker.
- **WeightReveal**: one component for every body-weight value (Home, Weight, Goals, North Star, fat-loss card, weight chart labels, weekly, progress, history, profile). Blurred by default on every launch, tap to reveal (dissolve, number roll-up, accent glow, haptic, tiny character), re-blurs after 8 s, on leaving the screen or backgrounding the app. Real digits are never rendered while hidden; screen readers hear "Show weight" until revealed. No native module: OTA update is enough.
- "Hide numbers" is now "Hide calorie numbers" (weights are always blurred). Character lines no longer contain weight numbers. Weight-delete toast and water-goal text no longer show a weight.
- Fix: TextLog "Find foods" button type error.

---

## Body plan, festival arcs, safe intake (this update)
- Newest item on top inside each meal in the planner (eaten first, then planned) - server dayView + phone mealView.
- Festival / trip / diet-break room now widens the day's calorie budget everywhere (Home, Food, planner, widget, quests, level, fat-loss score, over-day advice). Server: lib/eventExtra.js + eventExtraPure.js; /api/progress/day, /history and food-log summary return eventExtra.
- New Body plan (Profile > Body plan, and a Home card until a body goal is chosen): lean / athletic / muscular / balanced + tape measurements -> target weight and waist, safe pace, calories, macros, training, vitamins to watch. Server: lib/bodyPlan.js, routes/bodyPlanRoutes.js (GET /api/body-plan, POST /api/body-plan/apply). Phone: app/body-plan.tsx.
- Protein target is now automatic by default (goals.proteinTarget null); the old default of 140 always overrode the automatic value. Type a number to override.
- Vitamins & minerals are collapsed under the macros (tap to open), with the nutrients that run short while eating less listed first.
- Safe intake: components/SafeIntakeCard.tsx + utils/intakeSafety.ts show effects and what to do when intake is too low or too heavy; Profile warns on unsafe typed calories and pace.
- Not run here: phone TypeScript check, jest, web build, DB-backed server tests (no npm access). Run them before release.

## v71 - Automatic activity follows your real week
- energy.ts updated (same shared model as the web): autoMultiplierOf uses the server 7-day activity average in Automatic mode. No other phone change; the server computes the reading.
- v71 sync audit: Profile type lists activityMode/autoActivity/measuredTdee/calorieFloor; day guide labels the 7-day average; fixtures cover the 7-day average.

## v74
- Gym logger: blank weight = body weight set ("@ BW"); volume, weekly volume and exercise progress use your body weight on that day, for old entries too. CSV gained `weight_type`.
- Medicine reminders: no more duplicate rings for a medicine with several times (scheduler now serialised, leftovers swept, same-minute doses merged). New "✓ Taken" button on the notification.
