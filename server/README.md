# MyDailyOS — Complete End-to-End Source

This package contains the complete MyDailyOS web app, authenticated backend, MongoDB models/routes, and mobile Expo app.

## Project structure

- `backend/` — Express + MongoDB API with JWT authentication
- `web/` — React + Vite web app
- `mobile/` — Expo + React Native mobile app

## Backend

1. Open `backend/`.
2. Run `npm install`.
3. Create `.env` from `.env.example`.
4. Set `MONGO_URI`, `JWT_SECRET`, and optionally `CLIENT_URL`.
5. Local: `npm run dev`.
6. Production: `npm start`.

The backend listens on Render's `PORT` when deployed and `5001` locally.

## Web

1. Open `web/`.
2. Run `npm install`.
3. Create `.env.local`:

```env
VITE_API_URL=http://127.0.0.1:5001
```

For Vercel use:

```env
VITE_API_URL=https://mydailyos.onrender.com
```

4. Run `npm run dev`.

## Mobile

1. Open `mobile/`.
2. Run `npm install`.
3. Run `npx expo start -c`.

The mobile API is configured for `https://mydailyos.onrender.com` in `mobile/src/config/api.ts`.

## Authentication

The same account works across web and mobile. JWT tokens are stored in:

- Web: `localStorage`
- Mobile: Expo SecureStore

Existing legacy personal records without `userId` are attached to the first account created. New accounts receive isolated personal data.

## Important

Back up MongoDB Atlas before deploying the authentication migration. Do not commit real `.env` files or JWT secrets.
