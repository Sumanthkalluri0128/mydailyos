import { useEffect, useState } from "react";
import { apiFetch } from "../config/api";
import { API_URL } from "../config";
import { notify } from "../utils/notify";

const UNITS = ["g", "ml", "piece", "serving", "cup", "tbsp", "tsp"];

const NUTRIENTS = [
  { name: "protein", label: "Protein (g)", placeholder: "2.7" },
  { name: "carbohydrates", label: "Carbohydrates (g)", placeholder: "28" },
  { name: "fat", label: "Fat (g)", placeholder: "0.3" },
  { name: "fiber", label: "Fiber (g)", placeholder: "0.4" },
  { name: "sugar", label: "Sugar (g)", placeholder: "0" },
];

/**
 * Modal to add a custom food (saved to the database via POST /api/foods).
 * Used from the Log Food screen so people never have to leave it to add a missing food.
 *
 *   <FoodFormModal initialName="Dal" onClose={...} onSaved={(food) => ...} />
 */
function FoodFormModal({ initialName = "", onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initialName,
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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const servingSize = Number(form.servingSize);
    const calories = Number(form.calories);
    if (!form.name.trim()) return notify("Give the food a name.", "error");
    if (!(servingSize > 0)) return notify("Serving size must be greater than 0.", "error");
    if (form.calories === "" || !(calories >= 0)) return notify("Enter the calories for one serving.", "error");

    const body = {
      ...form,
      name: form.name.trim(),
      brand: form.brand.trim(),
      notes: form.notes.trim(),
      servingSize,
      calories,
      protein: Number(form.protein || 0),
      carbohydrates: Number(form.carbohydrates || 0),
      fat: Number(form.fat || 0),
      fiber: Number(form.fiber || 0),
      sugar: Number(form.sugar || 0),
    };

    try {
      setSaving(true);
      const response = await apiFetch(`${API_URL}/api/foods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.food) {
        notify(data.message || "Failed to save food", "error");
        return;
      }
      notify(`"${data.food.name}" saved to your foods.`, "success");
      onSaved(data.food);
    } catch (error) {
      console.error("Failed to save food:", error);
      notify("Could not connect to the backend.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="food-modal" role="dialog" aria-modal="true" aria-labelledby="food-modal-title">
        <div className="form-header">
          <div>
            <h2 id="food-modal-title">Add a new food</h2>
            <p>Enter the nutrition for <strong>one serving</strong> — it&rsquo;s saved to your food database.</p>
          </div>
          <button type="button" className="close-button" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field full">
              <label htmlFor="ff-name">Food name *</label>
              <input id="ff-name" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Homemade dal" maxLength={120} required autoFocus />
            </div>

            <div className="form-field">
              <label htmlFor="ff-brand">Brand</label>
              <input id="ff-brand" name="brand" value={form.brand} onChange={handleChange} placeholder="Optional" maxLength={120} />
            </div>

            <div className="form-field">
              <label htmlFor="ff-serving">Serving size *</label>
              <div className="serving-input">
                <input id="ff-serving" type="number" name="servingSize" value={form.servingSize} onChange={handleChange} min="0" step="any" placeholder="100" required />
                <select name="servingUnit" value={form.servingUnit} onChange={handleChange} aria-label="Serving unit">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="ff-cal">Calories (kcal) *</label>
              <input id="ff-cal" type="number" name="calories" value={form.calories} onChange={handleChange} min="0" step="any" placeholder="130" required />
            </div>

            {NUTRIENTS.map((n) => (
              <div className="form-field" key={n.name}>
                <label htmlFor={`ff-${n.name}`}>{n.label}</label>
                <input id={`ff-${n.name}`} type="number" name={n.name} value={form[n.name]} onChange={handleChange} min="0" step="any" placeholder={n.placeholder} />
              </div>
            ))}

            <div className="form-field full">
              <label htmlFor="ff-notes">Notes</label>
              <textarea id="ff-notes" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes about this food" rows="2" maxLength={500} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save & use"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FoodFormModal;
