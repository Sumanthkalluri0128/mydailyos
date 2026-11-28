import { PAIN_CHIPS, SKIP_REASONS, programToPhoneDays, registerProgram, sessionPayload, skipPayload, smartUsable, toExercise, variantDay, wayList } from '../smartPlan';
import { DAYS, EXERCISES, activeDays, dayByNumber, isSmartActive, setActiveDays } from '../../data/workoutPlan';
import * as W from '../workoutEngine';

// A real plan from the server (body plan + adapt): beginner, 4 days, gym and home, Tuesday 3 Nov 2026.
const fx = require('./fixtures/smart-both4.json');
const program = fx.plan.training.program;
const TODAY = '2026-11-03';
const days = programToPhoneDays(program, fx.plan.adapt);

afterEach(() => setActiveDays(null));

describe('programToPhoneDays', () => {
  it('7 days, Monday first, n = weekday, one slot each', () => {
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.map((d) => d.short)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.every((d) => d.smart)).toBe(true);
  });
  it('a passed slot is not listed again: it slides to a later day', () => {
    expect(days[0].kind).toBe('rest');
    expect(days[0].missed).toBe(true);
    const lifts = days.filter((d) => d.kind === 'strength');
    expect(lifts).toHaveLength(3);
    expect(new Set(lifts.map((d) => d.sessionId)).size).toBe(lifts.length);
  });
  it('a lifting day carries the phone plan shape: items with sets, a rep range, rest, alternatives', () => {
    const d = days.find((x) => x.kind === 'strength')!;
    expect(d.items.length).toBeGreaterThan(3);
    expect(d.minutes[0]).toBeGreaterThan(0);
    for (const it of d.items) {
      expect(it.ex).toBeTruthy();
      expect(it.sets).toBeGreaterThanOrEqual(1);
      expect(it.reps).toMatch(/^\d+(-\d+)?$/);
      expect(it.alts).not.toContain(it.ex);
    }
    expect(d.targets.length).toBeGreaterThan(0);
  });
  it('no exercise appears twice in a day', () => {
    for (const d of days) expect(new Set(d.items.map((i) => i.ex)).size).toBe(d.items.length);
  });
  it('active and rest days have no lifts', () => {
    expect(days.filter((d) => d.kind === 'active').every((d) => d.items.length === 0)).toBe(true);
    expect(days.filter((d) => d.kind === 'rest').every((d) => d.items.length === 0)).toBe(true);
  });
});

describe('registerProgram', () => {
  it('every exercise and alternative the plan uses exists in the phone library afterwards', () => {
    registerProgram(program);
    for (const d of days) for (const it of d.items) {
      expect(EXERCISES[it.ex]).toBeDefined();
      for (const a of it.alts) expect(EXERCISES[a]).toBeDefined();
    }
  });
  it('never replaces an exercise the built-in library already has', () => {
    const before = EXERCISES['incline-pushup'];
    registerProgram(program);
    expect(EXERCISES['incline-pushup']).toBe(before);
  });
  it('maps kinds, units and muscles', () => {
    const e = toExercise({ id: 'x1', name: 'plank', kind: 'bodyweight', unit: 'seconds', targets: ['core'], helpers: ['shoulders'], cue: 'Stay long.', form: { setup: 'Forearms down.' } });
    expect(e).toMatchObject({ id: 'x1', name: 'Plank', cat: 'Core', gear: 'Bodyweight', unit: 'sec' });
    expect(e.muscles).toEqual(['Core', 'Shoulders']);
    expect(e.steps[1]).toBe('Set up: Forearms down.');
  });
});

describe('active plan switch', () => {
  it('classic until a smart plan is set, then every screen sees the smart day, then back', () => {
    expect(isSmartActive()).toBe(false);
    expect(activeDays()).toBe(DAYS);
    setActiveDays(days);
    expect(isSmartActive()).toBe(true);
    expect(dayByNumber(2).smart).toBe(true);
    expect(dayByNumber(2).title).toBe(days[1].title);
    setActiveDays(null);
    expect(dayByNumber(2)).toBe(DAYS[1]);
  });
  it('ignores a plan that is not 7 days', () => {
    setActiveDays(days.slice(0, 3));
    expect(isSmartActive()).toBe(false);
  });
});

