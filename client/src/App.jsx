import { useEffect, useState, Suspense, lazy } from "react";
import { loadTone } from "./utils/coachTone";
import { loadFeatures } from "./utils/features";
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
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const PlannerPage = lazy(() => import("./pages/PlannerPage"));
const RecipesPage = lazy(() => import("./pages/RecipesPage"));
import OnboardingPage from "./pages/OnboardingPage";
import { waterTargetMl } from "./utils/energy";
import { currentOwner } from "./utils/cacheOwner";
import { PageSkeleton } from "./motion/PageTransition";
import { withTransition } from "./motion/motion";
import AppNav from "./components/AppNav";
import CommandPalette from "./components/CommandPalette";
import MedReminderHost from "./components/MedReminderHost";
import "./components/wide.css";
import "./utils/a11yPrefs";
import AssistantPanel from "./components/AssistantPanel";
import HomeDashboard from "./components/home/HomeDashboard";
import TourHost from "./tour/TourHost";
import { queueTour } from "./tour/tourStore";

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

// After the first screen is up, fetch the other pages' code in the background so tapping a tab is instant.
const warmPages = () => Promise.all([
  import("./pages/FoodLogger"), import("./pages/PlannerPage"), import("./pages/ProgressPage"), import("./pages/WaterPage"),
  import("./pages/ExercisePage"), import("./pages/WeightPage"), import("./pages/ProfilePage"),
]).catch(() => {});

function App() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.connection?.saveData) return undefined; // respect Data Saver
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const handle = idle(warmPages);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(handle) : clearTimeout(handle));
  }, []);

  const [currentPage, setCurrentPageRaw] =
    useState("dashboard");
  // Cross-fade between pages with the View Transitions API (falls back to the .fx-page CSS entrance).
  const setCurrentPage = (page) => withTransition(() => setCurrentPageRaw(page));

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
  useEffect(() => { const f = () => setSyncTick((n) => n + 1); window.addEventListener("ff:refresh", f); return () => window.removeEventListener("ff:refresh", f); }, []);

  useEffect(() => {
    const go = (e) => {
      const d = e.detail || {};
      if (d.healthy) { try { sessionStorage.setItem("ff_open_healthy", "1"); } catch { /* ignore */ } window.dispatchEvent(new Event("ff:healthyday")); }
      if (d.fix) { try { sessionStorage.setItem("ff_open_fix", "1"); } catch { /* ignore */ } window.dispatchEvent(new Event("ff:fixday")); }
      if (d.page) setCurrentPage(d.page);
    };
    window.addEventListener("ff:goto", go);
    return () => window.removeEventListener("ff:goto", go);
  }, []);

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

        loadTone(); // coach tone and gentle mode (cached on this device; never blocks)
        loadFeatures(); // simple / advanced mode: which screens are unlocked

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

  // One navigation + the "Ask FlexFit" assistant, shared by every page.
  const openAssistant = (detail) => window.dispatchEvent(new CustomEvent("flexfit:ask", { detail }));
  const shell = (
    <>
      <AppNav
        current={currentPage}
        go={setCurrentPage}
        theme={theme}
        onToggleTheme={toggleTheme}
        avatar={avatarInitial}
        name={(profile?.name || "").split(" ")[0]}
        streak={streak}
        onAsk={() => openAssistant()}
      />
      <AssistantPanel go={setCurrentPage} />
      <CommandPalette go={setCurrentPage} />
      <MedReminderHost />
      <TourHost page={currentPage} go={setCurrentPage} profile={profile} />
    </>
  );

  if (profile && profile.onboarded === false) {
    return (
      <OnboardingPage
        profile={profile}
        onDone={(updated) => {
          queueTour();
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
          <FoodLogger
            date={today}
            goTo={setCurrentPage}
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
        {shell}
        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
            <HealthPage onBack={() => setCurrentPage("dashboard")} />
          </Suspense>
        </main>
      </div>
    );
  }

  if (currentPage === "exercise") {
    return (
      <div className="app">

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

  if (currentPage === "goals") {
    return (
      <div className="app">
        {shell}
        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
          <GoalsPage onBack={() => setCurrentPage("dashboard")} />
        </Suspense>
        </main>
      </div>
    );
  }

  if (currentPage === "progress") {
    return (
      <div className="app">
        {shell}
        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
          <ProgressPage onBack={() => setCurrentPage("dashboard")} />
        </Suspense>
        </main>
      </div>
    );
  }

  if (currentPage === "planner" || currentPage === "recipes") {
    return (
      <div className="app">
        {shell}
        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
            {currentPage === "planner"
              ? <PlannerPage onBack={() => setCurrentPage("dashboard")} goTo={setCurrentPage} />
              : <RecipesPage onBack={() => setCurrentPage("foodLogger")} />}
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

        {shell}

        <main key={currentPage} className="dashboard fx-page">
          <Suspense fallback={<PageSkeleton variant="list" />}>
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

  // ============================================================
  // DASHBOARD
  // ============================================================

  return (
    <div className="app">

      {/* ====================================================== */}
      {/* TOP BAR */}
      {/* ====================================================== */}

      {shell}

      <main key={currentPage} className="dashboard fx-page">

        <HomeDashboard
          profile={profile}
          summary={dailySummary}
          activity={activitySummary}
          water={waterSummary}
          waterTarget={waterTarget}
          latestWeight={latestWeight}
          weightHistory={sortedWeightHistory}
          tasks={tasks}
          setTasks={setTasks}
          habits={habits}
          habitLogs={habitLogs}
          setHabitLogs={setHabitLogs}
          goTo={setCurrentPage}
          onAsk={openAssistant}
          syncTick={syncTick}
          onChanged={() => setSyncTick((t) => t + 1)}
        />

      </main>

    </div>
  );
}

export default App;
