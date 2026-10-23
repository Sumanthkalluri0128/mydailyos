import { useState } from "react";
import { GUIDES, guideText } from "./portionGuides";
import "./logging1.css";

// Simple drawn shapes (SVG): one per household measure, three sizes side by side.
function Shape({ id, scale }) {
  const s = scale;
  const stroke = "currentColor";
  if (id === "katori") return <svg viewBox="0 0 80 60" width={80 * s} height={60 * s} aria-hidden="true"><path d="M8 20 H72 Q70 52 40 54 Q10 52 8 20 Z" fill="rgba(79,140,255,.18)" stroke={stroke} strokeWidth="2.5" /><ellipse cx="40" cy="20" rx="32" ry="6" fill="none" stroke={stroke} strokeWidth="2.5" /></svg>;
  if (id === "roti") return <svg viewBox="0 0 80 80" width={64 * s} height={64 * s} aria-hidden="true"><circle cx="40" cy="40" r="36" fill="rgba(224,160,48,.25)" stroke={stroke} strokeWidth="2.5" /><circle cx="28" cy="32" r="3" fill={stroke} opacity=".35" /><circle cx="50" cy="48" r="3.5" fill={stroke} opacity=".35" /><circle cx="46" cy="26" r="2.5" fill={stroke} opacity=".35" /></svg>;
  if (id === "ladle") return <svg viewBox="0 0 90 60" width={90 * s} height={60 * s} aria-hidden="true"><path d="M4 36 Q4 54 24 54 Q44 54 44 36 Z" fill="rgba(79,140,255,.18)" stroke={stroke} strokeWidth="2.5" /><path d="M44 38 L86 10" stroke={stroke} strokeWidth="4" strokeLinecap="round" /></svg>;
  if (id === "glass") return <svg viewBox="0 0 50 80" width={50 * s} height={80 * s} aria-hidden="true"><path d="M8 6 H42 L38 74 H12 Z" fill="none" stroke={stroke} strokeWidth="2.5" /><path d="M10 24 H40 L37.5 72 H12.5 Z" fill="rgba(79,140,255,.25)" /></svg>;
  return <svg viewBox="0 0 80 40" width={80 * s} height={40 * s} aria-hidden="true"><ellipse cx="20" cy="20" rx="16" ry="11" fill="rgba(79,140,255,.18)" stroke={stroke} strokeWidth="2.5" /><path d="M36 20 H76" stroke={stroke} strokeWidth="4" strokeLinecap="round" /></svg>;
}

// "How much is a katori?" helper shown next to the quantity box.
export default function PortionGuide() {
  const [open, setOpen] = useState(false);
  const [gid, setGid] = useState("katori");
  const g = GUIDES.find((x) => x.id === gid);
  return (
    <div className="portion-guide">
      <button type="button" className="chip" aria-expanded={open} onClick={() => setOpen(!open)}>📏 Portion guide</button>
      {open && (
        <div className="pg-body">
          <div role="tablist" className="pg-tabs">
            {GUIDES.map((x) => <button key={x.id} role="tab" type="button" aria-selected={x.id === gid} className={x.id === gid ? "chip active" : "chip"} onClick={() => setGid(x.id)}>{x.title}</button>)}
          </div>
          <div className="pg-row">
            {g.items.map((i) => (
              <figure key={i.id} className="pg-item"><Shape id={g.id} scale={i.scale} /><figcaption>{guideText(g, i)}</figcaption></figure>
            ))}
          </div>
          <p className="card-description">{g.note} Typical sizes: yours may differ.</p>
        </div>
      )}
    </div>
  );
}
