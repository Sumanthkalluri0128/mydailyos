// One-tap sleep + energy check-in, and what the coach does with it. Pure (no database), so it is easy to test.
// Sleep hours may come from Health Connect (source 'device') or from the one-tap answer. A typed or tapped answer is only a
// stand-in: once the phone reports real hours for that day, the real hours win (see pickSleep).
const SLEEP_CHOICES = [
  { id: 'lt5', label: 'Under 5 h', hours: 4.5 },
  { id: '5to6', label: '5 to 6 h', hours: 5.5 },
  { id: '6to7', label: '6 to 7 h', hours: 6.5 },
  { id: '7to8', label: '7 to 8 h', hours: 7.5 },
  { id: 'gt8', label: '8 h or more', hours: 8.5 },
];
const ENERGY_CHOICES = [
  { id: 1, label: 'Drained' }, { id: 2, label: 'Low' }, { id: 3, label: 'Okay' }, { id: 4, label: 'Good' }, { id: 5, label: 'Great' },
];

/** rows: HealthLog sleep rows for ONE day. Device hours beat a tapped answer; otherwise the largest value. */
function pickSleep(rows = []) {
  const ok = rows.filter((r) => Number(r.value) > 0);
  if (!ok.length) return { hours: null, source: null };
  const device = ok.filter((r) => r.source === 'device');
  const pool = device.length ? device : ok;
  return { hours: Math.max(...pool.map((r) => Number(r.value))), source: device.length ? 'device' : 'manual' };
}

/**
 * What to suggest today. level: 'easy' | 'normal' | 'push' | 'unknown'.
 * A suggestion, never an order: the plan is not changed, and the wording stays calm.
 */
function coachAdvice({ sleepHours = null, energy = null } = {}) {
  const s = sleepHours != null ? Number(sleepHours) : null;
  const e = energy != null ? Number(energy) : null;
  if (s == null && e == null) return { level: 'unknown', headline: '', workout: '', food: '' };
  let level = 'normal';
  if ((s != null && s < 5) || e === 1) level = 'easy';
  else if ((s != null && s < 6.5) || e === 2) level = 'easy';
  else if ((s == null || s >= 7) && (e == null || e >= 4) && !(s == null && e == null)) level = 'push';
  const short = s != null && s < 6;
  const out = {
    easy: {
      headline: s != null && s < 5 ? 'A short night. Go gently today.' : 'Energy looks low. Keep today kind.',
      workout: 'Pick the Quick 20 or a walk today. A lighter session still counts.',
      food: short ? 'Short sleep makes cravings louder. A protein-rich breakfast and steady water help.' : 'Regular meals and water will help your energy.',
    },
    normal: { headline: 'A steady day.', workout: 'Do your planned session as usual.', food: 'Stick to your usual plan.' },
    push: { headline: 'You are well rested. Good day to train.', workout: 'A good day for the harder session in your plan.', food: 'Eat enough protein to make the most of it.' },
  }[level];
  return { level, ...out };
}

module.exports = { SLEEP_CHOICES, ENERGY_CHOICES, pickSleep, coachAdvice };
