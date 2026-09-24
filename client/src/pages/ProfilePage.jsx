import { useEffect, useState } from "react";
import {
  calculateBMR,
  calculateTDEE,
} from "../utils/calories";

const API_URL = "http://127.0.0.1:5001";

function ProfilePage({ onBack }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    sex: "",
    heightCm: "",
    currentWeightKg: "",
    activityLevel: "moderate",

    calorieTarget: 1800,
    proteinTarget: 140,
    waterTargetMl: 3000,
    stepsTarget: 10000,
    targetWeightKg: "",
  });

  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] =
    useState(true);

  // ============================================================
  // BMR
  // ============================================================

  const bmr = calculateBMR({
    weightKg: form.currentWeightKg,
    heightCm: form.heightCm,
    age: form.age,
    sex: form.sex,
  });

  // ============================================================
  // TDEE
  // ============================================================

  const tdee = calculateTDEE({
    weightKg: form.currentWeightKg,
    heightCm: form.heightCm,
    age: form.age,
    sex: form.sex,
    activityLevel: form.activityLevel,
  });

  // ============================================================
  // WEIGHT GOAL CALCULATIONS
  // ============================================================

  const currentWeight =
    Number(form.currentWeightKg) || null;

  const targetWeight =
    Number(form.targetWeightKg) || null;

  const weightDifference =
    currentWeight !== null &&
    targetWeight !== null
      ? Math.abs(currentWeight - targetWeight)
      : null;

  const weightDirection =
    currentWeight !== null &&
    targetWeight !== null
      ? targetWeight < currentWeight
        ? "Lose"
        : targetWeight > currentWeight
        ? "Gain"
        : "Maintain"
      : null;

  // ============================================================
  // LOAD PROFILE
  // ============================================================

  const fetchProfile = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/profile`
      );

      const data = await response.json();

      if (data.success) {
        const profile = data.profile;

        setForm({
          name: profile.name || "",

          age:
            profile.age !== null &&
            profile.age !== undefined
              ? profile.age
              : "",

          sex: profile.sex || "",

          heightCm:
            profile.heightCm !== null &&
            profile.heightCm !== undefined
              ? profile.heightCm
              : "",

          currentWeightKg:
            profile.currentWeightKg !== null &&
            profile.currentWeightKg !== undefined
              ? profile.currentWeightKg
              : "",

          activityLevel:
            profile.activityLevel || "moderate",

          calorieTarget:
            profile.goals?.calorieTarget ??
            1800,

          proteinTarget:
            profile.goals?.proteinTarget ??
            140,

          waterTargetMl:
            profile.goals?.waterTargetMl ??
            3000,

          stepsTarget:
            profile.goals?.stepsTarget ??
            10000,

          targetWeightKg:
            profile.goals?.targetWeightKg !== null &&
            profile.goals?.targetWeightKg !== undefined
              ? profile.goals.targetWeightKg
              : "",
        });
      }
    } catch (error) {
      console.error(
        "Failed to fetch profile:",
        error
      );
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // ============================================================
  // FORM CHANGE
  // ============================================================

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ============================================================
  // SAVE PROFILE
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/profile`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name,

            age:
              form.age === ""
                ? null
                : Number(form.age),

            sex: form.sex,

            heightCm:
              form.heightCm === ""
                ? null
                : Number(form.heightCm),

            currentWeightKg:
              form.currentWeightKg === ""
                ? null
                : Number(
                    form.currentWeightKg
                  ),

            activityLevel:
              form.activityLevel,

            goals: {
              calorieTarget:
                Number(
                  form.calorieTarget
                ),

              proteinTarget:
                Number(
                  form.proteinTarget
                ),

              waterTargetMl:
                Number(
                  form.waterTargetMl
                ),

              stepsTarget:
                Number(
                  form.stepsTarget
                ),

              targetWeightKg:
                form.targetWeightKg === ""
                  ? null
                  : Number(
                      form.targetWeightKg
                    ),
            },
          }),
        }
      );

      const data =
        await response.json();

      if (data.success) {
        alert(
          "Profile saved successfully."
        );

        // Return to Dashboard so the
        // Dashboard reloads the latest Profile.
        onBack();
      } else {
        alert(
          data.message ||
            "Failed to save profile."
        );
      }
    } catch (error) {
      console.error(
        "Failed to save profile:",
        error
      );

      alert(
        "Could not connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOADING SCREEN
  // ============================================================

  if (loadingProfile) {
    return (
      <div className="card">
        <p>Loading profile...</p>
      </div>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="profile-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="profile-page-header">

        <div>

          <button
            className="secondary-button"
            onClick={onBack}
          >
            ← Back
          </button>

          <h1>Profile & Goals</h1>

          <p>
            Manage your body information
            and daily targets.
          </p>

        </div>

      </div>

      <form
        className="profile-form"
        onSubmit={handleSubmit}
      >

        {/* ==================================================== */}
        {/* PERSONAL INFORMATION */}
        {/* ==================================================== */}

        <div className="card">

          <h2>Personal Information</h2>

          <label>
            Name
          </label>

          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Your name"
          />

          <label>
            Age
          </label>

          <input
            type="number"
            name="age"
            min="1"
            max="120"
            value={form.age}
            onChange={handleChange}
            placeholder="Age"
          />

          <label>
            Sex
          </label>

          <select
            name="sex"
            value={form.sex}
            onChange={handleChange}
          >
            <option value="">
              Select
            </option>

            <option value="male">
              Male
            </option>

            <option value="female">
              Female
            </option>

            <option value="other">
              Other
            </option>
          </select>

        </div>

        {/* ==================================================== */}
        {/* BODY PROFILE */}
        {/* ==================================================== */}

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

        </div>

        {/* ==================================================== */}
        {/* DAILY GOALS */}
        {/* ==================================================== */}

        <div className="card">

          <h2>Daily Goals</h2>

          <label>
            Calorie Target (kcal)
          </label>

          <input
            type="number"
            name="calorieTarget"
            min="1"
            value={form.calorieTarget}
            onChange={handleChange}
          />

          <label>
            Protein Target (g)
          </label>

          <input
            type="number"
            name="proteinTarget"
            min="1"
            value={form.proteinTarget}
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

        {/* ==================================================== */}
        {/* ENERGY NEEDS */}
        {/* ==================================================== */}

        <div className="profile-section">

          <h2>Energy Needs</h2>

          <p className="section-description">
            Estimated daily energy requirements
            based on your body profile.
          </p>

          <div className="energy-grid">

            <div className="energy-card">

              <span>BMR</span>

              <strong>
                {bmr !== null
                  ? Math.round(bmr).toLocaleString()
                  : "--"}
              </strong>

              <small>
                kcal/day
              </small>

            </div>

            <div className="energy-card">

              <span>TDEE</span>

              <strong>
                {tdee !== null
                  ? Math.round(tdee).toLocaleString()
                  : "--"}
              </strong>

              <small>
                kcal/day
              </small>

            </div>

            <div className="energy-card">

              <span>Current Target</span>

              <strong>
                {Number(
                  form.calorieTarget || 0
                ).toLocaleString()}
              </strong>

              <small>
                kcal/day
              </small>

            </div>

          </div>

        </div>

        {/* ==================================================== */}
        {/* WEIGHT GOAL */}
        {/* ==================================================== */}

        <div className="card">

          <h2>Weight Goal</h2>

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
                    {currentWeight.toFixed(1)} kg
                  </strong>

                </div>

                <div>

                  <span>
                    Target Weight
                  </span>

                  <strong>
                    {targetWeight.toFixed(1)} kg
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

        {/* ==================================================== */}
        {/* SAVE */}
        {/* ==================================================== */}

        <button
          type="submit"
          className="primary-button"
          disabled={loading}
        >
          {loading
            ? "Saving..."
            : "Save Profile & Goals"}
        </button>

      </form>

    </div>
  );
}

export default ProfilePage;