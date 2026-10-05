import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { dayBalance, expectedEnergy } from "../utils/energy";
import GoalBar from "./GoalBar";

// "How much should I eat for my weight, and where am I today?" Uses the ONE shared energy model (same numbers as the
// mobile app and the server): only activity beyond what the daily target already assumes earns extra food.
// Fetches its own data; change `refreshKey` after logging food, exercise or steps to reload it.
export default function CalorieBalance({ refreshKey = 0 }) {
  const [state, setState] = useState({ loading: true, profile: null, eaten: 0, workout: 0, stepKcal: 0 });

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
        const sm = a.summary || {};
        const stepKcal = Number(sm.stepCalories || 0);
        const workout = Number(sm.workoutCalories ?? Math.max(0, Number(sm.caloriesBurned || 0) - stepKcal));
        if (alive) setState({ loading: false, profile: p.profile || null, eaten: Number(f.summary?.calories || 0), workout, stepKcal });
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
  const b = dayBalance(state.profile, { eaten: state.eaten, workout: state.workout, steps: state.stepKcal });
  const deficit = b.net >= 0;
  const goal = e.direction === "lose" ? "to lose weight" : e.direction === "gain" ? "to gain weight" : "to maintain weight";
  const n = (v) => Math.round(v).toLocaleString();
  return (
    <div className="card balance-card">
      <h3>Calories for your weight</h3>
      <p className="balance-sub">
        Based on {e.weightKg} kg · eat about <strong>{n(b.target)} kcal</strong> a day {goal}
        {e.mode === "manual" ? " (your own target)" : ""}.
      </p>
      <div className="balance-line"><span>Eaten today</span><strong>{n(b.eaten)} / {n(b.budget)} kcal</strong></div>
      <GoalBar value={b.eaten} target={b.budget} unit="kcal" color="#e8823a" overIsBad />
      <div className="balance-rows">
        <div><span>{e.mode === "manual" ? "Daily target (yours)" : "Daily target (what to eat)"}</span><strong>{n(b.target)} kcal</strong></div>
        <div><span>Maintenance (what you burn)</span><strong>{n(e.tdee)} kcal</strong></div>
        <div><span>Activity today (workouts {n(state.workout)} + steps {n(state.stepKcal)})</span><strong>{n(b.burned)} kcal</strong></div>
        <div><span>Already counted in your target</span><strong>− {n(Math.min(b.burned, e.baselineActivityKcal))} kcal</strong></div>
        <div><span>Extra food earned by activity</span><strong>+ {n(b.bonus)} kcal</strong></div>
      </div>
      <div className={`balance-result ${deficit ? "deficit" : "surplus"}`}>
        <strong>{deficit ? "Calorie deficit" : "Calorie surplus"}: {n(Math.abs(b.net))} kcal</strong>
        <span>{deficit ? "Below" : "Above"} what you burn today (maintenance + extra activity − food) ≈ {b.fatKg.toFixed(2)} kg of body {deficit ? "fat lost" : "weight gained"} if every day were like this.</span>
      </div>
    </div>
  );
}
