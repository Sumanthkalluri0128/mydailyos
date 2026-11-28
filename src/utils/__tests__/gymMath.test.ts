import * as G from '../gymMath';
import { backupJson, bodyCsv, csvCell, parseBackup, workoutsCsv } from '../gymExport';
import { sanitizeGymState } from '../gymStore';
import { GYM_CATALOG, mergeCatalog } from '../gymCatalog';

jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() } }));

const E = (id: string, date: string, exId: string, sets: [number, number][], over: Partial<G.GymEntry> = {}): G.GymEntry =>
  ({ id, date, exId, name: exId, cat: 'Chest', unit: 'reps', sets: sets.map(([kg, reps]) => ({ kg, reps })), at: Number(id.replace(/\D/g, '')) || 0, ...over });
const B = (date: string, o: Partial<G.BodyEntry> = {}): G.BodyEntry => ({ id: `b${date}`, date, sites: {}, at: 1, ...o });

describe('dates', () => {
  it('week starts on Monday', () => {
    expect(G.weekStart('2026-11-12')).toBe('2026-11-09'); // Thursday
    expect(G.weekStart('2026-11-09')).toBe('2026-11-09'); // Monday
    expect(G.weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday
  });
  it('shifts across month ends', () => { expect(G.shiftDate('2026-02-28', 1)).toBe('2026-03-01'); expect(G.shiftDate('2026-03-01', -1)).toBe('2026-02-28'); });
});

describe('lifting', () => {
  it('e1rm (Epley) matches the workout tab', () => { expect(G.e1rm(100, 1)).toBe(100); expect(G.e1rm(100, 10)).toBe(133.3); expect(G.e1rm(0, 10)).toBe(0); });
  it('volume ignores bodyweight and timed sets', () => {
    expect(G.entryVolume(E('e1', '2026-11-01', 'bench', [[40, 10], [40, 8]]))).toBe(720);
    expect(G.entryVolume(E('e2', '2026-11-01', 'plank', [[0, 60]], { unit: 'sec' }))).toBe(0);
    expect(G.entryVolume(E('e3', '2026-11-01', 'pushup', [[0, 20]]))).toBe(0);
  });
  it('formats sets compactly', () => {
    expect(G.setsLine(E('e1', 'd', 'x', [[40, 10], [40, 10], [40, 10]]))).toBe('3 × 10 @ 40 kg');
    expect(G.setsLine(E('e1', 'd', 'x', [[40, 10], [45, 8]]))).toBe('10 @ 40 kg, 8 @ 45 kg');
    expect(G.setsLine(E('e1', 'd', 'plank', [[0, 45]], { unit: 'sec' }))).toBe('45s');
  });
  it('finds the last time for prefill, on or before a date', () => {
    const list = [E('e1', '2026-11-01', 'bench', [[40, 10]]), E('e2', '2026-11-08', 'bench', [[42, 10]]), E('e3', '2026-11-10', 'bench', [[45, 8]])];
    expect(G.lastFor(list, 'bench', '2026-11-09')!.id).toBe('e2');
    expect(G.lastFor(list, 'bench')!.id).toBe('e3');
    expect(G.lastFor(list, 'squat')).toBeNull();
  });
  it('first ever log is not a PR; a heavier one is', () => {
    const a = E('e1', '2026-11-01', 'bench', [[40, 10]]);
    expect(G.detectPRs([], a)).toEqual([]);
    const b = E('e2', '2026-11-08', 'bench', [[45, 8]]);
    const prs = G.detectPRs([a], b);
    expect(prs[0]).toMatchObject({ kind: 'weight', value: 45, prev: 40 });
    expect(G.detectPRs([a], E('e3', '2026-11-08', 'bench', [[35, 10]]))).toEqual([]);
  });
  it('PR for a lighter but higher-rep (e1RM) set, and for bodyweight reps and holds', () => {
    const a = E('e1', '2026-11-01', 'bench', [[60, 5]]); // e1rm 70
    expect(G.detectPRs([a], E('e2', '2026-11-08', 'bench', [[55, 10]]))[0].kind).toBe('e1rm'); // 73.3
    const p = E('e3', '2026-11-01', 'pushup', [[0, 15]]);
    expect(G.detectPRs([p], E('e4', '2026-11-05', 'pushup', [[0, 20]]))[0]).toMatchObject({ kind: 'reps', value: 20, prev: 15 });
    const pl = E('e5', '2026-11-01', 'plank', [[0, 45]], { unit: 'sec' });
    expect(G.detectPRs([pl], E('e6', '2026-11-05', 'plank', [[0, 60]], { unit: 'sec' }))[0]).toMatchObject({ kind: 'reps', value: 60 });
  });
  it('weekly stats, streak and exercise series', () => {
    const list = [E('e1', '2026-11-09', 'bench', [[40, 10]]), E('e2', '2026-11-10', 'squat', [[60, 5], [60, 5]]), E('e3', '2026-11-12', 'bench', [[45, 8]])];
    const r = G.rangeStats(list, '2026-11-09', '2026-11-15');
    expect(r).toMatchObject({ days: 3, exercises: 3, sets: 4, volumeKg: 400 + 600 + 360 });
    expect(G.loggingStreak(list, '2026-11-12')).toBe(1);
    expect(G.loggingStreak([...list, E('e4', '2026-11-11', 'row', [[30, 10]])], '2026-11-12')).toBe(4);
    expect(G.exerciseSeries(list, 'bench').map((p) => p.date)).toEqual(['2026-11-09', '2026-11-12']);
    expect(G.weeklyDays(list, '2026-11-12', 3).map((w) => w.days)).toEqual([0, 0, 3]);
  });
});

describe('body trend and goals', () => {
  const pts = (vals: number[], start = '2026-10-01', stepDays = 7): G.BodyEntry[] => vals.map((v, i) => B(G.shiftDate(start, i * stepDays), { weightKg: v }));
  it('reads series in date order and ignores blanks', () => {
    const b = [B('2026-11-02', { weightKg: 80 }), B('2026-11-01', { weightKg: 81, sites: { waist: 90 } }), B('2026-11-03', { sites: { waist: 89 } })];
    expect(G.seriesOf(b, 'weightKg').map((p) => p.value)).toEqual([81, 80]);
    expect(G.seriesOf(b, 'waist').map((p) => p.value)).toEqual([90, 89]);
    expect(G.latestOf(b, 'waist')!.value).toBe(89);
  });
  it('rate per week from a steady loss', () => {
    const b = pts([90, 89, 88, 87, 86]);
    expect(G.ratePerWeek(G.seriesOf(b, 'weightKg'), '2026-10-29')).toBe(-1);
  });
  it('no rate from a single reading or a short span', () => {
    expect(G.ratePerWeek(G.seriesOf(pts([90]), 'weightKg'), '2026-10-01')).toBeNull();
    expect(G.ratePerWeek(G.seriesOf(pts([90, 89.5], '2026-10-01', 3), 'weightKg'), '2026-10-04')).toBeNull();
  });
  it('trend smooths a salty day', () => {
    const t = G.trendOf([{ date: '2026-11-01', value: 80 }, { date: '2026-11-02', value: 82 }, { date: '2026-11-03', value: 80 }]);
    expect(t[0].value).toBe(80); expect(t[1].value).toBeLessThan(81); expect(t[1].value).toBeGreaterThan(80);
  });
  it('goal progress for weight loss', () => {
    const b = pts([90, 89, 88, 87, 86]);
    const g = G.goalProgress(b, 'weightKg', 80, { startDate: '2026-10-01' }, '2026-10-29')!;
    expect(g).toMatchObject({ start: 90, current: 86, target: 80, pct: 40, remaining: -6, reached: false, ratePerWeek: -1 });
    expect(g.etaWeeks).toBe(6);
    expect(g.etaDate).toBe('2026-12-10');
  });
  it('goal progress for muscle gain (arm) and reached goals', () => {
    const b = [B('2026-10-01', { sites: { bicepL: 34 } }), B('2026-11-01', { sites: { bicepL: 36 } })];
    expect(G.goalProgress(b, 'bicepL', 38, { startDate: '2026-10-01' }, '2026-11-01')).toMatchObject({ pct: 50, remaining: 2, reached: false });
    expect(G.goalProgress(b, 'bicepL', 36, { startDate: '2026-10-01' }, '2026-11-01')).toMatchObject({ pct: 100, reached: true });
  });
  it('moving the wrong way gives 0 % and no ETA', () => {
    const b = pts([80, 81, 82]);
    const g = G.goalProgress(b, 'weightKg', 75, { startDate: '2026-10-01' }, '2026-10-15')!;
    expect(g.pct).toBe(0); expect(g.etaDate).toBeNull();
  });
  it('on track vs target date', () => {
    const b = pts([90, 89, 88, 87, 86]);
    expect(G.goalProgress(b, 'weightKg', 80, { startDate: '2026-10-01', targetDate: '2026-12-10' }, '2026-10-29')!.onTrack).toBe(true);
    const slow = G.goalProgress(b, 'weightKg', 80, { startDate: '2026-10-01', targetDate: '2026-11-19' }, '2026-10-29')!;
    expect(slow.onTrack).toBe(false); expect(slow.neededPerWeek).toBeCloseTo(-2, 1);
  });
  it('null without a target or any readings', () => { expect(G.goalProgress([], 'weightKg', 80, null, '2026-10-01')).toBeNull(); expect(G.goalProgress(pts([90]), 'weightKg', undefined, null, '2026-10-01')).toBeNull(); });
});

describe('composition', () => {
  it('BMI, ratios, lean mass', () => { expect(G.bmi(70, 175)).toBe(22.9); expect(G.waistToHeight(85, 170)).toBe(0.5); expect(G.waistToHip(80, 100)).toBe(0.8); expect(G.leanMassKg(80, 20)).toBe(64); });
  it('Navy body fat matches the server formula', () => {
    expect(G.navyBodyFat({ sex: 'male', heightCm: 175, waistCm: 90, neckCm: 38 })).toBe(20.7); // same number the server's lib/bodyFat.js gives
    expect(G.navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 32, hipCm: 98 })).toBeGreaterThan(15);
    expect(G.navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 32 })).toBeNull();
    expect(G.navyBodyFat({ heightCm: 175, waistCm: 90, neckCm: 38 })).toBeNull();
  });
  it('parseNum handles commas and rejects junk', () => { expect(G.parseNum('72,5')).toBe(72.5); expect(G.parseNum('')).toBeNull(); expect(G.parseNum('abc')).toBeNull(); expect(G.parseNum('-3')).toBeNull(); expect(G.parseNum('500', 1, 400)).toBeNull(); });
});

