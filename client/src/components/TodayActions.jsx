// The first thing on Home: big, labelled actions with live numbers, so the next step is always obvious.
import { dayBalance } from "../utils/energy";
import "./todayactions.css";

const n = (v) => Math.round(Number(v) || 0);

export default function TodayActions({ profile, summary, activity, water, waterTarget, latestWeight, goTo, onAsk }) {
  const bal = dayBalance(profile, { eaten: summary?.calories, workout: Number(activity?.workoutCalories ?? 0), steps: Number(activity?.stepCalories || 0) });
  const kcalPct = bal.budget ? Math.min(100, (bal.eaten / bal.budget) * 100) : 0;
  const waterPct = waterTarget ? Math.min(100, ((water?.totalMl || 0) / waterTarget) * 100) : 0;
  const stepsT = profile?.goals?.stepsTarget ?? 10000;
  const stepsPct = Math.min(100, ((activity?.steps || 0) / stepsT) * 100);
  const tiles = [
    { id: "foodLogger", icon: "🍽️", title: "Log food", big: `${n(bal.eaten)} kcal`, sub: bal.budget ? `${Math.max(0, n(bal.remaining))} left of ${n(bal.budget)}` : "Add your first meal", pct: kcalPct, tone: "kcal", over: bal.remaining < 0 },
    { id: "water", icon: "💧", title: "Add water", big: `${n(water?.totalMl)} ml`, sub: waterTarget ? `of ${waterTarget} ml` : "Tap to add a glass", pct: waterPct, tone: "water" },
    { id: "exercise", icon: "🔥", title: "Exercise & steps", big: `${n(activity?.steps).toLocaleString()} steps`, sub: `${n(activity?.totalMinutes)} min active`, pct: stepsPct, tone: "steps" },
    { id: "weight", icon: "⚖️", title: "Weigh in", big: latestWeight != null ? `${Number(latestWeight).toFixed(1)} kg` : "No weight yet", sub: "See your trend", tone: "weight" },
    { id: "planner", icon: "📅", title: "Plan my week", big: "From what you eat", sub: "Auto-plan with limits", tone: "plan" },
  ];
  return (
    <section className="ta" aria-label="What would you like to do?">
      <div className="ta-head"><h2>What would you like to do?</h2></div>
      <div className="ta-grid">
        {tiles.map((t) => (
          <button key={t.id} type="button" className={`ta-tile tone-${t.tone} ${t.over ? "is-over" : ""}`} onClick={() => goTo(t.id)}>
            <span className="ta-ic" aria-hidden="true">{t.icon}</span>
            <span className="ta-title">{t.title}</span>
            <strong>{t.big}</strong>
            <small>{t.over ? "Over budget today. Tap for Fix my day" : t.sub}</small>
            {t.pct !== undefined && <i className="ta-bar" aria-hidden="true"><b style={{ width: `${t.pct}%` }} /></i>}
          </button>
        ))}
      </div>
    </section>
  );
}
