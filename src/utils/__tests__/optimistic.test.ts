import { applyPending, localId, isLocalId, opToEvent, PendingOp } from '../optimistic';

const D = '2026-10-03';
const dayBase = () => ({
  date: D, food: [], exercise: [], water: [], weight: [], tasks: [], habits: [],
  summary: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, meals: {}, waterMl: 0, exerciseMinutes: 0, workoutCalories: 0, stepCalories: 70, caloriesBurned: 70, steps: 2000, weightKg: null },
});
const water = (ml: number, cid = `w${ml}`): PendingOp => ({ method: 'POST', path: '/api/water', body: { date: D, amountMl: ml, clientId: cid }, createdAt: 1 });
const food = (cal: number, cid = `f${cal}`): PendingOp => ({
  method: 'POST', path: '/api/food-logs', body: { foodId: 'x', date: D, mealType: 'lunch', quantity: 1, clientId: cid },
  meta: { foodName: 'Dal', nutritionTotal: { calories: cal, protein: 10, carbohydrates: 20, fat: 5 } }, createdAt: 2,
});

describe('optimistic overlay', () => {
  it('an offline water entry appears in the water list with an updated total', () => {
    const server = { logs: [{ _id: 'a', amountMl: 250, clientId: 'old' }], totalMl: 250, totalLiters: 0.25 };
    const r = applyPending(`/api/water?date=${D}`, server, [water(500)]);
    expect(r.logs.map((l: any) => l.amountMl)).toEqual([500, 250]);
    expect(r.logs[0].pending).toBe(true);
    expect(r.totalMl).toBe(750);
  });

  it('the Home/History day summary includes offline water, food and burn', () => {
    const ops: PendingOp[] = [water(300), food(450), { method: 'POST', path: '/api/activities/logs', body: { date: D, durationMinutes: 30, caloriesBurned: 200, clientId: 'e1' }, meta: { activityName: 'Run' } }];
    const r: any = applyPending(`/api/progress/day?date=${D}`, dayBase(), ops);
    expect(r.summary.waterMl).toBe(300);
    expect(r.summary.calories).toBe(450);
    expect(r.summary.protein).toBe(10);
    expect(r.summary.workoutCalories).toBe(200);
    expect(r.summary.caloriesBurned).toBe(270); // 200 workout + 70 from steps (kept from the server)
    expect(r.summary.meals.lunch).toBe(450);
    expect(r.food[0].foodName).toBe('Dal');
  });

  it('does not double count once the server already has the entry (same clientId)', () => {
    const server = { logs: [{ _id: 'srv1', amountMl: 500, clientId: 'w500' }], totalMl: 500, totalLiters: 0.5 };
    const r = applyPending(`/api/water?date=${D}`, server, [water(500, 'w500')]);
    expect(r.logs).toHaveLength(1);
    expect(r.totalMl).toBe(500);
  });

  it('only shows entries for the date being viewed', () => {
    const other: PendingOp = { method: 'POST', path: '/api/water', body: { date: '2026-10-01', amountMl: 900, clientId: 'z' } };
    const r: any = applyPending(`/api/progress/day?date=${D}`, dayBase(), [other]);
    expect(r.summary.waterMl).toBe(0);
  });

  it('a queued delete hides the server entry immediately', () => {
    const server = { logs: [{ _id: 'abc', amountMl: 250 }, { _id: 'def', amountMl: 100 }], totalMl: 350, totalLiters: 0.35 };
    const r = applyPending(`/api/water?date=${D}`, server, [{ method: 'DELETE', path: '/api/water/abc' }]);
    expect(r.logs.map((l: any) => l._id)).toEqual(['def']);
    expect(r.totalMl).toBe(100);
  });

  it('offline task: appears in the list, toggling a server task shows done, delete hides it', () => {
    const server = { tasks: [{ _id: 't1', title: 'Old', completed: false, date: D }, { _id: 't2', title: 'Gone', completed: false, date: D }] };
    const ops: PendingOp[] = [
      { method: 'POST', path: '/api/tasks', body: { title: 'New one', date: D, time: '18:00', clientId: 'c9' } },
      { method: 'PATCH', path: '/api/tasks/t1/toggle', body: { completed: true } },
      { method: 'DELETE', path: '/api/tasks/t2?scope=this' },
    ];
    const r: any = applyPending(`/api/tasks?date=${D}`, server, ops);
    expect(r.tasks.map((t: any) => t.title)).toEqual(['New one', 'Old']);
    expect(r.tasks.find((t: any) => t._id === 't1').completed).toBe(true);
    expect(r.tasks[0]._id).toBe(localId('c9'));
  });

  it('weight: newest weigh-in of the day replaces the earlier one, list stays newest-first', () => {
    const server = { logs: [{ _id: 'w1', date: D, weightKg: 71 }, { _id: 'w0', date: '2026-10-02', weightKg: 72 }] };
    const r: any = applyPending('/api/weight', server, [{ method: 'POST', path: '/api/weight', body: { date: D, weightKg: 70.4, clientId: 'wt1' } }]);
    expect(r.logs.map((l: any) => l.weightKg)).toEqual([70.4, 72]);
  });

  it('weight: a second scale on the same day is kept, shown calibrated, and replaces only its own scale', () => {
    const scales = [{ id: 'main', name: 'Home', offsetKg: 0 }, { id: 'gym', name: 'Gym', offsetKg: 1 }];
    const server = { scales, referenceId: 'main', logs: [{ _id: 'w1', date: D, weightKg: 70, rawKg: 70, scaleId: 'main' }] };
    const r: any = applyPending('/api/weight', server, [{ method: 'POST', path: '/api/weight', body: { date: D, weightKg: 71.2, scaleId: 'gym', clientId: 'wt2' } }]);
    expect(r.logs).toHaveLength(2);
    const g = r.logs.find((l: any) => l.scaleId === 'gym');
    expect(g.rawKg).toBe(71.2); expect(g.weightKg).toBe(70.2);
    const again: any = applyPending('/api/weight', server, [{ method: 'POST', path: '/api/weight', body: { date: D, weightKg: 71.2, scaleId: 'gym', clientId: 'wt2' } }, { method: 'POST', path: '/api/weight', body: { date: D, weightKg: 71.0, scaleId: 'gym', clientId: 'wt3' } }]);
    expect(again.logs).toHaveLength(2);
  });

  it('history charts include offline entries for the right day and re-total', () => {
    const history = { days: [{ date: '2026-10-02', waterMl: 100, calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, exerciseMinutes: 0, caloriesBurned: 0, steps: 0, tasksTotal: 0, tasksCompleted: 0, habitsCompleted: 0 }, { date: D, waterMl: 0, calories: 0, protein: 0, carbohydrates: 0, fat: 0, fiber: 0, sugar: 0, exerciseMinutes: 0, caloriesBurned: 0, steps: 0, tasksTotal: 0, tasksCompleted: 0, habitsCompleted: 0 }], totals: { waterMl: 100 } };
    const r: any = applyPending('/api/progress/history?from=2026-10-02&to=2026-10-03', history, [water(500), food(300)]);
    expect(r.days[1].waterMl).toBe(500);
    expect(r.days[1].calories).toBe(300);
    expect(r.totals.waterMl).toBe(600);
  });

  it('habit tap offline marks the habit done in the day logs', () => {
    const op: PendingOp = { method: 'POST', path: '/api/habits/logs', body: { habitId: 'h1', date: D, completedValue: 1 }, meta: { habitName: 'Read', target: 1, unit: 'times' } };
    const r: any = applyPending(`/api/habits/logs?date=${D}`, { logs: [] }, [op]);
    expect(r.logs[0]).toMatchObject({ habitId: 'h1', completed: true, habitName: 'Read' });
  });

  it('profile edits made offline are visible straight away (deep-merged)', () => {
    const server = { profile: { name: 'S', goals: { calorieTarget: 1800, proteinTarget: 140 } } };
    const r: any = applyPending('/api/profile', server, [{ method: 'PATCH', path: '/api/profile', body: { goals: { calorieTarget: 2000 } } }]);
    expect(r.profile.goals).toEqual({ calorieTarget: 2000, proteinTarget: 140 });
  });

  it('leaves untouched anything it does not understand and never mutates its input', () => {
    const server = { logs: [{ _id: 'a', amountMl: 1 }], totalMl: 1, totalLiters: 0.001 };
    const frozen = JSON.stringify(server);
    applyPending(`/api/water?date=${D}`, server, [water(5)]);
    expect(JSON.stringify(server)).toBe(frozen);
    expect(applyPending('/api/unknown', { a: 1 }, [water(5)])).toEqual({ a: 1 });
    expect(opToEvent({ method: 'POST', path: '/api/food-logs/copy', body: {} })).toBeNull();
  });

  it('local ids are recognisable', () => {
    expect(isLocalId(localId('abc'))).toBe(true);
    expect(isLocalId('64f0c0ffee')).toBe(false);
  });
});

