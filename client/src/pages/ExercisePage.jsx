import { confirmAction } from "../utils/confirm";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import { getLocalDate } from "../utils/date";
import { estimateBurn } from "../utils/energy";

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
    const confirmed = await confirmAction(
      "Delete this activity?"
    );

    if (!confirmed) {
      return;
    }

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
          <div className="bd-head"><h1>Exercise</h1><Buddy scene="lift" size={76} says="Let's lift!" /></div>

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
          ADD ACTIVITY
      ====================================================== */}

      <div className="large-card">

        <div className="section-header">

          <div>
            <h2>Add Exercise</h2>

            <p>
              Enter what you did today.
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

              {activities.map(
                (activity) => (
                  <option
                    key={activity._id}
                    value={activity._id}
                  >
                    {activity.name}
                  </option>
                )
              )}

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
              {logs.length} activity
              {logs.length === 1
                ? ""
                : "ies"} recorded.
            </p>
          </div>

        </div>


        {logs.length === 0 ? (

          <BuddyEmpty scene="sad" title="No exercise yet today">
            Even 10 minutes counts. Add your first activity above and I will cheer you on!
          </BuddyEmpty>

        ) : (

          <div className="activity-list">

            {logs.map((log) => (

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
                      <span>{l.activityName} — {l.durationMinutes} min</span>
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