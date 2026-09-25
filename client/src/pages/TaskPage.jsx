import { apiFetch } from "../config/api";
import { useEffect, useState } from "react";
import { getLocalDate } from "../utils/date";
import { API_URL } from "../config";

function TaskPage({ onBack }) {
  const today = getLocalDate();

  const [tasks, setTasks] = useState([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: today,
    time: "",
    priority: "medium",
    category: "General",
    recurrence: "none",
    notes: "",
  });

  const [loading, setLoading] = useState(false);

  const fetchTasks = async () => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/tasks?date=${form.date}`
      );

      const data = await response.json();

      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [form.date]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      alert("Please enter a task title.");
      return;
    }

    try {
      setLoading(true);

      const response = await apiFetch(
        `${API_URL}/api/tasks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (data.success) {
        setForm({
          title: "",
          description: "",
          date: form.date,
          time: "",
          priority: "medium",
          category: "General",
          recurrence: "none",
          notes: "",
        });

        fetchTasks();
      } else {
        alert(data.message || "Failed to create task.");
      }
    } catch (error) {
      console.error("Failed to create task:", error);
      alert("Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (id) => {
    try {
      const response = await apiFetch(
        `${API_URL}/api/tasks/${id}/toggle`,
        {
          method: "PATCH",
        }
      );

      const data = await response.json();

      if (data.success) {
        fetchTasks();
      }
    } catch (error) {
      console.error("Failed to toggle task:", error);
    }
  };

  const deleteTask = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(
        `${API_URL}/api/tasks/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        fetchTasks();
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  return (
    <div className="page">
      <button
        className="back-button"
        onClick={onBack}
      >
        ← Back to Dashboard
      </button>

      <h1>Tasks</h1>

      <p>
        {completedTasks} of {tasks.length} tasks completed
      </p>

      <div className="task-layout">

        {/* ADD TASK */}
        <div className="card">
          <h2>Add Task</h2>

          <form onSubmit={handleSubmit}>

            <label>Task Title</label>
            <input
              type="text"
              name="title"
              placeholder="Example: Workout"
              value={form.title}
              onChange={handleChange}
            />

            <label>Description</label>
            <textarea
              name="description"
              placeholder="What do you need to do?"
              value={form.description}
              onChange={handleChange}
            />

            <label>Date</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
            />

            <label>Time</label>
            <input
              type="time"
              name="time"
              value={form.time}
              onChange={handleChange}
            />

            <label>Priority</label>
            <select
              name="priority"
              value={form.priority}
              onChange={handleChange}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <label>Category</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              <option value="General">General</option>
              <option value="Health">Health</option>
              <option value="Work">Work</option>
              <option value="Learning">Learning</option>
              <option value="Personal">Personal</option>
              <option value="Finance">Finance</option>
            </select>

            <label>Recurrence</label>
            <select
              name="recurrence"
              value={form.recurrence}
              onChange={handleChange}
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>

            <label>Notes</label>
            <textarea
              name="notes"
              placeholder="Optional notes"
              value={form.notes}
              onChange={handleChange}
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Adding..." : "+ Add Task"}
            </button>

          </form>
        </div>

        {/* TASK LIST */}
        <div className="card">
          <h2>
            Tasks for {form.date}
          </h2>

          {tasks.length === 0 ? (
            <p>No tasks for this date.</p>
          ) : (
            <div className="task-list">

              {tasks.map((task) => (
                <div
                  className={`task-item ${
                    task.completed ? "completed" : ""
                  }`}
                  key={task._id}
                >

                  <div className="task-main">

                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() =>
                        toggleTask(task._id)
                      }
                    />

                    <div>
                      <h3>{task.title}</h3>

                      {task.description && (
                        <p>{task.description}</p>
                      )}

                      <small>
                        {task.time
                          ? `🕒 ${task.time}`
                          : "No time set"}
                        {" • "}
                        {task.category}
                        {" • "}
                        {task.priority}
                      </small>
                    </div>

                  </div>

                  <button
                    onClick={() =>
                      deleteTask(task._id)
                    }
                  >
                    Delete
                  </button>

                </div>
              ))}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default TaskPage;