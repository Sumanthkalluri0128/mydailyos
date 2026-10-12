# FlexFit daily anime dashboard themes

## What's changed
- Added a Theme button in the dashboard header.
- Added daily automatic rotation based on the user's local calendar date, including when the app remains open across midnight.
- Added manual theme lock; choosing a theme automatically locks it until Auto-rotate daily is selected again.
- The profile's existing `sex` field selects a visual collection:
  - Female: Calm & Cozy, Scenic & Peaceful, Energetic & Fun, Minimal Productive.
  - Male: Dark Anime, Anime Gym, Adventure Journey, Minimal Modern.
  - Unset/other: all available themes.
- All theme artwork accents use male anime chibi assets already present under `client/public/chars`.
- Added theme-specific backgrounds/card styling and a subtle male anime character illustration in the dashboard hero.
- Theme preferences are stored in browser localStorage under `flexfit_dashboard_theme_mode_v1` and `flexfit_dashboard_theme_manual_v1`.

## Data safety
This change is frontend presentation only. It does not change API routes, MongoDB models, nutrition records, water logs, weight history, activities, habits, tasks, authentication, or profile data structure. The gender/sex choice is read from the existing profile field and does not change any health calculations.

## Run locally
1. Unzip this project.
2. Open a terminal in `client`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL Vite prints.
6. Use **Theme** in the header to switch between daily rotation and a manually locked theme.

## Deploy
Commit and push the updated project to the same repository connected to Vercel. Keep the existing project root/build settings unchanged (the client folder is the frontend project). Vercel should rebuild the frontend. No backend redeploy or database migration is needed for theme rotation.
