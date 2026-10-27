import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import Buddy from "../motion/Buddy";
import WeightReveal from "./WeightReveal";
import { useSimple } from "./simple/useSimple";
import { TreatCard, DietBreak, coachLearn } from "./CoachCards";
import { useCoachTone } from "../utils/coachTone";
import { weekSummary } from "../utils/weekSummary";

const NAMES = { zoro: "Zoro", naruto: "Naruto", luffy: "Luffy", jinwoo: "Jin-Woo", goku: "Goku", gojo: "Gojo" };

// Weekly review, "what to change" tips and the boss-fight challenge — all computed on the server (/api/progress/coach).
export default function WeeklyCoach() {
  const [d, setD] = useState(null);
  const [sim] = useSimple();
  const [tried, setTried] = useState({});
  const tone = useCoachTone();
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    apiFetch(`${API_URL}/api/progress/coach?today=${today}`)
      .then((r) => r.json())
      .then((j) => { if (live && j.success) { setD(j); (j.tips || []).forEach((t) => coachLearn(t.id, "shown")); } })
      .catch(() => {});
    return () => { live = false; };
  }, [nonce]);
  if (!d) return null;
  const { review, tips, challenge: ch, weekBudget: wb, maintenance: mt, microInsights: mi = [] } = d;
  const hpLeft = Math.max(0, ch.target - ch.progress);
  const boss = NAMES[ch.who] || "The boss";
  const sum = weekSummary({ review, tips, challenge: ch, bossName: boss, win: sim?.recap?.win });
  const fight = ch.defeated ? `${boss} is defeated! 🎉` : !ch.canStillWin ? `${boss} wins this round. Rematch next Monday.` : `${hpLeft} more ${ch.unit} to beat ${boss} · ${ch.daysLeft} day${ch.daysLeft === 1 ? "" : "s"} left`;
  return (
    <section className="weekly-coach">
      <div className="card wc-review wc-summary">
        <div className="wc-sum-head">
          <Buddy scene={review.mood === "celebrate" ? "victory" : review.mood === "good" ? "cheer" : "wave"} size={84} />
          <div>
            <p className="eyebrow">Your week</p>
            <h3>{sum.headline}</h3>
            <strong>{sim?.weeklyScore?.score != null ? `${sim.weeklyScore.title} ${sim.weeklyScore.score}/100` : `Score ${review.score}/100`} · {review.loggedDays}/7 days logged</strong>
          </div>
        </div>
        <section className="wc-sec" aria-label="What went well"><h4>✅ What went well</h4><ul>{sum.well.map((w) => <li key={w}>{w}</li>)}</ul></section>
        {sum.change.length > 0 && <section className="wc-sec" aria-label="What to change"><h4>🔧 What to change</h4><ul>{sum.change.map((c) => <li key={c.id}><span aria-hidden="true">{c.icon}</span> {c.title}</li>)}</ul></section>}
        {sum.next && (
          <section className="wc-sec wc-next" aria-label="One thing for next week">
            <h4>🎯 One thing for next week</h4>
            <p><strong>{sum.next.title}.</strong> {sum.next.detail}</p>
            {tried[sum.next.id] ? <small>Noted. Good luck!</small> : <button type="button" className="secondary-button" onClick={() => { coachLearn(sum.next.id, "accepted"); setTried({ ...tried, [sum.next.id]: true }); }}>I'll try this</button>}
          </section>
        )}
      </div>
      {mi.length > 0 && (
        <div className="card wc-tips">
          <h3>Power-ups to look at</h3>
          {mi.map((m) => (
            <div key={m.id} className="wc-tip"><span aria-hidden="true">🥬</span><div><strong>{m.line}</strong><p>{m.sources?.foods?.length ? `Try more of: ${m.sources.foods.map((f) => f.name).join(", ")}.` : m.sources?.hint || ""}</p></div></div>
          ))}
        </div>
      )}
      {wb && !tone.gentle && (
        <div className="card wc-budget">
          <h3>Weekly calorie budget</h3>
          <p>{wb.budget.toLocaleString()} kcal for the week · {wb.usedBeforeToday.toLocaleString()} counted so far (days you did not log count as on budget).</p>
          <strong className={wb.diffPerDay < 0 ? "wc-bad" : "wc-good"}>{wb.diffPerDay < 0 ? "▼ " : wb.diffPerDay > 0 ? "▲ " : "● "}{wb.perDayLeft.toLocaleString()} kcal/day</strong>
          {wb.treatReserved > 0 && <p>This already sets aside {wb.treatReserved.toLocaleString()} kcal of treats you have planned.</p>}
          <p>{wb.diffPerDay === 0 ? "Right on your daily target" : wb.diffPerDay < 0 ? `${Math.abs(wb.diffPerDay)} below your usual ${wb.dailyTarget.toLocaleString()} target` : `${wb.diffPerDay} above your usual ${wb.dailyTarget.toLocaleString()} target`} for the next {wb.daysLeft} day{wb.daysLeft === 1 ? "" : "s"} to finish the week on budget.</p>
        </div>
      )}
      {!tone.gentle && <TreatCard treat={d.treat} reload={() => setNonce((n) => n + 1)} />}
      <DietBreak reload={() => setNonce((n) => n + 1)} />
      {mt && !tone.gentle && (
        <div className="card wc-budget">
          <h3>What your body seems to burn</h3>
          <strong>≈ {mt.estimate.toLocaleString()} kcal/day</strong>
          <p>From {mt.loggedDays} logged days averaging {mt.avgIntake.toLocaleString()} kcal and a weight change of <WeightReveal compact reaction={false} text={`${mt.kgPerWeek > 0 ? "+" : ""}${mt.kgPerWeek} kg/week`} />. Confidence: {mt.confidence}.
            {mt.diff !== null && mt.expected !== null && Math.abs(mt.diff) >= 150 ? ` The app's formula says ${mt.expected.toLocaleString()}, so your real maintenance looks ${mt.diff < 0 ? "lower" : "higher"} by about ${Math.abs(mt.diff)} kcal${mt.diff < 0 ? ", which may explain a slower loss than expected. Check that eating-out meals and oil are logged." : "."}` : ""}</p>
        </div>
      )}
      <div className={`card wc-boss${ch.defeated ? " won" : ""}`}>
        <Buddy who={ch.who} scene={ch.defeated ? "sad" : "fight"} size={88} />
        <div>
          <p className="eyebrow">Boss fight</p>
          <h3>{ch.title} vs {boss}</h3>
          <p>Reach {ch.target} {ch.unit} this week (Mon–Sun).</p>
          <div className="wc-hp" role="img" aria-label={`Boss health ${hpLeft} of ${ch.target}`}><span style={{ width: `${(hpLeft / ch.target) * 100}%` }} /></div>
          <strong>{fight}</strong>
        </div>
      </div>
    </section>
  );
}
