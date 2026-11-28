import { applyPending, PendingOp } from '../optimistic';
import {
  applyFoodLog, applyPlanAdd, applyPlanLog, chefDayLine, chefLine, dayBarText, dayComplete, dropSuggestion, itemsToLog, planViewPath, recomputeDay, weekStart,
  type PlanView, type ViewDay, type ViewItem, type ViewMeal,
} from '../mealView';

const T = '2026-10-20';
const z = { calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 };
const item = (id: string, status: 'logged' | 'planned', mealType: any, foodName: string, calories: number, protein: number, extra: Partial<ViewItem> = {}): ViewItem =>
  ({ id, status, mealType, date: T, foodId: extra.foodId ?? `food-${id}`, foodName, quantity: 1, servingUnit: 'bowl', calories, protein, fiber: 2, carbohydrates: 0, fat: 0, ...extra });
const meal = (items: ViewItem[], hint: any = null): ViewMeal => ({ items, logged: z, planned: z, total: z, suggestions: [], more: [], hint });

function day(meals: Partial<Record<string, ViewItem[]>>, budget = 1800, hints: Record<string, any> = {}): ViewDay {
  const d: ViewDay = {
    date: T, kind: 'today', readOnly: false, logged: z, planned: z, total: z, complete: false, hasBudget: true,
    budget: { budget, homeBudget: budget, trim: 0, eaten: 0, planned: 0, remaining: budget, remainingAfterPlan: budget },
    meals: { breakfast: meal(meals.breakfast || [], hints.breakfast), lunch: meal(meals.lunch || [], hints.lunch), dinner: meal(meals.dinner || [], hints.dinner), snacks: meal(meals.snacks || [], hints.snacks) },
  };
  return recomputeDay(d);
}
const view = (d: ViewDay): PlanView => ({ today: T, from: T, to: T, days: [d] });
const first = (v: PlanView) => v.days[0];

describe('day bar maths', () => {
  it('eaten counts logged food only, planned is separate, remaining = budget - eaten', () => {
    const d = day({ breakfast: [item('a', 'logged', 'breakfast', 'Poha', 300, 8)], lunch: [item('b', 'planned', 'lunch', 'Dal', 250, 14)] });
    expect(d.budget.eaten).toBe(300);
    expect(d.budget.planned).toBe(250);
    expect(d.budget.remaining).toBe(1500);
    expect(d.budget.remainingAfterPlan).toBe(1250);
    expect(d.total.calories).toBe(550);
  });

  it('shows over when eaten passes the budget', () => {
    const d = day({ lunch: [item('a', 'logged', 'lunch', 'Thali', 1900, 40)] });
    expect(dayBarText(d.budget)).toEqual({ eaten: '1900 eaten', planned: '0 planned', remaining: '100 over', over: true });
  });

  it('suggestions never count toward any total', () => {
    const d = day({ lunch: [item('a', 'logged', 'lunch', 'Roti', 200, 6), item('s', 'planned', 'lunch', 'x', 0, 0)] });
    const withSug = recomputeDay({ ...d, meals: { ...d.meals, lunch: { ...d.meals.lunch, items: [...d.meals.lunch.items, item('sg', 'suggested' as any, 'lunch', 'Curd', 90, 8)] } } });
    expect(withSug.budget.eaten).toBe(200);
    expect(withSug.meals.lunch.total.calories).toBe(200);
  });
});

