import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { apiFetch } from "../config/api";
import { isGentle } from "../utils/coachTone";

// "Plan this meal": before you log it, what the choice does to the rest of today (kcal and protein left) and the week. Nothing is saved here.
export default function FitPreview({ foodId, quantity, date }) {
  const [fit, setFit] = useState(null);
  useEffect(() => {
    if (!foodId || !(Number(quantity) > 0)) { setFit(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      apiFetch(`${API_URL}/api/foods/fit`, { method: "POST", body: JSON.stringify({ foodId, quantity: Number(quantity), date }) })
        .then((r) => r.json()).then((j) => live && j.success && setFit(j)).catch(() => live && setFit(null));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [foodId, quantity, date]);
  if (!fit || isGentle()) return null;
  const head = fit.status === "fits" ? "✓ Fits today" : fit.status === "tight" ? "◐ Fits, just" : "↗ A bit over today";
  return (
    <div className={`fit-preview fit-${fit.status}`} role="status">
      <strong>{head}</strong>
      <p>{fit.message}</p>
      <p>After this: <b>{Math.max(0, fit.leftAfter).toLocaleString()} kcal</b> left{fit.proteinLine ? `, ${fit.proteinLine.toLowerCase()}` : ""}</p>
      {fit.week && <small>This week: {fit.week.weekLeft.toLocaleString()} kcal left{fit.week.perDayAfter !== null ? ` (about ${fit.week.perDayAfter.toLocaleString()} a day for the rest of the week)` : ""}.</small>}
    </div>
  );
}
