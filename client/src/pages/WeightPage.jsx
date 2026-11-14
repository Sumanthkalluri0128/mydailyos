import { confirmAction } from "../utils/confirm";
import { undoGate } from "../utils/undo";
import { MeasureTrends, ProgressPhotos } from "../components/BodyProgress";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/date";
import { API_URL } from "../config";
import WeightReveal, { useWeightRevealed } from "../components/WeightReveal";
import { WeightInsights } from "../components/CoachCards";
import WeightScales from "../components/WeightScales";

const LAST_SCALE_KEY = "ff:lastWeightScale";
const readLast = () => { try { return localStorage.getItem(LAST_SCALE_KEY) || ""; } catch { return ""; } };
const writeLast = (v) => { try { localStorage.setItem(LAST_SCALE_KEY, v); } catch { /* private mode */ } };

function WeightPage({ onBack }) {
  const today = getLocalDate();

  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  const [logs, setLogs] = useState([]);
  const [scales, setScales] = useState([{ id: "main", name: "My scale", offsetKg: 0, mode: "auto" }]);
  const [referenceId, setReferenceId] = useState("main");
  const [scaleId, setScaleId] = useState(readLast());
  const [showScales, setShowScales] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  // The scale a new weigh-in is for: the one you used last (remembered on this device), else the main scale.
  const activeScale = scales.find((x) => x.id === scaleId) || scales.find((x) => x.id === referenceId) || scales[0];
  const refScale = scales.find((x) => x.id === referenceId) || scales[0];
  const calibratedPreview = weight !== "" && Number.isFinite(Number(weight)) && activeScale.id !== refScale.id ? Number(weight) - Number(activeScale.offsetKg || 0) : null;

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
        if (Array.isArray(data.scales) && data.scales.length) { setScales(data.scales); setReferenceId(data.referenceId || data.scales[0].id); }
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
            scaleId: activeScale.id,
            notes,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setWeight("");
        setNotes("");
        writeLast(activeScale.id);

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
    const go = await undoGate({ what: "Weight entry", hide: () => setLogs((cur) => cur.filter((l) => l._id !== id)), restore: () => fetchWeights() });
    if (!go) return;

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
    const base = weight === "" ? (latestWeight ?? 70) + Number(activeScale.offsetKg || 0) : Number(weight);
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
          {latestWeight !== null ? (<><strong><WeightReveal text={latestWeight.toFixed(1)} /></strong><span>kg now</span></>) : (<BuddyEmpty scene="scale" size={84} title="No weight yet">Step on the scale and log it below.</BuddyEmpty>)}
          {weightChange !== null && weightChange !== 0 && (
            <em className={`wt-chip ${good ? "up" : "down"}`}><WeightReveal compact reaction={false} text={`${weightChange < 0 ? "−" : "+"}${Math.abs(weightChange).toFixed(1)} kg since start`} /></em>
          )}
        </div>
        {latestWeight !== null && (
          <div className="wt-stats">
            <div><small>Start</small><b><WeightReveal compact reaction={false} text={startingWeight.toFixed(1)} /></b></div>
            {hasTargetWeight ? (<>
              <div><small>Target</small><b><WeightReveal compact reaction={false} text={targetWeight.toFixed(1)} /></b></div>
              <div><small>{direction === "Maintain" ? "Goal" : "To go"}</small><b>{direction === "Maintain" ? "Hold" : <WeightReveal compact reaction={false} text={remainingWeight.toFixed(1)} />}</b></div>
            </>) : (<div className="wt-hint">Set a target weight in Profile to see goal progress.</div>)}
          </div>
        )}
        {latestWeight !== null && hasTargetWeight && (
          <div className="wt-bar" title={`${Math.round(goalProgress)}% of the way`}><i style={{ width: `${goalProgress}%` }} /><span>{Math.round(goalProgress)}%</span></div>
        )}
      </section>

      <WeightInsights refreshKey={logs.length} />

      <form className="wt-log" onSubmit={handleSubmit}>
        <div className="wt-log-head"><h2>Log today</h2><span className="wt-date">{today}</span></div>
        <div className="wt-stepper">
          <button type="button" onClick={() => nudge(-0.1)} aria-label="Down 0.1 kg">−</button>
          <label><input type="number" inputMode="decimal" min="1" step="0.1" placeholder="0.0" value={weight} onChange={(e) => setWeight(e.target.value)} /><span>kg</span></label>
          <button type="button" onClick={() => nudge(0.1)} aria-label="Up 0.1 kg">+</button>
        </div>
        {scales.length > 1 && (
          <label className="wt-scale-pick"><span>Scale</span>
            <select value={activeScale.id} onChange={(e) => { setScaleId(e.target.value); writeLast(e.target.value); }} aria-label="Which scale">
              {scales.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === referenceId ? " (main)" : ""}</option>)}
            </select>
          </label>
        )}
        {calibratedPreview !== null && <small className="wt-calib">{activeScale.name} reads {Number(activeScale.offsetKg) >= 0 ? "+" : "−"}{Math.abs(Number(activeScale.offsetKg || 0)).toFixed(1)} kg vs {refScale.name}, so this counts as <b>{calibratedPreview.toFixed(1)} kg</b> in your trend.</small>}
        <button type="button" className="wt-scales-link" onClick={() => setShowScales((v) => !v)}>{showScales ? "Hide scales" : scales.length > 1 ? "Manage scales" : "Using a different scale? Add it"}</button>
        <input className="wt-note" type="text" placeholder="Note (optional): morning, after gym…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit" data-tour="weight-add" className="primary-button wt-save" disabled={loading || weight === ""}>{loading ? "Saving…" : "Save weight"}</button>
      </form>

      {showScales && <WeightScales scales={scales} referenceId={referenceId} onChanged={async () => { await fetchWeights(); await fetchProfile(); }} onPick={(id) => { setScaleId(id); writeLast(id); }} />}

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
                  <div><b><WeightReveal compact reaction={false} text={`${Number(log.rawKg ?? log.weightKg).toFixed(1)} kg`} /></b><small>{log.date}{scales.length > 1 ? ` · ${log.scaleName || "Scale"}` : ""}{scales.length > 1 && log.rawKg != null && Math.abs(log.rawKg - log.weightKg) >= 0.05 ? ` · counts as ${Number(log.weightKg).toFixed(1)}` : ""}{log.notes ? ` · ${log.notes}` : ""}</small></div>
                  {diff !== null && diff !== 0 && <em className={diff < 0 ? "d-down" : "d-up"}>{diff < 0 ? "▼" : "▲"} {Math.abs(diff).toFixed(1)}</em>}
                  <button className="delete-log-button" onClick={() => deleteWeight(log._id)} aria-label="Delete entry">✕</button>
                </li>
              );
            })}
          </ul>
        )}
        {logs.length > 6 && <button type="button" className="secondary-button wt-more" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : `Show all ${logs.length}`}</button>}
      </section>
      <MeasureTrends />
      <ProgressPhotos />
    </div>
  );
}

export default WeightPage;