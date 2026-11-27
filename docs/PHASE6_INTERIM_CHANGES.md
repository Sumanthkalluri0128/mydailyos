# Changes since the Phase 5 package (interim drop, "latest")

Server 878/878, web 261/261 + build, phone 63 suites / 552 tests, 0 TypeScript errors. Verified on a local MongoDB and in simulated browsers only; not on a real phone or your live server.

## Food
* `PATCH /api/food-logs/:id` can now change an entry's **day** (not weeks ahead) and **note**, and correct a **quick-add** estimate (name and numbers; a real food's numbers are never editable here).
* Stored nutrition is rounded to 2 decimals (no `61.199999999999996`).
* Web: "Move to..." dropdown gains "Day before / Day after". Phone: the move panel gains "Yesterday / Tomorrow".
* Tests: `server/test/foodEdit.integration.test.js` (serving maths, day totals = sum of entries, snapshot kept if the food is edited later, privacy).

## Double taps
* Habits, medications, goals, workout templates: saving the identical item again returns the existing one (`createUnlessSame` in `lib/idempotent.js`). Any different field makes a new item.
* Tasks: an identical task within 15 seconds is treated as a second tap (an identical one later is new).
* Fasting: starting a fast is race-safe (6 simultaneous taps: 1 created, 5 answered 409; the original created 5).
* Tests: `server/test/doubleTapCreates.integration.test.js` (fail on the original).

## Finished workouts
* `PATCH /api/activities/logs/:id`: minutes, day, note, calories (calories follow new minutes unless a number is sent). Gym-log entries are refused (edit them in the Gym log). An edit that makes your entry cover a watch session removes the watch copy.
* `DELETE /api/activities/logs?clientId=` and `DELETE /api/body-plan/session?clientId=`: delete a finished workout by the id the app gave it. **Not used by a screen yet** (see below).
* Web Exercise page: edit button and inline form. Tests: `server/test/activityEdit.integration.test.js` (0 of 5 pass on the original).

## Known and not finished (also in the PDF report)
* The Workout tab (web and phone) deletes a finished session only on the device; the server's calorie entry stays and inflates burn. The routes above are ready; the screens still need to call them (with a retry list for offline).
* The `DELETE /api/body-plan/session?clientId=` route has no test yet.
* Phone Exercise edit form; sync failure handling; "start this workout" from the planner; planner offline; reminders; translations; manual test checklist and deployment guide.
* Not run on a real device or live server.
