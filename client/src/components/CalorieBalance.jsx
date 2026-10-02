import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { calorieBalance, expectedEnergy } from "../utils/energy";
import GoalBar from "./GoalBar";

// "How much should I eat for my weight, and where am I today?" Fetches its own data;
// bump `refreshKey` after logging food/exercise to reload it.
export default function CalorieBalance({ refreshKey = 0 }) {
  const [state, setState] = useState({ loading: true, profile: null, eaten: 0, burned: 0 });

  useEffect(() => {
    let alive = true;
    const date = getLocalDate();
    (async () => {
      try {
        const get = async (path) => (await apiFetch(`${API_URL}${path}`)).json();
        const [p, f, a] = await Promise.all([
          get("/api/profile"),
          get(`/api/food-logs/summary?date=${date}`),
          get(`/api/activities/summary?date=${date}`),
        ]);
        if (alive) setState({ loading: false, profile: p.profile || null, eaten: Number(f.summary?.calories || 0), burned: Number(a.summary?.caloriesBurned || 0) });
      } catch {
        if (alive) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  if (state.loading) return null;
  const e = expectedEnergy(state.profile);
  if (!e) {
    return (
      <div className="card balance-card">
        <h3>Your calorie target</h3>
        <p className="balance-sub">Add your weight, height and age in your profile to see how many calories you should eat each day.</p>
      </div>
    );
  }
  const b = calorieBalance(e, state.eaten, state.burned);
  const goal = e.direction === "lose" ? "to lose weight" : e.direction === "gain" ? "to gain weight" : "to maintain weight";
  const n = (v) => Math.round(v).toLocaleString();
  return (
    <div className="card balance-card">
      <h3>Calories for your weight</h3>
      <p className="balance-sub">Based on {e.weightKg} kg · eat about <strong>{n(e.calorieTarget)} kcal</strong> a day {goal}.</p>
      <div className="balance-line"><span>Eaten today</span><strong>{n(state.eaten)} / {n(b.budget)} kcal</strong></div>
      <GoalBar value={state.eaten} target={b.budget} unit="kcal" color="#e8823a" overIsBad />
      <div className="balance-rows">
        <div><span>Expected intake (goal)</span><strong>{n(e.calorieTarget)} kcal</strong></div>
        <div><span>Maintenance (what you burn)</span><strong>{n(e.tdee)} kcal</strong></div>
        <div><span>Burned by exercise today</span><strong>+ {n(state.burned)} kcal</strong></div>
      </div>
      <div className={`balance-result ${b.isDeficit ? "deficit" : "surplus"}`}>
        <strong>{b.isDeficit ? "Calorie deficit" : "Calorie surplus"}: {n(Math.abs(b.net))} kcal</strong>
        <span>{b.isDeficit ? "Below" : "Above"} maintenance today (maintenance + exercise − food) ≈ {b.fatKg.toFixed(2)} kg of body {b.isDeficit ? "fat lost" : "weight gained"} if every day were like this.</span>
      </div>
    </div>
  );
}
