import { useEffect, useMemo, useState } from "react";
import { API_URL } from "../config";
const MEALS = [
  {
    id: "breakfast",
    label: "Breakfast",
    emoji: "🌅",
  },
  {
    id: "lunch",
    label: "Lunch",
    emoji: "☀️",
  },
  {
    id: "dinner",
    label: "Dinner",
    emoji: "🌙",
  },
  {
    id: "snacks",
    label: "Snacks",
    emoji: "🍎",
  },
];

function FoodLogger({ date, onBack }) {
  const [foods, setFoods] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);

  const [selectedMeal, setSelectedMeal] =
    useState("breakfast");

  const [selectedFood, setSelectedFood] =
    useState(null);

  const [quantity, setQuantity] = useState("");

  const [search, setSearch] = useState("");

  const [loadingFoods, setLoadingFoods] =
    useState(true);

  const [saving, setSaving] = useState(false);

  // ============================================================
  // LOAD SAVED FOODS
  // ============================================================

  const fetchFoods = async () => {
    try {
      setLoadingFoods(true);

      const response = await fetch(
        `${API_URL}/api/foods`
      );

      const data = await response.json();

      if (data.success) {
        setFoods(data.foods);
      }
    } catch (error) {
      console.error(
        "Failed to fetch foods:",
        error
      );
    } finally {
      setLoadingFoods(false);
    }
  };

  // ============================================================
  // LOAD TODAY'S FOOD LOGS
  // ============================================================

  const fetchFoodLogs = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/food-logs?date=${date}`
      );

      const data = await response.json();

      if (data.success) {
        setFoodLogs(data.logs);
      }
    } catch (error) {
      console.error(
        "Failed to fetch food logs:",
        error
      );
    }
  };

  useEffect(() => {
    fetchFoods();
    fetchFoodLogs();
  }, [date]);

  // ============================================================
  // SEARCH FOODS
  // ============================================================

  const filteredFoods = useMemo(() => {
    const value = search
      .trim()
      .toLowerCase();

    if (!value) {
      return foods;
    }

    return foods.filter((food) => {
      return (
        food.name
          .toLowerCase()
          .includes(value) ||
        (food.brand || "")
          .toLowerCase()
          .includes(value)
      );
    });
  }, [foods, search]);

  // ============================================================
  // CALCULATE PREVIEW
  // ============================================================

  const preview = useMemo(() => {
    if (!selectedFood || !quantity) {
      return null;
    }

    const amount = Number(quantity);

    if (!amount || amount <= 0) {
      return null;
    }

    const servings =
      amount /
      Number(selectedFood.servingSize);

    return {
      servings,

      calories:
        selectedFood.calories *
        servings,

      protein:
        selectedFood.protein *
        servings,

      carbohydrates:
        selectedFood.carbohydrates *
        servings,

      fat:
        selectedFood.fat *
        servings,

      fiber:
        selectedFood.fiber *
        servings,

      sugar:
        selectedFood.sugar *
        servings,
    };
  }, [selectedFood, quantity]);

  // ============================================================
  // SELECT FOOD
  // ============================================================

  const handleSelectFood = (food) => {
    setSelectedFood(food);

    setQuantity("");

    setSearch(food.name);
  };

  // ============================================================
  // ADD FOOD TO LOG
  // ============================================================

  const handleAddFood = async () => {
    if (!selectedFood) {
      alert("Please select a food.");
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      alert("Please enter the quantity.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/api/food-logs`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            foodId: selectedFood._id,

            date,

            mealType: selectedMeal,

            quantity: Number(quantity),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.message ||
            "Failed to add food."
        );

        return;
      }

      // Refresh today's logs
      await fetchFoodLogs();

      // Reset selection
      setSelectedFood(null);
      setQuantity("");
      setSearch("");
    } catch (error) {
      console.error(
        "Failed to add food:",
        error
      );

      alert(
        "Could not connect to the backend."
      );
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // DELETE FOOD LOG
  // ============================================================

  const handleDeleteLog = async (id) => {
    const confirmed = window.confirm(
      "Remove this food from today's log?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/food-logs/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(
          data.message ||
            "Failed to delete food log."
        );

        return;
      }

      await fetchFoodLogs();
    } catch (error) {
      console.error(
        "Failed to delete food log:",
        error
      );

      alert(
        "Could not connect to the backend."
      );
    }
  };

  // ============================================================
  // MEAL LOGS
  // ============================================================

  const getMealLogs = (mealType) => {
    return foodLogs.filter(
      (log) => log.mealType === mealType
    );
  };

  // ============================================================
  // MEAL TOTAL
  // ============================================================

  const getMealCalories = (mealType) => {
    return getMealLogs(mealType).reduce(
      (total, log) =>
        total +
        Number(
          log.nutritionTotal?.calories || 0
        ),
      0
    );
  };

  return (
    <div className="food-logger-page">

      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div className="food-logger-header">

        <div>
          <button
            className="secondary-button"
            onClick={onBack}
          >
            ← Back
          </button>

          <h1>Log Food</h1>

          <p>
            Add everything you ate today.
          </p>
        </div>

      </div>


      {/* ====================================================== */}
      {/* MEAL SELECTOR */}
      {/* ====================================================== */}

      <div className="meal-selector">

        {MEALS.map((meal) => (
          <button
            key={meal.id}
            className={
              selectedMeal === meal.id
                ? "meal-button active"
                : "meal-button"
            }
            onClick={() =>
              setSelectedMeal(meal.id)
            }
          >
            <span>
              {meal.emoji}
            </span>

            <strong>
              {meal.label}
            </strong>
          </button>
        ))}

      </div>


      {/* ====================================================== */}
      {/* ADD FOOD CARD */}
      {/* ====================================================== */}

      <div className="logger-card">

        <h2>
          Add to{" "}
          {
            MEALS.find(
              (meal) =>
                meal.id === selectedMeal
            )?.label
          }
        </h2>

        {/* Search */}

        <div className="logger-search">

          <input
            type="text"
            placeholder="🔍 Search your saved foods..."
            value={search}
            onChange={(event) => {
              setSearch(
                event.target.value
              );

              setSelectedFood(null);
            }}
          />

        </div>


        {/* Food list */}

        {!selectedFood && (
          <div className="logger-food-list">

            {loadingFoods ? (
              <p>Loading foods...</p>
            ) : filteredFoods.length === 0 ? (
              <div className="logger-empty">
                <div>🍽️</div>

                <p>
                  No matching foods found.
                </p>
              </div>
            ) : (
              filteredFoods.map(
                (food) => (
                  <button
                    key={food._id}
                    className="logger-food-item"
                    onClick={() =>
                      handleSelectFood(
                        food
                      )
                    }
                  >

                    <div>
                      <strong>
                        {food.name}
                      </strong>

                      {food.brand && (
                        <small>
                          {food.brand}
                        </small>
                      )}
                    </div>

                    <div>
                      <strong>
                        {food.calories}
                      </strong>

                      <small>
                        kcal /{" "}
                        {
                          food.servingSize
                        }{" "}
                        {
                          food.servingUnit
                        }
                      </small>
                    </div>

                  </button>
                )
              )
            )}

          </div>
        )}


        {/* ==================================================== */}
        {/* SELECTED FOOD */}
        {/* ==================================================== */}

        {selectedFood && (
          <div className="selected-food">

            <div className="selected-food-header">

              <div>
                <h3>
                  {selectedFood.name}
                </h3>

                {selectedFood.brand && (
                  <p>
                    {selectedFood.brand}
                  </p>
                )}
              </div>

              <button
                className="close-button"
                onClick={() => {
                  setSelectedFood(null);
                  setQuantity("");
                  setSearch("");
                }}
              >
                ×
              </button>

            </div>


            {/* Quantity */}

            <div className="quantity-section">

              <label>
                How much did you eat?
              </label>

              <div className="quantity-input">

                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    selectedFood.servingSize
                  }
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value
                    )
                  }
                />

                <span>
                  {
                    selectedFood.servingUnit
                  }
                </span>

              </div>

              <small>
                Base serving:{" "}
                {
                  selectedFood.servingSize
                }{" "}
                {
                  selectedFood.servingUnit
                }
              </small>

            </div>


            {/* Nutrition preview */}

            {preview && (
              <div className="nutrition-preview">

                <div>
                  <strong>
                    {Math.round(
                      preview.calories
                    )}
                  </strong>

                  <span>
                    kcal
                  </span>
                </div>

                <div>
                  <strong>
                    {preview.protein.toFixed(
                      1
                    )}
                    g
                  </strong>

                  <span>
                    Protein
                  </span>
                </div>

                <div>
                  <strong>
                    {preview.carbohydrates.toFixed(
                      1
                    )}
                    g
                  </strong>

                  <span>
                    Carbs
                  </span>
                </div>

                <div>
                  <strong>
                    {preview.fat.toFixed(
                      1
                    )}
                    g
                  </strong>

                  <span>
                    Fat
                  </span>
                </div>

                <div>
                  <strong>
                    {preview.fiber.toFixed(
                      1
                    )}
                    g
                  </strong>

                  <span>
                    Fiber
                  </span>
                </div>

              </div>
            )}


            {/* Add button */}

            <button
              className="primary-button add-log-button"
              onClick={
                handleAddFood
              }
              disabled={saving}
            >
              {saving
                ? "Adding..."
                : `Add to ${
                    MEALS.find(
                      (meal) =>
                        meal.id ===
                        selectedMeal
                    )?.label
                  }`}
            </button>

          </div>
        )}

      </div>


      {/* ====================================================== */}
      {/* TODAY'S LOG */}
      {/* ====================================================== */}

      <div className="today-log-card">

        <div className="today-log-header">
          <div>
            <h2>
              Today's Food
            </h2>

            <p>
              {date}
            </p>
          </div>
        </div>


        {MEALS.map((meal) => {
          const logs =
            getMealLogs(meal.id);

          return (
            <div
              className="meal-log-section"
              key={meal.id}
            >

              <div className="meal-log-header">

                <div>
                  <span>
                    {meal.emoji}
                  </span>

                  <strong>
                    {meal.label}
                  </strong>
                </div>

                <strong>
                  {Math.round(
                    getMealCalories(
                      meal.id
                    )
                  )}{" "}
                  kcal
                </strong>

              </div>


              {logs.length === 0 ? (
                <p className="no-food">
                  No food logged
                </p>
              ) : (
                logs.map((log) => (
                  <div
                    className="food-log-row"
                    key={log._id}
                  >

                    <div>
                      <strong>
                        {log.foodName}
                      </strong>

                      <small>
                        {
                          log.consumedQuantity
                        }{" "}
                        {
                          log.servingUnit
                        }
                      </small>
                    </div>

                    <div>
                      <strong>
                        {Math.round(
                          log
                            .nutritionTotal
                            ?.calories ||
                            0
                        )}{" "}
                        kcal
                      </strong>

                      <small>
                        {(
                          log
                            .nutritionTotal
                            ?.protein ||
                          0
                        ).toFixed(1)}
                        g protein
                      </small>
                    </div>

                    <button
                      className="delete-log-button"
                      onClick={() =>
                        handleDeleteLog(
                          log._id
                        )
                      }
                    >
                      🗑️
                    </button>

                  </div>
                ))
              )}

            </div>
          );
        })}

      </div>

    </div>
  );
}

export default FoodLogger;