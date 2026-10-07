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
  const [plateau, setPlateau] = useState(null);

  useEffect(() => {
    const today = getLocalDate();
    let alive = true;
    Promise.all([
      apiFetch(`/api/progress/achievements?today=${today}`).then((r) => r.json()),
      apiFetch(`/api/progress/weekly?end=${today}`).then((r) => r.json()),
      apiFetch(`/api/progress/plateau?today=${today}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([a, w, p]) => {
        if (!alive) return;
        if (a.success) setAch(a);
        if (w.success) setWeekly(w);
        if (p?.success) setPlateau(p);
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

      {plateau && plateau.status !== "insufficient_data" && plateau.status !== "on_track" && (
        <div className={`large-card plateau-card ${plateau.status}`}>
          <h2>{plateau.status === "plateau" ? "⏸️ Weight plateau" : plateau.status === "wrong_direction" ? "↗️ Trend check" : "⚖️ Weight trend"}</h2>
          <p>{plateau.message}</p>
          <small>Trend: {plateau.slopeKgPerWeek > 0 ? "+" : ""}{plateau.slopeKgPerWeek} kg/week from {plateau.weighIns} weigh-ins</small>
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
          {weekly.days?.length > 0 && (
            <div className="week-strip" role="img" aria-label="Calories logged each day this week">
              {weekly.days.map((d) => {
                const max = Math.max(...weekly.days.map((x) => x.calories), 1);
                return (
                  <div key={d.date} className="week-strip-col" title={`${d.date}: ${d.calories} kcal`}>
                    <div className="week-strip-bar" style={{ height: `${d.calories ? Math.max(8, (d.calories / max) * 100) : 4}%`, opacity: d.calories ? 1 : 0.25 }} />
                    <small>{new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</small>
                  </div>
                );
              })}
            </div>
          )}
          {weekly.nutrients?.loggedDays > 0 && (
            <div className="weekly-nutrients">
              <h3>Daily average vs target</h3>
              {weekly.nutrients.rows.map((r) => (
                <div className={`nutrient-row ${r.status}`} key={r.key}>
                  <span>{r.label}</span>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(r.percentOfTarget || 0, 100)}%` }} /></div>
                  <strong>{r.average} / {r.target} g</strong>
                </div>
              ))}
              {(weekly.nutrients.limits || []).map((r) => (
                <div className={`nutrient-row ${r.status === "high" ? "low" : r.status === "near" ? "near" : ""}`} key={r.key}>
                  <span>{r.label}</span>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${Math.min(r.percentOfLimit || 0, 100)}%` }} /></div>
                  <strong>{r.average} / {r.limit} {r.unit}</strong>
                </div>
              ))}
              {weekly.nutrients.tip && <p className="card-description">💡 {weekly.nutrients.tip}</p>}
              <small>Based on {weekly.nutrients.loggedDays} day{weekly.nutrients.loggedDays === 1 ? "" : "s"} with food logged.</small>
            </div>
          )}
          {weekly.bestDay && (
            <p className="best-day">🏆 Best day: <strong>{weekly.bestDay.date}</strong> — {weekly.bestDay.highlights.join(", ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
