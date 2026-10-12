import { confirmAction } from "../utils/confirm";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
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
      const response = await apiFetch(
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
      const response = await apiFetch(
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
      notify("Please enter a valid weight.", "error");
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch(
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
        notify(
          data.message ||
            "Failed to save weight."
        , "error");
      }
    } catch (error) {
      console.error(
        "Failed to save weight:",
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
  // DELETE WEIGHT
  // ============================================================

  const deleteWeight = async (id) => {
    const confirmed = await confirmAction(
      "Delete this weight entry?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(
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
        notify(
          data.message ||
            "Failed to delete weight."
        , "error");
      }
    } catch (error) {
      console.error(
        "Failed to delete weight:",
        error
      );

      notify(
        "Could not connect to the backend."
      , "error");
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

  const nudge = (delta) => {
    const base = weight === "" ? (latestWeight ?? 70) : Number(weight);
    setWeight((Math.max(1, base + delta)).toFixed(1));
  };
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? logs : logs.slice(0, 6);
  const good = weightChange !== null && weightChange !== 0 && (direction === "Gain" ? weightChange > 0 : weightChange < 0);

  return (
    <div className="weight-page wt">
      <div className="wt-top">
        <button className="secondary-button" onClick={onBack}>← Back</button>
        <Buddy scene="scale" size={64} says="Hop on!" />
      </div>

      <section className="wt-hero">
        <div className="wt-now">
          {latestWeight !== null ? (<><strong>{latestWeight.toFixed(1)}</strong><span>kg now</span></>) : (<BuddyEmpty scene="scale" size={84} title="No weight yet">Step on the scale and log it below.</BuddyEmpty>)}
          {weightChange !== null && weightChange !== 0 && (
            <em className={`wt-chip ${good ? "up" : "down"}`}>{weightChange < 0 ? "−" : "+"}{Math.abs(weightChange).toFixed(1)} kg since start</em>
          )}
        </div>
        {latestWeight !== null && (
          <div className="wt-stats">
            <div><small>Start</small><b>{startingWeight.toFixed(1)}</b></div>
            {hasTargetWeight ? (<>
              <div><small>Target</small><b>{targetWeight.toFixed(1)}</b></div>
              <div><small>{direction === "Maintain" ? "Goal" : "To go"}</small><b>{direction === "Maintain" ? "Hold" : remainingWeight.toFixed(1)}</b></div>
            </>) : (<div className="wt-hint">Set a target weight in Profile to see goal progress.</div>)}
          </div>
        )}
        {latestWeight !== null && hasTargetWeight && (
          <div className="wt-bar" title={`${Math.round(goalProgress)}% of the way`}><i style={{ width: `${goalProgress}%` }} /><span>{Math.round(goalProgress)}%</span></div>
        )}
      </section>

      <form className="wt-log" onSubmit={handleSubmit}>
        <div className="wt-log-head"><h2>Log today</h2><span className="wt-date">{today}</span></div>
        <div className="wt-stepper">
          <button type="button" onClick={() => nudge(-0.1)} aria-label="Down 0.1 kg">−</button>
          <label><input type="number" inputMode="decimal" min="1" step="0.1" placeholder={latestWeight !== null ? latestWeight.toFixed(1) : "0.0"} value={weight} onChange={(e) => setWeight(e.target.value)} /><span>kg</span></label>
          <button type="button" onClick={() => nudge(0.1)} aria-label="Up 0.1 kg">+</button>
        </div>
        <input className="wt-note" type="text" placeholder="Note (optional): morning, after gym…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit" className="primary-button wt-save" disabled={loading || weight === ""}>{loading ? "Saving…" : "Save weight"}</button>
      </form>

      <section className="wt-history">
        <h2>History</h2>
        {logs.length === 0 ? (
          <BuddyEmpty scene="sad" size={96} title="No weight entries yet" />
        ) : (
          <ul>
            {shown.map((log, i) => {
              const older = logs[i + 1], diff = older ? Number(log.weightKg) - Number(older.weightKg) : null;
              return (
                <li key={log._id}>
                  <div><b>{Number(log.weightKg).toFixed(1)} kg</b><small>{log.date}{log.notes ? ` · ${log.notes}` : ""}</small></div>
                  {diff !== null && diff !== 0 && <em className={diff < 0 ? "d-down" : "d-up"}>{diff < 0 ? "▼" : "▲"} {Math.abs(diff).toFixed(1)}</em>}
                  <button className="delete-log-button" onClick={() => deleteWeight(log._id)} aria-label="Delete entry">✕</button>
                </li>
              );
            })}
          </ul>
        )}
        {logs.length > 6 && <button type="button" className="secondary-button wt-more" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : `Show all ${logs.length}`}</button>}
      </section>
    </div>
  );
}

export default WeightPage;