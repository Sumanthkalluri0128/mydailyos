# Workouts tab (new)
Page id `workouts`. Desktop: pill + More menu. Phone: bottom tab "Workout" (replaces "Body"; Body plan is still in More).
- Screens: Today (week strip, hero, stats) / My plan (schedule, progression, nutrition, results) / Day overview / Library / History / live workout.
- Data: `client/src/data/workoutPlan.js` (7 days + every alternative from your sheets). Edit this file to change the plan.
- Logic: `client/src/utils/workoutStore.js` (+ `workoutStore.test.js`, 12 tests).
- Logs stay in the browser (per account) and each finished workout is also posted to /api/activities/logs.
- Server: `'workouts'` added to CORE in `server/lib/features.js` so simple mode does not hide it.

## My own plans (web)
My plan -> "My plans": make plans, add / delete / reorder exercises per weekday, set sets and reps, delete the whole plan, switch between Smart (automatic), My plans and Classic. Logic: `client/src/utils/customPlans.js` (+ `customPlans.test.js`); screen: `components/workout/PersonalPlans.jsx`. Plans are stored with the rest of the Workout state (`ff-wp-v1:<email>`, key `plans`), the active one is `source: "custom:<id>"`. A finished workout keeps the plan's id; an unfinished one keeps its own copy of the day, so editing or deleting a plan mid-workout cannot break it. Weights step up with the same rule as the classic plan (`suggestNext`). The Smart program is untouched and keeps adjusting from your logged progress.
