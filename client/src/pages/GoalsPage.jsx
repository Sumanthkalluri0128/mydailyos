// Journey: instead of bars and targets, you COLLECT. Showing up earns sticker packs; each pack reveals a new sticker of
// the characters and fills your album. A weekly "chapter" path shows the days you showed up, quests are small moves
// that earn XP towards the next pack, and your own goals live in a fold-out at the bottom.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./goals.css";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { notify } from "../utils/notify";
import { fireConfetti } from "../motion/motion";
import { refreshCtx } from "../motion/ctxStore";
import { CHARS, ALL, accent, stickerUrl, stickerFor, stickerList } from "../motion/chars";
import { say } from "../motion/talk";

const METRICS = [
  { id: "workouts", label: "Workout days", unit: "days", def: 12 },
  { id: "logDays", label: "Days I log my food/day", unit: "days", def: 21 },
  { id: "waterDays", label: "Days I hit my water goal", unit: "days", def: 14 },
  { id: "calorieDays", label: "Days on my calorie target", unit: "days", def: 20 },
  { id: "stepsTotal", label: "Total steps", unit: "steps", def: 150000 },
  { id: "weight", label: "Reach a body weight", unit: "kg", def: "" },
  { id: "custom", label: "Something else (I'll update it)", unit: "", def: 10 },
];
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; };
const STATUS = { done: ["Done 🎉", "ok"], ahead: ["Ahead of pace", "ok"], active: ["On the way", "mid"], behind: ["Behind pace", "warn"], missed: ["Deadline passed", "bad"] };

function Bar({ pct, tone = "mid" }) {
  return <div className="gp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i className={`gp-fill gp-${tone}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>;
}


const stickerListOf = (w) => Object.values(stickerList()[w] || {}).flat().map((x) => x[0]);
const RARITY = { common: ["Common", "#8f94b8"], rare: ["Rare", "#3d8bff"], epic: ["Epic", "#ffb020"] };
const rarityOf = (cat) => (cat === "power" ? "epic" : ["party", "love", "lift", "cool", "game", "sleep", "sport"].includes(cat) ? "rare" : "common");
const idParts = (id) => { const [who, name] = id.split("/"); return { who, name, cat: name.replace(/-\d+$/, "") }; };

