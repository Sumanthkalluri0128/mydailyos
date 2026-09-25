import { apiFetch } from "./config/api";
import { useEffect, useState } from "react";
import "./App.css";

import FoodPage from "./pages/FoodPage";
import FoodLogger from "./pages/FoodLogger";
import ExercisePage from "./pages/ExercisePage";
import TaskPage from "./pages/TaskPage";
import HabitPage from "./pages/HabitPage";
import WaterPage from "./pages/WaterPage";
import WeightPage from "./pages/WeightPage";
import ProfilePage from "./pages/ProfilePage";
import AccountPage from "./pages/AccountPage";

import { getLocalDate } from "./utils/date";
import { API_URL } from "./config";


function App() {
  const [currentPage, setCurrentPage] =
    useState("dashboard");

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
    const fetchDailySummary = async () => {
      try {
        // ======================================================
        // FOOD SUMMARY
        // ======================================================

        const foodResponse = await apiFetch(
          `${API_URL}/api/food-logs/summary?date=${today}`
        );

        const foodData =
          await foodResponse.json();

        if (foodData.success) {
          setDailySummary(
            foodData.summary
          );
        }

        // ======================================================
        // ACTIVITY SUMMARY
        // ======================================================

        const activityResponse =
          await apiFetch(
            `${API_URL}/api/activities/summary?date=${today}`
          );

        const activityData =
          await activityResponse.json();

        if (activityData.success) {
          setActivitySummary(
            activityData.summary
          );
        }

        // ======================================================
        // TASKS
        // ======================================================

        const taskResponse = await apiFetch(
          `${API_URL}/api/tasks?date=${today}`
        );

        const taskData =
          await taskResponse.json();

        if (taskData.success) {
          setTasks(taskData.tasks);
        }

        // ======================================================
        // HABITS
        // ======================================================

        const habitResponse = await apiFetch(
          `${API_URL}/api/habits`
        );

        const habitData =
          await habitResponse.json();

        if (habitData.success) {
          setHabits(habitData.habits);
        }

        const habitLogResponse =
          await apiFetch(
            `${API_URL}/api/habits/logs?date=${today}`
          );

        const habitLogData =
          await habitLogResponse.json();

        if (habitLogData.success) {
          setHabitLogs(
            habitLogData.logs
          );
        }

        // ======================================================
        // WATER
        // ======================================================

        const waterResponse = await apiFetch(
          `${API_URL}/api/water?date=${today}`
        );

        const waterData =
          await waterResponse.json();

        if (waterData.success) {
          setWaterSummary({
            totalMl: waterData.totalMl,
            totalLiters:
              waterData.totalLiters,
          });
        }

        // ======================================================
        // WEIGHT HISTORY
        // ======================================================

        const weightResponse = await apiFetch(
          `${API_URL}/api/weight`
        );

        const weightData =
          await weightResponse.json();

        if (weightData.success) {
          setWeightHistory(
            weightData.logs || []
          );
        }

        // ======================================================
        // PROFILE
        // ======================================================
        // Profile is the source of truth for the
        // Dashboard current weight.

        const profileResponse = await apiFetch(
          `${API_URL}/api/profile`
        );

        const profileData =
          await profileResponse.json();

        if (profileData.success) {
          const currentProfile =
            profileData.profile;

          setProfile(currentProfile);

          if (
            currentProfile.currentWeightKg !==
              null &&
            currentProfile.currentWeightKg !==
              undefined
          ) {
            setLatestWeight(
              currentProfile.currentWeightKg
            );
          } else {
            setLatestWeight(null);
          }
        }

      } catch (error) {
        console.error(
          "Failed to fetch dashboard data:",
          error
        );
      }
    };

    fetchDailySummary();
  }, [today, currentPage]);

  // ============================================================
  // FOOD LOGGER PAGE
  // ============================================================

  if (currentPage === "foodLogger") {
    return (
      <div className="app">

        <header className="topbar">
          <button
  className="brand-button"
  onClick={() => setCurrentPage("home")}
  aria-label="Go to Home"
>
  <div className="brand-icon">✦</div>
  <div>
    <div className="brand-title">MyDailyOS</div>
    <div className="brand-subtitle">
      Your daily health & productivity tracker
    </div>
  </div>
</button>
        </header>

        <main className="dashboard">
          <FoodLogger
            date={today}
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
        </main>

      </div>
    );
  }

  // ============================================================
  // EXERCISE PAGE
  // ============================================================

  if (currentPage === "exercise") {
    return (
      <div className="app">

        <header className="topbar">
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <ExercisePage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <TaskPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <HabitPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <WaterPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <WeightPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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
          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>
        </header>

        <main className="dashboard">
          <AccountPage
            onBack={() =>
              setCurrentPage("dashboard")
            }
          />
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

          <div>
            <h1>MyDailyOS</h1>

            <p>
              Your daily health & productivity tracker
            </p>
          </div>

          <button
            className="secondary-button"
            onClick={() =>
              setCurrentPage("dashboard")
            }
          >
            ← Dashboard
          </button>

        </header>

        <main className="dashboard">
          <FoodPage />
        </main>

      </div>
    );
  }

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

        <div>
          <h1>MyDailyOS</h1>

          <p>
            Your daily health & productivity tracker
          </p>
        </div>

        <div className="profile">

          <button
            className="profile-avatar"
            onClick={() =>
              setCurrentPage("profile")
            }
          >
            S
          </button>

        </div>

      </header>

      <main className="dashboard">

        {/* ==================================================== */}
        {/* WELCOME */}
        {/* ==================================================== */}

        <section className="welcome">

          <div>

            <p className="date">
  {new Date(`${today}T00:00:00`).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  )}
