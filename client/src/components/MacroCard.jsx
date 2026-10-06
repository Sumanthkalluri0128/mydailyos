import { expectedEnergy, macroTargets } from "../utils/energy";
import GoalBar from "./GoalBar";

/** Protein / carbs / fat against targets that add up to the calorie target. Protein is shown here and nowhere else. */
export default function MacroCard({ profile, summary }) {
  const e = expectedEnergy(profile);
  const m = e
    ? macroTargets(e.calorieTarget, e.weightKg, e.direction, profile?.goals?.proteinTarget)
    : { protein: profile?.goals?.proteinTarget ?? 140, carbs: 250, fat: 70, fiber: 30 };
  return (
    <div className="card macro-card">
      <h3>Macros today</h3>
      <div className="macro-row"><span>🥩 Protein</span><strong>{Math.round(summary.protein)} / {m.protein} g</strong></div>
      <GoalBar value={summary.protein} target={m.protein} unit="g" color="var(--protein)" />
      <div className="macro-row"><span>🍞 Carbs</span><strong>{Math.round(summary.carbohydrates)} / {m.carbs} g</strong></div>
      <GoalBar value={summary.carbohydrates} target={m.carbs} unit="g" color="#e8a23a" overIsBad />
      <div className="macro-row"><span>🥑 Fat</span><strong>{Math.round(summary.fat)} / {m.fat} g</strong></div>
      <GoalBar value={summary.fat} target={m.fat} unit="g" color="#d6577a" overIsBad />
      <div className="macro-row"><span>🌾 Fibre</span><strong>{Math.round(summary.fiber || 0)} / {m.fiber} g</strong></div>
      <GoalBar value={summary.fiber || 0} target={m.fiber} unit="g" color="#7a9e3b" />
    </div>
  );
}
