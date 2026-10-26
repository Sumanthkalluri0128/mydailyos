// Accountability link: a private page with a weekly summary that shows ONLY the fields the person picked.
// No public feed, no leaderboard, no search engine indexing. Pure helpers; the route does the database work.
const crypto = require('crypto');

// Every field is opt-in. "Habit" fields are on by default, health numbers are not.
const FIELDS = {
  streak: { label: 'Logging streak', health: false },
  loggingDays: { label: 'Days logged this week', health: false },
  workouts: { label: 'Workouts this week', health: false },
  steps: { label: 'Average steps a day', health: false },
  water: { label: 'Average water a day', health: false },
  weight: { label: 'Weight change this week', health: true },
  calories: { label: 'Average calories a day', health: true },
};
const DEFAULT_FIELDS = ['streak', 'loggingDays', 'workouts'];
const cleanFields = (f) => [...new Set((Array.isArray(f) ? f : DEFAULT_FIELDS).filter((x) => Object.hasOwn(FIELDS, x)))];

const newToken = () => crypto.randomBytes(24).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const looksLikeToken = (t) => /^[A-Za-z0-9_-]{32}$/.test(String(t));

/** stats = everything we could compute; returns ONLY the selected fields, formatted for people. */
function pick(fields, stats) {
  const out = [];
  const n = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : x);
  for (const f of cleanFields(fields)) {
    let value = null;
    if (f === 'streak') value = n(stats.streak) === null ? null : `${stats.streak} day${stats.streak === 1 ? '' : 's'}`;
    if (f === 'loggingDays') value = n(stats.loggingDays) === null ? null : `${stats.loggingDays} of 7`;
    if (f === 'workouts') value = n(stats.workouts) === null ? null : `${stats.workouts}${stats.workoutMinutes ? ` (${stats.workoutMinutes} min)` : ''}`;
    if (f === 'steps') value = n(stats.avgSteps) === null ? null : Number(stats.avgSteps).toLocaleString('en-IN');
    if (f === 'water') value = n(stats.avgWaterMl) === null ? null : `${(stats.avgWaterMl / 1000).toFixed(1)} L`;
    if (f === 'weight') value = n(stats.weightChangeKg) === null ? null : `${stats.weightChangeKg > 0 ? '+' : ''}${stats.weightChangeKg} kg`;
    if (f === 'calories') value = n(stats.avgCalories) === null ? null : `${stats.avgCalories} kcal`;
    out.push({ id: f, label: FIELDS[f].label, value: value ?? 'No data yet' });
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function renderPage({ label = '', from, to, items }) {
  const rows = items.map((i) => `<li><span>${esc(i.label)}</span><b>${esc(i.value)}</b></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Weekly summary</title>
<style>body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f5fb;color:#1d1d25}main{max-width:480px;margin:0 auto;padding:28px 18px}h1{font-size:1.4rem;margin:0 0 4px}p{color:#4f4f5e;margin:4px 0 18px}ul{list-style:none;padding:0;margin:0;background:#fff;border-radius:18px;box-shadow:0 6px 24px rgba(27,19,64,.08)}li{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #ececf3}li:last-child{border:0}small{display:block;margin-top:18px;color:#4f4f5e}@media(prefers-color-scheme:dark){body{background:#0c0c13;color:#ededf5}ul{background:#16161f;box-shadow:none}li{border-color:#2b2b3a}p,small{color:#b4b4c8}}</style></head>
<body><main><h1>${label ? `${esc(label)}'s week` : 'Weekly summary'}</h1><p>${esc(from)} to ${esc(to)}</p><ul>${rows || '<li><span>Nothing selected to share.</span></li>'}</ul>
<small>Shared privately by a FlexFit user, only with you. This is a summary of habits, not medical advice. The link can be turned off at any time.</small></main></body></html>`;
}
const notFoundPage = () => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not available</title></head><body style="font:16px system-ui;padding:32px"><h1>This link is not available</h1><p>It may have been turned off.</p></body></html>';
module.exports = { FIELDS, DEFAULT_FIELDS, cleanFields, newToken, hashToken, looksLikeToken, pick, renderPage, notFoundPage };
