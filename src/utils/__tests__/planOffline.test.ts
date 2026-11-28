import { applyPending, opToEvent, PendingOp } from '../optimistic';
import { applyPlanEdit, applyPlanRemove, planViewPath, recomputeDay, type PlanView, type ViewDay, type ViewItem, type ViewMeal } from '../mealView';

const T = '2026-10-20', N = '2026-10-21';
const z = { calories: 0, protein: 0, fiber: 0, carbohydrates: 0, fat: 0 };
const pi = (id: string, status: 'logged' | 'planned', mealType: any, date: string, calories: number, extra: Partial<ViewItem> = {}): ViewItem =>
  ({ id, status, mealType, date, foodId: `food-${id}`, foodName: `Food ${id}`, quantity: 2, servingUnit: 'bowl', calories, protein: 10, fiber: 4, carbohydrates: 30, fat: 6, ...extra });
const meal = (items: ViewItem[]): ViewMeal => ({ items, logged: z, planned: z, total: z, suggestions: [], more: [], hint: null });
const mkDay = (date: string, meals: Record<string, ViewItem[]>, readOnly = false): ViewDay => recomputeDay({
  date, kind: 'future', readOnly, logged: z, planned: z, total: z, complete: false, hasBudget: true,
  budget: { budget: 1800, homeBudget: 1800, trim: 0, eaten: 0, planned: 0, remaining: 1800, remainingAfterPlan: 1800 },
  meals: { breakfast: meal(meals.breakfast || []), lunch: meal(meals.lunch || []), dinner: meal(meals.dinner || []), snacks: meal(meals.snacks || []) },
});
const base = (): PlanView => ({ today: T, from: T, to: N, days: [
  mkDay(T, { breakfast: [pi('e1', 'logged', 'breakfast', T, 300)], lunch: [pi('p1', 'planned', 'lunch', T, 400), pi('p2', 'planned', 'lunch', T, 200)] }),
  mkDay(N, { dinner: [pi('p3', 'planned', 'dinner', N, 500)] }),
] });
const ids = (v: PlanView, date: string, m: string) => v.days.find((d) => d.date === date)!.meals[m as 'lunch'].items.map((i) => i.id);
const day = (v: PlanView, date: string) => v.days.find((d) => d.date === date)!;
const PATH = planViewPath(T, T);
const op = (method: string, path: string, body?: any): PendingOp => ({ method, path, body, createdAt: 1 });

describe('planner edits offline: the queued request becomes an event', () => {
  it('delete and patch of one planned item are understood', () => {
    expect(opToEvent(op('DELETE', '/api/meal-plans/p1', {}))).toMatchObject({ k: 'plan-', id: 'p1' });
    expect(opToEvent(op('PATCH', '/api/meal-plans/p1', { quantity: 3, today: T }))).toMatchObject({ k: 'plan~', id: 'p1', patch: { quantity: 3 } });
    expect(opToEvent(op('PATCH', '/api/meal-plans/p1', { mealType: 'dinner' }))).toMatchObject({ k: 'plan~', patch: { mealType: 'dinner' } });
    expect(opToEvent(op('PATCH', '/api/meal-plans/p1', { date: N, today: T }))).toMatchObject({ k: 'plan~', patch: { date: N } });
  });
  it('things that are not a planned-item edit are not mistaken for one', () => {
    expect(opToEvent(op('PATCH', '/api/meal-plans/p1', { today: T }))).toBeNull();
    expect(opToEvent(op('DELETE', '/api/meal-plans/templates/t1', {}))).toBeNull();
    expect(opToEvent(op('POST', '/api/meal-plans/lock', { date: T, mealType: 'lunch', locked: true }))).toBeNull();
  });
});

describe('remove a planned item offline', () => {
  it('it disappears, and the meal total and the day bar follow', () => {
    const v = applyPlanRemove(base(), new Set(['p1']));
    expect(ids(v, T, 'lunch')).toEqual(['p2']);
    expect(day(v, T).meals.lunch.planned.calories).toBe(200);
    expect(day(v, T).budget.planned).toBe(200);
    expect(day(v, T).budget.remainingAfterPlan).toBe(1800 - 300 - 200);
  });
  it('an eaten item with the same id is not touched (that is deleted from the food log instead)', () => {
    expect(ids(applyPlanRemove(base(), new Set(['e1'])), T, 'breakfast')).toEqual(['e1']);
  });
});

