// The Coach hub: ONE screen for the diet coach and the gym coach. One next action, the 10-second readiness check-in, today's eating plan
// (lifting day vs rest day), this week's decision with the reason, the "behind plan" choice (move the date or raise the pace), the goal-date
// forecast, advice that needs both coaches, the optional cycle log, and a changelog of what the coach changed with one-tap undo.
// Everything comes from GET /api/coach/hub (same answer the phone app shows). Words come from the translation files (utils/coachText.js).
import { useCallback, useEffect, useState } from "react";
import "./dailycoach.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { useT } from "../i18n";
import { bodySections } from "../utils/bodyCards";
import { advisoryText, applyLabel, bandNote, nextText, offerTexts, refreshNote, tr, weeklyHeadline, weeklyMessages } from "../utils/coachText";

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString();
const SLEEP = [["< 5 h", 4.5], ["5-6", 5.5], ["6-7", 6.5], ["7-8", 7.5], ["8+", 8.5]];
const ONE_TO_FIVE = [1, 2, 3, 4, 5];

async function call(path, method = "GET", body) {
  const r = await apiFetch(path, body ? { method, body: JSON.stringify(body) } : { method });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Something went wrong.");
  return j;
}

function Scale({ id, label, value, onPick, items }) {
  return (
    <div className="ch-row">
      <span className="ch-lab" id={`ch-${id}`}>{label}</span>
      <div className="dg-seg" role="group" aria-labelledby={`ch-${id}`}>
        {items.map(([text, v]) => <button key={text} type="button" className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onPick(v)}>{text}</button>)}
      </div>
    </div>
  );
}

/** The cycle card: off by default; when on, log the day a period started (any day in the last year) and remove a wrong one. */
function CycleCard({ cycle, t, busy, run }) {
  const on = cycle && cycle.enabled;
  const todayStr = getLocalDate();
  const [date, setDate] = useState(todayStr);
  return (
    <section className="dg" aria-label={t("coach.cycle.title")}>
      <b className="dg-title">{t("coach.cycle.title")}</b>
      <span className="dg-sub">{t("coach.cycle.intro")}</span>
      <label className="ch-switch">
        <input type="checkbox" checked={!!on} disabled={busy} onChange={(e) => run(() => call("/api/coach/cycle", "PUT", { enabled: e.target.checked, today: todayStr }), e.target.checked ? t("coach.cycle.saved") : t("coach.cycle.erased"))} />
        <span><b className="dg-title">{t("coach.cycle.use")}</b></span>
      </label>
      {on && (
        <>
          {cycle.known && !cycle.stale && <span>{t("coach.cycle.day", { day: cycle.day, length: cycle.length })}{cycle.phase ? ` · ${t(`coach.cycle.phase.${cycle.phase}`)}` : ""}</span>}
          {cycle.waterWindow && <span className="dg-sub">{t("coach.cycle.water")}</span>}
          {cycle.nextStart && <span className="dg-sub">{t("coach.cycle.next", { date: cycle.nextStart })}</span>}
          {cycle.stale && <span className="dg-sub">{t("coach.cycle.stale")}</span>}
          <div className="dg-seg">
            <button type="button" className="on" disabled={busy} onClick={() => run(() => call("/api/coach/cycle/start", "POST", { today: todayStr }), t("coach.cycle.saved"))}>{t("coach.cycle.start")}</button>
          </div>
          <label className="ch-row"><span className="ch-lab">{t("coach.cycle.logDate")}</span>
            <input type="date" value={date} max={todayStr} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="dg-seg"><button type="button" disabled={busy || !date || date > todayStr} onClick={() => run(() => call("/api/coach/cycle/start", "POST", { date, today: todayStr }), t("coach.cycle.saved"))}>{t("coach.cycle.logIt")}</button></div>
          {Array.isArray(cycle.starts) && cycle.starts.length > 0 && (
            <div>
              <span className="dg-sub">{t("coach.cycle.history")}</span>
              {cycle.starts.slice().reverse().map((d) => (
                <div key={d} className="ch-log"><span>{d}</span>
                  <button type="button" disabled={busy} aria-label={t("coach.cycle.remove", { date: d })} onClick={() => run(() => call(`/api/coach/cycle/start?date=${d}&today=${todayStr}`, "DELETE"), t("coach.cycle.removed"))}>{t("coach.cycle.remove", { date: d })}</button>
                </div>
              ))}
            </div>
          )}
          <div className="dg-seg"><button type="button" disabled={busy} onClick={() => run(() => call("/api/coach/cycle", "DELETE"), t("coach.cycle.erased"))}>{t("coach.cycle.erase")}</button></div>
        </>
      )}
    </section>
  );
}

