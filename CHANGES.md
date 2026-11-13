
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
