# MyDailyOS Web

React + Vite web client.

## Local development

```bash
npm install
npm run dev
```

Create `.env.local`:

```env
API_URL=http://127.0.0.1:5001
```

## Vercel

Set this Production environment variable in Vercel:

```text
API_URL=https://mydailyos.onrender.com
```

The Vite configuration explicitly exposes `API_URL` to the browser. No `VITE_API_URL` variable is used.

## Build

```bash
npm run build
```
