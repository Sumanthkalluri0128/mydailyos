import { notify } from "../utils/notify";
import Buddy from "../motion/Buddy";
import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import DataControls from "../components/DataControls";
import CharacterSettings from "../components/CharacterSettings";
import { CoachLearning, ToneSettings } from "../components/CoachCards";
import UiSettings from "../components/UiSettings";
import ShareLinkCard from "../components/ShareLinkCard";
import { TourSettings } from "../tour/TourHost";
import ReportControls from "../components/ReportControls";
import { expectedEnergy } from "../utils/energy";
import WeightReveal from "../components/WeightReveal";
import { PersonalInfoCard } from "../components/profile/PersonalInfoCard";
import { BodyProfileCard } from "../components/profile/BodyProfileCard";
import { DailyGoalsCard } from "../components/profile/DailyGoalsCard";
import { WeightGoalCard } from "../components/profile/WeightGoalCard";

function ProfilePage({ onBack }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    sex: "",
    heightCm: "",
    currentWeightKg: "",
    activityLevel: "moderate",

    calorieTarget: 1800,
    calorieMode: "auto",
    weeklyPaceKg: 0.5,
    proteinTarget: "",
    waterTargetMl: 3000,
    stepsTarget: 10000,
    targetWeightKg: "",
  });

  // The saved profile as the server holds it: activity mode, the 7-day activity reading, measured maintenance, your calorie floor.
  // The preview below must use them, or it shows a number the app is not actually using.
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] =
    useState(true);

  // ============================================================
  // BMR
  // ============================================================

  // The same plan the dashboard and the mobile app use (Mifflin-St Jeor, activity, goal weight, pace, or your own number).
  const plan = expectedEnergy({
    age: form.age,
    sex: form.sex,
    heightCm: form.heightCm,
    currentWeightKg: form.currentWeightKg,
    activityLevel: form.activityLevel,
    activityMode: live ? live.activityMode : undefined,
    autoActivity: live ? live.autoActivity : undefined,
    measuredTdee: live ? live.measuredTdee : undefined,
    ageSetAt: live ? live.ageSetAt : undefined,
    goals: {
      calorieFloor: live ? live.calorieFloor : undefined,
      targetWeightKg: form.targetWeightKg === "" ? null : Number(form.targetWeightKg),
      weeklyPaceKg: form.weeklyPaceKg,
      calorieMode: form.calorieMode,
      calorieTarget: Number(form.calorieTarget),
    },
  });
  const bmr = plan ? plan.bmr : null;
  const tdee = plan ? plan.tdee : null;

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
      const response = await apiFetch(
        `${API_URL}/api/profile`
      );

      const data = await response.json();

      if (data.success) {
        const profile = data.profile;
        setLive({ activityMode: profile.activityMode, autoActivity: profile.autoActivity, measuredTdee: profile.measuredTdee, ageSetAt: profile.ageSetAt, calorieFloor: profile.goals?.calorieFloor });

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

          calorieMode:
            profile.goals?.calorieMode === "manual" ? "manual" : "auto",

          weeklyPaceKg:
            profile.goals?.weeklyPaceKg ?? 0.5,

          proteinTarget:
            profile.goals?.proteinTarget ?? "", // blank = automatic (follows weight + body goal, same as My Plan)

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

          // Read-only here (chosen on the Body plan page); only used for the link's wording. The save below never sends it.
          bodyType: profile.goals?.bodyType || "",
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

      const response = await apiFetch(
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
              calorieMode: form.calorieMode,

              weeklyPaceKg: Number(form.weeklyPaceKg) || 0.5,

              ...(form.calorieMode === "manual" && Number(form.calorieTarget) >= 500
                ? { calorieTarget: Number(form.calorieTarget) }
                : {}),

              proteinTarget:
                form.proteinTarget === "" || form.proteinTarget === null || form.proteinTarget === undefined
                  ? null
                  : Number(form.proteinTarget),

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
        notify(
          "Profile saved successfully.",
          "success"
        );

        // Return to Dashboard so the
        // Dashboard reloads the latest Profile.
        onBack();
      } else {
        notify(
          data.message ||
            "Failed to save profile."
        , "error");
      }
    } catch (error) {
      console.error(
        "Failed to save profile:",
        error
      );

      notify(
        "Could not connect to the backend."
      , "error");
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

          <div className="bd-head"><h1>Profile & Goals</h1><Buddy scene="wave" size={76} says="Hi there!" /></div>

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

        <PersonalInfoCard form={form} handleChange={handleChange} />

        {/* ==================================================== */}
        {/* BODY PROFILE */}
        {/* ==================================================== */}

        <BodyProfileCard form={form} handleChange={handleChange} />

        {/* ==================================================== */}
        {/* DAILY GOALS */}
        {/* ==================================================== */}

        <DailyGoalsCard form={form} handleChange={handleChange} plan={plan} setForm={setForm} />

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
                {(plan ? plan.calorieTarget : Number(form.calorieTarget || 0)).toLocaleString()}
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

        <WeightGoalCard currentWeight={currentWeight} form={form} handleChange={handleChange} targetWeight={targetWeight} weightDifference={weightDifference} weightDirection={weightDirection} />

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

      {/* Export your data, change password, log out, delete account */}
      <CharacterSettings />
      <UiSettings />
      <ToneSettings />
      <CoachLearning />
      <TourSettings />
      <ShareLinkCard />
      <ReportControls />
      <DataControls />

    </div>
  );
}

export default ProfilePage;