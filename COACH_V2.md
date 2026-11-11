# Coach v2 (adaptive diet + gym coach)

What changed, and where. Server tests: `node --test test/coachAdaptive.unit.test.js test/gymAdaptive.unit.test.js test/coachHub.unit.test.js test/coachHubFlow.unit.test.js` (no database needed).

## Diet coach (server/lib/weeklyDecision.js, coachGain.js)
- Lean gain and maintain/recomp now have their own one-change-at-a-time ladder (before: "holding steady" for anything but fat loss).
- Strength guard: on plan but lifts falling -> +100 kcal (PROTECT_MUSCLE); slow but lifts falling -> no cut (HOLD_STRENGTH).
- Recovery guard: a low-recovery week holds calorie cuts (HOLD_RECOVERY).
- Faster loops: a clear stall with excellent adherence skips the extra waiting week; steps/walk changes wait 7 days, calorie changes 10.
- One-off weigh-in outliers are ignored (robustWeights.js).
- Goal forecast: date at today's pace vs the planned pace (goalForecast.js).

## Gym coach (server/lib/bodyPlanAdapt.js, readiness.js)
- Optional RPE per set: easy sets give a bigger (still capped at +10%) jump, grinding sets hold the weight (new action `hold`).
- Daily readiness check (sleep, energy, soreness, stress): lightens TODAY's session only; a week of poor recovery brings an easy week.

## Linking the two (coachSync.js, strengthTrend.js)
- Lifting-day vs rest-day macros with pre/post-workout bites; advisories that need both coaches; diet break lined up with the easy week.

## Safe auto-adjust, changelog, undo (coachHub.js, routes/coachRoutes.js)
- Profile `goals.coachAuto: 'safe'`: only steps rises or calorie changes up to 150 kcal (never below the floor, never a diet break) apply on their own.
- Every change is logged with "what happened afterwards" after 10 days; one-tap undo; an undo pauses auto-apply for 14 days.

## New API
GET /api/coach/hub, GET|POST /api/coach/readiness, POST /api/coach/weekly/undo. Sets in POST /api/body-plan/session accept `rpe`.
Readiness rows are part of the account export, restore and deletion.

## Apps
- Web: Coach page (menu > Stay on track), Home "next step" card, RPE chips in the workout screen.
- Phone: /coach screen, Home "next step" card, RPE chips in the workout screen.

## Round 2: closer to the target, faster
- Body composition (bodySignals.js): waist, neck and hips give an estimated fat vs muscle change. A slow scale with a shrinking body is "progress, no cut" (COMPOSITION_IMPROVING, at most 3 weeks in a row).
- Water-retention awareness (retention.js): heavy day, diet break, new training, poor sleep -> wait ONE week (WAIT_RETENTION), at most once every 21 days.
- Rest of today (replanDay.js): what the remaining meals should look like; never skips a meal, protects protein, extra is carried by the week.
- Weakest meal (mealGap.js): finds the low-protein meal and suggests diet-aware swaps (veg, vegan, any).
- Measurement prompts (bodySignals.measurePrompts): weigh-in / waist / neck when stale.
- Phone nudge (utils/coachNudge.ts): one notification when a plan change or the check-in is waiting; never at night, never twice a day.
- Hub: GET /api/coach/hub?today=...&hour=... now returns restOfDay, prompts, composition.
Tests: server/test/coachSignals.unit.test.js, coachHubFlow.unit.test.js; phone: src/utils/__tests__/coachNudge.test.ts.
Not built: progress-photo analysis (photos are stored on the phone only), web push notifications.

## Round 3: audit fixes
- Race fixed: Home opens several cards at once; with auto-adjust on, two of them could apply the same change twice and make Undo restore the wrong value. Weekly-coach operations are now serialised per person (withUserLock in routes/coachRoutes.js). The test (coachHubFlow) fails without the lock and passes with it.
- The phone nudge now follows the quiet hours set in reminder settings (utils/coachNudge.ts).
- Known limits: the lock is per server process (several instances need a database-level guard); text is English only; the hub does heavy work on every Home open.

