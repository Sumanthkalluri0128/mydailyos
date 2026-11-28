import { originLabel, sourcesFromRecords, totalFromAggregate } from '../healthConnectPure';

describe('Health Connect helpers', () => {
  it('names Samsung Health and other well-known sources, and falls back to the package name', () => {
    expect(originLabel('com.sec.android.app.shealth')).toBe('Samsung Health');
    expect(originLabel('com.google.android.apps.fitness')).toBe('Google Fit');
    expect(originLabel('com.some.unknown.app')).toBe('com.some.unknown.app');
  });
  it('turns an aggregate result into a whole, safe number', () => {
    expect(totalFromAggregate({ COUNT_TOTAL: 23482 })).toBe(23482);
    expect(totalFromAggregate({ COUNT_TOTAL: 100.6 })).toBe(101);
    expect(totalFromAggregate({})).toBe(0);
    expect(totalFromAggregate(undefined)).toBe(0);
    expect(totalFromAggregate({ COUNT_TOTAL: -5 })).toBe(0);
    expect(totalFromAggregate({ COUNT_TOTAL: NaN })).toBe(0);
  });
  it('lists each source once', () => {
    const recs = [{ metadata: { dataOrigin: 'com.sec.android.app.shealth' } }, { metadata: { dataOrigin: 'com.sec.android.app.shealth' } }, { metadata: { dataOrigin: 'com.fitbit.FitbitMobile' } }, {}];
    expect(sourcesFromRecords(recs)).toEqual(['Samsung Health', 'Fitbit']);
    expect(sourcesFromRecords(undefined)).toEqual([]);
  });
});