describe('export', () => {
  const entries = [E('e1', '2026-11-01', 'bench', [[40, 10], [0, 0], [42.5, 8]], { name: 'Bench press, flat', note: 'felt "good"' }), E('e2', '2026-11-02', 'plank', [[0, 60]], { name: 'Plank', unit: 'sec', cat: 'Core' })];
  it('quotes commas and quotes, defuses formulas, keeps negative numbers', () => {
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('=1+1')).toBe("'=1+1"); expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)"); expect(csvCell(-3)).toBe('-3'); expect(csvCell(null)).toBe('');
  });
  it('workouts CSV has one row per valid set', () => {
    const lines = workoutsCsv(entries).replace('\uFEFF', '').trim().split('\r\n');
    expect(lines).toHaveLength(1 + 2 + 1);
    expect(lines[0]).toBe('date,exercise,category,set,weight_kg,weight_lb,count,count_unit,est_1rm_kg,set_volume_kg,est_kcal,rpe,pace_min_per_km,distance_km,note,weight_type');
    expect(lines[1]).toBe('2026-11-01,"Bench press, flat",Chest,1,40,88.2,10,reps,53.3,400,7.4,,,,"felt ""good""",weight');
    expect(lines[2]).toContain(',2,42.5,');
    expect(lines[3]).toBe('2026-11-02,Plank,Core,1,,,60,seconds,,,4.9,,,,,');
  });
  it('body CSV has every tape site and the Navy estimate', () => {
    const lines = bodyCsv([B('2026-11-01', { weightKg: 80, bodyFat: 20, sites: { waist: 90, neck: 38 } })], { unit: 'kg', sex: 'male', heightCm: 175 }).replace('\uFEFF', '').trim().split('\r\n');
    expect(lines[0].split(',')).toEqual(['date', 'weight_kg', 'weight_lb', 'body_fat_pct', 'est_body_fat_navy_pct', 'neck_cm', 'shoulders_cm', 'chest_cm', 'waist_cm', 'hips_cm', 'bicepL_cm', 'bicepR_cm', 'forearm_cm', 'thighL_cm', 'thighR_cm', 'calf_cm', 'note']);
    const row = lines[1].split(',');
    expect(row[0]).toBe('2026-11-01'); expect(row[1]).toBe('80'); expect(row[3]).toBe('20'); expect(row[5]).toBe('38'); expect(row[8]).toBe('90');
  });
  it('backup round-trips through parse and sanitize', () => {
    const state = { profile: { unit: 'lb' as const, heightCm: 175 }, goal: { startDate: '2026-10-01', weightKg: 75, sites: { waist: 80 } }, entries, body: [B('2026-11-01', { weightKg: 80 })] };
    const back = parseBackup(backupJson(state))!;
    expect(back).not.toBeNull();
    const s = sanitizeGymState(back);
    expect(s.entries).toHaveLength(2); expect(s.entries[0].sets).toHaveLength(2); // the empty set was dropped
    expect(s.body[0].weightKg).toBe(80); expect(s.profile.unit).toBe('lb'); expect(s.goal!.sites.waist).toBe(80);
  });
  it('rejects things that are not backups and survives junk', () => {
    expect(parseBackup('hello')).toBeNull(); expect(parseBackup('{"a":1}')).toBeNull(); expect(parseBackup('{"app":"other","entries":[],"body":[]}')).toBeNull();
    const s = sanitizeGymState({ entries: [null, { id: 1 }, { id: 'x', date: 'bad', exId: 'a', sets: [] }], body: ['x'], goal: 5, profile: 3 });
    expect(s.entries).toEqual([]); expect(s.body).toEqual([]); expect(s.goal).toBeNull(); expect(s.profile.unit).toBe('kg');
  });
});

