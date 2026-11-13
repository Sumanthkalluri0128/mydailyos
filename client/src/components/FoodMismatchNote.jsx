import { macroMismatch } from "../utils/energy";

/**
 * Entries whose calories disagree with their own macros (protein 4, carbs 4, fat 9 kcal per g, gap 15 %+). The day counts the calories you
 * logged; this only points at the entries worth a second look, so the day's calories and its macros describe the same food.
 */
export default function FoodMismatchNote({ logs }) {
  const bad = (logs || []).map((l) => ({ name: l.foodName, m: macroMismatch({ calories: l.nutritionTotal?.calories, protein: l.nutritionTotal?.protein, carbs: l.nutritionTotal?.carbohydrates, fat: l.nutritionTotal?.fat }) })).filter((x) => x.m.mismatch);
  if (!bad.length) return null;
  return (
    <p className="food-mismatch" role="note">
      ⚠️ Check {bad.length === 1 ? "this entry" : `these ${bad.length} entries`}: {bad.slice(0, 3).map((x) => `${x.name} (${x.m.kcal} kcal logged, macros add up to ${x.m.macroKcal})`).join("; ")}{bad.length > 3 ? "…" : ""}. Edit the food so its calories and macros agree.
    </p>
  );
}
