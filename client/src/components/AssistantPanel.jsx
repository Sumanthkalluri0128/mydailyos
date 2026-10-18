// "Ask FlexFit": a chat with the character that knows your day, your week, your goals and every feature.
// Answers come from /api/assistant/ask (your own data, no outside AI, free). If the server is unreachable it falls back to what
// the character already knows from today's cached numbers.
import { useCallback, useEffect, useRef, useState } from "react";
import "./assistant.css";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import { CHARS, dayChar, stickerFor } from "../motion/chars";
import { getCtx, refreshCtx } from "../motion/ctxStore";
import { insights, reply } from "../motion/talk";

const KEY = "ff_chat_v1";
const SCENE = { hype: "cheer", thumbs: "chart", eat: "eat", drink: "drink", lift: "lift", scale: "scale", task: "task", chart: "chart", love: "love", laugh: "laugh", wave: "wave", sad: "sad", think: "think", party: "victory" };
const load = () => { try { const d = JSON.parse(sessionStorage.getItem(KEY)); return d && d.day === getLocalDate() ? d.msgs : []; } catch { return []; } };

export default function AssistantPanel({ go }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(() => dayChar());
  const [msgs, setMsgs] = useState(load);
  const [chips, setChips] = useState(["How am I doing today?", "What should I eat next?", "How was my week?", "How do I plan my week?"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState("wave");
  const end = useRef(null), input = useRef(null), booted = useRef(false);

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ day: getLocalDate(), msgs: msgs.slice(-30) })); } catch { /* private mode */ } }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, busy, open]);

  const post = useCallback(async (question) => {
    const r = await apiFetch("/api/assistant/ask", { method: "POST", body: JSON.stringify({ question, today: getLocalDate(), hour: new Date().getHours() }) });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.message || "failed");
    return d;
  }, []);

  const offline = useCallback((question) => {
    const ctx = getCtx();
    const r = reply(/next|what/i.test(question) ? "What's next?" : /motivat|tired|quit/i.test(question) ? "Motivate me" : "How am I doing?", who, ctx);
    return { text: `${r.text}\n\n(I could not reach the server, so this is from the numbers I already had.)`, mood: r.mood, actions: [], chips: null };
  }, [who]);

  const ask = useCallback(async (q) => {
    const question = String(q ?? "").trim();
    if (!question || busy) return;
    setText(""); setBusy(true); setMood("think");
    setMsgs((m) => [...m, { from: "me", text: question, id: Date.now() }]);
    let d;
    try { d = await post(question); } catch { d = offline(question); }
    setMood(d.mood || "wave"); setBusy(false);
    if (d.chips) setChips(d.chips);
    setMsgs((m) => [...m, { from: "bot", text: d.text, actions: d.actions || [], mood: d.mood, id: Date.now() + 1 }]);
  }, [busy, post, offline]);

  const openPanel = useCallback((detail = {}) => {
    if (detail.who && CHARS[detail.who]) setWho(detail.who);
    setOpen(true);
    refreshCtx();
    if (!booted.current && !load().length) {
      booted.current = true;
      apiFetch(`/api/assistant/chips?today=${getLocalDate()}&hour=${new Date().getHours()}`).then((r) => r.json()).then((d) => {
        if (d.success) { setChips(d.chips); setMsgs((m) => (m.length ? m : [{ from: "bot", text: d.greeting, actions: [], mood: "wave", id: 1 }])); }
      }).catch(() => setMsgs((m) => (m.length ? m : [{ from: "bot", text: "Hi! Ask me about your day, your week, or how any feature works.", mood: "wave", id: 1 }])));
    }
    if (detail.question) setTimeout(() => ask(detail.question), 60);
    else setTimeout(() => input.current?.focus(), 120);
  }, [ask]);

  useEffect(() => {
    const onAsk = (e) => openPanel(e.detail || {});
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      const t = e.target;
      if (e.key === "?" && !(t instanceof HTMLElement && t.matches("input, textarea, select, [contenteditable]"))) { e.preventDefault(); openPanel(); }
    };
    window.addEventListener("flexfit:ask", onAsk); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("flexfit:ask", onAsk); window.removeEventListener("keydown", onKey); };
  }, [openPanel]);

  const face = (m) => stickerFor(who, SCENE[m] || "wave", `${who}-${m}`).src;
  const act = (a) => { if (a.page) { go?.(a.page); if (window.innerWidth < 700) setOpen(false); } else if (a.ask) ask(a.ask); };
  const clear = () => { setMsgs([]); booted.current = false; sessionStorage.removeItem(KEY); openPanel(); };

  return (
    <>
      {!open && (
        <button type="button" className="as-fab" onClick={() => openPanel()} aria-label="Ask FlexFit anything">
          <img src={face("wave")} alt="" width="46" height="46" /><span>Ask FlexFit</span>
        </button>
      )}
      {open && (
        <section className="as-panel" role="dialog" aria-label="Ask FlexFit">
          <header className="as-head">
            <img className={busy ? "is-think" : ""} src={face(busy ? "think" : mood)} alt="" width="48" height="48" />
            <div><b>{CHARS[who]} · FlexFit coach</b><small>{busy ? "Looking at your data…" : "Knows your day, week, goals and every feature"}</small></div>
            <button type="button" onClick={clear} aria-label="Start a new chat" title="New chat">↺</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </header>
          <div className="as-body" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`as-msg ${m.from}`}>
                {m.from === "bot" && <img src={face(m.mood)} alt="" width="34" height="34" />}
                <div>
                  <p>{m.text}</p>
                  {m.actions?.length > 0 && <div className="as-actions">{m.actions.map((a) => <button key={a.label} type="button" onClick={() => act(a)}>{a.page ? "→ " : ""}{a.label}</button>)}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="as-msg bot"><img src={face("think")} alt="" width="34" height="34" /><div><p className="as-dots"><i /><i /><i /></p></div></div>}
            <div ref={end} />
          </div>
          <div className="as-chips" role="group" aria-label="Suggested questions">
            {chips.map((c) => <button key={c} type="button" onClick={() => ask(c)} disabled={busy}>{c}</button>)}
          </div>
          <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Ask anything: “how much protein left?”" aria-label="Your question" enterKeyHint="send" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send">➤</button>
          </form>
        </section>
      )}
    </>
  );
}