describe('no double counting', () => {
  it('logging a planned item turns it into one logged item: eaten up, planned down, total unchanged', () => {
    const d = day({ dinner: [item('p1', 'planned', 'dinner', 'Khichdi', 350, 12)] });
    const v = applyPlanLog(view(d), { planId: 'p1', clientId: 'c1' });
    const out = first(v);
    expect(out.meals.dinner.items).toHaveLength(1);
    expect(out.meals.dinner.items[0].status).toBe('logged');
    expect(out.meals.dinner.items[0].fromPlan).toBe(true);
    expect(out.meals.dinner.items[0].planId).toBe('p1');
    expect(out.budget.eaten).toBe(350);
    expect(out.budget.planned).toBe(0);
    expect(out.total.calories).toBe(d.total.calories);
  });

  it('logging the same planned item twice changes nothing the second time', () => {
    const d = day({ dinner: [item('p1', 'planned', 'dinner', 'Khichdi', 350, 12)] });
    const once = applyPlanLog(view(d), { planId: 'p1', clientId: 'c1' });
    const twice = applyPlanLog(once, { planId: 'p1', clientId: 'c2' });
    expect(first(twice).budget.eaten).toBe(350);
    expect(first(twice).meals.dinner.items).toHaveLength(1);
  });

  it('a food logged directly marks the matching planned item done (same meal + same food)', () => {
    const d = day({ lunch: [item('p1', 'planned', 'lunch', 'Dal tadka', 180, 9, { foodId: 'F-dal' })] });
    const v = applyFoodLog(view(d), { clientId: 'c9', date: T, mealType: 'lunch', foodId: 'F-dal', foodName: 'Dal tadka', nutritionTotal: { calories: 180, protein: 9 } });
    const out = first(v);
    expect(out.meals.lunch.items).toHaveLength(1);
    expect(out.meals.lunch.items[0].status).toBe('logged');
    expect(out.budget.eaten).toBe(180);
    expect(out.budget.planned).toBe(0);
  });

  it('a different food logged in the same meal leaves the plan as it was', () => {
    const d = day({ lunch: [item('p1', 'planned', 'lunch', 'Dal tadka', 180, 9, { foodId: 'F-dal' })] });
    const out = first(applyFoodLog(view(d), { clientId: 'c9', date: T, mealType: 'lunch', foodId: 'F-curd', foodName: 'Curd', nutritionTotal: { calories: 90, protein: 8 } }));
    expect(out.meals.lunch.items.map((i) => i.status)).toEqual(['logged', 'planned']);
    expect(out.budget.eaten).toBe(90);
    expect(out.budget.planned).toBe(180);
  });

  it('the overlay never applies the same queued write twice', () => {
    const d = day({ lunch: [] });
    const once = applyFoodLog(view(d), { clientId: 'c1', date: T, mealType: 'lunch', foodName: 'Curd', nutritionTotal: { calories: 90 } });
    const twice = applyFoodLog(once, { clientId: 'c1', date: T, mealType: 'lunch', foodName: 'Curd', nutritionTotal: { calories: 90 } });
    expect(first(twice).budget.eaten).toBe(90);
  });

  it('"Log day" only logs planned items that are not logged and not already waiting to sync', () => {
    const d = day({
      breakfast: [item('l', 'logged', 'breakfast', 'Poha', 300, 8)],
      lunch: [item('p1', 'planned', 'lunch', 'Dal', 180, 9), item('p2', 'planned', 'lunch', 'Roti', 120, 4, { pending: true })],
      dinner: [item('p3', 'planned', 'dinner', 'Khichdi', 350, 12)],
    });
    expect(itemsToLog(d).map((i) => i.id)).toEqual(['p1', 'p3']);
  });

  it('"Log day" has nothing to log on a past day', () => {
    const d = { ...day({ lunch: [item('p1', 'planned', 'lunch', 'Dal', 180, 9)] }), readOnly: true };
    expect(itemsToLog(d)).toEqual([]);
  });
});

