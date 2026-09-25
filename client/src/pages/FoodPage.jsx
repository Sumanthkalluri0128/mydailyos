import { useEffect, useState } from "react";
import { API_URL } from "../config";

function FoodPage() {
  const [foods, setFoods] = useState([]);
const [showForm, setShowForm] = useState(false);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");
const [favoritesOnly, setFavoritesOnly] = useState(false);
const [editingFood, setEditingFood] = useState(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    servingSize: "",
    servingUnit: "g",
    calories: "",
    protein: "",
    carbohydrates: "",
    fat: "",
    fiber: "",
    sugar: "",
    notes: "",
  });

  // Get foods from backend
  const fetchFoods = async (
  searchValue = search,
  favoriteValue = favoritesOnly
) => {
  try {
    const params = new URLSearchParams();

    if (searchValue.trim()) {
      params.append("search", searchValue.trim());
    }

    if (favoriteValue) {
      params.append("favorites", "true");
    }

    const url = `${API_URL}/api/foods?${params.toString()}`;

    const response = await fetch(url);

    const data = await response.json();

    if (data.success) {
      setFoods(data.foods);
    }
  } catch (error) {
    console.error("Failed to fetch foods:", error);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchFoods();
  }, []);

  // Handle input changes
  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Save food
  const handleSubmit = async (event) => {
  event.preventDefault();

  try {
    const foodData = {
      ...form,
      servingSize: Number(form.servingSize),
      calories: Number(form.calories),
      protein: Number(form.protein || 0),
      carbohydrates: Number(form.carbohydrates || 0),
      fat: Number(form.fat || 0),
      fiber: Number(form.fiber || 0),
      sugar: Number(form.sugar || 0),
    };

    const isEditing = Boolean(editingFood);

    const url = isEditing
      ? `${API_URL}/api/foods/${editingFood._id}`
      : `${API_URL}/api/foods`;

    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(foodData),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Failed to save food");
      return;
    }

    // Refresh foods from database
    await fetchFoods(search, favoritesOnly);

    // Reset form
    setForm({
      name: "",
      brand: "",
      servingSize: "",
      servingUnit: "g",
      calories: "",
      protein: "",
      carbohydrates: "",
      fat: "",
      fiber: "",
      sugar: "",
      notes: "",
    });

    setEditingFood(null);
    setShowForm(false);
  } catch (error) {
    console.error("Failed to save food:", error);
    alert("Could not connect to the backend.");
  }
};
 
  const handleEdit = (food) => {
  setEditingFood(food);

  setForm({
    name: food.name || "",
    brand: food.brand || "",
    servingSize: food.servingSize || "",
    servingUnit: food.servingUnit || "g",
    calories: food.calories ?? "",
    protein: food.protein ?? "",
    carbohydrates: food.carbohydrates ?? "",
    fat: food.fat ?? "",
    fiber: food.fiber ?? "",
    sugar: food.sugar ?? "",
    notes: food.notes || "",
  });

  setShowForm(true);
};

  return (
    <div className="food-page">
      <div className="food-header">
        <div>
          <h1>My Foods</h1>
          <p>
            Your personal food database. These values are used
            for your calorie tracking.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => setShowForm(true)}
        >
          + Add Food
        </button>
      </div>

      {showForm && (
        <div className="food-form-card">
          <div className="form-header">
            <div>
              <h2>{editingFood ? "Edit Food" : "Add Food"}</h2>

<p>
  {editingFood
    ? "Update your stored nutrition values."
    : "Enter your own nutrition values."}
</p>
            </div>

            <button
              className="close-button"
              onClick={() => setShowForm(false)}
            >
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
                  placeholder="e.g. Cooked Rice"
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

                  <select
                    name="servingUnit"
                    value={form.servingUnit}
                    onChange={handleChange}
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="piece">piece</option>
                    <option value="serving">serving</option>
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>Calories *</label>
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
              </div>

              <div className="form-field">
                <label>Protein (g)</label>
                <input
                  type="number"
                  name="protein"
                  value={form.protein}
                  onChange={handleChange}
                  min="0"
                  step="any"
                  placeholder="2.7"
                />
              </div>

              <div className="form-field">
                <label>Carbohydrates (g)</label>
                <input
                  type="number"
                  name="carbohydrates"
                  value={form.carbohydrates}
                  onChange={handleChange}
                  min="0"
                  step="any"
                  placeholder="28"
                />
              </div>

              <div className="form-field">
                <label>Fat (g)</label>
                <input
                  type="number"
                  name="fat"
                  value={form.fat}
                  onChange={handleChange}
                  min="0"
                  step="any"
                  placeholder="0.3"
                />
              </div>

              <div className="form-field">
                <label>Fiber (g)</label>
                <input
                  type="number"
                  name="fiber"
                  value={form.fiber}
                  onChange={handleChange}
                  min="0"
                  step="any"
                  placeholder="0.4"
                />
              </div>

              <div className="form-field">
                <label>Sugar (g)</label>
                <input
                  type="number"
                  name="sugar"
                  value={form.sugar}
                  onChange={handleChange}
                  min="0"
                  step="any"
                  placeholder="0"
                />
              </div>

              <div className="form-field full">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Optional notes about this food"
                  rows="3"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
  type="submit"
  className="primary-button"
>
  {editingFood ? "Update Food" : "Save Food"}
</button>
            </div>
          </form>
        </div>
      )}

      <div className="food-list-card">
        <div className="section-header">
  <div>
    <h2>Saved Foods</h2>
    <p>{foods.length} food(s) shown</p>
  </div>