export default function GoalsPage({ onBack }) {
  const [data, setData] = useState(null);
  const [album, setAlbum] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("short");
  const [form, setForm] = useState(null);
  const [packFor, setPackFor] = useState("any");
  const [pack, setPack] = useState(null);      // { stage: 'shake'|'reveal', sticker }
  const [openWho, setOpenWho] = useState(null);
  const today = getLocalDate();

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([apiFetch(`/api/goals/journey?today=${today}`), apiFetch(`/api/album?today=${today}`)]);
      const [d, al] = await Promise.all([r.json(), a.json()]);
      if (!d.success) throw new Error(d.message || "Could not load your journey");
      setData(d); setAlbum(al.success ? al : null); setErr("");
    } catch (e) { setErr(e.message || "Could not load your journey"); }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const openPack = async () => {
    if (!album || album.packs.available < 1 || pack) return;
    setPack({ stage: "shake" });
    try {
      const [r] = await Promise.all([apiFetch("/api/album/open", { method: "POST", body: JSON.stringify({ who: packFor === "any" ? undefined : packFor, today }) }), new Promise((res) => setTimeout(res, 1500))]);
      const d = await r.json(); if (!d.success) throw new Error(d.message || "Could not open the pack");
      setPack({ stage: "reveal", sticker: d.sticker }); setAlbum(d);
      if (d.sticker.rarity !== "common") fireConfetti({ count: d.sticker.rarity === "epic" ? 140 : 70 });
      notify(`New sticker: ${CHARS[d.sticker.who]} (${RARITY[d.sticker.rarity][0]})!`, "success"); refreshCtx(true);
    } catch (e) { setPack(null); notify(e.message, "error"); load(); }
  };

  const openForm = (kind, preset = {}) => setForm({ kind, title: "", metric: "workouts", target: 12, deadline: addDays(today, kind === "short" ? 30 : 120), ...preset });
  const save = async (e) => {
    e.preventDefault();
    const m = METRICS.find((x) => x.id === form.metric);
    try {
      const r = await apiFetch("/api/goals", { method: "POST", body: JSON.stringify({ title: form.title || m.label, kind: form.kind, metric: form.metric, target: Number(form.target), unit: m.unit, deadline: form.deadline, startDate: today, today }) });
      const d = await r.json(); if (!d.success) throw new Error(d.message || "Could not save");
      setForm(null); setTab(form.kind); notify("Goal added — let's go!", "success"); load(); refreshCtx(true);
    } catch (er) { notify(er.message, "error"); }
  };
  const patch = async (g, body, msg) => {
    try {
      const r = await apiFetch(`/api/goals/${g._id || g.id}`, { method: "PATCH", body: JSON.stringify({ ...body, today }) }); const d = await r.json();
      if (!d.success) throw new Error(d.message || "Could not update");
      if (msg) notify(msg, "success"); if (body.done) fireConfetti({ count: 90 }); load(); refreshCtx(true);
    } catch (er) { notify(er.message, "error"); }
  };
  const remove = async (g) => { try { await apiFetch(`/api/goals/${g._id || g.id}`, { method: "DELETE" }); notify("Goal removed", "info"); load(); refreshCtx(true); } catch (er) { notify(er.message, "error"); } };

  const ownedSet = useMemo(() => new Set(album?.owned || []), [album]);
  if (err && !data) return <section className="gp"><button className="gp-back" onClick={onBack}>← Back</button><p className="gp-err">{err}</p></section>;
  if (!data) return <section className="gp"><button className="gp-back" onClick={onBack}>← Back</button><p>Loading your journey…</p></section>;
  const { level: lv, today: dq, streak, weightJourney: wj, goals, chapter } = data;
  const list = goals.filter((g) => g.kind === tab);
  const active = list.filter((g) => !g.done), finished = list.filter((g) => g.done);
  const packs = album?.packs;
  const nextPackXp = packs ? packs.nextAtXp - packs.xp : 0;
  const mate = ALL.includes(packFor) ? packFor : undefined;

  return (
    <section className="gp">
      <button className="gp-back" onClick={onBack}>← Back</button>

      <div className="gp-hero2">
        <Buddy scene={packs?.available ? "cheer" : "wave"} size={104} who={mate} says={packs?.available ? `${packs.available} pack${packs.available === 1 ? "" : "s"} ready!` : say(mate || "naruto", "hype")} />
        <div className="gp-album-sum">
          <b>{album ? `${album.owned.length}/${album.total}` : "—"}</b><span>stickers collected</span>
          <div className="gp-bar"><i className="gp-fill gp-xp" style={{ width: `${album ? Math.max(2, (album.owned.length / album.total) * 100) : 0}%` }} /></div>
        </div>
      </div>

      <div className="gp-packbox">
        <div>
          <h3>🎁 Sticker packs</h3>
          <p className="gp-muted">{packs ? (packs.available > 0 ? `You have ${packs.available} pack${packs.available === 1 ? "" : "s"} waiting.` : `Next pack in ${nextPackXp} XP — log a meal, water or a workout.`) : ""} Every 50 XP and every week you log 5+ days gives one.</p>
        </div>
        <div className="gp-pick">
          <button type="button" className={packFor === "any" ? "on" : ""} onClick={() => setPackFor("any")}>Any</button>
          {ALL.map((w) => <button key={w} type="button" className={packFor === w ? "on" : ""} title={CHARS[w]} onClick={() => setPackFor(w)}><img src={stickerFor(w, "cheer", 0).src} alt={CHARS[w]} width="34" height="34" /></button>)}
        </div>
        <button className="gp-open" disabled={!packs || packs.available < 1 || !!pack} onClick={openPack}>{packs?.available ? `Open a ${packFor === "any" ? "" : CHARS[packFor] + " "}pack` : "No packs yet"}</button>
      </div>

      <h3>This week's chapter <small>{chapter.logged}/7 days · {chapter.chestReady ? "chest earned 🎉" : `${Math.max(0, chapter.chestAt - chapter.logged)} more for a bonus pack`}</small></h3>
      <div className="gp-path">
        {chapter.stones.map((s, i) => (
          <div key={s.date} className={`gp-stone ${s.logged ? "on" : ""} ${s.today ? "now" : ""} ${s.future ? "fut" : ""} ${s.perfect ? "perfect" : ""}`}>
            {s.today && <img className="gp-walker" src={stickerFor(mate || "naruto", "walk", i).src} alt="" width="46" height="46" />}
            <i>{s.logged ? (s.perfect ? "⭐" : "✓") : s.future ? "" : "·"}</i><span>{s.label}</span>
          </div>
        ))}
        <div className={`gp-chest ${chapter.chestReady ? "open" : ""}`}>{chapter.chestReady ? "🎁" : "📦"}</div>
      </div>

      <h3>Today's moves <small>{dq.done}/{dq.total} · +{dq.xpEarned} XP · lvl {lv.level}</small></h3>
      <div className="gp-moves">
        {dq.quests.length === 0 && <p className="gp-muted">Finish your profile to unlock today's moves.</p>}
        {dq.quests.map((q) => (
          <div key={q.id} className={`gp-move ${q.done ? "done" : ""}`}>
            <span className="gp-ico">{q.done ? "✅" : q.icon}</span>
            <div><b>{q.title}</b><small>{q.done ? `Done! +${q.xp} XP` : `${q.hint} · +${q.xp} XP`}</small></div>
            <em style={{ "--p": `${q.pct}%` }}>{q.pct}%</em>
          </div>
        ))}
      </div>

      <h3>Your album</h3>
      <div className="gp-albums">
        {ALL.map((w) => {
          const s = album?.byWho?.[w]; const all = (stickerListOf(w)); const isOpen = openWho === w;
          return (
            <div key={w} className={`gp-char ${isOpen ? "open" : ""}`} style={{ "--ac": accent[w] }}>
              <button type="button" className="gp-char-h" onClick={() => setOpenWho(isOpen ? null : w)}>
                <img src={stickerFor(w, "cheer", 0).src} alt="" width="44" height="44" /><b>{CHARS[w]}</b><span>{s ? `${s.owned}/${s.total}` : ""}</span>
                <div className="gp-bar"><i className="gp-fill gp-mid" style={{ width: `${s ? (s.owned / Math.max(1, s.total)) * 100 : 0}%`, background: accent[w] }} /></div>
              </button>
              {isOpen && <div className="gp-grid">{all.map((n) => { const id = `${w}/${n}`; const has = ownedSet.has(id); const r = rarityOf(n.replace(/-\d+$/, "")); return <img key={id} className={`${has ? "has" : "lock"} r-${r}`} src={stickerUrl(w, n)} alt={has ? n : "locked"} title={has ? `${CHARS[w]} · ${RARITY[r][0]}` : "Locked"} width="64" height="64" loading="lazy" />; })}</div>}
            </div>
          );
        })}
      </div>

      {wj && (
        <>
          <h3>Your weight journey <small>{wj.startKg} → {wj.targetKg} kg</small></h3>
          <div className="gp-card">
            <div className="gp-row"><b>{wj.reached ? "Goal reached! 🏆" : `${wj.remainingKg} kg to go`}</b><span>{wj.pct}%</span></div>
            <Bar pct={wj.pct} tone={wj.reached ? "ok" : "xp"} />
            <div className="gp-steps">{wj.checkpoints.map((c) => <span key={c.label} className={c.reached ? "on" : ""}>{c.reached ? "✓" : "○"} {c.label}<em>{c.kg} kg</em></span>)}</div>
          </div>
        </>
      )}

      <details className="gp-fold">
        <summary>🎯 My goals (optional)</summary>
        <div className="gp-tabs">
          <button className={tab === "short" ? "on" : ""} onClick={() => setTab("short")}>Short-term</button>
          <button className={tab === "long" ? "on" : ""} onClick={() => setTab("long")}>Long-term</button>
        </div>
        <div className="gp-list">
          {active.map((g) => <GoalCard key={g._id || g.id} g={g} onDone={() => patch(g, { done: true }, "Goal completed! 🎉")} onDelete={() => remove(g)} onManual={(v) => patch(g, { manualValue: v })} />)}
          {active.length === 0 && <p className="gp-muted">No active {tab === "short" ? "short" : "long"}-term goals.</p>}
          {finished.map((g) => <GoalCard key={g._id || g.id} g={g} onDelete={() => remove(g)} onUndo={() => patch(g, { done: false })} />)}
        </div>
        <button className="gp-add" onClick={() => openForm(tab)}>＋ New {tab === "short" ? "short-term" : "long-term"} goal</button>
      </details>

      {pack && createPortal(
        <div className="gp-modal" onClick={() => pack.stage === "reveal" && setPack(null)}>
          <div className={`gp-packview ${pack.stage}`} onClick={(e) => e.stopPropagation()}>
            {pack.stage === "shake" && <><div className="gp-pack">🎁</div><p>Opening…</p></>}
            {pack.stage === "reveal" && (() => { const st = pack.sticker; const [rl, rc] = RARITY[st.rarity]; return (
              <>
                <div className="gp-rare" style={{ color: rc }}>{rl}</div>
                <img className={`gp-reveal r-${st.rarity}`} src={stickerUrl(st.who, st.name)} alt={CHARS[st.who]} width="200" height="200" />
                <h3>{CHARS[st.who]}</h3>
                <p className="gp-muted">{album.owned.length}/{album.total} collected{album.packs.available ? ` · ${album.packs.available} more pack${album.packs.available === 1 ? "" : "s"} ready` : ""}</p>
                <div className="gp-actions"><button type="button" onClick={() => setPack(null)}>Nice!</button>{album.packs.available > 0 && <button className="primary" type="button" onClick={() => { setPack(null); setTimeout(openPack, 50); }}>Open another</button>}</div>
              </>); })()}
          </div>
        </div>, document.body)}

      {form && createPortal(
        <div className="gp-modal" onClick={() => setForm(null)}>
          <form className="gp-form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>New {form.kind === "short" ? "short" : "long"}-term goal</h3>
            <label>Name<input value={form.title} maxLength={120} placeholder="e.g. Get stronger" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>What counts?
              <select value={form.metric} onChange={(e) => { const m = METRICS.find((x) => x.id === e.target.value); setForm({ ...form, metric: m.id, target: m.def }); }}>
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label>Target{form.metric === "weight" ? " (kg)" : ""}<input type="number" step="any" min="0.1" required value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label>
            <label>Deadline<input type="date" min={today} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
            <div className="gp-actions"><button type="button" onClick={() => setForm(null)}>Cancel</button><button className="primary" type="submit">Save goal</button></div>
          </form>
        </div>, document.body)}
    </section>
  );
}

