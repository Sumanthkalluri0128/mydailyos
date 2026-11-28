# Deploy guide (phase 6)

Order matters: **server first, then the web client, then the phone app.** Old apps keep working against the new server (every change is additive), so there is no flag day. This extends `DEPLOY_ORDER.md` in the phone project.

What phase 6 changes on the server: the food-log list marks quick-add entries (`quick: true`), and a correction of a quick-add's name or numbers is accepted (and replaces the stale "Estimate 600-900 kcal" note when the calories change). **No new collections, no new indexes, no new environment variables.**

## 1. Before you deploy: run the checks on a machine with `node_modules`

The checks I could run without installed packages passed; the ones below need a normal development machine. Run them from the repo root unless stated, and expect these results.

| Where | Command | Expect |
| --- | --- | --- |
| repo root | `node tools/syncShared.mjs --check` | exit 0 (shared copies identical) |
| repo root | `node tools/checkSharedFiles.mjs` | exit 0 |
| repo root | `node tools/checkApiParity.mjs` | "Every client path has a server route." |
| repo root | `node tools/checkAssetBudget.mjs` | exit 0 (run with the real `assets/` folders present) |
| `web/server` | `npm install && npm test` | all pass |
| `web/client` | `npm install && npm test` | all pass |
| `web/client` | `npm run build` | builds with no errors |
| `mobile/MyDailyOSMobile` | `npm install && npm run typecheck` | no errors |
| `mobile/MyDailyOSMobile` | `npm test` | all pass |
| `mobile/MyDailyOSMobile` | `npm run lint` | no new errors |

**Two checks fail today and did before phase 6** (identical results on the step 5 files). They are not blocking this release, but are worth fixing separately:

- `node tools/checkImportant.mjs`: `components/workout/workoutplan.css` has 5 `!important` rules (allowed 0).
- `node tools/checkWriteValidation.mjs`: `POST /gym-sync` in `activityRoutes.js` reads a body without validating it (1 of 120 write routes).

Also run the browser and render harnesses from `verification-harnesses/` where you have the real tools (see its README). Those I ran with stand-ins; with the real jest, jsdom and `react-test-renderer` they are stronger.

## 2. Server (Render)

`render.yaml` defines the service `flexfit-api` (root `server`, `npm install`, `npm start`, health check `/api/health`, `autoDeploy: true`). Deploying is pushing to the branch Render watches.

1. Push the server code. Render builds and starts it.
2. Wait for the health check to go green.
3. Environment variables are unchanged (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `GMAIL_REFRESH_TOKEN`, `BREVO_API_KEY`, `MAIL_FROM`, `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Nothing to add.
4. **Readiness check:**
   `node tools/checkServerReady.mjs https://mydailyos-268d.onrender.com`
   It must print READY. **Be aware:** it only checks `apiLevel` (currently 60). Phase 6 did not raise it, so this command cannot tell the phase 6 server from the one before. Do the next step as well.
5. **Phase 6 check (needs your login token):**
   1. In the app, log a quick-add estimate (for example Eating out, 500 kcal).
   2. `curl -H "Authorization: Bearer $TOKEN" "https://mydailyos-268d.onrender.com/api/food-logs?date=YYYY-MM-DD"`
   3. Expect that entry to contain `"quick":true`, and ordinary foods not to.
   4. Correct it: `curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"calories":400}' https://mydailyos-268d.onrender.com/api/food-logs/<id>` Expect success and the entry's note to read "Corrected estimate (was 500 kcal)". Delete the test entry afterwards.
   (If you want the first readiness command to enforce this in future, raise `API_LEVEL` in `server/lib/apiLevel.js` and pass the new number to `checkServerReady`. That is your call; I did not change it.)

**Rollback:** redeploy the previous server version in Render. Data needs no migration in either direction. Quick-add entries that were corrected simply keep their corrected numbers.

## 3. Web client (Vercel)

`client/vercel.json`: `npm run build`, output `dist`, `/api/*` is proxied to the Render service.

1. Push the client code (or trigger the Vercel deployment).
2. Open the deployed site. Hard refresh. Work through sections 1, 2, 3 and 7.1-7.8 of `MANUAL_TEST_CHECKLIST.md`.
3. Open the Food page with a meal that has entries. If it shows the list and the "Move to..." menu offers "Day before / Day after", the `shiftDay` fix is live.

**Rollback:** promote the previous deployment in Vercel.

## 4. Phone app (EAS)

`eas.json`: profile `preview` builds an internal Android APK, profile `production` is the store build (`autoIncrement` on). Both point to `EXPO_PUBLIC_API_URL=https://mydailyos-268d.onrender.com`.

1. Only after the server (step 2) is confirmed.
2. Build a **preview** first: `eas build --profile preview --platform android`. Install it on a real phone.
3. Do the whole `MANUAL_TEST_CHECKLIST.md` on that build. Sections 7.9-7.10 (quick-add offline), 8 (planner offline) and 9 (reminders) can only be checked here.
4. If it passes, build production: `eas build --profile production --platform android` (and iOS if you ship it), then `eas submit`.

**Reminders on iOS:** the system allows 64 scheduled notifications per app and the app keeps within 60. Planned-workout reminders use up to 7 of those (one per day for 7 days) and are counted in the budget.

**Rollback:** keep the previous build's artifact. Releasing the previous build against the new server is safe, as above (it shows the portion editor on quick-add rows and ignores the new fields).

## 5. Where each phase 6 item lives (for support)

| Feature | Server | Web | Phone |
| --- | --- | --- | --- |
| Quick-add correction | `routes/foodLogRoutes.js` (`quick` marker, numeric PATCH) | `components/QuickCorrect.jsx`, `FoodLogger.jsx`, `home/EatenSheet.jsx` | `components/QuickCorrect.tsx`, `app/food.tsx`, `utils/quickCorrect.ts`, `utils/optimistic.ts` |
| Planner offline | none | none | `utils/mealView.ts`, `utils/optimistic.ts`, `app/plan.tsx` |
| Workout reminders | none | none | `utils/notifications.ts`, `utils/reminderSchedule.ts`, `utils/notificationPrefs.ts`, `app/reminders.tsx` |
| Shared helper | `packages/shared/src/quickEdit.js` (generated into web and phone by `tools/syncShared.mjs`) | | |

## 6. Known limits to expect, not bugs

- Planner actions that need server logic (auto-plan, templates, swap, copy last week, clear, lock) still need a connection and say so.
- An offline exercise log does not cancel that day's workout reminder until it syncs (the app cannot know which planned workout it matches). Finishing the workout from the planner or Gym log cancels it at once.
- The planner view and Home's planned preview do not show an offline quick-add correction until sync (the food list, Home totals and History do).
- A quick-add created offline has no local copy yet (the Protein check-in is queued but not shown). This is an open decision.
