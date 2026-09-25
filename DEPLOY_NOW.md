# MyDailyOS — Deployment Checklist

## 1. Vercel

Vercel Project: `mydailyos`

Set **Root Directory** to:

```text
mydailyos/client
```

Production environment variable:

```text
API_URL=https://mydailyos.onrender.com
```

Do not create or use `VITE_API_URL`.

Redeploy after changing the environment variable.

## 2. Render

Render Web Service: `mydailyos`

Set **Root Directory** to:

```text
mydailyos/server
```

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Required environment variables:

```text
MONGO_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<your long random JWT secret>
CLIENT_URL=https://mydailyos.vercel.app
```

Do not manually set `PORT`.

If you also need the old Vercel preview domain, `CLIENT_URL` can contain comma-separated origins.

## 3. Force a fresh Render deployment

The screenshot showed the live Render service on an older commit while the uploaded source already contains `/api/auth/signup`.

After pushing this corrected source to the GitHub repository connected to Render, use **Manual Deploy → Deploy latest commit**.

## 4. Verify Render before testing signup

Open:

```text
https://mydailyos.onrender.com/api/health
```

Expected:

```json
{
  "success": true,
  "status": "healthy",
  "service": "MyDailyOS API"
}
```

Then open:

```text
https://mydailyos.onrender.com/api/version
```

Expected:

```json
{
  "success": true,
  "version": "2.1.0-auth",
  "service": "MyDailyOS API"
}
```

Only after `/api/version` returns `2.1.0-auth` should you test signup.

## 5. Test signup

The browser should call:

```text
POST https://mydailyos.onrender.com/api/auth/signup
```

The corrected backend registers that route.
