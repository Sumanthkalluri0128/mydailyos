# Workout planner (web + phone)

Plan workouts for any day, a week or a month ahead; repeat a week for up to 12 weeks; copy a week; move, edit, skip or mark a day done. Stored on the
server under the person's account, so the web app and the phone show the same plan (unlike the Workout tab, whose plans/sessions are still per device).

## Where
* Web: nav "🗓️ Workout planner" (also a button on the Workout page). Phone: "Workout planner" card on the Workout tab (`/workout-planner`).
* Server: `routes/workoutPlanRoutes.js` (`/api/workout-plan`), model `WorkoutPlanItem`, rules in `lib/workoutPlanner.js`. Screen logic shared by both apps in
  `packages/shared/src/workoutPlanView.js` (generated to the web and phone copies).

## Rules
* A planned workout: `kind` (strength, cardio, conditioning, recovery, rest, custom), a name, optional minutes, optional exercises (`Squat 3x8 @60`), a note.
* **No planning into the past** (same rule as the meal planner). Past days show what was planned and what you logged.
* **"Done" comes from your own log.** A planned workout shows as done (and says "matches your log") when the same day's exercise log (Gym log, Workout
  tab, Exercise page, watch) holds at least **40 %** of its minutes in a matching kind of activity (strength plans match Strength; cardio matches cardio,
  walking, running, cycling, swimming, ...). With no planned minutes, 10 logged minutes are enough. Logged minutes are shared out (30 logged minutes cover
  one 60-minute plan, not two), biggest plan first. A rest day is never matched. You can also mark done or skip by hand and undo it.
* **Planning never adds calories** and never creates an exercise-log entry, so nothing is counted twice.
* Repeat: `POST /repeat {from, weeks 1..12, pattern:[{dow 1..7, kind, title, minutes}], clientId}`. Starts with the week of `from`; days before `from`/today
  are skipped; the same request twice adds nothing (ids are `seriesId:date:slot`). "Remove the rest of this repeat" deletes a series from a date on.
* Copy a week skips what is already there (same day + kind + name) and resets status. Moving remembers the original day ("moved from ...").
* Limits: 93 days per request, 21 workouts per repeated week, 200 per repeat call, 3000 per person, 30 exercises per workout.
* Private to the person; included in the account export (`workoutPlan`) and deleted with the account.

## Not included yet
Linking a planned day to the Workout tab's built-in plan days, reminders/notifications for planned workouts, and templates shared between accounts.
