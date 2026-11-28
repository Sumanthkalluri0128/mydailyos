import { coachLine, CoachInput } from '../coach';

const base: CoachInput = {
  hour: 10, eatenKcal: 500, budgetKcal: 2000, meals: { breakfast: true, lunch: false, dinner: false },
  waterMl: 800, waterTarget: 2500, steps: 3000, stepsTarget: 10000, exerciseMin: 10, exerciseTarget: 30, streak: null,
};
const at = (o: Partial<CoachInput>) => coachLine({ ...base, ...o });

describe('coachLine', () => {
  it('celebrates when all three goals are done, at any hour', () => {
    expect(at({ steps: 10000, waterMl: 2500, exerciseMin: 30, hour: 9 }).title).toBe('Perfect day');
  });
  it('is gentle, never shaming, when over budget', () => {
    const c = at({ eatenKcal: 2400 });
    expect(c.tone).toBe('calm');
    expect(c.text).toContain("won't undo");
  });
  it('counts down the last steps with a walking time', () => {
    const c = at({ steps: 8500 });
    expect(c.title).toBe('Almost there');
    expect(c.text).toContain('1,500 steps');
    expect(c.text).toContain('15 minutes');
  });
  it('celebrates the steps goal', () => expect(at({ steps: 10400 }).title).toBe('Steps goal smashed'));
  it('asks for breakfast in the morning only when it is missing', () => {
    expect(at({ hour: 8, meals: { breakfast: false, lunch: false, dinner: false } }).title).toBe('Fuel your morning');
    expect(at({ hour: 8 }).title).not.toBe('Fuel your morning');
  });
  it('protects a streak in the evening', () => {
    expect(at({ hour: 19, streak: { current: 6, loggedToday: false }, meals: { breakfast: true, lunch: true, dinner: true } }).title).toBe('Protect your 6-day streak');
  });
  it('does not nag about a streak that is already safe', () => {
    expect(at({ hour: 19, streak: { current: 6, loggedToday: true }, meals: { breakfast: true, lunch: true, dinner: true } }).title).not.toContain('streak');
  });
  it('nudges water in the afternoon when it is low', () => {
    expect(at({ hour: 15, meals: { breakfast: true, lunch: true, dinner: false }, waterMl: 300, steps: 6000 }).title).toBe('Hydration check');
  });
  it('wishes goodnight with the goal count', () => {
    expect(at({ hour: 23, steps: 10000 }).title).toBe('1 of 3 goals done');
  });
  it('never divides by a zero target', () => {
    const c = at({ stepsTarget: 0, waterTarget: 0, exerciseTarget: 0, budgetKcal: 0 });
    expect(typeof c.title).toBe('string');
  });
  it('always returns a complete line', () => {
    for (let h = 0; h < 24; h++) for (const steps of [0, 4000, 9000, 12000]) {
      const c = at({ hour: h, steps });
      expect(!!c.emoji && !!c.title && !!c.text).toBe(true);
    }
  });
});