describe('write-through (already-synced writes patched into saved copies)', () => {
  it('without the pending flag, patched entries are not shown as "waiting to sync"', () => {
    const op: PendingOp = { method: 'POST', path: '/api/water', body: { date: D, amountMl: 250, clientId: 'w1' } };
    const r: any = applyPending(`/api/water?date=${D}`, { logs: [], totalMl: 0, totalLiters: 0 }, [op], { pending: false });
    expect(r.totalMl).toBe(250);
    expect(r.logs[0].pending).toBeUndefined();
    const again: any = applyPending(`/api/water?date=${D}`, { logs: [], totalMl: 0, totalLiters: 0 }, [op]);
    expect(again.logs[0].pending).toBe(true); // default behaviour unchanged for the offline queue
  });

  it('a just-logged meal is already in the saved day summary used by Home', () => {
    const op: PendingOp = { method: 'POST', path: '/api/food-logs', body: { date: D, mealType: 'lunch', clientId: 'f1' }, meta: { foodName: 'Dal', nutritionTotal: { calories: 300, protein: 12, carbohydrates: 40, fat: 8 } } };
    const r: any = applyPending(`/api/progress/day?date=${D}`, dayBase(), [op], { pending: false });
    expect(r.summary.calories).toBe(300);
    expect(r.food[0].pending).toBeUndefined();
  });
});

