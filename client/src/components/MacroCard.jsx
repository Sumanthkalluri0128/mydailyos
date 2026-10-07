import { expectedEnergy, macroTargets, limitTargets } from "../utils/energy";
import GoalBar from "./GoalBar";

/** Protein / carbs / fat against targets that add up to the calorie target. Protein is shown here and nowhere else. */
export default function MacroCard({ profile, summary }) {
  const e = expectedEnergy(profile);
  const m = e
    ? macroTargets(e.calorieTarget, e.weightKg, e.direction, profile?.goals?.proteinTarget)
    : { protein: profile?.goals?.proteinTarget ?? 140, carbs: 250, fat: 70, fiber: 30 };
  const cal = e ? e.calorieTarget : 2000;
  const lim = limitTargets(cal);
  const sodium = Math.round(summary.sodium || 0);
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
      <div className="macro-row" title="Total sugar, including the natural sugar in fruit and milk. The guide is 10% of calories."><span>🍬 Sugar <small>(keep under)</small></span><strong>{Math.round(summary.sugar || 0)} / {lim.sugar} g</strong></div>
      <GoalBar value={summary.sugar || 0} target={lim.sugar} unit="g" color="#b57edc" overIsBad />
      {sodium > 0 && (<>
        <div className="macro-row"><span>🧂 Sodium <small>(keep under)</small></span><strong>{sodium} / {lim.sodiumMg} mg</strong></div>
        <GoalBar value={sodium} target={lim.sodiumMg} unit="mg" color="#5aa9e6" overIsBad />
      </>)}
    </div>
  );
}
