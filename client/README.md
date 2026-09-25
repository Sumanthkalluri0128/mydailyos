# MyDailyOS Web Client

## Environment variable

Vercel Production environment variable:

```text
API_URL=https://mydailyos.onrender.com
```

The Vite config explicitly exposes `API_URL` to the browser. The client also removes trailing `/` characters from the API URL.

## Authentication

All authenticated API calls use `src/config/api.js`, which reads the current JWT from `localStorage` and sends it as:

```text
Authorization: Bearer <token>
```

This is intentionally explicit instead of monkey-patching `window.fetch`, so dashboard and page requests consistently include the authentication token.
