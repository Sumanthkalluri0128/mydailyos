import { weekSummary } from '../weekSummary';

const tips = [{ id: 'a', icon: '💧', title: 'Drink more water', detail: 'Add a glass after lunch.' }, { id: 'b', icon: '🥬', title: 'More veg', detail: 'x' }, { id: 'c', icon: '🚶', title: 'Walk', detail: 'y' }];
describe('weekSummary', () => {
  it('builds three kind sections from the coach numbers', () => {
    const s = weekSummary({ review: { headline: 'Solid week', score: 72, loggedDays: 5, avgProtein: 96.4 }, tips, challenge: { defeated: true }, bossName: 'Zoro' });
    expect(s.well).toEqual(['You logged 5 of 7 days.', 'Protein averaged 96 g a day.', 'You beat Zoro this week.']);
    expect(s.change.map((c) => c.id)).toEqual(['a', 'b']);
    expect(s.next?.id).toBe('a');
  });
  it('few logged days still opens with something true and positive', () => {
    expect(weekSummary({ review: { loggedDays: 1 } }).well).toEqual(['You showed up and logged on 1 day.']);
    expect(weekSummary({ review: { loggedDays: 0 } }).well[0]).toMatch(/fresh start/);
  });
  it('no tips: no change list and no next step', () => {
    const s = weekSummary({ review: { loggedDays: 3 } });
    expect(s.change).toEqual([]);
    expect(s.next).toBeNull();
  });
});
