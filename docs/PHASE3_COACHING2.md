# Phase 3 / Section H: coaching and insights, part 2

Rules: `server/lib/coachH.js` (plate balance, craving swap, festival/travel mode, diet break) and `server/lib/toneLines.js` (all tone copy, written once and sent to both apps by `GET /api/coach/tone`). Tests: `server/test/coachH.unit.test.js` (7) plus mobile `src/utils/__tests__/anchorNudge.test.ts` (5).

8. **Coach tone** (Profile): gentle, strict or funny. Characters, the weekly review headline and (on the phone) meal and tiffin reminders follow it. Funny keeps the existing character lines; gentle and strict use new per-character voices. Every line passes the no-shaming check in the tests. I also reworded three old lines that broke that check ("No excuses!", "Pathetic?", "DON'T SLACK").
9. **Gentle mode**: hides calorie numbers (Home calorie card, over-day card, intake banner, fit preview, weekly budget and maintenance, food logger balance) and shows a plate-balance card and habit ticks instead. It also turns on the existing "hide calorie numbers" setting. A short kind support note is shown, with Tele-MANAS (India, 14416) and a reminder to check the number for your own country. The calorie floor holds in every mode (target is never below 1200 / 1500 kcal and the weekly per-day figure is clamped to it).
10. **Craving timer**: 10 minutes with a breathing circle (4 in, 6 out), then up to 3 swaps from foods you have already logged 2+ times, light and filling. Allergens and avoided foods are filtered out. If nothing fits it says so honestly.
11. **Habit anchors**: "After brushing my teeth" plus an optional time per habit. The phone schedules one reminder at that time, moved out of quiet hours, within the daily cap, and 2 a day at most on a rough day. Web shows the anchor but has no push reminders.
12. **Festival / wedding / trip mode** (Home): choose dates (up to 3 weeks). Each day in the window gets up to 15% more room (10% for trips, capped at 400 kcal), the eating-out safety buffer rises (20-25%), and wording turns supportive. It ends by itself.
13. **Diet break** (Weekly): on a real plateau (4+ weigh-ins, a true deficit) the coach offers an optional maintenance week or a 2-day refeed with its reasoning. Starting it lifts the target to maintenance for that window.

Limits
- Gentle mode hides calories on the main screens listed above, not every place a food's kcal is printed (per-food lines in lists, planner details). A full sweep is still to do.
- Water reminders do not follow the tone yet (meal and tiffin do).
- The India helpline number is from my knowledge, not checked live; please confirm it.
- Nothing was built or run here (no npm registry).
