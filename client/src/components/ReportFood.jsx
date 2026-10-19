import { useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

// "Report wrong values": a short note is saved for review (POST /api/foods/:id/report).
export default function ReportFood({ food }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!food?._id) return null;
  if (sent) return <p className="report-food-done" role="status">✓ Thanks, your report was saved and will be reviewed.</p>;
  if (!open) return <button type="button" className="report-food-btn" onClick={() => setOpen(true)}>⚑ Report wrong values</button>;
  const send = async () => {
    if (busy || note.trim().length < 3) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/foods/${food._id}/report`, { method: "POST", body: JSON.stringify({ note: note.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) { setSent(true); notify("Thanks, your report was saved.", "success"); } else notify(j.message || "Could not send the report.", "error");
    } catch { notify("Could not send the report. Check your connection.", "error"); } finally { setBusy(false); }
  };
  return (
    <div className="report-food">
      <label htmlFor={`rf-${food._id}`}>What looks wrong about {food.name}?</label>
      <textarea id={`rf-${food._id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. calories look too high for one roti" />
      <div className="report-food-row">
        <button type="button" className="primary-button" disabled={busy || note.trim().length < 3} onClick={send}>{busy ? "Sending…" : "Send report"}</button>
        <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