describe('body weight sets (weight left blank)', () => {
  const body = [{ id: 'b1', date: '2026-10-01', weightKg: 80, sites: {}, at: 1 }, { id: 'b2', date: '2026-11-01', weightKg: 78, sites: {}, at: 2 }];
  const pull = (id: string, date: string, sets: number[][]) => E(id, date, 'pullup', sets, { name: 'Pull-up' });
  it('a rep set with no weight is a body weight set; timed and weighted sets are not', () => {
    expect(G.isBodyweightSet({ unit: 'reps' }, { kg: 0, reps: 10 })).toBe(true);
    expect(G.isBodyweightSet({ unit: 'reps' }, { kg: 20, reps: 10 })).toBe(false);
    expect(G.isBodyweightSet({ unit: 'sec' }, { kg: 0, reps: 40 })).toBe(false);
    expect(G.isBodyweightSet({ unit: 'reps' }, { kg: 0, reps: 0 })).toBe(false);
  });
  it('volume counts body weight x reps, and follows the weight you had on that day', () => {
    const a = pull('a', '2026-10-15', [[0, 10], [0, 8]]), b = pull('b', '2026-11-05', [[0, 10]]);
    expect(G.entryVolume(a)).toBe(0);                    // no body weight given: old behaviour
    expect(G.entryVolume(a, 80)).toBe(1440);
    const bw = G.bodyKgFn(body);
    expect(bw('2026-10-15')).toBe(80); expect(bw('2026-11-05')).toBe(78);
    expect(G.dayStats([a, b], '2026-11-05', bw).volumeKg).toBe(780);
    expect(G.rangeStats([a, b], '2026-10-01', '2026-11-30', bw).volumeKg).toBe(1440 + 780);
  });
  it('logging a new weight recalculates old entries (they are never stored with a weight)', () => {
    const a = pull('a', '2026-11-05', [[0, 10]]);
    expect(G.dayStats([a], '2026-11-05', G.bodyKgFn(body)).volumeKg).toBe(780);
    expect(G.dayStats([a], '2026-11-05', G.bodyKgFn([...body, { id: 'b3', date: '2026-11-04', weightKg: 76, sites: {}, at: 3 }])).volumeKg).toBe(760);
  });
  it('mixed sets: typed weight is the load, blank is body weight', () => {
    const m = E('m', '2026-11-05', 'dip', [[0, 10], [10, 8]], { name: 'Dips' });
    expect(G.entryVolume(m, 78)).toBe(780 + 80);
    expect(G.setLoadKg({ unit: 'reps' }, { kg: 0, reps: 5 }, 78)).toBe(78);
    expect(G.setLoadKg({ unit: 'sec' }, { kg: 0, reps: 50 }, 78)).toBe(0);
  });
  it('exercise progress volume uses body weight; records still go by reps for body weight sets', () => {
    const a = pull('a', '2026-10-15', [[0, 10]]), b = pull('b', '2026-11-05', [[0, 12]]);
    const ser = G.exerciseSeries([a, b], 'pullup', G.bodyKgFn(body));
    expect(ser.map((p) => p.volumeKg)).toEqual([800, 936]);
    expect(G.detectPRs([a], b)[0]).toEqual({ kind: 'reps', value: 12, prev: 10 });
  });
  it('sets read "@ BW" and the CSV says bodyweight, with that day body weight x reps as the volume', () => {
    const a = pull('a', '2026-11-05', [[0, 10], [0, 10]]);
    expect(G.setsLine(a)).toBe('2 × 10 @ BW');
    const lines = workoutsCsv([a], body).replace('﻿', '').trim().split('\r\n');
    expect(lines[1].split(',').slice(4, 10)).toEqual(['', '', '10', 'reps', '', '780']);
    expect(lines[1].endsWith(',bodyweight')).toBe(true);
  });
});