## v68: the eight open gaps
1. **Early re-check** (`lib/weeklyRefresh.js`): a new low-recovery pattern, the first waist reading (or two 14+ days apart), enough weigh-ins/food days, or a flipped strength trend re-checks the cached decision. Writes only set a cheap `dirty` flag; at most one re-check a day; applied decisions are never re-checked; the re-check restarts from the ladder state before the review, so a slow week is never counted twice.
2. **One Home card**: the old weekly card is gone; the Coach card carries the Apply.
3. **Light Home endpoint**: `GET /api/coach/next` (no gym-plan build, no weekly recompute unless due).
4. **Lock across instances**: `models/CoachLock.js` + `lib/dbLock.js` (unique-index lease with TTL), under the in-process queue.
5. **Translations**: Coach screen, Home card, offers and cycle card use `utils/coachText.js` + `coach.*` keys (en/hi/te/ta). Headlines for all weekly actions and the main explanation line for 10 of them are translated; the other server sentences (advisories, day-plan notes, some weekly detail lines) still arrive in English.
6. **Offline**: check-ins and Apply taps queue (web `QUEUEABLE`, phone `write()`). An Apply tap carries `decisionId` and is refused (409) if the suggestion changed meanwhile.
7. **Behind plan** (`lib/targetOffer.js`): offers "move the date" and/or "raise the pace" (max +0.25 kg/wk, safe limit and floor respected, held back with a reason when recovery, strength, logging or a diet break say no). Never automatic, undoable, snoozable 14 days.
8. **Cycle** (`lib/cycle.js`, `CoachState.cycle`): optional, off by default, erasable. In the water window the weekly decision waits one week (`WAIT_CYCLE`, once per cycle).

## v69: database budget (free MongoDB tier)
Measured with counting fakes in `server/test/coachHubFlow.unit.test.js` (the numbers can only go down):
- A settled weekly view: 3 operations -> **1** read, no lock, no write. The lock and its database lease are only paid when the coach really has work (first open of the day or a week's review).
- Home's `/api/coach/next`: 7 -> **1** read while a change waits for a tap, at most 5 otherwise.
- Identical simultaneous requests (Home opens several cards at once) share one computation (`coalesce`); nothing is cached after it finishes, so data is never stale.
- A check-in/measurement/workout flag is not written again while it is already set.
- Not changed on purpose: the Coach page itself (`/api/coach/hub`) still reads everything fresh (it is opened rarely and shows food, plan and recovery together).

## v70: more improvements
- **Plan pace stays in step**: a ladder pace change now updates `plan.paceKg` too (and undo restores both).
- **Cycle-aware weight text**: with the cycle log on, a flat or slightly-up scale in the water window reads "water_window" (not "plateau"), suggests no cut and no diet-break advice (`lib/plateau.js` `withCycle`, Weight analysis and diet-break advice). The cycle is read only when the scale already looks flat.
- **Home and Coach page agree on "workout today"**: the Coach page saves the adaptive plan's answer (`CoachState.gymToday`), Home's light endpoint reuses it.
- **Forecast range**: `forecast.range` = earliest and latest date (rate 25% faster, never past the safe limit / 25% slower).
- **Lock renewal**: a slow request keeps its database lease (extended every third of its life).
- **Cycle log**: log any date in the last year, see and remove logged dates (web date picker, phone day chips).
- **Offline taps**: web now says "the coach has a newer suggestion" when a queued Apply tap is refused (the phone already showed the server's reason).
- **Translations**: the cross-coach tips (advisories) are translated in en/hi/te/ta; dynamic sentences keep the server text.
- **Real-database test**: `server/test/coachLock.integration.test.js` (runs with mongodb-memory-server or TEST_MONGO_URI; skipped when neither is installed).

## v71: fat loss and body-composition analysis
New `server/lib/bodyAnalysis.js` (pure, tested) + `GET /api/coach/body` (opened on demand, never part of Home) + the "Body progress" section on the Coach screen (web and phone, four languages, shared `utils/bodyCards.js`).
- **Fat vs lean** with a range and confidence, tape-only fallback; **recomposition** detector (flat scale + smaller waist + steady lifts = do not cut).
- **Ratios**: waist-to-height and waist-to-hip bands; monthly measurement guide for hips, chest, arm, thigh.
- **Calibrated maintenance** (range + confidence) and **logging gap** ("about N kcal/day missing", with where it usually hides).
- **Exercise credit**: only 70% of activity above the plan baseline is added to the day's food budget (all three energy models and the shared fixtures updated).
- **Activity-drop guard** (steps fell 15%+ and 1,000+: restore before cutting food).
- **Pace by body size** (leaner/lighter = slower) and a **taper offer** for the last 1.5/3/5 kg (one tap, undoable, never automatic).
- **Structured plateau checks** (data, water, logging, activity, adaptation) and a **diet-fatigue score** that can bring the diet break forward (never before 4 weeks of deficit).
- **Goal realism** (too low / too fast / too soon / lean), milestones every 2-3 kg, a 4-week check-in date.
- **Maintenance phase** (gradual +125 kcal/week ramp, weight band) and **regain guard**.
- **Scenario comparison** (steps, -150, both, -300 kcal) with capped safe pace; **top 3 calorie leaks**; **protein spread and fibre**; **what has worked for you** (judged changes).
- **Personal water window** learned from weigh-ins over 2+ logged cycles, used by the weekly cycle pause.
- **Safety**: kind notice for under-18 weight-loss goals and for persistent very-low or swinging days. Not a diagnosis.
Not done: progress photos (needs private image storage), a health-conditions screening setting.
