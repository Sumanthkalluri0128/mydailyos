import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import "./logging1.css";

const NICE = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snacks: "snacks" };

// "Copy yesterday's lunch" / "Same as last time": shows what would be added (quantities editable) BEFORE anything is saved.
export default function RepeatPreview({ date, meal, mode, onClose, onDone }) {
  const [d, setD] = useState(null);
  const [qty, setQty] = useState({});
  const [off, setOff] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/api/food-logs/repeat?date=${date}&meal=${meal}&mode=${mode}`).then((r) => r.json()).then((j) => { if (live && j.success) { setD(j); setQty(Object.fromEntries(j.entries.map((e) => [e._id, e.quantity]))); } }).catch(() => live && notify("Could not load that meal.", "error"));
    return () => { live = false; };
  }, [date, meal, mode]);
  if (!d) return <div className="repeat-preview" aria-busy="true">Looking…</div>;
  if (!d.found) return (
    <div className="repeat-preview"><p>{mode === "yesterday" ? `You did not log ${NICE[meal]} yesterday.` : `No earlier ${NICE[meal]} found to repeat.`}</p><button className="secondary-button" onClick={onClose}>Close</button></div>
  );
  const chosen = d.entries.filter((e) => !off[e._id]);
  const add = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_URL}/api/food-logs/copy`, { method: "POST", body: JSON.stringify({ fromDate: d.date, toDate: date, mealType: meal, ids: chosen.map((e) => e._id), edits: chosen.map((e) => ({ id: e._id, quantity: Number(qty[e._id]) })) }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Could not copy");
      notify(`Added ${j.logs.length} item${j.logs.length === 1 ? "" : "s"} to ${meal}.`, "success");
      onDone?.();
    } catch (e) { notify(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="repeat-preview large-card" role="group" aria-label={`Repeat ${meal}`}>
      <strong>{mode === "yesterday" ? `Yesterday's ${meal}` : `Your last ${meal}`} ({d.date}) · {d.kcal} kcal</strong>
      {d.entries.map((e) => (
        <div className="repeat-row" key={e._id}>
          <input type="checkbox" checked={!off[e._id]} onChange={() => setOff({ ...off, [e._id]: !off[e._id] })} aria-label={`Include ${e.foodName}`} />
          <span>{e.foodName}</span>
          <input type="number" min="0.01" step="any" value={qty[e._id] ?? ""} onChange={(ev) => setQty({ ...qty, [e._id]: ev.target.value })} aria-label={`Amount of ${e.foodName}`} />
          <small>{e.servingUnit}</small>
        </div>
      ))}
      <div className="repeat-row">
        <button className="primary-button" disabled={busy || !chosen.length} onClick={add}>Add {chosen.length} to today</button>
        <button className="secondary-button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
