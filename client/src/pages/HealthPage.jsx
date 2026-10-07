import { useCallback, useEffect, useMemo, useState } from "react";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { stepCalories } from "../utils/energy";
import GoalBar from "../components/GoalBar";

const TABS = [
  { id: "steps", label: "👟 Steps", unit: "steps" }, { id: "sleep", label: "😴 Sleep", unit: "h" },
  { id: "heartRate", label: "❤️ Heart rate", unit: "bpm" }, { id: "bloodPressure", label: "🩺 Blood pressure", unit: "mmHg" },
  { id: "glucose", label: "🩸 Glucose", unit: "mg/dL" }, { id: "waist", label: "📏 Waist", unit: "cm" },
  { id: "chest", label: "Chest", unit: "cm" }, { id: "hips", label: "Hips", unit: "cm" }, { id: "arm", label: "Arm", unit: "cm" }, { id: "thigh", label: "Thigh", unit: "cm" },
];

async function call(path, options) {
  const r = await apiFetch(`${API_URL}${path}`, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
  return data;
}

// Simple bar chart: newest on the right, optional dashed target line.
function Bars({ logs, target }) {
  const data = [...logs].reverse().slice(-30);
  if (!data.length) return <p>No readings yet.</p>;
  const max = Math.max(...data.map((d) => d.value), target || 0, 1);
  return (
    <div className="health-bars" role="img" aria-label="Recent readings">
      {target ? <div className="health-target" style={{ bottom: `${(target / max) * 100}%` }} title={`Target ${target.toLocaleString()}`} /> : null}
      {data.map((d) => <div key={d._id} className="health-bar" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.date}: ${d.value}`} />)}
    </div>
  );
}

export default function HealthPage({ onBack }) {
  const [tab, setTab] = useState("steps");
  const [logs, setLogs] = useState([]);
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");
  const [profile, setProfile] = useState(null);
  const [notice, setNotice] = useState("");
  const today = getLocalDate();
  const meta = TABS.find((t) => t.id === tab);

  const load = useCallback(async () => {
    const from = new Date(); from.setDate(from.getDate() - 59);
    const pad = (n) => String(n).padStart(2, "0");
    const f = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
    try {
      const d = await call(`/api/health-logs?type=${tab}&from=${f}&to=${today}&limit=200`);
      setLogs(Array.isArray(d.logs) ? d.logs : []);
    } catch (e) { setNotice(e.message); }
  }, [tab, today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { call("/api/profile").then((d) => setProfile(d.profile)).catch(() => {}); }, []);

  const todaySteps = tab === "steps" ? (logs.find((l) => l.date === today)?.value || 0) : 0;
  const stepsTarget = profile?.goals?.stepsTarget || 10000;

  async function save(event) {
    event.preventDefault();
    setNotice("");
    try {
      await call("/api/health-logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: tab, date: today, value: Number(value), ...(tab === "bloodPressure" ? { value2: Number(value2) } : {}), source: "manual" }) });
      setValue(""); setValue2(""); setNotice("Saved ✓"); load();
    } catch (e) { setNotice(e.message); }
  }
  async function remove(id) { try { await call(`/api/health-logs/${id}`, { method: "DELETE" }); load(); } catch (e) { setNotice(e.message); } }

  const unitLabel = useMemo(() => meta.unit, [meta]);

  return (
    <div className="large-card health-page">
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="bd-head"><h1>Health &amp; Steps</h1><Buddy scene="walk" size={76} says="Let's move!" /></div>
      <p>Steps, sleep, vitals and body measurements. For tracking only — not medical advice.</p>

      <div className="serving-chips">
        {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? "chip active" : "chip"} onClick={() => { setTab(t.id); setNotice(""); }}>{t.label}</button>)}
      </div>

      {tab === "steps" && (
        <div className="card">
          <h3>{todaySteps.toLocaleString()} steps today</h3>
          <GoalBar value={todaySteps} target={stepsTarget} unit="steps" color="#14a38b" />
          <p className="balance-sub">
            ≈ {stepCalories(todaySteps, profile?.currentWeightKg).toLocaleString()} kcal burned — added to your calories burned automatically.
            The mobile app counts steps from your phone; here you can enter or correct today's total.
          </p>
        </div>
      )}

      <form onSubmit={save} className="health-form">
        {tab === "bloodPressure" ? (
          <>
            <label>Systolic (top)<input type="number" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} required /></label>
            <label>Diastolic (bottom)<input type="number" inputMode="numeric" value={value2} onChange={(e) => setValue2(e.target.value)} required /></label>
          </>
        ) : (
          <label>{tab === "steps" ? "Total steps today" : `Value (${unitLabel})`}<input type="number" step="any" min="0" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required /></label>
        )}
        <button type="submit">{tab === "steps" ? "Update steps" : "Save reading"}</button>
        {notice && <span role="status">{notice}</span>}
      </form>

      <Bars logs={logs} target={tab === "steps" ? stepsTarget : null} />

      <h3>History</h3>
      {logs.length === 0 ? <p>Nothing logged yet.</p> : (
        <div className="activity-list">
          {logs.slice(0, 30).map((l) => (
            <div className="history-item" key={l._id}>
              <span>{l.date === today ? "Today" : l.date} — {tab === "bloodPressure" ? `${l.value}/${l.value2} mmHg` : `${Number(l.value).toLocaleString()} ${unitLabel}`}{l.source === "device" ? " (phone)" : ""}</span>
              {tab !== "steps" && <button type="button" className="chip" onClick={() => remove(l._id)}>Delete</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
