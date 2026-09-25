import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/date";
import { API_URL } from "../config";

function WeightPage({ onBack }) {
  const today = getLocalDate();

  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  const [logs, setLogs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  // ============================================================
  // LOAD WEIGHT HISTORY
  // ============================================================

  const fetchWeights = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/weight`
      );

      const data = await response.json();

      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error(
        "Failed to fetch weight history:",
        error
      );
    }
  };

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
        setProfile(data.profile);
      }
    } catch (error) {
      console.error(
        "Failed to fetch profile:",
        error
      );
    }
  };

  useEffect(() => {
    fetchWeights();
    fetchProfile();
  }, []);

  // ============================================================
  // ADD WEIGHT
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    const numericWeight = Number(weight);

    if (
      !Number.isFinite(numericWeight) ||
      numericWeight <= 0
    ) {
      alert("Please enter a valid weight.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/weight`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: today,
            weightKg: numericWeight,
            notes,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setWeight("");
        setNotes("");

        // Refresh both weight history and profile.
        await fetchWeights();
        await fetchProfile();

        // Return to Dashboard.
        onBack();
      } else {
        alert(
          data.message ||
            "Failed to save weight."
        );
      }
    } catch (error) {
      console.error(
        "Failed to save weight:",
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
  // DELETE WEIGHT
  // ============================================================

  const deleteWeight = async (id) => {
    const confirmed = window.confirm(
      "Delete this weight entry?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/weight/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        // Refresh history and profile after deletion.
        await fetchWeights();
        await fetchProfile();
      } else {
        alert(
          data.message ||
            "Failed to delete weight."
        );
      }
    } catch (error) {
      console.error(
        "Failed to delete weight:",
        error
      );

      alert(
        "Could not connect to the backend."
      );
    }
  };

  // ============================================================
  // WEIGHT PROGRESS
  // ============================================================

  const sortedLogs = [...logs].sort((a, b) => {
    const dateComparison =
      String(a.date).localeCompare(
        String(b.date)
      );

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return (
      new Date(a.createdAt || 0) -
      new Date(b.createdAt || 0)
    );
  });

  const startingWeight =
    sortedLogs.length > 0
      ? Number(sortedLogs[0].weightKg)
      : null;

  const latestWeight =
    logs.length > 0
      ? Number(logs[0].weightKg)
      : null;

  const targetWeight =
    profile?.goals?.targetWeightKg !== null &&
    profile?.goals?.targetWeightKg !== undefined
      ? Number(profile.goals.targetWeightKg)
      : null;

  const weightChange =
    startingWeight !== null &&
    latestWeight !== null
      ? latestWeight - startingWeight
      : null;

  const hasTargetWeight =
    Number.isFinite(latestWeight) &&
    Number.isFinite(targetWeight) &&
    targetWeight > 0;

  const direction = hasTargetWeight
    ? targetWeight < latestWeight
      ? "Lose"
      : targetWeight > latestWeight
      ? "Gain"
      : "Maintain"
    : null;

  const remainingWeight = hasTargetWeight
    ? Math.abs(latestWeight - targetWeight)
    : null;

  const totalGoalDistance =
    hasTargetWeight &&
    startingWeight !== null
      ? Math.abs(startingWeight - targetWeight)
      : null;

  const completedGoalDistance =
    hasTargetWeight &&
    startingWeight !== null
      ? direction === "Lose"
        ? startingWeight - latestWeight
        : direction === "Gain"
        ? latestWeight - startingWeight
        : 0
      : null;

  const goalProgress =
    hasTargetWeight &&
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
      : hasTargetWeight
      ? 100
      : 0;

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="weight-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="weight-header">

        <div>

          <button
            className="secondary-button"
            onClick={onBack}
          >
            ← Back
          </button>

          <h1>Weight</h1>

          <p>
            Track your weight over time.
          </p>

        </div>

      </div>


      {/* ====================================================== */}
      {/* CURRENT WEIGHT */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Latest Weight</h2>

        {latestWeight !== null ? (
          <div className="weight-current">

            <strong>
              {latestWeight.toFixed(1)}
            </strong>

            <span>
              kg
            </span>

          </div>
        ) : (
          <p>
            No weight recorded yet.
          </p>
        )}

      </div>


      {/* ====================================================== */}
      {/* PROGRESS SUMMARY */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Weight Progress</h2>

        {latestWeight === null ? (

          <p>
            Log your first weight to start
            tracking progress.
          </p>

        ) : (

          <div>

            <p>
              <strong>
                Starting weight:
              </strong>{" "}
              {startingWeight.toFixed(1)} kg
            </p>

            <p>
              <strong>
                Current weight:
              </strong>{" "}
              {latestWeight.toFixed(1)} kg
            </p>

            {weightChange !== null && (
              <p>
                <strong>
                  Change:
                </strong>{" "}
                {Math.abs(weightChange).toFixed(1)} kg{" "}
                {weightChange < 0
                  ? "lost"
                  : weightChange > 0
                  ? "gained"
                  : "no change"}
              </p>
            )}

            {hasTargetWeight ? (

              <>
                <p>
                  <strong>
                    Target weight:
                  </strong>{" "}
                  {targetWeight.toFixed(1)} kg
                </p>

                <p>
                  <strong>
                    Goal:
                  </strong>{" "}
                  {direction === "Maintain"
                    ? "Maintain"
                    : `${direction} ${remainingWeight.toFixed(
                        1
                      )} kg`}
                </p>

                <div
                  className="progress-bar"
                  style={{
                    marginTop: "16px",
                  }}
                >
                  <div
                    className="progress-fill"
                    style={{
                      width: `${goalProgress}%`,
                    }}
                  ></div>
                </div>

                <p>
                  <strong>
                    Progress:
                  </strong>{" "}
                  {Math.round(goalProgress)}%
                </p>
              </>

            ) : (

              <p>
                Set a target weight in Profile
                to track goal progress.
              </p>

            )}

          </div>

        )}

      </div>


      {/* ====================================================== */}
      {/* ADD WEIGHT */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Log Today's Weight</h2>

        <p>
          Date: {today}
        </p>

        <form onSubmit={handleSubmit}>

          <label>
            Weight (kg)
          </label>

          <input
            type="number"
            min="1"
            step="0.1"
            placeholder="Example: 82.5"
            value={weight}
            onChange={(event) =>
              setWeight(
                event.target.value
              )
            }
          />

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

          <button
            type="submit"
            className="primary-button"
            disabled={loading}
          >
            {loading
              ? "Saving..."
              : "Save Weight"}
          </button>

        </form>

      </div>


      {/* ====================================================== */}
      {/* HISTORY */}
      {/* ====================================================== */}

      <div className="card">

        <div className="section-header">

          <div>

            <h2>
              Weight History
            </h2>

            <p>
              Your recorded measurements.
            </p>

          </div>

        </div>


        {logs.length === 0 ? (

          <p>
            No weight entries yet.
          </p>

        ) : (

          <div className="weight-list">

            {logs.map((log) => (

              <div
                className="weight-log"
                key={log._id}
              >

                <div>

                  <strong>
                    {Number(
                      log.weightKg
                    ).toFixed(1)}{" "}
                    kg
                  </strong>

                  <small>
                    {log.date}
                  </small>

                  {log.notes && (
                    <small>
                      {log.notes}
                    </small>
                  )}

                </div>

                <button
                  className="delete-log-button"
                  onClick={() =>
                    deleteWeight(
                      log._id
                    )
                  }
                >
                  🗑️
                </button>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>
  );
}

export default WeightPage;