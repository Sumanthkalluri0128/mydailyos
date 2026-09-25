import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";

const MS_DAY = 24 * 60 * 60 * 1000;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(dateString, days) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function shortDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function niceDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rangeForPreset(today, preset) {
  const days = preset === "week" ? 7 : preset === "month" ? 30 : preset === "90" ? 90 : 365;
  return { from: shiftDate(today, -(days - 1)), to: today };
}

function TrendChart({ data, metric, label, unit = "", colorClass = "" }) {
  const points = data.filter((d) => Number.isFinite(Number(d[metric])));
  if (!points.length) {
    return <div className="progress-empty">No data recorded for this period.</div>;
  }

  const width = 900;
  const height = 290;
  const pad = { left: 54, right: 20, top: 22, bottom: 42 };
  const values = points.map((p) => Number(p[metric]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.08, 1);
  const low = Math.max(0, min - spread * 0.12);
  const high = max + spread * 0.12;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + (1 - (v - low) / (high - low)) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(p[metric])).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points.length - 1)},${pad.top + innerH} L ${x(0)},${pad.top + innerH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => low + (high - low) * ratio);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className={`trend-chart ${colorClass}`}>
      <div className="trend-chart-header">
        <div><strong>{label}</strong><span>{points.length} recorded day{points.length === 1 ? "" : "s"}</span></div>
        <span>{values[values.length - 1].toFixed(metric === "weightKg" ? 1 : 0)}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trend chart`} className="trend-svg">
        {grid.map((value, i) => {
          const yy = y(value);
          return <g key={i}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" /><text x={pad.left - 9} y={yy + 4} textAnchor="end" className="chart-y-label">{value.toFixed(metric === "weightKg" ? 1 : 0)}</text></g>;
        })}
        <path d={area} className="chart-area" />
        <path d={path} className="chart-line" />
        {points.map((p, i) => <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(Number(p[metric]))} r="4.5" className="chart-dot"><title>{niceDate(p.date)}: {Number(p[metric]).toFixed(metric === "weightKg" ? 1 : 0)}{unit}</title></circle>)}
        {points.map((p, i) => i % labelEvery === 0 || i === points.length - 1 ? <text key={`x-${p.date}-${i}`} x={x(i)} y={height - 14} textAnchor="middle" className="chart-x-label">{shortDate(p.date)}</text> : null)}
      </svg>
    </div>
  );
}

function ProgressPage({ onBack }) {
  const today = getLocalDate();
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState(shiftDate(today, -6));
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadHistory = async (start, end) => {
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/api/progress/history?from=${start}&to=${end}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to load progress");
      setData(json);
      if (!json.days.some((d) => d.date === selectedDate)) setSelectedDate(end);
    } catch (error) {
      console.error(error);
      notify(error.message || "Unable to load progress history.", "error");
    } finally { setLoading(false); }
  };

  const loadDetails = async (date) => {
    setDetailsLoading(true);
    try {
      const paths = [
        ["food", `/api/food-logs?date=${date}`],
        ["activity", `/api/activities/logs?date=${date}`],
        ["water", `/api/water?date=${date}`],
        ["tasks", `/api/tasks?date=${date}`],
        ["habits", `/api/habits/logs?date=${date}`],
        ["weight", `/api/weight?date=${date}`],
      ];
      const responses = await Promise.all(paths.map(async ([key, path]) => {
        const r = await apiFetch(`${API_URL}${path}`);
        const j = await r.json();
        return [key, j];
      }));
      setDetails(Object.fromEntries(responses));
    } catch (error) {
      console.error(error);
      notify("Could not load the selected day's history.", "error");
    } finally { setDetailsLoading(false); }
  };

  useEffect(() => { loadHistory(from, to); }, []);
  useEffect(() => { loadDetails(selectedDate); }, [selectedDate]);

  const days = data?.days || [];
  const selectedDay = days.find((d) => d.date === selectedDate);
  const totals = data?.totals || {};
  const averages = useMemo(() => {
    const n = days.length || 1;
    return {
      calories: totals.calories / n,
      protein: totals.protein / n,
      water: totals.waterMl / n,
      exercise: totals.exerciseMinutes / n,
    };
  }, [days.length, totals]);

  const applyPreset = (value) => {
    setPreset(value);
    const range = rangeForPreset(today, value);
    setFrom(range.from); setTo(range.to); loadHistory(range.from, range.to);
  };

  const applyCustom = () => {
    if (!from || !to || from > to) { notify("Please select a valid date range.", "error"); return; }
    setPreset("custom"); loadHistory(from, to);
  };

  const mealCalories = details?.food?.logs || [];
  const activities = details?.activity?.logs || [];
  const waterLogs = details?.water?.logs || [];
  const tasks = details?.tasks?.tasks || [];
  const habitLogs = details?.habits?.logs || [];
  const weights = details?.weight?.logs || [];

  return (
    <div className="progress-page">
      <div className="page-heading-row">
        <div><p className="eyebrow">Progress & history</p><h2>See your journey clearly 📈</h2><p>Every food, workout, water, task, habit and weight entry stays connected to the same daily timeline.</p></div>
        <button className="secondary-button" onClick={onBack}>← Dashboard</button>
      </div>

      <section className="progress-toolbar card">
        <div className="progress-presets">
          {[['week','7 days'],['month','30 days'],['90','90 days'],['year','1 year'],['custom','Custom']].map(([key, text]) => <button key={key} className={`filter-chip ${preset === key ? 'active' : ''}`} onClick={() => key === 'custom' ? setPreset('custom') : applyPreset(key)}>{text}</button>)}
        </div>
        <div className="date-range-controls">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary-button" onClick={applyCustom}>Apply</button>
        </div>
      </section>

      {loading ? <div className="card progress-empty">Loading your complete history…</div> : (
        <>
          <section className="stats-grid progress-summary-grid">
            <div className="card"><span className="card-icon">⚖️</span><p>Latest weight</p><h3>{selectedDay?.weightKg != null ? Number(selectedDay.weightKg).toFixed(1) : "—"}<small> kg</small></h3><div className="card-description">Trend is carried forward between recorded weigh-ins.</div></div>
            <div className="card"><span className="card-icon">🍽️</span><p>Avg calories/day</p><h3>{Math.round(averages.calories)}<small> kcal</small></h3><div className="card-description">{Math.round(totals.calories)} kcal across the range.</div></div>
            <div className="card"><span className="card-icon">💧</span><p>Avg water/day</p><h3>{(averages.water / 1000).toFixed(1)}<small> L</small></h3><div className="card-description">{(totals.waterMl / 1000).toFixed(1)} L recorded.</div></div>
            <div className="card"><span className="card-icon">🏃</span><p>Exercise</p><h3>{Math.round(totals.exerciseMinutes)}<small> min</small></h3><div className="card-description">{Math.round(totals.caloriesBurned || 0)} kcal burned.</div></div>
          </section>

          <section className="progress-charts-grid">
            <TrendChart data={days} metric="weightKg" label="Weight trend" unit=" kg" colorClass="weight-chart" />
            <TrendChart data={days} metric="calories" label="Calories eaten" unit=" kcal" colorClass="calorie-chart" />
            <TrendChart data={days} metric="protein" label="Protein intake" unit=" g" colorClass="protein-chart" />
            <TrendChart data={days} metric="waterMl" label="Water intake" unit=" ml" colorClass="water-chart" />
          </section>

          <section className="card daily-timeline-card">
            <div className="section-heading"><div><h3>Daily tracking</h3><p>Select any date to inspect everything recorded that day.</p></div><span className="muted-pill">{days.length} days</span></div>
            <div className="daily-table-wrap">
              <table className="daily-table"><thead><tr><th>Date</th><th>Weight</th><th>Calories</th><th>Protein</th><th>Water</th><th>Exercise</th><th>Tasks</th><th>Habits</th></tr></thead>
                <tbody>{days.slice().reverse().map((day) => <tr key={day.date} className={selectedDate === day.date ? 'selected' : ''} onClick={() => setSelectedDate(day.date)}><td>{niceDate(day.date)}</td><td>{day.weightKg == null ? '—' : `${Number(day.weightKg).toFixed(1)} kg`}</td><td>{Math.round(day.calories)} kcal</td><td>{Number(day.protein).toFixed(1)} g</td><td>{(day.waterMl / 1000).toFixed(1)} L</td><td>{Math.round(day.exerciseMinutes)} min</td><td>{day.tasksCompleted}/{day.tasksTotal}</td><td>{day.habitsCompleted}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="card history-details-card">
            <div className="section-heading"><div><h3>Full day history</h3><p>{niceDate(selectedDate)}</p></div>{detailsLoading && <span className="loading-label">Loading…</span>}</div>
            <div className="history-detail-grid">
              <div className="history-detail-block"><h4>🍽️ Food & calories</h4>{mealCalories.length ? mealCalories.map((log) => <div className="history-row" key={log._id}><div><strong>{log.foodName}</strong><span>{log.mealType} · {log.consumedQuantity} {log.servingUnit}</span></div><b>{Math.round(log.nutritionTotal?.calories || 0)} kcal</b></div>) : <p className="muted">No food logged.</p>}</div>
              <div className="history-detail-block"><h4>🏃 Exercise</h4>{activities.length ? activities.map((log) => <div className="history-row" key={log._id}><div><strong>{log.activityName}</strong><span>{log.durationMinutes} min · {log.category}</span></div><b>{Math.round(log.caloriesBurned || 0)} kcal</b></div>) : <p className="muted">No exercise logged.</p>}</div>
              <div className="history-detail-block"><h4>💧 Water</h4>{waterLogs.length ? waterLogs.map((log) => <div className="history-row" key={log._id}><div><strong>{log.amountMl} ml</strong><span>{log.notes || 'Water intake'}</span></div></div>) : <p className="muted">No water logged.</p>}</div>
              <div className="history-detail-block"><h4>⚖️ Weight</h4>{weights.length ? weights.map((log) => <div className="history-row" key={log._id}><div><strong>{Number(log.weightKg).toFixed(1)} kg</strong><span>{log.notes || 'Weight entry'}</span></div></div>) : <p className="muted">No weight entry.</p>}</div>
              <div className="history-detail-block"><h4>✅ Tasks</h4>{tasks.length ? tasks.map((task) => <div className="history-row" key={task._id}><div><strong>{task.title}</strong><span>{task.priority} · {task.time || 'No time'}</span></div><b>{task.completed ? 'Done' : 'Open'}</b></div>) : <p className="muted">No tasks.</p>}</div>
              <div className="history-detail-block"><h4>🔥 Habits</h4>{habitLogs.length ? habitLogs.map((log) => <div className="history-row" key={log._id}><div><strong>{log.habitName}</strong><span>{log.completedValue}/{log.target} {log.unit}</span></div><b>{log.completed ? 'Done' : 'Open'}</b></div>) : <p className="muted">No habit logs.</p>}</div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default ProgressPage;
