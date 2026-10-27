# v49 - Phase 3 Section M: platform part 2
- Weekly backup email (opt-in): your data export (JSON + CSV) attached, own one-tap stop link. Mailer now supports attachments on every provider.
- Admin server health page (`#admin`, `ADMIN_EMAILS` only): cold starts, failed syncs, dropped offline writes, errors, keep-alive status.
- Feature flags: per person, allow/deny lists or a percentage; cached on the apps for 6 hours.
- Web tests: `npm test` (101) and a Playwright smoke test (`npm run e2e`). Auth gate decisions moved to `auth/gateLogic.js`.
- Speed: first-load JavaScript 264,967 B to 248,669 B (sign-in pages, setup page, assistant and quick-add now load later).
- Includes your v48 fixes (album `owned` list, GoalsPage). Docs: `docs/PHASE3_PLATFORM2.md`.

# v47 - Phase 3 Section L: platform part 1
- Instant open: "Your last saved day, updated X min ago" strip with the day's character while the saved copy is on screen.
- Hot-day water goal (opt-in, Open-Meteo, shown with the reason; silent offline). Server: device sleep readings never overwrite typed ones; workouts import route `POST /api/activities/import` with duplicate protection; activity logs remember their source and heart rate. Imported entries show "from Samsung Health".
- Docs: `docs/PHASE3_PLATFORM1.md` (free / native-build answers per item, widget and Wear OS plan).

# v46 - Phase 3 Section K: strength and training
- Routines can carry target sets, reps, kg and rest (old duration-only routines still work). Workout mode steps through exercises with sets prefilled from last time, a rest timer and a "power up" scene when a record is beaten. New web Routines screen.
- Estimated 1RM (Epley and Brzycki, formulas shown), beat-last-time hint, best set and volume history, weekly sets per muscle, deload nudge, plate calculator (kg and lb). Muscle groups added to the activity catalogue plus 23 strength moves.
- Beginner training arcs (4, 6 and 8 weeks) with weekly episodes, a rest arc and a +500 steps a week goal capped by your profile.
- Daily workout suggestion with reasons; guided meditate and stretch (3 to 10 minutes, breathing circle, logged as an activity).
- Server: `lib/strength`, `lib/muscles`, `lib/programs`, `lib/workoutSuggest`, `lib/guided`, `lib/workoutBuild`, `routes/trainingRoutes`, `TrainingProgram` model (in export and account deletion). Details: `docs/PHASE3_TRAINING.md`.

# v45 - Phase 3 Section J: UI part 2
- Accessibility: palette checker (`tools/a11y-check.js`) + fixes (status colours, button contrast, orange), large-text mode (web), label fix.
- Measurement trends next to weight; web progress photos (private, IndexedDB) with before/after date slider.
- Medicine and supplement checklist with quiet-hours reminders, in export and deletion.
- Monthly season recap card (made on the device, health numbers opt-in).
- Optional accountability link (one person, chosen fields, revocable, hashed secret).
- Fix: measure-trends path is `/api/health-logs/...`.
- Tests: `a11y` (4), `measurements` (4), `medicines` (5), `wrapped` (5), `shareLink` (4), web `photoCompare` (3), `wrappedCard` (4).

# v44 - Phase 3 Section I: UI part 1
- Simple/advanced mode (server `features.js`, `/api/coach/features`), Profile "Show all features", sensei unlock messages.
- Adaptive Home step (`nextStep.js`, `/api/coach/next-step`) in the existing hero.
- Undo toast replaces single-item delete confirms (food, weight, task, habit, water, exercise, foods, recipes, templates); real confirm kept for bulk/irreversible.
- UI language: Hindi, Telugu, Tamil (first drafts, flagged for review), English fallback, `tools/i18n.js` CSV round trip.
- Ctrl/Cmd+K quick add, `?` shortcuts, wide-screen and tablet CSS.
- Tests: `uiOne.unit.test.js` (6), `undoCore.test.js` (5), `quickCommand.test.js` (4), `i18n.test.js` (4).

