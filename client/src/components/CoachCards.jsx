import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import { saveToneSettings, useCoachTone, isGentle } from "../utils/coachTone";
import "./coachcards.css";

const call = async (path, opts) => {
  const r = await apiFetch(`${API_URL}/api/coach${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || "Something went wrong");
  return j;
};
const post = (path, body) => call(path, { method: "POST", body: JSON.stringify({ today: getLocalDate(), ...body }) });
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** One shared fetch of /state for the Home cards. */
export function useCoachState() {
  const [s, setS] = useState(null);
  const load = useCallback(() => { call(`/state?today=${getLocalDate()}`).then(setS).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  return [s, setS, load];
}

// 1. Rough day ("rest arc"): three tiny things, streak kept, fewer reminders. One tap on from Home.
export function RoughDay({ state, reload }) {
  const rough = state?.rough;
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const toggle = async (on) => { setBusy(true); try { await post("/rough", { on }); await reload(); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); } };
  if (!rough?.on) {
    return <div className="cc-strip"><span>Rough day?</span><button type="button" className="chip" disabled={busy} onClick={() => toggle(true)}>Switch to a gentler day</button></div>;
  }
  return (
    <section className="large-card cc-rough" aria-label="Rough day mode">
      <div className="cc-row"><Buddy scene={rough.scene === "cheer" ? "cheer" : "health"} size={72} talk={false} />
        <div><p className="eyebrow">Rest arc</p><h3>Just three small things today</h3><p>{rough.message}</p></div></div>
      <ul className="cc-list">{rough.actions.map((a) => <li key={a.id} className={a.done ? "done" : ""}><span aria-hidden="true">{a.done ? "✓" : "○"}</span> {a.title}{a.hint && !a.done ? <small> · {a.hint}</small> : null}</li>)}</ul>
      <small>Your streak is safe, and you will get fewer reminders today. This switches off by itself tomorrow.</small>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => toggle(false)}>Back to a normal day</button>
    </section>
  );
}

// 2. Side quest: one small 7-day experiment, tracked automatically where data exists.
export function SideQuest({ state, setState, reload }) {
  const ex = state?.experiment;
  useEffect(() => {
    const last = ex?.last;
    if (last?.rewarded && !last.announced) { notify("🏅 Side-quest sticker unlocked!", "success", 4500); post("/experiment/ack", {}).catch(() => {}); }
  }, [ex?.last?.startDate]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ex || (!ex.current && !ex.last)) return null;
  const cur = ex.current, last = ex.last;
  const tick = async (date) => { try { const j = await post("/experiment/tick", { date }); setState((s) => ({ ...s, experiment: { ...s.experiment, current: j.experiment.current } })); } catch (e) { notify(e.message, "error"); } };
  const skip = async () => { try { await post("/experiment/skip", {}); await reload(); } catch (e) { notify(e.message, "error"); } };
  return (
    <section className="large-card cc-quest" aria-label="Side quest">
      {last && <div className="cc-last"><Buddy scene={last.rewarded ? "victory" : "wave"} size={56} talk={false} /><p><b>Last quest:</b> {last.message}</p></div>}
      {cur && (<>
        <p className="eyebrow">Side quest · {cur.daysLeft} day{cur.daysLeft === 1 ? "" : "s"} left</p>
        <h3>{cur.title}</h3>
        <p>{cur.quest} <small>{cur.why}</small></p>
        <div className="cc-days" role="group" aria-label="Quest days">
          {cur.days.map((d) => (
            <button key={d.date} type="button" disabled={d.future} className={`cc-day${d.done ? " on" : ""}`} aria-pressed={d.done}
              title={d.auto ? "Counted automatically from your logs" : d.manual ? "You ticked this day" : "Tap to tick this day"}
              onClick={() => !d.auto && tick(d.date)}>{shortDate(d.date)}{d.done ? " ✓" : ""}</button>
          ))}
        </div>
        <small>{cur.doneDays} of 7 days so far. Five days earns a sticker. Days with no data can be ticked by hand.</small>
        <button type="button" className="link-button" onClick={skip}>Try a different quest</button>
      </>)}
    </section>
  );
}

// 7. Treat allowance (weekly screen): guilt-free; using it never shows a failure message.
export function TreatCard({ treat, reload }) {
  const [kcal, setKcal] = useState("");
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [open, setOpen] = useState(false);
  if (!treat) return null;
  const set = async () => { try { await call("/treat", { method: "PUT", body: JSON.stringify({ today: getLocalDate(), weeklyKcal: Number(kcal) || 0 }) }); setKcal(""); reload(); } catch (e) { notify(e.message, "error"); } };
  const use = async () => {
    try { await post("/treat/use", { name: name.trim(), kcal: Number(amt), clientId: `treat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }); setName(""); setAmt(""); setOpen(false); notify("Enjoy it! Logged as a treat.", "success"); reload(); }
    catch (e) { notify(e.message, "error"); }
  };
  return (
    <div className="card wc-budget cc-treat">
      <h3>🍨 Weekly treat allowance</h3>
      {!treat.on ? (<>
        <p>Set aside some calories for sweets or eating out, planned and guilt-free. They come out of your weekly budget, so nothing is "extra".</p>
        <div className="repeat-row"><input type="number" min="0" max="5000" placeholder="kcal a week, e.g. 500" value={kcal} onChange={(e) => setKcal(e.target.value)} aria-label="Weekly treat kcal" /><button className="secondary-button" disabled={!(Number(kcal) > 0)} onClick={set}>Set aside</button></div>
      </>) : (<>
        <strong>{treat.left.toLocaleString()} kcal left of {treat.allowance.toLocaleString()}</strong>
        <div className="cc-bar" role="img" aria-label={`${treat.used} of ${treat.allowance} used`}><i style={{ width: `${Math.min(100, (treat.used / treat.allowance) * 100)}%` }} /></div>
        <p>{treat.message}</p>
        {open ? (
          <div className="repeat-row"><input placeholder="What was it?" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-label="Treat name" /><input type="number" min="1" placeholder="kcal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Treat kcal" /><button className="primary-button" disabled={!name.trim() || !(Number(amt) > 0)} onClick={use}>Log treat</button><button className="secondary-button" onClick={() => setOpen(false)}>Cancel</button></div>
        ) : <div className="repeat-row"><button className="secondary-button" onClick={() => setOpen(true)}>I had a treat</button><button className="link-button" onClick={() => call("/treat", { method: "PUT", body: JSON.stringify({ today: getLocalDate(), weeklyKcal: 0 }) }).then(reload)}>Turn off</button></div>}
      </>)}
    </div>
  );
}