describe('change a planned item offline', () => {
  it('a new amount scales the nutrition in a straight line', () => {
    const v = applyPlanEdit(base(), { id: 'p1', quantity: 3 });          // 2 -> 3 bowls = x1.5
    const p1 = day(v, T).meals.lunch.items.find((i) => i.id === 'p1')!;
    expect(p1).toMatchObject({ quantity: 3, calories: 600, protein: 15, fiber: 6, carbohydrates: 45, fat: 9 });
    expect(day(v, T).meals.lunch.planned.calories).toBe(800);
    expect(day(v, T).budget.planned).toBe(800);
  });
  it('to another meal the same day: it leaves one meal and joins the other', () => {
    const v = applyPlanEdit(base(), { id: 'p1', mealType: 'dinner' });
    expect(ids(v, T, 'lunch')).toEqual(['p2']);
    expect(ids(v, T, 'dinner')).toEqual(['p1']);
    expect(day(v, T).meals.dinner.items[0].mealType).toBe('dinner');
    expect(day(v, T).budget.planned).toBe(600);                          // the day total does not change
  });
  it('to another day in the view: it leaves this day and appears on that one, in the same meal', () => {
    const v = applyPlanEdit(base(), { id: 'p1', date: N });
    expect(ids(v, T, 'lunch')).toEqual(['p2']);
    expect(ids(v, N, 'lunch')).toEqual(['p1']);
    expect(day(v, N).meals.lunch.items[0].date).toBe(N);
    expect(day(v, T).budget.planned).toBe(200);
    expect(day(v, N).budget.planned).toBe(400 + 500);
  });
  it('day and meal together', () => {
    const v = applyPlanEdit(base(), { id: 'p1', date: N, mealType: 'snacks' });
    expect(ids(v, N, 'snacks')).toEqual(['p1']);
    expect(ids(v, T, 'lunch')).toEqual(['p2']);
  });
  it('to a day that is not in the view, or is read-only, it just leaves', () => {
    expect(ids(applyPlanEdit(base(), { id: 'p1', date: '2026-10-30' }), T, 'lunch')).toEqual(['p2']);
    const ro = base(); ro.days[1] = mkDay(N, {}, true);
    const v = applyPlanEdit(ro, { id: 'p1', date: N });
    expect(ids(v, T, 'lunch')).toEqual(['p2']); expect(ids(v, N, 'lunch')).toEqual([]);
  });
  it('an eaten item, an unknown id and a non-positive amount change nothing', () => {
    expect(applyPlanEdit(base(), { id: 'e1', quantity: 5 })).toEqual(base());
    expect(applyPlanEdit(base(), { id: 'nope', quantity: 5 })).toEqual(base());
    expect(day(applyPlanEdit(base(), { id: 'p1', quantity: 0 }), T).meals.lunch.items.find((i) => i.id === 'p1')!.calories).toBe(400);
  });
});

describe('through the real read path (queued writes layered on the saved view)', () => {
  it('queued remove, amount change and move all show at once, oldest first', () => {
    const ops = [op('PATCH', '/api/meal-plans/p1', { quantity: 4, today: T }), op('DELETE', '/api/meal-plans/p2', {}), op('PATCH', '/api/meal-plans/p3', { mealType: 'lunch', today: T })];
    const v: any = applyPending(PATH, base(), ops);
    expect(day(v, T).meals.lunch.items.map((i: any) => [i.id, i.calories])).toEqual([['p1', 800]]);
    expect(ids(v, N, 'dinner')).toEqual([]); expect(ids(v, N, 'lunch')).toEqual(['p3']);
  });
  it('an item added to the plan offline and then changed offline: the change lands on the local copy', () => {
    const add = op('POST', '/api/meal-plans', { date: T, mealType: 'snacks', foodId: 'f9', quantity: 1, clientId: 'c1' });
    (add as any).meta = { foodName: 'Almonds', servingUnit: 'g', nutrition: { calories: 160, protein: 6, fiber: 3, carbohydrates: 6, fat: 14 } };
    const v: any = applyPending(PATH, base(), [add, op('PATCH', '/api/meal-plans/local:c1', { quantity: 2, today: T })]);
    const a = day(v, T).meals.snacks.items.find((i: any) => i.id === 'local:c1');
    expect(a).toMatchObject({ quantity: 2, calories: 320 });
  });
  it('removing it again offline leaves nothing behind', () => {
    const add = op('POST', '/api/meal-plans', { date: T, mealType: 'snacks', foodId: 'f9', quantity: 1, clientId: 'c1' });
    (add as any).meta = { foodName: 'Almonds', servingUnit: 'g', nutrition: { calories: 160, protein: 6, fiber: 3 } };
    const v: any = applyPending(PATH, base(), [add, op('DELETE', '/api/meal-plans/local:c1', {})]);
    expect(ids(v, T, 'snacks')).toEqual([]);
  });
});
