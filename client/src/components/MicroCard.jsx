import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import { getLocalDate } from "../utils/date";
import "./micro.css";

const SCENE = { victory: "victory", low: "think", ok: "cheer", nodata: "wave" };
const HEAD = {
  victory: "Power-ups on point!",
  low: "A few power-ups are running low",
  ok: "Looking steady",
  nodata: "Not enough vitamin data yet",
};

// Vitamins and minerals for a day: power-up bars with the same arrows as macros. Unknown data is shown as "not enough data", never as 0.
export default function MicroCard({ date }) {
  const day = date || getLocalDate();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    apiFetch(`${API_URL}/api/progress/micro?date=${day}`)
      .then((r) => r.json())
      .then((j) => { if (live && j.success) setD(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [day]);
  if (!d) return null;
  if (!d.ok) return <section className="card micro-card"><h3>Vitamins and minerals</h3><p className="micro-note">{d.note}</p></section>;
  const lowOf = (id) => (d.low || []).find((x) => x.id === id);
  return (
    <section className="card micro-card" aria-label="Vitamins and minerals">
      <div className="micro-head">
        <Buddy scene={SCENE[d.mood] || "wave"} size={72} />
        <div>
          <p className="eyebrow">Power-ups</p>
          <h3>{HEAD[d.mood]}</h3>
          {d.knownCount > 0 && <p>{d.inRange} of {d.knownCount} tracked nutrients in range today.</p>}
          {d.emptyNote && <p>{d.emptyNote}</p>}
        </div>
      </div>
      <ul className="micro-rows">
        {d.rows.map((r) => {
          const low = r.status === "low" ? lowOf(r.id) : null;
          return (
            <li key={r.id} className={`micro-row ${r.status}`}>
              <button type="button" className="micro-line" onClick={() => low && setOpen(open === r.id ? null : r.id)} aria-expanded={low ? open === r.id : undefined} disabled={!low}>
                <span className="micro-label">{r.label}</span>
                {r.status === "nodata" ? (
                  <span className="micro-val">Not enough data</span>
                ) : (
                  <>
                    <span className="micro-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
                    <span className="micro-val">{r.arrow} {r.value} {r.unit} <small>({r.range.min}{r.range.max ? `–${r.range.max}` : "+"} {r.unit})</small></span>
                  </>
                )}
              </button>
              {low && open === r.id && (
                <div className="micro-why">
                  {low.foods?.length > 0 ? (
                    <p>Try more of: {low.foods.map((f) => (f.mine ? `${f.name} (you already log it)` : f.name)).join(", ")}.</p>
                  ) : (
                    <p>{low.hint}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="micro-note">{d.note} Source: {d.source}.{d.rdaVerified === false ? " Reference ranges still being verified." : ""}</p>
    </section>
  );
}
