# How FlexFit calculates, and the standards behind it

| What | How it is calculated | Standard / source | Verdict |
|---|---|---|---|
| Resting energy (BMR) | Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + 5 (men) / − 161 (women); "other" uses the midpoint (−78) | The equation most often recommended for healthy adults (ADA review, 2005) | ✅ Correct |
| Daily energy (TDEE) | BMR × 1.2 / 1.375 / 1.55 / 1.725 / 1.9 (the formula). Once the food log and weight trend give a reading (35-day window, 10+ properly logged days, 4+ weigh-ins over 14+ days), maintenance is moved toward what you **measurably** burn: 60 % of the gap at high confidence, 35 % at medium, 0 % at low, measured/formula ratio clamped to ±20 % | Standard physical-activity-level factors; adaptive TDEE (intake minus weight trend × 7,700) | ✅ Correct. The target now follows your real progress, not only the formula |
| Weight change | 7,700 kcal ≈ 1 kg | The usual rule of thumb. It slightly overstates long-term loss (metabolism adapts), so expect real progress to slow over months | ✅ Accepted simplification |
| Calorie floor | 1,200 kcal (women) / 1,500 kcal (men) | Common minimums for unsupervised dieting | ✅ Correct. **New:** a *lose* goal is never set above maintenance (the floor could previously push a small, low-activity person into a surplus) |
| Pace | 0.1–1 kg/week, and **never above 1 % of body weight a week** (80 kg → 0.8). A faster pace that was typed or saved is lowered when the target is worked out | ≈0.5 kg/week is the usual recommendation; ≤1 %/week protects muscle | ✅ |
| Protein | Per body goal: lean 1.8, athletic 2.0, muscular 2.2, balanced 1.6 g/kg; no body goal 1.6 g/kg; 2.0+ when gaining. Counted on your current weight, but when you are losing and more than 15 % above your goal weight, on goal weight + 25 % of the excess (adjusted body weight). Capped at 35 % of calories, unless you typed your own target | Sports-nutrition position stands: 1.4–2.2 g/kg | ✅ |
| Fat | Per body goal: lean 27 %, athletic 25 %, muscular 25 %, balanced 30 % of calories (27 % with no body goal), **never under 0.6 g/kg** | Accepted range 20–35 % of calories; 0.6–0.8 g/kg keeps hormones and vitamin absorption healthy | ✅ |
| Carbs | whatever is left | Accepted range 45–65 % (lower is normal when protein is high) | ✅ |
| Fibre | 14 g per 1,000 kcal, **never under 30 g (men) / 25 g (women)** (28 g if sex is not given) | Institute of Medicine Adequate Intake; usual 25–38 g | ✅ |
| Water | 35 ml/kg, plus about 15 ml per minute of exercise when the day's minutes are passed in; clamped to 1.5–5 L | Common guidance 30–35 ml/kg plus sweat losses | ✅ |
| Steps | 0.0005 kcal × steps × kg, and only activity *above* what your activity level already assumes is added | Between published net and gross walking costs | ✅ Reasonable |
| Sugar (new) | Guide = 10 % of calories | WHO: free sugars < 10 % of energy | ⚠️ We log **total** sugar (includes fruit and milk), so it's a guide, not a rule |
| Sodium (new) | Ceiling 2,000 mg | WHO | ⚠️ Shown only when logged foods carry sodium data — **none of the 484 catalogue foods has any**, so only barcode-scanned and custom foods count |
| Unit conversions | 1 lb = 0.45359237 kg, 1 kcal = 4.184 kJ, 1 US fl oz = 29.5735 ml | Exact definitions | ✅ |
| Barcode foods | Per-100 g values scaled to the serving; kJ ÷ 4.184; salt ÷ 2.5 = sodium | Open Food Facts conventions | ✅ |

## Food data
`npm run audit-foods` (server) checks all 484 catalogue foods: calories vs 4·protein + 4·(carbs − fibre) + 2·fibre + 9·fat,
sugar ≤ carbs, fibre ≤ carbs, no negatives, macros not heavier than the serving. Result: **0 problems**; median difference
2 %, 95 % of foods within 8 %. This proves the numbers agree with *each other*; it cannot prove they match a lab analysis.
Entries are labelled "typical values — approximate".

## Vitamins and minerals (v39)
Tracked: iron, calcium, potassium, magnesium, zinc, vitamins A, B12, C, D and folate (sodium already existed).
* **Sources.** Values come only from (1) the reviewed overlay `server/data/foodMicros.json`, filled from India's IFCT 2017 or USDA FoodData Central through `node scripts/importMicros.js --import file.csv` (a source is required on every import), (2) Open Food Facts barcode data, (3) values you type in yourself. Nothing is estimated or invented; an unknown value stays blank (`null`), never 0.
* **Confidence label on every food:** Verified (reviewed source), Typical (generic catalogue average), Added by you.
* **Targets.** Adult ICMR-NIN 2020 recommended ranges by sex (`server/data/rdaIcmrNin.json`, min-max, with an upper limit where one exists). The file is marked `"verified": false`: check each number against the ICMR-NIN PDF before trusting it. Ranges are for adults only; under-18s, pregnancy and breastfeeding need different targets and are not shown.
* **Day total.** Sum of logged servings. A nutrient is shown only when foods covering at least 60 % of the day's calories have a value for it; otherwise the card says "Not enough data" instead of a misleading low number.
* **Low streaks.** "Low on iron 3 weeks in a row" needs 3+ days with enough data per week and a weekly average under 70 % of the minimum.
* **Limits.** Cooking, soil and brand differences change real content; absorption (iron with vitamin C, for example) is not modelled; this is not a medical test. Food reports ("Report wrong values") go to the admin list (`ADMIN_EMAILS`).

## Known limits
* Age is saved with the day it was entered and advances by itself every year (older profiles start counting from the first time they are opened after this update).
* Estimates are for healthy adults. They are not suitable for pregnancy, under-18s, eating disorders or medical conditions —
  those need a clinician or dietitian.

## One diet break
A break is a window in the coach state (`CoachState.dietBreak`, 7 days by default, up to 14). While it runs each day's food budget is widened up to
maintenance, which is the **measured** maintenance when there is enough data. The calorie goal in your profile is never changed, so there is nothing
to restore. The plan screen and the weekly coach start, show and end the same window.

## Where the numbers live
`packages/shared/src/energy.js` is the single source. `node tools/syncShared.mjs` writes the server, web and phone copies and CI runs
`node tools/syncShared.mjs --check`, so a copy that was edited by hand (or a source that was not synced) fails the build.
