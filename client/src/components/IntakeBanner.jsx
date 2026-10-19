// "Go a little lighter" warning for the places where you decide what to eat (Food logger, Meal planner).
// Reads the same advice the meal planner plans with, so the number you are warned about is the number you get planned.
import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { getLocalDate } from "../utils/date";
import "./autoplan.css";

export default function IntakeBanner({ onPlan }) {
  const [a, setA] = useState(null);
  useEffect(() => {
    let on = true;
    apiFetch(`/api/plan/over-days?today=${getLocalDate()}&tz=${new Date().getTimezoneOffset()}`).then((r) => (r.ok ? r.json() : null)).then((j) => on && setA(j?.advice || null)).catch(() => {});
    return () => { on = false; };
  }, []);
  if (!a) return null;
  const hot = a.level !== "watch";
  return (
    <div className={`ib ${hot ? "is-hot" : ""}`} role="alert">
      <span className="ib-ic" aria-hidden="true">{hot ? "⚠️" : "💡"}</span>
      <div>
        <b>{a.headline}</b>
        <p>{a.skipCut ? a.detail : `Suggested today: about ${Math.round(a.todayTarget).toLocaleString()} kcal. ${a.detail}`}</p>
        {onPlan && <button type="button" className="link-button" onClick={onPlan}>Plan lighter meals →</button>}
      </div>
    </div>
  );
}
