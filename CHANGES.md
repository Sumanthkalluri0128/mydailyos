# v35 - Phase 2: the meal planner shows what you logged and plans around it (web + server)
- **Server**: new `GET /api/meal-plans/view` (logged + planned merged, day budget like Home, add-ons, chef hints); lib/dayView.js. `/auto` skips past days, uses Home's budget today, treats logged food as fixed and returns `fixed` and `addOns`. Rescue day respects logged meals.
- **No double counting**: MealPlan.logId pairs a plan row with its FoodLog; logging is idempotent; a food logged by hand marks the matching plan done; `Log day` skips logged items. Fixed an old bug where eaten plan rows were counted on top of their logs when planning.
- `POST /api/meal-plans` is idempotent by clientId and can plan a new healthy food by name. Plans cannot be created in the past.
- **Web**: planner shows Logged / Planned / Suggested, day bar, chef (hungry empty meals, victory on a complete day); offline queue now accepts plan logging and add-to-plan, shown before sync.
- Migration: none (new optional fields logId, clientId).
- Tests: server/test/dayView.unit.test.js, client/src/utils/mealView.test.js
---

# v34 - Phase 1: calm Home, cut-off stickers removed, weight blurred until tapped (web + server)
- **Weekly review card** always starts collapsed (slim line with the character's face, smooth open/close, no saved state).
- **Home**: sliding hero images, the blurred scene banner and all auto-advance timers removed. Static hero card with ONE character and one line of the day (changes once per day). Deleted HeroCarousel, MotivationCarousel (unused), home/scenes.js and the matching CSS.
- **Stickers**: tools/stickers/audit_stickers.py (Pillow) flags cut-off / tiny / mostly-empty stickers and writes client/src/motion/stickerBlocklist.json; manifest and server/data/stickerCatalog.json pruned (goku/lift-0, jinwoo/peace-0, tanjiro/chill-1); chars.js filters at runtime.
- **Layout**: corner stickers use container queries and disappear instead of being cropped or covering the plus button; the nutrition, habit and task cards no longer carry a corner sticker over their rows and inputs; the Progress card reserves space for its sticker.
- **WeightReveal** on Home, Weight page, trend chart, Goals, North Star, fat-loss card, Progress, Profile, Insights, Weekly coach. Blurred by default, tap to reveal with dissolve, roll-up, accent glow, buzz and a tiny character; re-blurs after 8 s, when the tab is hidden or when you leave the page.
- "Hide numbers" is now "Hide calorie numbers". Character lines no longer contain weight numbers.
- No server routes or calculations changed. No new environment variables, no migrations.

---