describe('a finished workout deleted by the id the app gave it', () => {
  const withLogs = () => ({ ...dayBase(), exercise: [
    { _id: 'e1', clientId: 'ws-abc', caloriesBurned: 200, durationMinutes: 30, activityName: 'Strength' },
    { _id: 'e2', clientId: 'bp-wp-xyz', caloriesBurned: 150, durationMinutes: 25, activityName: 'Strength Training' },
    { _id: 'e3', clientId: 'other', caloriesBurned: 90, durationMinutes: 10, activityName: 'Walk' },
  ] });
  const del = (path: string): PendingOp => ({ method: 'DELETE', path, createdAt: 5 });

  it('is understood: classic -> its own entry, Smart -> the entry the server made (bp-<id>)', () => {
    expect(opToEvent(del('/api/activities/logs?clientId=ws-abc'))).toEqual({ k: 'exercise-', id: '', clientId: 'ws-abc' });
    expect(opToEvent(del('/api/body-plan/session?clientId=wp-xyz&date=2026-11-23'))).toEqual({ k: 'exercise-', id: '', clientId: 'bp-wp-xyz' });
    expect(opToEvent(del('/api/activities/logs/e1'))).toEqual({ k: 'exercise-', id: 'e1' });          // by database id: unchanged
    expect(opToEvent(del('/api/activities/logs'))).toBeNull();                                          // no id at all: nothing to predict
    expect(opToEvent(del('/api/body-plan/session'))).toBeNull();
  });

  it("Home's day drops that entry and its calories at once (even offline), and keeps the others", () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, withLogs(), [del('/api/activities/logs?clientId=ws-abc')]);
    expect(r.exercise.map((x: any) => x._id)).toEqual(['e2', 'e3']);
    expect(r.summary.workoutCalories).toBe(240);
    const s: any = applyPending(`/api/progress/day?date=${D}`, withLogs(), [del('/api/body-plan/session?clientId=wp-xyz')]);
    expect(s.exercise.map((x: any) => x._id)).toEqual(['e1', 'e3']);
    expect(s.summary.workoutCalories).toBe(290);
  });

  it('the exercise list for a day drops it too', () => {
    const server = { logs: withLogs().exercise };
    const r: any = applyPending(`/api/activities/logs?date=${D}`, server, [del('/api/body-plan/session?clientId=wp-xyz')]);
    expect(r.logs.map((x: any) => x._id)).toEqual(['e1', 'e3']);
  });

  it('a delete for an id that is not there changes nothing', () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, withLogs(), [del('/api/activities/logs?clientId=ws-nothing')]);
    expect(r.exercise.length).toBe(3);
  });
});

