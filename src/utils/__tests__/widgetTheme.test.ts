import { WIDGET_THEMES, resolveTheme, weekKey, type ThemeState } from '../widgetTheme';

const DAY = 24 * 3600 * 1000;
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
const MON = at(2026, 9, 26); // Mon 26 Oct 2026

describe('weekKey', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekKey(MON)).toBe('2026-10-26');
    expect(weekKey(MON + 6 * DAY)).toBe('2026-10-26'); // Sunday 1 Nov
    expect(weekKey(MON + 7 * DAY)).toBe('2026-11-02');
    expect(weekKey(at(2026, 9, 31))).toBe('2026-10-26'); // Sat 31 Oct
  });
});

describe('resolveTheme', () => {
  it('first run picks one of the 7 themes', () => {
    const t = resolveTheme(null, MON, () => 0);
    expect(WIDGET_THEMES).toContain(t.who);
    expect(t.week).toBe('2026-10-26'); expect(t.used).toEqual([t.who]);
  });
  it('keeps the same theme all week', () => {
    const t = resolveTheme(null, MON, () => 0.3);
    for (let i = 0; i < 7; i++) expect(resolveTheme(t, MON + i * DAY, () => 0.99)).toBe(t);
  });
  it('a new week never repeats a theme until all 7 were shown, then starts a new cycle', () => {
    for (const r of [0, 0.37, 0.99]) {
      let rnd = r;
      const rand = () => { rnd = (rnd * 7919 + 0.137) % 1; return rnd; };
      let s: ThemeState | null = null; const seen: string[] = [];
      for (let w = 0; w < 7; w++) { s = resolveTheme(s, MON + w * 7 * DAY, rand); seen.push(s.who); }
      expect(new Set(seen).size).toBe(7);
      const next = resolveTheme(s, MON + 7 * 7 * DAY, rand); // week 8 = new cycle
      expect(next.used).toEqual([next.who]);
      expect(next.who).not.toBe(seen[6]); // no back-to-back repeat across cycles
    }
  });
  it('many cycles: every 7-week block contains each theme exactly once', () => {
    let s: ThemeState | null = null; const seen: string[] = [];
    for (let w = 0; w < 70; w++) { s = resolveTheme(s, MON + w * 7 * DAY); seen.push(s.who); }
    for (let c = 0; c < 10; c++) expect(new Set(seen.slice(c * 7, c * 7 + 7)).size).toBe(7);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
  it('skipped weeks (app unused) still just pick a fresh theme', () => {
    const t = resolveTheme(null, MON, () => 0);
    const later = resolveTheme(t, MON + 5 * 7 * DAY, () => 0);
    expect(later.who).not.toBe(t.who); expect(later.used.length).toBe(2);
  });
  it('ignores unreadable saved state and a clock that moved back', () => {
    expect(WIDGET_THEMES).toContain(resolveTheme({ week: 'x', who: 'nobody', used: [] } as any, MON).who);
    const t = resolveTheme(null, MON + 7 * DAY);
    expect(resolveTheme(t, MON)).toBe(t);
  });
});
