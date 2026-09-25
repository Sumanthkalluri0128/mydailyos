import { confirmAction } from "../utils/confirm";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/date";
import { API_URL } from "../config";

const DEFAULT_WATER_GOAL = 3000;

function WaterPage({ onBack }) {
  const today = getLocalDate();

  const [logs, setLogs] = useState([]);
  const [totalMl, setTotalMl] = useState(0);

  const [amount, setAmount] = useState(500);
  const [loading, setLoading] = useState(false);

  const [waterGoal, setWaterGoal] = useState(
    DEFAULT_WATER_GOAL
  );

  // ============================================================
  // LOAD TODAY'S WATER
  // ============================================================

  const fetchWater = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/water?date=${today}`
      );

      const data = await response.json();

      if (data.success) {
        setLogs(data.logs);
        setTotalMl(data.totalMl);
      }
    } catch (error) {
      console.error(
        "Failed to fetch water:",
        error
      );
    }
  };

  // ============================================================
  // LOAD PROFILE WATER GOAL
  // ============================================================

  const fetchProfile = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/profile`
      );

      const data = await response.json();

      if (
        data.success &&
        data.profile?.goals?.waterTargetMl
      ) {
        setWaterGoal(
          Number(
            data.profile.goals.waterTargetMl
          )
        );
      }
    } catch (error) {
      console.error(
        "Failed to fetch profile:",
        error
      );
    }
  };

  useEffect(() => {
    fetchWater();
    fetchProfile();
  }, []);

  // ============================================================
  // ADD WATER
  // ============================================================

  const addWater = async (amountMl) => {
    if (!amountMl || Number(amountMl) <= 0) {
      notify("Enter a valid amount.", "error");
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch(
        `${API_URL}/api/water`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: today,
            amountMl: Number(amountMl),
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchWater();
      } else {
        notify(
          data.message ||
            "Failed to add water."
        , "error");
      }
    } catch (error) {
      console.error(
        "Failed to add water:",
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
  // DELETE WATER
  // ============================================================

  const deleteWater = async (id) => {
    const confirmed = await confirmAction(
      "Remove this water entry?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(
        `${API_URL}/api/water/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchWater();
      }
    } catch (error) {
      console.error(
        "Failed to delete water:",
        error
      );
    }
  };

  const progress =
    waterGoal > 0
      ? Math.min(
          (totalMl / waterGoal) * 100,
          100
        )
      : 0;

  return (
    <div className="water-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="water-header">

        <div>

          <button
            className="secondary-button"
            onClick={onBack}
          >
            ← Back
          </button>

          <h1>Water</h1>

          <p>
            Stay hydrated throughout the day.
          </p>

        </div>

      </div>


      {/* ====================================================== */}
      {/* DAILY SUMMARY */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Today's Water</h2>

        <div className="water-total">

          <strong>
            {(totalMl / 1000).toFixed(2)} L
          </strong>

          <span>
            / {(waterGoal / 1000).toFixed(1)} L
          </span>

        </div>

        <div className="progress-bar">

          <div
            className="progress-fill"
            style={{
              width: `${progress}%`,
            }}
          ></div>

        </div>

        <p>
          {totalMl.toLocaleString()} ml consumed
        </p>

      </div>


      {/* ====================================================== */}
      {/* QUICK ADD */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Quick Add</h2>

        <div className="water-buttons">

          <button
            onClick={() =>
              addWater(250)
            }
            disabled={loading}
          >
            +250 ml
          </button>

          <button
            onClick={() =>
              addWater(500)
            }
            disabled={loading}
          >
            +500 ml
          </button>

          <button
            onClick={() =>
              addWater(750)
            }
            disabled={loading}
          >
            +750 ml
          </button>

          <button
            onClick={() =>
              addWater(1000)
            }
            disabled={loading}
          >
            +1 L
          </button>

        </div>

        <div className="water-custom">

          <input
            type="number"
            min="1"
            step="50"
            value={amount}
            onChange={(event) =>
              setAmount(
                event.target.value
              )
            }
          />

          <span>ml</span>

          <button
            className="primary-button"
            onClick={() =>
              addWater(amount)
            }
            disabled={loading}
          >
            Add Water
          </button>

        </div>

      </div>


      {/* ====================================================== */}
      {/* TODAY'S LOG */}
      {/* ====================================================== */}

      <div className="card">

        <h2>Today's Entries</h2>

        {logs.length === 0 ? (

          <p>
            No water logged yet.
          </p>

        ) : (

          <div className="water-log-list">

            {logs.map((log) => (

              <div
                className="water-log"
                key={log._id}
              >

                <div>

                  <strong>
                    {log.amountMl} ml
                  </strong>

                  <small>
                    {new Date(
                      log.createdAt
                    ).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </small>

                </div>

                <button
                  className="delete-log-button"
                  onClick={() =>
                    deleteWater(log._id)
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

export default WaterPage;