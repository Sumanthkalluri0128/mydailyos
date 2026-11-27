# Phase 6, step 1: finishing section 4 of the status report (work-in-progress snapshot)

Verified here: server 885/885 (real MongoDB), web 289/289 + production build, phone 65 suites / 580 tests, 0 TypeScript errors, shared-files check clean.
Not verified: a real phone, your live server. Section 5 of the report (sync failure handling, start-from-planner, planner offline, reminders, quick-add screen, translations, two-workouts check, manual checklist / deploy guide) is NOT in this snapshot.

## 1. Deleting a finished workout now removes its server entry
Before: both apps deleted the session only on the device; the server's exercise entry stayed and kept inflating the day's burn.
* Server: `DELETE /api/body-plan/session?clientId=` also rebuilds the Smart plan and tells the coach its history changed (as creating a session does). `DELETE /api/activities/logs?clientId=` already existed. Tests: `server/test/sessionDelete.integration.test.js` (6; 2 fail on the old route).
* Shared: `packages/shared/src/sessionDelete.js` (generated into both apps): the retry list, what an answer means (done / try again / give up), Undo window support, and cancelling a queued create.
* Web: the delete is kept on a saved list (`pendingDeletes` in the Workout state) and sent now, when the connection returns, when the tab returns and every 30 s while any wait. A create still waiting in the offline queue is cancelled (`dropQueued` in `offline/offlineApi.js`). A delete never overtakes that workout's own send, and a workout deleted before its turn in a sync run is never sent.
* Phone: the delete waits out the 5 s Undo window (Undo cancels it; an app kill inside the window loses nothing, it goes the next time the tab opens). It then goes through the phone's own offline queue, which replays in order, so a create still queued is replayed first and then deleted. Home's burn total drops at once even offline (`optimistic.ts` understands delete-by-id).
* Ids: Smart sessions are `wp-<id>` on both apps; classic ones are `wp-<id>` on the web but `ws-<id>` on the phone.
* Verified: web page driven in a simulated browser (21 checks; 14 fail on the original page), phone logic (11 tests, three deliberate breakages each caught), cache tests.

## 2. Editing a logged workout
* Web (already there) and phone (new, Exercise screen: Edit button + form: minutes, calories, day, note). Gym-log entries are still edited in the Gym log.
* New shared `logEdit.js`: validates and sends ONLY what changed. Before, the web form always sent the minutes, so a note-only edit silently reset calories typed by hand to the estimate.
* Server: an edit now marks calories typed by the person as `manual` and calories that follow new minutes as `estimated` (the "entered by you" label was wrong after an edit).
* Phone: an edit made offline is visible at once (cache layer applies queued edits, including to an entry still waiting to be created).
* Verified: web form in a simulated browser (10 checks), phone screen with a test renderer (20 checks), unit tests.

## 3. Repairs found on the way
* `repo-root-tools/syncShared.mjs` was an older copy and skipped `recordSync` and `workoutPlanView`; both copies are identical now.

## Known, left alone (your decision)
* Web sync runs can overlap (the effect resets its own "running" flag when the session count changes). The server de-duplicates by id so it is harmless; the new delete code is written to be safe with it.
* The phone Workout store is one key for the whole device, not per account (the same class of issue as the Gym log in phase 4a). A leftover delete from another account does nothing on the server.
* `DELETE /api/body-plan/session/:id` (by database id) still does not tell the coach engine.

## Deploy
Server first (the new behaviour is additive; old apps keep working), then the apps. No new collections or indexes.

---

# Phase 6, step 2: sync failure handling (report section 5, audit WORK-06 / XPLAT-02)

Verified here: server 885/885 (unchanged), web 303/303 + build, phone 66 suites / 593 tests, 0 TypeScript errors, shared-files check clean.

## What was wrong
* Web, Smart workouts: a workout the server refused (any 4xx except 401/429) was recorded as "sent". It was lost without a word.
* Web, classic workouts: a refusal was retried only when the page was reopened or a workout was added (no "back online" or timer trigger), only for 14 days, and then dropped silently.
* Phone: only the LAST FIVE unsent workouts were tried, and the run stopped at the first failure, so one stuck workout blocked every later one and older ones never went. A refusal was retried on every tab open for ever.
* Neither app ever told the person.

