# MyDailyOS Backend

Express + MongoDB + JWT authentication API.

## Local development

```bash
npm install
npm run dev
```

Create `.env` from `.env.example` and set:

```env
MONGO_URI=your-mongodb-uri
JWT_SECRET=your-long-random-secret
CLIENT_URL=http://localhost:5173
```

## Render

Use the `server` directory as the Render Root Directory.

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

Do not manually set `PORT`; Render supplies it automatically.

Required Render environment variables:

```text
MONGO_URI=your-mongodb-uri
JWT_SECRET=your-long-random-secret
CLIENT_URL=https://mydailyos.vercel.app
```

`CLIENT_URL` can contain multiple comma-separated origins if needed, for example:

```text
https://mydailyos.vercel.app,https://mydailyos-lv0ofq8hf-sumanths-projects-d0a44123.vercel.app
```

## Verification endpoints

After deployment, open:

- `/api/health` — confirms the API is running.
- `/api/version` — confirms the deployed authenticated backend version.

Authentication endpoints:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/account/me`
- `DELETE /api/account/me`
