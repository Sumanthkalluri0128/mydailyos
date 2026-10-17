import { useCallback, useEffect, useState } from "react";
import "./fatloss.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";

const api = async (method, path, body) => {
  const r = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Something went wrong");
  return j;
};

// "My plan": north-star goal, outcome badges (bronze / silver / gold), rewards you choose, event mode, maintenance break,
// the what-if simulator and the safety switches.
export default function NorthStarPanel() {
  const today = getLocalDate();
  const [d, setD] = useState(null);
  const [out, setOut] = useState(null);
  const [targetKg, setTargetKg] = useState("");
  const [byDate, setByDate] = useState("");
  const [preview, setPreview] = useState(null);
  const [rAt, setRAt] = useState(""); const [rText, setRText] = useState("");
  const [eTitle, setETitle] = useState(""); const [eStart, setEStart] = useState(today); const [eEnd, setEEnd] = useState(today);
  const [extra, setExtra] = useState("900"); const [repeats, setRepeats] = useState("0"); const [wi, setWi] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api("GET", `/api/plan?today=${today}`);
      setD(r);
      if (r.plan.active) { setTargetKg((v) => v || String(r.plan.targetKg || "")); setByDate((v) => v || r.plan.byDate || ""); }
      api("GET", `/api/plan/outcomes?today=${today}`).then(setOut).catch(() => {});
    } catch { /* optional panel */ }
  }, [today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = Number(targetKg);
    if (!(k > 0)) { setPreview(null); return undefined; }
    const t = setTimeout(() => api("GET", `/api/plan/preview?targetKg=${k}${byDate ? `&byDate=${byDate}` : ""}&today=${today}`).then((r) => setPreview(r.derived)).catch((e) => setPreview({ ok: false, reason: e.message })), 400);
    return () => clearTimeout(t);
  }, [targetKg, byDate, today]);

  const run = async (fn, ok) => { try { await fn(); notify(ok, "success"); load(); } catch (e) { notify(e.message, "error"); } };
  if (!d) return null;
  const hide = d.safety.hideNumbers; const mask = (s) => (hide ? "••" : s);
  const active = d.plan.active;

  return (
    <section>
      <div className="fl-card">
        <p className="fl-eyebrow">My plan</p>
        <h3>{active ? "Your goal" : "Set one north-star goal"}</h3>
        <p>Pick the weight you want and, if you like, a date. We work out a safe pace and three weekly habits.</p>
        <label className="fl-field">Goal weight (kg)<input inputMode="decimal" value={targetKg} onChange={(e) => setTargetKg(e.target.value)} placeholder="e.g. 74" /></label>
        <label className="fl-field">By when (optional)<input type="date" value={byDate} min={today} onChange={(e) => setByDate(e.target.value)} /></label>
        {preview && (
          <div className="fl-preview">
            {preview.ok === false ? <p className="ink">{preview.reason}</p> : <><strong>{preview.direction === "maintain" ? "Maintain" : `About ${preview.paceKg} kg a week`}</strong><p className="ink">{preview.note}</p>
              {preview.feasible === false && preview.suggestedDate && <button className="fl-btn ghost" onClick={() => run(() => api("PUT", `/api/plan?today=${today}`, { targetKg: Number(targetKg), byDate, useSafeDate: true }), "Your plan is set.")}>Use the safer date ({preview.suggestedDate})</button>}</>}
          </div>
        )}
        <button className="fl-btn" disabled={!preview || preview.ok === false} onClick={() => run(() => api("PUT", `/api/plan?today=${today}`, { targetKg: Number(targetKg), byDate }), "Your plan is set.")}>{active ? "Update my plan" : "Start my plan"}</button>
      </div>

      {out && (
        <div className="fl-card">
          <h3>Real progress</h3>
          <p>Badges for what changed, not just what you logged. {out.streak?.weekly && `Weekly streak: ${out.streak.weekly.weeks} week${out.streak.weekly.weeks === 1 ? "" : "s"} (a week counts at ${out.streak.weekly.need} of 7 days; this week ${out.streak.weekly.daysThisWeek}).`}</p>
          {out.streak?.comeback && <p className="ink"><strong>🌅 Welcome back! Coming back after {out.streak.comeback.missedDays} days is what matters most.</strong></p>}
          <div className="fl-badges">
            {out.badges.map((b) => (
              <div key={b.id} className={`fl-badge ${b.tier ? "" : "locked"}`}>
                <div className={`fl-medal ${b.tier || ""}`}>{b.emoji}</div>
                <div style={{ flex: 1 }}>
                  <strong>{b.name}{b.tier ? ` · ${b.tier}` : ""}</strong>
                  <p>{b.description}</p>
                  {b.nextAt && <><div className="fl-bar"><i style={{ width: `${Math.round(b.progress * 100)}%` }} /></div><p>next: {b.nextAt} {b.unit}</p></>}
                </div>
              </div>
            ))}
          </div>
          {out.bodyFat?.current != null && <p className="ink" style={{ marginTop: 10 }}>Estimated body fat: <strong>{out.bodyFat.current}%</strong>{out.bodyFat.change != null ? ` (${out.bodyFat.change > 0 ? "+" : ""}${out.bodyFat.change} since you started)` : ""}. Estimated from tape measurements; use it to see change over time.</p>}
        </div>
      )}

      <div className="fl-card">
        <h3>🎁 Reward ladder</h3>
        <p>Choose your own non-food rewards at milestones.</p>
        {d.rewards.map((r) => (
          <div key={r.id} className="fl-row" style={{ marginTop: 8 }}>
            <span><strong>{r.reached ? "🎉" : "🔒"} {r.text}</strong><br /><small style={{ color: "var(--text-muted)" }}>{mask(`at ${r.atKg} kg lost`)}{r.claimedAt ? " · enjoyed" : r.reached ? " · unlocked!" : mask(` · ${r.remainingKg} kg to go`)}</small></span>
            <span>{r.reached && !r.claimedAt && <button className="fl-chip" onClick={() => run(() => api("POST", `/api/plan/rewards/${r.id}/claim?today=${today}`, {}), "Enjoy it. You earned it.")}>I enjoyed it</button>}<button className="fl-chip" onClick={() => run(() => api("DELETE", `/api/plan/rewards/${r.id}`), "Removed.")} aria-label={`Remove ${r.text}`}>✕</button></span>
          </div>
        ))}
        <label className="fl-field">After losing (kg)<input inputMode="decimal" value={rAt} onChange={(e) => setRAt(e.target.value)} placeholder="3" /></label>
        <label className="fl-field">Reward<input value={rText} maxLength={80} onChange={(e) => setRText(e.target.value)} placeholder="New running shoes" /></label>
        <button className="fl-btn" onClick={() => (Number(rAt) > 0 && rText.trim() ? run(async () => { await api("POST", "/api/plan/rewards", { atKg: Number(rAt), text: rText.trim() }); setRAt(""); setRText(""); }, "Reward added.") : notify("Enter the kg and the reward.", "error"))}>Add reward</button>
      </div>

      <div className="fl-card">
        <h3>🎉 Event mode</h3>
        <p>Diwali, a wedding, a trip. We bank a little room before, relax during, and recover gently after, with no pressure.</p>
        {(d.plan.events || []).map((e) => <div key={e.id} className="fl-row" style={{ marginTop: 6 }}><strong>{e.title} · {e.startDate}{e.endDate !== e.startDate ? ` → ${e.endDate}` : ""}</strong><button className="fl-chip" onClick={() => run(() => api("DELETE", `/api/plan/events/${e.id}`), "Removed.")}>✕</button></div>)}
        {d.event.phase !== "none" && <p className="ink">{d.event.message}</p>}
        <label className="fl-field">Event<input value={eTitle} maxLength={60} onChange={(e) => setETitle(e.target.value)} placeholder="Diwali" /></label>
        <label className="fl-field">Starts<input type="date" value={eStart} onChange={(e) => { setEStart(e.target.value); if (eEnd < e.target.value) setEEnd(e.target.value); }} /></label>
        <label className="fl-field">Ends<input type="date" value={eEnd} min={eStart} onChange={(e) => setEEnd(e.target.value)} /></label>
        <button className="fl-btn" onClick={() => (eTitle.trim() ? run(async () => { await api("POST", "/api/plan/events", { title: eTitle.trim(), startDate: eStart, endDate: eEnd }); setETitle(""); }, "Event added.") : notify("Name the event.", "error"))}>Add event</button>
      </div>

      <div className="fl-card">
        <h3>🌿 Maintenance break</h3>
        <p>{d.break.message || "After 8–12 weeks of dieting, two weeks at maintenance helps your body and your head."}</p>
        {d.plan.breakUntil
          ? <button className="fl-btn" onClick={() => run(() => api("POST", `/api/plan/break?today=${today}`, { action: "end" }), "Break ended. Your plan target is back.")}>On a break until {d.plan.breakUntil}. End it now</button>
          : <button className="fl-btn ghost" onClick={() => window.confirm("Set your calorie target to maintenance for 14 days, then return to your plan?") && run(() => api("POST", `/api/plan/break?today=${today}`, { action: "start" }), "Break started.")}>Start a 2-week maintenance break</button>}
      </div>

      <div className="fl-card">
        <h3>🔮 What if…?</h3>
        <p>“If I have this biryani, when do I reach my goal?” (a restaurant biryani is roughly 900 kcal)</p>
        <label className="fl-field">Extra calories<input inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
        <div style={{ marginTop: 8 }}>{[["0", "Just once"], ["1", "Weekly"], ["3", "3× a week"], ["7", "Every day"]].map(([v, l]) => <button key={v} className={`fl-chip ${repeats === v ? "on" : ""}`} onClick={() => setRepeats(v)}>{l}</button>)}</div>
        <button className="fl-btn" onClick={() => api("GET", `/api/plan/what-if?extraKcal=${Number(extra) || 0}&repeats=${Number(repeats) || 0}&today=${today}`).then((r) => setWi(r.result)).catch((e) => notify(e.message, "error"))}>Show me</button>
        {wi && <><p className="ink"><strong>{wi.message}</strong></p><p>On plan: {wi.baseDate}{wi.newDate ? ` · with this: ${wi.newDate}` : ""}</p></>}
      </div>

      <div className="fl-card">
        <h3>💛 Safety & comfort</h3>
        <p>“Hide numbers” hides weights and calorie counts across the app. The plan keeps working behind the scenes.</p>
        <button className={`fl-chip ${hide ? "on" : ""}`} onClick={() => run(() => api("PATCH", "/api/plan/safety", { hideNumbers: !hide }), hide ? "Numbers are visible again." : "Numbers are hidden.")}>{hide ? "Numbers are hidden" : "Hide numbers"}</button>
        {d.safety.flags.map((f) => <div key={f.id} className="fl-find"><span>💛</span><div><strong>{f.title}</strong><p>{f.detail}</p></div></div>)}
      </div>
    </section>
  );
}
