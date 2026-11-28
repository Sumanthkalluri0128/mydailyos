import { readFileSync } from 'fs';
import { join } from 'path';
import { makeT, missingKeys, placeholderProblems, LANGS, fill } from '../../i18n/core';

const load = (l: string) => JSON.parse(readFileSync(join(__dirname, '../../i18n', `${l}.json`), 'utf8'));
const dicts: any = Object.fromEntries(LANGS.map((l) => [l, load(l)]));

describe('i18n', () => {
  it('falls back to English, then to the key', () => {
    const d: any = { en: { a: 'Hello {n}', b: 'Only English' }, hi: { a: 'नमस्ते {n}', b: '' } };
    const t = makeT(d, 'hi');
    expect(t('a', { n: 3 })).toBe('नमस्ते 3');
    expect(t('b')).toBe('Only English');
    expect(t('zzz')).toBe('zzz');
    expect(makeT(d, 'te')('a', { n: 1 })).toBe('Hello 1');
  });
  it('keeps unfilled placeholders visible', () => { expect(fill('Hi {name}', {})).toBe('Hi {name}'); });
  it('all shipped languages cover English keys with matching placeholders and are flagged for review', () => {
    for (const l of ['hi', 'te', 'ta']) {
      expect(missingKeys(dicts, l)).toEqual([]);
      expect(placeholderProblems(dicts, l)).toEqual([]);
      expect(dicts[l]._meta.needsReview).toBe(true);
    }
  });
});

describe('i18n drift', () => {
  it('no language file has keys English does not', () => {
    const en = Object.keys(dicts.en).filter((k) => !k.startsWith('_'));
    for (const l of ['hi', 'te', 'ta']) {
      const extra = Object.keys(dicts[l]).filter((k) => !k.startsWith('_') && !en.includes(k));
      expect(extra).toEqual([]);
    }
  });
});
