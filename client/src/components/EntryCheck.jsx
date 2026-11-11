// Feedback while you log food: what is left, a heavy-day plan, protein fixes, steps and training. Reads today's logs from the server,
// so it updates after every entry. Never says "fast", "skip" or "burn it off".
import { useEffect, useState } from "react";
import "./dailycoach.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";

const ICON = { CHEAT_DAY: "🍰", HEAVY: "🍽️", OVER: "💡", ON_PLAN: "✅", LOW: "🥣", UNDER: "🥣" };
const NAME = { CHEAT_DAY: "Cheat day", HEAVY: "Heavy day", OVER: "A little over", ON_PLAN: "On plan", LOW: "Under plan", UNDER: "Well under plan" };

export default function EntryCheck({ refreshKey }) {
  const [c, setC] = useState(null);
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => {
      apiFetch(`/api/coach/entry-check?today=${getLocalDate()}&hour=${new Date().getHours()}`).then((r) => (r.ok ? r.json() : null))
        .then((j) => on && setC(j?.success ? j.check : null)).catch(() => {});
    }, 400);                                       // a burst of edits asks once
    return () => { on = false; clearTimeout(t); };
  }, [refreshKey]);
  if (!c || c.status === "NO_FOOD_LOGGED" || !c.messages.length) return null;
  const hot = c.status === "CHEAT_DAY" || c.status === "HEAVY";
  return (
    <section className={`dg ${hot ? "dg-warn" : ""}`} aria-label="Feedback on today's food" role="status">
      <b className="dg-title"><span aria-hidden="true">{ICON[c.status] || "💡"} </span>{NAME[c.status] || "Today"}<span className="dg-chip">{fmt0(c.eaten)} / {fmt0(c.budget)} kcal</span></b>
      <div className="dg-body">
        <ul>{c.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
        {c.proteinFixes.length > 0 && <div className="dg-fix">{c.proteinFixes.map((f) => <span key={f.key}>+{f.grams} g {f.food}: {f.protein} g protein, {f.kcal} kcal</span>)}</div>}
        {hot && c.nextDays.length > 0 && (
          <div className="dg-days">{c.nextDays.map((d, i) => <div className="dg-day" key={d.date}><b>Day {i + 1}</b>steps {fmt0(d.steps)} · {d.note}</div>)}</div>
        )}
      </div>
    </section>
  );
}
const fmt0 = (n) => Math.round(Number(n) || 0).toLocaleString();
