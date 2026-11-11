// The main "log a food" card of the food logger (meal chips, search, quantity, save). Split out of FoodLogger.jsx; it gets everything it needs as props.
import FoodTrust from "../FoodTrust";
import FitPreview from "../FitPreview";
import { GlycemicTag, PairingTip } from "../GlycemicTag";
import PortionGuide from "../PortionGuide";

export function LoggerCard(props) {
  const { MEALS, RepeatPreview, addPicked, date, diab, fetchFoodLogs, filteredFoods, handleAddFood, handleSelectFood, loadingFoods, multi, picked, preview, quantity, recent, repeatMode, resetServing, saving, search, searchFocus, searching, selectedFood, selectedMeal, serveSize, servings, setMulti, setPicked, setRepeatMode, setSearch, setSearchFocus, setSelectedFood, setServeSize, setServings, setShowAddFood, setShowAll, setShowExtras, showExtras, toggleDiab, togglePick, visibleFoods } = props;
  return (
    <>
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
          data-tour="food-search"
          placeholder="🔍 Search your saved foods..."
          value={search}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
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
          <button type="button" className="chip" onClick={() => setRepeatMode("yesterday")}>⟲ Copy yesterday's {selectedMeal}</button>
          <button type="button" className="chip" onClick={() => setRepeatMode("last")}>⟲ Same as last time</button>
          <button type="button" className="chip" aria-pressed={diab} onClick={toggleDiab}>{diab ? "✓ Diabetes-friendly view" : "🩺 Diabetes-friendly view"}</button>
          <button type="button" className="chip" aria-pressed={multi} onClick={() => { setMulti(!multi); setPicked({}); }}>{multi ? "✕ Stop selecting" : "☑ Select several"}</button>
          <button type="button" className="chip" onClick={() => setShowExtras((v) => !v)}>{showExtras ? "− Fewer options" : "＋ Type a meal · Eating out · Suggestions"}</button>
        </div>
      )}

      {multi && Object.keys(picked).length > 0 && (
        <div className="multi-bar" role="group" aria-label="Selected foods">
          {Object.values(picked).map(({ food, quantity: q }) => (
            <span key={food._id} className="repeat-row">{food.name}
              <input type="number" min="0.01" step="any" value={q} aria-label={`Amount of ${food.name}`} onChange={(e) => setPicked({ ...picked, [food._id]: { food, quantity: e.target.value } })} />
              <small>{food.servingUnit}</small></span>
          ))}
          <button type="button" className="primary-button" onClick={addPicked}>Add {Object.keys(picked).length} to {selectedMeal}</button>
        </div>
      )}

      {diab && <p className="diabetes-note">{"This view is general information, not medical advice. If you have diabetes or take medicines for it, please follow your doctor's or dietitian's advice. Glycemic values are averages and only some foods have one."}</p>}

      {repeatMode && <RepeatPreview date={date} meal={selectedMeal} mode={repeatMode} onClose={() => setRepeatMode(null)} onDone={() => { setRepeatMode(null); fetchFoodLogs(); }} />}

      {/* Food list */}

      {/* The list appears only while you are typing or the search box is active; otherwise the page stays short. */}
      {!selectedFood && (searching || searchFocus) && (
        <div className="logger-food-list" onMouseDown={(e) => e.preventDefault()}>

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
                  className={`logger-food-item${picked[food._id] ? " picked" : ""}`}
                  aria-pressed={multi ? !!picked[food._id] : undefined}
                  onClick={() => (multi ? togglePick(food) : handleSelectFood(food))}
                >
                  {multi && <span aria-hidden="true">{picked[food._id] ? "☑" : "☐"}</span>}

                  <div>
                    <strong>
                      {food.name}
                    </strong>
                    <GlycemicTag food={food} />

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
              <FoodTrust food={selectedFood} />
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

            <PortionGuide />
            <PairingTip food={selectedFood} />
            <FitPreview foodId={selectedFood._id} quantity={quantity} date={date} />

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
    </>
  );
}
