import { buildCard, toSvg, fit, W, H } from '../wrappedCard';

const data: any = { month: '2026-10', daysLogged: 22, longestStreak: 9, bestWeek: { start: '2026-10-12', days: 7 }, favouriteFoods: [{ name: 'Dal & rice' }, { name: 'Idli' }], character: { who: 'zoro', stickers: 4 }, charactersUnlocked: 3, stickersTotal: 11, showHealth: false, workoutDays: 12, avgCalories: 1850, weightChangeKg: -0.8 };
const texts = (c: any) => c.ops.filter((o: any) => o.t === 'text').map((o: any) => o.text).join('\n');

describe('season recap card', () => {
  it('draws streak, best week, foods and characters inside the image', () => {
    const c = buildCard(data, { accent: '#2f9e44', characterName: 'Zoro' });
    const t = texts(c);
    for (const s of ['October 2026', 'Zoro', 'Best week: 12 Oct · 7 days', 'Dal & rice', 'Characters unlocked: 3']) expect(t.includes(s)).toBe(true);
    for (const o of c.ops) { expect(o.x >= 0 && o.y >= 0).toBe(true); if (o.t === 'rect') expect(o.x + o.w <= W && o.y + o.h <= H).toBe(true); }
  });
  it('shows health numbers only when switched on', () => {
    expect(/kcal|workout|kg/.test(texts(buildCard(data)))).toBe(false);
    expect(texts(buildCard({ ...data, showHealth: true })).includes('12 workout days')).toBe(true);
  });
  it('cuts long text and escapes svg', () => {
    expect(fit('x'.repeat(200), 40, 300).endsWith('…')).toBe(true);
    expect(toSvg(buildCard({ ...data, favouriteFoods: [{ name: '<i>' }] })).includes('&lt;i&gt;')).toBe(true);
  });
});
