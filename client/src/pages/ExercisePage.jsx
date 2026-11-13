import { confirmAction } from "../utils/confirm";
import { undoGate } from "../utils/undo";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { estimateBurn } from "../utils/energy";
import Training from "../components/Training";
// ONE logger for everything you do: the same screen as the Gym log (sets x reps x weight for lifts, seconds for holds, minutes + pace for cardio).
// What you log here lands in the Gym log and is counted once in Exercise and Home (utils/gymSyncRunner.js), so nothing is entered twice.
import { LogTab } from "./GymLogPage";

function ExercisePage({ onBack }) {
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState([]);

  const [selectedActivity, setSelectedActivity] =
    useState("");

  const [duration, setDuration] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [calories, setCalories] = useState(""); // optional: calories burned typed by the person
  const [history, setHistory] = useState([]);
  const [historyDays, setHistoryDays] = useState(14);
  const [profileWeight, setProfileWeight] = useState(null);

  const [loading, setLoading] = useState(false);

  // Local date (the old UTC date was a day behind early in the morning in India).
  const today = getLocalDate();
  const dayOffset = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const pad = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // ============================================================
  // FETCH ACTIVITIES
  // ============================================================

  const fetchActivities = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/activities`
      );

      const data = await response.json();

      if (data.success) {
        setActivities(data.activities);
      }
    } catch (error) {
      console.error(
        "Failed to fetch activities:",
        error
      );
    }
  };

  // ============================================================
  // FETCH TODAY'S LOGS
  // ============================================================

  const fetchLogs = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/activities/logs?date=${today}`
      );

      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
      }
    } catch (error) {
      console.error(
        "Failed to fetch activity logs:",
        error
      );
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/activities/logs?from=${dayOffset(-(historyDays - 1))}&to=${today}`
      );
      const data = await response.json();
      if (data.success) setHistory(data.logs);
    } catch (error) {
      console.error("Failed to fetch exercise history:", error);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchLogs();
    (async () => {
      try {
        const r = await apiFetch(`${API_URL}/api/profile`);
        const d = await r.json();
        if (d.success && d.profile?.currentWeightKg) {
          setProfileWeight(Number(d.profile.currentWeightKg));
          setWeight((w) => w || String(d.profile.currentWeightKg));
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      }
    })();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [historyDays]);

  // A gym log exercise just reached the server (utils/gymSyncRunner.js): show it here with its calories.
  useEffect(() => {
    const reload = () => { fetchLogs(); fetchHistory(); };
    window.addEventListener("ff:refresh", reload);
    return () => window.removeEventListener("ff:refresh", reload);
  }, [historyDays]);

  // ============================================================
  // LOG ACTIVITY
  // ============================================================

  const handleAddActivity = async (event) => {
    event.preventDefault();

    if (!selectedActivity) {
      notify("Please select an activity.", "error");
      return;
    }

    if (!duration || Number(duration) <= 0) {
      notify("Please enter a valid duration.", "error");
      return;
    }

    if (calories !== "" && !(Number(calories) >= 0)) {
      notify("Calories burned must be a number (or leave it blank).", "error");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(
        `${API_URL}/api/activities/logs`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            activityId: selectedActivity,
            date: today,
            durationMinutes: Number(duration),
            weightKg: Number(weight) || undefined,
            // blank -> the server estimates it from MET x weight x time
            caloriesBurned: calories === "" ? undefined : Number(calories),
            notes,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        notify(
          data.message ||
            "Failed to add activity."
        , "error");

        return;
      }

      // Clear form
      setSelectedActivity("");
      setDuration("");
      setNotes("");
      setCalories("");

      // Refresh today's activities + history
      fetchLogs();
      fetchHistory();

    } catch (error) {
      console.error(error);

      notify(
        "Could not connect to the backend."
      , "error");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // DELETE ACTIVITY
  // ============================================================

  const handleDelete = async (id) => {
    const go = await undoGate({ what: "Activity", hide: () => setLogs((cur) => cur.filter((x) => x._id !== id)), restore: () => fetchLogs() });
    if (!go) return;

    try {
      const response = await apiFetch(
        `${API_URL}/api/activities/logs/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        fetchLogs();
        fetchHistory();
      } else {
        notify(
          data.message ||
            "Failed to delete activity."
        , "error");
      }
    } catch (error) {
      console.error(error);

      notify(
        "Could not connect to the backend."
      , "error");
    }
  };

  // ============================================================
  // TOTAL CALORIES
  // ============================================================

  // A row with source "gymlog" is the server copy of an exercise you logged above (same entry, same calories). The logger shows it with its sets
  // and lets you edit or delete it, so this list keeps only the rest (typed by time, Health Connect, finished workouts). Totals still count every row once.
  const otherLogs = logs.filter((l) => l.source !== "gymlog");
  const totalCalories = logs.reduce(
    (total, log) =>
      total +
      Number(log.caloriesBurned || 0),
    0
  );

  const totalMinutes = logs.reduce(
    (total, log) =>
      total +
      Number(log.durationMinutes || 0),
    0
  );

  // Dropdown order: everyday movement and gym first, then classes and sports, A-Z inside each group (was one long A-Z list).
  const CAT_FIRST = ["Strength", "Walking", "Running", "Cycling", "Cardio", "HIIT", "Swimming", "Mind & Mobility", "Cult.fit", "Sports", "Outdoor"];
  const groupedActivities = (() => {
    const m = new Map();
    for (const a of activities) { const c = a.category || "Other"; if (!m.has(c)) m.set(c, []); m.get(c).push(a); }
    const rank = (c) => { const i = CAT_FIRST.indexOf(c); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
      .map(([c, l]) => [c, [...l].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))]);
  })();
  const chosen = activities.find((a) => a._id === selectedActivity);
  const estimate =
    chosen && Number(duration) > 0
      ? estimateBurn(chosen.met, Number(weight) || profileWeight || 70, Number(duration))
      : 0;

  const byDay = history.reduce((m, log) => {
    (m[log.date] = m[log.date] || []).push(log);
    return m;
  }, {});
  const historyDates = Object.keys(byDay).sort().reverse();
  const historyCalories = history.reduce((t, l) => t + Number(l.caloriesBurned || 0), 0);

  return (
    <div className="exercise-page">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="page-header">

        <div>
          <div className="bd-head"><h1>Exercise</h1><Buddy who="goku" scene="lift" size={76} says="Let's lift!" /></div>

          <p>
            Track your activities and calories burned.
          </p>
        </div>

        <button
          className="secondary-button"
          onClick={onBack}
        >
          ← Dashboard
        </button>

      </div>



      {/* ======================================================
          TODAY SUMMARY
      ====================================================== */}

      <div className="exercise-summary-grid">

        <div className="card">
          <span className="card-icon">
            🔥
          </span>

          <p>Calories Burned</p>

          <h3>
            {Math.round(totalCalories)}
            <small> kcal</small>
          </h3>
        </div>


        <div className="card">
          <span className="card-icon">
            ⏱️
          </span>

          <p>Exercise Time</p>

          <h3>
            {totalMinutes}
            <small> min</small>
          </h3>
        </div>


        <div className="card">
          <span className="card-icon">
            🏃
          </span>

          <p>Activities</p>

          <h3>
            {logs.length}
          </h3>
        </div>

      </div>


      {/* ======================================================
          LOG AN EXERCISE (the same logger as the Gym log: the form follows the exercise you pick)
      ====================================================== */}

      <div className="large-card">
        <div className="section-header">
          <div>
            <h2>Log an exercise</h2>
            <p>Lifts take sets, reps and weight. Holds take seconds. Cardio takes minutes and pace. Pick one and the form changes to match.</p>
          </div>
        </div>
        <LogTab />
      </div>

      <Training activities={activities} onLogged={fetchLogs} />

      <details className="large-card exercise-time-only">
        <summary><strong>Log by time only</strong> <span className="md-sub">yoga, sports, anything without sets</span></summary>
        <div>

        <div className="section-header">

          <div>
            <h2>Add by time</h2>

            <p>
              Enter how long you did it.
            </p>
          </div>

        </div>


        <form
          className="exercise-form"
          onSubmit={handleAddActivity}
        >

          {/* Activity */}

          <div className="form-group">

            <label>
              Activity
            </label>

            <select
              value={selectedActivity}
              onChange={(event) =>
                setSelectedActivity(
                  event.target.value
                )
              }
            >

              <option value="">
                Select an activity
              </option>

              {groupedActivities.map(([category, list]) => (
                <optgroup key={category} label={category}>
                  {list.map((activity) => (
                    <option key={activity._id} value={activity._id}>{activity.name}</option>
                  ))}
                </optgroup>
              ))}

            </select>

          </div>


          {/* Duration */}

          <div className="form-group">

            <label>
              Duration
            </label>

            <div className="input-with-unit">

              <input
                type="number"
                min="1"
                placeholder="45"
                value={duration}
                onChange={(event) =>
                  setDuration(
                    event.target.value
                  )
                }
              />

              <span>
                minutes
              </span>

            </div>

          </div>


          {/* Weight */}

          <div className="form-group">

            <label>
              Weight
            </label>

            <div className="input-with-unit">

              <input
                type="number"
                min="1"
                step="0.1"
                placeholder="82"
                value={weight}
                onChange={(event) =>
                  setWeight(
                    event.target.value
                  )
                }
              />

              <span>
                kg
              </span>

            </div>

          </div>


          {/* Calories burned */}

          <div className="form-group">

            <label>
              Calories burned (optional)
            </label>

            <div className="input-with-unit">

              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder={
                  estimate
                    ? `Auto: about ${Math.round(estimate)}`
                    : "Leave blank to auto-estimate"
                }
                value={calories}
                onChange={(event) =>
                  setCalories(event.target.value)
                }
              />

              <span>kcal</span>

            </div>

            {estimate > 0 && calories === "" && (
              <small>
                Estimated {Math.round(estimate)} kcal for {chosen.name} ·{" "}
                {duration} min. Type your own number (e.g. from a watch) to override it.
              </small>
            )}

          </div>


          {/* Notes */}

          <div className="form-group">

            <label>
              Notes
            </label>

            <textarea
              placeholder="Optional notes"
              value={notes}
              onChange={(event) =>
                setNotes(
                  event.target.value
                )
              }
            />

          </div>


          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Saving..."
              : "Add Exercise"}
          </button>

        </form>

      </div>


      </details>

      {/* ======================================================
          TODAY'S ACTIVITIES
      ====================================================== */}

      <div className="large-card">

        <div className="section-header">

          <div>
            <h2>
              Today's Activities
            </h2>

            <p>
              {otherLogs.length} other activit{otherLogs.length === 1 ? "y" : "ies"} today. Exercises you log above are listed in the logger.
            </p>
          </div>

        </div>


        {logs.length === 0 ? (

          <BuddyEmpty scene="sad" title="No exercise yet today">
            Even 10 minutes counts. Add your first activity above and I will cheer you on!
          </BuddyEmpty>

        ) : otherLogs.length === 0 ? (

          <p className="md-sub">Nothing else today. Your logged exercises are in the logger above.</p>

        ) : (

          <div className="activity-list">

            {otherLogs.map((log) => (

              <div
                className="activity-row"
                key={log._id}
              >

                <div className="activity-info">

                  <strong>
                    {log.activityName}
                  </strong>

                  <span>
                    {log.durationMinutes} min
                    {" • "}
                    {log.weightKg} kg
                    {" • "}
                    MET {log.met}
                    {" • "}
                    {log.caloriesSource === "manual" ? "entered by you" : "estimated"}
                    {log.source === "healthconnect" ? ` • from ${log.sourceApp || "Health Connect"}${log.avgHeartRate ? ` • avg ${log.avgHeartRate} bpm` : ""}` : ""}
                  </span>

                </div>


                <div className="activity-calories">

                  <strong>
                    {Math.round(
                      log.caloriesBurned
                    )} kcal
                  </strong>

                  <button
                    className="delete-button"
                    aria-label="Delete workout log"
                    onClick={() =>
                      handleDelete(
                        log._id
                      )
                    }
                  >
                    🗑️
                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

      <div className="large-card">

        <div className="section-header history-header">
          <div>
            <h2>Exercise History</h2>
            <p>
              {Math.round(historyCalories).toLocaleString()} kcal burned in the last {historyDays} days.
            </p>
          </div>

          <div className="serving-chips">
            {[7, 14, 30].map((d) => (
              <button
                type="button"
                key={d}
                className={historyDays === d ? "chip active" : "chip"}
                onClick={() => setHistoryDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {historyDates.length === 0 ? (
          <p>No workouts in this period.</p>
        ) : (
          <div className="activity-list">
            {historyDates.map((d) => {
              const items = byDay[d];
              const kcal = items.reduce((t, l) => t + Number(l.caloriesBurned || 0), 0);
              const mins = items.reduce((t, l) => t + Number(l.durationMinutes || 0), 0);
              return (
                <div className="history-day" key={d}>
                  <div className="history-day-head">
                    <strong>{d === today ? "Today" : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</strong>
                    <span>{Math.round(kcal)} kcal · {mins} min</span>
                  </div>
                  {items.map((l) => (
                    <div className="history-item" key={l._id}>
                      <span>{l.activityName} — {l.source === "gymlog" && l.sets && l.sets.length ? `${l.sets.length} sets · ` : ""}{l.durationMinutes} min{l.source === "healthconnect" ? ` · from ${l.sourceApp || "Health Connect"}${l.avgHeartRate ? ` · avg ${l.avgHeartRate} bpm` : ""}` : ""}</span>
                      <span>{Math.round(l.caloriesBurned)} kcal</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
}

export default ExercisePage;