# v43 - Phase 3 / Section H: coaching and insights, part 2 (web + server)
- Coach tone (gentle / strict / funny), gentle mode with plate balance and support note, craving timer with swaps from your own foods, habit anchors, festival / wedding / trip mode, optional diet break on a plateau. Weekly per-day figure is never below the calorie floor.
- Fix: the phone app's habit edit used PUT; the server now accepts PUT as well as PATCH.
- Tests: server/test/coachH.unit.test.js (7). Docs: docs/PHASE3_COACHING2.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v42 - Phase 3 / Section G: coaching and insights, part 1 (web + server)
- Rough-day "rest arc", 7-day side quests with sticker, scale-jump explainer, sleep-to-eating link, goal-date range cone, coach that learns (resettable in Profile), weekly treat allowance inside the weekly budget.
- Tests: server/test/coachG.unit.test.js (9). Docs: docs/PHASE3_COACHING1.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v41 - Phase 3 / Section F: faster food logging, part 2 (web + server)
- Fit preview protein line; "What can I cook?"; glycemic tags, pairing tips and diabetes-friendly view (published values only); CSV import with dry run; tomorrow's lunch planner with canteen favourites; grocery list by aisle with tick-off, "have it" and share.
- Tests: server/test/logging2.unit.test.js (15). Docs: docs/PHASE3_LOGGING2.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v40 - Phase 3 / Section E: faster food logging, part 1 (web + server)
- **Copy / repeat**: "Copy yesterday's lunch" and "Same as last time" open a preview with editable amounts before anything is saved. **Select several** foods from search and add them in one tap (`/api/food-logs/bulk`).
- **Voice logging**: Speak button (hidden where the browser has no speech recognition) with English, Hindi, Telugu, Tamil. The heard text goes through the existing meal parser into an editable review. Sticker for the first spoken meal.
- **Shared pot**: "I cooked a pot" (servings and/or total cooked weight), then "I ate" by servings or grams; nutrition scales from the recipe and the pot's servings left go down. Sticker for the first one.
- **Paste ingredients** into a recipe ("2 cups rice, 1 cup toor dal, 2 tbsp oil"): amounts converted to grams, raw rice and dal converted to cooked weight (calories kept), warnings where it had to assume, added-oil line. Nothing guessed: unknown weights are left for you.
- **Portion guides**: drawn katori, roti, ladle, glass and spoon sizes next to the quantity box.
- **Chai and coffee counter**: cups, sugar spoons, milk, cup size; calories from the catalogue's milk and sugar; weekly "hidden calories" note in kind wording.
- Tests: server/test/logging1.unit.test.js (10), client portionGuides.test.js (2). Docs: docs/PHASE3_LOGGING1.md.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v39 - Phase 3 / Section D: food data accuracy and trust (web + server)
- **Vitamins and minerals** (iron, calcium, potassium, magnesium, zinc, A, B12, C, D, folate): power-up card on Progress with the macro arrows, a character reaction, bars against adult ICMR-NIN ranges, and tap-a-low-nutrient for foods you already log that help. Too little data shows "Not enough data", never a zero.
- **Confidence label** on every food (Verified / Typical / Added by you) and **Report wrong values** (reports saved for the admin list; `GET /api/admin/food-reports`, `ADMIN_EMAILS` env var).
- Optional vitamin/mineral inputs in the food form (blank = unknown). Open Food Facts scans now import vitamins and minerals when present.
- Weekly coach: "Low on iron 3 weeks in a row" with foods from your own log.
- Data pipeline with no invented values: `server/data/foodMicros.json` is empty on purpose; fill `foodMicros.template.csv` from IFCT/USDA and run `node scripts/importMicros.js --import file.csv`. `rdaIcmrNin.json` is marked unverified: check it against the ICMR-NIN 2020 PDF.
- Food reports are included in export and account deletion. Migration: none. Docs: CALCULATIONS.md, docs/PHASE3_FOOD_TRUST.md.
- Tests: server/test/micro.unit.test.js (12).
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---
# v38 - Phase 3 / Section C: a real onboarding and app tour (web + server)
- **Welcome (3 screens)**: what the app gives you, your goal (pre-filled from your profile), your coach (saved with the Planning sensei coach). Opens once after sign-up; "Not now" and "Don't show again" on every screen.
- **First-win steps (max 5, goal-based path)**: the person does the thing ("Tap + and log a glass of water", "Search 'dal' and add it", "Plan tomorrow"). Real actions are detected from successful API writes (`flexfit:api-write`, offline-queued writes count too), the coach cheers with a power-up scene.
- **Real spotlight**: dimmed page with a cut-out around the actual element (measured with getBoundingClientRect, follows scroll / resize / keyboard), pulse ring, pointer, tooltip that flips to fit (tested at 360 x 640). A missing anchor skips that step instead of breaking. Anchors are `data-tour="..."`.
- **Your first week checklist** on Home (log a meal, water, weight, plan tomorrow, meet your coach), "3 of 5", collapsible, dismissible, resumable; finishing shows the **Rookie** sticker.
- **Coachmarks**: 1-3 hints the first time you open Log, Planner, Progress, Tasks, Profile, with "Got it" and a "?" button that replays them. **What's new** dots from one config list.
- **Control**: Skip tour at any time (resume from Home or Profile), replay and resume from Profile > Help and tour. Short copy (max 20 words, tested).
- **Accessibility**: focus trap and Esc on the welcome and spotlight, polite screen-reader announcements, 44 px targets, reduced-motion respected.
- **One shared content file**: `client/src/tour/tourContent.js` + `tourEngine.js` are byte-identical to the mobile copies. Progress is kept in the browser and on the server (`GET/PUT /api/tour`, merged so nothing completed is lost). No third-party library or tracker (custom component, no licence needed).
- Server: `Profile.tour`, `routes/tourRoutes.js`, `lib/tourState.js`. Migration: none.
- Tests: client/src/tour/tourEngine.test.js (14), server/test/tourState.unit.test.js.
- NOT built or run here (no npm registry): run `npm run build` in client and `npm test` in server.
---

