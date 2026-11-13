import { confirmAction } from "../utils/confirm";
import { LoggerCard } from "../components/foodlogger/LoggerCard";
import { TodayLogCard } from "../components/foodlogger/TodayLogCard";
import { undoGate, undoNotice } from "../utils/undo";
import Buddy, { BuddyEmpty } from "../motion/Buddy";
import { notify } from "../utils/notify";
import { apiFetch } from "../config/api";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import PortionEdit from "../components/PortionEdit";
import { API_URL } from "../config";
import FoodFormModal from "../components/FoodFormModal";
import CalorieBalance from "../components/CalorieBalance";
import { useCoachTone } from "../utils/coachTone";
import TextLogger from "../components/TextLogger";
import SmartSuggestions from "../components/SmartSuggestions";
import EatingOut from "../components/EatingOut";
import IntakeBanner from "../components/IntakeBanner";
import EntryCheck from "../components/EntryCheck";
import FoodTrust from "../components/FoodTrust";
import FoodMismatchNote from "../components/FoodMismatchNote";
import ChaiCounter from "../components/ChaiCounter";
import CookIdeas from "../components/CookIdeas";
import TiffinPlanner from "../components/TiffinPlanner";
import FitPreview from "../components/FitPreview";
import { GlycemicTag, PairingTip } from "../components/GlycemicTag";
import "../components/logging2.css";
import RepeatPreview from "../components/RepeatPreview";
import PortionGuide from "../components/PortionGuide";
import "../components/logging1.css";
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
  const tone = useCoachTone();
  const [dragId, setDragId] = useState(null);
  const [dropMeal, setDropMeal] = useState(null);
  const [foods, setFoods] = useState([]);
  const [foodLogs, setFoodLogs] = useState([]);

  // Home's meal rows ("+" next to Lunch) hand over which meal to log to, once.
  const [selectedMeal, setSelectedMeal] =
    useState(() => {
      try {
        const m = sessionStorage.getItem("ff_log_meal");
        sessionStorage.removeItem("ff_log_meal");
        if (["breakfast", "lunch", "dinner", "snacks"].includes(m)) return m;
      } catch { /* storage unavailable */ }
      return "breakfast";
    });

  const [selectedFood, setSelectedFood] =
    useState(null);

  // Servings x serving size = total amount eaten (in the food's own unit).
  const [servings, setServings] = useState("1");
  const [serveSize, setServeSize] = useState("");
  const total = (Number(servings) || 0) * (Number(serveSize) || 0);
  const quantity = total > 0 ? String(Math.round(total * 100) / 100) : "";
  const resetServing = () => { setServings("1"); setServeSize(""); };

  // Copy yesterday / same as last time: opens a preview (quantities editable) before anything is saved.
  const [repeatMode, setRepeatMode] = useState(null);

  // Multi-select: tick several foods, edit amounts, add them all in one tap.
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState({}); // foodId -> { food, quantity }
  const togglePick = (food) => setPicked((p) => {
    if (p[food._id]) { const { [food._id]: _drop, ...rest } = p; return rest; } // eslint-disable-line no-unused-vars
    return { ...p, [food._id]: { food, quantity: String(food.servingSize || 1) } };
  });
  const addPicked = async () => {
    const items = Object.values(picked).map((x) => ({ foodId: x.food._id, quantity: Number(x.quantity) || x.food.servingSize || 1 }));
    if (!items.length) return;
    try {
      const response = await apiFetch(`${API_URL}/api/food-logs/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, mealType: selectedMeal, items, clientId: `multi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not add those");
      notify(`Added ${items.length} food${items.length === 1 ? "" : "s"} to ${selectedMeal}.`, "success");
      setPicked({}); setMulti(false);
      await fetchFoodLogs();
    } catch (error) { notify(error.message || "Could not add those", "error"); }
  };

  const [search, setSearch] = useState("");

  const [loadingFoods, setLoadingFoods] =
    useState(true);

  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [showExtras, setShowExtras] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  useEffect(() => { try { const q = sessionStorage.getItem("ff_palette_food"); if (q) { sessionStorage.removeItem("ff_palette_food"); setSearch(q); } } catch { /* ignore */ } }, []);
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
    }, 110);
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
  // Optional diabetes-friendly view (kept on this device only): foods with a LOW glycemic load first, HIGH ones last, unlisted ones in between.
  const [diab, setDiab] = useState(() => { try { return localStorage.getItem("ff-diabetes-view") === "1"; } catch { return false; } });
  const toggleDiab = () => setDiab((v) => { const n = !v; try { localStorage.setItem("ff-diabetes-view", n ? "1" : "0"); } catch { /* private mode */ } return n; });
  const glRank = (f) => ({ low: 0, medium: 1 }[f.glycemic?.glBand || f.glycemic?.giBand] ?? (f.glycemic?.known ? 3 : 2));
  const filteredFoods = useMemo(() => {
    const base = searching ? foods : recent;
    return diab ? [...base].sort((a, b) => glRank(a) - glRank(b)) : base;
  }, [foods, recent, searching, diab]);
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

    // Start from what you usually eat of this food (typical logged amount, nearest half serving).
    const usual = Number(food.usualQuantity) || 0;
    const per = Number(food.servingSize) || 1;
    setServings(String(usual > 0 ? Math.min(6, Math.max(0.5, Math.round((usual / per) * 2) / 2)) : 1));
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
    const go = await undoGate({ what: "Food", hide: () => setFoodLogs((cur) => cur.filter((l) => l._id !== id)), restore: () => fetchFoodLogs() });
    if (!go) return;

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

  // ---- change the amount of a logged food (the server recalculates nutrition from the stored snapshot)
  const [editId, setEditId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const handleEditQty = async (log, quantity) => {
    setEditBusy(true);
    try {
      const response = await apiFetch(`${API_URL}/api/food-logs/${log._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { notify(data.message || "Could not change the amount.", "error"); return; }
      setFoodLogs((cur) => cur.map((l) => (l._id === log._id ? { ...l, ...data.log } : l)));
      setEditId(null);
      const before = Number(log.consumedQuantity);
      undoNotice({ message: `${log.foodName} is now ${quantity} ${log.servingUnit}`, onUndo: async () => {
        await apiFetch(`${API_URL}/api/food-logs/${log._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: before }) });
        try { await fetchFoodLogs(); } catch { /* ignore */ }
      } });
      try { await fetchFoodLogs(); } catch { /* the list already shows the saved value */ }
    } catch { notify("Could not connect to the backend.", "error"); } finally { setEditBusy(false); }
  };

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

          <div className="bd-head"><h1>Log Food</h1><Buddy who="luffy" scene="eat" size={76} says="What's on the plate?" /></div>

          <p>
            Add everything you ate today.
          </p>
          {!tone.gentle && <IntakeBanner onPlan={() => goTo?.("planner")} />}
          {!tone.gentle && <EntryCheck refreshKey={`${foodLogs.length}|${foodLogs.reduce((t, l) => t + Number(l.nutritionTotal?.calories || 0), 0)}`} />}
        </div>

      </div>

      {!tone.gentle && <FoodMismatchNote logs={foodLogs} />}
      {!tone.gentle && <CalorieBalance compact refreshKey={`${foodLogs.length}|${foodLogs.reduce((t, l) => t + Number(l.nutritionTotal?.calories || 0), 0)}`} />}

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

      <LoggerCard MEALS={MEALS} RepeatPreview={RepeatPreview} addPicked={addPicked} date={date} diab={diab} fetchFoodLogs={fetchFoodLogs} filteredFoods={filteredFoods} handleAddFood={handleAddFood} handleSelectFood={handleSelectFood} loadingFoods={loadingFoods} multi={multi} picked={picked} preview={preview} quantity={quantity} recent={recent} repeatMode={repeatMode} resetServing={resetServing} saving={saving} search={search} searchFocus={searchFocus} searching={searching} selectedFood={selectedFood} selectedMeal={selectedMeal} serveSize={serveSize} servings={servings} setMulti={setMulti} setPicked={setPicked} setRepeatMode={setRepeatMode} setSearch={setSearch} setSearchFocus={setSearchFocus} setSelectedFood={setSelectedFood} setServeSize={setServeSize} setServings={setServings} setShowAddFood={setShowAddFood} setShowAll={setShowAll} setShowExtras={setShowExtras} showExtras={showExtras} toggleDiab={toggleDiab} togglePick={togglePick} visibleFoods={visibleFoods} />


      {showExtras && (
        <div className="logger-extras">
          <TextLogger date={date} defaultMeal={selectedMeal} onLogged={fetchFoodLogs} />
          <CookIdeas date={date} mealType={selectedMeal} onLogged={fetchFoodLogs} />
          <TiffinPlanner />
          <ChaiCounter date={date} onLogged={fetchFoodLogs} />
          <EatingOut date={date} defaultMeal={selectedMeal} onLogged={fetchFoodLogs} />
          <SmartSuggestions date={date} mealType={selectedMeal} refreshKey={foodLogs.length} onLogged={fetchFoodLogs} />
        </div>
      )}

      {/* ====================================================== */}
      {/* TODAY'S LOG */}
      {/* ====================================================== */}

      <TodayLogCard MEALS={MEALS} date={date} dragId={dragId} dropMeal={dropMeal} editBusy={editBusy} editId={editId} foodLogs={foodLogs} getMealCalories={getMealCalories} getMealLogs={getMealLogs} handleDeleteLog={handleDeleteLog} handleEditQty={handleEditQty} handleMoveLog={handleMoveLog} openMeals={openMeals} selectedMeal={selectedMeal} setDragId={setDragId} setDropMeal={setDropMeal} setEditId={setEditId} setOpenMeals={setOpenMeals} />


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