# Phase 3 — One workout calorie model + no double-counted watch sessions (server, web, mobile)

## What was wrong (checked by running the app's own code)
1. **The same 60-minute lifting session gave 160, 336 or 420 kcal** depending on where it was logged, and that number decides how much extra food you may eat. The formula was typed in 8 places (5 on the server) with different MET values per screen (web 5/6/3, phone per-plan-day 4.0–4.5 and everything filed under "Strength").
2. **MET values include the 1 MET the body spends at rest anyway**, which your maintenance already contains. Counting it in workouts inflates the burn by 1/MET (20 % for lifting, 29 % for a brisk walk, 11 % for running). Step calories already counted only movement, so workouts and steps were inconsistent.
3. **A workout recorded by your watch AND logged by hand/Gym log counted twice**, because the Health Connect import only compared against other Health Connect rows.
4. The phone filed conditioning/recovery sessions under "Strength Training" and logged rest-day mobility; the web filed them under "Bodyweight circuit" / "Walking" and logged nothing for rest days.

## What changed
**Shared model (`energy.js`, regenerated to server / web / mobile with `tools/syncShared.mjs`; verified in sync)**
* `estimateBurn` is now net: (MET − 1) × 3.5 × kg / 200 per minute. New `REST_MET`, `SESSION_MET`, `sessionMet(kind)`.

**Server**: `activityRoutes` (manual log + Health Connect import), `trainingRoutes`, `bodyPlanRoutes`, `lib/workoutBuild`, `lib/overEngine` all call `estimateBurn`; no inline MET formula is left (a test scans for it). `lib/hcImport.manualBudget` + `activityRoutes /import`: watch sessions already covered by your own entries are skipped (rule in `docs/CALCULATIONS.md`).

**Web**: `workoutStore.estimateKcal` (shared session table), `planKit.kitKcal`, `gymMath.js` (regenerated from the mobile source, only this one of the five generated gym files).

**Mobile**: `gymMath.ts` (source of the web copy), `workoutEngine.estimateKcal` + `plannedKcal` (shared session table instead of per-plan-day MET), `overEngine.walkKcal`, `workoutSync` files sessions under the same activity as the web and skips rest-day mobility.

## Same session, before and after (5 lifts × 3 × 10 reps, 80 kg)
| Path | Before | After | Time counted |
|---|---|---|---|
| Workout tab, web | 420 | 336 | 60 min on the clock |
| Workout tab, phone | 336 | 336 | 60 min |
| Smart plan (server) | 420 | 336 | 60 min |
| Gym log | 160 | 125 | 22.5 min (sets + rest only) |

## Verified
* Server 828 tests (813 pass; the same 15 pre-existing failures as the original); web 232/232 + build; mobile 535 pass (same 3 pre-existing failing suites); 0 new TypeScript errors.
* 100,000 random comparisons of `estimateBurn`, `sessionMet`, `entryKcal`, `setKcal` across server / web / mobile: 0 mismatches.
* New tests fail on the original code and pass now. 13 older tests pinned the old gross numbers; each new expected value was derived by hand (e.g. 6:30/km run, 70 kg, 30 min = 8.79 net MET → 323 kcal), not copied from the output.

## Behaviour changes you will notice
* Workout calories are about 10–30 % lower than before (net of resting energy). Daily extra-food credit from exercise drops accordingly. This is intended: it no longer double-counts resting energy.
* The phone and web show the same calories for the same planned session.
* A watch session that matches something you logged that day no longer adds a second workout.
* Entries saved earlier keep their old numbers.

## Not changed / known limits
* The Gym log still counts only set + rest time, so the same visit shows fewer minutes (and kcal) there than on a timed Workout. Fixing that needs a session start/stop in the Gym log (a product decision).
* (Updated in Phase 5) The overlap rule now applies in both orders: watch first then your own entry, or the other way round.
* The web `gymCatalog.js` has one exercise ("Reverse Crunch") the mobile source lacks, and `gymSync.js` differs slightly from its mobile source. Pre-existing; not regenerated here so nothing is lost.
