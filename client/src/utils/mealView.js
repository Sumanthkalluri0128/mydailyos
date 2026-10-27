// Web twin of mobile src/utils/mealView.ts (generated from it: keep the two in step). Pure helpers for the planner: offline overlay, day bar, chef lines.
// The meal planner's merged day view (GET /api/meal-plans/view) on the phone. Pure and unit-tested.
//   * types for what the server returns
//   * the offline overlay: a food logged / planned while offline changes the cached view straight away, with the same
//     maths as the server (logged + planned merged, nothing counted twice), so the planner and Home agree without a signal
//   * the chef character's lines ("Dinner is open: 420 kcal and 25 g protein to go")
// same prefix as utils/optimistic.ts (kept local so the two files do not import each other)
const localId = (clientId) => `local:${clientId}`;
export const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_NAME = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
const n0 = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const r0 = (x) => Math.round(n0(x));
const r1 = (x) => Math.round(n0(x) * 10) / 10;
const zero = () => ({ calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 });
const sum = (items) => { const t = zero(); for (const it of items) {
    t.calories += n0(it.calories);
    t.protein += n0(it.protein);
    t.fiber += n0(it.fiber);
    t.carbohydrates += n0(it.carbohydrates);
    t.fat += n0(it.fat);
} return { calories: r0(t.calories), protein: r1(t.protein), fiber: r1(t.fiber), carbohydrates: r0(t.carbohydrates), fat: r0(t.fat) }; };
// ------------------------------------------------------------------------------------------------ dates / paths
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDaysIso = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
export const weekStart = (s) => addDaysIso(s, -((parse(s).getDay() + 6) % 7));
/** The one URL the planner reads. Prefetched for the current week so the planner opens with no signal. */
export const planViewPath = (start, today) => `/api/meal-plans/view?from=${start}&to=${addDaysIso(start, 6)}&today=${today}`;
// ------------------------------------------------------------------------------------------------ recompute
/** Recomputes every total and the day bar from the items (used after an offline change). Never double counts: each item is one status. */
export function recomputeDay(day) {
    const meals = {};
    for (const m of MEAL_IDS) {
        const src = day.meals[m];
        const items = [...src.items].sort((a, b) => (a.status === b.status ? 0 : a.status === 'logged' ? -1 : 1));
        const logged = sum(items.filter((i) => i.status === 'logged'));
        const planned = sum(items.filter((i) => i.status === 'planned'));
        const total = sum(items.filter((i) => i.status !== 'suggested'));
        // an empty meal that now holds food is no longer "open"; the exact gap comes back from the server when we are online again
        const hint = src.hint && src.hint.kind === 'open' && total.calories > 0 ? { ...src.hint, kind: 'done', protein: 0 } : src.hint;
        meals[m] = { ...src, items, logged, planned, total, hint };
    }
    const logged = sum(MEAL_IDS.map((m) => meals[m].logged));
    const planned = sum(MEAL_IDS.map((m) => meals[m].planned));
    const b = day.budget;
    const eaten = r0(logged.calories), plan = r0(planned.calories);
    const budget = { ...b, eaten, planned: plan, remaining: b.budget - eaten, remainingAfterPlan: b.budget - eaten - plan };
    for (const m of MEAL_IDS) {
        const h = meals[m].hint;
        if (h && (h.kind === 'open' || h.kind === 'over'))
            meals[m] = { ...meals[m], hint: { ...h, kcal: Math.max(0, Math.min(h.kcal, budget.remainingAfterPlan)) } };
    }
    return { ...day, meals, logged, planned, total: sum([logged, planned]), budget, complete: dayComplete({ readOnly: day.readOnly, meals }) };
}
/** A day is complete when breakfast, lunch and dinner are logged and nothing planned is left to eat. */
export function dayComplete(day) {
    if (day.readOnly)
        return false;
    const main = ['breakfast', 'lunch', 'dinner'];
    if (!main.every((m) => day.meals[m].logged.calories > 0))
        return false;
    return MEAL_IDS.every((m) => !day.meals[m].items.some((i) => i.status === 'planned'));
}
const mapDays = (view, date, fn) => {
    if (!view?.days?.some((d) => d.date === date))
        return view;
    return { ...view, days: view.days.map((d) => (d.date === date ? recomputeDay(fn(d)) : d)) };
};
const swapItems = (day, meal, fn) => ({ ...day, meals: { ...day.meals, [meal]: { ...day.meals[meal], items: fn(day.meals[meal].items) } } });
// ------------------------------------------------------------------------------------------------ offline overlay
/** "Log" on a planned item while offline: the planned row becomes a logged row (once), in place. */
export function applyPlanLog(view, o) {
    if (!view?.days)
        return view;
    for (const d of view.days)
        for (const m of MEAL_IDS) {
            const it = d.meals[m].items.find((i) => i.id === o.planId && i.status === 'planned');
            if (!it)
                continue;
            if (o.date && o.date !== d.date)
                continue;
            return mapDays(view, d.date, (day) => swapItems(day, m, (items) => items.map((i) => (i.id === o.planId ? { ...i, id: localId(o.clientId), status: 'logged', source: 'log', fromPlan: true, planId: o.planId, pending: o.pending !== false } : i))));
        }
    return view;
}
/** A food logged directly while offline. If a planned item for the same meal + food is waiting, that one is done (counted once). */
export function applyFoodLog(view, o) {
    const day = view?.days?.find((d) => d.date === o.date);
    if (!day)
        return view;
    if (day.meals[o.mealType]?.items.some((i) => i.id === localId(o.clientId)))
        return view; // already shown (same client id)
    return mapDays(view, o.date, (d) => swapItems(d, o.mealType, (items) => {
        const plannedHit = o.foodId ? items.find((i) => i.status === 'planned' && String(i.foodId) === String(o.foodId)) : undefined;
        const rest = plannedHit ? items.filter((i) => i !== plannedHit) : items;
        const n = o.nutritionTotal || {};
        const logged = {
            id: localId(o.clientId), status: 'logged', source: 'log', date: o.date, mealType: o.mealType, foodId: o.foodId ?? null, foodName: o.foodName, quantity: r1(o.quantity ?? 1), servingUnit: o.servingUnit || '',
            calories: r0(n.calories), protein: r1(n.protein), fiber: r1(n.fiber), carbohydrates: r0(n.carbohydrates), fat: r0(n.fat), fromPlan: !!plannedHit, planId: plannedHit?.id ?? null, pending: o.pending !== false,
        };
        return [...rest, logged];
    }));
}
/** "Add to plan" while offline: a planned row appears (it keeps a local id until it syncs). */
export function applyPlanAdd(view, o) {
    const day = view?.days?.find((d) => d.date === o.date);
    if (!day || day.readOnly)
        return view;
    if (day.meals[o.mealType]?.items.some((i) => i.id === localId(o.clientId)))
        return view;
    const n = o.nutrition || {};
    const it = { id: localId(o.clientId), status: 'planned', source: 'plan', date: o.date, mealType: o.mealType, foodId: o.foodId ?? null, foodName: o.foodName, quantity: r1(o.quantity), servingUnit: o.servingUnit, calories: r0(n.calories), protein: r1(n.protein), fiber: r1(n.fiber), carbohydrates: r0(n.carbohydrates), fat: r0(n.fat), why: o.why || '', pending: o.pending !== false };
    return mapDays(view, o.date, (d) => swapItems(d, o.mealType, (items) => [...items, it]));
}
/** A logged food deleted while offline disappears from its meal. */
export function applyRemoveLogged(view, ids) {
    if (!view?.days || !ids.size)
        return view;
    let out = view;
    for (const d of view.days)
        for (const m of MEAL_IDS)
            if (d.meals[m].items.some((i) => i.status === 'logged' && ids.has(i.id)))
                out = mapDays(out, d.date, (day) => swapItems(day, m, (items) => items.filter((i) => !(i.status === 'logged' && ids.has(i.id)))));
    return out;
}
/** Removes the suggestion that was just used from its meal, so it is not offered twice. */
export function dropSuggestion(view, date, meal, key) {
    return mapDays(view, date, (d) => ({ ...d, meals: { ...d.meals, [meal]: { ...d.meals[meal], suggestions: d.meals[meal].suggestions.filter((s) => s.key !== key), more: d.meals[meal].more.filter((s) => s.key !== key) } } }));
}
// ------------------------------------------------------------------------------------------------ log day
/** The planned items "Log day" should log: planned, not done, not already logged. Items already eaten are skipped, never doubled. */
export function itemsToLog(day) {
    if (!day || day.readOnly)
        return [];
    return MEAL_IDS.flatMap((m) => day.meals[m].items.filter((i) => i.status === 'planned' && !i.pending));
}
/** Same as itemsToLog, for ONE meal: the one-tap "Log what I planned" button. */
export function itemsToLogMeal(day, meal) {
    if (!day || day.readOnly || !day.meals?.[meal])
        return [];
    return day.meals[meal].items.filter((i) => i.status === 'planned' && !i.pending);
}
// ------------------------------------------------------------------------------------------------ labels
export const STATUS_LABEL = { logged: 'Logged', planned: 'Planned', suggested: 'Suggested' };
/** "420 kcal left · 25 g protein" style helper for the day bar: eaten so far, planned, remaining. */
export function dayBarText(b) {
    const over = b.remaining < 0;
    return { eaten: `${b.eaten} eaten`, planned: `${b.planned} planned`, remaining: over ? `${Math.abs(b.remaining)} over` : `${b.remaining} left`, over };
}
// ------------------------------------------------------------------------------------------------ the chef
// The chef speaks in the voice of the person's own character of the day (the same character Home shows). The facts never change:
// "<Meal> is open: 420 kcal and 25 g protein to go". Only a short original tail is added in the character's style.
const TAIL = {
    jinwoo: { open: 'Fill the slot.', partial: 'Close the gap.', done: 'Quest cleared.', over: 'Hold the line.' },
    naruto: { open: 'Believe it!', partial: 'Almost, dattebayo!', done: 'Nailed it!', over: 'Steady now.' },
    luffy: { open: 'Meat time!', partial: 'Just a bit more!', done: 'Shishishi, full!', over: 'Enough for now!' },
    zoro: { open: 'No skipping.', partial: 'Finish it properly.', done: 'Good.', over: 'Cut the extras.' },
    goku: { open: 'I\u2019m hungry!', partial: 'A little more fuel!', done: 'Great meal!', over: 'That\u2019s plenty!' },
    gojo: { open: 'Easy, you\u2019ve got room~', partial: 'One small tweak~', done: 'Perfect~', over: 'Relax, tomorrow\u2019s fresh.' },
};
const DEFAULT_TAIL = { open: 'Let\u2019s fill it.', partial: 'Nearly there.', done: 'Nicely done.', over: 'That\u2019s enough for today.' };
export function chefLine(hint, who = '') {
    if (!hint)
        return '';
    const t = TAIL[who] || DEFAULT_TAIL;
    const meal = MEAL_NAME[hint.mealType];
    if (hint.kind === 'open')
        return `${meal} is open: ${hint.kcal} kcal${hint.protein > 0 ? ` and ${hint.protein} g protein` : ''} to go. ${t.open}`;
    if (hint.kind === 'over')
        return `${meal} is open, but the day is full. Something very light is plenty. ${t.over}`;
    if (hint.kind === 'partial') {
        const gap = hint.protein > 0 ? `${hint.protein} g protein` : hint.veg ? 'some vegetables' : hint.fiber ? `${hint.fiber} g fibre` : 'a small top-up';
        return `${meal} still needs ${gap}. ${t.partial}`;
    }
    return `${meal} looks balanced. ${t.done}`;
}
/** The chef's line for the whole day, for the card at the top. */
export function chefDayLine(day, who = '') {
    if (!day || day.readOnly)
        return '';
    const t = TAIL[who] || DEFAULT_TAIL;
    if (day.complete)
        return `Day complete! Everything planned is eaten. ${t.done}`;
    const open = MEAL_IDS.filter((m) => day.meals[m].hint?.kind === 'open');
    if (open.length)
        return chefLine(day.meals[open[0]].hint, who);
    const partial = MEAL_IDS.find((m) => day.meals[m].hint?.kind === 'partial');
    if (partial)
        return chefLine(day.meals[partial].hint, who);
    const b = day.budget;
    return b.remaining < 0 ? `${Math.abs(b.remaining)} kcal over today. ${t.over}` : `${b.remaining} kcal left today.`;
}

