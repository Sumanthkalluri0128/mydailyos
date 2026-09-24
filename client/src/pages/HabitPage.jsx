import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/date";

const API_URL = "http://127.0.0.1:5001";

function HabitPage({ onBack }) {
  const today = getLocalDate();

  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
const [habitStats, setHabitStats] = useState({});
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "General",
    frequency: "daily",
    target: 1,
    unit: "times",
    notes: "",
  });

  const [loading, setLoading] = useState(false);

  // ============================================================
  // LOAD HABITS
  // ============================================================

  const fetchHabitStats = async (habitList) => {
  try {
    const statsResults = await Promise.all(
      habitList.map(async (habit) => {
        const response = await fetch(
          `${API_URL}/api/habits/${habit._id}/stats`
        );

        const data = await response.json();

        return {
          habitId: habit._id,
          stats: data.success
            ? data.stats
            : {
                currentStreak: 0,
                totalCompleted: 0,
                totalLogged: 0,
                completionRate: 0,
              },
        };
      })
    );

    const statsMap = {};

    statsResults.forEach((item) => {
      statsMap[item.habitId] = item.stats;
    });

    setHabitStats(statsMap);
  } catch (error) {
    console.error(
      "Failed to fetch habit stats:",
      error
    );
  }
};


  const fetchHabits = async () => {
  try {
    const response = await fetch(
      `${API_URL}/api/habits`
    );

    const data = await response.json();

    if (data.success) {
      setHabits(data.habits);

      await fetchHabitStats(data.habits);
    }
  } catch (error) {
    console.error(
      "Failed to fetch habits:",
      error
    );
  }
};

  // ============================================================
  // LOAD TODAY'S LOGS
  // ============================================================

  const fetchHabitLogs = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/habits/logs?date=${today}`
      );

      const data = await response.json();

      if (data.success) {
        setHabitLogs(data.logs);
      }
    } catch (error) {
      console.error(
        "Failed to fetch habit logs:",
        error
      );
    }
  };
  
  useEffect(() => {
    fetchHabits();
    fetchHabitLogs();
  }, []);

  // ============================================================
  // FORM CHANGE
  // ============================================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ============================================================
  // CREATE HABIT
  // ============================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter a habit name.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/api/habits`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            target: Number(form.target),
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setForm({
          name: "",
          description: "",
          category: "General",
          frequency: "daily",
          target: 1,
          unit: "times",
          notes: "",
        });

        await fetchHabits();
      } else {
        alert(
          data.message ||
            "Failed to create habit."
        );
      }
    } catch (error) {
      console.error(
        "Failed to create habit:",
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
  // GET LOG FOR HABIT
  // ============================================================

  const getHabitLog = (habitId) => {
    return habitLogs.find(
      (log) => log.habitId === habitId
    );
  };

  // ============================================================
  // UPDATE HABIT PROGRESS
  // ============================================================

  const updateHabitProgress = async (
    habit,
    value
  ) => {
    try {
      const response = await fetch(
        `${API_URL}/api/habits/logs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            habitId: habit._id,
            date: today,
            completedValue: Number(value),
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchHabitLogs();
  await fetchHabitStats(habits);
      } else {
        alert(
          data.message ||
            "Failed to update habit."
        );
      }
    } catch (error) {
      console.error(
        "Failed to update habit:",
        error
      );
    }
  };

  // ============================================================
  // DELETE HABIT
  // ============================================================

  const deleteHabit = async (id) => {
    const confirmed = window.confirm(
      "Remove this habit?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/habits/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchHabits();
      }
    } catch (error) {
      console.error(
        "Failed to delete habit:",
        error
      );
    }
  };

  return (
    <div className="habit-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="habit-header">

        <div>
          <button
            className="secondary-button"
            onClick={onBack}
          >
            ← Back
          </button>

          <h1>Habits</h1>

          <p>
            Build consistency one day at a time.
          </p>
        </div>

      </div>


      {/* ====================================================== */}
      {/* CONTENT */}
      {/* ====================================================== */}

      <div className="habit-layout">

        {/* ==================================================== */}
        {/* ADD HABIT */}
        {/* ==================================================== */}

        <div className="card">

          <h2>Add Habit</h2>

          <form onSubmit={handleSubmit}>

            <label>Habit Name</label>

            <input
              type="text"
              name="name"
              placeholder="Example: Drink Water"
              value={form.name}
              onChange={handleChange}
            />


            <label>Description</label>

            <textarea
              name="description"
              placeholder="Describe your habit"
              value={form.description}
              onChange={handleChange}
            />


            <label>Category</label>

            <select
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              <option value="General">
                General
              </option>

              <option value="Health">
                Health
              </option>

              <option value="Fitness">
                Fitness
              </option>

              <option value="Learning">
                Learning
              </option>

              <option value="Work">
                Work
              </option>

              <option value="Personal">
                Personal
              </option>
            </select>


            <label>Frequency</label>

            <select
              name="frequency"
              value={form.frequency}
              onChange={handleChange}
            >
              <option value="daily">
                Daily
              </option>

              <option value="weekdays">
                Weekdays
              </option>

              <option value="weekly">
                Weekly
              </option>
            </select>


            <label>Target</label>

            <input
              type="number"
              name="target"
              min="1"
              step="any"
              value={form.target}
              onChange={handleChange}
            />


            <label>Unit</label>

            <input
              type="text"
              name="unit"
              placeholder="times / liters / minutes"
              value={form.unit}
              onChange={handleChange}
            />


            <label>Notes</label>

            <textarea
              name="notes"
              placeholder="Optional notes"
              value={form.notes}
              onChange={handleChange}
            />


            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading
                ? "Adding..."
                : "+ Add Habit"}
            </button>

          </form>

        </div>


        {/* ==================================================== */}
        {/* TODAY'S HABITS */}
        {/* ==================================================== */}

        <div className="card">

          <div className="section-header">

            <div>
              <h2>Today's Habits</h2>

              <p>
                {today}
              </p>
            </div>

          </div>


          {habits.length === 0 ? (

            <p>
              No habits created yet.
            </p>

          ) : (

            <div className="habit-list">

              {habits.map((habit) => {

                const log =
                  getHabitLog(habit._id);

                const currentValue =
                  log?.completedValue || 0;
                const stats =
  habitStats[habit._id] || {
    currentStreak: 0,
    totalCompleted: 0,
    totalLogged: 0,
    completionRate: 0,
  };
                const progress =
                  Math.min(
                    (currentValue /
                      habit.target) *
                      100,
                    100
                  );
                  

                return (
                  <div
                    className="habit-item"
                    key={habit._id}
                  >

                    <div className="habit-item-top">

                      <div>

                        <h3>
                          {habit.name}
                        </h3>

                        <small>
                          {habit.category}
                          {" • "}
                          {habit.frequency}
                        </small>
                        <div className="habit-stats">
  <span>
    🔥 {stats.currentStreak} day streak
  </span>

  <span>
    ✅ {stats.totalCompleted} completed
  </span>

  <span>
    📊 {stats.completionRate}%
  </span>
</div>

                      </div>

                      <button
                        className="delete-log-button"
                        onClick={() =>
                          deleteHabit(
                            habit._id
                          )
                        }
                      >
                        🗑️
                      </button>

                    </div>


                    {habit.description && (
                      <p>
                        {habit.description}
                      </p>
                    )}


                    <div className="habit-progress">

                      <div
                        className="progress-bar"
                      >
                        <div
                          className="progress-fill"
                          style={{
                            width: `${progress}%`,
                          }}
                        ></div>
                      </div>

                      <span>
                        {currentValue} /{" "}
                        {habit.target}{" "}
                        {habit.unit}
                      </span>

                    </div>


                    <div className="habit-actions">

                      <button
                        onClick={() =>
                          updateHabitProgress(
                            habit,
                            Math.max(
                              0,
                              currentValue - 1
                            )
                          )
                        }
                      >
                        −
                      </button>

                      <button
                        onClick={() =>
                          updateHabitProgress(
                            habit,
                            currentValue + 1
                          )
                        }
                      >
                        +1
                      </button>

                      <button
                        onClick={() =>
                          updateHabitProgress(
                            habit,
                            habit.target
                          )
                        }
                      >
                        ✓ Complete
                      </button>

                    </div>

                  </div>
                );
              })}

            </div>

          )}

        </div>

      </div>

    </div>
  );
}

export default HabitPage;