describe('smartUsable', () => {
  it('needs a ready plan worked out for THIS week', () => {
    expect(smartUsable(fx, TODAY)).toBe(true);
    expect(smartUsable(fx, '2026-11-12')).toBe(false);      // an old saved copy from last week
    expect(smartUsable(null, TODAY)).toBe(false);
    expect(smartUsable({ plan: { ready: false } }, TODAY)).toBe(false);
  });
});

describe('a smart workout end to end', () => {
  it('starts, finishes with the day as it was at the start, and posts the exercises (no separate exercise log)', () => {
    registerProgram(program);
    setActiveDays(days);
    const day = days.find((d) => d.kind === 'strength')!;
    const a = W.buildSession(day, {}, [], TODAY, 1_000_000);
    expect(a.snap).toMatchObject({ smart: true, sessionId: day.sessionId, title: day.title });
    a.exercises[0].sets.forEach((s) => { s.done = true; s.kg = 20; s.reps = 10; });
    setActiveDays(null);                                   // the week slides / plan switches while training: finishing must not look the day up again
    const s = W.finishSession(a, { now: 1_000_000 + 40 * 60_000, bodyKg: 78, feel: 'challenging', note: 'felt strong', history: [] });
    expect(s.plan).toBe('smart');
    expect(s.smartSessionId).toBe(day.sessionId);
    expect(s.title).toBe(day.title);
    const p = sessionPayload(s, { today: TODAY, phase: 'build' });
    expect(p).toMatchObject({ date: TODAY, sessionId: day.sessionId, status: 'done', feel: 'hard', phase: 'build', minutes: 40, notes: 'felt strong', clientId: `wp-${s.id}` });
    expect(p.exercises).toHaveLength(1);
    expect(p.exercises[0].sets).toEqual(Array(day.items[0].sets).fill({ reps: 10, weightKg: 20, seconds: 0 }));
  });
  it('a classic workout is unchanged: not marked smart', () => {
    const a = W.buildSession(DAYS[0], {}, [], TODAY, 1);
    a.exercises[0].sets[0].done = true;
    const s = W.finishSession(a, { now: 61_000, feel: 'good', note: '', history: [] });
    expect(s.plan).toBeUndefined();
  });
});

describe('Workout tab: Gym / Home / Quick 20, Not today, pain, the plan own warm-up', () => {
  const lift = () => programToPhoneDays(program, fx.plan.adapt).find((d) => d.kind === 'strength')!;
  it('a lifting day offers only the ways it has; rest days offer none', () => {
    expect(wayList(lift()).map((w) => w.k)).toEqual(['gym', 'home', 'quick']);
    expect(wayList(days.find((d) => d.kind === 'rest'))).toEqual([]);
    expect(wayList(lift(), true).map((w) => w.k)).toEqual(['gym', 'quick']);
  });
  it('variantDay swaps in the home or quick list and falls back to gym', () => {
    const d = lift();
    expect(variantDay(d, 'quick').items).toBe(d.ways!.quick!.items);
    expect(variantDay(d, 'gym')).toBe(d);
    expect(d.ways!.quick!.items[0].reps).toMatch(/^\d+(-\d+)?$/);
  });
  it('carries the plan own warm-up and cool-down', () => {
    const d = lift();
    expect(d.warmup!.length).toBeGreaterThan(0);
    expect(d.cooldown!.length).toBeGreaterThan(0);
  });
  it('a session started the Quick way remembers it, and pain + way reach the server payload', () => {
    const d = lift();
    const a = W.buildSession(d, {}, [], TODAY, Date.now(), undefined, 'quick');
    expect(a.snap!.way).toBe('quick');
    expect(a.exercises).toHaveLength(d.ways!.quick!.items.length);
    expect(a.snap!.warmup).toEqual(d.warmup);
    const s = W.finishSession(a, { now: Date.now() + 600000, feel: 'good', note: '', history: [], pain: ['knee'] });
    const p = sessionPayload(s, { today: TODAY });
    expect(p.way).toBe('quick');
    expect(p.pain).toEqual(['knee']);
  });
  it('Not today builds a safe-to-repeat skip with a reason', () => {
    const p = skipPayload(lift(), 'tired', TODAY, 'build');
    expect(p).toMatchObject({ status: 'skipped', reason: 'tired', exercises: [], phase: 'build' });
    expect(p.clientId).toBe(skipPayload(lift(), 'busy', TODAY).clientId);
    expect(SKIP_REASONS.map((r) => r[0])).toContain('pain');
    expect(PAIN_CHIPS.map((r) => r[0])).toContain('dizzy');
  });
});
