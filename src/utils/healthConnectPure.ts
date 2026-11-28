// Pure helpers for Health Connect data (no React Native imports, so they can be unit-tested with plain Node).
export const STEPS_PERMISSION = { accessType: 'read', recordType: 'Steps' } as const;

const ORIGIN_LABELS: Record<string, string> = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.huawei.health': 'Huawei Health',
  'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.oneplus.health': 'OnePlus Health',
  'com.google.android.apps.healthdata': 'Health Connect',
};

/** Friendly app name for an Android package, e.g. com.sec.android.app.shealth → Samsung Health. */
export const originLabel = (pkg: string) => ORIGIN_LABELS[pkg] || pkg;

/** Health Connect's aggregate answer → a whole, non-negative number of steps. */
export function totalFromAggregate(r: any): number {
  const n = Number(r?.COUNT_TOTAL);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Distinct, friendly source names found in step records (most useful for "Reading from Samsung Health"). */
export function sourcesFromRecords(records: any[] | undefined): string[] {
  const seen = new Set<string>();
  for (const r of records || []) { const pkg = r?.metadata?.dataOrigin; if (pkg) seen.add(originLabel(String(pkg))); }
  return [...seen];
}


// ---------------------------------------------------------------------------------------------------------------------
// More Health Connect data: sleep, heart rate, exercise sessions. Each type is switched on or off by the person, and only
// the permissions for the types they switch on are ever requested.
export type HcDataType = 'sleep' | 'heartRate' | 'exercise';
export const HC_TYPES: HcDataType[] = ['sleep', 'heartRate', 'exercise'];
export const HC_DATA: Record<HcDataType, { title: string; why: string; records: string[] }> = {
  sleep: { title: 'Sleep', records: ['SleepSession'], why: 'Reads how long you slept so your sleep shows up in Health and the daily workout suggestion. FlexFit only reads; it never changes anything in Health Connect.' },
  heartRate: { title: 'Heart rate', records: ['RestingHeartRate', 'HeartRate'], why: 'Reads your resting heart rate each day, and your heart rate during workouts to show an average and a peak. Not used for any medical advice.' },
  exercise: { title: 'Workouts', records: ['ExerciseSession'], why: 'Reads workouts recorded by your watch or Samsung Health (run, walk, gym and so on) and adds them to your exercise log once. Each one shows which app recorded it.' },
};
/** The permissions needed for exactly the types that are switched on (heart rate is also read inside workouts, so it rides with exercise only if it is on). */
export function permissionsFor(on: Partial<Record<HcDataType, boolean>>): { accessType: 'read'; recordType: string }[] {
  const out: { accessType: 'read'; recordType: string }[] = [];
  for (const t of HC_TYPES) if (on[t]) for (const r of HC_DATA[t].records) out.push({ accessType: 'read', recordType: r });
  return out;
}
export function parseHcPrefs(raw: string | null | undefined): Record<HcDataType, boolean> {
  const base = { sleep: false, heartRate: false, exercise: false };
  try { const j = JSON.parse(raw || 'null'); if (j && typeof j === 'object') for (const t of HC_TYPES) base[t] = j[t] === true; } catch {}
  return base;
}

type Iv = [number, number];
/** Total length (ms) of the union of intervals, so two apps recording the same night are not counted twice. */
export function unionMs(ivs: Iv[]): number {
  const s = ivs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, curS = 0, curE = 0, open = false;
  for (const [a, b] of s) {
    if (!open) { curS = a; curE = b; open = true; }
    else if (a <= curE) curE = Math.max(curE, b);
    else { total += curE - curS; curS = a; curE = b; }
  }
  return open ? total + (curE - curS) : 0;
}

const AWAKE_STAGES = new Set([1, 3, 7]); // awake, out of bed, awake in bed
/** Sleep per wake-up date (local YYYY-MM-DD) in hours, from SleepSession records. Awake stages are left out. Sessions from several apps are merged. */
export function sleepByDate(records: any[] | undefined, dayOf: (iso: string) => string): { date: string; hours: number }[] {
  const byDate = new Map<string, Iv[]>();
  for (const r of records || []) {
    const start = Date.parse(r?.startTime), end = Date.parse(r?.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const date = dayOf(r.endTime);
    const list = byDate.get(date) || [];
    const stages: any[] = Array.isArray(r.stages) ? r.stages : [];
    if (stages.length) {
      for (const st of stages) {
        const a = Date.parse(st.startTime), b = Date.parse(st.endTime);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a && !AWAKE_STAGES.has(Number(st.stage))) list.push([a, b]);
      }
    } else list.push([start, end]);
    byDate.set(date, list);
  }
  return [...byDate.entries()].map(([date, ivs]) => ({ date, hours: Math.round((unionMs(ivs) / 3600000) * 10) / 10 }))
    .filter((x) => x.hours >= 0.5 && x.hours <= 24);
}

/** Average and peak bpm from samples [{beatsPerMinute}] (values outside 30-250 are ignored). null when there are none. */
export function hrStats(samples: any[] | undefined): { avg: number; max: number } | null {
  const v = (samples || []).map((s) => Number(s?.beatsPerMinute)).filter((n) => n >= 30 && n <= 250);
  if (!v.length) return null;
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) };
}

/** Resting heart rate per date from RestingHeartRate records (the lowest of the day's readings when several). */
export function restingByDate(records: any[] | undefined, dayOf: (iso: string) => string): { date: string; bpm: number }[] {
  const m = new Map<string, number>();
  for (const r of records || []) {
    const bpm = Number(r?.beatsPerMinute);
    if (!(bpm >= 30 && bpm <= 150) || !r?.time) continue;
    const d = dayOf(r.time);
    m.set(d, Math.min(m.get(d) ?? 999, bpm));
  }
  return [...m.entries()].map(([date, bpm]) => ({ date, bpm }));
}
