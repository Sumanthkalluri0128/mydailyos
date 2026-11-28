import { HC_DATA, hrStats, parseHcPrefs, permissionsFor, restingByDate, sleepByDate, unionMs } from '../healthConnectPure';

const day = (iso: string) => iso.slice(0, 10);
describe('Health Connect: sleep, heart rate, workouts', () => {
  it('everything is off by default and bad data is ignored', () => {
    expect(parseHcPrefs(null)).toEqual({ sleep: false, heartRate: false, exercise: false });
    expect(parseHcPrefs('nope')).toEqual({ sleep: false, heartRate: false, exercise: false });
    expect(parseHcPrefs(JSON.stringify({ sleep: true, exercise: 'yes' }))).toEqual({ sleep: true, heartRate: false, exercise: false });
  });
  it('asks only for the permissions of the switched-on types', () => {
    expect(permissionsFor({})).toEqual([]);
    expect(permissionsFor({ sleep: true }).map((p) => p.recordType)).toEqual(['SleepSession']);
    expect(permissionsFor({ heartRate: true }).map((p) => p.recordType)).toEqual(['RestingHeartRate', 'HeartRate']);
    expect(permissionsFor({ exercise: true }).map((p) => p.recordType)).toEqual(['ExerciseSession']);
    expect(Object.keys(HC_DATA).length).toBe(3);
    for (const t of Object.values(HC_DATA)) expect(t.why.length > 40).toBe(true);
  });
  it('merges overlapping sleep from two apps instead of counting it twice', () => {
    expect(unionMs([[0, 100], [50, 150], [200, 250]])).toBe(200);
    const recs = [
      { startTime: '2026-10-25T22:00:00Z', endTime: '2026-10-26T06:00:00Z' },
      { startTime: '2026-10-25T22:30:00Z', endTime: '2026-10-26T06:00:00Z' },
    ];
    expect(sleepByDate(recs, day)).toEqual([{ date: '2026-10-26', hours: 8 }]);
  });
  it('leaves awake time out when stages are present', () => {
    const recs = [{ startTime: '2026-10-25T22:00:00Z', endTime: '2026-10-26T06:00:00Z', stages: [
      { startTime: '2026-10-25T22:00:00Z', endTime: '2026-10-26T02:00:00Z', stage: 5 },
      { startTime: '2026-10-26T02:00:00Z', endTime: '2026-10-26T03:00:00Z', stage: 1 },
      { startTime: '2026-10-26T03:00:00Z', endTime: '2026-10-26T06:00:00Z', stage: 6 },
    ] }];
    expect(sleepByDate(recs, day)[0].hours).toBe(7);
    expect(sleepByDate([{ startTime: 'x', endTime: 'y' }], day)).toEqual([]);
  });
  it('heart rate: average and peak, junk ignored; resting uses the lowest reading', () => {
    expect(hrStats([{ beatsPerMinute: 100 }, { beatsPerMinute: 140 }, { beatsPerMinute: 9 }])).toEqual({ avg: 120, max: 140 });
    expect(hrStats([])).toBe(null);
    expect(restingByDate([{ time: '2026-10-26T05:00:00Z', beatsPerMinute: 62 }, { time: '2026-10-26T09:00:00Z', beatsPerMinute: 58 }, { time: '2026-10-26T09:00:00Z', beatsPerMinute: 500 }], day)).toEqual([{ date: '2026-10-26', bpm: 58 }]);
  });
});
