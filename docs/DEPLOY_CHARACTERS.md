# FlexFit: floating character feature and deploy

## Add a character
1. Put the .glb in `client/public/models/` (keep it under ~5 MB; a rigged or textured model is best).
2. Add one line to `CHARACTERS` in `client/src/motion/FloatingAsta.jsx`:
   `{ id: "mychar", name: "My Character", src: "/models/mychar.glb" }`
3. Models with the same bone names as `goku-rigged.glb` (Hips, Shoulder_L, Knee_R ...) get real limb animation.
   Any other model works too and moves as a whole body.
Users can also tap the ⇄ button and use "+ Add .glb" to try a model for the current session.

## Deploy (GitHub -> Render + Vercel)
1. Push this folder to your GitHub repo.
2. Backend on Render: root `server`, build `npm install`, start `npm start`.
   Env: `MONGO_URI`, `JWT_SECRET` (long random string), `CLIENT_URL=https://<your-vercel-domain>`. Do not set `PORT`.
   Check `https://<render-domain>/api/health`.
3. Frontend on Vercel: root `client`, framework Vite, build `npm run build`, output `dist`.
   Env: `API_URL=https://<render-domain>`  (exactly `API_URL`, not `VITE_API_URL`).
4. Redeploy the frontend after setting `API_URL`, then open the site: the character floats bottom-right.

## Run locally
- `server/`: copy `.env.example` to `.env`, fill it in, `npm install`, `npm start`
- `client/`: `.env.local` with `API_URL=http://127.0.0.1:5001`, `npm install`, `npm run dev`
