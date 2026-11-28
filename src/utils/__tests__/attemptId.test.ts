import { attemptId, attemptDone, _resetAttempts } from '../attemptId';

const payload = { date: '2026-11-15', meal: 'lunch', items: [{ foodId: 'a', quantity: 100 }] };

describe('attemptId', () => {
  beforeEach(_resetAttempts);

  test('same content keeps the same id until it succeeds (a retry after a timeout is the same request)', () => {
    expect(attemptId('multi', payload)).toBe(attemptId('multi', payload));
    expect(attemptId('multi', payload)).toBe(attemptId('multi', JSON.parse(JSON.stringify(payload))));
  });

  test('changed content gets a new id, so an edited selection is never swallowed by an earlier try', () => {
    const a = attemptId('multi', payload);
    const b = attemptId('multi', { ...payload, items: [{ foodId: 'a', quantity: 150 }] });
    const c = attemptId('multi', { ...payload, meal: 'dinner' });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  test('after a success the next identical request is a new one', () => {
    const a = attemptId('multi', payload);
    attemptDone('multi', payload);
    expect(attemptId('multi', payload)).not.toBe(a);
  });

  test('ids are valid for the server (<= 80 chars, only letters digits . : _ -)', () => {
    const id = attemptId('multi', payload);
    expect(id.length).toBeLessThanOrEqual(80);
    expect(id).toMatch(/^[\w.:-]+$/);
  });

  test('memory is bounded', () => {
    const first = attemptId('x', { n: 0 });
    for (let i = 1; i < 120; i += 1) attemptId('x', { n: i });
    expect(attemptId('x', { n: 0 })).not.toBe(first);
  });
});
