// Small shared pieces of the Workout Plans tab: theme hook, picture thumbnail, and the exercise detail sheet
// (How to do / Muscles / Alternatives) that every screen opens.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { imageFor } from "../../data/exerciseImages";
import ExercisePic from "../ExercisePic";
import { figureFor, figureToSvg } from "../../utils/exerciseFigure";
import { MUSCLE_LABEL, findExercise } from "../../data/workoutPlan";
import { lastPerformance, topWeight } from "../../utils/workoutStore";

export const MUSCLE_ICON = { chest: "🫁", back: "🦍", shoulders: "🏐", arms: "💪", core: "🎯", legs: "🦵", glutes: "🍑", mobility: "🧘", cardio: "🫀" };

export function useTheme() {
  const read = () => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  const [t, setT] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setT(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return t;
}

/** What ExercisePic / figureFor need, built from a plan exercise. */
export const picEx = (e) => ({ id: e.fig || "", slot: e.slot || "", kind: e.kind || "", targets: e.targets || [], helpers: e.helpers || [], name: e.name });
const hasFig = (e) => { try { return !!figureFor(picEx(e)); } catch { return false; } };

/** A small still picture (start pose). Falls back to a muscle icon when the exercise has no drawing. */
export function FigThumb({ ex, size = 56, className = "" }) {
  const theme = useTheme();
  const photo = imageFor(ex);
  if (photo) return <img className={`wp-thumb wp-photo ${className}`} src={photo.thumb} alt="" width={size} height={Math.round(size * 0.83)} loading="lazy" decoding="async" />;
  const src = useMemo(() => {
    try {
      const fig = figureFor(picEx(ex));
      if (!fig) return "";
      return `data:image/svg+xml;utf8,${encodeURIComponent(figureToSvg(fig, 0, theme, false))}`;
    } catch { return ""; }
  }, [ex.fig, ex.slot, ex.kind, (ex.targets || []).join(","), theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = MUSCLE_ICON[(ex.targets || [])[0]] || "🏋️";
  return src
    ? <img className={`wp-thumb ${className}`} src={src} alt="" width={size} height={size * 0.83} loading="lazy" />
    : <span className={`wp-thumb wp-thumb-ico ${className}`} aria-hidden="true" style={{ width: size, height: size * 0.83 }}>{icon}</span>;
}

export const Chip = ({ children, tone = "", ...p }) => <span className={`wp-chip ${tone}`} {...p}>{children}</span>;

export const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------------------------------------------------------- the detail sheet
/**
 * ex:       the exercise or item (original or alternative)
 * swaps:    { [originalId]: alternativeId }  (what the person picked for each exercise)
 * onSwap(originalId, altId | null)  picks an alternative, or null for "use the original"
 */
export default function ExSheet({ ex: shown, tab: firstTab = "how", sessions, swaps, onSwap, favs, onFav, onClose, canSwap = true, find = findExercise }) {
  const [tab, setTab] = useState(firstTab);
  const [zoom, setZoom] = useState(false);
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose; // the parent makes a new onClose every render: do not re-run the effect (it re-stole focus and scrolled the page)
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const esc = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); prev?.focus?.({ preventScroll: true }); };
  }, []);

  // an alternative opened from somewhere: show it, but offer the original's alternatives list too
  const root = (shown.alt ? find(shown.parent) : shown) || shown;
  const ex = shown.alt ? { ...root, ...shown, steps: shown.cue ? [shown.cue, ...(root.steps || []).slice(1)] : root.steps, avoid: root.avoid } : shown;
  const picked = swaps && root ? swaps[root.id] : null;
  const strength = ex.sets > 0;
  const last = strength ? lastPerformance(sessions, ex.id) : null;
  const fav = favs.includes(root.id);
  const muscles = (ex.targets || []).filter((m) => MUSCLE_LABEL[m]);
  const photo = imageFor(ex) || (shown.alt ? null : imageFor(root));
  const tips = photo && photo.tips && photo.tips.length ? photo.tips : [];

  return createPortal(
    <div className="wp-sheet-wrap" onClick={onClose}>
      <div className="wp-sheet" role="dialog" aria-modal="true" aria-label={ex.name} ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="wp-sheet-head">
          <button type="button" className="wp-icon-btn" onClick={onClose} aria-label="Close">‹</button>
          <h3>{ex.name}</h3>
          <button type="button" className={`wp-icon-btn ${fav ? "on" : ""}`} onClick={() => onFav(root.id)} aria-pressed={fav} aria-label={fav ? "Remove from favourites" : "Add to favourites"}>{fav ? "♥" : "♡"}</button>
        </div>

        <div className="wp-sheet-body">
          {photo ? (
            <button type="button" className="wp-photo-big" onClick={() => setZoom(true)} aria-label={`Enlarge the photos for ${ex.name}`}>
              <img src={photo.how || photo.thumb} alt={`${ex.name}: step by step photos`} decoding="async" />
              <span aria-hidden="true">⤢ Tap to enlarge</span>
            </button>
          ) : hasFig(ex) ? <div className="wp-pic"><ExercisePic ex={picEx(ex)} /></div> : <div className="wp-pic wp-pic-empty" aria-hidden="true"><span>{MUSCLE_ICON[muscles[0]] || "🏋️"}</span></div>}

          {shown.alt && <p className="wp-note">Alternative to <b>{root.name}</b>{shown.note ? `. ${shown.note}` : ""}</p>}

          {strength ? (
            <div className="wp-tiles3">
              <div><small>Sets</small><b>{ex.sets}</b></div>
              <div><small>{ex.timed ? "Seconds" : "Reps"}</small><b>{ex.reps}</b>{ex.perSide ? <em>each side</em> : null}</div>
              <div><small>Rest</small><b>{ex.rest}s</b></div>
            </div>
          ) : ex.dose ? <div className="wp-tiles3 one"><div><small>Do</small><b>{ex.dose}</b></div></div> : null}

          {last && <p className="wp-last">Last time ({last.date}): {last.sets.map((s) => (s.w > 0 ? `${s.w}×${s.r}` : `${s.r}`)).join(" · ")}{topWeight(last.sets) > 0 ? " kg" : " reps"}</p>}

          <div className="wp-seg" role="tablist">
            {[["how", "How to do"], ["muscles", "Muscles"], ["alts", `Alternatives${root.alts?.length ? ` (${root.alts.length})` : ""}`]].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "how" && (
            <div className="wp-panel">
              {ex.steps?.length ? <ol className="wp-steps">{ex.steps.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}</ol> : <p className="wp-muted">Move slowly and stay in a pain-free range.</p>}
              {tips.length > 0 && <ul className="wp-tips" aria-label="Tips">{tips.map((t) => <li key={t}>{t}</li>)}</ul>}
              {ex.avoid && <p className="wp-avoid"><b>Avoid:</b> {ex.avoid}</p>}
              {ex.weightHint && <p className="wp-muted wp-small"><b>How heavy:</b> {ex.weightHint}</p>}
              {ex.progress && <p className="wp-muted wp-small"><b>When to go up:</b> {ex.progress}</p>}
              <p className="wp-muted wp-small">Stop if you feel sharp pain. Choose an alternative instead.</p>
            </div>
          )}

          {tab === "muscles" && (
            <div className="wp-panel">
              {muscles.length ? (
                <>
                  <p className="wp-small wp-muted">Main muscles</p>
                  <div className="wp-chips">{muscles.map((m) => <Chip key={m} tone="hot"><span aria-hidden="true">{MUSCLE_ICON[m]}</span> {MUSCLE_LABEL[m]}</Chip>)}</div>
                </>
              ) : <p className="wp-muted">Mobility and recovery. No single muscle group.</p>}
              {ex.helpers?.length > 0 && (<><p className="wp-small wp-muted">Helpers</p><div className="wp-chips">{ex.helpers.map((m) => <Chip key={m}>{MUSCLE_LABEL[m] || m}</Chip>)}</div></>)}
              <p className="wp-small wp-muted">In the picture, the highlighted body parts are the ones working.</p>
            </div>
          )}

          {tab === "alts" && (
            <div className="wp-panel">
              {!root.alts?.length ? <p className="wp-muted">No alternatives needed for this one.</p> : (
                <>
                  <p className="wp-small wp-muted">Pick ONE. Same muscles, same sets and reps.</p>
                  <ul className="wp-alts">
                    <li className={!picked ? "on" : ""}>
                      <FigThumb ex={root} size={52} />
                      <div><b>{root.name}</b><small>Original exercise</small></div>
                      {canSwap ? <button type="button" className="wp-pick" disabled={!picked} onClick={() => onSwap(root.id, null)}>{!picked ? "✓ In use" : "Use"}</button> : null}
                    </li>
                    {root.alts.map((a) => (
                      <li key={a.id} className={picked === a.id ? "on" : ""}>
                        <FigThumb ex={{ ...root, ...a }} size={52} />
                        <div><b>{a.name}</b>{a.note ? <small>{a.note}</small> : null}</div>
                        {canSwap ? <button type="button" className="wp-pick" disabled={picked === a.id} onClick={() => onSwap(root.id, a.id)}>{picked === a.id ? "✓ In use" : "Use"}</button> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {zoom && photo && (
        <div className="wp-zoom" role="dialog" aria-modal="true" aria-label={`${ex.name} photos`} onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button type="button" className="wp-zoom-x" aria-label="Close photo">✕</button>
          <img src={photo.how || photo.thumb} alt={`${ex.name}: step by step photos`} />
        </div>
      )}
    </div>,
    document.body
  );
}