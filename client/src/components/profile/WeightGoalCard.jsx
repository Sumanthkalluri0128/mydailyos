// The "Weight Goal" card of the profile page. Split out of ProfilePage.jsx; it gets everything it needs as props.
import WeightReveal from "../WeightReveal";

export function WeightGoalCard(props) {
  const { currentWeight, form, handleChange, targetWeight, weightDifference, weightDirection } = props;
  return (
    <>
    <div className="card">

      <h2>Weight Goal</h2>

      <button
        type="button"
        className="bp-cta"
        style={{ marginBottom: 12 }}
        onClick={() => window.dispatchEvent(new CustomEvent("ff:goto", { detail: { page: "bodyPlan" } }))}
      >
        <span aria-hidden="true">🎯</span>
        <span>
          <b>{form.bodyType ? "Body plan (change my body goal)" : "Body plan: choose the body you want"}</b>
          <small>Lean, athletic, strong or balanced: calories, macros and training worked out for it.</small>
        </span>
      </button>

      <label>
        Target Weight (kg)
      </label>

      <input
        type="number"
        name="targetWeightKg"
        min="1"
        max="500"
        step="0.1"
        value={form.targetWeightKg}
        onChange={handleChange}
        placeholder="Example: 75"
      />

      {currentWeight !== null &&
        targetWeight !== null && (
          <div className="weight-goal-summary">

            <div>

              <span>
                Current Weight
              </span>

              <strong>
                <WeightReveal compact reaction={false} text={`${currentWeight.toFixed(1)} kg`} />
              </strong>

            </div>

            <div>

              <span>
                Target Weight
              </span>

              <strong>
                <WeightReveal compact reaction={false} text={`${targetWeight.toFixed(1)} kg`} />
              </strong>

            </div>

            <div>

              <span>
                Goal
              </span>

              <strong>
                {weightDirection}
              </strong>

            </div>

            <div>

              <span>
                Difference
              </span>

              <strong>
                {weightDifference.toFixed(1)} kg
              </strong>

            </div>

          </div>
        )}

    </div>
    </>
  );
}
