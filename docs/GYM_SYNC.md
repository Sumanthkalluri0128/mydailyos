# Gym log sync across devices (opt-in)

**Off by default.** The Gym log was designed to stay on the device, so nothing leaves it until the person turns on
*Gym log > Export > Sync across my devices*, on each device. The switch is per account and per device.

## How it works
* **Records, not one big file.** Each logged exercise, body measurement, the body goal and the profile (unit/height/sex, only when set) is a record
  `{kind, rid, data, updatedAt, deleted}` stored in `SyncRecord` (server) under the person's id. `SyncCounter` hands out a per-person `seq`.
* **Newest edit wins** per record; a tie keeps the server's copy so every device agrees. A deletion is a record (`deleted: true`), so it reaches other
  devices and an older copy can't bring it back. A device clock more than a day ahead is clamped.
* **A round = push, then pull.** `packages/shared/src/recordSync.js` (generated to the web and the phone) holds the whole round (`syncRound`); each app
  only supplies its storage and network. `gymRecords.ts` (phone source, web copy generated) turns the Gym log into records and back, cleaning everything
  that comes in like a restored backup.
* **Routes:** `POST /api/sync/push {space, records}` (max 500, 20 kB each) and `GET /api/sync/pull?space=&since=&limit=`. Pulls start 50 `seq`s early
  because a record can appear a moment after a later one; repeating a record is harmless.

## Safety rails (each has a test)
1. The first sync only **adds**: nothing is known yet, so nothing counts as deleted. Data on two devices is combined.
2. A device whose log suddenly looks empty (cleared browser data, reinstall that kept the memory) never deletes the server copy: more than 20 missing
   records and more than half of what is known are **restored**, not deleted. "Clear all" and "Restore from backup" (done on purpose) are sent.
3. An edit made after the last sync is never overwritten by a pull; it is pushed and the newest edit wins on the server.
4. A record the server already has in that exact form is not sent again; an interrupted sync keeps its progress batch by batch.
5. One body measurement per day: if two devices measured the same day, the newest stays on both.
6. Records are private to the person, included in the account export (`syncRecords`) and removed with the account.

## Per-account storage
The log on the device belongs to the signed-in account (`flexfit_gymlog_v2:<email>`), so a second account on the same browser/phone never sees it and the
calorie sync can't upload someone else's entries. The old shared copy (`flexfit_gymlog_v1`) is adopted once by the first account that opens the log.

## Not covered yet
Workout-tab plans and sessions (`ff-wp-v1:<email>` / `flexfit_workout_v1`) are still on-device only; the dated planner needs them on the server.
