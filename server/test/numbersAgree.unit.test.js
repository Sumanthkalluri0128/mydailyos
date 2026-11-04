// The cards on the Weight / Progress screens must tell ONE story: same "now" weight, headline numbers that add up,
// and an arrival chart whose horizon is not two years of empty space. (Regression for the v59 screenshots.)
const test = require('node:test');
const assert = require('node:assert');
const G = require('../lib/coachG');
const { planTrendKg, recentAverage } = require('../lib/trendWeight');
const { addDays } = require('../lib/dates');

const T = '2026-11-03';
const series = (vals, gap = 1) => vals.map((v, i) => ({ date: addDays(T, -(vals.length - 1 - i) * gap), weightKg: v }));

test('scale-jump card: headline, expected weight and trend line use the same numbers', () => {
  const w = series([79.0, 78.8, 78.7, 78.5, 78.9, 78.4, 78.8, 79.0, 79.4, 79.5, 79.6, 79.9, 80.1, 79.2, 79.8, 80.3, 80.2, 79.5, 79.0, 78.4, 79.4, 79.2, 79.3, 79.1, 79.3, 77.4]);
  const j = G.explainJump({ weights: w, days: [], sleepByDate: {}, today: T });
  assert.equal(j.status, 'jump');
  assert.equal(j.direction, 'down');
  // "Down X kg from your trend" is exactly reading minus the trend line as it stood BEFORE this weigh-in
  assert.equal(j.kg, Math.round(Math.abs(j.scaleKg - j.expectedKg) * 10) / 10);
  // and the sentence below it quotes those same three numbers, not a different "trend" figure
  assert.ok(j.reassure.includes(String(j.expectedKg)), j.reassure);
  assert.ok(j.reassure.includes(String(j.scaleKg)), j.reassure);
  assert.ok(j.reassure.includes(String(j.trendKg)), j.reassure);
  // one reading barely moves the line
  assert.ok(Math.abs(j.trendKg - j.expectedKg) < Math.abs(j.scaleKg - j.expectedKg));
});

test('scale-jump trend does not depend on where a 28-day window happens to start', () => {
  // 50 days at 80, then one dip: the old window-seeded line could start from a different level than the Weight page
  const w = series([...Array(50).fill(80), 78.9]);
  const j = G.explainJump({ weights: w, days: [], sleepByDate: {}, today: T });
  assert.equal(j.status, 'jump');
  assert.equal(j.expectedKg, 80);
});

test('arrival date starts from the goal card\'s "now" and its own remaining distance', () => {
  const noise = [0.3, -0.4, 0.2, 0.5, -0.3, 0.1, -0.5, 0.4, -0.2, 0.3];
  const w = series(noise.map((n, i) => 80 - i * 0.12 + n), 3);   // slow, noisy loss over 27 days
  const plan = { active: true, startKg: 80.3, targetKg: 72.5, startDate: addDays(T, -40) };
  const now = planTrendKg(plan, w, null);
  const r = G.goalRange({ weights: w, goalKg: 72.5, today: T, nowKg: now });
  assert.equal(r.status, 'ok');
  assert.equal(r.nowKg, now);
  assert.equal(r.remainingKg, Math.round((now - 72.5) * 10) / 10);
  // likely days = distance / pace, from the same numbers the card prints
  const perDay = Math.abs(r.slopeKgPerWeek) / 7;
  assert.ok(Math.abs(r.likelyDays - (now - 72.5) / perDay) < 4, `${r.likelyDays} days vs ${(now - 72.5) / perDay}`);
  // without an explicit "now" the default is the same 7-day average
  assert.equal(G.goalRange({ weights: w, goalKg: 72.5, today: T }).nowKg, recentAverage(w).kg);
});

test('arrival chart: open-ended later end no longer stretches the chart to two years', () => {
  const noise = [0.9, -0.8, 0.7, -0.9, 0.8, -0.7, 0.9, -0.8, 0.6, -0.5];
  const w = series(noise.map((n, i) => 82 - i * 0.05 + n), 3);
  const r = G.goalRange({ weights: w, goalKg: 72.5, today: T });
  if (r.status !== 'ok') return;                                    // noise made the trend flat: nothing to draw
  const horizon = r.cone[r.cone.length - 1] ? (new Date(r.cone[r.cone.length - 1].date) - new Date(T)) / 864e5 : 0;
  assert.ok(r.likelyDays <= horizon, 'the likely date is inside the chart');
  if (r.latestOpen) assert.ok(horizon <= Math.max(r.likelyDays + 35, r.likelyDays * 1.5 + 7), `horizon ${horizon} vs likely ${r.likelyDays}`);
  assert.equal(r.startDate, T);
  assert.ok(r.endDate > T);
});

test('goal card and arrival date share ONE "now": planTrendKg is the 7-day average', () => {
  const w = series([80, 79.5, 79, 78.4, 78, 77.8, 77.4]);
  const plan = { active: true, startKg: 80.3, targetKg: 72.5, startDate: addDays(T, -10) };
  assert.equal(planTrendKg(plan, w, null), recentAverage(w).kg);
});

const S = require('../lib/simpleGoals');
test('goal card shows start, last weigh-in and the 7-day average so "kg done" can be checked', () => {
  const plan = { active: true, startKg: 80.3, targetKg: 72.5, startDate: '2026-10-01', paceKg: 0.5 };
  const w = [{ date: '2026-10-30', weightKg: 78.2 }, { date: '2026-11-01', weightKg: 77.9 }, { date: '2026-11-03', weightKg: 77.4 }];
  const g = S.goalCard({ plan, trendKg: 77.83, today: T, weighIns: w });
  assert.equal(g.checkLine, 'Started at 80.3 kg · Last weigh-in: 77.4 kg, today · 7-day average: 77.8 kg');
  assert.equal(g.lastWeighIn.kg, 77.4);
  assert.equal(g.lastWeighIn.daysAgo, 0);
  const none = S.goalCard({ plan, trendKg: 80.3, today: T, weighIns: [] });
  assert.equal(none.checkLine, 'Started at 80.3 kg');
  assert.equal(none.lastWeighIn, null);
  const old = S.goalCard({ plan, trendKg: 78, today: T, weighIns: [{ date: '2026-10-31', weightKg: 78 }] });
  assert.match(old.checkLine, /three days ago/);
});