// 3 + 4 + 5. Weight page insights: jump explainer, goal-date range, sleep link.
function Trend({ series }) {
  if (!series || series.length < 2) return null;
  const W = 320, H = 90, P = 6;
  const vals = series.flatMap((s) => [s.weightKg, s.trendKg]);
  const lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
  const x = (i) => P + (i / (series.length - 1)) * (W - 2 * P), y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cc-svg" role="img" aria-label="Recent weigh-ins and trend line">
      {series.map((s, i) => <circle key={s.date} cx={x(i)} cy={y(s.weightKg)} r="3" className="cc-dot" />)}
      <path d={series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.trendKg).toFixed(1)}`).join(" ")} className="cc-trend" fill="none" />
    </svg>
  );
}
function Cone({ r }) {
  const c = r.cone; const W = 320, H = 110, P = 8;
  const all = c.flatMap((p) => [p.fast, p.slow, p.mid]).concat(r.goalKg);
  const lo = Math.min(...all) - 0.4, hi = Math.max(...all) + 0.4;
  const x = (i) => P + (i / (c.length - 1)) * (W - 2 * P), y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const band = c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.fast).toFixed(1)}`).join(" ") + c.slice().reverse().map((p, k) => `L${x(c.length - 1 - k).toFixed(1)},${y(p.slow).toFixed(1)}`).join(" ") + "Z";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cc-svg" role="img" aria-label="Range of likely arrival dates">
      <path d={band} className="cc-cone" />
      <path d={c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.mid).toFixed(1)}`).join(" ")} className="cc-trend" fill="none" />
      <line x1={P} x2={W - P} y1={y(r.goalKg)} y2={y(r.goalKg)} className="cc-goal" />
      <text x={W - P} y={y(r.goalKg) - 3} textAnchor="end" className="cc-goal-label">Goal {r.goalKg} kg</text>
    </svg>
  );
}
export function WeightInsights({ refreshKey }) {
  const [jump, setJump] = useState(null), [range, setRange] = useState(null), [sleep, setSleep] = useState(null);
  useEffect(() => {
    const t = getLocalDate();
    call(`/weight-jump?today=${t}`).then(setJump).catch(() => {});
    call(`/goal-range?today=${t}`).then(setRange).catch(() => {});
    call(`/sleep-eating?today=${t}`).then(setSleep).catch(() => {});
  }, [refreshKey]);
  return (
    <section className="cc-insights" aria-label="Weight insights">
      {jump && (jump.status === "jump" ? (
        <div className="large-card"><div className="cc-row"><Buddy scene="wave" size={64} talk={false} /><div><p className="eyebrow">Why did the scale jump?</p><h3>{jump.headline}</h3></div></div>
          <Trend series={jump.series} />
          <ul className="cc-bullets">{jump.reasons.map((x) => <li key={x.id}>{x.text}</li>)}{jump.fallback && <li>{jump.fallback}</li>}</ul>
          <p>{jump.reassure}</p></div>
      ) : jump.status === "steady" ? <div className="large-card"><p className="eyebrow">Scale check</p><p>{jump.message}</p><Trend series={jump.series} /></div>
        : jump.status === "insufficient" ? <div className="large-card"><p className="eyebrow">Scale check</p><p>{jump.message}</p></div> : null)}
      {range && (
        <div className="large-card"><p className="eyebrow">Likely arrival</p>
          {range.status === "ok" ? (<>
            <h3>{shortDate(range.earliest)} – {range.latestOpen ? "later" : shortDate(range.latest)}</h3>
            <p>Most likely around {shortDate(range.likely)}, at about {Math.abs(range.slopeKgPerWeek)} kg a week. {range.message}</p>
            <Cone r={range} /></>) : <p>{range.message}</p>}
        </div>
      )}
      {sleep && (
        <div className="large-card"><p className="eyebrow">Sleep and eating</p><p>{sleep.message}</p>{sleep.enough && <small>{sleep.note}</small>}</div>
      )}
    </section>
  );
}

// 6. Profile: what the coach learned, and a reset.
export function CoachLearning() {
  const [n, setN] = useState(null);
  useEffect(() => { call("/learn").then((j) => setN(j.count)).catch(() => {}); }, []);
  if (n === null) return null;
  const reset = async () => { try { await call("/learn", { method: "DELETE" }); setN(0); notify("The coach forgot what it learned.", "success"); } catch (e) { notify(e.message, "error"); } };
  return (
    <div className="large-card"><h3>What the coach has learned</h3>
      <p>The coach notices which suggestions you try and shows similar ones first. It is stored only for you, and you can wipe it.</p>
      <small>{n} suggestion type{n === 1 ? "" : "s"} remembered.</small>
      <button type="button" className="secondary-button" disabled={!n} onClick={reset}>Reset what it learned</button></div>
  );
}

/** Tell the coach a suggestion was shown / acted on (fire and forget). */
export const coachLearn = (key, action) => post("/learn", { key, action }).catch(() => {});

// 8 + 9. Tone and gentle mode settings.
export function ToneSettings() {
  const t = useCoachTone();
  const [busy, setBusy] = useState(false);
  const save = async (patch) => { setBusy(true); try { await saveToneSettings(patch); } catch (e) { notify(e.message, "error"); } finally { setBusy(false); } };
  const LABEL = { gentle: "Gentle", strict: "Strict", funny: "Funny" };
  return (
    <section className="large-card cc-tone" aria-label="Coach tone">
      <h3>How should your coach talk?</h3>
      <div className="cc-days" role="radiogroup" aria-label="Coach tone">
        {(t.tones || ["gentle", "strict", "funny"]).map((x) => <button key={x} type="button" role="radio" aria-checked={t.tone === x} className={`cc-day${t.tone === x ? " on" : ""}`} disabled={busy} onClick={() => save({ tone: x })}>{LABEL[x]}</button>)}
      </div>
      <small>Every character, reminder and weekly review follows the tone. Strict is firm and short, never harsh.</small>
      <label className="cc-switch"><input type="checkbox" checked={!!t.gentle} disabled={busy} onChange={(e) => save({ gentle: e.target.checked })} />
        <span><b>Gentle mode</b>: hide calorie numbers and show plate balance and habits instead. Good if numbers make food stressful.</span></label>
      {t.gentle && <p className="cc-support">{t.support?.text} {t.support?.india}</p>}
    </section>
  );
}

// 9. Gentle Home card: plate balance and habits, no numbers.
export function PlateCard({ refreshKey }) {
  const [d, setD] = useState(null);
  useEffect(() => { call(`/plate?today=${getLocalDate()}&date=${getLocalDate()}`).then(setD).catch(() => {}); }, [refreshKey]);
  if (!d) return null;
  const COLORS = { veg: "#4caf7a", fruit: "#f2994a", protein: "#e0607e", grain: "#d9b35a", dairy: "#6fa8dc" };
  return (
    <section className="large-card cc-plate" aria-label="Plate balance">
      <p className="eyebrow">Today's plate</p>
      <div className="cc-plate-bar" role="img" aria-label="Share of vegetables, fruit, protein, grains and dairy on your plate so far">
        {d.slices.filter((s) => s.share > 0).map((s) => <i key={s.id} style={{ flexGrow: s.share, background: COLORS[s.id] }} title={s.label} />)}
        {d.recognised === 0 && <i style={{ flexGrow: 1, background: "var(--surface-2,#ddd)" }} />}
      </div>
      <div className="cc-legend">{d.slices.map((s) => <span key={s.id}><b style={{ background: COLORS[s.id] }} />{s.label}</span>)}</div>
      <p>{d.message}</p>
      <ul className="cc-list">{d.habits.map((h) => <li key={h.id} className={h.done ? "done" : ""}><span aria-hidden="true">{h.done ? "✓" : "○"}</span> {h.title}</li>)}</ul>
    </section>
  );
}

// 10. Craving timer: 10 calm minutes with a breathing circle, then a swap from your own foods.
export function CravingTimer({ onLogged }) {
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(null);
  const [left, setLeft] = useState(600);
  const [swap, setSwap] = useState(null);
  useEffect(() => {
    if (!end) return undefined;
    const id = setInterval(() => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(l); if (l === 0) { clearInterval(id); finish(); } }, 500);
    return () => clearInterval(id);
  }, [end]); // eslint-disable-line react-hooks/exhaustive-deps
  const finish = async () => { setEnd(null); try { setSwap(await post("/craving/swap", {})); } catch { setSwap({ picks: [], message: "The timer is done. A glass of water or a short walk can help, and it is okay to have what you fancy." }); } };
  const start = () => { setSwap(null); setLeft(600); setEnd(Date.now() + 600_000); };
  const stop = () => { setEnd(null); setLeft(600); };
  const log = async (p) => {
    try {
      const r = await apiFetch(`${API_URL}/api/food-logs`, { method: "POST", body: JSON.stringify({ foodId: p.foodId, date: getLocalDate(), mealType: "snacks", quantity: p.servingSize || 1, trigger: "hungry", clientId: `crave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
      if (!r.ok) throw new Error();
      notify(`${p.name} added. Enjoy it.`, "success"); onLogged?.(); setSwap(null); setOpen(false);
    } catch { notify("Could not add that.", "error"); }
  };
  if (!open) return <button type="button" className="chip" onClick={() => setOpen(true)}>🌬️ I'm craving something</button>;
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  return (
    <section className="large-card cc-craving" aria-label="Craving timer">
      <div className="cc-row"><Buddy scene="health" size={64} talk={false} /><div><p className="eyebrow">Breathing technique</p><h3>Let the craving pass over you</h3></div></div>
      {end ? (<>
        <div className="cc-breath" aria-hidden="true"><span>{mm}:{ss}</span></div>
        <p className="cc-breath-text">Breathe in through your nose for 4, out slowly for 6. Sip some water. Most cravings fade within ten minutes.</p>
        <button type="button" className="secondary-button" onClick={stop}>Stop the timer</button>
      </>) : swap ? (<>
        <p>{swap.message}</p>
        {swap.picks.map((p) => <div key={p.foodId} className="cook-item"><span><strong>{p.name}</strong><small>{p.calories} kcal · {p.protein} g protein</small></span><button className="secondary-button" onClick={() => log(p)}>Add</button></div>)}
        <button type="button" className="link-button" onClick={() => setOpen(false)}>Close</button>
      </>) : (<>
        <p>Ten calm minutes first. If you still want something afterwards, I will suggest something you already enjoy.</p>
        <button type="button" className="primary-button" onClick={start}>Start 10 minutes</button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>Not now</button>
      </>)}
    </section>
  );
}

