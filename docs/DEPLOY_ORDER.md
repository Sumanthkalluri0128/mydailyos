# Deploy order: server first, then the phone app

The phone build (v61) relies on things the server (v60) now sends: the protein range wording, the goal card `checkLine`, the arrival chart fields
(`remainingKg`, `likelyDays`, `startDate`, `endDate`), the plan `startChoice` / `startMode`, and the Smart program. An old server never breaks the
phone (every new field is optional and the old behaviour is the fallback), but people would not see the fixes, and an OLD server re-saving a plan
would still restart progress at zero.

1. Deploy `web/server` (and the web client).
2. Check it: `node web/tools/checkServerReady.mjs https://YOUR-SERVER` must print READY (apiLevel 60 or more). A free host can take a minute to wake.
3. Only then build and release the phone app.
4. On a real phone, with the new server: open Weight (numbers agree, chart has dates), Home (daily check-in), Plan (keep-or-fresh prompt), Workout (Smart/Classic switch, finish a workout, see it in History and in your Body tab week).
