// Everything the tour draws, mounted once in App: the welcome (3 screens), the real spotlight for each first-win step, the finish screen with the
// Rookie sticker, one-time coachmarks with a "?" to replay them, and "What's new" dots. All custom, no library, no tracker.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Buddy from "../motion/Buddy";
import { CHARS, ALL, dayChar, sprite } from "../motion/chars";
import { apiFetch } from "../config/api";
import RookieSticker from "./RookieSticker";
import { checklistText, content, cutout, currentStep, doneCopy, hintsFor, placeTooltip, progress, rectUsable, rewardLine, stepCopy, welcomeScreens } from "./engine.js";
import { PAGE_OF, SCREEN_OF, getPage, usePage } from "./page";
import { backStep, chooseGoal, closeFinished, dismissChecklist, finishTour, loadTour, newToShow, nextStep, seeHints, seeNew, setAnchorChecker, skipMissing, skipTour, startTour, useTour, welcomeBack, welcomeNext } from "./store";
import "./tour.css";

// The first element with this anchor that is actually visible (the phone tab bar and the desktop sidebar can both carry the same anchor).
const q = (id) => {
  if (typeof document === "undefined") return null;
  const all = [...document.querySelectorAll(`[data-tour="${id}"]`)];
  return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || all[0] || null;
};
const vpNow = () => ({ width: window.innerWidth, height: window.innerHeight });
const TONE_LABEL = { cheer: "Cheerful", calm: "Calm", strict: "Straight to the point" };

/** Measure an anchor by its data-tour attribute: on first sight scroll it into view, then keep up with scrolling, resizing and the keyboard. */
function useAnchorRect(id, active) {
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setRect(null); setMissing(false);
    if (!active || !id) return undefined;
    let scrolled = false, alive = true;
    const started = Date.now();
    const measure = () => {
      if (!alive) return;
      const el = q(id);
      if (!el) { if (Date.now() - started > 3200) setMissing(true); setRect(null); return; }
      const r = el.getBoundingClientRect(), vp = vpNow();
      if (!scrolled && (r.top < 60 || r.bottom > vp.height - 60) && el.scrollIntoView) { scrolled = true; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
      const next = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      setRect((p) => (p && p.x === next.x && p.y === next.y && p.width === next.width && p.height === next.height ? p : next));
      if (!rectUsable(next, vp) && Date.now() - started > 3200) setMissing(true);
    };
    measure();
    const iv = setInterval(measure, 140);
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    const vv = window.visualViewport; vv && vv.addEventListener("resize", measure);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); vv && vv.removeEventListener("resize", measure); };
  }, [id, active]);
  return { rect, missing };
}

/** Keep Tab inside `ref` (plus any `extra` elements, such as the highlighted button the person has to press). Esc calls onEsc. */
function useTrap(ref, onEsc, extra) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onEsc(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const sel = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
      const list = [...ref.current.querySelectorAll(sel)];
      const ex = extra ? extra() : null;
      if (ex) list.push(...(ex.matches(sel) ? [ex] : []), ...ex.querySelectorAll(sel));
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && (i === list.length - 1)) { e.preventDefault(); list[0].focus(); }
      else if (i === -1) { e.preventDefault(); list[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, onEsc, extra]);
}

