# Phase 2 — One maintenance estimator (server only; web and mobile apps need no change)

## What was wrong (verified by running the app's own code on simulated people whose true maintenance was known)
1. **Two estimators disagreed.** The calorie target used `adaptiveMaintenance`; the coach body view used a second copy (`calibratedMaintenance`) with different rules (any logged calories counted as a day, no outlier filter, 6 vs 4 weigh-ins). On half-logged days the body view was off by **−357 kcal**, said "high" confidence, and its range contained the truth only **8 %** of the time.
2. **Confidence ignored scale noise.** With 0.6 kg noise and a weigh-in every 4 days the answer swings about ±250 kcal, yet it was "high" in 400 of 400 runs.
3. **Carried-forward weights were counted as weigh-ins** in the weekly coach and the body view (chart history repeats the last weight; only `weighIn: true` rows are measurements). A once-a-week weigher "had" 35 weigh-ins and always got "high".
4. **Today's half-logged food counted as a full day** (about −46 kcal bias).
5. `7700` was typed in 6 files.

## What changed (all in `server/`)
| File | Change |
|---|---|
| `lib/adaptiveTdee.js` | The single estimator. Adds a 90 % range (`low`–`high`), noise-aware confidence (high ≤ ±250 kcal, medium ≤ ±400, else low), ignores rows flagged `weighIn:false`, leaves today out when `today` is given, exports `maintenanceNeed` |
| `lib/bodyAnalysis.js` | `calibratedMaintenance` is now a thin wrapper over it (same output shape for the UI) |
| `lib/measuredMaintenance.js`, `lib/dailyCoach.js`, `lib/weeklyCoach.js`, `routes/coachRoutes.js` | pass `today`; keep the `weighIn` flag; read 36 rows = 35 finished days |
| `lib/outcomes.js`, `lib/whatIf.js`, `lib/weightEstimate.js`, `routes/planRoutes.js` | use the shared `KCAL_PER_KG` |
| `test/maintenanceEstimator.unit.test.js` | 9 new tests (all 9 fail on the old code, all pass now) |
| `docs/CALCULATIONS.md` | updated to match |

## Result on identical simulated data (true maintenance 2500)
* Calorie target and body view now give **identical** numbers in every scenario (before: they differed in most).
* Half-logged days: body view bias −357 → −1; range holds the truth 8 % → 100 %.
* Today half logged: bias −46 → −4.
* Ranges hold the truth 94–100 % (88 % on extremely noisy scales, because the outlier filter drops some weigh-ins).
* Confidence now follows the data: noisy / infrequent weigh-ins are medium or low instead of always high.
* **Not fixable by statistics:** days you simply forget to log (e.g. half the weekends) still bias maintenance low (about −43 kcal in the test). The existing "logging gap" card is the right place for that.

## Behaviour changes you will notice
* People with a noisy scale or few weigh-ins get **lower confidence**, so the calorie target follows the formula more and the measured reading less (medium steers 35 %, low 0 %). This is intended.
* The body-view maintenance card can appear with 4 real weigh-ins (was 6) — it now shows an honest, wider range instead of waiting.
* The weekly coach no longer shows an inflated weigh-in count and returns nothing when there are fewer than 4 real weigh-ins.
* Today's food and today's weigh-in are left out of the estimate until tomorrow.

## Verified
Server: 819 tests, 804 pass, the same 15 pre-existing failures as the original code, no regressions. Existing estimator tests (34) still pass.

## Not changed (deliberately)
* `energy.calorieBalance` repeats the bonus logic of `dayBalance`; it lives in the generated shared model (3 copies + mobile), so it needs its own careful change.
* Gross vs net MET calories and one workout calorie model — Phase 3.
