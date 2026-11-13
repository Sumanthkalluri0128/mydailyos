// The "Body Profile" card of the profile page. Split out of ProfilePage.jsx; it gets everything it needs as props.


export function BodyProfileCard(props) {
  const { form, handleChange } = props;
  return (
    <>
    <div className="card">

      <h2>Body Profile</h2>

      <label>
        Height (cm)
      </label>

      <input
        type="number"
        name="heightCm"
        min="50"
        max="250"
        step="0.1"
        value={form.heightCm}
        onChange={handleChange}
        placeholder="Example: 173"
      />

      <label>
        Current Weight (kg)
      </label>

      <input
        type="number"
        name="currentWeightKg"
        min="1"
        max="500"
        step="0.1"
        value={form.currentWeightKg}
        onChange={handleChange}
        placeholder="Example: 82"
      />

      <label>
        Activity Level
      </label>

      <select
        name="activityLevel"
        value={form.activityLevel}
        onChange={handleChange}
      >
        <option value="sedentary">
          Sedentary
        </option>

        <option value="light">
          Lightly Active
        </option>

        <option value="moderate">
          Moderately Active
        </option>

        <option value="very_active">
          Very Active
        </option>

        <option value="extra_active">
          Extra Active
        </option>
      </select>
      <p className="muted">Your calorie target in Automatic mode follows your last 7 days of steps and training. This level is the starting point, and the level used if you choose it yourself on Today.</p>

    </div>
    </>
  );
}