describe('calories burned (estimate)', () => {
  // MET x 3.5 x kg / 200 per minute, same as the Workout tab. 10 reps = 30 s work + 60 s rest = 1.5 min.
  it('matches the app formula for a lifting set', () => {
    const e = E('e1', '2026-11-01', 'bench', [[40, 10]], { name: 'Bench press' });
    expect(G.metFor('Chest', 'Bench press')).toBe(5);
    expect(G.entryMinutes(e)).toBe(1.5);
    expect(G.entryKcal(e, 80)).toBe(Math.round((5 - 1) * 3.5 * 80 / 200 * 1.5)); // net: MET 5 includes 1 MET of resting energy that maintenance already has
  });
  it('isolation lifts burn less than compound lifts; cardio uses its minutes', () => {
    expect(G.metFor('Arms', 'Hammer Curl')).toBe(3.5);
    expect(G.metFor('Legs', 'Back Squat')).toBe(5);
    const run = E('e2', '2026-11-01', 'run', [[0, 30]], { name: 'Treadmill Run', cat: 'Cardio', unit: 'min' });
    expect(G.entryKcal(run, 70)).toBe(Math.round((9 - 1) * 3.5 * 70 / 200 * 30)); // 294
  });
  it('holds use their seconds; more sets burn more; heavier body burns more', () => {
    const p1 = E('e3', 'd', 'plank', [[0, 60]], { name: 'Plank', cat: 'Core', unit: 'sec' });
    const p3 = E('e4', 'd', 'plank', [[0, 60], [0, 60], [0, 60]], { name: 'Plank', cat: 'Core', unit: 'sec' });
    expect(Math.abs(G.entryKcal(p3, 70) - 3 * G.entryKcal(p1, 70))).toBeLessThanOrEqual(1); // each is rounded on its own
    expect(G.entryKcal(p1, 100)).toBeGreaterThan(G.entryKcal(p1, 60));
  });
  it('uses the body weight logged on or before the day, else the nearest, else 70', () => {
    const b = [B('2026-11-01', { weightKg: 80 }), B('2026-11-10', { weightKg: 78 })];
    expect(G.bodyKgOn(b, '2026-11-05')).toBe(80); expect(G.bodyKgOn(b, '2026-11-12')).toBe(78); expect(G.bodyKgOn(b, '2026-10-20')).toBe(80); expect(G.bodyKgOn([], '2026-11-05')).toBeNull();
    const e = E('e5', '2026-11-05', 'bench', [[40, 10]], { name: 'Bench press' });
    expect(G.kcalIn([e], b, '2026-11-01', '2026-11-07')).toBe(G.entryKcal(e, 80));
    expect(G.kcalIn([e], [], '2026-11-01', '2026-11-07')).toBe(G.entryKcal(e, 70));
  });
});