function Welcome({ t }) {
  const ref = useRef(null);
  const who = t.who && CHARS[t.who] ? t.who : dayChar();
  const screens = welcomeScreens({ goalKnown: t.goalKnown || !!t.goal, coachKnown: t.coachKnown });
  const w = screens[t.welcomeIndex];
  const [picked, setPicked] = useState(who), [tone, setTone] = useState(t.tone);
  const [changeGoal, setChangeGoal] = useState(false);
  const goalLabel = content.goals.find((g) => g.id === t.goal)?.label;
  useTrap(ref, () => skipTour(false));
  useEffect(() => { ref.current && ref.current.querySelector("button")?.focus(); }, [t.welcomeIndex]);
  const saveCoach = () => apiFetch("/api/food-prefs/coach", { method: "PUT", body: JSON.stringify({ who: picked, tone }) }).catch(() => {});
  const nextW = () => { if (w.id === "coach" && !w.known) saveCoach(); welcomeNext(); };
  return (
    <div className="tr-veil" role="presentation">
      <div className="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-wt" aria-describedby="tr-wb" ref={ref}>
        <div className="tr-who"><Buddy scene="wave" size={88} who={w.id === "coach" ? picked : who} talk={false} label="Sensei" /></div>
        <p className="tr-eyebrow">{t.welcomeIndex + 1} of 3</p>
        <h2 id="tr-wt">{w.emoji} {w.title}</h2>
        <p id="tr-wb">{w.known && !changeGoal ? w.knownBody : w.body}</p>
        {w.id === "goal" && (!w.known || changeGoal) && (
          <div className="tr-chips" role="radiogroup" aria-label="Your goal">
            {content.goals.map((g) => <button key={g.id} type="button" role="radio" aria-checked={t.goal === g.id} className={`tr-chip ${t.goal === g.id ? "on" : ""}`} onClick={() => chooseGoal(g.id)}>{g.emoji} {g.label}</button>)}
          </div>
        )}
        {w.id === "goal" && w.known && !changeGoal && <p className="tr-known"><b>{goalLabel || "Stay healthy"}</b> <button type="button" className="tr-link" onClick={() => setChangeGoal(true)}>Change</button></p>}
        {w.id === "coach" && !w.known && (
          <>
            <div className="tr-cast" role="radiogroup" aria-label="Your coach">
              {ALL.map((c) => <button key={c} type="button" role="radio" aria-checked={picked === c} aria-label={CHARS[c]} className={`tr-cast-btn ${picked === c ? "on" : ""}`} onClick={() => setPicked(c)}><img src={sprite(c, "wave")} alt="" width="40" height="40" /></button>)}
            </div>
            <div className="tr-chips" role="radiogroup" aria-label="How your coach talks">
              {Object.entries(TONE_LABEL).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={tone === k} className={`tr-chip ${tone === k ? "on" : ""}`} onClick={() => setTone(k)}>{l}</button>)}
            </div>
          </>
        )}
        <div className="tr-actions">
          <button type="button" className="tr-btn ghost" onClick={() => skipTour(false)}>Skip</button>
          {t.welcomeIndex > 0 && <button type="button" className="tr-btn ghost" onClick={welcomeBack}>Back</button>}
          <button type="button" className="tr-btn" onClick={nextW}>{t.welcomeIndex === 2 ? "Start" : "Next"}</button>
        </div>
        <div className="tr-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= t.welcomeIndex ? "on" : ""} />)}</div>
      </div>
    </div>
  );
}