function GoalCard({ g, onDone, onDelete, onManual, onUndo }) {
  const p = g.progress; const [label, tone] = STATUS[p.status] || STATUS.active;
  const unit = g.unit || "";
  return (
    <div className={`gp-card ${g.done ? "is-done" : ""}`}>
      <div className="gp-row"><b>{g.title}</b><span className={`gp-badge gp-${tone}`}>{label}</span></div>
      <Bar pct={p.pct} tone={tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "mid"} />
      <small>{g.metric === "weight" ? `${p.value} kg now · goal ${p.target} kg` : `${p.value.toLocaleString()} / ${p.target.toLocaleString()} ${unit}`} · {p.pct}%{p.daysLeft !== null && !g.done ? (p.daysLeft >= 0 ? ` · ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left` : " · deadline passed") : ""}</small>
      <div className="gp-actions">
        {g.metric === "custom" && !g.done && onManual && <><button type="button" onClick={() => onManual(Math.max(0, p.value - 1))}>−1</button><button type="button" onClick={() => onManual(p.value + 1)}>＋1</button></>}
        {!g.done && onDone && <button type="button" onClick={onDone}>Mark done</button>}
        {g.done && onUndo && <button type="button" onClick={onUndo}>Reopen</button>}
        <button type="button" className="gp-del" onClick={onDelete} aria-label={`Delete ${g.title}`}>Delete</button>
      </div>
    </div>
  );
}
