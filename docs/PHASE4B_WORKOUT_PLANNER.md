# Phase 4b — Dated workout planner (week + month, web and phone)

## Why this replaced "sync the Workout tab"
Reading both Workout tabs showed their data models differ (web has custom plans, `dayId`, `planId`, `startDate`; the phone has `dayN`, routine picks, mobility
picks, no custom plans). Syncing them would mean redesigning both and risks corrupting history. Your real need (plan a week or a month, same on both apps) is
what the meal planner already does as a **server-native** feature, so the workout planner is built the same way, independent of the Workout-tab internals.

## What you can do now
Plan a workout on any day; repeat a week for 1-12 weeks; copy this week to next week; move, edit, skip or mark done; see the whole month with a marker per day
(planned / done / partly / skipped / rest). **Done is detected from what you actually logged** (Gym log, Workout tab, Exercise page, watch): if the day's log covers
at least 40 % of the planned minutes in the right kind of activity, the plan shows "Done · matches your log". Planning never adds calories.

## What changed
* **Server**: `routes/workoutPlanRoutes.js`, `models/WorkoutPlanItem.js`, `lib/workoutPlanner.js`; registered in account export + deletion.
* **Shared** (`workoutPlanView.js`, generated to web + phone): weeks, month grid, "Squat 3x8 @60" parsing, repeat-pattern building, day markers.
* **Web**: `pages/WorkoutPlannerPage.jsx` (+ css), nav entry, button on the Workout page.
* **Phone**: `app/workout-planner.tsx`, a card on the Workout tab.
* Also fixed: the Gym log header line on both apps still said measurements "stay in this browser/phone" even with sync on.
* Docs: `docs/WORKOUT_PLANNER.md`.

## Verified
* Server 854 tests (839 pass; the same 15 pre-existing failures as the original): 8 planner unit + 8 route tests (real MongoDB) covering add/idempotency, past days, repeat for a month, planned-vs-done matching, move/edit/skip, copy week, privacy between users, export/deletion, limits.
* Web 261/261 + build. The page was also driven in a simulated browser against an in-memory copy of the API (28 checks: add, parsed exercises, mark done, skip, undo, move, edit, plan several weeks, remove, month grid and dots, tap a day).
* Phone: the real screen file driven the same way (25 checks); lint 0/0 on it, 0 new TypeScript errors; the shared logic's 7 tests also pass on the phone's TypeScript copy.
* Caveat: those two UI checks use a stand-in for the server and a browser simulation; nothing was run on a real phone or against your server.

## Behaviour to know
* The planner is on the server **by default** (unlike Gym log sync): it holds workout names, exercises and notes, not body measurements.
* A plan can't be made for a past day, and moving a workout into the past is refused.
* Marking done by hand and "matches your log" are separate: undoing a manual "done" does not hide a match that comes from your log.

## Not done yet
Reminders for planned workouts, linking to the Workout tab's built-in plan days, and syncing the Workout-tab plans/sessions themselves (they stay per device).
