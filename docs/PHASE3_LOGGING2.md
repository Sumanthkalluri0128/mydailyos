# Phase 3 / Section F: faster food logging, part 2

What it does (web v41, mobile v37, server):
- **Will this fit?** now also says how much protein is still to go today.
- **What can I cook?** Tick what is at home; ideas come from your recipes, then your own foods, then the catalogue. Foods you avoid and allergens never appear. The pantry is kept on the device only.
- **Glycemic tag**: Low / Medium / High per serving, only for foods in `server/data/glycemic.json`. A pairing tip (e.g. add curd or dal) shows for those foods. Optional "Diabetes-friendly view" lists low-load foods first; stored on the device only, with a doctor's-advice note.
- **Import from another app**: CSV of food logs or weights. Columns are detected by header name, you can correct them, a dry run shows what will be saved, repeat imports add nothing, dates default to day/month with a warning when ambiguous, pounds become kg.
- **Tomorrow's lunch**: canteen favourites (your own numbers) and recent lunches go into the planner in one tap. Mobile has an optional evening reminder (off by default, follows quiet hours and the daily cap, skipped when lunch is already planned). Web shows an in-app prompt after 17:00.
- **Grocery list**: grouped by aisle, tick-off (kept on device, works offline from the last loaded list), "I already have it", share as text.

Honest limits
- GI values are published averages (Atkinson et al. 2021, 2008) but are marked `verified: false`; check them against the source before relying on them. Foods without a value show nothing.
- Export header formats of MyFitnessPal/HealthifyMe could not be verified here, so detection is by synonyms plus the mapping screen. cult.fit offers no export we could find; the screen says so.
- Nothing was built or run here (no npm registry). Run `npm run build` and `npm test` (web), `npx tsc --noEmit` and `npx jest` (mobile). Mobile file picking uses `expo-document-picker` if installed (`npx expo install expo-document-picker`); otherwise paste the CSV text.
