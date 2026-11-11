// Today's coach: which maintenance applies (picked from yesterday, unless you chose a level), what to do after a heavy day or a missed
// workout, and "what am I?" from your own steps, training and weight trend. Nothing here ever tells you to fast or to burn it off.
import { useCallback, useEffect, useId, useState } from "react";
import "./dailycoach.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";

const LEVELS = [["sedentary", "No activity"], ["light", "Light"], ["moderate", "Moderate"], ["very_active", "Very active"]];
const LABEL = { no_activity: "No activity", moderate: "Moderate", active: "Active" };
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();

export default function DayGuideCard() {
  const [g, setG] = useState(null);
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);          // always starts collapsed
  const [busy, setBusy] = useState(false);
  const id = useId();
  const load = useCallback(() => {
    apiFetch(`/api/coach/day-guide?today=${getLocalDate()}`).then((r) => (r.ok ? r.json() : null)).then((j) => setG(j?.success ? j.guide : null)).catch(() => {});
    apiFetch("/api/profile").then((r) => (r.ok ? r.json() : null)).then((j) => setProfile(j?.profile || null)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!g || !g.maintenance?.tdee) return null;

  const patch = async (body) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ ...body, today: getLocalDate() }) });
      if (!r.ok) throw new Error("Could not save.");
      notify("Saved. Your calorie target follows it.", "success");
      load();
    } catch (e) { notify(e.message || "Could not save.", "error"); } finally { setBusy(false); }
  };

  const m = g.maintenance, a = g.activity || {}, rec = g.recovery;
  const manual = (profile?.activityMode || m.mode) !== "auto";
  const hot = !!rec || g.yesterday?.missedWorkout;
  const title = rec ? `Recovery day ${rec.dayIndex}/3` : `Maintenance today: about ${fmt(m.tdee)} kcal`;
  const sub = rec ? `After ${rec.date} · normal meals, no fasting, steps ${fmt(rec.stepsTarget)}` : `${LABEL[m.label] || m.label} · ${m.basis}`;

  return (
    <section className={`dg ${hot ? "dg-warn" : ""}`} aria-label="Today's coach">
      <button type="button" className="dg-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="dg-ic" aria-hidden="true">{rec ? "🌿" : g.yesterday?.missedWorkout ? "🏋️" : "🧭"}</span>
        <span><b className="dg-title">{title}</b><span className="dg-sub">{sub}</span></span>
      </button>
      {open && (
        <div className="dg-body" id={id}>
          <ul>{g.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          {rec && (
            <div className="dg-days">
              {rec.days.map((d, i) => <div className="dg-day" key={d.date}><b>{i + 1 === rec.dayIndex ? "Today" : d.date}</b>steps {fmt(d.steps)} · {d.note}</div>)}
            </div>
          )}
          <div className="dg-seg" role="group" aria-label="Safe minimum calories">
            <span className="dg-sub">Safe minimum</span>
            {[[null, "Default"], [1600, "1,600"], [1700, "1,700"], [1800, "1,800"]].map(([v, l]) => (
              <button key={l} type="button" className={(profile?.goals?.calorieFloor ?? null) === v ? "on" : ""} disabled={busy} onClick={() => patch({ goals: { calorieFloor: v } })}>{l}</button>
            ))}
          </div>
          {a.message && <p className="dg-sub"><b>What am I?</b> {a.message}</p>}
          <div className="dg-seg" role="group" aria-label="Activity level">
            <button type="button" className={manual ? "" : "on"} disabled={busy} onClick={() => patch({ activityMode: "auto" })}>Automatic</button>
            <button type="button" className={manual ? "on" : ""} disabled={busy} onClick={() => patch({ activityMode: "manual" })}>I choose</button>
            {manual && (
              <select aria-label="My activity level" value={profile?.activityLevel || "moderate"} disabled={busy} onChange={(e) => patch({ activityMode: "manual", activityLevel: e.target.value })}>
                {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {a.switch && a.suggestedAppLevel && <button type="button" disabled={busy} onClick={() => patch({ activityMode: "manual", activityLevel: a.suggestedAppLevel })}>Switch to {LABEL[a.suggested]}</button>}
          </div>
        </div>
      )}
    </section>
  );
}
