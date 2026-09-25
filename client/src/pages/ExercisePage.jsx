import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { API_URL } from "../config";

function ExercisePage({ onBack }) {
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState([]);

  const [selectedActivity, setSelectedActivity] =
    useState("");

  const [duration, setDuration] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);

  const today = new Date()
    .toISOString()
    .split("T")[0];

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

  useEffect(() => {
    fetchActivities();
    fetchLogs();
  }, []);

  // ============================================================
  // LOG ACTIVITY
  // ============================================================

  const handleAddActivity = async (event) => {
    event.preventDefault();

    if (!selectedActivity) {
      alert("Please select an activity.");
      return;
    }

    if (!duration || Number(duration) <= 0) {
      alert("Please enter a valid duration.");
      return;
    }

    if (!weight || Number(weight) <= 0) {
      alert("Please enter your weight.");
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
            weightKg: Number(weight),
            notes,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(
          data.message ||
            "Failed to add activity."
        );

        return;
      }

      // Clear form
      setSelectedActivity("");
      setDuration("");
      setNotes("");

      // Refresh today's activities
      fetchLogs();

    } catch (error) {
      console.error(error);

      alert(
        "Could not connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // DELETE ACTIVITY
  // ============================================================

  const handleDelete = async (id) => {
    const confirmed = window.confirm(
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
      } else {
        alert(
          data.message ||
            "Failed to delete activity."
        );
      }
    } catch (error) {
      console.error(error);

      alert(
        "Could not connect to the backend."
      );
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

  return (
    <div className="exercise-page">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="page-header">

        <div>
          <h1>Exercise</h1>

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

          <div className="empty-state">
            <div>
              🏃
            </div>

            <h3>
              No exercise recorded
            </h3>

            <p>
              Add your first activity
              above.
            </p>
          </div>

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

    </div>
  );
}

export default ExercisePage;