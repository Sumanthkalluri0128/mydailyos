# FlexFit Mobile Sync / Progress Update

## Mobile
Replace your existing `src` folder with `mobile/src` from this package.

The mobile update adds:
- Weight history with a trend graph.
- Daily / weekly / monthly graph granularity.
- 7D / 14D / 30D / 90D / 1Y range presets.
- Custom From / To date range.
- Daily calorie, protein, water, exercise-minute and calories-burned graphs.
- Daily history with selected-date details.
- A dedicated History tab for food, exercise, water, weight, tasks and habits.
- Pull-to-refresh across progress/history/weight.
- Existing JWT/SecureStore authentication preserved.
- Existing notification/confirmation system preserved.

Do NOT replace your upgraded SDK 57 package.json or node_modules with the old package from earlier archives.

After replacing `src`:
```bash
npx expo start -c
```

## Backend
The mobile graphs require the new authenticated endpoint:
`GET /api/progress/history?from=YYYY-MM-DD&to=YYYY-MM-DD`

Replace:
- `backend/routes/progressRoutes.js` -> your backend `routes/progressRoutes.js`
- `backend/routes/weightRoutes.js` -> your backend `routes/weightRoutes.js`
- merge the `/api/progress` import/mount from `backend/server.js` into your deployed server.

Then deploy the backend to Render.

The progress endpoint returns one row per day and keeps the user's data isolated by JWT userId. It aggregates food nutrition, exercise, water, weight, tasks and habits.

The weight route also makes saving today's weight idempotent for the same user/date, so repeated saves update that day's entry instead of creating duplicate daily records.
