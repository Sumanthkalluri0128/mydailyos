// Android Health Connect: the shared store that Samsung Health (and Google Fit, Fitbit, Garmin…) write steps into.
// Reading today's total from it gives the SAME number Samsung Health shows, including steps taken while FlexFit was closed.
// The native module is loaded lazily so iOS, the web and unit tests never touch it.
import { Platform } from 'react-native';

import { STEPS_PERMISSION, sourcesFromRecords, totalFromAggregate } from './healthConnectPure';
export { originLabel, sourcesFromRecords, totalFromAggregate, STEPS_PERMISSION } from './healthConnectPure';
export type HcSupport = 'unavailable' | 'update-needed' | 'ready';

export const hcAvailable = () => Platform.OS === 'android';
function lib(): any | null {
  if (Platform.OS !== 'android') return null;
  try { return require('react-native-health-connect'); } catch { return null; }
}

export async function hcSupport(): Promise<HcSupport> {
  const hc = lib();
  if (!hc) return 'unavailable';
  try {
    const s = await hc.getSdkStatus();
    return s === hc.SdkAvailabilityStatus.SDK_AVAILABLE ? 'ready' : s === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ? 'update-needed' : 'unavailable';
  } catch { return 'unavailable'; }
}

export async function hcGranted(): Promise<boolean> {
  const hc = lib();
  if (!hc) return false;
  try {
    if (!(await hc.initialize())) return false;
    const granted: any[] = await hc.getGrantedPermissions();
    return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
  } catch { return false; }
}

/** Opens Android's own "Allow FlexFit to read Steps?" dialog. Resolves true if the person allowed it. */
export async function hcRequest(): Promise<boolean> {
  const hc = lib();
  if (!hc) return false;
  try {
    if (!(await hc.initialize())) return false;
    const granted: any[] = await hc.requestPermission([STEPS_PERMISSION]);
    return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
  } catch { return false; }
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/** Today's steps (midnight → now). Health Connect merges overlapping sources itself, so phone + watch aren't double counted. */
export async function hcTodaySteps(): Promise<number> {
  const hc = lib();
  if (!hc) throw new Error('Health Connect is not available');
  const r = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: startOfToday().toISOString(), endTime: new Date().toISOString() } });
  return totalFromAggregate(r);
}

/** Which apps wrote today's steps (so we can say "Reading from Samsung Health"). Best effort: [] on any problem. */
export async function hcTodaySources(): Promise<string[]> {
  const hc = lib();
  if (!hc) return [];
  try {
    const r = await hc.readRecords('Steps', { timeRangeFilter: { operator: 'between', startTime: startOfToday().toISOString(), endTime: new Date().toISOString() }, ascendingOrder: false, pageSize: 100 });
    return sourcesFromRecords(r?.records);
  } catch { return []; }
}

export function hcOpenSettings() { try { lib()?.openHealthConnectSettings(); } catch { /* ignore */ } }

// ---- Weight (so weigh-ins from a smart scale / Samsung Health arrive on their own) ----
const WEIGHT_PERMISSION = { accessType: 'read', recordType: 'Weight' };

export async function hcWeightGranted(): Promise<boolean> {
  const hc = lib();
  if (!hc) return false;
  try {
    if (!(await hc.initialize())) return false;
    const granted: any[] = await hc.getGrantedPermissions();
    return granted.some((p) => p.recordType === 'Weight' && p.accessType === 'read');
  } catch { return false; }
}

export async function hcRequestWeight(): Promise<boolean> {
  const hc = lib();
  if (!hc) return false;
  try {
    if (!(await hc.initialize())) return false;
    const granted: any[] = await hc.requestPermission([WEIGHT_PERMISSION]);
    return granted.some((p) => p.recordType === 'Weight' && p.accessType === 'read');
  } catch { return false; }
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Weigh-ins of the last `days` days, newest reading per calendar day, in kg. Best effort: [] on any problem. */
export async function hcRecentWeights(days = 30): Promise<{ date: string; kg: number }[]> {
  const hc = lib();
  if (!hc) return [];
  try {
    const start = new Date(); start.setDate(start.getDate() - days); start.setHours(0, 0, 0, 0);
    const r = await hc.readRecords('Weight', { timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: new Date().toISOString() }, ascendingOrder: true, pageSize: 500 });
    const byDay = new Map<string, number>();
    for (const rec of r?.records || []) {
      const w = rec.weight; if (!w) continue;
      const kg = w.unit === 'kilograms' ? w.value : w.inKilograms ?? (w.inPounds ? w.inPounds * 0.45359237 : null);
      if (!(kg > 20 && kg < 400)) continue;
      byDay.set(dayKey(new Date(rec.time)), Math.round(kg * 10) / 10); // later records overwrite earlier ones, so the newest of the day wins
    }
    return [...byDay.entries()].map(([date, kg]) => ({ date, kg }));
  } catch { return []; }
}

