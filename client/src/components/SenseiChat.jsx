// THE PLANNING SENSEI: a short chat that asks the right 3-4 questions (like a dietitian), saves each answer at once and ends with an editable
// "Your plan setup" card. Quick-reply chips, a typing animation, progress dots, Skip, "Use my usual" and Back on every question.
// The questions and the lines the character says come from the server (/api/food-prefs/flow), so web and phone behave the same.
// Allergy answers are health data: they are stored privately, exported with the account and never overridden by the planner.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";
import { getLocalDate } from "../utils/date";
import Buddy from "../motion/Buddy";
import { CHARS, ALL, dayChar } from "../motion/chars";
import QuestionInput from "./QuestionInput";
import SenseiSticker from "./SenseiSticker";
import { TONES, answerText, askLine, chosenLabels, dotsFor, draftValid, draftValue, emptyDraft, introLine, knownLine, reactLine } from "../utils/sensei";
import "./sensei.css";

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));
const TONE_LABEL = { cheer: "Cheerful", calm: "Calm", strict: "Straight to the point" };

export default function SenseiChat({ onDone, onClose, focus = null }) {
  const today = getLocalDate();
  const [flow, setFlow] = useState(null);
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [draft, setDraft] = useState(null);
  const [thread, setThread] = useState([]);       // { from: "bot" | "me", text, typing? }
  const [stage, setStage] = useState("ask");      // ask | summary
  const [state, setState] = useState(null);       // chips, safety, coach, sticker (from the last response)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null);         // a question being edited from the summary card
  const [unlocked, setUnlocked] = useState(false);
  const endRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const dayWho = useMemo(() => dayChar(), []);
  const who = state?.coach?.who && CHARS[state.coach.who] ? state.coach.who : dayWho;
  const tone = TONES.includes(state?.coach?.tone) ? state.coach.tone : "cheer";
  const lines = flow?.lines;
  const q = qs[qi];

  const say = useCallback(async (text) => {
    setThread((t) => [...t, { from: "bot", typing: true, text: "" }]);
    await wait(520 + Math.min(500, text.length * 6));
    if (!alive.current) return;
    setThread((t) => { const c = [...t]; const i = c.map((m) => m.typing).lastIndexOf(true); if (i >= 0) c[i] = { from: "bot", text }; return c; });
  }, []);
  const me = (text) => setThread((t) => [...t, { from: "me", text }]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }); }, [thread, stage, qi]);

  const open = useCallback(async (list, index, f, st) => {
    const question = list[index];
    setDraft(emptyDraft(question));
    await say(askLine({ lines: f.lines, who: st?.coach?.who && CHARS[st.coach.who] ? st.coach.who : dayChar(), tone: st?.coach?.tone || "cheer", question, index }));
    if (question.hint) await say(question.hint);
  }, [say]);

  // load the flow once
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/food-prefs/flow?today=${today}${focus ? `&only=${focus}` : ""}`);
        const d = await r.json();
        if (!r.ok || !d.success) { setErr(d.message || "I could not start. Try again in a moment."); return; }
        setFlow(d); setState(d); setQs(d.questions);
        const w = d.coach?.who && CHARS[d.coach.who] ? d.coach.who : dayChar(); const tn = d.coach?.tone || "cheer";
        if (!focus) {
          await say(introLine({ lines: d.lines, who: w, tone: tn, mode: d.mode }));
          const k = knownLine(d.known); if (k) await say(k);
        }
        if (!d.questions.length) { setStage("summary"); return; }
        await open(d.questions, 0, d, d);
      } catch { setErr("The sensei needs a connection. Try again in a moment."); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(async (resp) => {
    setStage("summary");
    try {
      const r = await apiFetch("/api/food-prefs/complete", { method: "POST", body: JSON.stringify({}) });
      const d = await r.json();
      if (d.success) { setState((s) => ({ ...s, ...d })); if (d.unlockedSticker) setUnlocked(true); }
    } catch { /* the summary still shows; the sticker is retried next time */ }
    await say(reactLine({ lines, who, tone, done: true }));
  }, [lines, say, who, tone]);

  const advance = useCallback(async (resp, from) => {
    if (resp?.followUp) {                                       // e.g. "When does Ramadan start?"
      const list = [...qs.slice(0, qi + 1), resp.followUp, ...qs.slice(qi + 1)];
      setQs(list); setQi(qi + 1); await open(list, qi + 1, flow, resp); return;
    }
    if (qi + 1 < qs.length) { setQi(qi + 1); await open(qs, qi + 1, flow, resp); return; }
    if (focus || edit) { setStage("summary"); return; }
    await finish(resp);
  }, [qs, qi, flow, open, finish, focus, edit]);

  const post = async (body) => {
    setBusy(true); setErr("");
    try {
      const r = await apiFetch("/api/food-prefs/answer", { method: "POST", body: JSON.stringify({ today, ...body }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.message || "I could not save that."); return null; }
      setState((s) => ({ ...s, ...d })); return d;
    } catch { setErr("I could not save that. Check your connection."); return null; } finally { setBusy(false); }
  };

  const send = async (value) => {
    if (!q || busy || !draftValid(q, value)) return;
    const v = draftValue(q, value);
    me(answerText(q, v) || "Done");
    const d = await post({ id: q.id, value: v });
    if (!d) return;
    await say(reactLine({ lines, who, tone, qid: q.id, value: v, labels: chosenLabels(q, v) }));
    await advance(d);
  };
  const skip = async () => { if (!q || busy) return; me("Skip"); const d = await post({ id: q.id, skipped: true }); if (!d) return; await say(reactLine({ lines, who, tone, qid: q.id, skipped: true })); await advance(d); };
  const usual = async () => { if (!q || busy) return; me("Use my usual"); const d = await post({ id: q.id, usual: true }); if (!d) return; await say(reactLine({ lines, who, tone, qid: q.id, usual: true })); await advance(d); };
  const back = async () => { if (qi === 0 || busy) return; setQi(qi - 1); setDraft(emptyDraft(qs[qi - 1])); me("Back"); await say(`Sure. ${qs[qi - 1].ask}`); };

  const editChip = async (id) => {
    setEdit(id); setErr("");
    try {
      const r = await apiFetch(`/api/food-prefs/flow?today=${today}&only=${id}`); const d = await r.json();
      if (d.success && d.questions[0]) { setQs(d.questions); setQi(0); setDraft(emptyDraft(d.questions[0])); }
    } catch { setErr("I could not open that. Try again."); setEdit(null); }
  };
  const saveEdit = async (value) => {
    const qq = qs[0]; if (!qq || !draftValid(qq, value)) return;
    const d = await post({ id: qq.id, value: draftValue(qq, value) });
    if (!d) return;
    if (d.followUp) { setQs([d.followUp]); setQi(0); setDraft(emptyDraft(d.followUp)); return; }
    setEdit(null);
  };
  const setCoach = async (next) => {
    const merged = { who: state?.coach?.who || who, tone, ...next };
    setState((s) => ({ ...s, coach: merged }));
    try { await apiFetch("/api/food-prefs/coach", { method: "PUT", body: JSON.stringify(merged) }); } catch { notify("Could not save the coach.", "error"); }
  };
  const forget = async () => { try { await apiFetch("/api/food-prefs", { method: "DELETE" }); notify("Your food preferences were cleared.", "success"); onClose?.(); } catch { notify("Could not clear them.", "error"); } };

  if (err && !flow) return <section className="large-card sn" role="alert"><p className="ap-err">{err}</p><button className="secondary-button" onClick={onClose}>Close</button></section>;

  const dots = dotsFor(qi, qs.length);
  const eq = edit ? qs[0] : null;

  return (
    <section className="large-card sn" aria-label="Planning sensei">
      <div className="sn-head">
        <Buddy scene={stage === "summary" ? "victory" : "chef"} size={64} who={who} talk={false} label="Sensei" />
        <div><h2>🍱 Planning sensei</h2><p>{stage === "summary" ? "Your plan setup" : flow?.mode === "update" ? "Quick check-in" : "A few quick questions"}</p></div>
        {stage === "ask" && qs.length > 0 && <div className="sn-dots" aria-label={`Question ${qi + 1} of ${qs.length}`}>{dots.map((d, i) => <i key={i} className={d} />)}</div>}
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </div>

      <div className="sn-thread" role="log" aria-live="polite">
        {thread.map((m, i) => (
          <div key={i} className={`sn-msg ${m.from}`}>
            {m.typing ? <span className="sn-typing" aria-label="typing"><i /><i /><i /></span> : m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {stage === "ask" && q && !thread.some((m) => m.typing) && (
        <div className="sn-input">
          <QuestionInput key={q.id} q={q} draft={draft} setDraft={setDraft} onSend={send} busy={busy} />
          <div className="sn-actions">
            <button type="button" className="link-button" onClick={back} disabled={qi === 0 || busy}>← Back</button>
            <button type="button" className="link-button" onClick={skip} disabled={busy}>Skip</button>
            <button type="button" className="secondary-button" onClick={usual} disabled={busy}>Use my usual</button>
          </div>
        </div>
      )}
      {err && flow && <p className="ap-err" role="alert">{err}</p>}

      {stage === "summary" && state && (
        <div className="sn-card">
          {unlocked && <div className="sn-unlock" role="status"><SenseiSticker size={84} /><p><b>Sticker unlocked!</b> You finished your setup, so you earned the Meal Sensei sticker.</p></div>}
          <h3>Your plan setup</h3>
          <p className="ap-sub">Tap anything to change it. {state.chips.filter((c) => !c.set).length > 0 && "Anything “Not set” uses a sensible default until you tell me."}</p>
          {state.safety?.flagged && <div className="ib is-hot" role="note"><span className="ib-ic" aria-hidden="true">🩺</span><div><b>Please check with a doctor or dietitian</b><p>{state.safety.note}</p></div></div>}
          <div className="sn-chips">
            {state.chips.map((c) => <button key={c.id} type="button" className={`sn-chip sum ${c.set ? "on" : ""} ${edit === c.id ? "editing" : ""}`} onClick={() => editChip(c.id)} aria-label={`${c.label}: ${c.value}. Edit`}><b>{c.emoji} {c.label}</b><span>{c.value}</span></button>)}
          </div>
          {eq && (
            <div className="sn-edit">
              <p><b>{eq.ask}</b></p>
              <QuestionInput key={eq.id} q={eq} draft={draft} setDraft={setDraft} onSend={saveEdit} busy={busy} />
              <button type="button" className="link-button" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          )}
          <details className="sn-coach"><summary>Coach and tone</summary>
            <label>Coach <select value={state.coach?.who || ""} onChange={(e) => setCoach({ who: e.target.value })}><option value="">Today&apos;s character</option>{ALL.map((id) => <option key={id} value={id}>{CHARS[id]}</option>)}</select></label>
            <label>Tone <select value={state.coach?.tone || "cheer"} onChange={(e) => setCoach({ tone: e.target.value })}>{TONES.map((t) => <option key={t} value={t}>{TONE_LABEL[t]}</option>)}</select></label>
          </details>
          <p className="ap-sub">🔒 Allergies and health answers stay private. They are part of your data export and are deleted with your account.</p>
          <div className="ap-actions">
            <button type="button" className="primary-button" onClick={() => onDone?.(state)} disabled={!!edit}>Preview my plan</button>
            <button type="button" className="link-button" onClick={forget}>Forget my answers</button>
          </div>
        </div>
      )}
    </section>
  );
}
