import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import { notify } from "../utils/notify";
import "./logging1.css";

const MILKS = [["full", "Full-cream"], ["toned", "Toned"], ["soy", "Soy"], ["none", "Black"]];
const SIZES = [["cutting", "Cutting"], ["regular", "Cup"], ["mug", "Mug"]];

// Chai / coffee cup counter: cups, sugar spoons, milk type. Calories come from the server (catalogue milk + sugar), never typed in.
export default function ChaiCounter({ date, onLogged }) {
  const [drink, setDrink] = useState("tea");
  const [cups, setCups] = useState(1);
  const [sugar, setSugar] = useState(1);
  const [milk, setMilk] = useState("toned");
  const [size, setSize] = useState("regular");
  const [calc, setCalc] = useState(null);
  const [week, setWeek] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/api/food-logs/chai/preview?cups=${cups}&sugarSpoons=${sugar}&milk=${milk}&cupSize=${size}&drink=${drink}`).then((r) => r.json()).then((j) => live && j.success && setCalc(j.calc)).catch(() => {});
    return () => { live = false; };
  }, [cups, sugar, milk, size, drink]);
  const loadWeek = () => apiFetch(`${API_URL}/api/food-logs/chai/weekly?end=${date}`).then((r) => r.json()).then((j) => j.success && setWeek(j)).catch(() => {});
  useEffect(() => { loadWeek(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const log = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_URL}/api/food-logs/chai`, { method: "POST", body: JSON.stringify({ date, mealType: "snacks", cups, sugarSpoons: sugar, milk, cupSize: size, drink, clientId: `chai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Could not log that");
      notify(`${j.calc.label}: ${j.calc.kcal} kcal logged.`, "success");
      onLogged?.(); loadWeek();
    } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };
  const step = (set, v, d, lo, hi) => set(Math.min(hi, Math.max(lo, v + d)));
  return (
    <div className="large-card chai-counter">
      <div className="section-header"><div><h2><Buddy scene="drink" size={36} talk={false} /> Chai and coffee counter</h2><p>Cups, sugar and milk. Calories are worked out for you.</p></div></div>
      <div className="chai-cups" role="group" aria-label="Drink">
        {[["tea", "🍵 Chai"], ["coffee", "☕ Coffee"]].map(([id, l]) => <button key={id} type="button" className={drink === id ? "chip active" : "chip"} aria-pressed={drink === id} onClick={() => setDrink(id)}>{l}</button>)}
        {SIZES.map(([id, l]) => <button key={id} type="button" className={size === id ? "chip active" : "chip"} aria-pressed={size === id} onClick={() => setSize(id)}>{l}</button>)}
      </div>
      <div className="chai-cups">
        <span>Cups</span><button type="button" className="secondary-button" aria-label="One cup less" onClick={() => step(setCups, cups, -1, 1, 20)}>−</button><strong aria-live="polite">{cups}</strong><button type="button" className="secondary-button" aria-label="One cup more" onClick={() => step(setCups, cups, 1, 1, 20)}>＋</button>
        <span>Sugar spoons per cup</span><button type="button" className="secondary-button" aria-label="Less sugar" onClick={() => step(setSugar, sugar, -0.5, 0, 6)}>−</button><strong aria-live="polite">{sugar}</strong><button type="button" className="secondary-button" aria-label="More sugar" onClick={() => step(setSugar, sugar, 0.5, 0, 6)}>＋</button>
      </div>
      <div className="chai-cups" role="group" aria-label="Milk">
        {MILKS.map(([id, l]) => <button key={id} type="button" className={milk === id ? "chip active" : "chip"} aria-pressed={milk === id} onClick={() => setMilk(id)}>{l}</button>)}
      </div>
      {calc?.ok && <p><strong>{calc.kcal} kcal</strong> ({calc.perCupKcal} per cup{calc.sugarKcal ? `, ${calc.sugarKcal} from sugar` : ""})</p>}
      {calc && !calc.ok && <p className="warn-line">{calc.message}</p>}
      <button className="primary-button" disabled={busy || !calc?.ok} onClick={log}>Log {cups} cup{cups === 1 ? "" : "s"}</button>
      {week?.note && <p className="card-description">This week: {week.note}</p>}
    </div>
  );
}
