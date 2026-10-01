import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";

const STREAK_LABELS = {
  water: ["💧", "Water goal"],
  logging: ["📒", "Logging"],
  workout: ["🏃", "Workout"],
  habit: ["🔥", "Habits"],
};

const fmtTrend = (t) => (t === null || t === undefined ? "new" : `${t > 0 ? "+" : ""}${t}%`);

// Streaks, badges and the weekly summary — all computed server-side from data already stored.
export default function Insights() {
  const [ach, setAch] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const today = getLocalDate();
    let alive = true;
    Promise.all([
      apiFetch(`/api/progress/achievements?today=${today}`).then((r) => r.json()),
      apiFetch(`/api/progress/weekly?end=${today}`).then((r) => r.json()),
    ])
      .then(([a, w]) => {
        if (!alive) return;
        if (a.success) setAch(a);
        if (w.success) setWeekly(w);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!ach && !weekly) return null;
  const badges = ach ? (showAll ? ach.badges : ach.badges.filter((b) => b.unlocked).slice(0, 6)) : [];

  return (
    <section className="insights">
      {ach && (
        <div className="large-card">
          <div className="section-header">
            <div>
              <h2>Streaks & badges</h2>
              <p>{ach.unlockedCount} of {ach.badges.length} badges unlocked</p>
            </div>
            <button className="secondary-button" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show unlocked" : "Show all"}</button>
          </div>
          <div className="streak-row">
            {Object.entries(STREAK_LABELS).map(([key, [icon, label]]) => (
              <div className="streak-chip" key={key}>
                <span>{icon}</span>
                <strong>{ach.streaks[key]?.current || 0}<small> day{(ach.streaks[key]?.current || 0) === 1 ? "" : "s"}</small></strong>
                <em>{label} · best {ach.streaks[key]?.best || 0}</em>
              </div>
            ))}
          </div>
          {ach.nextUp && (
            <p className="next-badge">Next up: {ach.nextUp.emoji} <strong>{ach.nextUp.title}</strong> ({ach.nextUp.progress}/{ach.nextUp.target})</p>
          )}
          <div className="badge-grid">
            {badges.length === 0 && <p className="card-description">Complete tasks, log water and workouts to earn your first badge.</p>}
            {badges.map((b) => (
              <div key={b.id} className={`badge ${b.unlocked ? "" : "locked"}`} title={b.description}>
                <span>{b.emoji}</span>
                <strong>{b.title}</strong>
                {!b.unlocked && <small>{b.progress}/{b.target}</small>}
              </div>
            ))}
          </div>
        </div>
      )}

      {weekly && (
        <div className="large-card">
          <div className="section-header">
            <div>
              <h2>This week</h2>
              <p>{weekly.from} → {weekly.to}</p>
            </div>
          </div>
          <div className="weekly-grid">
            <div><span>Avg calories</span><strong>{weekly.averages.calories}</strong><em>{fmtTrend(weekly.trends.calories)}</em></div>
            <div><span>Water</span><strong>{(weekly.totals.waterMl / 1000).toFixed(1)} L</strong><em>{fmtTrend(weekly.trends.waterMl)}</em></div>
            <div><span>Exercise</span><strong>{weekly.totals.exerciseMinutes} min</strong><em>{fmtTrend(weekly.trends.exerciseMinutes)}</em></div>
            <div><span>Tasks done</span><strong>{weekly.totals.tasksCompleted}</strong><em>{fmtTrend(weekly.trends.tasksCompleted)}</em></div>
          </div>
          <p className="card-description">
            Active {weekly.activeDays}/7 days · water goal {weekly.goalDays.water}/7 · exercise goal {weekly.goalDays.exercise}/7
            {weekly.weight ? ` · weight ${weekly.weight.change > 0 ? "+" : ""}${weekly.weight.change} kg` : ""}
          </p>
          {weekly.bestDay && (
            <p className="best-day">🏆 Best day: <strong>{weekly.bestDay.date}</strong> — {weekly.bestDay.highlights.join(", ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
