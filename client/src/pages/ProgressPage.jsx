import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";

function parseDate(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value, amount) {
  const d = parseDate(value);
  if (!d) return value;
  d.setDate(d.getDate() + amount);
  return formatDate(d);
}

function startOfWeek(value) {
  const d = parseDate(value);
  if (!d) return value;
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return formatDate(d);
}

function endOfWeek(value) {
  return addDays(startOfWeek(value), 6);
}

function startOfMonth(value) {
  const d = parseDate(value);
  if (!d) return value;
  d.setDate(1);
  return formatDate(d);
}

function endOfMonth(value) {
  const d = parseDate(value);
  if (!d) return value;
  d.setMonth(d.getMonth() + 1, 0);
  return formatDate(d);
}

function startOfYear(value) {
  const d = parseDate(value);
  if (!d) return value;
  d.setMonth(0, 1);
  return formatDate(d);
}

function endOfYear(value) {
  const d = parseDate(value);
  if (!d) return value;
  d.setMonth(11, 31);
  return formatDate(d);
}

function getPeriodRange(mode, anchor) {
  if (mode === "day") return { from: anchor, to: anchor };
  if (mode === "week") return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
  if (mode === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
  if (mode === "year") return { from: startOfYear(anchor), to: endOfYear(anchor) };
  return { from: anchor, to: anchor };
}

function shiftPeriod(mode, anchor, direction) {
  const d = parseDate(anchor);
  if (!d) return anchor;
  if (mode === "day") d.setDate(d.getDate() + direction);
  if (mode === "week") d.setDate(d.getDate() + direction * 7);
  if (mode === "month") d.setMonth(d.getMonth() + direction);
  if (mode === "year") d.setFullYear(d.getFullYear() + direction);
  return formatDate(d);
}

function shortDate(value) {
  return parseDate(value)?.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) || value;
}

function fullDate(value) {
  return parseDate(value)?.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) || value;
}

function rangeLabel(mode, from, to) {
  if (mode === "day") return fullDate(from);
  if (mode === "week") return `${shortDate(from)} – ${shortDate(to)}`;
  if (mode === "month") return parseDate(from)?.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) || "Month";
  if (mode === "year") return parseDate(from)?.getFullYear()?.toString() || "Year";
  return `${fullDate(from)} – ${fullDate(to)}`;
}