function Spotlight({ t }) {
  const eng = t.engine, step = currentStep(eng), id = eng.path[eng.index];
  const tipRef = useRef(null);
  const lastRoute = useRef(null);
  const [vp, setVp] = useState(vpNow());
  const [tipSize, setTipSize] = useState({ width: 330, height: 170 });
  const celebrating = t.celebrate === id;
  const [acted, setActed] = useState(false);            // the person tapped the highlighted element: let go of the dimmer so they can finish the task
  useEffect(() => {
    setActed(false);
    const on = (e) => { const el = step && q(step.anchor); if (el && e.target instanceof Node && el.contains(e.target)) setActed(true); };
    document.addEventListener("click", on, true);
    return () => document.removeEventListener("click", on, true);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { rect, missing } = useAnchorRect(step && step.anchor, !!step);
  const who = t.who && CHARS[t.who] ? t.who : dayChar();

  useEffect(() => {                                    // open the real page for this step
    if (!step || lastRoute.current === step.route) return;
    lastRoute.current = step.route;
    window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: PAGE_OF[step.route] || "dashboard" } }));
  }, [step]);
  useEffect(() => { if (missing && step) skipMissing(step.anchor); }, [missing, step]);
  useEffect(() => { const f = () => setVp(vpNow()); window.addEventListener("resize", f); const v = window.visualViewport; v && v.addEventListener("resize", f); return () => { window.removeEventListener("resize", f); v && v.removeEventListener("resize", f); }; }, []);
  useLayoutEffect(() => { if (tipRef.current) { const r = tipRef.current.getBoundingClientRect(); setTipSize((p) => (Math.abs(p.height - r.height) > 1 || Math.abs(p.width - r.width) > 1 ? { width: r.width, height: r.height } : p)); } });
  const anchorEl = useCallback(() => (step ? q(step.anchor) : null), [step]);
  useTrap(tipRef, () => skipTour(false), anchorEl);
  useEffect(() => { tipRef.current && tipRef.current.focus({ preventScroll: true }); }, [id]);

  if (!step) return null;
  const docked = acted && !celebrating && step.kind === "do";
  const hole = docked ? null : cutout(rectUsable(rect, vp) ? rect : null, vp, 8);
  const tipW = Math.min(340, vp.width - 16);
  const pos = docked ? { placement: "dock", top: Math.max(8, vp.height - tipSize.height - 12), left: Math.max(8, (vp.width - tipW) / 2), width: tipW } : placeTooltip(hole, { width: tipW, height: tipSize.height }, vp);
  const isDo = step.kind === "do", p = progress(eng);
  const text = celebrating ? doneCopy(id, t.tone) : stepCopy(id, t.tone, CHARS[who]);
  const blockers = docked ? [] : hole
    ? [{ top: 0, left: 0, width: vp.width, height: hole.y }, { top: hole.y + hole.height, left: 0, width: vp.width, height: Math.max(0, vp.height - hole.y - hole.height) }, { top: hole.y, left: 0, width: hole.x, height: hole.height }, { top: hole.y, left: hole.x + hole.width, width: Math.max(0, vp.width - hole.x - hole.width), height: hole.height }]
    : [{ top: 0, left: 0, width: vp.width, height: vp.height }];
  return (
    <div className="tr-layer" data-tour-ui>
      {blockers.map((b, i) => <div key={i} className="tr-dim" style={b} onClick={(e) => e.stopPropagation()} />)}
      {hole && <><div className="tr-ring" style={{ top: hole.y, left: hole.x, width: hole.width, height: hole.height }} /><div className="tr-pointer" aria-hidden="true" style={{ top: pos.placement === "top" ? hole.y - 30 : hole.y + hole.height + 2, left: hole.x + hole.width / 2 - 12 }}>{pos.placement === "top" ? "👇" : "👆"}</div></>}
      <div className={`tr-tip ${pos.placement}`} ref={tipRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={`Tour step ${p.at} of ${p.of}`} style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <div className="tr-tip-head">
          <Buddy scene={celebrating ? "powerup" : step.scene || "wave"} size={celebrating ? 72 : 56} who={who} talk={false} label="Sensei" />
          <div><p className="tr-eyebrow">Step {p.at} of {p.of}</p><p className="tr-say">{text}</p></div>
        </div>
        <div className="tr-live" aria-live="polite" role="status">{text}</div>
        <div className="tr-bars" aria-hidden="true">{eng.path.map((sid, i) => <i key={sid} className={eng.done.includes(sid) ? "done" : i === eng.index ? "on" : ""} />)}</div>
        <div className="tr-actions">
          <button type="button" className="tr-btn ghost" onClick={() => skipTour(false)}>Skip tour</button>
          <button type="button" className="tr-btn ghost" onClick={backStep} disabled={eng.index === 0}>Back</button>
          <button type="button" className="tr-btn" onClick={nextStep}>{isDo && !celebrating && !eng.done.includes(id) ? "Skip step" : p.at === p.of ? "Finish" : "Next"}</button>
        </div>
        <button type="button" className="tr-link tr-never" onClick={() => skipTour(true)}>Don’t show again</button>
      </div>
    </div>
  );
}

function Finish({ t }) {
  const ref = useRef(null);
  useTrap(ref, closeFinished);
  useEffect(() => { ref.current && ref.current.querySelector("button")?.focus(); }, []);
  const who = t.who && CHARS[t.who] ? t.who : dayChar();
  return (
    <div className="tr-veil" role="presentation">
      <div className="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-ft" ref={ref}>
        <div className="tr-who"><Buddy scene="victory" size={96} who={who} talk={false} label="Sensei" /></div>
        <h2 id="tr-ft">🎉 You did it</h2>
        <p>{rewardLine(t.tone)}</p>
        <div className="tr-reward"><RookieSticker size={88} />{t.unlockedNow && <p role="status"><b>Sticker unlocked!</b> New journey step: {content.reward.journeyStep}.</p>}</div>
        <div className="tr-actions"><button type="button" className="tr-btn" onClick={closeFinished}>Let’s go</button></div>
      </div>
    </div>
  );
}