// ------------------------------------------------------------------------------------------------ web only
/**
 * The website's offline queue keeps whole requests. This layers the ones that are still waiting on top of the saved / fetched view,
 * so a food logged offline shows as Logged straight away (planned row -> logged row, never both).
 * ops: [{ url, method, body (JSON string), meta }]
 */
export function overlayWebQueue(view, ops) {
    let out = view;
    for (const op of ops || []) {
        if (String(op.method).toUpperCase() !== 'POST') continue;
        let path = '', b = {};
        try { path = new URL(op.url, 'http://x').pathname; b = JSON.parse(op.body || '{}'); } catch { continue; }
        const cid = b.clientId; if (!cid) continue;
        const log = path.match(/^\/api\/meal-plans\/([^/]+)\/log$/);
        if (log) out = applyPlanLog(out, { planId: decodeURIComponent(log[1]), clientId: cid, date: b.date });
        else if (path === '/api/food-logs' && op.meta?.nutritionTotal) out = applyFoodLog(out, { clientId: cid, date: b.date, mealType: b.mealType, foodId: b.foodId, foodName: op.meta.foodName, nutritionTotal: op.meta.nutritionTotal, quantity: b.quantity, servingUnit: op.meta.servingUnit });
        else if (path === '/api/meal-plans' && op.meta?.nutrition) out = applyPlanAdd(out, { clientId: cid, date: b.date, mealType: b.mealType, foodId: b.foodId, foodName: op.meta.foodName, quantity: b.quantity, servingUnit: op.meta.servingUnit || '', nutrition: op.meta.nutrition, why: b.why });
    }
    return out;
}
