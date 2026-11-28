import { DAYS, EXERCISES, WARMUP, COOLDOWN, MOBILITY, dayForDate, weekdayOf } from '../../data/workoutPlan';
import * as W from '../workoutEngine';
import { figureFor } from '../exerciseFigure';

const ex = (id: string) => EXERCISES[id];
const mk = (date: string, over: Partial<W.Session> = {}): W.Session => ({
  id: `s-${date}-${Math.random()}`, date, dayN: 1, title: 'Upper Body A', short: 'Upper A', kind: 'strength',
  startedAt: Date.parse(`${date}T08:00:00`), endedAt: Date.parse(`${date}T08:50:00`), durationSec: 3000, kcal: 250, volumeKg: 1000, setsDone: 10,
  exercises: [], feel: 'good', note: '', warmDone: 0, coolDone: 0, synced: false, ...over,
});
const sess = (exId: string, sets: [number, number][]) => ({ baseId: exId, exId, restSec: 60, targetReps: '10-12', unit: 'reps' as const, hint: '', sets: sets.map(([kg, reps]) => ({ kg, reps, done: true })) });

describe('plan data', () => {
  it('has 7 days, Monday first, and every day number matches its weekday', () => {
    expect(DAYS.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(weekdayOf('2026-11-02')).toBe(1); // Monday
    expect(weekdayOf('2026-11-08')).toBe(7); // Sunday
    expect(dayForDate('2026-11-05').short).toBe('Upper B'); // Thursday
  });
  it('every exercise and alternative the plan names exists', () => {
    for (const d of DAYS) for (const it of d.items) {
      expect(ex(it.ex)).toBeTruthy();
      expect(it.alts.length).toBeGreaterThanOrEqual(3);
      for (const a of it.alts) expect(ex(a)).toBeTruthy();
      expect(new Set([it.ex, ...it.alts]).size).toBe(it.alts.length + 1); // no duplicates
    }
  });
  it('every exercise has steps, a tip, muscles', () => {
    for (const e of Object.values(EXERCISES)) {
      expect(e.steps.length).toBe(3);
      expect(e.tip.length).toBeGreaterThan(8);
      expect(e.muscles.length).toBeGreaterThan(0);
    }
  });
  it('every illustrated exercise resolves to a real figure', () => {
    for (const e of Object.values(EXERCISES)) {
      if (!e.fig && !e.slot) continue;
      const kind = { Dumbbell: 'free weights', Cable: 'cable', Machine: 'machine', Band: 'band' }[e.gear as string];
      expect(figureFor({ id: e.fig, slot: e.slot, name: e.name, kind, targets: e.targets })).toBeTruthy();
    }
  });
  it('routines have 3+ alternatives each', () => {
    for (const r of [...WARMUP, ...COOLDOWN, ...MOBILITY]) expect(r.alts.length).toBeGreaterThanOrEqual(3);
  });
});

describe('engine basics', () => {
  it('reads rep ranges', () => {
    expect(W.repRange('8-12')).toEqual([8, 12]);
    expect(W.repRange('10')).toEqual([10, 10]);
    expect(W.repRange('')).toEqual([8, 12]);
  });
  it('estimates calories from MET, body weight and minutes', () => {
    expect(W.estimateKcal(4, 70, 50)).toBe(Math.round((4 - 1) * 3.5 * 70 / 200 * 50)); // net of resting energy: (MET - 1)
    expect(W.estimateKcal(4, 0, 10)).toBe(W.estimateKcal(4, 70, 10));
  });
  it('planned minutes look sane for strength days', () => {
    for (const d of DAYS.filter((x) => x.kind === 'strength')) {
      const m = W.plannedMinutes(d);
      expect(m).toBeGreaterThanOrEqual(25);
      expect(m).toBeLessThanOrEqual(70);
    }
    expect(W.plannedMinutes(DAYS[6])).toBe(0);
  });
  it('only honours a swap that the plan allows', () => {
    const item = DAYS[3].items[1]; // lat pulldown
    expect(W.chosenId(4, item, { 4: { [item.ex]: 'assisted-pullup' } })).toBe('assisted-pullup');
    expect(W.chosenId(4, item, { 4: { [item.ex]: 'plank' } })).toBe(item.ex);
    expect(W.chosenId(4, item, {})).toBe(item.ex);
  });
});

describe('beat last time', () => {
  const item = { ex: 'chest-press-machine', sets: 3, reps: '10-12', restSec: 75, alts: [] };
  it('new exercise: no invented weight', () => {
    const s = W.suggestNext(ex('chest-press-machine'), item, null);
    expect(s.kg).toBe(0);
    expect(s.reps).toBe(10);
    expect(s.fromLast).toBe(false);
  });
  it('one more rep when not at the top yet', () => {
    const s = W.suggestNext(ex('chest-press-machine'), item, { date: 'd', sets: [{ kg: 30, reps: 10 }, { kg: 30, reps: 10 }, { kg: 30, reps: 9 }] });
    expect(s.kg).toBe(30);
    expect(s.reps).toBe(10);
  });
  it('smallest weight step when every set hit the top', () => {
    const s = W.suggestNext(ex('chest-press-machine'), item, { date: 'd', sets: [{ kg: 30, reps: 12 }, { kg: 30, reps: 12 }, { kg: 30, reps: 12 }] });
    expect(s.kg).toBe(32.5);
    expect(s.reps).toBe(10);
  });
  it('bodyweight moves only add reps', () => {
    const it2 = { ex: 'incline-pushup', sets: 3, reps: '8-12', restSec: 75, alts: [] };
    const s = W.suggestNext(ex('incline-pushup'), it2, { date: 'd', sets: [{ kg: 0, reps: 12 }, { kg: 0, reps: 12 }, { kg: 0, reps: 12 }] });
    expect(s.kg).toBe(0);
    expect(s.reps).toBeGreaterThan(12);
  });
  it('finds the latest session for an exercise', () => {
    const a = mk('2026-10-01', { exercises: [sess('chest-press-machine', [[20, 10]])] });
    const b = mk('2026-10-08', { exercises: [sess('chest-press-machine', [[25, 10]])] });
    expect(W.lastTimeFor([a, b], 'chest-press-machine')?.sets[0].kg).toBe(25);
    expect(W.lastTimeFor([a, b], 'plank')).toBeNull();
  });
});

describe('building and finishing a session', () => {
  it('builds sets for every plan exercise and starts strength days with the warm-up', () => {
    const a = W.buildSession(DAYS[3], {}, [], '2026-11-05', 1000);
    expect(a.exercises).toHaveLength(DAYS[3].items.length);
    expect(a.phase).toBe('warmup');
    expect(a.exercises[0].sets).toHaveLength(3);
    expect(W.buildSession(DAYS[2], {}, [], '2026-11-04', 1000).phase).toBe('main');
  });
  it('uses the chosen alternative and its own history', () => {
    const hist = [mk('2026-10-29', { exercises: [sess('assisted-pullup', [[30, 12], [30, 12], [30, 12]])] })];
    const a = W.buildSession(DAYS[3], { 4: { 'lat-pulldown': 'assisted-pullup' } }, hist, '2026-11-05', 1000);
    expect(a.exercises[1].exId).toBe('assisted-pullup');
    expect(a.exercises[1].sets[0].kg).toBe(32.5);
  });
  it('swaps inside a running session and keeps finished sets', () => {
    const a = W.buildSession(DAYS[3], {}, [], '2026-11-05', 1000);
    a.exercises[1].sets[0].done = true;
    const b = W.swapInSession(a, 1, 'band-pulldown', DAYS[3], []);
    expect(b.exercises[1].exId).toBe('band-pulldown');
    expect(b.exercises[1].sets[0].done).toBe(true);
    expect(b.exercises[1].sets[1].done).toBe(false);
  });
  it('finishing keeps only worked exercises and counts volume, sets and calories', () => {
    const a = W.buildSession(DAYS[3], {}, [], '2026-11-05', 0);
    a.exercises[0].sets.forEach((s) => { s.done = true; s.kg = 40; s.reps = 10; });
    a.exercises[1].sets[0].done = true;
    const s = W.finishSession(a, { now: 40 * 60 * 1000, bodyKg: 70, feel: 'good', note: ' nice ', history: [] });
    expect(s.exercises).toHaveLength(2);
    expect(s.setsDone).toBe(4);
    expect(s.volumeKg).toBeGreaterThanOrEqual(1200);
    expect(s.kcal).toBe(W.estimateKcal(5, 70, 40)); // a strength day: MET 5 from the shared session table, the same number the web gives
    expect(s.kcal).toBe(196);                       // (5 - 1) x 3.5 x 70 / 200 x 40
    expect(s.note).toBe('nice');
    expect(s.durationSec).toBe(2400);
  });
  it('time stops while paused', () => {
    const a = { startedAt: 0, pausedMs: 60000, pausedAt: null as number | null };
    expect(W.elapsedSec(a, 180000)).toBe(120);
    expect(W.elapsedSec({ ...a, pausedAt: 100000 }, 999999)).toBe(40);
  });
});

describe('records', () => {
  it('never calls the first time a record', () => {
    expect(W.detectPRs([sess('chest-press-machine', [[40, 10]])], [])).toEqual([]);
  });
  it('flags a better estimated 1RM, and more reps for bodyweight', () => {
    const hist = [mk('2026-10-01', { exercises: [sess('chest-press-machine', [[30, 10]]), sess('incline-pushup', [[0, 10]])] })];
    const prs = W.detectPRs([sess('chest-press-machine', [[35, 10]]), sess('incline-pushup', [[0, 12]])], hist);
    expect(prs.map((p) => p.kind).sort()).toEqual(['reps', 'weight']);
    expect(W.detectPRs([sess('chest-press-machine', [[25, 10]])], hist)).toEqual([]);
  });
});

describe('week, streak, history', () => {
  const today = '2026-11-05'; // Thursday
  it('week runs Monday to Sunday', () => {
    expect(W.weekDates(today)[0]).toBe('2026-11-02');
    expect(W.weekDates(today)[6]).toBe('2026-11-08');
  });
  it('states: done, today, missed, upcoming, rest', () => {
    const list = [mk('2026-11-02')];
    const s = W.weekStates(list, today).map((x) => x.state);
    expect(s).toEqual(['done', 'missed', 'missed', 'today', 'upcoming', 'upcoming', 'rest']);
  });
  it('streak: rest day does not break it, an untrained today does not either', () => {
    const list = ['2026-11-01', '2026-10-31', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'].map((d) => mk(d));
    // Sun 1st is a rest day with a session; chain Mon..Wed + Sat/Fri before it
    expect(W.streakDays(list, today)).toBe(6);
    expect(W.streakDays([], today)).toBe(0);
    // missed Tuesday breaks it
    expect(W.streakDays([mk('2026-11-02'), mk('2026-11-04')], today)).toBe(1);
  });
  it('rest-day gap is skipped over', () => {
    // Sat 31 Oct done, Sun 1 Nov rest (nothing), Mon 2 Nov done
    expect(W.streakDays([mk('2026-10-31'), mk('2026-11-02')], '2026-11-02')).toBe(2);
  });
  it('totals and ranges', () => {
    const list = [mk('2026-11-02'), mk('2026-11-03'), mk('2026-10-20')];
    expect(W.sessionsIn(list, 'week', today)).toHaveLength(2);
    expect(W.sessionsIn(list, 'month', today)).toHaveLength(2);
    expect(W.sessionsIn(list, 'all', today)).toHaveLength(3);
    const st = W.statsOf(W.sessionsIn(list, 'week', today));
    expect(st).toMatchObject({ workouts: 2, minutes: 100, kcal: 500 });
    expect(W.shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(W.shiftAnchor('week', today, 1)).toBe('2026-11-12');
  });
});

describe('which exercise-log activity a session is filed under (same as the web)', () => {
  const list = [
    { _id: '1', name: 'Strength Training', category: 'Strength' },
    { _id: '2', name: 'Bodyweight circuit', category: 'Cardio' },
    { _id: '3', name: 'Walking - Moderate', category: 'Walking' },
  ];
  it('strength, conditioning and recovery each get their own activity; "active" is recovery', () => {
    expect(W.pickSessionActivity(list, 'strength')?._id).toBe('1');
    expect(W.pickSessionActivity(list, 'conditioning')?._id).toBe('2');
    expect(W.pickSessionActivity(list, 'recovery')?._id).toBe('3');
    expect(W.pickSessionActivity(list, 'active')?._id).toBe('3');
  });
  it('a rest day is not filed at all', () => {
    expect(W.pickSessionActivity(list, 'rest')).toBeNull();
  });
  it('falls back to a strength activity when the named one is not in the list', () => {
    expect(W.pickSessionActivity([{ _id: '9', name: 'Weight lifting', category: 'Strength' }], 'conditioning')?._id).toBe('9');
    expect(W.pickSessionActivity([{ _id: '8', name: 'Yoga', category: 'Flexibility' }], 'strength')).toBeNull();
  });
});

describe('two workouts on one day, and a catch-up of another day (the Workout tab)', () => {
  // 2026-11-04 is a Wednesday (plan day 3). Day 1 (Monday's workout) is made up on Wednesday morning.
  const WED = '2026-11-04';
  const catchUp = mk(WED, { id: 'a', dayN: 1, durationSec: 1800, kcal: 150 });
  const own = mk(WED, { id: 'b', dayN: 3, title: 'Lower Body', short: 'Lower', durationSec: 2400, kcal: 200 });

  it("a catch-up of another day does NOT make today's own workout \"done\" (it used to: any session today counted)", () => {
    expect(W.doneForDay([catchUp], WED, 3)).toEqual([]);
    expect(W.doneForDay([catchUp, own], WED, 3).map((s) => s.id)).toEqual(['b']);
    expect(W.doneForDay([catchUp, own], WED, 1).map((s) => s.id)).toEqual(['a']);
  });
  it('only that date counts: the same plan day done on another date is not "done today"', () => {
    expect(W.doneForDay([mk('2026-11-03', { dayN: 3 })], WED, 3)).toEqual([]);
  });
  it('two workouts of the same day both count, and the line shows the day\'s total (it showed only the last one)', () => {
    const morning = mk(WED, { id: 'm', dayN: 3, durationSec: 1500, kcal: 120 });
    const evening = mk(WED, { id: 'e', dayN: 3, durationSec: 2100, kcal: 180 });
    const done = W.doneForDay([morning, evening], WED, 3);
    expect(done.length).toBe(2);
    expect(W.dayTotals(done)).toEqual({ count: 2, minutes: 60, kcal: 300 });
    expect(W.dayTotals([])).toEqual({ count: 0, minutes: 0, kcal: 0 });
  });
  it('the week strip is by date: any workout that day makes the day done, one or two', () => {
    const week = (list: W.Session[]) => W.weekStates(list, '2026-11-06');          // Friday
    expect(week([catchUp]).map((d) => d.state)).toEqual(['missed', 'missed', 'done', 'missed', 'today', 'upcoming', 'rest']);
    expect(week([catchUp, own]).map((d) => d.state)).toEqual(['missed', 'missed', 'done', 'missed', 'today', 'upcoming', 'rest']);
  });
  it('a streak counts DAYS, so two workouts on one day are one day', () => {
    expect(W.streakDays([catchUp, own], WED)).toBe(1);
    expect(W.streakDays([catchUp, own, mk('2026-11-03', { dayN: 2 })], WED)).toBe(2);
  });
  it('week totals count both workouts, but "days trained" counts the day once', () => {
    const list = [catchUp, own];
    expect(W.statsOf(list).workouts).toBe(2);
    expect(new Set(W.sessionsIn(list, 'week', WED).map((s) => s.date)).size).toBe(1);
  });
});
