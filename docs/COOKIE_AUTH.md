# Sign-in cookie (token out of localStorage)

Today the website keeps your sign-in token in `localStorage`, where any script running on the page (for example a compromised library) can read it.
Cookie mode keeps it in an **httpOnly cookie** instead: page scripts cannot read it. It is OFF by default, and the phone is not affected (it keeps its Authorization header).

## How it works
- Server (`COOKIE_AUTH=1`): login/sign-up/Google sign-in set `mdos_session` (httpOnly) and `mdos_csrf` (readable). Every write that relies on the cookie must send `X-CSRF-Token` equal to `mdos_csrf` and, if the browser sends an Origin, it must be one of your allowed origins. The cookie is renewed when used after 24 hours; idle for 14 days = signed out.
- Website (`VITE_COOKIE_AUTH=1`): `src/auth/session.js` keeps only a harmless "signed in" marker. API calls go to `/api/...` on the SAME address as the page; `client/vercel.json` forwards them to your server, so the cookie is first-party (cross-site cookies are blocked by Safari and others).
- Google sign-in on the website: the redirect carries a 60-second one-time code (never the real token), swapped for the cookie by `POST /api/auth/exchange`.
- Sign out calls `POST /api/auth/logout` so the server removes the cookie.

## Turn it on (in this order)
1. Server env on Render: `COOKIE_AUTH=1`. (Safe by itself: nothing changes until the website asks for cookies.) Make sure `ALLOWED_ORIGINS` contains your Vercel address.
2. Check `client/vercel.json`: the `/api/:path*` rewrite must point at YOUR server address.
3. Vercel env: `VITE_COOKIE_AUTH=1`, then redeploy the website.
4. Everyone signs in once more (the old localStorage token is ignored in cookie mode). Check: sign in, reload, log food, sign out, sign in with Google.

## Turn it off
Remove `VITE_COOKIE_AUTH` on Vercel and redeploy. People sign in once more.

## Good to know
- If you ever host the API on a different site WITHOUT the rewrite, set `COOKIE_SAMESITE=none` on the server (cookies then need HTTPS and some browsers will still block them). The rewrite is the reliable way.
- Tokens still last up to 30 days for the phone. The cookie session is shorter (14 days, renewed on use).
- This protects the token from being read. It does not make injected scripts harmless (they could still act as you while the page is open), so the Content-Security-Policy in `vercel.json` stays important.
