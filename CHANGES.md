
## v71 - Automatic activity follows your real week
- Automatic mode no longer drops your calories after two quiet days. Each of the last 7 days gets its own multiplier (no activity 1.2, light 1.375, moderate 1.55, from steps + training) and maintenance uses their average, so the target tracks what you actually do. Days with nothing synced are skipped, not counted as lazy; fewer than 3 usable days keeps the previous reading.
- Shared energy model: new autoMultiplierOf (server, web and phone copies stay identical). Manual mode is unchanged.
- Profile page: the "Worked out for you" number now uses the same live values as My Plan (activity mode, 7-day reading, measured maintenance, calorie floor), so the screens agree.
- Day guide notes and maintenance basis reworded to match. New tests in test/dailyCoach.unit.test.js.
- scripts/diagnoseCalories.js: read-only report that explains a user target.
