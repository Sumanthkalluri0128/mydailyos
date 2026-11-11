// Reads the BODY, not just the scale. A flat scale with a shrinking waist is fat loss, not a stall; a falling scale with a falling
// waist and falling lifts is muscle loss. This turns tape measurements (waist, neck, hips) and the weight trend into an estimated
// fat-mass / lean-mass change over ~6 weeks (US Navy body-fat estimate: good for CHANGE over time, not a medical measurement).
// Pure. Conservative: with too little data it says "no data" and never guesses.
const { navyBodyFat } = require('./bodyFat');
const { diffDays } = require('./dates');
const { smoothTrend } = require('./trendWeight');

const r1 = (x) => Math.round(x * 10) / 10;
const latestBefore = (rows, date) => [...rows].filter((r) => r.date <= date && Number(r.value) > 0).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
const earliestFrom = (rows, date) => [...rows].filter((r) => r.date >= date && Number(r.value) > 0).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
const trendAt = (series, date) => { const p = [...series].filter((s) => s.date <= date).pop(); return p ? p.trendKg : null; };

/**
 * @param o.measures {waist:[{date,value}], neck:[...], hips:[...]}   o.weights [{date, weightKg}]   o.sex, o.heightCm, o.today
 * @returns {hasData, waistChangeCm, fatMassChangeKg, leanChangeKg, bfStart, bfEnd, improving, worsening, note}
 */
function compositionChange({ measures = {}, weights = [], sex, heightCm, today, windowDays = 42, minGapDays = 14 } = {}) {
  const none = { hasData: false, waistChangeCm: null, fatMassChangeKg: null, leanChangeKg: null, bfStart: null, bfEnd: null, improving: false, worsening: false, note: '' };
  if (!today) return none;
  const waist = measures.waist || [];
  const end = latestBefore(waist, today);
  const start = end ? earliestFrom(waist, addDaysISO(today, -windowDays)) : null;
  if (!end || !start || diffDays(start.date, end.date) < minGapDays) return none;
  const waistChangeCm = r1(Number(end.value) - Number(start.value));
  const series = smoothTrend((weights || []).filter((w) => Number(w.weightKg) > 0));
  const w0 = trendAt(series, start.date), w1 = trendAt(series, end.date);
  const at = (rows, d) => { const r = latestBefore(rows || [], d); return r ? Number(r.value) : null; };
  let fat = null, lean = null, bfStart = null, bfEnd = null;
  if (w0 && w1) {
    bfStart = navyBodyFat({ sex, heightCm, waistCm: start.value, neckCm: at(measures.neck, start.date), hipCm: at(measures.hips, start.date) });
    bfEnd = navyBodyFat({ sex, heightCm, waistCm: end.value, neckCm: at(measures.neck, end.date), hipCm: at(measures.hips, end.date) });
    if (bfStart !== null && bfEnd !== null) {
      const f0 = (w0 * bfStart) / 100, f1 = (w1 * bfEnd) / 100;
      fat = r1(f1 - f0); lean = r1((w1 - f1) - (w0 - f0));
    }
  }
  // Tape-only reading is enough for "improving" (waist down >= 1 cm); the fat/lean split only sharpens it.
  const leanOk = lean === null || lean >= -0.7;
  const improving = (waistChangeCm <= -1 && leanOk) || (fat !== null && fat <= -0.5 && leanOk);
  const worsening = waistChangeCm >= 1.5 || (fat !== null && fat >= 0.8);
  const note = improving ? `Your waist is ${Math.abs(waistChangeCm)} cm ${waistChangeCm < 0 ? 'smaller' : 'bigger'}${fat !== null ? ` and about ${Math.abs(fat)} kg of fat ${fat < 0 ? 'lost' : 'gained'}` : ''}: your body is changing even where the scale is slow.` : '';
  return { hasData: true, waistChangeCm, fatMassChangeKg: fat, leanChangeKg: lean, bfStart, bfEnd, improving, worsening, note };
}

function addDaysISO(date, n) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/** What to measure next so the coach can see more of the body. Never more than two prompts. */
function measurePrompts({ today, lastWaistDate = null, lastNeckDate = null, lastWeighInDate = null, sex = '' } = {}) {
  const out = [];
  const age = (d) => (d ? diffDays(d, today) : Infinity);
  if (age(lastWeighInDate) >= 5) out.push({ id: 'weigh', title: 'Weigh in tomorrow morning', detail: 'The coach needs 6 weigh-ins in 14 days to read your trend. After the toilet, before food, same scale.', page: 'weight' });
  if (age(lastWaistDate) >= 14) out.push({ id: 'waist', title: 'Measure your waist this week', detail: 'Around the navel, relaxed. When the scale is slow, your waist shows if fat is still going down, so the coach does not cut food for nothing.', page: 'health' });
  else if (age(lastNeckDate) >= 42 && lastWaistDate) out.push({ id: 'neck', title: 'Add a neck measurement', detail: `With waist${sex === 'female' ? ', hips' : ''} and neck, the coach can estimate fat versus muscle change.`, page: 'health' });
  return out.slice(0, 2);
}

module.exports = { compositionChange, measurePrompts };
