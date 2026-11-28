# Manual test checklist (phase 6)

The automated checks run without a real phone, a live server or a cold start. This list covers exactly those. Do it on a **real phone with a release or preview build** (not Expo Go: local reminders do not work there), against the **real deployed server**, and with the **web app** open in a browser on the same account.

Tick each box. "Expect" is what must happen. If something differs, note the step number, what you saw, and (phone) the time, so it can be found.

## 0. Before you start

- [ ] Server deployed first, and it is awake: `https://<your-server>/api/health` answers (a free host can take a minute).
- [ ] Phone build installed, signed in to a **test account** that has: at least one workout in the planner for today and another for tomorrow, one finished workout in History, and a few foods logged.
- [ ] Web app open and signed in to the same account.
- [ ] You know how to switch the phone to **airplane mode** and back.
- [ ] Phone notification permission for the app is **allowed** (Settings > Apps > the app > Notifications). Do not test reminders with it blocked, except step 9.10.

## 1. Cold start (server asleep)

Leave the server idle for 15+ minutes so it sleeps, then:

- [ ] 1.1 Open the phone app. Expect: the last-seen screens show at once from the saved copy, with no crash and no endless spinner.
- [ ] 1.2 Within about a minute, fresh data replaces them. Expect: no error toast that stays.
- [ ] 1.3 Open the web app after another idle period. Expect: it loads, the first requests may be slow, none ends in a permanent error.
- [ ] 1.4 Force-close the phone app and open it again with airplane mode on. Expect: it opens, shows saved data, says it is offline where it needs a connection, never a blank white screen.

## 2. Delete a finished workout (web and phone)

- [ ] 2.1 Web: delete a finished workout in History. Expect: it disappears; reload the page: still gone; the phone no longer shows it after a refresh (the server entry is gone too).
- [ ] 2.2 Phone: delete one. Expect: a 5-second Undo appears. Tap **Undo**: the workout is back and still on the server (check on web).
- [ ] 2.3 Phone: delete one and let the 5 seconds pass. Expect: gone, and gone on web after refresh.
- [ ] 2.4 Phone, airplane mode: delete one. Expect: it disappears at once. Turn airplane mode off. Expect: within a minute it is gone on web too.

## 3. Edit a logged workout

- [ ] 3.1 Phone: open a logged workout and edit its duration. Expect: the new form opens with the current values, saves, History and Home totals change.
- [ ] 3.2 Web: log a workout, **hand-type** a calories number, save. Edit **only the note** and save. Expect: the hand-typed calories are **unchanged** (this used to reset).
- [ ] 3.3 Phone, airplane mode: edit a workout. Expect: it shows the change at once; back online it syncs; web shows it.

## 4. Sync failure handling

- [ ] 4.1 Phone, airplane mode: finish a workout in the Workout tab. Turn airplane mode off. Expect: it syncs quietly; it appears in History on web.
- [ ] 4.2 With no connection, open History and tap anything that syncs. Expect: it **stops quietly** (no error storm).
- [ ] 4.3 If you can make the server refuse one (for example a workout on a date the server rejects): Expect: History shows it **flagged with a reason and a Try again button**, and it is not lost. Tap **Try again** after fixing the cause.
- [ ] 4.4 Have 6 or more unsynced workouts (airplane mode, finish several), go online. Expect: all sync; one failure does not stop the others.
- [ ] 4.5 A workout from 50 days ago that never synced still syncs (window is 60 days on both apps).

## 5. Start this workout from the planner

- [ ] 5.1 Phone > Workout planner > a planned workout with exercises > **Start**. Expect: the Gym log walk-through opens with planned sets, reps and weight **pre-filled**.
- [ ] 5.2 Finish the walk-through. Expect: the workout is marked **done** in the planner, and the sets are in your log.
- [ ] 5.3 Same, in airplane mode. Expect: "Saved offline ... will be marked done when you are back online"; online later it is done in the planner on web too.

## 6. Two workouts on one day

- [ ] 6.1 Phone: plan two workouts for today. Do the catch-up of **another day's** workout. Expect: today's workouts do **not** look done.
- [ ] 6.2 Do both of today's. Expect: the **Done line shows the day's total** (on phone and on web).

## 7. Quick-add correction (the new screens)

Create the entries first: on the phone use Eating out to log an estimate (for example "Burger and fries", 825 kcal), and on web use the quick-add as well.