describe('a logged workout fixed while offline', () => {
  const logs = () => ({ ...dayBase(), exercise: [
    { _id: 'e1', clientId: 'c1', caloriesBurned: 336, caloriesSource: 'estimated', durationMinutes: 60, activityName: 'Strength', date: D, met: 5, weightKg: 80, notes: '' },
    { _id: 'e2', clientId: 'c2', caloriesBurned: 90, durationMinutes: 10, activityName: 'Walk', date: D, notes: '' },
  ] });
  const patch = (id: string, body: any, createdAt = 5): PendingOp => ({ method: 'PATCH', path: `/api/activities/logs/${id}`, body, createdAt });

  it('is understood: only the fields an edit can change; an empty or unrelated edit is ignored', () => {
    expect(opToEvent(patch('e1', { durationMinutes: 30, notes: 'x', bogus: 1 }))).toEqual({ k: 'exercise~', id: 'e1', patch: { durationMinutes: 30, notes: 'x' } });
    expect(opToEvent(patch('e1', {}))).toBeNull();
    expect(opToEvent(patch('e1', { durationMinutes: 'abc' }))).toBeNull();
    expect(opToEvent({ method: 'PATCH', path: '/api/activities/logs', body: { notes: 'x' } })).toBeNull();
  });

  it("Home's day shows new minutes with calories that follow them, and the day total updates", () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('e1', { durationMinutes: 30 })]);
    const e1 = r.exercise.find((x: any) => x._id === 'e1');
    expect(e1.durationMinutes).toBe(30); expect(Math.round(e1.caloriesBurned)).toBe(168);
    expect(r.summary.workoutCalories).toBe(Math.round(168 + 90));
  });

  it('typed calories are kept; a note-only edit leaves calories alone', () => {
    const a: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('e1', { caloriesBurned: 250 })]);
    expect(a.exercise[0].caloriesBurned).toBe(250); expect(a.exercise[0].caloriesSource).toBe('manual');
    const b: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('e1', { notes: 'felt good' })]);
    expect(b.exercise[0].caloriesBurned).toBe(336); expect(b.exercise[0].notes).toBe('felt good');
  });

  it('two edits apply in the order they were made', () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('e1', { durationMinutes: 30 }, 1), patch('e1', { caloriesBurned: 100 }, 2)]);
    expect(r.exercise[0].durationMinutes).toBe(30); expect(r.exercise[0].caloriesBurned).toBe(100);
  });

  it('moving it to another day takes it out of this day', () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('e1', { date: '2020-01-01' })]);
    expect(r.exercise.map((x: any) => x._id)).toEqual(['e2']);
    const l: any = applyPending(`/api/activities/logs?date=${D}`, { logs: logs().exercise }, [patch('e1', { date: '2020-01-01' })]);
    expect(l.logs.map((x: any) => x._id)).toEqual(['e2']);
  });

  it('an entry still waiting to be created can be fixed too', () => {
    const create: PendingOp = { method: 'POST', path: '/api/activities/logs', body: { clientId: 'newc', date: D, durationMinutes: 20, caloriesBurned: 100 }, meta: { activityName: 'Walk' }, createdAt: 3 };
    const id = (opToEvent(create) as any).id;
    const r: any = applyPending(`/api/activities/logs?date=${D}`, { logs: [] }, [create, patch(id, { durationMinutes: 45, notes: 'edited' }, 4)]);
    expect(r.logs.length).toBe(1); expect(r.logs[0].durationMinutes).toBe(45); expect(r.logs[0].notes).toBe('edited');
  });

  it('an edit to an entry that is not in the list changes nothing', () => {
    const r: any = applyPending(`/api/progress/day?date=${D}`, logs(), [patch('nope', { durationMinutes: 5 })]);
    expect(r.exercise.length).toBe(2); expect(r.exercise[0].durationMinutes).toBe(60);
  });
});

