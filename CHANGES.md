## v75 - Weighing scales: a different scale no longer looks like weight gained or lost
- New "My scales" (Weight screen -> "Using a different scale? Add it"). Name your scales (Home, Gym, Office...), pick one when you log; the app remembers the last one you used on that device. Quick weigh-ins (command palette, phone check-in) use that scale too.
- A weigh-in is stored exactly as the scale showed it (`weightKg`) with its `scaleId`. Every analysis now reads CALIBRATED weights: reading - the scale's offset, in "main scale" terms. One module does it (`server/lib/weightScales.js` maths, `server/lib/weightData.js` database access); trend/coach/daily + weekly decision, calorie plan, measured maintenance, plateau, weight estimate, progress charts, day view, share page, wrapped, weekly email and profile numbers all go through it.
- Offsets are learned automatically from days you weighed on both scales (median of up to 10 same-day differences) or typed by hand ("Use learned" switches back). Weighing on two scales the same day keeps both entries (one entry per day PER scale); analysis uses that day's calibrated mean.
- "Make main" re-expresses every offset against another scale (nothing is rewritten). Deleting a scale keeps its weigh-ins: they move to the main scale at their calibrated value (a same-day main reading wins), so no trend changes. The main scale cannot be deleted.
- Existing entries (no scale) belong to the main scale, so nothing changes until a second scale is added. `Profile.currentWeightKg` is now the newest calibrated weight.
- API: `GET /api/weight` returns `weightKg` (calibrated), `rawKg`, `scaleId`, `scaleName`, plus `scales` and `referenceId`. `POST /api/weight` takes `scaleId` (unknown = main). New `PATCH /api/weight/:id` (fix scale/reading/note), `GET|POST /api/weight/scales`, `PATCH|DELETE /api/weight/scales/:id`, `POST /api/weight/scales/:id/reference`.
- CSV import compares with / writes to the main scale only; CSV export puts the scale name in `details` for weight rows.
- Tests: `test/weightScales.unit.test.js` (7, pass), a scales case in `test/api.integration.test.js` (needs Mongo). NOT run: the full server and client suites, the apps (no node_modules / no network here); changed JSX/TSX files were syntax-checked with esbuild only.


## v72 - Macros say what they are sized to, entries that disagree with themselves are flagged, autopilot is on by default
- Home "Macros Today" now shows one line saying which calories the macros are sized to ("today's N kcal budget" or "the plan's N kcal"). My Plan says its numbers are the base ones that Home resizes each day: earned activity adds carbs and fat, protein stays put. Same wording comes from the shared model (`resolveTargets().macroBasisNote`), so web and phone cannot drift.
- Food entries whose calories disagree with their own macros (protein 4, carbs 4, fat 9 kcal per g; gap 15%+ and 40 kcal+; needs two macros to judge) are flagged on the food screen and listed in the day summary (`summary.mismatches`). The day still counts the calories as logged; the flag only says which entry to fix. Shared rule: `macroMismatch` in energy.js.
- Autopilot: the coach's safe auto-adjust (calorie/pace change of at most 150 kcal above your floor, or a steps rise) is now ON unless you switch it off yourself. A profile that only carries the old stored "off" is treated as on; touching the switch saves `goals.coachAutoChosen` so your choice is kept. Every automatic change is still in the changelog with one-tap undo.
- Considered and NOT changed: a "very active" day level (1.725) for 15k+ step days. Your own log (5 weeks, measured maintenance about 2,600 kcal = 1.50-1.53 x resting) matches the existing 1.55 cap, so a higher level would have overstated maintenance. Steps and logged workouts stay additive (a treadmill session is not in the phone's step count).
- Tests: `test/energyTrust.unit.test.js` (4). Server suite 699 pass, 9 fail, the same 9 that failed before this change (missing modules / sticker / google mail); client suite 215 pass.
- energy.types.txt: autoActivity type now has `multiplier`, so regenerating the phone copy no longer drops it.

## v71 - Automatic activity follows your real week
- Automatic mode no longer drops your calories after two quiet days. Each of the last 7 days gets its own multiplier (no activity 1.2, light 1.375, moderate 1.55, from steps + training) and maintenance uses their average, so the target tracks what you actually do. Days with nothing synced are skipped, not counted as lazy; fewer than 3 usable days keeps the previous reading.
- Shared energy model: new autoMultiplierOf (server, web and phone copies stay identical). Manual mode is unchanged.
- Profile page: the "Worked out for you" number now uses the same live values as My Plan (activity mode, 7-day reading, measured maintenance, calorie floor), so the screens agree.
- Day guide notes and maintenance basis reworded to match. New tests in test/dailyCoach.unit.test.js.
- scripts/diagnoseCalories.js: read-only report that explains a user target.
- v71 sync audit: coach "no-activity day" note now compares against the live (7-day) maintenance; day guide shows "7-day average" as its basis; client/src/utils/calories.js uses the shared multiplier table; the daily refresh never recomputes for an earlier date (no web/phone flip-flop); shared fixtures (server, web, phone) and the web-vs-server parity test now cover the 7-day average.

## v73
- Plan builder: 7 ready-made plans + Blank + Classic copy; every day = warm-up + main + cool-down with live kcal/minutes (utils/planKit.js).
- Exercise logger redesigned on web and mobile: week strip, search-first picker with pictures, +/- steppers, live kcal, quick-add ("bench 3x10 60").

## v74
- Gym log / Exercise logger: a blank weight is now a body weight set. Shown as "@ BW", counted in volume at your body weight on that day, and recalculated for old entries too (see docs/GYM_LOG.md). Records for these sets stay rep-based. CSV gained `weight_type`.
- Medicines: reminders for one medicine with several times no longer ring twice (phone: the reminder scheduler could run twice at once and leave the first set ringing; it now runs one at a time and clears leftovers. Quiet hours that pushed two doses onto the same minute now give one reminder). Web reminder timers have the same overlap guard.
- Phone: the medicine notification has a "✓ Taken" button that ticks the dose(s) without opening the app and cancels its remaining reminder.
