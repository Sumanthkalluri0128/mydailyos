// "My lifts": every exercise you logged with a weight, what you lifted last, your best, and how it moved. Reads GET /api/lifts/summary
// (stored for every finished workout, whichever plan it came from). Tap an exercise for its chart and every day it was logged.
import { useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { MODES, loadOf, loadText } from "../../utils/exerciseLoad";

const fmt = (d) => { const [y, m, day] = String(d).split("-").map(Number); return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };

function Spark({ points, better }) {
  if (points.length < 2) return null;
  const w = 220, h = 54, pad = 6, lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const xy = points.map((v, i) => [pad + (i * (w - 2 * pad)) / (points.length - 1), h - pad - ((v - lo) / span) * (h - 2 * pad)]);
  return (
    <svg className="lt-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Trend">
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke={better ? "var(--wp-ok, #16a34a)" : "var(--text-muted)"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === xy.length - 1 ? 4 : 2.5} fill={better ? "var(--wp-ok, #16a34a)" : "var(--text-muted)"} />)}
    </svg>
  );
}

export default function LiftTracker() {
  const [state, setState] = useState({ status: "loading", list: [] });
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await apiFetch("/api/lifts/summary?days=365");
        const j = await r.json().catch(() => ({}));
        if (!on) return;
        setState(r.ok ? { status: "ok", list: j.exercises || [] } : { status: "error", list: [] });
      } catch { if (on) setState({ status: "error", list: [] }); }
    })();
    return () => { on = false; };
  }, []);
  const list = state.list.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="wp-card lt-card" aria-label="My lifts">
      <h3 className="wp-h">My lifts</h3>
      <p className="wp-muted wp-small">Every weight you log in a workout is saved with what it means (each dumbbell, total, body weight + extra, assist), so you can see it grow.</p>
      {state.status === "loading" && <p className="wp-muted">Loading…</p>}
      {state.status === "error" && <p className="wp-muted">Could not load your lifts. Check your connection and open this tab again.</p>}
      {state.status === "ok" && !state.list.length && <p className="wp-muted">Nothing yet. Finish a workout with a weight on a set and it shows up here.</p>}
      {state.list.length > 6 && <label className="pp-field"><span className="sr-only">Search my lifts</span><input type="search" value={q} placeholder="Search my lifts" onChange={(e) => setQ(e.target.value)} /></label>}
      <ul className="lt-list">
        {list.map((x) => {
          const load = loadOf({ name: x.name, cat: x.cat }, x.mode);
          const isOpen = open === x.id;
          const trend = x.change && x.change.kg !== 0 ? (x.mode === "assist" ? -x.change.kg : x.change.kg) : 0;
          const pts = x.series.map((p) => (x.mode === "bw" && !p.topKg ? p.bestReps : p.topKg));
          return (
            <li key={x.id} className={`lt-row${isOpen ? " open" : ""}`}>
              <button type="button" className="lt-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : x.id)}>
                <span className="lt-n"><b>{x.name}</b><small>{MODES[x.mode].label} · {x.sessions} day{x.sessions === 1 ? "" : "s"} · last {fmt(x.lastDate)}</small></span>
                <span className="lt-v"><b>{x.mode === "bw" && !x.last.topKg ? `${x.last.reps} reps` : loadText(load, x.last.topKg)}</b>{trend ? <small className={trend > 0 ? "up" : "down"}>{trend > 0 ? "▲" : "▼"} {Math.abs(x.change.kg)} kg</small> : null}</span>
              </button>
              {isOpen && (
                <div className="lt-body">
                  <Spark points={pts} better={trend >= 0} />
                  <p className="wp-small">Best: <b>{x.mode === "bw" && !x.best.topKg ? "body weight" : loadText(load, x.best.topKg)}</b> on {fmt(x.best.date)}{x.best.est1RM ? ` · est. max ${x.best.est1RM} kg` : ""}</p>
                  <table className="lt-table"><thead><tr><th>Day</th><th>Top set</th><th>Moved</th><th>Reps</th></tr></thead>
                    <tbody>{[...x.series].reverse().slice(0, 12).map((p, i) => <tr key={`${p.date}${i}`}><td>{fmt(p.date)}</td><td>{x.mode === "bw" && !p.topKg ? "BW" : loadText(load, p.topKg)}</td><td>{p.volumeKg} kg</td><td>{p.reps}</td></tr>)}</tbody></table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
