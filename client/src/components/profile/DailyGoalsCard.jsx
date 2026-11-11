// The "Daily Goals" card of the profile page. Split out of ProfilePage.jsx; it gets everything it needs as props.


export function DailyGoalsCard(props) {
  const { form, handleChange, plan, setForm } = props;
  return (
    <>
    <div className="card">

      <h2>Daily Goals</h2>

      <label>Calorie target</label>

      <select
        name="calorieMode"
        value={form.calorieMode}
        onChange={(e) => {
          const mode = e.target.value;
          setForm((f) => ({ ...f, calorieMode: mode, calorieTarget: mode === "manual" && plan ? plan.autoTarget : f.calorieTarget }));
        }}
      >
        <option value="auto">Auto — worked out for you (recommended)</option>
        <option value="manual">My own number</option>
      </select>

      {form.calorieMode === "manual" ? (
        <>
          <label>Calories per day (kcal)</label>
          <input
            type="number"
            name="calorieTarget"
            min="500"
            value={form.calorieTarget}
            onChange={handleChange}
          />
        </>
      ) : (
        <p className="muted">
          {plan
            ? `Worked out for you: ${plan.autoTarget.toLocaleString()} kcal a day. It updates when your weight, goal or pace changes.`
            : "Add your age, height and weight above to get your personal target."}
        </p>
      )}

      <label>Weight-change pace (kg per week)</label>

      <select name="weeklyPaceKg" value={form.weeklyPaceKg} onChange={handleChange}>
        <option value="0.25">0.25 — gentle</option>
        <option value="0.5">0.5 — recommended</option>
        <option value="0.75">0.75 — faster</option>
        <option value="1">1 — fastest</option>
      </select>

      <label>
        Protein Target (g) <small>(leave blank = automatic, matches My Plan)</small>
      </label>

      <input
        type="number"
        name="proteinTarget"
        min="1"
        placeholder="Automatic"
        value={form.proteinTarget ?? ""}
        onChange={handleChange}
      />

      <label>
        Water Target (ml)
      </label>

      <input
        type="number"
        name="waterTargetMl"
        min="1"
        value={form.waterTargetMl}
        onChange={handleChange}
      />

      <label>
        Steps Target
      </label>

      <input
        type="number"
        name="stepsTarget"
        min="1"
        value={form.stepsTarget}
        onChange={handleChange}
      />

    </div>
    </>
  );
}
