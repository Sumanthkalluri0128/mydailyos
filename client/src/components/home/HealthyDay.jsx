// "Healthy day": a balanced, varied full-day plan from a curated food list (not limited to what you have logged before).
// Pick a style and a day, shuffle for another version, and add it to the Meal Planner in one tap.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { getLocalDate } from "../../utils/date";
import { notify } from "../../utils/notify";

const MEAL = { breakfast: ["🌅", "Breakfast"], lunch: ["☀️", "Lunch"], dinner: ["🌙", "Dinner"], snacks: ["🍎", "Snacks"] };
const DIETS = [["v", "🥦 Veg"], ["e", "🥚 Egg"], ["n", "🍗 Non-veg"]];
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const qty = (i) => (i.servings === 1 ? `1 ${i.unit}` : `${i.servings} ${i.unit}`);

export default function HealthyDay({ onClose, onPlan }) {
  const today = getLocalDate();
  const [diet, setDiet] = useState(() => { try { return localStorage.getItem("ff_diet") || "v"; } catch { return "v"; } });
  const [off, setOff] = useState(0);          // 0 = today, 1 = tomorrow
  const [variant, setVariant] = useState(0);
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const date = addDays(today, off);

  const load = useCallback(() => {
    setDay(null);
    apiFetch(`/api/plan/diet-day?today=${today}&date=${date}&diet=${diet}&variant=${variant}`).then((r) => (r.ok ? r.json() : null)).then((j) => setDay(j?.success ? j : false)).catch(() => setDay(false));
  }, [today, date, diet, variant]);
  useEffect(() => { load(); }, [load]);
  const pickDiet = (d) => { setDiet(d); try { localStorage.setItem("ff_diet", d); } catch { /* ignore */ } };

  const apply = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/plan/diet-day/apply?today=${today}`, { method: "POST", body: JSON.stringify({ date, diet, variant }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      notify(`Healthy day added to your planner for ${off ? "tomorrow" : "today"}.`, "success");
      onClose(); onPlan?.();
    } catch (e) { notify(e.message || "Could not add the plan.", "error"); } finally { setBusy(false); }
  };

  return (
    <div className="hdy">
      <div className="hdy-row">
        <span className="hdy-seg" role="group" aria-label="Eating style">{DIETS.map(([k, l]) => <button key={k} type="button" className={diet === k ? "on" : ""} onClick={() => pickDiet(k)}>{l}</button>)}</span>
        <span className="hdy-seg" role="group" aria-label="Day">{[["Today", 0], ["Tomorrow", 1]].map(([l, o]) => <button key={l} type="button" className={off === o ? "on" : ""} onClick={() => setOff(o)}>{l}</button>)}</span>
      </div>
      {day === null && <p className="hdy-note">Building your day…</p>}
      {day === false && <p className="hdy-note">Could not build the plan. Check your connection and try again.</p>}
      {day && (
        <>
          <div className="hdy-tot"><b>{day.totals.kcal} kcal</b><span>{day.totals.protein} g protein</span><span>{day.totals.fiber} g fibre</span><span>target {day.totals.target}</span></div>
          {day.needsProfile && <p className="hdy-note">Add your height, age and weight in Profile and I will size this exactly for you.</p>}
          {day.meals.map((m) => (
            <section className="hdy-meal" key={m.mealType}>
              <h4><span aria-hidden="true">{MEAL[m.mealType][0]}</span>{MEAL[m.mealType][1]}<small>{m.kcal} kcal</small></h4>
              <ul>{m.items.map((i) => <li key={i.name}><span><strong>{i.name}</strong><small>{qty(i)} · {i.note}</small></span><em>{i.kcal}</em></li>)}</ul>
            </section>
          ))}
          <p className="hdy-tip">{day.tips[0]} {day.tips[2]}</p>
        </>
      )}
      <div className="fx-actions">
        <button type="button" className="fx-btn" disabled={busy || !day} onClick={apply}>{busy ? "Adding…" : "＋ Add to my planner"}</button>
        <button type="button" className="fx-btn ghost" disabled={!day} onClick={() => setVariant((v) => v + 1)}>🔀 Another version</button>
      </div>
    </div>
  );
}
