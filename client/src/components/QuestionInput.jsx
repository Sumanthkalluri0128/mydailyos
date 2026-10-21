// The answer area under one Sensei question: quick-reply chips (single / multi), typed words with suggestions (text), small forms and dates.
// Pure presentation over utils/sensei.js; the parent owns the draft and what happens on send.
import { useState } from "react";
import { addWord, toggleMulti } from "../utils/sensei";

function Chips({ options, value, multi, onPick, exclusive }) {
  return (
    <div className="sn-chips" role="group">
      {options.map((o) => {
        const on = multi ? (value || []).includes(o.id) : value === o.id;
        return <button key={o.id} type="button" className={`sn-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onPick(o.id, exclusive)}>{o.emoji ? `${o.emoji} ` : ""}{o.label}</button>;
      })}
    </div>
  );
}

export default function QuestionInput({ q, draft, setDraft, onSend, busy }) {
  const [word, setWord] = useState("");
  const send = (v) => onSend(v === undefined ? draft : v);

  if (q.type === "single") {
    return <Chips options={q.options || []} value={draft} onPick={(id) => { setDraft(id); send(id); }} />;
  }

  if (q.type === "multi") {
    const none = q.allowNone ? { id: "none", label: "Nothing to avoid" } : null;
    const pick = (id) => setDraft(toggleMulti(draft, id, "none"));
    return (
      <div>
        {q.groups ? q.groups.map((g) => (
          <fieldset key={g.id} className="sn-group"><legend>{g.label}</legend><Chips options={g.options} value={draft} multi onPick={pick} /></fieldset>
        )) : <Chips options={q.options || []} value={draft} multi onPick={(id) => setDraft(toggleMulti(draft, id, q.exclusive || "none"))} />}
        {none && <Chips options={[none]} value={draft} multi onPick={pick} />}
        <div className="sn-send"><button type="button" className="primary-button" disabled={busy} onClick={() => send()}>Done</button></div>
      </div>
    );
  }

  if (q.type === "text") {
    const list = Array.isArray(draft) ? draft : [];
    const add = (w) => { setDraft(addWord(list, w, q.max || 30)); setWord(""); };
    return (
      <div>
        {list.length > 0 && <div className="sn-chips" aria-label="Your list">{list.map((w) => <button key={w} type="button" className="sn-chip on" onClick={() => setDraft(list.filter((x) => x !== w))} aria-label={`Remove ${w}`}>{w} ✕</button>)}</div>}
        <div className="sn-chips">{(q.suggestions || []).filter((s) => !list.some((x) => x.toLowerCase() === s.toLowerCase())).map((s) => <button key={s} type="button" className="sn-chip" onClick={() => add(s)}>+ {s}</button>)}</div>
        <div className="sn-type">
          <input value={word} maxLength={40} placeholder="Type something else" aria-label="Add your own" onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(word); } }} />
          <button type="button" className="secondary-button" onClick={() => add(word)} disabled={word.trim().length < 2}>Add</button>
        </div>
        <div className="sn-send"><button type="button" className="primary-button" disabled={busy} onClick={() => send(list)}>{list.length ? "Done" : "Nothing to add"}</button></div>
      </div>
    );
  }

  if (q.type === "form") {
    const set = (id, v) => setDraft({ ...draft, [id]: v });
    return (
      <div>
        {(q.fields || []).map((f) => (
          <fieldset key={f.id} className="sn-group"><legend>{f.label}</legend>
            <Chips options={f.options || []} value={draft?.[f.id]} multi={f.type === "multi"} onPick={(id) => set(f.id, f.type === "multi" ? toggleMulti(draft?.[f.id], id, "none") : id)} />
          </fieldset>
        ))}
        <div className="sn-send"><button type="button" className="primary-button" disabled={busy} onClick={() => send()}>Done</button></div>
      </div>
    );
  }

  if (q.type === "dates") {
    const set = (k, v) => setDraft({ ...draft, [k]: v });
    const days = (q.fields || []).find((f) => f.id === "days");
    return (
      <div>
        <div className="sn-type">
          <label>{(q.fields || [])[0]?.label || "From"}<input type="date" value={draft?.from || ""} onChange={(e) => set("from", e.target.value)} /></label>
          {days ? <Chips options={days.options} value={draft?.days} onPick={(id) => set("days", id)} /> : <label>To<input type="date" value={draft?.to || ""} min={draft?.from || undefined} onChange={(e) => set("to", e.target.value)} /></label>}
        </div>
        <div className="sn-send"><button type="button" className="primary-button" disabled={busy || !draft?.from} onClick={() => send()}>Done</button></div>
      </div>
    );
  }
  return null;
}