## What it does now (one shared, tested rule set: `packages/shared/src/syncRun.js`)
* Three outcomes: sent; no connection / server asleep or busy / signed out (stop and try again later, nothing is flagged); refused for good (remembered with a plain reason).
* A refused workout is flagged in History with the reason and a **Try again** button, and the person gets one message. It is not retried by itself. The others still go.
* Every unsent workout up to **60 days** back is tried, oldest first (web was 14 days, phone "the last five"). Older ones stay on the device.
* Web: a run starts again by itself when the connection returns, when the tab becomes visible, and every minute while anything is waiting; a workout finished during a run is picked up straight after (before, overlapping runs could happen). Deleting a flagged workout forgets its flag.
* Phone: the run is repeated whenever the offline queue has sent something, as well as when the tab opens. The finish screen records a refusal at once (`syncAndRecord`).
* An exercise type missing from a LOADED list is a refusal with a plain reason; an empty list (nothing cached, no signal) is just "later".

## Verified
* Web page in a simulated browser: 40 checks (21 delete + 19 sync). On the previous page the new ones fail (a refused workout is stored as `{"ws-bad": true}`, i.e. marked sent).
* Phone: 13 new tests; three deliberate breakages (never flag, retry flagged, stop at first refusal) are each caught. 
* Not render-tested: the phone History warning row and Try again button (markup only; the logic behind it is tested).

## Behaviour changes to know
* A workout the server refuses now shows a warning in History instead of silently disappearing from your totals.
* Unsent workouts from 15 to 60 days ago (web) and older than the last five (phone) will be sent the first time the new version runs.

---

# Phase 6, step 3: start a planned workout from the planner (report section 5)

Verified here: server 885/885 (unchanged), web 316/316 + build, phone 67 suites / 598 tests, 0 TypeScript errors, shared-files check clean, no new lint warnings.

## What it does
* The planner shows **Start** on a workout that is waiting (not done, skipped, matched by your log or a rest day), is dated today or earlier (a missed workout can still be done), and has exercises. Tomorrow's and later have no Start.
* Start opens the Gym log (web: Exercise page; phone: Gym log) with a **Planned workout** banner: the exercises as steps with the planned sets x reps and weight, a progress count, **Next: <exercise>**, **Skip this one** and a stop button.
* **Next** opens that exercise with the planned sets, reps and weight already filled in (a run is one block of minutes). Edit anything, Save, and the banner moves on. What is already logged today counts, so a half-finished workout resumes (also after a refresh / closing the app).
* When every step is logged or skipped, **All done: mark the workout done** marks it done in the planner (web: with your own day; phone: through the offline queue, so it also works without signal). If that cannot be sent, the person is told to finish it in the planner; the sets are safe either way.
* It is always logged on TODAY (the day you really did it), whatever day it was planned for. The banner is only shown while the Gym log is on today.

## Matching planned names to the Gym log's exercises (`packages/shared/src/planStart.js`)
A planned exercise is only a name, so it is matched to the Gym log catalogue: exact name (ignoring case, punctuation, plurals, spacing, brackets and the usual abbreviations DB / BB / KB), or a catalogue name that adds only harmless words ("Barbell Bench Press" = "Flat Barbell Bench Press"). It does NOT guess a variant that adds a real qualifier (seated, rope, outdoor, 45 degrees) or choose between equals; those stay as the person's own exercise, still pre-filled and labelled "your own".
Measured on all 73 exercise names in the app's workout library: 26 match, all correct; the other 47 become "your own" (mostly stretches / mobility / warm-ups that are not gym lifts, plus real variants). Two wrong guesses found while measuring ("Cycling (Stationary)" -> Outdoor Cycling, "Calf Raise" -> Seated) and a bug ("Push-ups" not matching "Push-Up") were fixed and are covered by tests.

