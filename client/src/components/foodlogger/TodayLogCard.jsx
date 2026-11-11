// The "Today's log" card of the food logger. Split out of FoodLogger.jsx; it gets everything it needs as props.
import { BuddyEmpty } from "../../motion/Buddy";
import { Fragment } from "react";
import PortionEdit from "../PortionEdit";

export function TodayLogCard(props) {
  const { MEALS, date, dragId, dropMeal, editBusy, editId, foodLogs, getMealCalories, getMealLogs, handleDeleteLog, handleEditQty, handleMoveLog, openMeals, selectedMeal, setDragId, setDropMeal, setEditId, setOpenMeals } = props;
  return (
    <>
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
                <Fragment key={log._id}>
                <div
                  className={`food-log-row ${dragId === log._id ? "dragging" : ""}`}
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

                  <button type="button" className="edit-log-button" aria-expanded={editId === log._id} aria-label={`Edit amount of ${log.foodName}`} onClick={() => setEditId(editId === log._id ? null : log._id)}>✏️ Edit</button>

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
                {editId === log._id && (
                  <PortionEdit name={log.foodName} foodId={log.foodId?._id || log.foodId} quantity={log.consumedQuantity} unit={log.servingUnit} calories={log.nutritionTotal?.calories || 0} protein={log.nutritionTotal?.protein || 0}
                    busy={editBusy} onCancel={() => setEditId(null)} onSave={(q) => handleEditQty(log, q)} />
                )}
                </Fragment>
              ))
            )}

          </div>
        );
      })}

    </div>
    </>
  );
}
