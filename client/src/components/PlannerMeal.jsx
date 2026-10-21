// One meal of one day: logged and planned foods together (labelled Logged / Planned), up to 3 add-on suggestions with "show more",
// a hungry character when the meal is empty and the chef's comment in the character's voice otherwise.
import { useState } from "react";
import Buddy from "../motion/Buddy";
import { chefLine, STATUS_LABEL } from "../utils/mealView";

const LABEL = { breakfast: "🌅 Breakfast", lunch: "☀️ Lunch", dinner: "🌙 Dinner", snacks: "🍎 Snacks" };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const FEEDBACK = [["loved", "😍 Loved it"], ["too_heavy", "😮‍💨 Too heavy"], ["too_long", "⏱️ Too long to cook"], ["not_available", "🛒 Not available"]];

export default function PlannerMeal({ day, meal, who, adding, onToggleAdd, onLog, onRemove, onAddSuggestion, onLogSuggestion, onLock, onFeedback, extras, children, onDrop, dragging }) {
  const [more, setMore] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [fbFor, setFbFor] = useState(null);
  const m = day.meals[meal];
  const ro = day.readOnly;
  const empty = m.items.length === 0;
  const sugg = more ? [...m.suggestions, ...m.more] : m.suggestions;
  const badge = (st, pending) => <span className={`pl-badge ${st}`}>{STATUS_LABEL[st]}{pending ? " · syncing" : ""}</span>;
  const line = (i) => `${i.quantity} ${i.servingUnit} · ${i.calories} kcal · ${i.protein} g protein`;

  return (
    <div className="planner-slot" onDragOver={(e) => dragging && e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop?.(); }}>
      <div className="planner-slot-head">
        <span>{LABEL[meal]}{m.total.calories > 0 && <small className="pl-sub"> {m.logged.calories} logged{m.planned.calories > 0 ? ` + ${m.planned.calories} planned` : ""} kcal · {m.total.protein} g protein</small>}</span>
        <span className="pl-slot-tools">
          {!ro && m.planned.calories > 0 && onLock && <button className="link-button" aria-pressed={!!m.locked} aria-label={m.locked ? `Unlock ${meal}` : `Lock ${meal} so it stays when you re-shuffle`} onClick={() => onLock(!m.locked)}>{m.locked ? "🔒 Locked" : "🔓 Lock"}</button>}
          {!ro && <button className="link-button" onClick={onToggleAdd}>{adding ? "Close" : "+ Add"}</button>}
        </span>
      </div>
      {!ro && m.why && <div className="pl-why"><button className="link-button" aria-expanded={whyOpen} onClick={() => setWhyOpen(!whyOpen)}>💬 Why this plate?</button>{whyOpen && <p role="note">{m.why}</p>}</div>}
      {!ro && day.plan?.out?.some((o) => o.meal === meal) && <p className="pl-sub">🍱 Eaten out{day.plan.out.find((o) => o.meal === meal).kind ? ` (${day.plan.out.find((o) => o.meal === meal).kind})` : ""}: aim for about {day.plan.out.find((o) => o.meal === meal).aim} kcal with protein, a carb and vegetables.</p>}
      {!ro && day.plan?.fasted?.includes(meal) && <p className="pl-sub">🌙 Fasting window: nothing planned for this meal.</p>}

      {empty && !ro && m.hint && (
        <div className="pl-chef"><Buddy scene="eat" size={52} who={who} talk={false} label="Hungry" /><p>{chefLine(m.hint, who)}</p></div>
      )}
      {empty && ro && <p className="pl-sub">Nothing logged.</p>}

      {m.items.map((i) => (
        <div key={i.id}>
          <div title={i.why || undefined} className={`planner-item ${i.status}`} draggable={!ro && i.status === "planned" && !i.pending} onDragStart={() => extras?.dragStart?.(i)} onDragEnd={() => extras?.dragEnd?.()}>
            {badge(i.status, i.pending)}
            <span><strong>{i.foodName}</strong><small>{line(i)}{i.fromPlan ? " · from your plan" : ""}{i.leftover ? " · leftover, no cooking" : ""}{i.cookMin ? ` · ${i.cookMin} min` : ""}</small>{i.cookNote && <small>👩‍🍳 {i.cookNote}</small>}</span>
            {!ro && i.status === "planned" && day.kind === "today" && !i.pending && <button className="secondary-button" onClick={() => onLog(i)}>Log</button>}
            {!ro && i.status === "planned" && onFeedback && !i.pending && <button className="link-button" aria-expanded={fbFor === i.id} onClick={() => setFbFor(fbFor === i.id ? null : i.id)}>How was it?</button>}
            {!ro && i.status === "planned" && extras?.buttons?.(i)}
            {!ro && i.status === "planned" && !i.pending && <button className="delete-log-button" aria-label={`Remove ${i.foodName}`} onClick={() => onRemove(i)}>✕</button>}
          </div>
          {fbFor === i.id && <div className="pl-feedback" role="group" aria-label={`Feedback on ${i.foodName}`}>{FEEDBACK.map(([k, l]) => <button key={k} className="sn-chip" onClick={() => { setFbFor(null); onFeedback(i, k); }}>{l}</button>)}</div>}
          {!ro && i.status === "planned" && extras?.panel?.(i)}
        </div>
      ))}

      {!ro && m.items.length > 0 && m.suggestions.length > 0 && (
        <div className="pl-suggest" role="group" aria-label={`Suggestions for ${meal}`}>
          <b>💡 {m.addOnText ? cap(m.addOnText) : "Balance this meal"}</b>
          {m.hint?.kind === "partial" && <p className="pl-sub">{chefLine(m.hint, who)}</p>}
          {sugg.map((s) => (
            <div key={s.key || s.foodName} className="planner-item suggested">
              {badge("suggested")}
              <span><strong>{s.foodName}</strong><small>{s.calories} kcal · {s.protein} g protein · {s.why}</small></span>
              <button className="secondary-button" onClick={() => onAddSuggestion(s)}>+ Plan</button>
              {day.kind === "today" && <button className="secondary-button" onClick={() => onLogSuggestion(s)}>Log</button>}
            </div>
          ))}
          {m.more.length > 0 && <button className="link-button" onClick={() => setMore(!more)}>{more ? "Show fewer" : `Show more (${m.more.length})`}</button>}
        </div>
      )}
      {children}
    </div>
  );
}
