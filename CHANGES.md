# v8.3 — planner, recipes, text logging, suggestions, reports (web + server 2.8.0)

- **Drag & drop** food between meals on the Log Food page (the "Move to…" menu still works on touch screens).
- **Type what you ate** ("2 roti, dal, 1 cup rice, 100 g paneer"): foods and amounts are matched, you adjust, then log.
- **Suggested for you**: foods that fit the calories, protein and fibre still missing today.
- **Meal planner** (top bar → Plan): plan a week, log items or a whole day with one tap, copy last week, shopping list.
- **Recipes**: ingredients + servings → per-serving nutrition; a saved recipe becomes a normal food you can log or plan.
- **Weekly nutrients**: daily average protein / fibre / carbs / fat vs target, with a tip when something runs low.
- **Plateau check**: warns when the scale hasn't moved for ~2-3 weeks (never suggests going below the safe calorie floor).
- **Dietitian report (PDF)** and **weekly summary email** (opt-in, Monday) under Profile → Reports & emails.
- Server: new routes `/api/meal-plans`, `/api/recipes`, `/api/foods/parse`, `/api/foods/suggest`, `/api/progress/plateau`,
  `/api/progress/weekly/email`, `/api/account/report.pdf`, `/api/widget/summary`. `npm run send-weekly` can run as a cron job;
  the in-process scheduler can be disabled with WEEKLY_EMAIL_SCHEDULER=false.

---

# v8.2 — fibre, and move food between meals (web)

- **Macros card:** Fibre now sits directly under Fat (target = 14 g per 1,000 kcal, same as mobile).
- **Food log:** every entry has a "Move to…" menu, so breakfast food can go to lunch, dinner or snacks. Calories and macros are kept; meal totals update.

---

# v8.1 — one number, one place (web)

The dashboard showed calories 3 times, steps 3 times, weight 2 times. Now each number appears once:
- **Hero card:** greeting, coach line, calorie ring (left · eaten · budget · activity), water / steps / exercise rings, quick actions (Food · +250 ml water · Workout · Steps), streak chip.
- **Macros card:** protein / carbs / fat (the only place protein appears). **Weight card:** current weight plus goal progress in ONE card.
- **Your calorie plan:** collapsed; open for the maths.
- Removed: the repeated Calories / Protein / Calories-burned / Steps / Water cards and the second weight card.
- Wide screens use two columns; phones stack. Reduced-motion and dark mode supported.
New: `components/DashboardHero.jsx`, `MacroCard.jsx`, `utils/coach.js` (same logic as mobile).

---

# v8 — what changed (web)

**Calories now match the mobile app.** `client/src/utils/energy.js` is the same model as `server/lib/energy.js` and the
mobile `energy.ts` (shared `energy-fixtures.json`; `server/test/energy_parity.test.js` fails the build if they ever differ).
The Profile page lets you choose Auto or "My own number" and a pace; the dashboard, Calorie card, Food page and Profile all show
the same target. (The old Profile page used a separate BMR formula and ignored pace.)

**Google sign-in with the same email opens your existing account**, including other spellings of one Gmail address
(`server/lib/emailMatch.js`). Saved dashboard data is tied to the signed-in email.

**Offline support:** installable app (manifest, icons), service worker caches the app shell so the site opens offline,
pages show the last saved data offline, and new water / food / exercise / steps / weight / task / habit-log entries made
offline are saved on the device and sent automatically when you're back (no duplicates). A banner shows offline / waiting / synced.
Editing or deleting offline is refused with a clear message (not queued).

**UI:** `client/src/styles/redesign.css` (loaded last): readable muted text, 44px touch targets, visible keyboard focus,
notch-safe layout, phone layout, reduced-motion support, cleaner calorie card.

Tests: `cd server && npm test`.

---

