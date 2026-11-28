import { displayedSteps, getSteps, resetStepStore, setSteps, subscribeSteps } from '../stepStore';
import { applyPending } from '../optimistic';

describe('stepStore: one number for every screen', () => {
  beforeEach(() => resetStepStore('2026-10-05'));

  it('notifies every subscriber the moment steps change (Home sees what Health typed)', () => {
    let homeSaw = -1;
    const off = subscribeSteps(() => { homeSaw = displayedSteps(getSteps()); });
    setSteps({ manual: { value: 4200, deviceAt: 0 } });
    expect(homeSaw).toBe(4200);
    off();
  });

  it('automatic: the higher of server and phone wins', () => {
    setSteps({ server: 3000, device: 2500 });
    expect(displayedSteps(getSteps())).toBe(3000);
    setSteps({ device: 3400 });
    expect(displayedSteps(getSteps())).toBe(3400);
  });

  it('a typed correction can go DOWN, and phone steps counted afterwards are added on top', () => {
    setSteps({ server: 9000, device: 9000 });
    setSteps({ manual: { value: 7000, deviceAt: 9000 } });
    expect(displayedSteps(getSteps())).toBe(7000);
    setSteps({ device: 9250 });
    expect(displayedSteps(getSteps())).toBe(7250);
  });

  it('a new day starts from zero', () => {
    setSteps({ server: 8000, device: 8000, manual: { value: 8000, deviceAt: 0 } });
    resetStepStore('2026-10-06');
    expect(displayedSteps(getSteps())).toBe(0);
    expect(getSteps().day).toBe('2026-10-06');
  });
});

describe('steps written offline show up everywhere (they used to be invisible until synced)', () => {
  const ops = [{ method: 'POST', path: '/api/health-logs', body: { type: 'steps', date: '2026-10-05', value: 6000, source: 'manual' } }];

  it('replaces the day total and its calories in the Home/Food day summary', () => {
    const day = { summary: { steps: 2000, stepCalories: 70, workoutCalories: 200, caloriesBurned: 270, weightKg: 70 }, food: [], water: [], exercise: [{ _id: 'x', caloriesBurned: 200, durationMinutes: 30 }], weight: [], tasks: [], habits: [] };
    const r: any = applyPending('/api/progress/day?date=2026-10-05', day, ops);
    expect(r.summary.steps).toBe(6000);
    expect(r.summary.stepCalories).toBe(210);          // same 0.035 kcal/step the server used
    expect(r.summary.caloriesBurned).toBe(410);        // 200 workout + 210 steps
  });

  it('updates the steps/day endpoint and History rows', () => {
    const sd: any = applyPending('/api/health-logs/steps/day?date=2026-10-05', { steps: 2000, caloriesBurned: 70, distanceKm: 1.52, source: 'device' }, ops);
    expect(sd.steps).toBe(6000);
    expect(sd.caloriesBurned).toBe(210);
    const h: any = applyPending('/api/progress/history?from=2026-10-05&to=2026-10-05', { days: [{ date: '2026-10-05', steps: 2000, stepCalories: 70, caloriesBurned: 270, weightKg: 70 }], totals: {} }, ops);
    expect(h.days[0].steps).toBe(6000);
    expect(h.days[0].caloriesBurned).toBe(410);
    expect(h.totals.steps).toBe(6000);
  });

  it('only touches the day it was logged for', () => {
    const day = { summary: { steps: 100, stepCalories: 3, workoutCalories: 0, caloriesBurned: 3 }, food: [], water: [], exercise: [], weight: [], tasks: [], habits: [] };
    const r: any = applyPending('/api/progress/day?date=2026-10-04', day, ops);
    expect(r.summary.steps).toBe(100);
  });
});
