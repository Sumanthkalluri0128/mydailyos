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

