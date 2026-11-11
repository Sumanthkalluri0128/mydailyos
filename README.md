# v33 (web + server)
- Server (shared by web and mobile): lib/smartPlan.js (balanced planner), lib/intakeAdvice.js + lib/planAdvice.js (lighter days after heavy days),
  new routes GET /api/meal-plans/context, POST /api/meal-plans/clear, GET /:id/alternatives, POST /:id/swap; /api/plan/over-days returns `advice`;
  POST /api/meal-plans/auto takes mode ('balanced' | 'mine'), diet, variant. MealPlan stores carbohydrates, fat, role.
- Web: hero slower with no dots, no separate Ask buttons (the floating character opens the chat), new planner UI, go-lighter banner.

# FlexFit — Complete Source

This is the cleaned, corrected source for the FlexFit web app, backend, and mobile app.

## Project layout

- `client/` — React + Vite web app
- `server/` — Express + MongoDB + JWT API
- `FlexFitMobile/` — Expo React Native app

## Important environment variable naming

The web frontend uses exactly:

```text
API_URL
```

It does **not** use `VITE_API_URL`.

### Vercel

Set:

```text
API_URL=https://mydailyos-268d.onrender.com
```

### Local web development

Create `client/.env.local`:

```text
API_URL=http://127.0.0.1:5001
```

### Render

Set these backend variables:

```text
MONGO_URI=your-mongodb-uri
JWT_SECRET=your-long-random-secret
CLIENT_URL=https://mydailyos.vercel.app
```

Use `server` as Render Root Directory, `npm install` as Build Command, and `npm start` as Start Command.

## Authentication

The web and mobile apps use the same backend account system. Web tokens are stored in `localStorage`; mobile tokens are stored in Expo SecureStore.

## Deployment verification

After Render redeploys, check:

```text
https://mydailyos-268d.onrender.com/api/health
https://mydailyos-268d.onrender.com/api/version
```

`/api/version` should return `2.1.0-auth`.

Then the web signup request should reach:

```text
POST https://mydailyos-268d.onrender.com/api/auth/signup
```

The backend now returns JSON for unknown `/api/*` routes, so an HTML `<!DOCTYPE ...>` response should no longer occur from this source.

## Security

No real `.env` file or database password is included in this cleaned source package. Set secrets only in your local ignored `.env` files or deployment environment settings.

# v63 (web + server + mobile): daily coach
- Server: lib/dailyCoach.js (pure) + lib/dailyCoachData.js; GET /api/coach/day-guide, GET /api/coach/entry-check, GET /api/coach/activity-level.
- Activity level: Profile.activityMode ('auto' default | 'manual') + Profile.autoActivity. Auto = yesterday's steps and training; the calorie TARGET level
  only moves after 2 days in a row agree (energy.activityLevelOf, mirrored in the web and mobile energy files and pinned by the shared fixtures).
- Heavy day (+500 kcal over budget) / cheat day (+1000): scale ignored for the next days, 3 recovery days (no fasting, steps +2,000), never a cut.
- Missed training / no-activity day: explained, never punished; 4+ days off lowers the first loads.
- Entry feedback while logging food (EntryCheck) and "what am I?" (DayGuideCard: Automatic / I choose, with a switch suggestion).

# v64: the weekly decision + one safe minimum
- Server: lib/weeklyDecision.js; GET /api/coach/weekly (once a week, cached), POST /api/coach/weekly/apply. Reads 2 weeks of weigh-ins, food, steps and
  training and changes ONE thing at a time: under-eating > too little data > too fast > adherence > on track (ladder resets) > heavy days /
  missed training / low steps (explained, never cut) > ladder: wait, steps +1,500, incline walk, -100 kcal (carbs), 7-day diet break, reassess.
  A suggestion only advances the ladder when you tap Apply; 10-day cool-down; a planned diet break after 8 weeks in a deficit.
- Profile.goals.calorieFloor + energy.calorieFloorOf (server, web, mobile; pinned by the shared fixtures): every engine reads ONE safe minimum.
- Entry check: evening protein nudge. Home: WeeklyDecisionCard. Today's coach card: "Safe minimum" control.
