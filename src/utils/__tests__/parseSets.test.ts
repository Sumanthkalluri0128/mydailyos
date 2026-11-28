// parseSets.ts imports the API layer for its one network call; these tests only use the pure helpers, so the API (and the native storage it pulls in) is replaced.
jest.mock('../../config/api', () => ({ post: jest.fn() }));
import { entryLine, readyToLog, ParsedEntry } from '../parseSets';

const base: ParsedEntry = { raw: '', name: 'bench', sets: [], seconds: 0, match: null, alternatives: [], confidence: 0, needsSets: true };

describe('parseSets helpers', () => {
  it('summarises equal sets on one line', () => {
    const e: ParsedEntry = { ...base, match: { id: 'x', name: 'Barbell bench press', source: 'plan' }, confidence: 'high', needsSets: false, sets: [0, 1, 2].map(() => ({ reps: 10, weightKg: 60, seconds: 0 })) };
    expect(entryLine(e)).toBe('Barbell bench press · 3 × 10 @ 60 kg');
    expect(readyToLog(e)).toBe(true);
  });
  it('lists different sets and asks for sets when there are none', () => {
    const e: ParsedEntry = { ...base, sets: [{ reps: 10, weightKg: 60, seconds: 0 }, { reps: 8, weightKg: 65, seconds: 0 }], needsSets: false };
    expect(entryLine(e)).toBe('bench · 10@60, 8@65');
    expect(entryLine(base)).toBe('bench · add sets');
  });
  it('only logs on its own with a confident match and sets', () => {
    expect(readyToLog({ ...base, match: { id: 'x', name: 'Leg press', source: 'plan' }, confidence: 'low', needsSets: false })).toBe(false);
    expect(readyToLog(base)).toBe(false);
  });
});
