import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import { notify } from "../utils/notify";
import "./logging2.css";

const STAPLES = ["rice", "dal", "paneer", "egg", "chicken", "curd", "oats", "potato", "onion", "tomato", "besan", "spinach", "chickpeas", "bread", "milk", "banana"];

// "What can I cook?" Tick what you have; ideas come from your recipes, then your foods, then the catalogue. Foods you avoid never appear.
export default function CookIdeas({ date, mealType = "lunch", onLogged }) {
  const [have, setHave] = useState(() => { try { return JSON.parse(localStorage.getItem("ff-pantry")) || []; } catch { return []; } });
  const [extra, setExtra] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem("ff-pantry", JSON.stringify(have)); } catch { /* private mode */ } }, [have]);
  const toggle = (x) => setHave((h) => (h.includes(x) ? h.filter((y) => y !== x) : [...h, x]));
  const addExtra = () => { const t = extra.trim().toLowerCase().slice(0, 40); if (t && !have.includes(t)) setHave([...have, t]); setExtra(""); };
  const find = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`${API_URL}/api/foods/cook-ideas`, { method: "POST", body: JSON.stringify({ have, date, mealType }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Could not find ideas");
      setRes(j);
    } catch (e) { notify(navigator.onLine ? e.message : "Ideas need a connection.", "error"); } finally { setBusy(false); }
  };
  const log = async (i) => {
    try {
      const r = await apiFetch(`${API_URL}/api/food-logs`, { method: "POST", body: JSON.stringify({ foodId: i.foodId, date, mealType, quantity: i.servingSize || 1, clientId: `cook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
      if (!r.ok) throw new Error();
      notify(`${i.name} added to ${mealType}.`, "success"); onLogged?.();
    } catch { notify("Could not add that.", "error"); }
  };
  return (
    <div className="large-card cook-ideas">
      <div className="section-header"><div><h2><Buddy scene="chef" size={40} talk={false} /> What can I cook?</h2><p>Tick what you have at home.</p></div></div>
      <div className="pantry-chips" role="group" aria-label="Ingredients at home">
        {[...new Set([...STAPLES, ...have])].map((x) => <button key={x} type="button" className={have.includes(x) ? "chip active" : "chip"} aria-pressed={have.includes(x)} onClick={() => toggle(x)}>{x}</button>)}
      </div>
      <div className="repeat-row"><input value={extra} maxLength={40} placeholder="Something else, e.g. cabbage" onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExtra()} aria-label="Add an ingredient" /><button className="secondary-button" onClick={addExtra}>Add</button></div>
      <button className="primary-button" disabled={busy || !have.length} onClick={find}>{busy ? "Thinking…" : `Find meals with ${have.length} ingredient${have.length === 1 ? "" : "s"}`}</button>
      {res && <p className="card-description">Left today: {res.remaining.calories} kcal, {Math.max(0, res.remaining.protein)} g protein.{res.message ? ` ${res.message}` : ""}</p>}
      {res?.groups.map((g) => (
        <div key={g.id} className="cook-group"><h4>{g.title}</h4>
          {g.items.map((i) => (
            <div key={`${g.id}-${i.name}`} className="cook-item">
              <span><strong>{i.name}</strong><small>{i.calories} kcal · {i.protein} g protein · {i.reason}{i.missing?.length ? ` · still need: ${i.missing.join(", ")}` : ""}</small></span>
              {i.foodId && <button className="secondary-button" onClick={() => log(i)}>Add to {mealType}</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
