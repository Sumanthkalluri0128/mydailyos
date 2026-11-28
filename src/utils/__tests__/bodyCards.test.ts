import { readFileSync } from 'fs';
import { join } from 'path';
import { makeT, LANGS } from '../../i18n/core';
import { bodySections } from '../bodyCards';

const dicts: any = Object.fromEntries(LANGS.map((l: string) => [l, JSON.parse(readFileSync(join(__dirname, '../../i18n', `${l}.json`), 'utf8'))]));
const en = makeT(dicts, 'en'), hi = makeT(dicts, 'hi');
const data: any = {
  success: true,
  fatLean: { ready: true, verdict: 'recomp', tapeOnly: false, waistChangeCm: -3, fat: -1.8, lean: 0.4, fatRange: [-2.8, -0.8], leanRange: [-0.5, 1.3] },
  taper: { remainingKg: 2, fromPace: 0.65, pace: 0.4, kcalMore: 180, finishWeeks: 5, key: 'taper:abc12345' },
  plateau: { items: [{ id: 'data', status: 'ok', vars: {} }, { id: 'logging', status: 'maybe', vars: { pct: 90, kcal: 450 } }], next: 'logging' },
  leaks: [{ id: 'weekend', weeklyKcal: 1800, vars: { kcal: 900 } }],
  measure: { missing: ['hips'], guide: true },
};

describe('body progress sections (shared with the web app)', () => {
  it('builds ordered sections with real numbers and no placeholders or raw keys', () => {
    const s = bodySections(en, data);
    expect(s.map((x: any) => x.id)).toEqual(['fat', 'plateau', 'taper', 'leak', 'measure']);
    const text = s.flatMap((x: any) => [x.title, ...x.lines]).join('\n');
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(text).not.toMatch(/coach\.body\./);
    expect(s.find((x: any) => x.id === 'taper').action.label).toBe('Ease my pace to 0.4 kg a week');
  });
  it('works in Hindi and handles empty or failed answers', () => {
    const text = bodySections(hi, data).flatMap((x: any) => [x.title, ...x.lines]).join('\n');
    expect(text).not.toMatch(/coach\.body\.|\{[a-zA-Z]+\}/);
    expect(bodySections(en, null)).toEqual([]);
    expect(bodySections(en, { success: false })).toEqual([]);
  });
});
