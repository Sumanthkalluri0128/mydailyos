import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import Buddy from "../motion/Buddy";
import { accent, dayChar } from "../motion/chars";
import { explainNutrient, MICRO_CHEER } from "../motion/talk";
import "./micro.css";

const SCENE = { victory: "victory", power: "powerup", support: "wave", unknown: "think" };
const STATUS = { low: "▼ below the range", ok: "✓ in range", high: "▲ above the maximum", unknown: "– not enough data" };
const WHY = {
  age: "Add your age in Profile to see vitamin and mineral ranges.",
  sex: "Add your sex (male or female) in Profile. The Indian RDA ranges differ by sex, so we don't guess.",
  under18: "Vitamin and mineral ranges are for adults 19 and over. For children and teens, please follow a doctor's or dietitian's advice.",
};

// Daily vitamins & minerals as "power-up bars" against ICMR-NIN ranges. Unknown is never shown as zero.
export default function MicronutrientCard({ date, who, collapsible = false }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const day = date || getLocalDate();
  const char = who || dayChar();
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setErr(false);
    apiFetch(`/api/progress/micronutrients?date=${day}`).then((r) => r.json()).then((j) => { if (live) (j.success ? setD(j) : setErr(true)); }).catch(() => live && setErr(true));
    return () => { live = false; };
  }, [day, open]);

  const lows = (d?.nutrients || []).filter((n) => n.status === "low").sort((a, b) => a.percentOfRda - b.percentOfRda);
  const body = (() => {
    if (err) return <p className="mc-note">Could not load this just now. Try again in a moment.</p>;
    if (!d) return <p className="mc-note">Loading…</p>;
    if (!d.available) return <p className="mc-note" role="note">{WHY[d.reason] || WHY.age}</p>;
    if (!d.loggedAnything) return <p className="mc-note">Log a meal and your vitamin and mineral bars will fill up here.</p>;
    return (
      <>
        <div className="mc-hero">
          <Buddy who={char} scene={SCENE[d.mood] || "think"} size={84} talk={false} />
          <p className="mc-say">{d.enoughData ? (lows.length ? explainNutrient(char, lows[0]) : MICRO_CHEER[d.mood] || MICRO_CHEER.unknown) : "Most of the foods you logged don't have vitamin and mineral data yet, so I won't guess. Foods you add yourself can include them."}</p>
        </div>
        <ul className="mc-list" style={{ "--mc-accent": accent[char] || "#7a5cff" }}>
          {d.nutrients.map((n) => {
            const pct = n.percentOfRda === null ? 0 : Math.min(100, n.percentOfRda);
            const minPct = Math.round((n.min / n.rda) * 100);
            return (
              <li key={n.key} className={`mc-row st-${n.status}`}>
                <div className="mc-top"><span>{n.label}</span><strong>{n.value === null ? "not enough data" : `${n.value} / ${n.rda} ${n.unit}`}</strong></div>
                <div className="mc-bar" role="img" aria-label={`${n.label}: ${n.value === null ? "not enough data" : `${n.percentOfRda}% of the daily recommendation`}`}>
                  <b style={{ width: `${pct}%` }} /><i style={{ left: `${minPct}%` }} title="Start of the healthy range" />
                </div>
                <small>{n.min}–{n.max ? n.max : `${n.rda}+`} {n.unit} · {STATUS[n.status]}</small>
              </li>
            );
          })}
        </ul>
        <p className="mc-foot">Ranges: ICMR-NIN RDA for healthy adults (range starts at 80% of the RDA). Only foods with nutrient data are counted. Estimates, not medical advice. Pregnancy, under-18s and medical conditions are not covered.</p>
      </>
    );
  })();

  return (
    <section className="card mc-card" aria-label="Vitamins and minerals today">
      <header className="mc-head">
        <h3>⚡ Vitamins & minerals</h3>
        {collapsible && <button type="button" className="pn-btn ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</button>}
      </header>
      {open && body}
    </section>
  );
}
