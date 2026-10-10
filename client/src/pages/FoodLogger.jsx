import { confirmAction } from "../utils/confirm";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../config";
import FoodFormModal from "../components/FoodFormModal";
import CalorieBalance from "../components/CalorieBalance";
import TextLogger from "../components/TextLogger";
import SmartSuggestions from "../components/SmartSuggestions";
import EatingOut from "../components/EatingOut";
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

function FoodLogger({ date, onBack, goTo }) {
  const [dragId, setDragId] = useState(null);
  const [dropMeal, setDropMeal] = useState(null);
  const [foods, setFoods] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);

  const [selectedMeal, setSelectedMeal] =
    useState("breakfast");

  const [selectedFood, setSelectedFood] =
    useState(null);

  // Servings x serving size = total amount eaten (in the food's own unit).
  const [servings, setServings] = useState("1");
  const [serveSize, setServeSize] = useState("");
  const total = (Number(servings) || 0) * (Number(serveSize) || 0);
  const quantity = total > 0 ? String(Math.round(total * 100) / 100) : "";
  const resetServing = () => { setServings("1"); setServeSize(""); };

  // Copy everything logged for the selected meal yesterday onto today.
  const copyYesterday = async () => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    const pad = (n) => String(n).padStart(2, "0");
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    try {
      const response = await apiFetch(`${API_URL}/api/food-logs/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate: from, toDate: date, mealType: selectedMeal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not copy");
      if (!data.logs?.length) notify(`You didn't log any ${selectedMeal} yesterday.`, "error");
      else notify(`Copied ${data.logs.length} item(s) from yesterday's ${selectedMeal}.`, "success");
      await fetchFoodLogs();
    } catch (error) {
      notify(error.message || "Could not copy", "error");
    }
  };

  const [search, setSearch] = useState("");

  const [loadingFoods, setLoadingFoods] =
    useState(true);

  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [showExtras, setShowExtras] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openMeals, setOpenMeals] = useState({});
  const searchSeq = useRef(0);

  // Add-a-new-food modal (so a missing food can be created without leaving this screen)
  const [showAddFood, setShowAddFood] = useState(false);

  // ============================================================
  // LOAD SAVED FOODS
  // ============================================================

  // The catalogue is big (700+ foods), so it is searched on the server as you type; what you see before typing is your recent foods.
  const fetchFoods = async () => {
    try {
      setLoadingFoods(true);
      const response = await apiFetch(`${API_URL}/api/foods/recent`);
      const data = await response.json();
      if (data.success) setRecent(data.foods);
    } catch (error) {
      console.error("Failed to fetch recent foods:", error);
    } finally {
      setLoadingFoods(false);
    }
  };

  // Debounced server-side search; answers that arrive after a newer keystroke are ignored.
  useEffect(() => {
    if (selectedFood) return undefined;
    const value = search.trim();
    if (!value) { setFoods([]); setShowAll(false); return undefined; }
    setLoadingFoods(true);
    const id = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`${API_URL}/api/foods?search=${encodeURIComponent(value)}&limit=40`);
        const d = await r.json();
        if (d.success && id === searchSeq.current) setFoods(d.foods);
      } catch (error) {
        console.error("Food search failed:", error);
      } finally {
        if (id === searchSeq.current) setLoadingFoods(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, selectedFood]);

  // ============================================================
  // LOAD TODAY'S FOOD LOGS
  // ============================================================

  const fetchFoodLogs = async () => {
    try {
      const response = await apiFetch(
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

  const searching = search.trim().length > 0;
  const filteredFoods = useMemo(() => (searching ? foods : recent), [foods, recent, searching]);
  const visibleFoods = showAll ? filteredFoods : filteredFoods.slice(0, 8);

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

    setServings("1");
    setServeSize(String(food.servingSize));

    setSearch(food.name);
  };

  // ============================================================
  // NEW CUSTOM FOOD SAVED -> add to list and select it
  // ============================================================

  const handleFoodCreated = (food) => {
    setFoods((prev) => [food, ...prev]);
    setShowAddFood(false);
    handleSelectFood(food);
  };

  // ============================================================
  // ADD FOOD TO LOG
  // ============================================================

  const handleAddFood = async () => {
    if (!selectedFood) {
      notify("Please select a food.", "error");
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      notify("Please enter the quantity.", "error");
      return;
    }

    try {
      setSaving(true);

      const response = await apiFetch(
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
        notify(
          data.message ||
            "Failed to add food."
        , "error");

        return;
      }

      // Refresh today's logs
      await fetchFoodLogs();

      // Reset selection
      setSelectedFood(null);
      resetServing();
      setSearch("");
    } catch (error) {
      console.error(
        "Failed to add food:",
        error
      );

      notify(
        "Could not connect to the backend."
      , "error");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // DELETE FOOD LOG
  // ============================================================

  const handleDeleteLog = async (id) => {
    const confirmed = await confirmAction(
      "Remove this food from today's log?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await apiFetch(
        `${API_URL}/api/food-logs/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        notify(
          data.message ||
            "Failed to delete food log."
        , "error");

        return;
      }

      await fetchFoodLogs();
    } catch (error) {
      console.error(
        "Failed to delete food log:",
        error
      );

      notify(
        "Could not connect to the backend."
      , "error");
    }
  };

  // ============================================================
  // MOVE A LOGGED FOOD TO ANOTHER MEAL (breakfast -> lunch, etc.)
  // ============================================================

  const handleMoveLog = async (id, mealType) => {
    const before = foodLogs;
    setFoodLogs((cur) => cur.map((l) => (l._id === id ? { ...l, mealType } : l))); // instant: it appears in the new meal right away
    try {
      const response = await apiFetch(`${API_URL}/api/food-logs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealType }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFoodLogs(before);
        notify(data.message || "Could not move this food.", "error");
      }
    } catch (error) {
      console.error("Failed to move food log:", error);
      setFoodLogs(before);
      notify("Could not connect to the backend.", "error");
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

          {goTo && (
            <span className="food-logger-links">
              <button className="secondary-button" onClick={() => goTo("planner")}>📅 Meal planner</button>
              <button className="secondary-button" onClick={() => goTo("recipes")}>🍲 Recipes</button>
            </span>
          )}

          <div className="bd-head"><h1>Log Food</h1><Buddy scene="eat" size={76} says="What's on the plate?" /></div>

          <p>
            Add everything you ate today.
          </p>
        </div>

      </div>

      <CalorieBalance compact refreshKey={`${foodLogs.length}|${foodLogs.reduce((t, l) => t + Number(l.nutritionTotal?.calories || 0), 0)}`} />

      {/* Which meal? Chosen once — everything below logs to it. */}
      <div className="meal-selector">
        {MEALS.map((meal) => {
          const kc = Math.round(getMealCalories(meal.id));
          return (
            <button
              key={meal.id}
              className={selectedMeal === meal.id ? "meal-button active" : "meal-button"}
              onClick={() => { setSelectedMeal(meal.id); setSelectedFood(null); resetServing(); }}
            >
              <span>{meal.emoji}</span>
              <strong>{meal.label}</strong>
              <small className="meal-kcal">{kc ? `${kc} kcal` : "—"}</small>
            </button>
          );
        })}
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

          <button
            type="button"
            className="secondary-button add-food-inline"
            onClick={() => setShowAddFood(true)}
          >
            + New food
          </button>

        </div>


        {!selectedFood && (
          <div className="serving-chips logger-quick">
            <button type="button" className="chip" onClick={copyYesterday}>⟲ Same {selectedMeal} as yesterday</button>
            <button type="button" className="chip" onClick={() => setShowExtras((v) => !v)}>{showExtras ? "− Fewer options" : "＋ Type a meal · Eating out · Suggestions"}</button>
          </div>
        )}

        {/* Food list */}

        {!selectedFood && (
          <div className="logger-food-list">

            {!searching && recent.length > 0 && <p className="logger-list-label">Recent — tap to add</p>}
            {loadingFoods && filteredFoods.length === 0 ? (
              <p>Loading foods...</p>
            ) : !searching && recent.length === 0 ? (
              <div className="logger-empty"><p>Start typing to search 700+ Indian and everyday foods — or add your own.</p></div>
            ) : filteredFoods.length === 0 ? (
              <div className="logger-empty">
                <div>🍽️</div>

                <p>
                  No matching foods found.
                </p>

                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowAddFood(true)}
                >
                  {search.trim()
                    ? `+ Add "${search.trim().slice(0, 40)}" as a new food`
                    : "+ Add a new food"}
                </button>
              </div>
            ) : (
              visibleFoods.map(
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

            {!loadingFoods && filteredFoods.length > visibleFoods.length && (
              <button type="button" className="secondary-button logger-show-all" onClick={() => setShowAll(true)}>Show all {filteredFoods.length} ›</button>
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
                aria-label="Close"
                onClick={() => {
                  setSelectedFood(null);
                  resetServing();
                  setSearch("");
                }}
              >
                ×
              </button>

            </div>


            {/* Servings + serving size */}

            <div className="quantity-section">

              <div className="serving-grid">
                <div className="form-group">
                  <label>Servings</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="1"
                    value={servings}
                    onChange={(event) => setServings(event.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Serving size ({selectedFood.servingUnit})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder={selectedFood.servingSize}
                    value={serveSize}
                    onChange={(event) => setServeSize(event.target.value)}
                  />
                </div>
              </div>

              {selectedFood.units?.length > 0 && (
                <div className="serving-chips" aria-label="Household measures">
                  {selectedFood.units.map((u) => (
                    <button
                      type="button"
                      key={u.label}
                      className={Number(serveSize) === u.quantity ? "chip active" : "chip"}
                      onClick={() => setServeSize(String(u.quantity))}
                    >
                      1 {u.label} = {u.quantity}{selectedFood.servingUnit}
                    </button>
                  ))}
                </div>
              )}

              <div className="serving-chips">
                {[0.5, 1, 1.5, 2].map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={Number(servings) === n ? "chip active" : "chip"}
                    onClick={() => setServings(String(n))}
                  >
                    {n}×
                  </button>
                ))}
              </div>

              <small>
                Standard serving: {selectedFood.servingSize} {selectedFood.servingUnit}
                {quantity ? ` · you are logging ${quantity} ${selectedFood.servingUnit} in total` : ""}
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


      {showExtras && (
        <div className="logger-extras">
          <TextLogger date={date} defaultMeal={selectedMeal} onLogged={fetchFoodLogs} />
          <EatingOut date={date} defaultMeal={selectedMeal} onLogged={fetchFoodLogs} />
          <SmartSuggestions date={date} mealType={selectedMeal} refreshKey={foodLogs.length} onLogged={fetchFoodLogs} />
        </div>
      )}

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
          const isOpen = selectedMeal === meal.id || !!openMeals[meal.id];
          if (!isOpen && logs.length === 0 && !dragId) return null; // empty, unselected meals stay out of the way

          return (
            <div
              data-meal={meal.id}
              className={`meal-log-section ${dropMeal === meal.id ? "drop-target" : ""}`}
              key={meal.id}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropMeal(meal.id); } }}
              onDragLeave={() => setDropMeal((m) => (m === meal.id ? null : m))}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId || e.dataTransfer.getData("text/plain");
                setDragId(null); setDropMeal(null);
                const log = foodLogs.find((l) => l._id === id);
                if (log && log.mealType !== meal.id) handleMoveLog(id, meal.id);
              }}
            >

              <div className="meal-log-header" role="button" tabIndex={0} onClick={() => setOpenMeals((o) => ({ ...o, [meal.id]: !isOpen }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenMeals((o) => ({ ...o, [meal.id]: !isOpen })); }}>

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


              {!isOpen ? null : logs.length === 0 ? (
                <BuddyEmpty scene="sad" size={96} title="No food logged">Add something you ate.</BuddyEmpty>
              ) : (
                logs.map((log) => (
                  <div
                    className={`food-log-row ${dragId === log._id ? "dragging" : ""}`}
                    key={log._id}
                    draggable
                    onDragStart={(e) => { setDragId(log._id); e.dataTransfer.setData("text/plain", log._id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragId(null); setDropMeal(null); }}
                    title="Drag to another meal"
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

                    <select
                      className="move-log-select"
                      aria-label={`Move ${log.foodName} to another meal`}
                      value=""
                      onChange={(e) => e.target.value && handleMoveLog(log._id, e.target.value)}
                    >
                      <option value="">Move to…</option>
                      {MEALS.filter((m) => m.id !== log.mealType).map((m) => (
                        <option key={m.id} value={m.id}>{m.emoji} {m.label}</option>
                      ))}
                    </select>

                    <button
                      className="delete-log-button"
                      aria-label="Delete food log"
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


      {showAddFood && (
        <FoodFormModal
          initialName={search.trim()}
          onClose={() => setShowAddFood(false)}
          onSaved={handleFoodCreated}
        />
      )}

    </div>
  );
}

export default FoodLogger;