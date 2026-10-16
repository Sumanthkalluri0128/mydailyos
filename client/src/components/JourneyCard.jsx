// Compact "your journey" card for the dashboard: level, today's quests, and a nudge to open the Goals page.
import { useEffect, useState } from "react";
import { getCtx, onCtx, refreshCtx } from "../motion/ctxStore";
import "../pages/goals.css";

export default function JourneyCard({ onOpen, syncTick }) {
  const [c, setC] = useState(getCtx());
  useEffect(() => { const off = onCtx(setC); refreshCtx(true); return off; }, [syncTick]);
  if (!c) return null;
  const { level: lv, today: q, streak } = c;
  const open = q.quests.filter((x) => !x.done)[0];
  return (
    <button type="button" className="gp-card gp-mini" onClick={onOpen} aria-label="Open Goals and Journey">
      <div className="gp-row"><b>🏆 Level {lv.level} · {lv.rank}</b><span className="gp-xp">🔥 {streak.current}d streak</span></div>
      <div className="gp-bar"><i className="gp-fill gp-xp" style={{ width: `${Math.max(3, lv.pct)}%` }} /></div>
      <small>{q.total ? `${q.done}/${q.total} quests done today` : "Set up your profile for daily quests"}{open ? ` · next: ${open.title.toLowerCase()}` : q.total ? " · perfect day! 🎉" : ""}</small>
    </button>
  );
}
