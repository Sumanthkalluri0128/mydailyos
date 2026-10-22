// "Your first week": a slim, collapsible checklist on Home. Resumable (Continue tour) and dismissible. Shows only for people who started the tour.
import { useState } from "react";
import { checklistText } from "./engine.js";
import { dismissChecklist, startTour, useTour } from "./store";
import RookieSticker from "./RookieSticker";
import "./tour.css";

export default function GettingStarted() {
  const t = useTour();
  const [open, setOpen] = useState(false);
  const c = t.checklist;
  if (!c || !t.serverStarted || t.checklistDismissed || t.phase !== "idle") return null;
  const pct = Math.round((c.doneCount / c.total) * 100);
  return (
    <section className="tr-check" aria-label={c.title} data-tour="checklist">
      <button type="button" className="tr-check-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{c.complete ? "🏅" : "📋"}</span><b>{c.title}</b><span>{checklistText(c)}</span><span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div className="tr-check-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.doneCount} of ${c.total} done`}><i style={{ width: `${pct}%` }} /></div>
      {open && (
        <>
          <ul>{c.items.map((i) => <li key={i.id} className={i.done ? "done" : ""}><span aria-hidden="true">{i.done ? "✅" : "⬜"}</span><span>{i.label}</span></li>)}</ul>
          {c.complete && <p role="status" style={{ display: "flex", gap: 10, alignItems: "center" }}><RookieSticker size={56} label={false} /> Checklist complete. Rookie unlocked!</p>}
          <div className="tr-check-foot">
            {!c.complete && t.serverStatus !== "done" && <button type="button" className="tr-link" onClick={() => startTour("auto")}>Continue tour</button>}
            <button type="button" className="tr-link" onClick={() => dismissChecklist(true)}>Hide</button>
          </div>
        </>
      )}
    </section>
  );
}
