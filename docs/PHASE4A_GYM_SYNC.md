# Phase 4a — Gym log on your account: sync across web and phone (opt-in) + per-account storage

First step of "plan workouts by week/month on both apps": the data has to be on the server before a plan can follow you. This step does it
for the **Gym log** (exercises, body measurements, goal, profile). The Workout-tab plans/sessions and the dated planner are the next steps.

## What was wrong
* The Gym log lived in one browser/phone only, so web and phone could never show the same log, and clearing browser data or reinstalling lost it.
* It was stored under one key for the whole browser/phone, and sign-out didn't clear it: **the next account to sign in saw it, and the calorie sync uploaded it into that account** (WORK-02).

## What changed
**Server** (`server/`): `POST /api/sync/push`, `GET /api/sync/pull` (`routes/syncRoutes.js`, rules in `lib/recordSync.js`), models `SyncRecord` + `SyncCounter`; registered in account export and account deletion. Newest edit wins per record, deletions are records.
**Shared** (`packages/shared/src/recordSync.js`, generated to web + phone): the whole sync round and its safety rails. `gymRecords.ts` (phone source, web copy generated): Gym log <-> records.
**Web + phone**: per-account Gym storage (the old shared log is adopted once by the first account that opens it, then removed); `gymRecordRunner` (off until switched on); a **"Sync across my devices"** card on Gym log > Export; privacy texts that say what is true in each state.

## Privacy: your decision to keep
The Gym log was built to stay on the device ("body measurements and goals are never sent"). So sync is **off by default**, per account and per device, with a clear switch and honest text. To make it on by default, set the stored flag `flexfit_gymrec_on:<email>` to `1` at sign-in (web `setRecordSync(true)` / phone `await setRecordSync(true)`); I did not do this for you.

## Safety rails (each tested; 6 deliberate code breakages were each caught by a test)
First sync only adds; a wiped device restores instead of deleting the server copy; unsent local edits are never overwritten by a pull; interrupted syncs keep their progress; "Clear all" propagates only when the person asked; one body measurement per day.

## Verified
* Server 838 tests (823 pass; the same 15 pre-existing failures as the original). 10 new sync tests, including the **real shared algorithm through the real routes** (edits, deletions, wiped device, interrupted sync).
* Web 254/254 + build. Phone 540 pass (same 3 pre-existing failing suites), 0 new TypeScript errors, lint unchanged on touched files.
* The same 17 two-device scenarios pass on the web copy and on the phone's TypeScript copy.
* A real bug caught by a test while building: a field named `updatedAt` collided with Mongoose's timestamps option and was overwritten by the server clock (renamed `changedAt` in the database; the API still says `updatedAt`).

## Behaviour changes you will notice
* Nothing changes until you turn sync on (on each device). After that the log is the same on both, deletions included.
* A second account on the same browser/phone no longer sees your Gym log.
* The old unscoped log is taken over by the **first account that opens the Gym log after this update**. If that is not the account you want, sign in with the right one first.
* With sync on, "Delete all gym log data" deletes everywhere (the confirmation says so).

## Not done yet (next steps)
Workout-tab plans/sessions/swaps still live only on one device; the dated week/month planner (move/skip, planned vs done by date) needs them on the server and comes next. Syncing needs the server awake (free tier sleeps ~15 min); it retries later.
