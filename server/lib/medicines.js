// Medicine and supplement checklist. Pure and rule-based. This is a reminder tool, NOT medical advice:
// nothing here suggests, changes or checks a dose.
const NOTE = 'This is a reminder tool, not medical advice. Follow what your doctor or pharmacist told you.';
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const toHm = (min) => { const x = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Validates and cleans a medicine from a request body. Throws Error(message) for the person. */
function cleanMed(b = {}) {
  const name = String(b.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Please enter a name');
  const times = [...new Set((Array.isArray(b.times) ? b.times : []).map(String))].filter((t) => HM.test(t)).sort();
  if (!times.length) throw new Error('Add at least one time (HH:mm)');
  if (times.length > 6) throw new Error('At most 6 times a day');
  const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  return { name, dose: String(b.dose || '').trim().slice(0, 40), kind: b.kind === 'supplement' ? 'supplement' : 'medicine', times, days: days.length === 7 ? [] : days, notes: String(b.notes || '').trim().slice(0, 120), active: b.active === undefined ? true : !!b.active };
}
const dosesFor = (med, date) => (!med.active || (med.days?.length && !med.days.includes(dow(date))) ? [] : med.times.map((time) => ({ medId: String(med._id), name: med.name, dose: med.dose || '', kind: med.kind, time })));

/** Today's checklist. "not marked yet" is never called missed or failed. */
function checklist({ meds = [], logs = [], date, nowHm = '00:00' }) {
  const taken = new Map(logs.filter((l) => l.date === date).map((l) => [`${l.medId}|${l.time}`, l]));
  const items = meds.flatMap((m) => dosesFor(m, date)).sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name)).map((d) => {
    const l = taken.get(`${d.medId}|${d.time}`);
    return { ...d, taken: !!l, takenAt: l?.takenAt || null, state: l ? 'taken' : d.time <= nowHm ? 'due' : 'later' };
  });
  return { items, total: items.length, taken: items.filter((i) => i.taken).length, due: items.filter((i) => i.state === 'due').length, note: NOTE };
}

/** Reminder times for one day. Anything that would ring during quiet hours moves to the end of quiet hours instead. */
function planReminders({ meds = [], date, quiet = { start: '22:00', end: '07:00' }, nowHm = '00:00', takenKeys = new Set() }) {
  const qs = toMin(quiet.start), qe = toMin(quiet.end);
  const inQuiet = (m) => (qs === qe ? false : qs < qe ? m >= qs && m < qe : m >= qs || m < qe);
  const out = [];
  for (const d of meds.flatMap((m) => dosesFor(m, date))) {
    if (takenKeys.has(`${d.medId}|${d.time}`)) continue;
    let at = toMin(d.time), shifted = false, nextDay = false;
    if (inQuiet(at)) { nextDay = qs > qe && at >= qs; at = qe; shifted = true; }   // late-evening doses wait for tomorrow morning
    if (!nextDay && toHm(at) <= nowHm) continue;           // already past for today
    out.push({ medId: d.medId, name: d.name, dose: d.dose, doseTime: d.time, at: toHm(at), shifted, nextDay });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
module.exports = { NOTE, HM, cleanMed, dosesFor, checklist, planReminders, toMin, toHm };
