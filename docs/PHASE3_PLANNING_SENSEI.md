# Phase 3: the Planning sensei

Rule-based and free. No paid AI. Everything below runs on the server (Node) and in the apps.

## How a plan is made
1. **Setup chat** (`GET /api/food-prefs/flow`): `lib/planQuestions.js` picks at most 4 questions (3 on later check-ins). Skipped: what is known (diet once set), what was skipped in the last 30 days, scope (the screen decides days and meals), health for under-18s (the note applies automatically), the event question when the profile already has an upcoming event. Feedback can bring a topic forward ("too long to cook" twice asks about cook time).
2. **Answers** (`POST /api/food-prefs/answer`) are cleaned server-side and saved one at a time; `usual` saves the last answer, or a hint from the food log, or a safe default.
3. **Settings** (`deriveSettings`) turn answers into engine rules (`lib/planRules.js`): allowed foods, day rules (fasting, vrat, Ramadan, eaten out, festival room, travel), score bonuses (cuisine, loved, at home, protein source, feedback).
4. **Engine** (`lib/smartPlan.js buildSmartPlan`): seeded greedy build + a small solver that moves portions in half-servings until the day is inside the calorie band and macro ranges. Same seed = same week; Shuffle changes the seed.
5. **Gate** (`mealPlanRoutes /auto`): `findViolations` removes anything an allergy rule forbids before it is shown or saved.

## Allergies and health data
Stored only in the person's `FoodPreference` document, returned in their data export, deleted with the account (`PERSONAL_MODELS`). `lib/foodSafety.js` judges a food by its name, a recipe's ingredient names and allergen tags in `foodTags.overrides.json`; dishes commonly made with an allergen (poha and peanuts, korma and cashews) count as unsafe. Lactose intolerance blocks high-lactose foods but not curd, paneer or ghee (the app says so; add them under "foods I do not eat" if they bother you). This is a planning aid, not a medical device; the app tells people to read labels.

## Food tags
`node scripts/tagFoods.js` rebuilds `data/foodTags.json` and `data/foodTags.gaps.csv` (794 foods at the time of writing; most cook time, equipment, spice and cost cells are empty on purpose). Fill the CSV and run `node scripts/tagFoods.js --import data/foodTags.gaps.csv`; values land in `data/foodTags.overrides.json`. `--check` fails when the generated file is out of date (a test runs it). cuisine = comma list from `lib/foodTags.js CUISINES`; cookMin = minutes (0 = no cooking); equipment = comma list; spice = mild | medium | hot; cost = low | mid | high.
Until tags are filled: a missing tag never blocks a food, and "15 minutes to cook" is only shown when the number is known. The one exception is a "no stove" kitchen, which only allows foods known to need no cooking.

## Safety
Pregnancy, breastfeeding, a medical condition or age under 18: a short "check with a doctor or dietitian" note and a maintenance-level target (`planSafety`, `adjustCoreForSafety`), no lighter-day cuts. All sensei wording is checked by `toneCheck` in the tests.

## Assumptions to know
- Eating-window meal times: breakfast 08:00, lunch 13:00, snacks 17:00, dinner 20:00.
- Portion scaling for the grocery list: adult 1, child 0.5, elder 0.8 (estimates).
- Ramadan needs a start date from the person (no calendar guessing); vrat days are weekday based.
- Phase 6 micronutrient / glycaemic data does not exist yet. Sodium and sugar limits are used as before; "diabetes" in the health note lowers the weight of sugary and refined foods.
- Locked meals are kept as they are; "not available" feedback hides a food for 28 days.
