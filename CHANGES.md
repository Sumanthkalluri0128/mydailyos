# v15.1 - hover images removed

- Characters no longer greet/wave when the pointer moves over them and no longer show a name tooltip (`Roamers.jsx`).
- Mascot hover "pop" animation removed (`fun.css`).

---

# v15 - 3D characters

The roaming characters, `Buddy` and `BuddyStage` are now physical 3D figures instead of flat stickers.

- `client/src/motion/Slab.jsx` + `slab.css` (new): stacks each sprite in layers inside a CSS 3D scene. Front/back = art, middle = dark edge silhouette (`public/chars/walls/`). Turns around through edge-on, leans 3/4 toward travel direction, idle sway, tilts toward the pointer. Honors `ff-calm` and prefers-reduced-motion.
- `Roamers.jsx` / `roamers.css`: figures use Slab; flat drop-shadow replaced by a contact shadow + a silhouette shadow cast on the floor that stays down while jumping. Power-up glow is now a halo (a CSS filter would flatten the 3D scene).
- All sprites re-baked with bevel lighting (`tools/bake3d.py`, originals in `tools/chars-src/`). Re-bake: `python3 tools/bake3d.py tools/chars-src client/public/chars` (also writes `chars/walls/`). Cache-bust bumped to `?v=16`.
- Fix: `BuddyStage` lookup tables lacked goku/gojo (would crash on those days). It is currently unused.

# v8.7 — your characters, one per day, plus a fighting / dancing stage

- **Characters** (Zoro, Naruto, Luffy, Jin-Woo) replace the bean and the anime-hair version everywhere `Buddy` is used (toasts, empty states, page headers, quick actions).
  **One character hosts each day**: Sun Zoro, Mon Naruto, Tue Luffy, Wed Jin-Woo, Thu Zoro, Fri Naruto, Sat Luffy (`chars` file). Pin one with `who="naruto"`.
- Naruto and Luffy have 7 poses, so scenes they don't have (plan, chart, health, chef, habit, cheer, wave) borrow the closest pose.
- **Stage** (`BuddyStage`) between sections on the dashboard / home: today's character plus a random rival. Every few seconds they fight (charge, clash, POW!, retreat),
  dance (hop, sway, flip, music notes) or hang out. Tap the stage to start a fight or a dance.
- Pictures live in `client/public/chars`. Calm mode / "Reduce motion" show still pictures.

---

# v8.6 — anime-style cast + animated world (web)

- **New characters**: Flex is now an original anime-style character with spiky hair, big glossy eyes that blink and twinkle, and swaying hair. Every screen has its own look
  (hair and eye colour change per scene: Exercise is a fiery orange lifter, Water is a blue-haired sipper, Recipes an orange chef, and so on). Same props: `<Buddy scene="lift" />`.
- **Animated backdrop** (`motion/FunBackdrop.jsx`): drifting aurora glow, falling sakura petals, twinkling stars, shooting stars.
- **Livelier UI** (`motion/fun.css`): glass cards that rise in one after another and lift on hover, gradient buttons with a shine sweep, gradient headings, mascot pop on hover.
- **Fun motion is now the default.** For the calmer look: `localStorage.setItem("ff_calm_motion","1")` and reload. "Reduce motion" phones still get a still page.

---

# v8.5 — characters instead of effects (web)

- **Flex, a little bean mascot**, now acts out every feature (`client/src/motion/Buddy.jsx`): lifts dumbbells when you open **Exercise**, sips water on **Water**,
  eats an apple on **Log Food**, steps on the scale on **Weight**, walks on **Steps**, checks off a clipboard on **Tasks**, flexes next to a flame on **Habits**,
  cooks on **Recipes**, plans on a calendar in the **Planner**, points at a growing chart in **Progress**, waves on **Profile**.
- **Disappointed Flex** (grey, under a rain cloud) shows when nothing is logged: no exercise, water, weight, food, habits. On the dashboard he appears
  if it's after 5 pm and you haven't worked out; he cheers when the exercise goal is met, sips when water is low, eats when breakfast is missing.
- **Toasts** show a matching character (cheering, drinking, lifting…; sad on errors) instead of a tick.
- **Tap marker**: a dot and ring appear exactly where you click or touch (`motion/tapMarker.js`).
- **Quick actions** on the dashboard use small moving characters instead of emoji.
- **Calm mode**: the older decorative effects (confetti, count-up numbers, page slide-in, shimmer, ring pop, flame flicker, button ripples) are switched off.
  To bring them back: `localStorage.setItem("ff_classic_motion","1")` and reload. Phones set to "Reduce motion" show still characters.

---

# v8.4 — speed, wake-up, accurate targets, a real weekly email (server 2.9.0)

**Speed & wake-up**
- The server now starts answering immediately and connects to the database in the background (before, it waited for the
  database *and* index building, so health checks and the apps' wake-up pings queued behind them).
- "Waking up the server…" banner + an instant warm-up ping when the app opens. Keep-alive options in `docs/KEEP_AWAKE.md`
  (a GitHub Actions workflow is included; UptimeRobot recommended).
- Catalogue foods are cached in memory for "type what you ate" and suggestions (one read instead of one per request).
- Other pages' code is prefetched when the browser is idle; moving a food between meals is instant; stale search answers are ignored.

**Calculations** — see `docs/CALCULATIONS.md`
- A lose goal can no longer be set above maintenance for small, low-activity people.
- Computed protein is capped at 35 % of calories (your own protein target is still respected).
- New sugar guide and sodium ceiling (sodium only when foods carry sodium data). New fixtures + tests in server, web and mobile.
- `npm run audit-foods` checks the whole catalogue for internal consistency (0 issues in 484 foods; now a permanent test).

**Weekly email, redesigned** — responsive HTML (plain-text fallback): week score, stat tiles, daily-calorie bars, goal streaks,
nutrient bars, weight/plateau note, best day, one tip, "Open FlexFit" button, one-click unsubscribe (`/api/email/unsubscribe`).
Set `PUBLIC_API_URL` (Render sets `RENDER_EXTERNAL_URL` itself) and `CLIENT_URL` so the links work. `npm run preview-email`
writes `docs/email-preview.html`.

**New features** — Eating-out estimates (with an optional range), recipe sharing, sugar/sodium rows, 7-day calorie strip,
meal colour accents, drag-and-drop between meals. Widgets were removed.

---

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
  `/api/progress/weekly/email`, `/api/account/report.pdf`. `npm run send-weekly` can run as a cron job;
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