/** "You are N weeks behind": two choices, both need a tap, both can be undone. */
function OfferCard({ offer, t, busy, run }) {
  const x = offerTexts(t, offer);
  if (!x) return null;
  const choose = (choice, key) => run(() => call("/api/coach/offer/apply", "POST", { choice, key, today: getLocalDate() }), t("coach.offer.applied"));
  return (
    <section className="dg" aria-label={x.title}>
      <b className="dg-title">{x.title}</b>
      <span>{x.body}</span>
      {x.date && <div className="ch-opt"><b>{x.date.title}</b><span className="dg-sub">{x.date.detail}</span><div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={() => choose("date", offer.date.key)}>{applyLabel(t, offer.date.apply)}</button></div></div>}
      {x.pace && <div className="ch-opt"><b>{x.pace.title}</b><span className="dg-sub">{x.pace.detail}</span><div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={() => choose("pace", offer.pace.key)}>{applyLabel(t, offer.pace.apply)}</button></div></div>}
      {x.noPace && <span className="dg-sub">{x.noPace}</span>}
      <div className="dg-seg"><button type="button" disabled={busy} onClick={() => run(() => call("/api/coach/offer/snooze", "POST", { today: getLocalDate() }), t("coach.offer.snoozed"))}>{t("coach.offer.snooze")}</button></div>
    </section>
  );
}

/** "Ease the pace for the final stretch": one tap, undoable (same endpoint as the other offers). */
function TaperCard({ taper, t, busy, run }) {
  if (!taper) return null;
  return (
    <section className="dg" aria-label={t("coach.body.taper.title")}>
      <b className="dg-title">{t("coach.body.taper.title")}</b>
      <span>{t("coach.body.taper.detail", { remaining: Math.round(taper.remainingKg * 10) / 10, from: taper.fromPace, to: taper.pace, more: Math.round(taper.kcalMore).toLocaleString(), weeks: taper.finishWeeks })}</span>
      <div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={() => run(() => call("/api/coach/offer/apply", "POST", { choice: "taper", key: taper.key, today: getLocalDate() }), t("coach.offer.applied"))}>{t("coach.apply.taper", { pace: taper.pace })}</button></div>
      <div className="dg-seg"><button type="button" disabled={busy} onClick={() => run(() => call("/api/coach/offer/snooze", "POST", { today: getLocalDate() }), t("coach.offer.snoozed"))}>{t("coach.offer.snooze")}</button></div>
    </section>
  );
}

/** Body progress: loaded only when opened, so it costs nothing until someone looks. */
function BodyProgress({ t, busy, run }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { call(`/api/coach/body?today=${getLocalDate()}`).then((j) => { setData(j); setFailed(false); }).catch(() => setFailed(true)); }, []);
  useEffect(() => { if (open && !data) load(); }, [open, data, load]);
  const sections = data ? bodySections(t, data) : [];
  return (
    <section className="dg" aria-label={t("coach.body.title")}>
      <button type="button" className="dg-head" aria-expanded={open} onClick={() => setOpen(!open)}><b className="dg-title">{t("coach.body.title")}</b><span className="dg-sub">{open ? t("coach.body.hide") : t("coach.body.show")}</span></button>
      {open && !data && !failed && <p className="dg-sub" role="status">{t("coach.body.loading")}</p>}
      {open && failed && <p className="dg-sub">{t("coach.failed")}</p>}
      {open && data && sections.length === 0 && <p className="dg-sub">{t("coach.body.empty")}</p>}
      {open && sections.map((x) => (
        <div key={x.id} className={`ch-opt ${x.level === "warn" ? "dg-warn" : ""}`}>
          <b className="dg-title">{x.title}</b>
          {x.lines.map((l, i) => <span key={i} className="dg-sub" style={{ whiteSpace: "pre-wrap" }}>{l}</span>)}
          {x.action && <div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={() => run(async () => { const j = await call("/api/coach/offer/apply", "POST", { choice: "taper", key: x.action.key, today: getLocalDate() }); setData(null); return j; }, t("coach.offer.applied"))}>{x.action.label}</button></div>}
        </div>
      ))}
    </section>
  );
}

