import { useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import "./micro.css";

const ICON = { verified: "🛡️", typical: "📊", user: "✍️" };

// Where a food's numbers come from (Verified / Typical / Added by you) and a way to say "these values look wrong".
export default function FoodTrust({ food }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  if (!food?._id) return null;
  const c = food.confidence;
  const send = async () => {
    try {
      const r = await apiFetch(`${API_URL}/api/foods/${food._id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note.trim() }) });
      const j = await r.json();
      if (!r.ok || j.success === false) throw new Error(j.message || "Could not send");
      setSent(true); setAsking(false);
      notify("Thanks! We will check these values.", "success");
    } catch (e) { notify(e.message || "Could not send the report", "error"); }
  };
  return (
    <div className="food-trust">
      {c && <span className={`trust-badge ${c.id}`} title={food.microSource || ""}><span aria-hidden="true">{ICON[c.id] || "📊"}</span>{c.label}</span>}
      {sent ? <span>Report sent</span> : <button type="button" className="trust-report" onClick={() => setAsking((v) => !v)}>Report wrong values</button>}
      {asking && (
        <div className="trust-form">
          <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What looks wrong? (optional)" aria-label="What looks wrong" />
          <button type="button" onClick={send}>Send report</button>
        </div>
      )}
    </div>
  );
}
