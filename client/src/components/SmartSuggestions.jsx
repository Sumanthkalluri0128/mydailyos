import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { notify } from "../utils/notify";

// Foods that fit what's still missing today (calories, protein, fibre). One tap adds one serving.
export default function SmartSuggestions({ date, mealType, refreshKey, onLogged }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/foods/suggest?date=${date}&mealType=${mealType}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.success) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [date, mealType, refreshKey]);

  if (!data || !data.suggestions.length) return null;
  const add = async (food) => {
    try {
      const res = await apiFetch("/api/food-logs", { method: "POST", body: JSON.stringify({ foodId: food._id, date, mealType, quantity: food.servingSize, clientId: `sg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }) });
      if (!res.ok) throw new Error();
      notify(`Added ${food.name} to ${mealType}.`, "success");
      onLogged?.();
    } catch { notify("Could not add that food.", "error"); }
  };
  const gaps = [data.remaining.protein > 0 && `${data.remaining.protein} g protein`, data.remaining.fiber > 0 && `${data.remaining.fiber} g fibre`].filter(Boolean);

  return (
    <div className="large-card smart-suggestions">
      <div className="section-header"><div><h2>💡 Suggested for you</h2><p>{gaps.length ? `Still to go today: ${gaps.join(" · ")}` : "Fits what you have left today"}</p></div></div>
      <div className="suggestion-list">
        {data.suggestions.map(({ food, reason }) => (
          <button key={food._id} className="suggestion-chip" onClick={() => add(food)} title="Add one serving">
            <strong>+ {food.name}</strong>
            <small>{food.servingSize} {food.servingUnit} · {reason}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
