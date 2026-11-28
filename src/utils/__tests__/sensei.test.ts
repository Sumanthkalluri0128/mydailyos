import { addWord, answerText, askLine, chosenLabels, dotsFor, draftValid, draftValue, emptyDraft, introLine, knownLine, reactLine, toggleMulti, type Question } from '../sensei';

const lines = {
  intro: { cheer: ['Welcome!'], calm: ['Hello.'], strict: ['Setup.'] }, update: { cheer: ['Welcome back!'], calm: ['Back.'], strict: ['Update.'] },
  ask: { cheer: ['Quick one!'], calm: ['One small question.'], strict: ['Answer this.'] }, react: { cheer: ['Got it!'], calm: ['Noted.'], strict: ['Noted.'] },
  skip: { cheer: ['Skipped!'], calm: ['Fine.'], strict: ['Skipped.'] }, usual: { cheer: ['Your usual!'], calm: ['Usual.'], strict: ['Usual kept.'] }, done: { cheer: ['All set!'], calm: ['Done.'], strict: ['Done.'] },
  specific: { avoid: { any: { cheer: ['{v} stays out.'], calm: ['{v} stays out.'], strict: ['{v} excluded.'] }, none: { cheer: ['Nothing to avoid!'], calm: ['None.'], strict: ['None.'] } }, prep: { twice: { cheer: ['Cook once, eat twice!'], calm: ['x'], strict: ['x'] } } },
  coach: { zoro: { open: 'Hm.', close: 'Fuel first.' }, luffy: { open: 'Shishishi!', close: 'Eat well!' } },
};
const avoid: Question = { id: 'avoid', type: 'multi', allowNone: true, ask: 'Anything to keep out?', groups: [{ id: 'allergy', label: 'Allergies', options: [{ id: 'allergy:peanut', label: 'Peanuts' }, { id: 'allergy:milk', label: 'Milk / dairy' }] }], usual: [] };

describe('sensei lines', () => {
  it('opens with the coach on the first question, then uses the tone; tone changes the words', () => {
    expect(askLine({ lines, who: 'zoro', tone: 'cheer', question: avoid, index: 0 })).toMatch(/^Hm\. Anything to keep out\?/);
    expect(askLine({ lines, who: 'zoro', tone: 'calm', question: avoid, index: 1 })).toMatch(/^One small question\./);
    expect(askLine({ lines, who: 'luffy', tone: 'strict', question: avoid, index: 1 })).not.toEqual(askLine({ lines, who: 'luffy', tone: 'cheer', question: avoid, index: 1 }));
    expect(introLine({ lines, who: 'zoro', tone: 'calm', mode: 'update' })).toBe('Hm. Back.');
    expect(askLine({ lines: {}, who: 'x', tone: 'weird', question: avoid })).toBe('Anything to keep out?');
  });
  it('reacts: allergy answers promise exclusion; none, skip, usual and done have their own lines', () => {
    const v = ['allergy:peanut', 'allergy:milk'];
    expect(reactLine({ lines, who: 'zoro', tone: 'calm', qid: 'avoid', value: v, labels: chosenLabels(avoid, v) })).toBe('Peanuts, Milk / dairy stays out.');
    expect(reactLine({ lines, who: 'zoro', tone: 'cheer', qid: 'avoid', value: ['none'] })).toBe('Nothing to avoid!');
    expect(reactLine({ lines, who: 'zoro', tone: 'cheer', qid: 'prep', value: 'twice' })).toBe('Cook once, eat twice!');
    expect(reactLine({ lines, who: 'zoro', tone: 'cheer', qid: 'budget', value: 'low' })).toBe('Got it!');
    expect(reactLine({ lines, who: 'zoro', tone: 'cheer', qid: 'avoid', skipped: true })).toBe('Skipped!');
    expect(reactLine({ lines, who: 'zoro', tone: 'strict', qid: 'avoid', usual: true })).toBe('Usual kept.');
    expect(reactLine({ lines, who: 'zoro', tone: 'cheer', done: true })).toBe('All set! Fuel first.');
  });
});

describe('sensei chips and drafts', () => {
  it('none is exclusive; other chips clear none; words are cleaned and limited', () => {
    expect(toggleMulti([], 'allergy:milk')).toEqual(['allergy:milk']);
    expect(toggleMulti(['allergy:milk'], 'none')).toEqual(['none']);
    expect(toggleMulti(['none'], 'allergy:soy')).toEqual(['allergy:soy']);
    expect(toggleMulti(['allergy:soy'], 'allergy:soy')).toEqual([]);
    expect(addWord([], ' <b>Karela</b> ')).toEqual(['Karela']);
    expect(addWord(['Karela'], 'karela')).toEqual(['Karela']);
    expect(addWord(['a1'], 'x')).toEqual(['a1']);
    expect(addWord(Array.from({ length: 30 }, (_, i) => `w${i}`), 'more')).toHaveLength(30);
  });
  it('forms start from the usual answer and are valid only when every single-choice row is chosen', () => {
    const q: Question = { id: 'cookTime', type: 'form', ask: '', usual: { breakfast: '20', lunch: '20', dinner: '40' }, fields: [{ id: 'breakfast', type: 'single', options: [{ id: '10', label: '10 min' }, { id: '20', label: '20 min' }] }, { id: 'lunch', type: 'single', options: [{ id: '10', label: '10 min' }] }] };
    expect(emptyDraft(q)).toEqual({ breakfast: '20', lunch: '20', dinner: '40' });
    expect(draftValid(q, { breakfast: '10', lunch: '' })).toBe(false);
    expect(draftValid(q, { breakfast: '10', lunch: '10' })).toBe(true);
    expect(draftValid({ id: 'a', type: 'single', ask: '' }, '')).toBe(false);
    expect(draftValid({ id: 'a', type: 'multi', ask: '' }, [])).toBe(true);
    expect(draftValid({ id: 'a', type: 'dates', ask: '' }, { from: '2026-10-20', to: '2026-10-19' })).toBe(false);
    expect(draftValue(avoid, [])).toEqual(['none']);
    expect(draftValue(avoid, ['allergy:soy'])).toEqual(['allergy:soy']);
    expect(answerText(avoid, [])).toBe('Nothing to avoid');
    expect(answerText(avoid, ['allergy:milk'])).toBe('Milk / dairy');
    expect(answerText(q, { breakfast: '10', lunch: '10' })).toBe('breakfast: 10 min · lunch: 10 min');
  });
  it('progress dots and the already-known line', () => {
    expect(dotsFor(1, 4)).toEqual(['done', 'now', 'todo', 'todo']);
    expect(knownLine([{ label: 'Goal', value: 'Lose weight' }, { label: 'Daily calories', value: '1,800 kcal' }])).toBe('I already know your goal (Lose weight), daily calories (1,800 kcal), so I will not ask again.');
    expect(knownLine([])).toBe('');
  });
});
