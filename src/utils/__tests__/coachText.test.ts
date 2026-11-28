import { readFileSync } from 'fs';
import { join } from 'path';
import { makeT, LANGS } from '../../i18n/core';
import { advisoryText, tr, applyLabel, weeklyHeadline, weeklyMessages, nextText, refreshNote, offerTexts } from '../coachText';

const dicts: any = Object.fromEntries(LANGS.map((l: string) => [l, JSON.parse(readFileSync(join(__dirname, '../../i18n', `${l}.json`), 'utf8'))]));
const en = makeT(dicts, 'en'), hi = makeT(dicts, 'hi');

describe('coach text (shared with the web app)', () => {
  it('falls back to the server English when a key has no text', () => {
    expect(tr(en, 'coach.nope', null, 'server text')).toBe('server text');
    expect(tr(en, 'coach.next.log.title', null, 'x')).toBe('Log your first meal');
  });
  it('labels every change type, in the chosen language', () => {
    expect(applyLabel(en, { type: 'steps', stepsTarget: 11500 })).toBe('Set my steps goal to 11,500');
    expect(applyLabel(en, { type: 'targetDate', byDate: '2027-06-01' })).toBe('Move my target date to 2027-06-01');
    expect(applyLabel(en, { type: 'pace', weeklyPaceKg: 0.75, planPaceKg: 0.75, calorieTarget: 2040 })).toBe('Raise my pace to 0.75 kg a week');
    expect(applyLabel(hi, { type: 'dietBreak', days: 7 })).toMatch(/डाइट ब्रेक/);
  });
  it('weekly lines use the decision numbers; untranslated actions keep the server text', () => {
    const w: any = { action: 'ON_TRACK', headline: 'On track', messages: ['server'], metrics: { rateKgWk: -0.52, targetLossKgWk: 0.5 } };
    expect(weeklyMessages(en, w)).toEqual(['Your trend is 0.52 kg a week against a plan of 0.50. Change nothing.']);
    const odd: any = { action: 'SOMETHING_NEW', headline: 'Server headline', messages: ['a', 'b'], metrics: {} };
    expect(weeklyHeadline(hi, odd)).toBe('Server headline');
    expect(weeklyMessages(hi, odd)).toEqual(['a', 'b']);
  });
  it('next step, refresh note and offer', () => {
    expect(nextText(en, { kind: 'checkin', title: 's', detail: 's' }, null).title).toBe('Do your 10-second check-in');
    expect(refreshNote(en, { refreshReason: 'recovery-low' })).toMatch(/recovery has been low/);
    const o: any = { behindWeeks: 18, refDate: '2027-02-01', date: { newDate: '2027-06-10' }, pace: null, paceBlocked: 'recovery' };
    const x: any = offerTexts(en, o);
    expect(x.title).toMatch(/18 weeks/);
    expect(x.pace).toBeNull();
    expect(x.noPace).toMatch(/recovery/);
  });
  it('advisories: fixed sentences are translated with their numbers; dynamic ones keep the server text', () => {
    const p: any = advisoryText(en, { id: 'protein-low', title: 'x', detail: 'y', vars: { avg: 82, target: 110 } });
    expect(p.title).toBe('Protein is under target');
    expect(p.detail).toMatch(/about 82 g against 110 g/);
    expect(advisoryText(en, { id: 'strength-down', title: 't', detail: 'server note' }).detail).toBe('server note');
  });
});