- [ ] 7.1 Web, Food page: open the meal. Expect: the page shows the list (it used to crash when a meal had entries: **this is the shiftDay regression check**). Open the **Move to...** menu on any entry: "Day before" and "Day after" are offered.
- [ ] 7.2 Web: on the quick-add row, **Edit**. Expect: a form with Name, Calories, Protein, Carbs, Fat, **not** the portion editor. On a normal food, Edit still shows the amount editor.
- [ ] 7.3 Change only the calories (825 to 700) and Save. Expect: the row shows 700 kcal; an Undo notice says "... is now 700 kcal"; the day total moved by 125.
- [ ] 7.4 Click **Undo**. Expect: 825 again, and the note (Estimate range) is back too.
- [ ] 7.5 Clear the calories box. Expect: a message, Save disabled. Type letters in protein. Expect: a message, Save disabled. Press Escape: the form closes and nothing is sent.
- [ ] 7.6 Change only the name. Expect: only the name changes; calories untouched.
- [ ] 7.7 A chai-counter entry (if you use it) can be corrected the same way.
- [ ] 7.8 Home > the eaten sheet: the same quick-add row has the same correction form.
- [ ] 7.9 Phone > Food: Edit on the quick-add row opens the correction form. Save 825 to 700. Expect: row, Home day total and meal total update; the 5-second Undo works and restores calories and note.
- [ ] 7.10 Phone, **airplane mode**: correct the quick-add. Expect: it shows at once on the Food list, on Home (day total) and in History (that day moves by the difference). Tap Undo while still offline: all return to the old numbers. Correct again, go online: the server has the corrected number (check on web).
- [ ] 7.11 An entry that an older app stretched to "2 servings" (if you have one): type the total you want; the day shows exactly that number.

## 8. Planner offline (phone)

- [ ] 8.1 Phone > Planner, airplane mode. **Remove** a planned item. Expect: it disappears at once, the meal total and the day bar update.
- [ ] 8.2 Change an item's amount with the amount editor and with the 25% buttons. Expect: the amount and the numbers update at once.
- [ ] 8.3 **Move** an item to another meal, then to another day. Expect: it leaves and appears where you sent it; day totals follow.
- [ ] 8.4 Add an item to the plan offline, then change its amount and remove it, all offline. Expect: no leftover item after you go online.
- [ ] 8.5 Go online. Expect: everything matches the server (check on web); no duplicates.
- [ ] 8.6 Offline, try **Auto-plan** or **Swap**. Expect: a clear "needs a connection" message (these still need one).
- [ ] 8.7 If you can: on the phone, offline, change the amount of a planned item. On another device (web), log that same item as eaten. Then bring the phone online. Expect: the server refuses the change (an eaten item cannot be edited) and the phone shows a warning "Couldn't save one change: ..." naming it, never a silent loss.

## 9. Workout reminders (phone, real build)

- [ ] 9.1 Open the **Reminders** screen and find the **Planned workouts** card: the switch is **off** by default. Turn it on. Expect: a time field appears (default 18:00).
- [ ] 9.2 Set the time to **2-3 minutes from now**, with a workout planned for today that is not done. Save. Lock the phone. Expect: a notification "Workout today" with the workout name and minutes arrives at that time. Tap it: the workout planner opens.
- [ ] 9.3 Set a later time (10 minutes ahead), Save, then **mark the workout done** in the planner. Wait past the time. Expect: **no** notification.
- [ ] 9.4 Same, but **Skip** the workout instead. Expect: no notification. Press **Undo** on it before the time: the notification comes back.
- [ ] 9.5 Same, but finish it in Gym log with **airplane mode on**. Expect: no notification (the phone remembers it was done even though the server does not know yet).
- [ ] 9.6 Two workouts planned today, finish one. Expect: the reminder still comes and names only the other one.
- [ ] 9.7 Log a matching exercise from the Exercise screen. Expect: the planned workout counts as done and its reminder is cancelled.
- [ ] 9.8 Turn the Planned workouts switch off, Save. Expect: no workout notifications. Turn it on again, Save, then use the screen's turn-everything-off action. Expect: no workout notifications either.
- [ ] 9.9 Plan workouts on three different days, turn it on. Expect: one notification per day at the chosen time (leave the phone, check the next days). A rest day gets none.
- [ ] 9.10 Block the app's notification permission in the phone settings, open the app. Expect: no crash; reminders simply do not fire.
- [ ] 9.11 Restart the phone **without opening the app**. Check whether tomorrow's reminder still fires. This is a check, not a promise: the app re-plans every reminder each time it is opened, but whether the phone keeps scheduled notifications across a restart depends on the phone. Write down what happened.

## 10. Old apps against the new server

The server is deployed first; apps that people have not updated must keep working.

- [ ] 10.1 With the **previous phone build** (or an older web tab left open): log food, log a workout, open the planner, edit a food amount. Expect: everything works as before.
- [ ] 10.2 On the old phone build, a quick-add row simply opens the **portion editor** as before (it does not know the correction form). Correct nothing, expect no errors.

## 11. After the check

- [ ] Note the build number, server version and date next to your results.
- [ ] Anything that failed: step number, what you saw, a screenshot, the time.
