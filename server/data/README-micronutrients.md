# Micronutrient data (review file)

`micronutrients.csv` has one row per catalogue food, **all values blank on purpose**. No numbers were invented: the build
environment had no internet access, so IFCT 2017 / USDA FoodData Central could not be read. Fill the rows you can source;
leave anything unknown **empty** (empty = unknown; `0` = a real, measured zero).

Columns: values are **per listed serving** (`serving_size` + `serving_unit`, same as the food). Units: mg, except
`vitaminA_ug_rae`, `vitaminB12_ug`, `vitaminD_ug`, `folate_ug` (µg). `source` is required on every row that has any value,
e.g. `IFCT 2017 Table 12 (Toor dal, whole)` or `USDA FDC 173757`. `verified` = `yes` only when the value is taken directly from
the source for that exact food (not scaled from a different food).

Per-serving conversion: IFCT and USDA publish values per 100 g, so multiply by `serving_size / 100` for gram servings.

Apply (re-runnable; only fills the fields that are not blank, never overwrites with blanks):

    node scripts/importMicros.js --dry-run     # shows what would change + validation problems
    node scripts/importMicros.js               # needs MONGO_URI, updates catalogue foods only

Then `npm run audit-foods` checks the numbers for sanity.
