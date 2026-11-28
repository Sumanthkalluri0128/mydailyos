import { OLD_TO_NEW, oldBadgeUnlocked } from '../simpleBadges';

const shelves = { shelves: [{ badges: [{ id: 'log-streak', tier: 2 }, { id: 'water-streak', tier: 0 }, { id: 'workouts', tier: 3 }] }] };

describe('old badge ids keep working on the new shelves', () => {
  it('unlocks by tier', () => {
    expect(oldBadgeUnlocked(shelves, 'log-7')).toBe(true);
    expect(oldBadgeUnlocked(shelves, 'log-30')).toBe(true);
    expect(oldBadgeUnlocked(shelves, 'log-100')).toBe(false);
    expect(oldBadgeUnlocked(shelves, 'water-3')).toBe(false);
    expect(oldBadgeUnlocked(shelves, 'workouts-50')).toBe(true);
  });
  it('is safe with missing data and unknown ids', () => {
    expect(oldBadgeUnlocked(null, 'log-7')).toBe(false);
    expect(oldBadgeUnlocked(shelves, 'nope')).toBe(false);
  });
  it('maps every sticker badge id used by the Achievements screen', () => {
    for (const id of ['tasks-1', 'log-7', 'workout-3', 'water-3', 'workout-7', 'water-7', 'tasks-10', 'workouts-10', 'habit-7', 'meals-50', 'workouts-50', 'water-30', 'log-30']) expect(OLD_TO_NEW[id]).toBeDefined();
  });
});
