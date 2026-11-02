# Workouts tab (new)
Page id `workouts`. Desktop: pill + More menu. Phone: bottom tab "Workout" (replaces "Body"; Body plan is still in More).
- Screens: Today (week strip, hero, stats) / My plan (schedule, progression, nutrition, results) / Day overview / Library / History / live workout.
- Data: `client/src/data/workoutPlan.js` (7 days + every alternative from your sheets). Edit this file to change the plan.
- Logic: `client/src/utils/workoutStore.js` (+ `workoutStore.test.js`, 12 tests).
- Logs stay in the browser (per account) and each finished workout is also posted to /api/activities/logs.
- Server: `'workouts'` added to CORE in `server/lib/features.js` so simple mode does not hide it.
