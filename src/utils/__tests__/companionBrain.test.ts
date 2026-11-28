import { analyze, answerLocal, badgeFor, bondLevelOf, bondProgress, dareFor, expectedFrac, kindOf, nudgeFor, thinkingSteps } from '../../motion/brain';

const at = (h: number, m = 0) => new Date(2026, 9, 28, h, m);
const q = (id: string, title: string, value: number, target: number, unit: string, extra: any = {}) => ({ id, title, value, target, unit, pct: Math.round((value / target) * 100), done: value >= target, ...extra });
const ctx = (quests: any[], extra: any = {}) => ({ today: { quests, done: quests.filter((x) => x.done).length, total: quests.length, xpAvailable: 100, xpEarned: 20 }, streak: { current: 0, best: 0 }, ...extra });

describe('kindOf / expectedFrac', () => {
  it('classifies quests by id or title', () => {
    expect(kindOf({ id: 'water' })).toBe('water');
    expect(kindOf({ title: 'Daily steps' })).toBe('steps');
    expect(kindOf({ title: 'Protein goal' })).toBe('protein');
    expect(kindOf({ id: 'calories' })).toBe('calories');
    expect(kindOf({ id: 'xyz' })).toBe('other');
  });
  it('pace curves rise from 0 to 1 and never go backwards', () => {
    for (const k of ['water', 'steps', 'calories', 'protein', 'move'] as const) {
      let prev = -1;
      for (let h = 0; h <= 24; h += 0.5) { const v = expectedFrac(k, h); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
      expect(expectedFrac(k, 0)).toBe(0); expect(expectedFrac(k, 23.9)).toBe(1);
    }
  });
});

describe('analyze', () => {
  it('is empty without data', () => { expect(analyze(null, at(10)).empty).toBe(true); expect(analyze({}, at(10)).empty).toBe(true); });
  it('morning with nothing logged is a fresh start, not a failure', () => {
    const a = analyze(ctx([q('water', 'Water', 0, 2500, 'ml'), q('steps', 'Steps', 0, 8000, 'steps')]), at(8));
    expect(a.tone).toBe('fresh'); expect(a.verdict).toBe('Fresh start'); expect(a.flags).not.toContain('water_behind');
  });
  it('flags water behind pace in the afternoon and makes it the best move', () => {
    const a = analyze(ctx([q('water', 'Water', 500, 2500, 'ml'), q('steps', 'Steps', 4500, 8000, 'steps')]), at(16));
    expect(a.flags).toContain('water_behind');
    expect(a.top?.kind).toBe('water'); expect(a.top?.action).toEqual({ type: 'water', ml: 250 });
    expect(a.quests[0].pace).toBe('behind'); expect(a.quests[0].projected).toBeLessThan(60);
  });
  it('all done = perfect day and no move', () => {
    const a = analyze(ctx([q('water', 'Water', 2500, 2500, 'ml'), q('move', 'Exercise', 30, 30, 'min')]), at(15));
    expect(a.allDone).toBe(true); expect(a.verdict).toBe('Perfect day'); expect(a.top).toBeNull(); expect(a.score).toBeGreaterThanOrEqual(95);
  });
  it('calories over target routes to Fix my day', () => {
    const a = analyze(ctx([q('calories', 'Calories', 2300, 2000, 'kcal')]), at(20, 30));
    expect(a.flags).toContain('calories_over'); expect(a.top?.action).toEqual({ type: 'route', path: '/(tabs)', params: { open: 'fix' } });
  });
  it('streak at risk only late in the day with nothing done', () => {
    const c = ctx([q('water', 'Water', 0, 2500, 'ml')], { streak: { current: 5, best: 9 } });
    expect(analyze(c, at(19)).streak.atRisk).toBe(true); expect(analyze(c, at(10)).streak.atRisk).toBe(false);
  });
  it('tired mood de-prioritises exercise', () => {
    const c = ctx([q('move', 'Exercise', 0, 30, 'min'), q('water', 'Water', 900, 2500, 'ml')]);
    expect(analyze(c, at(18)).top?.kind).toBe('move');
    expect(analyze(c, at(18), 'tired').top?.kind).toBe('water');
  });
  it('score stays within 0..100 and survives junk values', () => {
    const a = analyze(ctx([{ id: 'x', title: 'Odd', value: 'abc', target: null, pct: undefined }, q('water', 'Water', 99999, 2500, 'ml')]), at(13));
    expect(a.score).toBeGreaterThanOrEqual(0); expect(a.score).toBeLessThanOrEqual(100); expect(Number.isNaN(a.score)).toBe(false);
  });
});

describe('thinking, badge, nudge', () => {
  const behind = analyze(ctx([q('water', 'Water', 400, 2500, 'ml')]), at(15));
  it('thinking steps quote real numbers', () => { const s = thinkingSteps(behind).join(' '); expect(s).toMatch(/Water at 16%/); expect(s).toMatch(/3 pm/); });
  it('badge shows the top gap emoji', () => { expect(badgeFor(behind)?.emoji).toBe('💧'); expect(badgeFor(null)).toBeNull(); });
  it('nudges respect quiet hours, cooldown and backoff', () => {
    const base = { now: 10_000_000_000, lastNudgeAt: 0, dismissStreak: 0 };
    expect(nudgeFor(behind, base, 15)?.key).toBe('move:water:behind');
    expect(nudgeFor(behind, base, 23)).toBeNull(); expect(nudgeFor(behind, base, 6)).toBeNull();
    expect(nudgeFor(behind, { ...base, lastNudgeAt: base.now - 20 * 60000 }, 15)).toBeNull();
    expect(nudgeFor(behind, { ...base, lastNudgeAt: base.now - 60 * 60000, dismissStreak: 1 }, 15)).toBeNull();
    expect(nudgeFor(behind, { ...base, lastNudgeAt: base.now - 100 * 60000, dismissStreak: 1 }, 15)).not.toBeNull();
    expect(nudgeFor(behind, { ...base, lastKey: 'move:water:behind' }, 15)).toBeNull();
  });
});

describe('dares, bond, local answers', () => {
  it('dare fits mood and gaps', () => {
    expect(dareFor(null, 'stressed', 14).id).toBe('breathe'); expect(dareFor(null, 'tired', 14).id).toBe('stretch');
    expect(dareFor(analyze(ctx([q('water', 'Water', 0, 2500, 'ml')]), at(16)), null, 16).id).toBe('water');
  });
  it('bond levels and progress', () => { expect(bondLevelOf(0)).toBe(1); expect(bondLevelOf(6)).toBe(2); expect(bondProgress(0)).toBe(0); expect(bondProgress(3)).toBeGreaterThan(0); expect(bondProgress(5.99)).toBeLessThan(1); });
  it('answers common questions on the device and defers the rest', () => {
    const a = analyze(ctx([q('water', 'Water', 1000, 2500, 'ml'), q('calories', 'Calories', 800, 2000, 'kcal')]), at(14));
    expect(answerLocal('how much water left?', a)?.text).toMatch(/1,500 to go/);
    expect(answerLocal('calories?', a)?.text).toMatch(/800\/2,000 kcal/);
    expect(answerLocal('what should i do next', a)?.actions?.length).toBe(1);
    expect(answerLocal('tell me a joke', a)?.mood).toBe('laugh');
    expect(answerLocal('can I eat biryani on a cheat day', a)).toBeNull();
    expect(answerLocal('steps', a)?.text).toMatch(/steps target/);
  });
});
