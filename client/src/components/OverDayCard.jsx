import { useCallback, useEffect, useState } from "react";
import "./fatloss.css";
import "./autoplan.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import Buddy from "../motion/Buddy";

const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const TITLES = { none: "Go a little lighter", single: "A little over", streak: "days over · course-correct", week: "This week ran over · review" };

// Over-calorie days, handled kindly: a gentle note, a small spread-out trim, or a root-cause review. Never "burn it off".
export default function OverDayCard({ onPlan }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [min, setMin] = useState(false);
  const load = useCallback(() => {
    apiFetch(`/api/plan/over-days?today=${getLocalDate()}&tz=${new Date().getTimezoneOffset()}`).then((r) => (r.ok ? r.json() : null)).then((j) => setD(j?.success ? j : null)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const key = d ? `${d.tier}|${d.advice?.level || ""}|${getLocalDate()}` : "";
  useEffect(() => { if (!key) return; try { setMin(localStorage.getItem("ff_overday_min") === key); } catch { /* ignore */ } }, [key]);
  if (!d || (d.tier === "none" && !d.advice)) return null;
  const toggle = () => setMin((m) => { const next = !m; try { if (next) localStorage.setItem("ff_overday_min", key); else localStorage.removeItem("ff_overday_min"); } catch { /* ignore */ } return next; });
  const title = d.tier === "streak" ? `${d.runDays} ${TITLES.streak}` : TITLES[d.tier];

  const rescue = async () => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/plan/rescue-day", { method: "POST", body: JSON.stringify({ date: addDays(getLocalDate(), 1), today: getLocalDate() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      notify(`Gentle day planned for tomorrow (about ${j.goal} kcal). Edit it in the planner.`, "success");
      onPlan?.();
    } catch (e) { notify(e.message || "Could not plan it.", "error"); } finally { setBusy(false); }
  };
  const easier = async () => {
    const r = await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ goals: { weeklyPaceKg: d.easierPace } }) });
    if (r.ok) { notify(`Pace is now ${d.easierPace} kg a week. Your daily budget just got bigger.`, "success"); load(); } else notify("Could not change your pace.", "error");
  };

  if (min) {
    return (
      <div className={`fl-card od-min ${d.tier === "single" ? "" : "accent"}`}>
        <button type="button" className="od-bar" onClick={toggle} aria-expanded="false">
          <Buddy scene="cheer" size={40} />
          <span className="od-t"><b>{title}</b><small>{d.advice?.headline || d.message}</small></span>
          <span className="od-chev" aria-hidden="true">Show ▾</span>
        </button>
      </div>
    );
  }
  return (
    <div className={`fl-card ${d.tier === "single" ? "" : "accent"}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Buddy scene="cheer" size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="fl-eyebrow">{title}</p>
          <p className="ink">{d.advice?.headline || d.message}</p>
        </div>
        <button type="button" className="od-toggle" onClick={toggle} aria-expanded="true" aria-label="Minimise this card">Hide ▴</button>
      </div>
      {d.advice && (
        <div className="ib" style={{ marginTop: 10 }}><span className="ib-ic" aria-hidden="true">🎯</span><div><b>{d.advice.skipCut ? "No cutting needed" : `Aim for about ${Math.round(d.advice.todayTarget).toLocaleString()} kcal ${d.advice.todayTarget < d.target ? "today" : "tomorrow"}`}</b><p>{d.advice.detail}</p>{onPlan && <button type="button" className="link-button" onClick={onPlan}>Plan lighter meals →</button>}</div></div>
      )}
      {d.correction && !d.advice && <><h3 style={{ marginTop: 10 }}>{d.correction.safe ? `A gentle plan: about ${d.correction.perDay} kcal less a day for ${d.correction.days} days` : "No cutting needed"}</h3><p>{d.correction.note}</p></>}
      {d.cause === "pace_too_aggressive" && d.easierPace && <button className="fl-btn" onClick={easier}>Switch to an easier pace ({d.easierPace} kg/week){d.easierTarget ? ` · ${d.easierTarget} kcal/day` : ""}</button>}
      {d.causes?.enough && d.causes.findings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>What seems to be driving it</h3>
          {d.causes.findings.map((f) => <div key={f.id} className="fl-find"><span aria-hidden="true">{f.icon}</span><div><strong>{f.title}</strong><p>{f.detail}</p></div></div>)}
        </div>
      )}
      {d.tier !== "single" && <div><button className="fl-btn ghost" disabled={busy} onClick={rescue}>🌿 Plan a gentle day for tomorrow</button></div>}
    </div>
  );
}
