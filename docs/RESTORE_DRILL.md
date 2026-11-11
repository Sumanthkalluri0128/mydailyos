# Restore drill: prove your backups work

A backup you have never restored is a hope, not a backup. Do this once now, then again after big changes (about twice a year).

## 1. The automatic drill (2 minutes, no real data touched)
```
cd web/server
npm install
npm run restore:drill
```
It makes a throw-away database, fills an account (habits, food, weight, medicines, a recipe), downloads a backup the same way the app does, deletes everything, restores, and checks that every row came back, links between rows still work, and a second restore does not create doubles. It also runs in CI (`npm test`).

## 2. The real drill with your own emailed backup (15 minutes)
Do this against a TEST database, never your live one.
1. Open your weekly backup email and use the download link (it works for 48 hours; after that use Profile, Download my data). Save the `.json` file.
2. Make an empty test database (a free second Atlas cluster, or a local MongoDB) and put its address in `MONGO_URI` (in a separate `.env.drill`, not your real `.env`).
3. Start the server on it, open the app against it, and sign up with the SAME email as your backup.
4. Dry run first (writes nothing, just counts):
   `MONGO_URI=... npm run restore -- --file flexfit-export-2026-11-05.json --email you@example.com`
5. Check the counts look right, then add `--apply`.
6. Sign in on the test server and check: today's food, your weight chart, habits and their streaks, recipes, medicines, your training plan.
7. Run step 5 again: every row should say "already there" and nothing doubles.
8. Write the date you did it at the bottom of this file.

## What a backup contains (and does not)
Contains: profile, food and exercise logs, water, weight, tasks, habits and habit logs, custom foods, recipes, saved meals, meal plans, health logs, fasts, goals, medicines, workout templates, training program and sessions, coach settings, food preferences.
Does NOT contain: your password, sign-in tokens, share-link secrets, uploaded photos, or the shared food catalogue (the same for everyone).
Recipes, saved meals and meal plans were missing from backups before v62. Older backup files do not have them.

## If you ever really need to restore
Sign up again with the same email (the account must exist), then step 4 and 5 above against the live database. Restoring never overwrites: it only adds rows that are missing.

## Drill log
- (not done yet)
