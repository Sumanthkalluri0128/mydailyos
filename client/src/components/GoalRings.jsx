// Daily goal rings: calories, protein, water and exercise minutes.
function Ring({ label, value, target, unit, color, icon }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const R = 30, C = 2 * Math.PI * R;
  const done = target > 0 && value >= target;
  return (
    <div className="ring-item" aria-label={`${label}: ${Math.round(value)} of ${target} ${unit}`}>
      <svg viewBox="0 0 76 76" width="76" height="76">
        <circle cx="38" cy="38" r={R} className="ring-track" />
        <circle
          cx="38" cy="38" r={R} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={color} strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 38 38)"
        />
        <text x="38" y="44" textAnchor="middle" className="ring-icon">{done ? "✓" : icon}</text>
      </svg>
      <strong>{Math.round(value).toLocaleString()}<small> / {Number(target).toLocaleString()}</small></strong>
      <span>{label} ({unit})</span>
    </div>
  );
}

export default function GoalRings({ summary, water, activity, goals }) {
  return (
    <section className="goal-rings" aria-label="Today's goals">
      <Ring label="Calories" icon="🍽️" color="#6847e8" value={summary.calories} target={goals?.calorieTarget ?? 1800} unit="kcal" />
      <Ring label="Protein" icon="🥩" color="#e8476f" value={summary.protein} target={goals?.proteinTarget ?? 140} unit="g" />
      <Ring label="Water" icon="💧" color="#2587d9" value={water.totalMl} target={goals?.waterTargetMl ?? 3000} unit="ml" />
      <Ring label="Exercise" icon="🔥" color="#20a46b" value={activity.totalMinutes} target={goals?.exerciseMinutesTarget ?? 30} unit="min" />
    </section>
  );
}