/** The DAILY decision (GET /api/coach/daily): today's view of the weekly plan. Read-only by design: only the weekly coach changes the plan. */
function DailyCard({ busy }) {
  const [d, setD] = useState(null);
  useEffect(() => { call(`/api/coach/daily?today=${getLocalDate()}`).then((j) => setD(j.decision)).catch(() => {}); }, [busy]);
  if (!d || !d.targets) return null;
  const tg = d.targets, rng = (x) => `${x.min}\u2013${x.max} g`;
  const aim = tg.protein.aim && tg.protein.aim !== tg.protein.goal ? ` (aim ${tg.protein.aim} g today)` : "";
  return (
    <section className="dg" aria-label={`Today: ${d.headline}`}>
      <b className="dg-title">Today: {d.headline}</b>
      <ul>{(d.messages || []).map((m, i) => <li key={i}>{m}</li>)}</ul>
      <span className="dg-sub">{fmt(tg.calories)} kcal \u00b7 protein {rng(tg.protein)}{aim} \u00b7 carbs {rng(tg.carbs)} \u00b7 fat {rng(tg.fat)}{tg.waterMl ? ` \u00b7 water ${(tg.waterMl / 1000).toFixed(1)} L` : ""}</span>
    </section>
  );
}

export default function CoachHub() {
  const { t } = useT();
  const [hub, setHub] = useState(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sleep, setSleep] = useState(null);
  const [energy, setEnergy] = useState(null);
  const [sore, setSore] = useState(null);
  const [stress, setStress] = useState(null);

  const load = useCallback(() => {
    call(`/api/coach/hub?today=${getLocalDate()}&hour=${new Date().getHours()}`).then((j) => { setHub(j); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="dg-sub">{t("coach.failed")}</p>;
  if (!hub) return <p className="dg-sub" role="status">{t("coach.loading")}</p>;

  // fn returns the server answer; when the phone is offline the answer is { queued: true } and the screen says it was saved for later
  const run = async (fn, ok) => {
    setBusy(true);
    try { const j = await fn(); notify(j && j.queued ? t("coach.queued") : ok, "success"); window.dispatchEvent(new Event("ff:refresh")); load(); } catch (e) { notify(e.message || "Could not do that.", "error"); } finally { setBusy(false); }
  };
  const saveCheckin = () => {
    if ([sleep, energy, sore, stress].filter((x) => x !== null).length < 2) return notify(t("coach.checkin.need2"), "error");
    return run(() => call("/api/coach/readiness", "POST", { today: getLocalDate(), sleepHours: sleep ?? undefined, energy: energy ?? undefined, soreness: sore ?? undefined, stress: stress ?? undefined }), t("coach.checkin.saved"));
  };
  const { nextAction, readiness, dayPlan, restOfDay, prompts = [], weekly: w, forecast, gym, advisories, changelog, undo, offer, taper, cycle, showCycle } = hub;
  const checked = readiness && readiness.today && readiness.adjust && readiness.adjust.band;
  const nums = ONE_TO_FIVE.map((v) => [String(v), v]);
  const nx = nextText(t, nextAction, readiness && readiness.adjust && readiness.adjust.band);
  const refreshed = refreshNote(t, w);

  return (
    <div className="ch">
      <section className="dg ch-next" aria-label={t("coach.next.label")}>
        <span className="dg-sub">{t("coach.next.label")}</span>
        <b className="dg-title">{nextAction.kind === "decision" && w ? weeklyHeadline(t, w) : nx.title}</b>
        <span className="dg-sub">{nx.detail}</span>
      </section>

      <section className="dg" aria-label={t("coach.checkin.title")}>
        <b className="dg-title">{checked ? t("coach.checkin.recovery", { score: readiness.adjust.score }) : t("coach.checkin.title")}</b>
        <span className={`dg-sub ${checked ? `ch-${readiness.adjust.band}` : ""}`}>{checked ? bandNote(t, readiness.adjust.band, readiness.adjust.note) : t("coach.checkin.hint")}</span>
        <Scale id="sleep" label={t("coach.checkin.sleep")} value={sleep} onPick={setSleep} items={SLEEP} />
        <Scale id="energy" label={t("coach.checkin.energy")} value={energy} onPick={setEnergy} items={nums} />
        <Scale id="sore" label={t("coach.checkin.soreness")} value={sore} onPick={setSore} items={nums} />
        <Scale id="stress" label={t("coach.checkin.stress")} value={stress} onPick={setStress} items={nums} />
        <div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={saveCheckin}>{checked ? t("coach.checkin.update") : t("coach.checkin.save")}</button></div>
        {readiness.week && readiness.week.low && <p className="dg-sub ch-red">{readiness.week.note}</p>}
      </section>

      {dayPlan && (
        <section className="dg" aria-label={dayPlan.kind === "training" ? t("coach.day.training") : t("coach.day.rest")}>
          <b className="dg-title">{dayPlan.kind === "training" ? t("coach.day.training") : t("coach.day.rest")} · {fmt(dayPlan.kcal)} kcal</b>
          <span>{t("coach.day.macros", { p: dayPlan.proteinG, c: dayPlan.carbsG, f: dayPlan.fatG })}</span>
          <span className="dg-sub">{dayPlan.note}</span>
          {dayPlan.pre && <span>{t("coach.day.before", { text: dayPlan.pre })}</span>}
          {dayPlan.post && <span>{t("coach.day.after", { text: dayPlan.post })}</span>}
          {dayPlan.warn && <span className="dg-sub">{dayPlan.warn}</span>}
          {dayPlan.recovery && <span className="dg-sub">{dayPlan.recovery}</span>}
        </section>
      )}

      {restOfDay && (
        <section className="dg" aria-label={t("coach.rest.title")}>
          <b className="dg-title">{t("coach.rest.title")}</b>
          <span>{restOfDay.message}</span>
          <ul>{restOfDay.plan.map((p) => <li key={p.slot}><b>{p.slot}</b>: about {fmt(p.kcal)} kcal{p.proteinG ? `, ${p.proteinG} g protein` : ""}. {p.idea}</li>)}</ul>
        </section>
      )}

      {prompts.map((p) => (
        <section key={p.id} className="dg" aria-label={p.title}>
          <b className="dg-title">{p.title}</b><span className="dg-sub">{p.detail}</span>
          <div className="dg-seg"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: p.page } }))}>Open</button></div>
        </section>
      ))}

      {w && (
        <section className="dg" aria-label={t("coach.weekly.title", { headline: weeklyHeadline(t, w) })}>
          <b className="dg-title">{t("coach.weekly.title", { headline: weeklyHeadline(t, w) })}</b>
          {refreshed && <p className="dg-sub">{refreshed}</p>}
          <ul>{weeklyMessages(t, w).map((m, i) => <li key={i}>{m}</li>)}</ul>
          {w.applied && <p className="dg-sub">{w.auto ? t("coach.weekly.appliedAuto") : t("coach.weekly.applied")}</p>}
          {w.apply && !w.applied && <div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={() => run(() => call("/api/coach/weekly/apply", "POST", { today: getLocalDate(), decisionId: w.id }), t("coach.apply.done"))}>{applyLabel(t, w.apply)}</button></div>}
          {w.composition && w.composition.note && <p className="dg-sub">{w.composition.note}</p>}
          {!!w.outliers && <p className="dg-sub">{t("coach.weekly.outliers", { n: w.outliers })}</p>}
        </section>
      )}

      <DailyCard busy={busy} />

      <OfferCard offer={offer} t={t} busy={busy} run={run} />
      <TaperCard taper={taper} t={t} busy={busy} run={run} />

      {forecast && <section className="dg" aria-label={t("coach.forecast.title")}><b className="dg-title">{t("coach.forecast.title")}</b><span>{forecast.message}</span>{forecast.range && <span className="dg-sub">{t("coach.forecast.range", { from: forecast.range.earliest.date, to: forecast.range.latest.date })}</span>}</section>}

      {gym && (
        <section className="dg" aria-label={t("coach.training.title", { phase: gym.phase.name })}>
          <b className="dg-title">{t("coach.training.title", { phase: gym.phase.name })}</b>
          <span>{gym.phase.why}</span>
          {gym.todayPlan && <span className="dg-sub">{gym.todayPlan.text}</span>}
        </section>
      )}

      {advisories.map((a) => { const x = advisoryText(t, a); return <section key={a.id} className={`dg ${a.level === "warn" ? "dg-warn" : ""}`}><b className="dg-title">{x.title}</b><span>{x.detail}</span></section>; })}

      <BodyProgress t={t} busy={busy} run={run} />

      {showCycle && <CycleCard cycle={cycle} t={t} busy={busy} run={run} />}

      <section className="dg" aria-label={t("coach.auto.title")}>
        <label className="ch-switch">
          <input type="checkbox" checked={hub.auto === "safe"} disabled={busy} onChange={(e) => run(() => call("/api/profile", "PATCH", { goals: { coachAuto: e.target.checked ? "safe" : "off" }, today: getLocalDate() }), e.target.checked ? t("coach.auto.on") : t("coach.auto.off"))} />
          <span><b className="dg-title">{t("coach.auto.title")}</b><span className="dg-sub">{t("coach.auto.detail")}</span></span>
        </label>
      </section>

      {undo && (
        <section className="dg" aria-label={t("coach.undo.title")}>
          <b className="dg-title">{t("coach.undo.title")}</b>
          <span>{t("coach.undo.line", { change: undo.change || "Plan change", how: undo.auto ? t("coach.undo.auto") : t("coach.undo.manual"), date: undo.date })}</span>
          <div className="dg-seg"><button type="button" disabled={busy} onClick={() => run(() => call("/api/coach/weekly/undo", "POST", { today: getLocalDate() }), t("coach.undo.done"))}>{t("coach.undo.button")}</button></div>
        </section>
      )}

      {changelog.length > 0 && (
        <section className="dg" aria-label={t("coach.log.title")}>
          <b className="dg-title">{t("coach.log.title")}</b>
          {changelog.slice(0, 6).map((e, i) => (
            <div key={i} className="ch-log">
              <b>{e.date} · {tr(t, `coach.w.${e.action}.head`, { to: "", kcal: 100 }, e.headline)}{e.undone ? ` ${t("coach.log.undone")}` : ""}</b>
              <span className="dg-sub">{e.change}{e.auto ? ` · ${t("coach.log.auto")}` : ""}</span>
              {e.after && <span className="dg-sub">{e.after.text}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/** Home's ONE coach card: today's next step, and the pending Apply right on it (the separate weekly card is gone). Uses the light endpoint. */
export function CoachNextActionCard() {
  const { t } = useT();
  const [n, setN] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { call(`/api/coach/next?today=${getLocalDate()}`).then(setN).catch(() => {}); }, []);
  useEffect(() => { load(); const f = () => load(); window.addEventListener("ff:refresh", f); window.addEventListener("flexfit:synced", f); return () => { window.removeEventListener("ff:refresh", f); window.removeEventListener("flexfit:synced", f); }; }, [load]);
  if (!n || !n.nextAction) return null;
  const nx = nextText(t, n.nextAction, n.band);
  const title = n.nextAction.kind === "decision" ? weeklyHeadline(t, { action: n.apply && n.apply.action, headline: n.nextAction.title, apply: n.apply && n.apply.apply, metrics: {} }) : nx.title;
  const apply = async () => {
    setBusy(true);
    try { const j = await call("/api/coach/weekly/apply", "POST", { today: getLocalDate(), decisionId: n.apply.decisionId }); notify(j.queued ? t("coach.apply.queuedTap") : t("coach.apply.done"), "success"); window.dispatchEvent(new Event("ff:refresh")); load(); } catch (e) { notify(e.message || "Could not apply it.", "error"); } finally { setBusy(false); }
  };
  return (
    <section className="dg" aria-label={title}>
      <button type="button" className="dg-head" onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "coach" } }))}>
        <span className="dg-ic" aria-hidden="true">🧭</span>
        <span><b className="dg-title">{title}</b><span className="dg-sub">{nx.detail}</span></span>
      </button>
      {n.apply && <div className="dg-seg"><button type="button" className="on" disabled={busy} onClick={apply}>{applyLabel(t, n.apply.apply)}</button></div>}
    </section>
  );
}