describe('offline: the queue shows up in the planner AND in Home, counted once', () => {
  const planLogOp: PendingOp = {
    method: 'POST', path: '/api/meal-plans/p1/log', body: { date: T, clientId: 'pl-p1' },
    meta: { foodName: 'Khichdi', mealType: 'dinner', foodId: 'F-k', nutritionTotal: { calories: 350, protein: 12 }, consumedQuantity: 1, servingUnit: 'bowl' }, createdAt: 5,
  };
  const directOp: PendingOp = {
    method: 'POST', path: '/api/food-logs', body: { foodId: 'F-c', date: T, mealType: 'snacks', quantity: 1, clientId: 'sg-1' },
    meta: { foodName: 'Curd', nutritionTotal: { calories: 90, protein: 8 } }, createdAt: 6,
  };

  it('planner view: a queued "Log" turns the planned row into a logged one, a queued direct log adds a logged one', () => {
    const d = day({ dinner: [item('p1', 'planned', 'dinner', 'Khichdi', 350, 12, { foodId: 'F-k' })] });
    const out = applyPending(planViewPath(T, T), view(d), [planLogOp, directOp]);
    const o = first(out);
    expect(o.meals.dinner.items.map((i) => [i.status, i.pending])).toEqual([['logged', true]]);
    expect(o.meals.snacks.items[0].foodName).toBe('Curd');
    expect(o.budget.eaten).toBe(440);
    expect(o.budget.planned).toBe(0);
  });

  it('Home summary and the planner day bar show the SAME eaten number for the same queue', () => {
    const planner = first(applyPending(planViewPath(T, T), view(day({ dinner: [item('p1', 'planned', 'dinner', 'Khichdi', 350, 12, { foodId: 'F-k' })] })), [planLogOp, directOp]));
    const homeBase = { date: T, food: [], exercise: [], water: [], weight: [], tasks: [], habits: [], summary: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, meals: {}, waterMl: 0, exerciseMinutes: 0, workoutCalories: 0, stepCalories: 0, caloriesBurned: 0, steps: 0, weightKg: null } };
    const home: any = applyPending(`/api/progress/day?date=${T}`, homeBase, [planLogOp, directOp]);
    expect(home.summary.calories).toBe(planner.budget.eaten);
    expect(home.summary.protein).toBe(20);
  });

  it('a queued "add to plan" shows a planned item and lowers what is free after the plan', () => {
    const d = day({});
    const op: PendingOp = { method: 'POST', path: '/api/meal-plans', body: { date: T, mealType: 'dinner', foodId: 'F-p', quantity: 150, clientId: 'pa-1' }, meta: { foodName: 'Paneer bhurji', servingUnit: 'g', nutrition: { calories: 260, protein: 18 } }, createdAt: 7 };
    const o = first(applyPending(planViewPath(T, T), view(d), [op]));
    expect(o.meals.dinner.items[0]).toMatchObject({ status: 'planned', foodName: 'Paneer bhurji', pending: true });
    expect(o.budget.eaten).toBe(0);
    expect(o.budget.planned).toBe(260);
    expect(o.budget.remainingAfterPlan).toBe(1540);
  });

  it('a queued delete of a logged food removes it from the planner', () => {
    const d = day({ lunch: [item('log1', 'logged', 'lunch', 'Dal', 180, 9)] });
    const o = first(applyPending(planViewPath(T, T), view(d), [{ method: 'DELETE', path: '/api/food-logs/log1' }]));
    expect(o.meals.lunch.items).toHaveLength(0);
    expect(o.budget.eaten).toBe(0);
  });

  it('write-through after an online write does not mark rows as pending', () => {
    const d = day({ dinner: [item('p1', 'planned', 'dinner', 'Khichdi', 350, 12)] });
    const o = first(applyPending(planViewPath(T, T), view(d), [planLogOp], { pending: false }));
    expect(o.meals.dinner.items[0].pending).toBe(false);
  });

  it('with an empty queue the cached view is returned untouched', () => {
    const v = view(day({}));
    expect(applyPending(planViewPath(T, T), v, [])).toBe(v);
  });
});

describe('suggestions and planned rows', () => {
  it('using a suggestion removes it from the list, add-to-plan makes it a planned row', () => {
    const d = day({ lunch: [item('a', 'logged', 'lunch', 'Roti', 200, 6)] });
    d.meals.lunch.suggestions = [item('s1', 'planned', 'lunch', 'Curd', 90, 8, { key: 'k1' }), item('s2', 'planned', 'lunch', 'Egg', 70, 6, { key: 'k2' })].map((s) => ({ ...s, status: 'suggested' as const }));
    const v = dropSuggestion(view(d), T, 'lunch', 'k1');
    expect(first(v).meals.lunch.suggestions.map((s) => s.key)).toEqual(['k2']);
    const added = applyPlanAdd(v, { clientId: 'x', date: T, mealType: 'lunch', foodName: 'Curd', quantity: 100, servingUnit: 'g', nutrition: { calories: 90, protein: 8 } });
    expect(first(added).meals.lunch.items.find((i) => i.foodName === 'Curd')?.status).toBe('planned');
  });

  it('cannot add a plan to a past day', () => {
    const past = { ...day({}), readOnly: true, kind: 'past' as const };
    const v = applyPlanAdd(view(past), { clientId: 'x', date: T, mealType: 'lunch', foodName: 'Curd', quantity: 100, servingUnit: 'g', nutrition: { calories: 90 } });
    expect(first(v).meals.lunch.items).toHaveLength(0);
  });
});

