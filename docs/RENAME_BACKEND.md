# Renaming the backend from `mydailyos.onrender.com` to a FlexFit URL

The API code has no hardcoded name in it — both apps read the backend URL from configuration —
so this is a Render + deployment change, not a code change. Steps:

## 1. Rename the Render service

`render.yaml` now names the service `flexfit-api` (was `mydailyos`). If the service already
exists on Render, `render.yaml`'s `name` is only used when the service is first created via Blueprint —
renaming an existing service still needs the manual step below (Render doesn't rename services from
a blueprint diff, to avoid surprising URL changes):

1. Render dashboard → the `mydailyos` web service → **Settings** → **Name**.
2. Rename it to `flexfit-api` (matching `render.yaml`). Render will change its default URL to
   `https://flexfit-api.onrender.com` (or similar — Render shows you the exact new URL).
3. Optional: add a custom domain (e.g. `api.flexfit.app`) under **Settings → Custom Domains**,
   which is the cleanest long-term option and avoids being tied to Render's naming at all.
4. Trigger a redeploy (Render usually does this automatically after a settings change; if not,
   use **Manual Deploy → Deploy latest commit**).

## 2. Update the web client

`web/client` reads the API base from `import.meta.env.API_URL` (see `web/client/src/config.js`,
which falls back to the old Render URL if unset). Set `API_URL` in `web/client/.env`
(see `.env.example`) to the new URL, then rebuild/redeploy the client (Vercel/Netlify/etc —
whatever the client is hosted on).

## 3. Update the mobile app

The mobile app already reads the URL from configuration (`src/config/api.ts`), defaulting to the
old Render URL only if nothing else is set:

- **Local development:** copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the new URL.
- **EAS builds:** `eas.json` sets `EXPO_PUBLIC_API_URL` for the `preview` and `production` build
  profiles — update both to the new URL, or override per-build with
  `eas build --profile production --env EXPO_PUBLIC_API_URL=https://your-new-url`.
- Any app already installed on a device will keep using the old URL until it's rebuilt and
  resubmitted (the URL is baked in at build time, like any other Expo public env var) — so keep
  the old Render service alive and responding until the new build has rolled out.

## 4. Update `web/server/.env.example` / `CLIENT_URL`

If the web client's own domain changes too, update `CLIENT_URL` in the server's environment
(Render → the API service → **Environment**) so CORS allows the new client origin.

## 5. Verify

- `curl https://<new-url>/api/health` returns `{"success":true,"status":"healthy",...}`.
- Log in from a fresh build of the mobile app and confirm requests hit the new URL (check the
  Render logs for the new service, or a proxy/network inspector).