describe('exercise catalogue', () => {
  it('is big, unique by id, and every entry is well formed', () => {
    expect(GYM_CATALOG.length).toBeGreaterThan(190);
    expect(new Set(GYM_CATALOG.map((c) => c.id)).size).toBe(GYM_CATALOG.length);
    for (const c of GYM_CATALOG) { expect(c.name).toBeTruthy(); expect(c.cat).toBeTruthy(); expect(['reps', 'sec', 'min']).toContain(c.unit); }
    expect(GYM_CATALOG.find((c) => c.name === 'Incline Barbell Bench Press')).toBeTruthy();
    expect(GYM_CATALOG.find((c) => c.name === 'Plank')!.unit).toBe('sec');
    expect(GYM_CATALOG.find((c) => c.name === 'Treadmill Run')!.unit).toBe('min');
  });
  it('merges without listing a name twice, own library first', () => {
    const merged = mergeCatalog([{ name: 'Plank', id: 'plank' } as any]);
    expect(merged[0]).toEqual({ name: 'Plank', id: 'plank' });
    expect(merged.filter((m: any) => m.name === 'Plank')).toHaveLength(1);
    expect(merged.length).toBe(GYM_CATALOG.length);
  });
});

describe('treadmill pace', () => {
  const run = (sets: G.GymSet[]): G.GymEntry => ({ id: 'r1', date: '2026-11-12', exId: 'tm', name: 'Treadmill', cat: 'Cardio', unit: 'min', sets, at: 1 });
  it('parses min:sec and decimal paces, rejects nonsense', () => {
    expect(G.parsePace('6:30')).toBe(6.5); expect(G.parsePace('6.5')).toBe(6.5); expect(G.parsePace('6,5')).toBe(6.5);
    expect(G.parsePace('6:75')).toBeNull(); expect(G.parsePace('1:30')).toBeNull(); expect(G.parsePace('')).toBeNull(); expect(G.parsePace('abc')).toBeNull();
    expect(G.fmtPace(6.5)).toBe('6:30'); expect(G.fmtPace(5.999)).toBe('6:00');
  });
  it('speed and distance come from time and pace', () => {
    const e = run([{ kg: 0, reps: 30, pace: 6.5 }]);
    expect(G.speedKph(6.5)).toBe(9.2); expect(G.entryKm(e)).toBe(4.62); expect(G.setsLine(e)).toBe('30 min @ 6:30/km');
  });
  it('calories follow the speed: faster burns more, and no pace keeps the old flat estimate', () => {
    const walk = G.entryKcal(run([{ kg: 0, reps: 30, pace: 12 }]), 70), jog = G.entryKcal(run([{ kg: 0, reps: 30, pace: 6.5 }]), 70), fast = G.entryKcal(run([{ kg: 0, reps: 30, pace: 5 }]), 70);
    expect(walk).toBeLessThan(jog); expect(jog).toBeLessThan(fast);
    expect(jog).toBe(323); // ACSM running at 9.2 km/h: 0.2 x 153.8 m/min / 3.5 = 8.79 MET above rest; x 3.5 x 70 / 200 x 30 min
    expect(G.entryKcal(run([{ kg: 0, reps: 30 }]), 70)).toBe(184); // no pace: Treadmill's own MET 6, net 5
  });
  it('no jump between a brisk walk and a jog (6-8 km/h is blended)', () => {
    expect(Math.abs(G.metForPace(60 / 7.99) - G.metForPace(60 / 8.01))).toBeLessThan(0.1);
  });
});