</div>

<div className="food-filters">
  <input
    type="text"
    placeholder="🔍 Search foods..."
    value={search}
    onChange={(event) => {
      const value = event.target.value;

      setSearch(value);
      fetchFoods(value, favoritesOnly);
    }}
  />

  <button
    className={favoritesOnly ? "filter-active" : ""}
    onClick={() => {
      const newValue = !favoritesOnly;

      setFavoritesOnly(newValue);
      fetchFoods(search, newValue);
    }}
  >
    ⭐ Favorites
  </button>
</div>

        {loading ? (
          <p>Loading foods...</p>
        ) : foods.length === 0 ? (
          <div className="empty-state">
            <div>🍽️</div>
            <h3>No foods yet</h3>
            <p>
              Add your first food to start building your
              personal nutrition database.
            </p>

            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              + Add Your First Food
            </button>
          </div>
        ) : (
          <div className="food-table">
            <div className="food-table-header">
  <span>Food</span>
  <span>Serving</span>
  <span>Calories</span>
  <span>Protein</span>
  <span>Carbs</span>
  <span>Fat</span>
  <span>Favorite</span>
  <span>Edit</span>
  <span>Delete</span>
</div>
            {foods.map((food) => (
  <div className="food-row" key={food._id}>
    <div>
      <strong>{food.name}</strong>

      {food.brand && (
        <small>{food.brand}</small>
      )}
    </div>

    <span>
      {food.servingSize} {food.servingUnit}
    </span>

    <strong>{food.calories} kcal</strong>

    <span>{food.protein} g</span>

    <span>{food.carbohydrates} g</span>

    <span>{food.fat} g</span>

    <button
      className="favorite-button"
      onClick={async () => {
        try {
          const response = await fetch(
            `${API_URL}/api/foods/${food._id}/favorite`,
            {
              method: "PATCH",
            }
          );

          if (!response.ok) {
            throw new Error("Failed to update favorite");
          }

          await fetchFoods(search, favoritesOnly);
        } catch (error) {
          console.error("Failed to update favorite:", error);
        }
      }}
      title="Favorite"
    >
      {food.isFavorite ? "⭐" : "☆"}
    </button>

    <button
      className="food-action-button"
      onClick={() => handleEdit(food)}
      title="Edit food"
    >
      ✏️
    </button>

    <button
      className="food-action-button delete-button"
      onClick={async () => {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${food.name}"?`
        );

        if (!confirmed) {
          return;
        }

        try {
          const response = await fetch(
            `${API_URL}/api/foods/${food._id}`,
            {
              method: "DELETE",
            }
          );

          const data = await response.json();

          if (!response.ok) {
            alert(data.message || "Failed to delete food");
            return;
          }

          await fetchFoods(search, favoritesOnly);
        } catch (error) {
          console.error("Failed to delete food:", error);
          alert("Could not connect to the backend.");
        }
      }}
      title="Delete food"
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

export default FoodPage;