</p>

            <h2>
              Good morning 👋
            </h2>

            <p>
              Let's make today productive.
            </p>

          </div>

        </section>

        {/* ==================================================== */}
        {/* STATS */}
        {/* ==================================================== */}

        <section className="stats-grid">

          {/* ================================================== */}
          {/* CALORIES */}
          {/* ================================================== */}

          <div className="card">

            <span className="card-icon">
              🍽️
            </span>

            <p>
              Calories
            </p>

            <h3>
              {Math.round(
                dailySummary.calories
              )}

              <small>
                {" "}
                /{" "}
                {profile?.goals?.calorieTarget ??
                  1800}{" "}
                kcal
              </small>
            </h3>

            <div className="progress-bar">

              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(
                    (
                      dailySummary.calories /
                      (
                        profile?.goals
                          ?.calorieTarget ??
                        1800
                      )
                    ) * 100,
                    100
                  )}%`,
                }}
              ></div>

            </div>

          </div>

          {/* ================================================== */}
          {/* PROTEIN */}
          {/* ================================================== */}

          <div className="card">

            <span className="card-icon">
              🥩
            </span>

            <p>
              Protein
            </p>

            <h3>
              {dailySummary.protein.toFixed(1)}

              <small>
                {" "}
                /{" "}
                {profile?.goals?.proteinTarget ??
                  140}{" "}
                g
              </small>
            </h3>

            <div className="progress-bar">

              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(
                    (
                      dailySummary.protein /
                      (
                        profile?.goals
                          ?.proteinTarget ??
                        140
                      )
                    ) * 100,
                    100
                  )}%`,
                }}
              ></div>

            </div>

          </div>

          {/* ================================================== */}
          {/* CALORIES BURNED */}
          {/* ================================================== */}

          <div className="card">

            <span className="card-icon">
              🔥
            </span>

            <p>
              Calories Burned
            </p>

            <h3>
              {Math.round(
                activitySummary.caloriesBurned
              )}

              <small>
                {" "}
                kcal
              </small>
            </h3>

            <div className="card-description">

              {activitySummary.totalMinutes >
              0
                ? `${activitySummary.totalMinutes} min of activity`
                : "No activity recorded"}

            </div>

          </div>

          {/* ================================================== */}
          {/* STEPS */}
          {/* ================================================== */}

          <div className="card">

            <span className="card-icon">
              🚶
            </span>

            <p>
              Steps
            </p>

            <h3>
              0{" "}

              <small>
                /{" "}
                {(
                  profile?.goals?.stepsTarget ??
                  10000
                ).toLocaleString()}
              </small>
            </h3>

            <div className="progress">

              <div className="progress-fill steps"></div>

            </div>

          </div>

          {/* ================================================== */}
          {/* WATER */}
          {/* ================================================== */}

          <div
            className="card"
            onClick={() =>
              setCurrentPage("water")
            }
            style={{
              cursor: "pointer",
            }}
          >

            <span className="card-icon">
              💧
            </span>

            <p>
              Water
            </p>

            <h3>

              {waterSummary.totalLiters.toFixed(
                2
              )}

              <small>
                {" "}
                /{" "}
                {(
                  (
                    profile?.goals
                      ?.waterTargetMl ??
                    3000
                  ) / 1000
                ).toFixed(1)}{" "}
                L
              </small>

            </h3>

            <div className="progress-bar">

              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(
                    (
                      waterSummary.totalMl /
                      (
                        profile?.goals
                          ?.waterTargetMl ??
                        3000
                      )
                    ) * 100,
                    100
                  )}%`,
                }}
              ></div>

            </div>

            <div className="card-description">

              {waterSummary.totalMl.toLocaleString()}{" "}
              ml consumed

            </div>

          </div>

          {/* ================================================== */}
          {/* WEIGHT */}
          {/* ================================================== */}

          <div
            className="card"
            onClick={() =>
              setCurrentPage("weight")
            }
            style={{
              cursor: "pointer",
            }}
          >

            <span className="card-icon">
              ⚖️
            </span>

            <p>
              Weight
            </p>

            <h3>

              {latestWeight !== null
                ? Number(
                    latestWeight
                  ).toFixed(1)
                : "--"}

              <small>
                {" "}
                kg
              </small>

            </h3>

            <div className="card-description">

              {latestWeight !== null
                ? "Current profile weight"
                : "No weight recorded"}

            </div>

          </div>

          {/* ================================================== */}
          {/* WEIGHT GOAL */}
          {/* ================================================== */}

          <div className="card">

            <span className="card-icon">
              🎯
            </span>

            <p>
              Weight Goal
            </p>

            {hasWeightGoal ? (

              <>
                <div className="card-description">
                  Starting:{" "}
                  {Number.isFinite(startingWeight)
                    ? startingWeight.toFixed(1)
                    : "--"}{" "}
                  kg
                </div>

                <h3>
                  {currentWeight.toFixed(1)}
                  <small>
                    {" "}
                    current
                  </small>
                </h3>

                <div className="card-description">
                  Target: {targetWeight.toFixed(1)} kg
                </div>

                <div className="progress-bar">

                  <div
                    className="progress-fill"
                    style={{
                      width: `${weightGoalProgress}%`,
                    }}
                  ></div>

                </div>

                <div className="card-description">
                  {weightDirection === "Maintain"
                    ? "Maintain your current weight"
                    : `${remainingWeight.toFixed(
                        1
                      )} kg to ${weightDirection.toLowerCase()}`
                  }
                  {" · "}
                  {Math.round(
                    weightGoalProgress
                  )}
                  % complete
                </div>
              </>

            ) : (

              <div className="card-description">
                Set a target weight in Profile
              </div>

            )}

          </div>

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

          </div>

        </section>

      </main>

    </div>
  );
}

export default App;
