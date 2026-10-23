// The tour UI: welcome (3 screens), real spotlight with cut-out, first-win cheers, first-week checklist, screen hints with a "?" replay,
// "what's new" dots and a finish moment with the Rookie sticker. All state lives in tourStore.js; all rules in tourEngine.js.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./tour.css";
import * as T from "./tourEngine.js";
import * as S from "./tourStore.js";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import { CHARS, ALL, dayChar } from "../motion/chars";
import RookieSticker from "./RookieSticker";

const BUILD = 37; // the app build number "what's new" entries are compared with
export const PAGE_OF = { home: "dashboard", log: "foodLogger", weight: "weight", planner: "planner", progress: "progress", tasks: "task", profile: "profile" };
export const SCREEN_OF = { dashboard: "home", foodLogger: "log", food: "log", weight: "weight", planner: "planner", recipes: "planner", progress: "progress", task: "tasks", profile: "profile" };
const content = S.content;

export function useSaved() {
  const [s, setS] = useState(S.getTour());
  useEffect(() => S.subscribe(setS), []);
  return s;
}

/** Measures [data-tour=name]; retries for ~2 s while the page renders. missing=true when it never shows up (the caller then skips the step). */
function useAnchor(name, enabled, { scroll = true } = {}) {
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setRect(null); setMissing(false);
    if (!enabled || !name) return undefined;
    let alive = true, tries = 0, el = null, timer = 0, poll = 0, ro = null;
    const view = () => ({ w: window.innerWidth, h: window.innerHeight });
    const measure = () => {
      el = document.querySelector(`[data-tour="${name}"]`);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const rc = { x: r.left, y: r.top, w: r.width, h: r.height };
      if (!T.usableRect(rc, view())) return false;
      if (alive) setRect((p) => (p && p.x === rc.x && p.y === rc.y && p.w === rc.w && p.h === rc.h ? p : rc));
      return true;
    };
    const attach = () => {
      if (scroll) { try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* old browser */ } }
      measure();
      const again = () => measure();
      window.addEventListener("scroll", again, true); window.addEventListener("resize", again);
      window.visualViewport?.addEventListener("resize", again);   // on-screen keyboard
      if (window.ResizeObserver) { ro = new ResizeObserver(again); ro.observe(el); }
      poll = window.setInterval(again, 600);
      cleanup = () => { window.removeEventListener("scroll", again, true); window.removeEventListener("resize", again); window.visualViewport?.removeEventListener("resize", again); ro?.disconnect(); clearInterval(poll); };
    };
    let cleanup = () => {};
    const find = () => {
      if (!alive) return;
      if (measure()) { attach(); return; }
      tries += 1;
      if (tries > 14) { setMissing(true); return; }
      timer = window.setTimeout(find, 150);
    };
    find();
    return () => { alive = false; clearTimeout(timer); cleanup(); };
  }, [name, enabled, scroll]);
  return { rect, missing };
}

function useTrap(ref, onEsc, active = true) {
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const node = ref.current; const prev = document.activeElement;
    const focusables = () => [...node.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
    (focusables()[0] || node).focus?.();
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onEsc?.(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", key);
    return () => { node.removeEventListener("keydown", key); try { prev?.focus?.(); } catch { /* element gone */ } };
  }, [ref, onEsc, active]);
}