// ---- Sleep, heart rate and workouts (each switched on or off by the person) ----
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HC_DATA, HC_TYPES, HcDataType, hrStats, parseHcPrefs, permissionsFor, restingByDate, sleepByDate } from './healthConnectPure';
export { HC_DATA, HC_TYPES } from './healthConnectPure';
export type { HcDataType } from './healthConnectPure';

const PREFS_KEY = 'flexfit_hc_prefs_v1';
export const hcLoadPrefs = async () => parseHcPrefs(await AsyncStorage.getItem(PREFS_KEY).catch(() => null));
export const hcSavePrefs = (p: Record<HcDataType, boolean>) => AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)).catch(() => {});

/** Which of the extra data types Android currently allows FlexFit to read (all of that type's permissions must be granted). */
export async function hcGrantedTypes(): Promise<Record<HcDataType, boolean>> {
  const out = { sleep: false, heartRate: false, exercise: false };
  const hc = lib();
  if (!hc) return out;
  try {
    if (!(await hc.initialize())) return out;
    const granted: any[] = await hc.getGrantedPermissions();
    for (const t of HC_TYPES) out[t] = HC_DATA[t].records.every((r) => granted.some((g) => g.recordType === r && g.accessType === 'read'));
  } catch { /* leave all false */ }
  return out;
}

/** Opens Android's own permission dialog for exactly the chosen types. Resolves with what was actually granted. */
export async function hcRequestTypes(types: HcDataType[]): Promise<Record<HcDataType, boolean>> {
  const hc = lib();
  if (hc) {
    try {
      if (await hc.initialize()) await hc.requestPermission(permissionsFor(Object.fromEntries(types.map((t) => [t, true]))));
    } catch { /* fall through to a fresh check */ }
  }
  return hcGrantedTypes();
}

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };
const range = (days: number) => ({ operator: 'between', startTime: daysAgo(days).toISOString(), endTime: new Date().toISOString() });
const localDay = (iso: string) => dayKey(new Date(iso));

export async function hcReadSleep(days = 7) {
  const hc = lib(); if (!hc) return [];
  try { return sleepByDate((await hc.readRecords('SleepSession', { timeRangeFilter: range(days), pageSize: 200 }))?.records, localDay); } catch { return []; }
}
export async function hcReadResting(days = 7) {
  const hc = lib(); if (!hc) return [];
  try { return restingByDate((await hc.readRecords('RestingHeartRate', { timeRangeFilter: range(days), pageSize: 200 }))?.records, localDay); } catch { return []; }
}

/** Workout sessions of the last `days` days. Heart rate inside each session is added only when `withHeartRate` (heart rate switched on and allowed). */
export async function hcReadSessions(days = 7, withHeartRate = false) {
  const hc = lib(); if (!hc) return [];
  try {
    const r = await hc.readRecords('ExerciseSession', { timeRangeFilter: range(days), pageSize: 100 });
    const out: any[] = [];
    for (const rec of r?.records || []) {
      let avgHr: number | null = null, maxHr: number | null = null;
      if (withHeartRate) {
        try {
          const h = await hc.readRecords('HeartRate', { timeRangeFilter: { operator: 'between', startTime: rec.startTime, endTime: rec.endTime }, pageSize: 50 });
          const stats = hrStats((h?.records || []).flatMap((x: any) => x.samples || []));
          if (stats) { avgHr = stats.avg; maxHr = stats.max; }
        } catch { /* no heart rate for this workout */ }
      }
      out.push({ id: rec?.metadata?.id, type: rec.exerciseType, startTime: rec.startTime, endTime: rec.endTime, date: localDay(rec.startTime), app: rec?.metadata?.dataOrigin, avgHr, maxHr, title: rec.title || '' });
    }
    return out;
  } catch { return []; }
}