function TrendChart({ data, metric, label, unit = "", decimals = 0 }) {
  const points = data.filter((d) => Number.isFinite(Number(d[metric])));
  if (!points.length) return <div className="trend-chart"><div className="progress-empty">No {label.toLowerCase()} recorded for this period.</div></div>;

  const width = 900;
  const height = 290;
  const pad = { left: 56, right: 20, top: 24, bottom: 42 };
  const values = points.map((p) => Number(p[metric]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(Math.abs(max) * 0.08, metric === "weightKg" ? 0.5 : 10);
  const low = Math.max(0, min - spread * 0.15);
  const high = max + spread * 0.15;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.top + (1 - (v - low) / (high - low)) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(p[metric])).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points.length - 1)},${pad.top + innerH} L ${x(0)},${pad.top + innerH} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => low + (high - low) * ratio);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  return (
    <div className="trend-chart">
      <div className="trend-chart-header">
        <div><strong>{label}</strong><span>{points.length} day{points.length === 1 ? "" : "s"} in view</span></div>
        <span>{values[values.length - 1].toFixed(decimals)}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} trend chart`} className="trend-svg">
        {grid.map((value, i) => {
          const yy = y(value);
          return <g key={i}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" /><text x={pad.left - 9} y={yy + 4} textAnchor="end" className="chart-y-label">{value.toFixed(decimals)}</text></g>;
        })}
        <path d={area} className="chart-area" />
        <path d={path} className="chart-line" />
        {points.map((p, i) => <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(Number(p[metric]))} r="4.5" className="chart-dot"><title>{fullDate(p.date)}: {Number(p[metric]).toFixed(decimals)}{unit}</title></circle>)}
        {points.map((p, i) => i % labelEvery === 0 || i === points.length - 1 ? <text key={`x-${p.date}-${i}`} x={x(i)} y={height - 14} textAnchor="middle" className="chart-x-label">{shortDate(p.date)}</text> : null)}
      </svg>
    </div>
  );
}

function ProgressPage({ onBack }) {
  const today = getLocalDate();
  const [mode, setMode] = useState("week");
  const [anchor, setAnchor] = useState(today);
  const initial = getPeriodRange("week", today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadHistory = async (start, end, preferredDate = null) => {
    setLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/api/progress/history?from=${start}&to=${end}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to load progress");
      setData(json);
      const candidate = preferredDate || anchor;
      setSelectedDate(json.days.some((d) => d.date === candidate) ? candidate : end);
    } catch (error) {
      console.error(error);
      notify(error.message || "Unable to load progress history.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === "custom") return;
    const range = getPeriodRange(mode, anchor);
    setFrom(range.from);
    setTo(range.to);
    loadHistory(range.from, range.to, anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchor]);

  useEffect(() => {
    if (selectedDate) {
      loadDetails(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const loadDetails = async (date) => {
    setDetailsLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/api/progress/day?date=${date}`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || `History request failed (${response.status})`);
      }
      setDetails({
        food: { logs: json.food || [] },
        activity: { logs: json.exercise || [] },
        water: { logs: json.water || [] },
        tasks: { tasks: json.tasks || [] },
        habits: { logs: json.habits || [] },
        weight: { logs: json.weight || [] },
      });
    } catch (error) {
      console.error(error);
      notify(error.message || "Could not load the selected day's history.", "error");
    } finally {
      setDetailsLoading(false);
    }
  };

  const applyCustom = () => {
    if (!from || !to || from > to) {
      notify("Please select a valid date range.", "error");
      return;
    }
    setMode("custom");
    setAnchor(from);
    loadHistory(from, to, from);
  };

  const selectMode = (nextMode) => {
    setMode(nextMode);
    if (nextMode !== "custom") {
      const range = getPeriodRange(nextMode, anchor);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const navigatePeriod = (direction) => {
    if (mode === "custom") return;
    setAnchor(shiftPeriod(mode, anchor, direction));
  };

  const goToday = () => {
    setMode(mode === "custom" ? "day" : mode);
    setAnchor(today);
  };

  const days = data?.days || [];
  const selectedDay = days.find((d) => d.date === selectedDate);
  const totals = data?.totals || {};
  const averages = useMemo(() => {
    const n = days.length || 1;
    return {
      calories: Number(totals.calories || 0) / n,
      protein: Number(totals.protein || 0) / n,
      water: Number(totals.waterMl || 0) / n,
      exercise: Number(totals.exerciseMinutes || 0) / n,
    };
  }, [days, totals]);

  const mealCalories = details?.food?.logs || [];
  const activities = details?.activity?.logs || [];
  const waterLogs = details?.water?.logs || [];
  const tasks = details?.tasks?.tasks || [];
  const habitLogs = details?.habits?.logs || [];
  const weights = details?.weight?.logs || [];

  return (
    <div className="progress-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Progress & history</p>
          <h2>See your journey clearly 📈</h2>
          <p>Choose Day, Week, Month or Year. The date range automatically follows your selection.</p>
        </div>
        <button className="secondary-button" onClick={onBack}>← Dashboard</button>
      </div>

      <section className="progress-toolbar card">
        <div className="period-mode-row">
          {[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom']].map(([key, text]) => (
            <button key={key} className={`period-mode ${mode === key ? 'active' : ''}`} onClick={() => selectMode(key)}>{text}</button>
          ))}
        </div>

        <div className="period-navigation">
          <button className="period-nav-button" disabled={mode === 'custom'} onClick={() => navigatePeriod(-1)} aria-label="Previous period">‹</button>
          <div className="period-current">
            <button className="period-today-button" onClick={goToday}>Today</button>
            <strong>{rangeLabel(mode, from, to)}</strong>
          </div>
          <button className="period-nav-button" disabled={mode === 'custom'} onClick={() => navigatePeriod(1)} aria-label="Next period">›</button>
        </div>

        {mode === "custom" ? (
          <div className="date-range-controls">
            <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button className="primary-button" onClick={applyCustom}>Apply range</button>
          </div>
        ) : (
          <div className="selected-period-info">
            <span>Selected date</span>
            <input aria-label="Anchor date" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            <span className="muted-pill">{from} → {to}</span>
          </div>
        )}
      </section>

      {loading ? <div className="card progress-empty">Loading your complete history…</div> : (
        <>
          <section className="stats-grid progress-summary-grid">
            <div className="card"><span className="card-icon">⚖️</span><p>Weight</p><h3>{selectedDay?.weightKg != null ? Number(selectedDay.weightKg).toFixed(1) : "—"}<small> kg</small></h3><div className="card-description">Latest recorded weight for the selected date.</div></div>
            <div className="card"><span className="card-icon">🍽️</span><p>Avg calories/day</p><h3>{Math.round(averages.calories)}<small> kcal</small></h3><div className="card-description">{Math.round(totals.calories || 0)} kcal across this period.</div></div>
            <div className="card"><span className="card-icon">💧</span><p>Avg water/day</p><h3>{(averages.water / 1000).toFixed(1)}<small> L</small></h3><div className="card-description">{((totals.waterMl || 0) / 1000).toFixed(1)} L recorded.</div></div>
            <div className="card"><span className="card-icon">🏃</span><p>Exercise</p><h3>{Math.round(totals.exerciseMinutes || 0)}<small> min</small></h3><div className="card-description">{Math.round(totals.caloriesBurned || 0)} kcal burned.</div></div>
            <div className="card"><span className="card-icon">🚶</span><p>Steps</p><h3>{Math.round(totals.steps || 0).toLocaleString()}</h3><div className="card-description">Synced from Samsung Health when available.</div></div>
          </section>

          <section className="progress-charts-grid">
            <TrendChart data={days} metric="weightKg" label="Weight trend" unit=" kg" decimals={1} />
            <TrendChart data={days} metric="calories" label="Calories eaten" unit=" kcal" />
            <TrendChart data={days} metric="protein" label="Protein intake" unit=" g" decimals={1} />
            <TrendChart data={days} metric="waterMl" label="Water intake" unit=" ml" />
            <TrendChart data={days} metric="steps" label="Steps" unit=" steps" />
          </section>

          <section className="card daily-timeline-card">
            <div className="section-heading"><div><h3>Daily tracking</h3><p>Tap a day to see every food, exercise, water, weight, task and habit entry.</p></div><span className="muted-pill">{days.length} days</span></div>
            <div className="daily-day-picker">
              {days.map((day) => (
                <button key={day.date} className={`daily-day-chip ${selectedDate === day.date ? "active" : ""}`} onClick={() => { setSelectedDate(day.date); setAnchor(day.date); }}>
                  <strong>{shortDate(day.date)}</strong>
                  <span>{Math.round(day.calories)} kcal</span>
                </button>
              ))}
            </div>
            <div className="daily-table-wrap">
              <table className="daily-table"><thead><tr><th>Date</th><th>Weight</th><th>Calories</th><th>Protein</th><th>Water</th><th>Exercise</th><th>Steps</th><th>Tasks</th><th>Habits</th></tr></thead>
                <tbody>{days.slice().reverse().map((day) => <tr key={day.date} className={selectedDate === day.date ? 'selected' : ''} onClick={() => { setSelectedDate(day.date); setAnchor(day.date); }}><td>{fullDate(day.date)}</td><td>{day.weightKg == null ? '—' : `${Number(day.weightKg).toFixed(1)} kg`}</td><td>{Math.round(day.calories)} kcal</td><td>{Number(day.protein).toFixed(1)} g</td><td>{(day.waterMl / 1000).toFixed(1)} L</td><td>{Math.round(day.exerciseMinutes)} min</td><td>{Math.round(day.steps || 0).toLocaleString()}</td><td>{day.tasksCompleted}/{day.tasksTotal}</td><td>{day.habitsCompleted}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="card history-details-card">
            <div className="section-heading"><div><h3>Full history for {fullDate(selectedDate)}</h3><p>Everything recorded on this exact day.</p></div>{detailsLoading && <span className="loading-label">Loading…</span>}</div>
            <div className="history-detail-grid">
              <div className="history-detail-block"><h4>🍽️ Food & calories</h4>{mealCalories.length ? mealCalories.map((log) => <div className="history-row" key={log._id}><div><strong>{log.foodName}</strong><span>{log.mealType} · {log.consumedQuantity} {log.servingUnit}</span></div><b>{Math.round(log.nutritionTotal?.calories || 0)} kcal</b></div>) : <p className="muted">No food logged.</p>}</div>
              <div className="history-detail-block"><h4>🏃 Exercise</h4>{activities.length ? activities.map((log) => <div className="history-row" key={log._id}><div><strong>{log.activityName}</strong><span>{log.durationMinutes} min · {log.category}</span></div><b>{Math.round(log.caloriesBurned || 0)} kcal</b></div>) : <p className="muted">No exercise logged.</p>}</div>
              <div className="history-detail-block"><h4>🚶 Steps</h4><div className="history-row"><div><strong>{Math.round(details?.steps || details?.summary?.steps || 0).toLocaleString()} steps</strong><span>Samsung Health / Health Connect</span></div></div></div>
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
