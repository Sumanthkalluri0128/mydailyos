# Phase 3 / Section G: coaching and insights, part 1

All rules are in `server/lib/coachG.js` (pure, tested with fixtures in `server/test/coachG.unit.test.js`); routes are under `/api/coach`.

1. **Rough day** (Home, one tap): three tiny actions (log one meal, some water, 10 minutes' walk). Streak is kept when at least one is done. Off automatically the next day. Mobile also cuts reminders that day (no motivation quotes, at most 2 water reminders).
2. **Side quests**: one 7-day experiment at a time, picked from the coach's weakest area, never the same one twice running. Checked automatically from logs where data exists (breakfast protein, steps/exercise, water, snack calories, logging, sleep); other days can be ticked by hand. 5 of 7 days earns a sticker. Result and before/after (only with 3+ data days each side) show next week.
3. **Scale jump explainer** (Weight page): a weigh-in 0.8 kg or more from the trend line, with cautious reasons from logs (salt, carbs, big meals, steps, short sleep). Needs 4 weigh-ins in a month. Cycle tracking is NOT in the app, so cycle is not used as a reason.
4. **Sleep and eating**: shown only with 5 days after under 6 h of sleep and 5 days after more; otherwise it states the minimum. Sleep logged on a date is matched to that date's food.
5. **Goal-date range**: regression on the last 28 days (at least 5 weigh-ins over 14 days); an 80% range from the slope's uncertainty; the later end can be open-ended. Shown as a cone with a labelled goal line on the Weight page.
6. **Coach that learns**: taps on "I'll try this" (and shown counts) re-rank weekly tips. Smoothed, bounded (0.6x to 1.4x), per user, resettable in Profile. Fix my day ordering is not re-ranked yet.
7. **Treat allowance**: weekly kcal set aside inside the weekly budget; "I had a treat" logs it as food and counts it against the allowance. Going over only says the rest comes from the regular budget.

Limits: nothing was built or run here (no npm registry). Re-ranking applies to weekly tips only. Run `npm run build` / `npm test` (web), `npx tsc --noEmit` / `npx jest` (mobile).