# v37 - Phase 3 / Section B: one goal, one daily focus, one level, one badge shelf (web + server)
- Server: lib/simpleGoals.js (pure, tested) + lib/simpleData.js; new GET /api/goals/simple and POST /api/goals/check-target; journey endpoint now shares the one level and the 3 quests. Copy is written once on the server and sent to web and mobile.
- Web: components/simple (GoalCard, FocusCard, LevelBar, BadgeShelf, DetailsPanel, TargetsPanel). Home: one goal card; Goals page: the simplified block, then Plan/rewards and Stickers folded away. Removed FatLossCard, JourneyCard, the duplicate quest list and the Real progress badge card. Weekly review shows the Weekly score parts and one win.
- Badge mapping, before/after list: docs/PHASE3_GOALS_SIMPLE.md.
- Tests: server/test/simpleGoals.unit.test.js (16), simpleData.unit.test.js. NOT built or run in the authoring environment (no npm registry): please run `npm run build` in client.
---

# v36 - Phase 3: the Planning sensei (web + server)
- **Chat-style planning** replaces the meals / mode / diet chips: a character-led conversation (typing animation, quick-reply chips, progress dots, Skip, "Use my usual", Back) asks 3-4 questions per session (3 on later "Improve my plan" check-ins) and ends with an editable **Your plan setup** card, then the plan preview. Finishing setup unlocks the **Meal Sensei** sticker. Coach and tone (cheerful / calm / straight to the point) are chosen on the card; the day's character is the default.
- **Questions** (adaptive, never what the profile already knows): diet (veg, egg, non-veg, vegan, Jain, sattvic), allergies / intolerances / religious rules, a private health note (pregnancy, medical), cook time per meal (10 / 20 / 40), dislikes, cuisines (North Indian, Punjabi, Gujarati, Maharashtrian, Bengali, Tamil Nadu, Kerala, Karnataka, Andhra, Telangana, and more), who eats (portion scaling), eating out, protein sources, kitchen and equipment (incl. no stove), budget, spice and oil, batch-cook / leftovers, big breakfast or big dinner, snacks and sweet cravings, loved foods, variety vs repeat, fasting (eating window, vrat days, Ramadan), festival / trip, what you already have. Answers are saved one by one into a private Food Preferences profile (`FoodPreference`).
- **Allergies are never overridden**: `lib/foodSafety.js` (allergen words + "often made with" dishes, intolerances, religious, Jain / sattvic / vegan, dislikes with spellings) filters the plan, swaps, add-ons, suggestions, the gentle day, the assistant's diet day, templates, copy-week and manual add (refused with a clear message). A last gate removes any leak before anything is shown or saved. Recipes are judged by their ingredients.
- **Smarter engine** (deterministic, seeded): a solver nudges portions so each day lands within a few percent of the calorie target with protein at or above the minimum and carbs / fat in range; never below the calorie floor. Variety rule: a main dish at most twice a week unless "repeat my favourites"; protein sources rotate. Cook time, equipment, budget, cuisine, spice, fasting windows, vrat days, Ramadan (suhoor / iftar), festival room, travel days, eaten-out meals (calories reserved), big-meal shares, sweet plan, loved foods, foods at home. **Cook once, eat twice** and **Sunday batch-cook** (leftover lunches flagged "no cooking").
- **Explain and learn**: "Why this plate?" per meal in one sentence; Swap shows the top 3 with a reason each; feedback chips per food (loved / too heavy / too long to cook / not available) change future ranking, stored per person and resettable; **lock a meal** to keep it while re-shuffling; **save a week as a template** and load it back (re-checked against your current exclusions); grocery list merges ingredients (recipes expanded), moves what you already have to "You already have", scales for adults / kids / elders.
- **Safety**: pregnancy, under 18 and medical conditions get a short "check with a doctor or dietitian" note and a steady (maintenance) target instead of a cut. No punishing language (tested).
- **Food tags**: `server/scripts/tagFoods.js` writes `server/data/foodTags.json` (cuisine, diet, cook time, equipment, spice, cost tier) from names and catalogue sections ONLY, and `foodTags.gaps.csv` listing every food with an empty field. Nothing is guessed. Fill the CSV (or `foodTags.overrides.json`) and run `node scripts/tagFoods.js --import data/foodTags.gaps.csv`.
- New routes: `/api/food-prefs` (flow, answer, complete, coach, feedback, reset), `/api/meal-plans/templates`, `POST /api/meal-plans/lock`. Changed: `/auto`, `/view`, `/alternatives`, `/swap`, `/shopping-list` (now `{ items, alreadyHave, people }`), `/copy-week`. Account export and deletion now include FoodPreference and PlanTemplate.
- Migration: none (new collections; new optional MealPlan fields locked, leftover, cookMin, cookNote).
- Tests: server/test/planSensei.unit.test.js (27), client/src/utils/sensei.test.js. See docs/PHASE3_PLANNING_SENSEI.md.
---

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

