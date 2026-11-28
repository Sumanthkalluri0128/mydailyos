import { reactionFor } from '../reaction';
const base = { hour: 13, exerciseMin: 0, exerciseTarget: 30, steps: 6000, stepsTarget: 8000, lunchLogged: false, streakDays: 0 };
describe('reactionFor', () => {
  it('Goku powers up when the workout goal is met', () => expect(reactionFor({ ...base, exerciseMin: 40 })?.who).toBe('goku'));
  it('Luffy eats once lunch is logged', () => expect(reactionFor({ ...base, lunchLogged: true })?.who).toBe('luffy'));
  it('Zoro trains when steps are low in the afternoon', () => expect(reactionFor({ ...base, hour: 16, steps: 1000 })?.who).toBe('zoro'));
  it('Jin-Woo levels up on weekly streak milestones', () => expect(reactionFor({ ...base, streakDays: 14 })?.scene).toBe('levelup'));
  it('no reaction otherwise', () => expect(reactionFor(base)).toBeNull());
});
