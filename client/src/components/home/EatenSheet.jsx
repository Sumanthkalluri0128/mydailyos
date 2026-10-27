// Home "Eaten" card, opened: today's meals as a short list, with the portion editor right there (no trip to the food page).
// Edits save straight away and show the same 5 s Undo toast as everywhere else.
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { notify } from "../../utils/notify";
import { undoNotice } from "../../utils/undo";
import PortionEdit from "../PortionEdit";

const MEALS = [["breakfast", "🌅 Breakfast"], ["lunch", "☀️ Lunch"], ["dinner", "🌙 Dinner"], ["snacks", "🍎 Snacks"]];
const kcal = (l) => Math.round(Number(l.nutritionTotal?.calories) || 0);

export default function EatenSheet({ date, onChanged, onClose }) {
  const [logs, setLogs] = useState(null);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await apiFetch(`/api/food-logs?date=${date}`); const d = await r.json(); setLogs(d.success ? d.logs : []); }
    catch { setLogs([]); notify("Could not load today's meals.", "error"); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const patch = (id, quantity) => apiFetch(`/api/food-logs/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
  const save = async (log, quantity) => {
    setBusy(true);
    try {
      const before = Number(log.consumedQuantity);
      const r = await patch(log._id, quantity);
      if (!r.ok) { const d = await r.json().catch(() => ({})); notify(d.message || "Could not change the amount.", "error"); return; }
      setEditId(null);
      onClose?.();   // so the Undo toast is not hidden behind the open sheet
      undoNotice({ message: `${log.foodName} is now ${quantity} ${log.servingUnit}`, onUndo: async () => { await patch(log._id, before); await load(); onChanged?.(); } });
      await load(); onChanged?.();
    } catch { notify("Could not change the amount.", "error"); } finally { setBusy(false); }
  };

  if (logs === null) return <p className="sh-note">Loading…</p>;
  if (!logs.length) return <p className="sh-note">Nothing logged yet today. A small snack or a full meal, whatever you ate, goes here.</p>;
  return (
    <div className="eaten-sheet">
      {MEALS.map(([id, label]) => {
        const rows = logs.filter((l) => l.mealType === id);
        if (!rows.length) return null;
        return (
          <section key={id} aria-label={label}>
            <h4>{label} <small>{rows.reduce((s, l) => s + kcal(l), 0).toLocaleString()} kcal</small></h4>
            {rows.map((l) => (
              <div key={l._id}>
                <div className="es-row">
                  <span><strong>{l.foodName}</strong><small>{l.consumedQuantity} {l.servingUnit} · {kcal(l)} kcal</small></span>
                  <button type="button" className="edit-log-button" aria-expanded={editId === l._id} aria-label={`Edit amount of ${l.foodName}`} onClick={() => setEditId(editId === l._id ? null : l._id)}>✏️ Edit</button>
                </div>
                {editId === l._id && <PortionEdit name={l.foodName} foodId={l.foodId?._id || l.foodId} quantity={l.consumedQuantity} unit={l.servingUnit} calories={l.nutritionTotal?.calories || 0} protein={l.nutritionTotal?.protein || 0} busy={busy} onCancel={() => setEditId(null)} onSave={(q) => save(l, q)} />}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