describe('quick-add correction offline', () => {
  const quickRow = (over: any = {}) => ({ _id: 'q1', quick: true, foodName: 'Burger and fries', date: D, mealType: 'lunch', servings: 1, consumedQuantity: 1, servingUnit: 'serving',
    nutritionPerServing: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 }, nutritionTotal: { calories: 825, protein: 30, carbohydrates: 70.5, fat: 40 }, ...over });
  const fix = (id: string, body: any, meta: any = { date: D }): PendingOp => ({ method: 'PATCH', path: `/api/food-logs/${id}`, body, meta, createdAt: 5 });
  const list = (rows: any[]) => ({ success: true, logs: rows });

  it('the op becomes a correction event; a meal move and a portion change stay what they were', () => {
    expect(opToEvent(fix('q1', { calories: 700, foodName: 'Pizza' }))).toMatchObject({ k: 'food*', id: 'q1', patch: { foodName: 'Pizza', per: { calories: 700 } } });
    expect(opToEvent(fix('q1', { mealType: 'dinner' }))).toMatchObject({ k: 'food~', id: 'q1', mealType: 'dinner' });
    expect(opToEvent(fix('q1', { quantity: 2 }))).toBeNull();
  });

  it('the food list shows the corrected numbers and name at once', () => {
    const r: any = applyPending(`/api/food-logs?date=${D}`, list([quickRow()]), [fix('q1', { calories: 700, foodName: 'Veg burger' })]);
    expect(r.logs[0].nutritionTotal.calories).toBe(700);
    expect(r.logs[0].nutritionTotal.protein).toBe(30);               // not sent, not touched
    expect(r.logs[0].foodName).toBe('Veg burger');
    expect(r.logs[0].nutritionPerServing.calories).toBe(700);
    expect(r.logs[0].quick).toBe(true);
  });

  it('Home totals follow, even though the day endpoint does not mark rows as quick', () => {
    const day: any = { ...dayBase(), food: [quickRow({ quick: undefined })], summary: { ...dayBase().summary, calories: 825, protein: 30, carbohydrates: 70.5, fat: 40, meals: { lunch: 825 } } };
    const r: any = applyPending(`/api/progress/day?date=${D}`, day, [fix('q1', { calories: 700, protein: 35 })]);
    expect(r.food[0].nutritionTotal.calories).toBe(700);
    expect(r.summary.calories).toBe(700);
    expect(r.summary.protein).toBe(35);
    expect(r.summary.meals.lunch).toBe(700);
  });

  it('an entry an older app stretched to 2 servings: the per-serving number is scaled, so the total is what was typed', () => {
    const row = quickRow({ servings: 2, nutritionPerServing: { calories: 350, protein: 15, carbohydrates: 35, fat: 20 }, nutritionTotal: { calories: 700, protein: 30, carbohydrates: 70, fat: 40 } });
    const r: any = applyPending(`/api/food-logs?date=${D}`, list([row]), [fix('q1', { calories: 400 })]);
    expect(r.logs[0].nutritionTotal.calories).toBe(800);
    expect(r.logs[0].nutritionPerServing.calories).toBe(400);
  });

  it('two corrections in a row apply oldest first; other rows are untouched', () => {
    const other = quickRow({ _id: 'q2', foodName: 'Samosa', nutritionTotal: { calories: 250, protein: 5, carbohydrates: 30, fat: 12 }, nutritionPerServing: { calories: 250, protein: 5, carbohydrates: 30, fat: 12 } });
    const r: any = applyPending(`/api/food-logs?date=${D}`, list([quickRow(), other]), [fix('q1', { calories: 700 }), fix('q1', { calories: 650, fat: 30 })]);
    expect(r.logs[0].nutritionTotal).toMatchObject({ calories: 650, fat: 30, protein: 30 });
    expect(r.logs[1].nutritionTotal.calories).toBe(250);
  });

  it('History totals move by the change, for the right day only', () => {
    const row = (date: string) => ({ date, waterMl: 0, calories: 2000, protein: 100, carbohydrates: 200, fat: 60, fiber: 0, sugar: 0, exerciseMinutes: 0, caloriesBurned: 0, steps: 0, tasksTotal: 0, tasksCompleted: 0, habitsCompleted: 0 });
    const history = { days: [row('2026-10-02'), row(D)], totals: {} };
    const r: any = applyPending('/api/progress/history?from=2026-10-02&to=2026-10-03', history, [fix('q1', { calories: 700, fat: 30 }, { date: D, delta: { calories: -125, fat: -10 } })]);
    expect(r.days[1]).toMatchObject({ calories: 1875, fat: 50, protein: 100 });
    expect(r.days[0].calories).toBe(2000);
  });

  it('a correction to an entry that is not in the list changes nothing', () => {
    const r: any = applyPending(`/api/food-logs?date=${D}`, list([quickRow()]), [fix('nope', { calories: 1 })]);
    expect(r.logs[0].nutritionTotal.calories).toBe(825);
  });

  it('a correction to an entry still waiting to be created shows on that local copy', () => {
    const r: any = applyPending(`/api/food-logs?date=${D}`, list([]), [food(450, 'c1'), fix('local:c1', { calories: 300 })]);
    expect(r.logs[0].nutritionTotal.calories).toBe(300);
  });
});
