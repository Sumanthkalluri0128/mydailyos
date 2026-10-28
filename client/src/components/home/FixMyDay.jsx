// "Fix my day": what to do right now when today runs over. Calm, specific, never punishing.
// Uses the same engine as the rest of the app: /api/plan/over-days (safe spread correction), /api/food-logs (+ "halve"), /api/plan/rescue-day.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";
import { notify } from "../../utils/notify";

const n0 = (v) => Math.round(Number(v) || 0);
const MEAL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };

export default function FixMyDay({ over, hour, onChanged, onPlan, onClose }) {
  const today = getLocalDate();
  const [logs, setLogs] = useState(null);
  const [adv, setAdv] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    apiFetch(`/api/food-logs?date=${today}`).then((r) => (r.ok ? r.json() : null)).then((j) => setLogs(j?.success ? j.logs : [])).catch(() => setLogs([]));
    apiFetch(`/api/plan/over-days?today=${today}&tz=${new Date().getTimezoneOffset()}`).then((r) => (r.ok ? r.json() : null)).then((j) => setAdv(j?.success ? j : null)).catch(() => {});
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const heavy = (logs || []).map((l) => ({ id: l._id, name: l.foodName, meal: l.mealType, kcal: n0(l.nutritionTotal?.calories) })).filter((l) => l.kcal >= 150).sort((a, b) => b.kcal - a.kcal).slice(0, 3);

  const halve = async (it) => {
    setBusy(it.id);
    try {
      const r = await apiFetch(`/api/food-logs/${it.id}`, { method: "PATCH", body: JSON.stringify({ halve: true }) });
      if (!r.ok) throw new Error();
      notify(`${it.name} set to half a portion.`, "success");
      onChanged?.(); load();
    } catch { notify("Could not update that entry.", "error"); } finally { setBusy(""); }
  };
  const rescue = async () => {
    setBusy("plan");
    try {
      const r = await apiFetch("/api/plan/rescue-day", { method: "POST", body: JSON.stringify({ date: addDays(today, 1), today, ...(adv?.advice && !adv.advice.skipCut ? { goal: adv.advice.tomorrowTarget } : {}) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      notify(`Gentle day planned for tomorrow (about ${j.goal} kcal${j.fixedMeals?.length ? `, around what you already logged` : ""}).`, "success");
      onClose(); onPlan?.();
    } catch (e) { notify(e.message || "Could not plan it.", "error"); } finally { setBusy(""); }
  };

  if (over <= 0) {
    return (
      <div className="fx">
        <p className="fx-lead">You are back within today's budget. Nothing to fix. 🎉</p>
        <button type="button" className="fx-btn" onClick={onClose}>Done</button>
      </div>
    );
  }

  const c = adv?.correction;
  const a = adv?.advice || null;
  const cycle = adv?.cause === "undereating_cycle";
  const late = hour >= 21 || hour < 5;
  return (
    <div className="fx">
      <p className="fx-lead"><b>{over.toLocaleString()} kcal over.</b> One day barely moves your weight, so no punishing. Here is a calm way to handle it.</p>
      <ol className="fx-steps">
        {cycle
          ? <li><span>1</span><div><b>Do not skip meals to make up for it</b><p>This heavy day came after a very light one. Eat regular meals, with protein in each, so hunger stays steady. Restricting again is what sets up the next big day.</p></div></li>
          : <li><span>1</span><div><b>{late ? "It's late: keep it simple" : "Rest of today: keep it light"}</b><p>{late ? "Skip extra snacks, sip water and sleep well. A good night helps hunger tomorrow." : "Clear soup, salad, curd or buttermilk. If you are not hungry, skip the extra snack."}</p></div></li>}
        <li><span>2</span><div><b>Walk for 15 minutes</b><p>Burns about {adv?.walkKcal || 70} kcal at your weight and helps digestion. It does not cancel the food, so treat it as a bonus. Log the steps after.</p></div></li>
        {a
          ? <li><span>3</span><div><b>{a.skipCut ? "No cutting needed" : `Tomorrow: about ${a.perDay} kcal lighter, for ${a.days} day${a.days > 1 ? "s" : ""}`}</b><p>{a.headline} {a.detail}</p></div></li>
          : <li><span>3</span><div><b>{c?.safe ? `Tomorrow: about ${c.perDay} kcal lighter, for ${c.days} days` : "No cutting needed"}</b><p>{c ? c.note : "Eat your normal plan tomorrow. A small overshoot does not need paying back."}</p></div></li>}
      </ol>
      {heavy.length > 0 && (
        <div className="fx-log">
          <b>Check your log</b>
          <p>If any portion was smaller than what you logged, correct it so the numbers stay honest.</p>
          {heavy.map((it) => (
            <div className="fx-item" key={it.id}>
              <span><strong>{it.name}</strong><small>{MEAL[it.meal] || it.meal} · {it.kcal} kcal</small></span>
              <button type="button" disabled={!!busy} onClick={() => halve(it)}>{busy === it.id ? "…" : `Was half · −${Math.round(it.kcal / 2)}`}</button>
            </div>
          ))}
        </div>
      )}
      <div className="fx-actions">
        {!(a && a.skipCut) && <button type="button" className="fx-btn" disabled={!!busy} onClick={rescue}>🌿 Plan a gentle day for tomorrow</button>}
        <button type="button" className="fx-btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
