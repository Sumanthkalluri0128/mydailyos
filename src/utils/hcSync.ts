// Pulls the switched-on Health Connect data (sleep, heart rate, workouts) into FlexFit. Safe to run often: every entry carries a
// stable id, so nothing is added twice, and a reading the person typed in themselves is never overwritten. Never throws.
import { post } from '../config/api';
import { hcGrantedTypes, hcLoadPrefs, hcReadResting, hcReadSessions, hcReadSleep, hcSupport } from './healthConnect';

export type HcSyncResult = { sleep: number; resting: number; workouts: number; skipped: number };
let last = 0;

export async function syncHealthConnect(force = false): Promise<HcSyncResult> {
  const res: HcSyncResult = { sleep: 0, resting: 0, workouts: 0, skipped: 0 };
  if (!force && Date.now() - last < 5 * 60_000) return res; // at most every 5 minutes
  try {
    const prefs = await hcLoadPrefs();
    if (!prefs.sleep && !prefs.heartRate && !prefs.exercise) return res;
    if ((await hcSupport()) !== 'ready') return res;
    last = Date.now();
    const granted = await hcGrantedTypes();
    const on = { sleep: prefs.sleep && granted.sleep, heartRate: prefs.heartRate && granted.heartRate, exercise: prefs.exercise && granted.exercise };

    if (on.sleep) for (const s of await hcReadSleep(7)) {
      try { await post('/api/health-logs', { type: 'sleep', date: s.date, value: s.hours, source: 'device', clientId: `hc:sleep:${s.date}`, notes: 'From Health Connect' }); res.sleep += 1; } catch { res.skipped += 1; }
    }
    if (on.heartRate) for (const r of await hcReadResting(7)) {
      try { await post('/api/health-logs', { type: 'heartRate', date: r.date, value: r.bpm, source: 'device', clientId: `hc:rhr:${r.date}`, notes: 'Resting, from Health Connect' }); res.resting += 1; } catch { res.skipped += 1; }
    }
    if (on.exercise) {
      const sessions = (await hcReadSessions(7, on.heartRate)).filter((s) => s.id);
      if (sessions.length) {
        try { const r: any = await post('/api/activities/import', { sessions }); res.workouts = r.imported || 0; res.skipped += (r.skipped || []).length; } catch { res.skipped += sessions.length; }
      }
    }
  } catch { /* best effort */ }
  return res;
}
