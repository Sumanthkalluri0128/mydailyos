// Indian RDA lookup (ICMR-NIN "Nutrient Requirements for Indians", 2020) for healthy ADULTS 19+.
// OUT OF SCOPE (no card is shown): under-18s, pregnancy / lactation, and medical conditions.
//
// REVIEW NEEDED: the numbers below were typed in from the published ICMR-NIN 2020 summary table and must be checked
// against the PDF before launch (see docs/CALCULATIONS.md). Fix them here, in one place; web and mobile read them from the server.
//
// Each nutrient has:
//   rda   the daily recommended intake for this person
//   min   the low end of "in range" = 80 % of the RDA (below it the nutrient is shown as LOW)
//   max   an upper ceiling from food + fortification (null when no food-level ceiling is meaningful, so it is never shown)
const NUTRIENTS = [
  // key, label, unit, male RDA, female RDA, ceiling
  { key: 'iron', label: 'Iron', unit: 'mg', male: 19, female: 29, max: 45 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', male: 1000, female: 1000, max: 2500 },
  { key: 'potassium', label: 'Potassium', unit: 'mg', male: 3510, female: 3510, max: null },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', male: 440, female: 370, max: null },
  { key: 'zinc', label: 'Zinc', unit: 'mg', male: 17, female: 13.2, max: 40 },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'µg RAE', male: 1000, female: 840, max: 3000 },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'µg', male: 2.2, female: 2.2, max: null },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', male: 90, female: 80, max: 2000 },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'µg', male: 15, female: 15, max: 100 },
  { key: 'folate', label: 'Folate', unit: 'µg', male: 300, female: 300, max: null },
];
const KEYS = NUTRIENTS.map((n) => n.key);
const MIN_FRACTION = 0.8;
const round = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);

/**
 * @param {{age?: number|null, sex?: string}} profile
 * @returns {{ok: true, targets: Array}|{ok: false, reason: 'age'|'under18'|'sex'}}
 */
function rdaFor(profile = {}) {
  const age = Number(profile?.age);
  if (!Number.isFinite(age) || age <= 0) return { ok: false, reason: 'age' };
  if (age < 19) return { ok: false, reason: 'under18' }; // 18 is also left out: the adult table starts at 19 in the NIN age bands
  const sex = profile?.sex === 'male' || profile?.sex === 'female' ? profile.sex : null;
  if (!sex) return { ok: false, reason: 'sex' };
  const targets = NUTRIENTS.map((n) => {
    let rda = n[sex];
    // Iron: women's higher figure applies to the menstruating years; from 50 it matches men's.
    if (n.key === 'iron' && sex === 'female' && age >= 50) rda = n.male;
    return { key: n.key, label: n.label, unit: n.unit, rda, min: round(rda * MIN_FRACTION), max: n.max };
  });
  return { ok: true, targets };
}

module.exports = { NUTRIENTS, KEYS, MIN_FRACTION, rdaFor };
