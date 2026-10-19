# How FlexFit calculates, and the standards behind it

| What | How it is calculated | Standard / source | Verdict |
|---|---|---|---|
| Resting energy (BMR) | Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + 5 (men) / − 161 (women); "other" uses the midpoint (−78) | The equation most often recommended for healthy adults (ADA review, 2005) | ✅ Correct |
| Daily energy (TDEE) | BMR × 1.2 / 1.375 / 1.55 / 1.725 / 1.9 | Standard physical-activity-level factors | ✅ Correct |
| Weight change | 7,700 kcal ≈ 1 kg | The usual rule of thumb. It slightly overstates long-term loss (metabolism adapts), so expect real progress to slow over months | ✅ Accepted simplification |
| Calorie floor | 1,200 kcal (women) / 1,500 kcal (men) | Common minimums for unsupervised dieting | ✅ Correct. **New:** a *lose* goal is never set above maintenance (the floor could previously push a small, low-activity person into a surplus) |
| Pace | 0.1–1 kg/week | ≈0.5 kg/week is the usual recommendation | ✅ |
| Protein | 1.6 g/kg (2.0 g/kg when gaining) | Sports-nutrition position stands: 1.4–2.0 g/kg | ✅ **New:** capped at 35 % of calories (top of the accepted range), unless you typed your own target |
| Fat | 27 % of calories | Accepted range 20–35 % | ✅ |
| Carbs | whatever is left | Accepted range 45–65 % (lower is normal when protein is high) | ✅ |
| Fibre | 14 g per 1,000 kcal | Institute of Medicine Adequate Intake | ✅ |
| Water | 35 ml/kg, clamped to a sensible range | Common guidance 30–35 ml/kg | ✅ |
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

## Vitamins and minerals (new in v34)
Ten micronutrients are tracked per serving: iron, calcium, potassium, magnesium, zinc, vitamin A (µg RAE), vitamin B12, vitamin C,
vitamin D and folate. Sodium stays in mg.

| What | Rule | Source / limit |
|---|---|---|
| Targets | ICMR-NIN *Nutrient Requirements for Indians* (2020) RDA for healthy adults 19+, by sex. Iron for women drops to the men's figure from age 50. | ⚠️ **Typed from the published summary table; check every number in `server/lib/rda.js` against the PDF before launch.** |
| "In range" | From **80 % of the RDA** up to a ceiling where one is meaningful (iron 45 mg, calcium 2,500 mg, zinc 40 mg, vitamin A 3,000 µg, vitamin C 2,000 mg, vitamin D 100 µg). Below the range = low; above = high. | The 80 % start is a FlexFit choice, not a published cut-off. |
| Unknown is not zero | A food with no value for a nutrient adds nothing and is not counted as "covered". A nutrient is judged only when foods carrying it make up **≥ 60 % of the day's calories**; otherwise the card says "not enough data". | Avoids misleading zeros. |
| Weekly insight | "Low N weeks in a row": the week's average per logged day is below the range start in each of the last **3** weeks, each week with **≥ 4 logged days** and ≥ 60 % coverage. Suggestions come from the person's own foods first. | Rule-based, shown as a coach tip. |
| Out of scope | Under-18s (no card), age or sex missing (no card, asks for the profile detail), pregnancy, lactation and medical conditions. | A visible note is shown on the card. |
| Data | Catalogue values come from `server/data/micronutrients.csv` (IFCT 2017, USDA FoodData Central), applied with `npm run import-micros`. Every row carries a source; blank stays unknown. **The file ships empty: nothing was invented.** | Fill it in, then run `npm run audit-foods`. |
| Barcode foods | Open Food Facts minerals and vitamins are converted (g, mg or µg per 100 g to the app's unit, per serving) and range-checked; missing stays unknown. | Vitamin A in IU is skipped (ambiguous). |
| Confidence badge | **Verified** = the importer marked the row verified and it has a source; **Typical** = approximate catalogue value; **Added by you** = your own food. | |

## What FlexFit does not track
Pregnancy- and condition-specific requirements, supplements, and any nutrient not listed above. Catalogue micronutrient values
are blank until `data/micronutrients.csv` is filled in; the app shows "not enough data" instead of guessing.

## Known limits
* Age is stored as a number, so it doesn't advance on its own — update it on your birthday.
* Estimates are for healthy adults. They are not suitable for pregnancy, under-18s, eating disorders or medical conditions —
  those need a clinician or dietitian.
