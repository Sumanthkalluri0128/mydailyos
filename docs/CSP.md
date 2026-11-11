# Content-Security-Policy (web client)
Set in `web/client/vercel.json`. If you change the API address (`API_URL`), add the same origin to `connect-src`, or the browser blocks every request.
Allowed on purpose: the API (`mydailyos.onrender.com`), open-meteo (weather), Sentry ingest hosts. Scripts are `'self'` only (no inline scripts, no eval). Styles allow `'unsafe-inline'` because React writes `style=` attributes.
To try a stricter change safely, rename the header to `Content-Security-Policy-Report-Only` first and watch the browser console.
