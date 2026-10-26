// Weight page add-on: body measurement trends next to weight, and private before/after progress photos with a date slider.
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { undoGate } from "../utils/undo";
import { addPhoto, deletePhoto, listPhotos } from "../utils/photoStore";
import { initialPair, movePair, spanText } from "../utils/photoCompare";
import { isGentle } from "../utils/coachTone";
import "./bodyprogress.css";

const LABEL = { waist: "Waist", hips: "Hips", chest: "Chest", arm: "Arm", thigh: "Thigh" };

function Spark({ points, label }) {
  if (!points || points.length < 2) return <span className="bp-spark-empty" aria-hidden="true">·</span>;
  const w = 120, h = 34, xs = points.map((_, i) => (i / (points.length - 1)) * (w - 4) + 2);
  const vs = points.map((p) => p.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const ys = vs.map((v) => h - 4 - ((v - lo) / span) * (h - 8));
  return <svg className="bp-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}><polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} /><circle cx={xs.at(-1)} cy={ys.at(-1)} r="3" fill="currentColor" /></svg>;
}

export function MeasureTrends() {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`${API_URL}/api/health-logs/measure-trends?days=90&today=${getLocalDate()}`).then((r) => r.json()).then((j) => alive && j.success && setD(j)).catch(() => {});
    return () => { alive = false; };
  }, []);
  const rows = d ? Object.entries(d.types) : [];
  if (!d || (!rows.length && !d.weight?.points?.length)) return null;
  const hide = isGentle();
  return (
    <section className="large-card bp-card" aria-label="Body measurements next to weight">
      <h3>Measurements and weight</h3>
      <p className="bp-sub">Last 90 days. Add measurements in Health. Measure at the same spot and time of day.</p>
      <ul className="bp-list">
        {d.weight?.points?.length > 1 && <li><b>Weight</b><Spark points={d.weight.points} label="Weight trend" /><span>{hide ? "" : `${d.weight.last} kg`}{d.weight.change !== null && !hide ? ` (${d.weight.change > 0 ? "+" : ""}${d.weight.change})` : ""}</span></li>}
        {rows.map(([k, s]) => (
          <li key={k}><b>{LABEL[k]}</b><Spark points={s.points} label={`${LABEL[k]} trend`} /><span>{s.last} cm{s.change !== null ? ` (${s.change > 0 ? "+" : ""}${s.change})` : ""}</span></li>
        ))}
      </ul>
      {d.note && <p className="bp-note">{d.note}</p>}
    </section>
  );
}

export function ProgressPhotos() {
  const [photos, setPhotos] = useState([]);
  const [urls, setUrls] = useState({});
  const [pair, setPair] = useState({ before: -1, after: -1 });
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { const p = await listPhotos(); setPhotos(p); setPair((cur) => (p.length && cur.after >= 0 && cur.after < p.length ? cur : initialPair(p))); setErr(""); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const next = {}; photos.forEach((p) => { next[p.id] = URL.createObjectURL(p.blob); });
    setUrls(next); return () => Object.values(next).forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);
  const add = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (!/^image\//.test(f.type)) { notify("Please choose an image.", "error"); return; }
    try { await addPhoto(f, getLocalDate()); notify("Photo saved on this device only.", "success"); await load(); setPair((c) => c); }
    catch (er) { notify(er.message || "Could not save the photo.", "error"); }
  };
  const remove = async (p) => {
    const go = await undoGate({ what: "Photo", hide: () => setPhotos((cur) => cur.filter((x) => x.id !== p.id)), restore: () => load() });
    if (!go) return; await deletePhoto(p.id); await load(); setPair(initialPair((await listPhotos())));
  };
  const b = photos[pair.before], a = photos[pair.after];
  const labels = useMemo(() => photos.map((p) => p.date), [photos]);
  return (
    <section className="large-card bp-card" aria-label="Progress photos">
      <h3>Progress photos</h3>
      <p className="bp-sub">Private. Stored only in this browser, never uploaded, no cloud AI. Clearing site data removes them.</p>
      <label className="bp-add"><input type="file" accept="image/*" capture="environment" onChange={add} /> <span>＋ Add today's photo</span></label>
      {err && <p className="bp-note" role="alert">{err}</p>}
      {photos.length === 0 && !err && <p className="bp-sub">No photos yet. Take one every few weeks in similar light and pose.</p>}
      {photos.length >= 2 && b && a && (
        <div className="bp-compare">
          <div className="bp-pair">
            <figure><img src={urls[b.id]} alt={`Before, ${b.date}`} /><figcaption>Before · {b.date}</figcaption></figure>
            <figure><img src={urls[a.id]} alt={`After, ${a.date}`} /><figcaption>After · {a.date}</figcaption></figure>
          </div>
          <p className="bp-sub" aria-live="polite">{spanText(b, a)}</p>
          <label className="bp-slide">Before<input type="range" min="0" max={photos.length - 1} step="1" value={pair.before} onChange={(e) => setPair(movePair(photos, pair, "before", e.target.value))} aria-valuetext={labels[pair.before]} /></label>
          <label className="bp-slide">After<input type="range" min="0" max={photos.length - 1} step="1" value={pair.after} onChange={(e) => setPair(movePair(photos, pair, "after", e.target.value))} aria-valuetext={labels[pair.after]} /></label>
        </div>
      )}
      {photos.length > 0 && (
        <div className="bp-thumbs">
          {photos.map((p) => <figure key={p.id}><img src={urls[p.id]} alt={`Photo from ${p.date}`} loading="lazy" /><figcaption>{p.date}<button type="button" className="link-button" onClick={() => remove(p)} aria-label={`Delete photo from ${p.date}`}>Delete</button></figcaption></figure>)}
        </div>
      )}
    </section>
  );
}