/** One-time hints for the screen you just opened, and a "?" to see them again. */
function Coachmarks({ screen, t }) {
  const [replay, setReplay] = useState(false), [i, setI] = useState(0);
  const list = useMemo(() => hintsFor(screen, t.hintsSeen, replay), [screen, t.hintsSeen, replay]);
  const [firstSeen] = useState(() => new Set());
  useEffect(() => { setI(0); setReplay(false); }, [screen]);
  const open = (t.phase === "idle") && list.length > 0 && !t.never || (replay && list.length > 0);
  const hint = list[Math.min(i, list.length - 1)];
  const { rect } = useAnchorRect(open && hint && hint.anchor, !!(open && hint && hint.anchor));
  const hasAny = (content.coachmarks[screen] || []).length > 0;
  if (t.phase !== "idle") return null;
  const done = () => { seeHints(list.map((h) => h.id)); setReplay(false); setI(0); };
  const vp = vpNow(), hole = hint && hint.anchor ? cutout(rectUsable(rect, vp) ? rect : null, vp, 6) : null;
  return (
    <>
      {open && hint && (
        <div className="tr-hint" role="region" aria-label="Tip" aria-live="polite">
          {hole && <div className="tr-ring soft" style={{ top: hole.y, left: hole.x, width: hole.width, height: hole.height }} aria-hidden="true" />}
          <p>{hint.text}</p>
          <div className="tr-hint-row"><span className="tr-eyebrow">{i + 1} of {list.length}</span>
            {i < list.length - 1 ? <button type="button" className="tr-btn small" onClick={() => setI(i + 1)}>Next</button> : <button type="button" className="tr-btn small" onClick={done}>Got it</button>}
          </div>
        </div>
      )}
      {hasAny && !open && <button type="button" className="tr-help" aria-label="Show tips for this screen" title="Tips for this screen" onClick={() => { setI(0); setReplay(true); }}>?</button>}
    </>
  );
}

/** A dot on features that are new; tapping it explains once. */
function NewDots({ t, page }) {
  const [open, setOpen] = useState(null), [tick, setTick] = useState(0);
  const live = useMemo(() => newToShow(), [t.newSeen]);
  useEffect(() => { const iv = setInterval(() => setTick((n) => n + 1), 700); return () => clearInterval(iv); }, []);
  if (t.phase !== "idle" || t.never) return null;
  return (
    <>
      {live.map((w) => {
        const el = q(w.anchor); if (!el) return null;
        const r = el.getBoundingClientRect(); if (!rectUsable({ x: r.x, y: r.y, width: r.width, height: r.height }, vpNow())) return null;
        const shown = open === w.id;
        return (
          <span key={w.id} data-tick={tick}>
            <button type="button" className="tr-dot" aria-label={`New: ${w.text}`} style={{ top: r.top - 6, left: r.right - 10 }} onClick={() => { setOpen(w.id); }} />
            {shown && <div className="tr-pop" role="status" style={{ top: Math.min(r.bottom + 8, window.innerHeight - 110), left: Math.max(8, Math.min(r.left, window.innerWidth - 260)) }}>
              <p>{w.text}</p><button type="button" className="tr-btn small" onClick={() => { seeNew(w.id); setOpen(null); }}>Got it</button></div>}
          </span>
        );
      })}
    </>
  );
}

export default function TourHost() {
  const t = useTour();
  const page = usePage();
  useEffect(() => { loadTour(); }, []);
  useEffect(() => { setAnchorChecker((a, stp) => (stp && PAGE_OF[stp.route] !== getPage() ? true : !!q(a))); }, []);
  useEffect(() => { document.body.classList.toggle("tr-on", t.phase === "welcome" || t.phase === "steps"); return () => document.body.classList.remove("tr-on"); }, [t.phase]);
  if (!t.ready && t.phase === "idle") return null;
  return (
    <>
      {t.phase === "welcome" && <Welcome t={t} />}
      {t.phase === "steps" && t.engine && <Spotlight t={t} />}
      {t.phase === "finished" && <Finish t={t} />}
      <Coachmarks screen={SCREEN_OF[page]} t={t} />
      <NewDots t={t} page={page} />
    </>
  );
}
export { startTour, dismissChecklist, finishTour, checklistText };
