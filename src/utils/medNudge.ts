// Medicine and supplement reminders: pure planning, no Expo imports. A reminder never rings inside quiet hours; it moves to the end of
// quiet time instead. Already-taken doses are skipped. This is a reminder tool, not medical advice.
export type Med = { id: string; name: string; dose?: string; times: string[]; days?: number[]; active?: boolean };
/** `doseTime` is the first dose this ring covers; `doses` lists every dose of that medicine that rings at this moment (quiet hours can pile several onto the end of quiet time), each with the day it belongs to. */
export type MedDose = { date: string; time: string };
export type MedNudge = { medId: string; name: string; dose: string; doseTime: string; doses: MedDose[]; at: Date; shifted: boolean };
export const MED_NOTE = 'This is a reminder tool, not medical advice. Follow what your doctor or pharmacist told you.';

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inQuiet = (m: number, q: { start: string; end: string }) => { const s = toMin(q.start), e = toMin(q.end); return s === e ? false : s < e ? m >= s && m < e : m >= s || m < e; };

/** Reminders for today (what is left) and the next `daysAhead - 1` days. `taken` holds "YYYY-MM-DD|medId|HH:mm" keys. */
export function planMedNudges(now: Date, meds: Med[], o: { quiet: { start: string; end: string } | null; taken?: Set<string>; daysAhead?: number; max?: number }): MedNudge[] {
  const out: MedNudge[] = [];
  const days = o.daysAhead ?? 2;
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    for (const m of meds) {
      if (m.active === false) continue;
      if (m.days && m.days.length && !m.days.includes(day.getDay())) continue;
      for (const t of m.times) {
        if (o.taken?.has(`${ymd(day)}|${m.id}|${t}`)) continue;
        let min = toMin(t), shifted = false, dayShift = 0;
        if (o.quiet && inQuiet(min, o.quiet)) {
          dayShift = toMin(o.quiet.start) > toMin(o.quiet.end) && min >= toMin(o.quiet.start) ? 1 : 0;   // late-evening doses wait for tomorrow morning
          min = toMin(o.quiet.end); shifted = true;
        }
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayShift, Math.floor(min / 60), min % 60, 0, 0);
        if (at.getTime() <= now.getTime() + 30_000) continue;
        out.push({ medId: m.id, name: m.name, dose: m.dose || '', doseTime: t, doses: [{ date: ymd(day), time: t }], at, shifted });
      }
    }
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  // One ring per medicine and moment. Quiet hours can push two doses of the same medicine onto the same minute (e.g. 06:00 and 06:30 both
  // wait for 07:00), and a late dose can collide with tomorrow's early one: that used to ring twice. Now it rings once and covers all of them.
  const byKey = new Map<string, MedNudge>();
  for (const n of out) {
    const k = `${n.medId}|${n.at.getTime()}`, cur = byKey.get(k);
    if (!cur) byKey.set(k, { ...n, doses: [...n.doses] });
    else for (const d of n.doses) if (!cur.doses.some((x) => x.date === d.date && x.time === d.time)) cur.doses.push(d);
  }
  return [...byKey.values()].slice(0, o.max ?? 40);
}
export const medText = (n: MedNudge) => ({ title: 'Medicine reminder', body: `${n.name}${n.dose ? ` · ${n.dose}` : ''}` });
