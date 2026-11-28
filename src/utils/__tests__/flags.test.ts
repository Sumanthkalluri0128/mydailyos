import { parseFlags, flagsFresh, flagOn, FLAGS_TTL_MS } from '../flags';
import { makeReporter } from '../telemetry';

describe('feature flags (client side)', () => {
  it('keeps only booleans', () => { expect(parseFlags({ a: true, b: 'x', c: false })).toEqual({ a: true, c: false }); expect(parseFlags(null)).toEqual({}); });
  it('cache freshness', () => {
    expect(flagsFresh({ at: 1000 }, 2000)).toBe(true);
    expect(flagsFresh({ at: 1000 }, 1000 + FLAGS_TTL_MS)).toBe(false);
    expect(flagsFresh(null, 5)).toBe(false);
  });
  it('unknown flags are off', () => { expect(flagOn({}, 'x')).toBe(false); expect(flagOn({ x: true }, 'x')).toBe(true); expect(flagOn({}, 'x', true)).toBe(true); });
  it('telemetry reporter batches into one report', () => {
    const sent: any[] = []; let fire: any;
    const r = makeReporter({ send: (b: any) => { sent.push(b); return Promise.resolve(); }, setTimer: ((fn: any) => { fire = fn; return 1; }) as any });
    r.report({ syncFailed: 1 }); r.report({ syncFailed: 1, writesDropped: 2 }); fire();
    expect(sent).toEqual([{ syncFailed: 2, writesDropped: 2 }]);
  });
});
