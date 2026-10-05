import { useEffect, useState, Suspense, lazy } from "react";
import "./App.css";

const FoodPage = lazy(() => import("./pages/FoodPage"));
const FoodLogger = lazy(() => import("./pages/FoodLogger"));
const ExercisePage = lazy(() => import("./pages/ExercisePage"));
const TaskPage = lazy(() => import("./pages/TaskPage"));
const HabitPage = lazy(() => import("./pages/HabitPage"));
const WaterPage = lazy(() => import("./pages/WaterPage"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const WeightPage = lazy(() => import("./pages/WeightPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ProgressPage = lazy(() => import("./pages/ProgressPage"));
import OnboardingPage from "./pages/OnboardingPage";
import CalorieBalance from "./components/CalorieBalance";
import { waterTargetMl } from "./utils/energy";
import { currentOwner } from "./utils/cacheOwner";
import DashboardHero from "./components/DashboardHero";
import MacroCard from "./components/MacroCard";

import { getLocalDate } from "./utils/date";
import { apiFetch } from "./config/api";
import { API_URL } from "./config";


const THEME_KEY = "mydailyos_theme";

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage can throw in some privacy modes — fall through.
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}

function BrandHome({ onHome }) {
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onHome();
    }
  };

  return (
    <div
      className="brand-home"
      role="button"
      tabIndex={0}
      onClick={onHome}
      onKeyDown={handleKeyDown}
      aria-label="Go to Home"
    >
      <div className="brand-icon">✦</div>
      <div>
        <div className="brand-title">FlexFit</div>
        <div className="brand-subtitle">
          Your daily health & productivity tracker
        </div>
      </div>
    </div>
  );
}

function App() {
  const [currentPage, setCurrentPage] =
    useState("dashboard");

  // Bumped when changes made offline finish syncing, so the dashboard reloads with the real numbers.
  const [syncTick, setSyncTick] = useState(0);

  // Logging streak for the header chip and the coach line. Optional: the dashboard works without it.
  const [streak, setStreak] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/progress/streaks?today=${getLocalDate()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.streaks) setStreak({ current: d.streaks.current, loggedToday: d.streaks.loggedToday }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [syncTick]);

  useEffect(() => {
    const bump = () => setSyncTick((n) => n + 1);
    window.addEventListener("flexfit:synced", bump);
    return () => window.removeEventListener("flexfit:synced", bump);
  }, []);

  // ============================================================
  // THEME (light / dark)
  // ============================================================

  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Best-effort — a failed write just means the choice won't
      // persist across reloads, which isn't worth surfacing to the user.
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((current) => (current === "dark" ? "light" : "dark"));

  // ============================================================
  // DAILY NUTRITION
  // ============================================================

  const [dailySummary, setDailySummary] = useState({
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,

    meals: {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snacks: 0,
    },
  });

  // ============================================================
  // ACTIVITY
  // ============================================================

  const [activitySummary, setActivitySummary] =
    useState({
      caloriesBurned: 0,
      workoutCalories: 0,
      stepCalories: 0,
      steps: 0,
      totalMinutes: 0,
    });

  // ============================================================
  // TASKS
  // ============================================================

  const [tasks, setTasks] = useState([]);

  // ============================================================
  // HABITS
  // ============================================================

  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);

  // ============================================================
  // WATER
  // ============================================================

  const [waterSummary, setWaterSummary] =
    useState({
      totalMl: 0,
      totalLiters: 0,
    });

  // ============================================================
  // WEIGHT
  // ============================================================

  const [latestWeight, setLatestWeight] =
    useState(null);

  const [weightHistory, setWeightHistory] =
    useState([]);

  // ============================================================
  // PROFILE
  // ============================================================

  const [profile, setProfile] = useState(null);

  // ============================================================
  // TODAY
  // ============================================================

  const today = getLocalDate();

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  useEffect(() => {
    // Paint instantly from the last saved copy (same day only), then refresh from the server below. On a free-tier host
    // the server can take seconds to answer; this makes the dashboard appear immediately instead of sitting empty.
    try {
      const saved = JSON.parse(localStorage.getItem("mydailyos_dash_v1") || "null");
      if (saved && saved.date === today && saved.owner === currentOwner()) {
        if (saved.food) setDailySummary(saved.food);
        if (saved.activity) setActivitySummary(saved.activity);
        if (saved.tasks) setTasks(saved.tasks);
        if (saved.habits) setHabits(saved.habits);
        if (saved.habitLogs) setHabitLogs(saved.habitLogs);
        if (saved.water) setWaterSummary(saved.water);
        if (saved.weight) setWeightHistory(saved.weight);
        if (saved.profile) { setProfile(saved.profile); setLatestWeight(saved.profile.currentWeightKg ?? null); }
      }
    } catch { /* ignore a corrupt cache */ }

    const fetchDailySummary = async () => {
      try {
        // ======================================================
        // Every dashboard section used to be fetched one after
        // another with sequential `await`s -- seven round trips
        // back-to-back, each one waiting on the last to finish.
        // On a real network that's the single biggest cause of a
        // slow dashboard load. Firing them together with
        // Promise.all lets the browser run all seven requests at
        // once, so total load time is roughly the slowest single
        // request instead of the sum of all of them.
        // ======================================================

        const [
          foodResponse,
          activityResponse,
          taskResponse,
          habitResponse,
          habitLogResponse,
          waterResponse,
          weightResponse,
          profileResponse,
        ] = await Promise.all([
          apiFetch(`${API_URL}/api/food-logs/summary?date=${today}`),
          apiFetch(`${API_URL}/api/activities/summary?date=${today}`),
          apiFetch(`${API_URL}/api/tasks?date=${today}`),
          apiFetch(`${API_URL}/api/habits`),
          apiFetch(`${API_URL}/api/habits/logs?date=${today}`),
          apiFetch(`${API_URL}/api/water?date=${today}`),
          apiFetch(`${API_URL}/api/weight`),
          apiFetch(`${API_URL}/api/profile`),
        ]);

        const [
          foodData,
          activityData,
          taskData,
          habitData,
          habitLogData,
          waterData,
          weightData,
          profileData,
        ] = await Promise.all([
          foodResponse.json(),
          activityResponse.json(),
          taskResponse.json(),
          habitResponse.json(),
          habitLogResponse.json(),
          waterResponse.json(),
          weightResponse.json(),
          profileResponse.json(),
        ]);

        if (foodData.success) {
          setDailySummary(foodData.summary);
        }

        if (activityData.success) {
          setActivitySummary(activityData.summary);
        }

        if (taskData.success) {
          setTasks(taskData.tasks);
        }

        if (habitData.success) {
          setHabits(habitData.habits);
        }

        if (habitLogData.success) {
          setHabitLogs(habitLogData.logs);
        }

        if (waterData.success) {
          setWaterSummary({
            totalMl: waterData.totalMl,
            totalLiters: waterData.totalLiters,
          });
        }

        if (weightData.success) {
          setWeightHistory(weightData.logs || []);
        }

        // Profile is the source of truth for the Dashboard
        // current weight.
        if (profileData.success) {
          const currentProfile = profileData.profile;

          setProfile(currentProfile);

          if (
            currentProfile.currentWeightKg !== null &&
            currentProfile.currentWeightKg !== undefined
          ) {
            setLatestWeight(currentProfile.currentWeightKg);
          } else {
            setLatestWeight(null);
          }
        }

        try {
          localStorage.setItem("mydailyos_dash_v1", JSON.stringify({
            date: today,
            owner: currentOwner(),
            food: foodData.success ? foodData.summary : undefined,
            activity: activityData.success ? activityData.summary : undefined,
            tasks: taskData.success ? taskData.tasks : undefined,
            habits: habitData.success ? habitData.habits : undefined,
            habitLogs: habitLogData.success ? habitLogData.logs : undefined,
            water: waterData.success ? { totalMl: waterData.totalMl, totalLiters: waterData.totalLiters } : undefined,
            weight: weightData.success ? (weightData.logs || []) : undefined,
            profile: profileData.success ? profileData.profile : undefined,
          }));
        } catch { /* storage full / private mode */ }
      } catch (error) {
        console.error(
          "Failed to fetch dashboard data:",
          error
        );
      }
    };

    fetchDailySummary();
  }, [today, currentPage, syncTick]);

  // ============================================================
  // FIRST-RUN ONBOARDING + AVATAR INITIAL
  // ============================================================

  const avatarInitial = (profile?.name || "").trim().charAt(0).toUpperCase() || "?";

  if (profile && profile.onboarded === false) {
    return (
      <OnboardingPage
        profile={profile}
        onDone={(updated) => {
          setProfile(updated);
          try {
            const saved = JSON.parse(localStorage.getItem("mydailyos_dash_v1") || "null");
            if (saved) localStorage.setItem("mydailyos_dash_v1", JSON.stringify({ ...saved, profile: updated }));
          } catch { /* ignore */ }
        }}
      />
    );
  }

  // ============================================================
  // FOOD LOGGER PAGE
  // ============================================================

  if (currentPage === "foodLogger") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <FoodLogger
            date={today}
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // EXERCISE PAGE
  // ============================================================

  if (currentPage === "health") {
    return (
      <div className="app">
        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
            <HealthPage onBack={() => setCurrentPage("dashboard")} />
          </Suspense>
        </main>
      </div>
    );
  }

  if (currentPage === "exercise") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <ExercisePage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // TASK PAGE
  // ============================================================

  if (currentPage === "task") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <TaskPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // HABIT PAGE
  // ============================================================

  if (currentPage === "habit") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <HabitPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // WATER PAGE
  // ============================================================

  if (currentPage === "water") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <WaterPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // WEIGHT PAGE
  // ============================================================

  if (currentPage === "weight") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <WeightPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // PROFILE PAGE
  // ============================================================

  if (currentPage === "profile") {
    return (
      <div className="app">

        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <ProfilePage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </Suspense>
        </main>

      </div>
    );
  }

  // ============================================================
  // PROGRESS PAGE
  // ============================================================

  if (currentPage === "progress") {
    return (
      <div className="app">
        <header className="topbar">
          <BrandHome onHome={() => setCurrentPage("dashboard")} />
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <ProgressPage onBack={() => setCurrentPage("dashboard")} />
        </Suspense>
        </main>
      </div>
    );
  }

  // ============================================================
  // FOOD PAGE
  // ============================================================

  if (currentPage === "food") {
    return (
      <div className="app">

        <header className="topbar">

          <BrandHome onHome={() => setCurrentPage("dashboard")} />

          <button
            className="secondary-button"
            onClick={() =>
              setCurrentPage("dashboard")
            }
          >
            ← Dashboard
          </button>

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

        </header>

        <main className="dashboard">
          <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <FoodPage />
        </Suspense>
        </main>

      </div>
    );
  }

  // Targets follow body weight when it is known; saved goals are the fallback.
  // The calorie budget, ring and plan all come from the one shared model (DashboardHero / CalorieBalance).

  const waterTarget =
    waterTargetMl(profile?.currentWeightKg) ??
    profile?.goals?.waterTargetMl ??
    3000;

  // ============================================================
  // WEIGHT GOAL CALCULATIONS
  // ============================================================

  const currentWeight =
    profile?.currentWeightKg !== null &&
    profile?.currentWeightKg !== undefined
      ? Number(profile.currentWeightKg)
      : null;

  const targetWeight =
    profile?.goals?.targetWeightKg !== null &&
    profile?.goals?.targetWeightKg !== undefined
      ? Number(profile.goals.targetWeightKg)
      : null;

  const sortedWeightHistory = [
    ...weightHistory,
  ].sort((a, b) => {
    const dateComparison =
      String(a.date).localeCompare(String(b.date));

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return (
      new Date(a.createdAt || 0) -
      new Date(b.createdAt || 0)
    );
  });

  const startingWeight =
    sortedWeightHistory.length > 0
      ? Number(sortedWeightHistory[0].weightKg)
      : currentWeight;

  const hasWeightGoal =
    Number.isFinite(currentWeight) &&
    Number.isFinite(targetWeight) &&
    targetWeight > 0;

  const weightDirection = hasWeightGoal
    ? targetWeight < currentWeight
      ? "Lose"
      : targetWeight > currentWeight
      ? "Gain"
      : "Maintain"
    : null;

  const remainingWeight = hasWeightGoal
    ? Math.abs(currentWeight - targetWeight)
    : null;

  const totalGoalDistance =
    hasWeightGoal &&
    Number.isFinite(startingWeight)
      ? Math.abs(startingWeight - targetWeight)
      : null;

  const completedGoalDistance =
    hasWeightGoal &&
    Number.isFinite(startingWeight)
      ? weightDirection === "Lose"
        ? startingWeight - currentWeight
        : weightDirection === "Gain"
        ? currentWeight - startingWeight
        : 0
      : null;

  const weightGoalProgress =
    hasWeightGoal &&
    totalGoalDistance !== null &&
    totalGoalDistance > 0
      ? Math.min(
          Math.max(
            (completedGoalDistance /
              totalGoalDistance) *
              100,
            0
          ),
          100
        )
      : hasWeightGoal
      ? 100
      : 0;

  // ============================================================
  // DASHBOARD
  // ============================================================

  return (
    <div className="app">

      {/* ====================================================== */}
      {/* TOP BAR */}
      {/* ====================================================== */}

      <header className="topbar">

        <BrandHome onHome={() => setCurrentPage("dashboard")} />

        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          <button
            className={`topbar-progress ${currentPage === "progress" ? "active" : ""}`}
            onClick={() => setCurrentPage("progress")}
            aria-label="Open Progress and History"
          >
            <span>📈</span>
            <span>Progress</span>
          </button>

          <div className="profile">
            <button
              className="profile-avatar"
              onClick={() => setCurrentPage("profile")}
              aria-label="Open profile"
              title={profile?.name || ""}
            >
              {avatarInitial}
            </button>
          </div>
        </div>

      </header>

      <main className="dashboard">

        {/* ==================================================== */}
        {/* WELCOME */}
        {/* ==================================================== */}

        <DashboardHero
          profile={profile}
          today={today}
          summary={dailySummary}
          activity={activitySummary}
          water={waterSummary}
          waterTarget={waterTarget}
          goTo={setCurrentPage}
          onChanged={() => setSyncTick((t) => t + 1)}
          streak={streak}
        />

        <section className="stats-grid two">

          <MacroCard profile={profile} summary={dailySummary} />

          {/* One weight card: where you are, and (if you set one) how far along your goal is. */}
          <div className="card weight-card" onClick={() => setCurrentPage("weight")} style={{ cursor: "pointer" }}>
            <span className="card-icon">⚖️</span>
            <p>Weight</p>
            <h3>
              {latestWeight !== null ? Number(latestWeight).toFixed(1) : "--"}
              <small> kg</small>
            </h3>
            {hasWeightGoal ? (
              <>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${weightGoalProgress}%` }}></div>
                </div>
                <div className="card-description">
                  {weightDirection === "Maintain"
                    ? "Maintaining your weight"
                    : `${remainingWeight.toFixed(1)} kg to ${weightDirection.toLowerCase()} · target ${targetWeight.toFixed(1)} kg`}
                  {" · "}{Math.round(weightGoalProgress)}% there
                </div>
              </>
            ) : (
              <div className="card-description">{latestWeight !== null ? "Set a target weight in Profile to track your goal" : "No weight recorded yet"}</div>
            )}
          </div>

          <CalorieBalance
            collapsible
            showProgress={false}
            refreshKey={`${Math.round(dailySummary.calories)}|${Math.round(activitySummary.caloriesBurned || 0)}|${activitySummary.steps || 0}|${profile?.goals?.calorieMode || ""}${profile?.goals?.calorieTarget || ""}${profile?.goals?.weeklyPaceKg || ""}`}
          />

        </section>

        {/* ==================================================== */}
        {/* MAIN GRID */}
        {/* ==================================================== */}

        <section className="main-grid">

          {/* ================================================== */}
          {/* TODAY'S NUTRITION */}
          {/* ================================================== */}

          <div className="large-card">

            <div className="section-header">

              <div>

                <h2>
                  Today's Nutrition
                </h2>

                <p>
                  Track everything you eat today.
                </p>

              </div>

              <button
                className="primary-button"
                onClick={() =>
                  setCurrentPage("foodLogger")
                }
              >
                + Add Food
              </button>

            </div>

            <div className="meal-list">

              <div className="meal">

                <div>

                  <strong>
                    Breakfast
                  </strong>

                  <span>
                    {dailySummary.meals
                      .breakfast > 0
                      ? "Food added"
                      : "No food added"}
                  </span>

                </div>

                <b>
                  {Math.round(
                    dailySummary.meals
                      .breakfast
                  )}{" "}
                  kcal
                </b>

              </div>

              <div className="meal">

                <div>

                  <strong>
                    Lunch
                  </strong>

                  <span>
                    {dailySummary.meals
                      .lunch > 0
                      ? "Food added"
                      : "No food added"}
                  </span>

                </div>

                <b>
                  {Math.round(
                    dailySummary.meals
                      .lunch
                  )}{" "}
                  kcal
                </b>

              </div>

              <div className="meal">

                <div>

                  <strong>
                    Dinner
                  </strong>

                  <span>
                    {dailySummary.meals
                      .dinner > 0
                      ? "Food added"
                      : "No food added"}
                  </span>

                </div>

                <b>
                  {Math.round(
                    dailySummary.meals
                      .dinner
                  )}{" "}
                  kcal
                </b>

              </div>

              <div className="meal">

                <div>

                  <strong>
                    Snacks
                  </strong>

                  <span>
                    {dailySummary.meals
                      .snacks > 0
                      ? "Food added"
                      : "No food added"}
                  </span>

                </div>

                <b>
                  {Math.round(
                    dailySummary.meals
                      .snacks
                  )}{" "}
                  kcal
                </b>

              </div>

            </div>

          </div>

          {/* ================================================== */}
          {/* TODAY'S HABITS */}
          {/* ================================================== */}

          <div className="large-card">

            <div className="section-header">

              <div>

                <h2>
                  Today's Habits
                </h2>

                <p>
                  Keep your daily habits consistent.
                </p>

              </div>

              <button
                className="secondary-button"
                onClick={() =>
                  setCurrentPage("habit")
                }
              >
                + Habit
              </button>

            </div>

            <div className="tasks">

              {habits.length === 0 ? (

                <p>
                  No habits created yet.
                </p>

              ) : (

                habits.map((habit) => {

                  const log =
                    habitLogs.find(
                      (item) =>
                        item.habitId ===
                        habit._id
                    );

                  const currentValue =
                    log?.completedValue || 0;

                  const completed =
                    log?.completed || false;

                  return (
                    <div
                      className="task"
                      key={habit._id}
                    >

                      <input
                        type="checkbox"
                        checked={completed}
                        onChange={async () => {

                          try {

                            const response =
                              await apiFetch(
                                `${API_URL}/api/habits/logs`,
                                {
                                  method: "POST",

                                  headers: {
                                    "Content-Type":
                                      "application/json",
                                  },

                                  body:
                                    JSON.stringify({
                                      habitId:
                                        habit._id,

                                      date: today,

                                      completedValue:
                                        completed
                                          ? 0
                                          : habit.target,
                                    }),
                                }
                              );

                            const data =
                              await response.json();

                            if (data.success) {

                              setHabitLogs(
                                (previous) => {

                                  const existing =
                                    previous.find(
                                      (item) =>
                                        item.habitId ===
                                        habit._id
                                    );

                                  if (existing) {

                                    return previous.map(
                                      (item) =>
                                        item.habitId ===
                                        habit._id
                                          ? data.log
                                          : item
                                    );

                                  }

                                  return [
                                    ...previous,
                                    data.log,
                                  ];
                                }
                              );

                            }

                          } catch (error) {

                            console.error(
                              "Failed to update habit:",
                              error
                            );

                          }

                        }}
                      />

                      <span>

                        {habit.name}
                        {" — "}
                        {currentValue} /{" "}
                        {habit.target}{" "}
                        {habit.unit}

                      </span>

                    </div>
                  );
                })
              )}

            </div>

          </div>

          {/* ================================================== */}
          {/* TODAY'S TASKS */}
          {/* ================================================== */}

          <div className="large-card">

            <div className="section-header">

              <div>

                <h2>
                  Today's Tasks
                </h2>

                <p>
                  Stay on top of your day.
                </p>

              </div>

              <button
                className="secondary-button"
                onClick={() =>
                  setCurrentPage("task")
                }
              >
                + Task
              </button>

            </div>

            <div className="tasks">

              {tasks.length === 0 ? (

                <p>
                  No tasks for today.
                </p>

              ) : (

                tasks.map((task) => (

                  <div
                    className={`task ${
                      task.completed
                        ? "completed"
                        : ""
                    }`}
                    key={task._id}
                  >

                    <input
                      type="checkbox"
                      checked={
                        task.completed
                      }
                      onChange={async () => {

                        try {

                          const response =
                            await apiFetch(
                              `${API_URL}/api/tasks/${task._id}/toggle`,
                              {
                                method: "PATCH",
                              }
                            );

                          const data =
                            await response.json();

                          if (data.success) {

                            setTasks(
                              (previousTasks) =>
                                previousTasks.map(
                                  (item) =>
                                    item._id ===
                                    task._id
                                      ? {
                                          ...item,
                                          completed:
                                            data
                                              .task
                                              .completed,
                                        }
                                      : item
                                )
                            );

                          }

                        } catch (error) {

                          console.error(
                            "Failed to toggle task:",
                            error
                          );

                        }

                      }}
                    />

                    <span>
                      {task.title}
                    </span>

                  </div>

                ))
              )}

            </div>

          </div>

        </section>

        {/* ==================================================== */}
        {/* QUICK ACTIONS */}
        {/* ==================================================== */}

        <section className="quick-actions">

          <h2>
            Quick Add
          </h2>

          <div className="quick-grid">

            <button
              onClick={() =>
                setCurrentPage("foodLogger")
              }
            >
              🍽️
              <span>
                Food
              </span>
            </button>

            <button
              onClick={() =>
                setCurrentPage("exercise")
              }
            >
              🔥
              <span>
                Exercise
              </span>
            </button>

            <button
              onClick={() =>
                setCurrentPage("water")
              }
            >
              💧
              <span>
                Water
              </span>
            </button>

            <button onClick={() => setCurrentPage("health")}>
              👟
              <span>Health &amp; Steps</span>
            </button>

            <button
              onClick={() =>
                setCurrentPage("weight")
              }
            >
              ⚖️
              <span>
                Weight
              </span>
            </button>

            <button
              onClick={() =>
                setCurrentPage("task")
              }
            >
              📋
              <span>
                Task
              </span>
            </button>

            <button
              onClick={() =>
                setCurrentPage("habit")
              }
            >
              🔁
              <span>
                Habit
              </span>
            </button>

            <button
              className="progress-quick-action"
              onClick={() =>
                setCurrentPage("progress")
              }
            >
              📈
              <span>
                Progress
              </span>
            </button>

          </div>

        </section>

      </main>

    </div>
  );
}

export default App;
