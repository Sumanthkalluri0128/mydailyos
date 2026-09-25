# MyDailyOS deployment

## Render backend

Repository: `Sumankalluri0128/mydailyos`

Root Directory:

```text
server
```

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Environment variables:

```text
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<stable long random secret>
CLIENT_URL=https://mydailyos.vercel.app
```

Do not manually set `PORT`.

After deploy, verify:

```text
https://mydailyos.onrender.com/api/version
```

Expected version:

```json
{"success":true,"version":"2.1.0-auth","service":"MyDailyOS API"}
```

## Vercel frontend

Root Directory:

```text
client
```

Framework: Vite

Build Command:

```text
npm run build
```

Output Directory:

```text
dist
```

Production environment variable:

```text
API_URL=https://mydailyos.onrender.com
```

No `VITE_API_URL` variable is required.

## Authentication note

The web client sends the JWT explicitly on every authenticated API request. After signup/login the token is saved to `localStorage`, and the dashboard immediately uses it without requiring a page refresh.