describe('day complete (victory)', () => {
  const full = () => day({ breakfast: [item('a', 'logged', 'breakfast', 'Poha', 300, 8)], lunch: [item('b', 'logged', 'lunch', 'Dal', 500, 20)], dinner: [item('c', 'planned', 'dinner', 'Khichdi', 350, 12)] });
  it('is not complete while something planned is waiting', () => {
    expect(first(view(full())).complete).toBe(false);
  });
  it('becomes complete when the last planned item is logged', () => {
    const v = applyPlanLog(view(full()), { planId: 'c', clientId: 'z' });
    expect(first(v).complete).toBe(true);
    expect(dayComplete(first(v))).toBe(true);
  });
  it('is never complete without breakfast, lunch and dinner', () => {
    expect(dayComplete(day({ lunch: [item('b', 'logged', 'lunch', 'Dal', 500, 20)] }))).toBe(false);
  });
});

describe('chef', () => {
  const open = { kind: 'open', mealType: 'dinner', kcal: 420, protein: 25 } as const;
  it('says exactly how much room an open meal has', () => {
    expect(chefLine(open)).toMatch(/^Dinner is open: 420 kcal and 25 g protein to go\./);
  });
  it('keeps the facts and changes only the tail for each character', () => {
    for (const who of ['jinwoo', 'naruto', 'luffy', 'zoro', 'goku', 'gojo']) expect(chefLine(open, who)).toMatch(/^Dinner is open: 420 kcal and 25 g protein to go\. \S/);
    expect(chefLine(open, 'luffy')).not.toBe(chefLine(open, 'zoro'));
  });
  it('names the gap of a partly-logged meal', () => {
    expect(chefLine({ kind: 'partial', mealType: 'lunch', kcal: 800, protein: 18 })).toMatch(/^Lunch still needs 18 g protein\./);
    expect(chefLine({ kind: 'partial', mealType: 'lunch', kcal: 800, protein: 0, veg: true })).toMatch(/some vegetables/);
  });
  it('is quiet when there is no hint', () => {
    expect(chefLine(null)).toBe('');
  });
  it('day line points at the first open meal, or celebrates a complete day', () => {
    const d = day({ breakfast: [item('a', 'logged', 'breakfast', 'Poha', 300, 8)] }, 1800, { dinner: open });
    expect(chefDayLine(d)).toMatch(/^Dinner is open/);
    const done = applyPlanLog(view(day({ breakfast: [item('a', 'logged', 'breakfast', 'Poha', 300, 8)], lunch: [item('b', 'logged', 'lunch', 'Dal', 500, 20)], dinner: [item('c', 'planned', 'dinner', 'K', 350, 12)] })), { planId: 'c', clientId: 'z' });
    expect(chefDayLine(first(done))).toMatch(/^Day complete/);
  });
  it('an open meal that now has food is no longer open', () => {
    const d = day({}, 1800, { dinner: open });
    const o = first(applyPlanAdd(view(d), { clientId: 'q', date: T, mealType: 'dinner', foodName: 'Khichdi', quantity: 1, servingUnit: 'bowl', nutrition: { calories: 350, protein: 12 } }));
    expect(o.meals.dinner.hint?.kind).toBe('done');
  });
});

describe('paths', () => {
  it('the planner reads one URL per week, Monday to Sunday', () => {
    expect(weekStart('2026-10-20')).toBe('2026-10-19');
    expect(planViewPath('2026-10-19', '2026-10-20')).toBe('/api/meal-plans/view?from=2026-10-19&to=2026-10-25&today=2026-10-20');
  });
});
