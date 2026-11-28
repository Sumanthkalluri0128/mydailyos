import { workoutIsPending, workoutReminderPlan, WORKOUT_REMINDER_DAYS, type WorkoutReminderItem } from '../reminderSchedule';

const NOW = new Date(2026, 9, 20, 9, 0, 0);            // Tue 20 Oct 2026, 09:00 local
const TODAY = '2026-10-20';
const w = (id: string, date: string, over: Partial<WorkoutReminderItem> = {}): WorkoutReminderItem => ({ _id: id, date, kind: 'strength', title: `Workout ${id}`, minutes: 45, status: 'planned', done: false, ...over });
const plan = (items: WorkoutReminderItem[], over: any = {}) => workoutReminderPlan(items, { today: TODAY, time: '18:00', now: NOW, ...over });
const at = (r: { at: Date }) => `${r.at.getFullYear()}-${String(r.at.getMonth() + 1).padStart(2, '0')}-${String(r.at.getDate()).padStart(2, '0')} ${String(r.at.getHours()).padStart(2, '0')}:${String(r.at.getMinutes()).padStart(2, '0')}`;

describe('which workouts still need a reminder', () => {
  it('planned yes; done, ticked-done, skipped and rest no', () => {
    expect(workoutIsPending(w('a', TODAY))).toBe(true);
    expect(workoutIsPending(w('a', TODAY, { done: true }))).toBe(false);          // matched by a logged exercise
    expect(workoutIsPending(w('a', TODAY, { status: 'done' }))).toBe(false);      // ticked
    expect(workoutIsPending(w('a', TODAY, { status: 'skipped' }))).toBe(false);
    expect(workoutIsPending(w('a', TODAY, { kind: 'rest' }))).toBe(false);
  });
  it('one marked done on this phone (the server may not know yet) is not pending', () => {
    expect(workoutIsPending(w('a', TODAY), new Set(['a']))).toBe(false);
    expect(workoutIsPending(w('a', TODAY), new Set(['other']))).toBe(true);
  });
});

describe('workoutReminderPlan', () => {
  it('one reminder per day that has a workout, at the chosen time, soonest first', () => {
    const r = plan([w('b', '2026-10-22'), w('a', TODAY), w('c', '2026-10-24')]);
    expect(r.map(at)).toEqual(['2026-10-20 18:00', '2026-10-22 18:00', '2026-10-24 18:00']);
    expect(r.map((x) => x.date)).toEqual([TODAY, '2026-10-22', '2026-10-24']);
  });
  it('the text names the workout and its length', () => {
    const [r] = plan([w('a', TODAY, { title: 'Leg day', minutes: 50 })]);
    expect(r.title).toBe('🏋️ Workout today');
    expect(r.body).toBe('Leg day · 50 min. Tap to open your plan.');
  });
  it('an untitled workout falls back to its kind; no minutes shows just the name', () => {
    expect(plan([w('a', TODAY, { title: '', kind: 'cardio', minutes: 0 })])[0].body).toBe('Cardio. Tap to open your plan.');
  });
  it('two or more on one day are ONE reminder; more than two say how many more', () => {
    const two = plan([w('a', TODAY, { title: 'Upper' }), w('b', TODAY, { title: 'Run', minutes: 20 })]);
    expect(two).toHaveLength(1);
    expect(two[0].title).toBe('🏋️ 2 workouts today');
    expect(two[0].body).toBe('Upper · 45 min, Run · 20 min. Tap to open your plan.');
    expect(two[0].ids).toEqual(['a', 'b']);
    const four = plan([w('a', TODAY), w('b', TODAY), w('c', TODAY), w('d', TODAY)]);
    expect(four[0].title).toBe('🏋️ 4 workouts today');
    expect(four[0].body).toContain('+2 more');
  });
  it('doing one of two leaves a reminder for the other; doing both leaves none for that day', () => {
    const items = [w('a', TODAY, { title: 'Upper' }), w('b', TODAY, { title: 'Run' })];
    const one = plan(items, { doneIds: ['a'] });
    expect(one[0].title).toBe('🏋️ Workout today'); expect(one[0].body).toContain('Run');
    expect(plan(items, { doneIds: ['a', 'b'] })).toEqual([]);
  });
  it('a time that has already passed today is skipped, but tomorrow still gets its reminder', () => {
    const r = plan([w('a', TODAY), w('b', '2026-10-21')], { now: new Date(2026, 9, 20, 19, 0, 0) });
    expect(r.map((x) => x.date)).toEqual(['2026-10-21']);
  });
  it('done, skipped and rest days get nothing', () => {
    expect(plan([w('a', TODAY, { done: true }), w('b', '2026-10-21', { status: 'skipped' }), w('c', '2026-10-22', { kind: 'rest' })])).toEqual([]);
  });
  it('only the next 7 days (today included) are scheduled, across a month end', () => {
    expect(WORKOUT_REMINDER_DAYS).toBe(7);
    const items = ['2026-10-26', '2026-10-27', '2026-10-31', '2026-11-02'].map((d, i) => w(`x${i}`, d));
    const r = workoutReminderPlan(items, { today: '2026-10-28', time: '07:30', now: new Date(2026, 9, 28, 6, 0, 0) });
    expect(r.map((x) => x.date)).toEqual(['2026-10-31', '2026-11-02']);          // the 26th and 27th are before today; 28th + 6 = 3 Nov is the last day in range
    expect(at(r[1])).toBe('2026-11-02 07:30');
  });
  it('yesterday and anything beyond the window are ignored', () => {
    expect(plan([w('a', '2026-10-19'), w('b', '2026-10-27')])).toEqual([]);       // 27th is day 8
    expect(plan([w('c', '2026-10-26')]).map((x) => x.date)).toEqual(['2026-10-26']); // day 7 is in
  });
  it('a bad time schedules nothing', () => {
    expect(plan([w('a', TODAY)], { time: '25:00' })).toEqual([]);
    expect(plan([w('a', TODAY)], { time: '' })).toEqual([]);
  });
  it('an empty or missing list is fine', () => {
    expect(plan([])).toEqual([]);
    expect(workoutReminderPlan(undefined as any, { today: TODAY, time: '18:00', now: NOW })).toEqual([]);
  });
});