## Verified
* Shared logic: 10 + 3 tests on the real catalogue (web), phone store 5 tests.
* Web: planner + Gym log driven in a simulated browser, 24 checks (browser clock fixed to Wed 25 Nov 2026). Earlier web harnesses (Workout page 40 checks, edit form 10) still pass.
* Phone: Gym log screen rendered with a test renderer, 17 checks (banner, pre-fill, save, resume, skip, completion, offline, failed completion, account isolation). 
* Not render-tested: the phone planner's Start button (a one-line addition, type-checked; its logic is the tested `canStart` + `beginPlannedStart`).
* Not covered: planned items without exercises (a plain "30 min run") have no Start; a real phone / device was not used.

---

# Phase 6, step 4: two workouts on one day / done-status on the Workout tab (report section 5)

Verified here: server 885/885 (unchanged), web 321/321 + build, phone 67 suites / 604 tests, 0 TypeScript errors, shared-files check clean, all simulated-browser and phone-screen harnesses pass.

## What the audit suspected, and what is actually true
The suspicion was that "done" is matched by plan day instead of by date. Tested, it turns out to be: web classic/custom plans by PLAN DAY across the week; web Smart plan by DATE; phone by DATE for the week strip, but by DATE ONLY (any workout today) for the Today card. Real defects found:
1. **Phone, Today card:** any workout today made today's own workout look "Done today" (with the other workout's minutes). After a catch-up of Day 1 on a Wednesday, Wednesday's Day 3 card said done. Now it counts only workouts of THIS plan day done on this date. (The rest-day card keeps the old rule on purpose: the mobility entry is always logged as day 7, so on the Smart plan a rest day that is not Sunday must not look for its own number.)
2. **Both apps, two workouts of the same day:** the Done line showed one workout's minutes (web: the first, phone: the last). It now shows the day's total, e.g. "Done · 60 min · 2 workouts".
Both are fixed and tested (phone engine tests, web store tests, web Today card in a simulated browser: the old chip shows "Done · 25 min" for 25 + 35 minutes).

## Behaviour that is unchanged and now pinned down by tests (your decision if you want it different)
* Web classic / custom week strip: a plan day counts as done wherever in the week it was trained. Day 1 made up on Wednesday fills Monday's slot and Wednesday's own slot (Day 3) still waits; a workout done early shows done before its date. Two workouts on one day are fine (the same plan day twice = one slot; two different days fill two slots). Only this week counts.
* Web Smart strip: by date; any Smart workout that day marks it done, one or two; a classic session does not count.
* Phone week strip: by date. The same history therefore reads differently on the two apps (the phone would show Monday "missed" and Wednesday "done"). The two apps also do not share Workout-tab sessions (a decision already on your list), so each shows its own device's history. Say if you want the web classic strip changed to by-date.
* Streaks count days, so two workouts on one day are one day; week totals count both workouts.

---

# Phase 6, step 5 (PARTIAL): quick-add correction, server part only

Verified here: server 887/887 (was 885). Web 321/321 + build and phone 67 suites / 604 tests were last run at step 4 and nothing in them changed since.

## Done (server)
* `GET /api/food-logs?date=` marks quick-add estimates with `quick: true` (only those), so the apps can offer "Correct the estimate". `PATCH /api/food-logs/:id` already accepted a new name and numbers for quick-add entries (not for real foods); its answer now also carries `quick: true`.
* Correcting an estimate's calories replaces the auto note ("Estimate 600-900 kcal +10% buffer") with "Corrected estimate (was 825 kcal)", because the range and buffer described the old number. A note the person wrote is never touched, and a name-only fix keeps the note.
* Tests: 2 new in `server/test/foodEdit.integration.test.js`. With the new behaviour removed, exactly those 2 fail.

## NOT done (the screens)
* A shared helper that validates the form and sends only what changed (same idea as `logEdit`).
* Web: on a quick-add row, "Edit" must open a correction form (name, calories, protein, carbs, fat) instead of the portion editor, which is meaningless for an estimate. With Undo.
* Phone: the same in `food.tsx`, plus teaching `utils/optimistic.ts` a food edit with numbers (today it only understands a meal change), so a correction made offline is visible at once. A quick-add created offline also needs `quick: true` on its local copy.
* Deploy the server first: old apps ignore the new field.
