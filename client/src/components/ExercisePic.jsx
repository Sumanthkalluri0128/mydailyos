// The picture for an exercise: a clear illustrated figure (body, clothes, the equipment you hold, the working muscles lit up) with
//   * the whole range of movement in ONE picture (the finish pose drawn faint behind the start pose, plus a dashed arrow),
//   * three key frames to tap (Start, Middle, Finish), and a Play button that loops the movement smoothly,
//   * the muscles it works and a short "how to" under it (set up, move, breathe, avoid).
// The drawing itself is utils/exerciseFigure.js (shared with the phone app). If the server sends an `image` URL for an exercise, that real
// photo is shown instead. Colours come from CSS variables (--bpf-*) in bodyplan.css so light and dark mode both look right.
import { useEffect, useMemo, useRef, useState } from "react";
import { figureFor } from "../utils/exerciseFigure";

const css = (role) => `var(--bpf-${role})`;
function Shape({ s }) {
  const op = s.hiShape ? 0.72 : s.o;
  const c = css(s.role);
  if (s.k === "line") return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={c} strokeWidth={s.w} strokeLinecap="round" opacity={op} />;
  if (s.k === "circle") return <circle cx={s.cx} cy={s.cy} r={s.r} fill={c} opacity={op} />;
  if (s.k === "poly") return s.grow
    ? <polygon points={s.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={c} strokeWidth={s.grow} strokeLinejoin="round" opacity={op} />
    : <polygon points={s.pts.map((p) => p.join(",")).join(" ")} fill={c} opacity={op} />;
  if (s.k === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={c} opacity={op} transform={s.rot ? `rotate(${s.rot[0]} ${s.rot[1]} ${s.rot[2]})` : undefined} />;
  if (s.k === "path") return s.stroke ? <path d={s.d} fill="none" stroke={c} strokeWidth={s.stroke} strokeLinecap="round" opacity={op} /> : <path d={s.d} fill={c} opacity={op} />;
  return null;
}
const Shapes = ({ list }) => <>{list.map((s, i) => <Shape key={i} s={s} />)}</>;
const Arrow = ({ a }) => {
  if (!a) return null;
  const mx = (a.from[0] + a.to[0]) / 2 + a.bow, my = (a.from[1] + a.to[1]) / 2 - a.bow * 0.4;
  return <path d={`M ${a.from[0]} ${a.from[1]} Q ${mx} ${my} ${a.to[0]} ${a.to[1]}`} fill="none" stroke={css("arrow")} strokeWidth="1.6" strokeDasharray="3 2.4" strokeLinecap="round" markerEnd="url(#bpf-head)" />;
};

function Stage({ fig, frame, ghost, play, label }) {
  const { frames, cables, env, arrow } = fig;
  const live = play ? fig.tween(play.p) : null;
  return (
    <svg viewBox="0 0 120 100" role="img" aria-label={label} className="bp-fig-svg">
      <defs><marker id="bpf-head" viewBox="0 0 6 6" refX="4.5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={css("arrow")} /></marker></defs>
      <line x1="4" y1="91.6" x2="116" y2="91.6" stroke={css("floor")} strokeWidth="2" strokeLinecap="round" />
      <Shapes list={env} />
      {ghost && !live && <Shapes list={fig.ghost} />}
      {live ? <><Shapes list={live.cables} /><Shapes list={live.body} /></> : <><Shapes list={(cables && cables[frame]) || []} /><Shapes list={frames[frame]} /></>}
      {!live && frame === 0 && <Arrow a={arrow} />}
    </svg>
  );
}

export default function ExercisePic({ ex, slot, image, name }) {
  const e = ex || { slot, name, image };
  const fig = useMemo(() => { try { return figureFor(e); } catch { return null; } }, [e.id, e.slot, e.kind, (e.targets || []).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [p, setP] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setPlaying(false); return undefined; }
    const t0 = performance.now();
    const loop = (t) => {
      const c = ((t - t0) / 1000) % 4.4;                 // 4.4 s a rep: 1.4 s up, 0.8 s hold, 1.4 s back, 0.8 s hold
      setP(c < 1.4 ? c / 1.4 : c < 2.2 ? 1 : c < 3.6 ? 1 - (c - 2.2) / 1.4 : 0);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  if (e.image) return <img className="bp-pic-photo" src={e.image} alt={e.name || "Exercise"} loading="lazy" />;
  if (!fig) return null;
  const label = `${e.name || "Exercise"}: ${fig.labels[frame]}`;
  return (
    <div className="bp-fig">
      <div className="bp-fig-stage">
        <Stage fig={fig} frame={frame} ghost={frame === 0} play={playing ? { p } : null} label={label} />
        <button type="button" className="bp-fig-play" onClick={() => { setPlaying((v) => !v); setFrame(0); }} aria-pressed={playing}>{playing ? "⏸ Pause" : "▶ Play"}</button>
      </div>
      <div className="bp-fig-thumbs" role="group" aria-label="Key positions">
        {fig.labels.map((l, i) => (
          <button key={l} type="button" className={`bp-fig-thumb${!playing && frame === i ? " on" : ""}`} onClick={() => { setPlaying(false); setFrame(i); }} aria-label={`Show ${l}`}>
            <svg viewBox="0 0 120 100" aria-hidden="true"><line x1="4" y1="91.6" x2="116" y2="91.6" stroke={css("floor")} strokeWidth="2" /><Shapes list={fig.env} /><Shapes list={(fig.cables && fig.cables[i]) || []} /><Shapes list={fig.frames[i]} /></svg>
            <span><b>{i + 1}</b> {l}</span>
          </button>
        ))}
      </div>
      {fig.muscles.length > 0 && <p className="bp-fig-works"><span className="bp-fig-dot" aria-hidden="true" /> Works: <b>{fig.muscles.join(", ")}</b>{e.helpers && e.helpers.length ? <span className="bp-muted"> · helped by {e.helpers.join(", ")}</span> : null}</p>}
    </div>
  );
}
