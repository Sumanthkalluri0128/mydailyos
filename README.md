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
API_URL=https://mydailyos.onrender.com
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
https://mydailyos.onrender.com/api/health
https://mydailyos.onrender.com/api/version
```

`/api/version` should return `2.1.0-auth`.

Then the web signup request should reach:

```text
POST https://mydailyos.onrender.com/api/auth/signup
```

The backend now returns JSON for unknown `/api/*` routes, so an HTML `<!DOCTYPE ...>` response should no longer occur from this source.

## Security

No real `.env` file or database password is included in this cleaned source package. Set secrets only in your local ignored `.env` files or deployment environment settings.