// 12. Festival / wedding / trip mode.
export function EventMode({ event, reload }) {
  const [form, setForm] = useState(null);
  const today = getLocalDate();
  const add = (d, n) => { const t = new Date(`${d}T00:00:00`); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
  const save = async () => { try { await call("/event", { method: "PUT", body: JSON.stringify({ today, ...form }) }); setForm(null); reload(); } catch (e) { notify(e.message, "error"); } };
  const end = async () => { try { await call("/event", { method: "DELETE" }); reload(); } catch (e) { notify(e.message, "error"); } };
  if (event?.on) {
    return (
      <section className="large-card cc-event"><div className="cc-row"><Buddy scene={event.scene === "party" ? "victory" : "walk"} size={72} talk={false} /><div><p className="eyebrow">{event.kind === "diet-break" ? "Diet break" : "Festival arc"}</p><h3>{event.label} mode is on</h3><p>{event.message}</p></div></div>
        <small>{event.daysLeft} day{event.daysLeft === 1 ? "" : "s"} left.</small>{event.kind !== "diet-break" && <button className="link-button" onClick={end}>End it early</button>}</section>
    );
  }
  if (!form) return <div className="cc-strip"><span>Festival, wedding or trip coming up?</span><button type="button" className="chip" onClick={() => setForm({ kind: "festival", from: today, to: add(today, 2), label: "" })}>Plan for it</button></div>;
  return (
    <section className="large-card cc-event"><h3>Plan for a festival, wedding or trip</h3>
      <div className="cc-days" role="radiogroup" aria-label="Kind">{[["festival", "Festival"], ["wedding", "Wedding"], ["trip", "Trip"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={form.kind === k} className={`cc-day${form.kind === k ? " on" : ""}`} onClick={() => setForm({ ...form, kind: k })}>{l}</button>)}</div>
      <div className="repeat-row"><label>From <input type="date" value={form.from} min={today} onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to < e.target.value ? e.target.value : form.to })} /></label><label>To <input type="date" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label><input placeholder="Name (optional), e.g. Diwali" maxLength={40} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} aria-label="Name" /></div>
      <small>Your weekly budget gets extra room, estimates for eating out get a bigger safety margin, and the coach turns supportive. It ends by itself.</small>
      <div className="repeat-row"><button className="primary-button" onClick={save}>Start</button><button className="secondary-button" onClick={() => setForm(null)}>Cancel</button></div>
    </section>
  );
}

// 13. Optional diet break offered on a real plateau.
export function DietBreak({ reload }) {
  const [a, setA] = useState(null); const [done, setDone] = useState(false);
  useEffect(() => { call(`/diet-break/advice?today=${getLocalDate()}`).then((j) => setA(j.advice)).catch(() => {}); }, []);
  if (!a || done) return null;
  const start = async () => { try { await post("/diet-break", { kind: a.kind, days: a.days }); setDone(true); notify("Break started. It ends by itself.", "success"); reload?.(); } catch (e) { notify(e.message, "error"); } };
  return (
    <div className="card wc-budget"><h3>{a.title}</h3><p>{a.reasoning}</p><p><small>{a.note}</small></p>
      <div className="repeat-row"><button className="secondary-button" onClick={start}>Try it ({a.days} day{a.days === 1 ? "" : "s"} at about {a.kcal.toLocaleString()} kcal)</button><button className="link-button" onClick={() => setDone(true)}>No thanks</button></div></div>
  );
}
export { isGentle };