// ------------------------------------------------------------------------------------------------ welcome
function Welcome({ profile, onClose }) {
  const saved = useSaved();
  const guess = useMemo(() => {
    const w = Number(profile?.currentWeightKg), t = Number(profile?.goals?.targetWeightKg);
    return !(w > 0 && t > 0) || Math.abs(w - t) < 0.4 ? "stay" : t < w ? "lose" : "build";
  }, [profile]);
  const [i, setI] = useState(0);
  const [goal, setGoal] = useState(saved.goal || guess);
  const [coach, setCoach] = useState(saved.coach || dayChar());
  const ref = useRef(null);
  useTrap(ref, onClose);
  const sc = content.welcome[i]; const last = i === content.welcome.length - 1;
  const go = () => {
    if (sc.choice === "goal") S.chooseGoal(goal);
    if (sc.choice === "coach") { S.chooseCoach(coach); apiFetch("/api/food-prefs/coach", { method: "PUT", body: JSON.stringify({ who: coach, tone: "" }) }).catch(() => {}); }
    if (last) S.beginTour(); else setI(i + 1);
  };
  return (
    <div className="tr-modal" role="dialog" aria-modal="true" aria-labelledby="tr-wt">
      <div className="tr-card" ref={ref} tabIndex={-1}>
        <div className="tr-dots" aria-hidden="true">{content.welcome.map((_, k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
        <Buddy scene={sc.choice === "coach" ? "cheer" : "wave"} size={104} who={sc.choice === "coach" ? coach : dayChar()} talk={false} />
        <h2 id="tr-wt" style={{ margin: "6px 0" }}>{sc.emoji} {sc.title}</h2>
        <p>{sc.text}</p>
        {sc.choice === "goal" && <div className="tr-choices" role="group" aria-label="Your goal">{content.goals.map((g) => <button key={g.id} type="button" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)}>{g.label}</button>)}</div>}
        {sc.choice === "coach" && <div className="tr-choices" role="group" aria-label="Your coach">{ALL.slice(0, 8).map((c) => <button key={c} type="button" aria-pressed={coach === c} onClick={() => setCoach(c)}>{CHARS[c]}</button>)}</div>}
        <div className="tr-row" style={{ justifyContent: "center" }}>
          {i > 0 && <button type="button" className="tr-btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="tr-btn primary" onClick={go}>{last ? "Start the tour" : "Next"}</button>
        </div>
        <div className="tr-row" style={{ justifyContent: "center", marginTop: 6 }}>
          <button type="button" className="tr-btn link" onClick={onClose}>Not now</button>
          <button type="button" className="tr-btn link" onClick={() => { S.dontShowAgain(); onClose(); }}>Don't show again</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ spotlight
function Spotlight({ step, index, total, onNext, onBack, onSkip, onMissing, onGo }) {
  const { rect, missing } = useAnchor(step.anchor, true);
  const tipRef = useRef(null);
  const [tipSize, setTipSize] = useState({ w: 300, h: 150 });
  useEffect(() => { if (missing) onMissing(); }, [missing, onMissing]);
  useTrap(tipRef, onSkip, !!rect);
  useLayoutEffect(() => { if (tipRef.current) { const r = tipRef.current.getBoundingClientRect(); if (r.height && (Math.abs(r.height - tipSize.h) > 2 || Math.abs(r.width - tipSize.w) > 2)) setTipSize({ w: r.width, h: r.height }); } });
  if (!rect) return null;
  const view = { w: window.innerWidth, h: window.innerHeight };
  const pad = 6; const r = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const pos = T.placeTip(r, view, tipSize);
  const interactive = T.isInteractive(step.id);
  const px = Math.max(16, Math.min(r.x + r.w / 2 - pos.x - 7, tipSize.w - 30));
  return (
    <>
      <div className="tr-dim" style={{ left: 0, top: 0, width: "100%", height: r.y }} />
      <div className="tr-dim" style={{ left: 0, top: r.y + r.h, width: "100%", height: Math.max(0, view.h - r.y - r.h) }} />
      <div className="tr-dim" style={{ left: 0, top: r.y, width: r.x, height: r.h }} />
      <div className="tr-dim" style={{ left: r.x + r.w, top: r.y, width: Math.max(0, view.w - r.x - r.w), height: r.h }} />
      <div className="tr-ring" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      <div className="tr-tip" ref={tipRef} role="dialog" aria-modal="false" aria-label={step.title} tabIndex={-1} style={{ left: pos.x, top: pos.y }}>
        <span className="tr-pointer" style={{ [pos.side === "below" ? "top" : "bottom"]: -8, left: px, transform: pos.side === "below" ? "rotate(45deg)" : "rotate(225deg)" }} aria-hidden="true" />
        <div className="tr-dots" aria-hidden="true">{Array.from({ length: total }, (_, k) => <i key={k} className={k <= index ? "on" : ""} />)}</div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tr-row">
          {index > 0 && <button type="button" className="tr-btn" onClick={onBack}>Back</button>}
          <button type="button" className="tr-btn primary" onClick={onNext}>{interactive ? "Skip this step" : index + 1 === total ? "Finish" : "Next"}</button>
          <button type="button" className="tr-btn link" onClick={onSkip}>Skip tour</button>
        </div>
        <span className="sr-only" role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Step {index + 1} of {total}. {step.title}. {step.text}</span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ first-week checklist (rendered on Home)
export function FirstWeekChecklist() {
  const saved = useSaved();
  const [open, setOpen] = useState(true);
  if (!saved.welcomeSeen || saved.checklistDismissed) return null;
  const c = T.checklistState(saved.events);
  return (
    <section className="tr-check" aria-label="Your first week" data-tour="checklist">
      <div className="tr-row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="tr-btn link" aria-expanded={open} onClick={() => setOpen(!open)}><b>Your first week · {c.label}</b></button>
        <span className="tr-row">
          {saved.status === "paused" && <button type="button" className="tr-btn" onClick={S.resumeTour}>Resume tour</button>}
          <button type="button" className="tr-btn" onClick={S.dismissChecklist} aria-label="Hide first-week checklist">✕</button>
        </span>
      </div>
      <div className="tr-dots" aria-hidden="true">{c.items.map((x) => <i key={x.id} className={x.done ? "on" : ""} />)}</div>
      {open && <ul>{c.items.map((x) => <li key={x.id} className={x.done ? "done" : ""}><span aria-hidden="true">{x.done ? "✅" : "⬜"}</span>{x.label}<span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>{x.done ? " done" : " to do"}</span></li>)}</ul>}
      {c.complete && <div className="tr-row" style={{ marginTop: 8 }}><RookieSticker size={56} label={false} /><b>{c.reward.text}</b>{!saved.rewardClaimed && <button type="button" className="tr-btn primary" onClick={S.claimReward}>Claim</button>}</div>}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ screen hints + what's new
function Hints({ screen, quiet }) {
  const saved = useSaved();
  const list = T.hintsFor(screen, saved.hintsSeen);
  const hint = !quiet ? list[0] : null;
  const ref = useRef(null);
  if (!hint) return null;
  return (
    <div className="tr-hint" role="status" ref={ref}>
      <div className="tr-row" style={{ justifyContent: "space-between" }}>
        <span>💡 {hint.text}</span>
        <button type="button" className="tr-btn primary" onClick={() => S.markHints([hint.id])}>Got it</button>
      </div>
    </div>
  );
}

function WhatsNew({ screen, quiet }) {
  const saved = useSaved();
  const entry = !quiet ? T.whatsNewFor(saved.newSeen, BUILD).find((w) => w.anchor) : null;
  const { rect } = useAnchor(entry?.anchor, !!entry, { scroll: false });
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [entry?.id, screen]);
  if (!entry || !rect) return null;
  return (
    <>
      <button type="button" className="tr-newdot" style={{ position: "fixed", left: rect.x + rect.w - 8, top: rect.y - 6, width: 24, height: 24, padding: 0, cursor: "pointer", zIndex: 870 }} aria-label="What's new" onClick={() => setOpen(true)} />
      {open && <div className="tr-hint" role="dialog" aria-label="What's new"><div className="tr-row" style={{ justifyContent: "space-between" }}><span>🆕 {entry.text}</span><button type="button" className="tr-btn primary" onClick={() => { S.markNewSeen(entry.id); setOpen(false); }}>Got it</button></div></div>}
    </>
  );
}

// ------------------------------------------------------------------------------------------------ host
export default function TourHost({ page, go, profile }) {
  const saved = useSaved();
  const screen = SCREEN_OF[page] || null;
  const [welcome, setWelcome] = useState(false);
  const [cheer, setCheer] = useState(null);
  const [finish, setFinish] = useState(false);
  const eng = T.init({ goal: saved.goal || "stay", saved: saved.path.length ? saved : null });
  const step = saved.status === "active" ? T.current({ ...eng, status: "active" }) : null;

  // sign-in: pull what the server remembers
  useEffect(() => { if (localStorage.getItem("mydailyos_token")) S.syncFromServer(); }, []);
  // a brand-new account opens the welcome right after onboarding; Profile > "Replay the tour" opens it again
  useEffect(() => { if (profile && profile.onboarded !== false && S.tourPending() && !saved.welcomeSeen) setWelcome(true); }, [profile, saved.welcomeSeen]);
  useEffect(() => { const f = () => setWelcome(true); window.addEventListener("flexfit:tour-open", f); return () => window.removeEventListener("flexfit:tour-open", f); }, []);
  // real actions: apiFetch announces every successful write, we map it to an event
  useEffect(() => {
    const f = (e) => S.emit(T.detectEvent(e.detail?.method, e.detail?.url));
    window.addEventListener("flexfit:api-write", f); return () => window.removeEventListener("flexfit:api-write", f);
  }, []);
  useEffect(() => S.onCheer(({ text }) => { setCheer(text); window.setTimeout(() => setCheer(null), 2400); }), []);
  // the tour wants a different screen: take the person there
  useEffect(() => { if (step && step.screen !== screen && PAGE_OF[step.screen]) go(PAGE_OF[step.screen]); }, [step?.id, screen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (saved.status === "done" && !saved.rewardClaimed) setFinish(true); }, [saved.status, saved.rewardClaimed]);

  const missing = useCallback(() => S.skipMissing(), []);
  const onScreen = step && step.screen === screen;
  const quiet = welcome || !!step || finish;
  const hasHints = !!(screen && T.allHints(screen).length);
  return (
    <>
      {welcome && <Welcome profile={profile} onClose={() => { S.closeWelcome(); setWelcome(false); }} />}
      {onScreen && <Spotlight key={step.id} step={step} index={saved.index} total={saved.path.length} onNext={S.nextStep} onBack={S.backStep} onSkip={S.skipTour} onMissing={missing} />}
      {finish && (
        <div className="tr-modal" role="dialog" aria-modal="true" aria-label="Tour complete">
          <div className="tr-card"><Buddy scene="victory" size={110} who={dayChar()} talk={false} /><h2>You are a Rookie now</h2><RookieSticker size={96} /><p>{content.checklistReward.text}</p><button type="button" className="tr-btn primary" onClick={() => { S.claimReward(); setFinish(false); }}>Claim sticker</button></div>
        </div>
      )}
      {cheer && <div className="tr-toast" role="status"><Buddy scene="powerup" size={40} who={dayChar()} talk={false} />{cheer}</div>}
      {screen && <Hints screen={screen} quiet={quiet} />}
      {screen && <WhatsNew screen={screen} quiet={quiet} />}
      {hasHints && !quiet && <button type="button" className="tr-help" style={{ position: "fixed", left: 12, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 860 }} aria-label="Show tips for this screen" title="Tips for this screen" onClick={() => S.resetHints(screen)}>?</button>}
    </>
  );
}

/** Profile card: replay, resume, hide. */
export function TourSettings() {
  const saved = useSaved();
  return (
    <section className="card" style={{ display: "grid", gap: 10, padding: 16, margin: "12px 0" }}>
      <h3 style={{ margin: 0 }}>Help and tour</h3>
      <div className="tr-row">
        <button type="button" className="tr-btn primary" onClick={() => S.replayTour()}>Replay the tour</button>
        {saved.status === "paused" && <button type="button" className="tr-btn" onClick={S.resumeTour}>Resume where I stopped</button>}
        {saved.checklistDismissed && <button type="button" className="tr-btn" onClick={() => { S.closeWelcome(); S.showChecklist(); }}>Show first-week checklist</button>}
      </div>
    </section>
  );
}
