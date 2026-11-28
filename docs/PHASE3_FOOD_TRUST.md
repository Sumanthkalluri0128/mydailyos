# Phase 3 / Section D: food data accuracy and trust
Server: `lib/micro.js` (rules), `lib/microData.js` (loads logs), `data/rdaIcmrNin.json`, `data/foodMicros.json` (empty reviewed overlay) and `foodMicros.template.csv` (762 foods to fill),
`scripts/importMicros.js` (`--import` needs a source, `--check`), `scripts/auditFoods.js` (also audits micros), `models/FoodReport.js`, `routes/adminRoutes.js` (`ADMIN_EMAILS`),
`GET /api/progress/micro`, `/micro/weekly`, `microInsights` in `/api/progress/coach`, `POST /api/foods/:id/report`. Foods list now returns `micros`, `microSource`, `confidence`.
Web: `MicroCard`, `FoodTrust`, micro inputs in `FoodForm`, insights in `WeeklyCoach`. Mobile: same, in `components/MicroCard.tsx`, `FoodTrust.tsx`, food editor, weekly screen.
To do by you: verify the RDA numbers, fill the overlay from IFCT/USDA through the CSV, set `ADMIN_EMAILS`.
