import { useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { notify } from "../utils/notify";

// Units offered in the dropdown. A food saved with some other unit is still shown correctly.
const UNITS = ["g", "ml", "piece", "serving", "cup", "tbsp", "tsp", "slice", "bowl"];

const emptyForm = {
  name: "",
  brand: "",
  servingSize: "100",
  servingUnit: "g",
  calories: "",
  protein: "",
  carbohydrates: "",
  fat: "",
  fiber: "",
  sugar: "",
  notes: "",
};

const fromFood = (food) => ({
  name: food.name || "",
  brand: food.brand || "",
  servingSize: food.servingSize ?? "100",
  servingUnit: food.servingUnit || "g",
  calories: food.calories ?? "",
  protein: food.protein ?? "",
  carbohydrates: food.carbohydrates ?? "",
  fat: food.fat ?? "",
  fiber: food.fiber ?? "",
  sugar: food.sugar ?? "",
  notes: food.notes || "",
});

/**
 * Add a new food (POST /api/foods) or edit one of your own (PUT /api/foods/:id).
 * The food is stored in the database and shows up in every food search straight away.
 *
 * Props:
 *   food        existing food to edit (omit to create a new one)
 *   initialName pre-fills the name when creating (e.g. what the person just searched for)
 *   onSaved     called with the saved food
 *   onCancel    called when the person closes the form
 */
export default function FoodForm({ food, initialName = "", onSaved, onCancel }) {
  const isEditing = Boolean(food?._id);
  const [form, setForm] = useState(
    isEditing ? fromFood(food) : { ...emptyForm, name: initialName }
  );
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const num = (value) => Number(value || 0);

  // Rough Atwater estimate: 4 kcal/g protein & carbs, 9 kcal/g fat.
  const hasMacros = [form.protein, form.carbohydrates, form.fat].some((x) => Number(x) > 0);
  const estimateCalories = () => {
    const kcal = 4 * num(form.protein) + 4 * num(form.carbohydrates) + 9 * num(form.fat);
    setForm((previous) => ({ ...previous, calories: String(Math.round(kcal)) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    if (!form.name.trim()) {
      notify("Give the food a name.", "error");
      return;
    }
    if (!(Number(form.servingSize) > 0)) {
      notify("Serving size must be greater than 0.", "error");
      return;
    }
    if (form.calories === "" || Number(form.calories) < 0) {
      notify("Enter the calories for one serving.", "error");
      return;
    }

    const body = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      servingSize: Number(form.servingSize),
      servingUnit: form.servingUnit,
      calories: num(form.calories),
      protein: num(form.protein),
      carbohydrates: num(form.carbohydrates),
      fat: num(form.fat),
      fiber: num(form.fiber),
      sugar: num(form.sugar),
      notes: form.notes.trim(),
    };

    try {
      setSaving(true);
      const response = await apiFetch(
        isEditing ? `${API_URL}/api/foods/${food._id}` : `${API_URL}/api/foods`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        notify(data.message || "Failed to save food", "error");
        return;
      }

      notify(isEditing ? "Food updated" : "Food saved to your database", "success");
      onSaved?.(data.food);
    } catch (error) {
      console.error("Failed to save food:", error);
      notify("Could not connect to the backend.", "error");
    } finally {
      setSaving(false);
    }
  };

  const units = UNITS.includes(form.servingUnit) ? UNITS : [form.servingUnit, ...UNITS];

  return (
    <div className="food-form-card">
      <div className="form-header">
        <div>
          <h2>{isEditing ? "Edit Food" : "Add New Food"}</h2>
          <p>
            {isEditing
              ? "Update your stored nutrition values."
              : "Enter the nutrition values for one serving. It's saved to your food database."}
          </p>
        </div>

        <button type="button" className="close-button" aria-label="Close" onClick={onCancel}>
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field full">
            <label>Food name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Homemade dal"
              maxLength={120}
              autoFocus
              required
            />
          </div>

          <div className="form-field">
            <label>Brand</label>
            <input
              name="brand"
              value={form.brand}
              onChange={handleChange}
              placeholder="Optional"
              maxLength={120}
            />
          </div>

          <div className="form-field">
            <label>Serving size *</label>
            <div className="serving-input">
              <input
                type="number"
                name="servingSize"
                value={form.servingSize}
                onChange={handleChange}
                min="0"
                step="any"
                placeholder="100"
                required
              />
              <select name="servingUnit" value={form.servingUnit} onChange={handleChange}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label>Calories (kcal) *</label>
            <input
              type="number"
              name="calories"
              value={form.calories}
              onChange={handleChange}
              min="0"
              step="any"
              placeholder="130"
              required
            />
            {hasMacros && (
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 6, padding: "6px 10px", fontSize: 12 }}
                onClick={estimateCalories}
              >
                Calculate from macros
              </button>
            )}
          </div>

          <div className="form-field">
            <label>Protein (g)</label>
            <input type="number" name="protein" value={form.protein} onChange={handleChange} min="0" step="any" placeholder="2.7" />
          </div>

          <div className="form-field">
            <label>Carbohydrates (g)</label>
            <input type="number" name="carbohydrates" value={form.carbohydrates} onChange={handleChange} min="0" step="any" placeholder="28" />
          </div>

          <div className="form-field">
            <label>Fat (g)</label>
            <input type="number" name="fat" value={form.fat} onChange={handleChange} min="0" step="any" placeholder="0.3" />
          </div>

          <div className="form-field">
            <label>Fiber (g)</label>
            <input type="number" name="fiber" value={form.fiber} onChange={handleChange} min="0" step="any" placeholder="0.4" />
          </div>

          <div className="form-field">
            <label>Sugar (g)</label>
            <input type="number" name="sugar" value={form.sugar} onChange={handleChange} min="0" step="any" placeholder="0" />
          </div>

          <div className="form-field full">
            <label>Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Optional notes about this food"
              rows="3"
              maxLength={500}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update Food" : "Save Food"}
          </button>
        </div>
      </form>
    </div>
  );
}
