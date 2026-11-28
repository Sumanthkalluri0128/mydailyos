# FlexFit v26 — 12 dashboard scenes

Includes all twelve selectable themes and automatic daily rotation, using local calendar date. Existing backend and data are untouched. The background images are concept-art crops from the approved theme collection, and can be replaced with higher-resolution individual wallpapers later.

## Run
1. `cd client`
2. `npm install`
3. `npm run build`
4. `npm run dev`
5. Select a theme from the 🎨 dropdown in the top bar.
6. Choose **Auto · changes daily** to return to automatic rotation.

## Deploy
Push the updated project to the Git repository connected to Vercel. Keep the existing environment variables and backend settings. The new artwork lives in `client/public/theme-scenes`.

The existing light/dark toggle is still available. Scene selection is saved only in localStorage, not the user database.
