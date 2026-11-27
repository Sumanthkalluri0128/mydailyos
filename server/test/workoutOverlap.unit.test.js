// Phase 3: one burn formula, and one workout is counted once even if it was logged by hand AND recorded by a watch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { manualBudget, partitionHc, groupOf, COVER } = require('../lib/hcImport');
const E = require('../lib/energy');

test('burn formula: only what the exercise burns, (MET - 1) x 3.5 x kg / 200 per minute', () => {
  assert.equal(E.REST_MET, 1);
  assert.equal(E.estimateBurn(5, 80, 60), 336);
  assert.equal(E.estimateBurn(9.8, 70, 30), (8.8 * 3.5 * 70 / 200) * 30);
  assert.equal(E.estimateBurn(1, 80, 60), 0);
  assert.equal(E.estimateBurn(0.2, 80, 60), 0, 'never negative');
  assert.deepEqual(E.SESSION_MET, { strength: 5, conditioning: 6, recovery: 3.5, rest: 2.5 });
  assert.equal(E.sessionMet('active'), 3.5);
  assert.equal(E.sessionMet('nonsense'), 5);
});

test('the burn formula is written once: no route or lib re-types it', () => {
  const bad = [];
  for (const dir of ['lib', 'routes']) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', dir)).filter((x) => x.endsWith('.js'))) {
      if (dir === 'lib' && f === 'energy.js') continue;
      fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/\*\s*3\.5\s*\*[^;]*\/\s*200|3\.5\s*\*[^;]*\*\s*3\.5|\bmet\b[^;]*\*\s*3\.5/i.test(code) && /\/\s*200/.test(code)) bad.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(bad, [], 'use energy.estimateBurn (net of resting energy) instead of typing the MET formula');
});

test('overlap: the person\'s own entries cover a watch session of the same kind that day', () => {
  const b = manualBudget([{ date: '2026-11-10', category: 'Strength', durationMinutes: 30 }]);
  assert.equal(b.covers('2026-11-10', 'Strength', 60), true, '30 of 60 minutes is at least 40 %');
});

test('overlap: not the same day, or not the same kind of activity, is a different workout', () => {
  const b = manualBudget([{ date: '2026-11-10', category: 'Strength', durationMinutes: 60 }]);
  assert.equal(b.covers('2026-11-11', 'Strength', 60), false, 'another day');
  assert.equal(b.covers('2026-11-10', 'Walking', 30), false, 'a walk is not a lifting session');
  assert.equal(b.covers('2026-11-10', 'Cardio', 30), false);
});

test('overlap: a little logged against a long session does not hide it', () => {
  const b = manualBudget([{ date: '2026-11-10', category: 'Strength', durationMinutes: 10 }]);
  assert.equal(b.covers('2026-11-10', 'Strength', 60), false, '10 of 60 minutes is under 40 %: probably a separate session');
  assert.equal(COVER, 0.4);
});

test('overlap: minutes are shared out, so 30 logged minutes cover one session, not two', () => {
  const b = manualBudget([{ date: '2026-11-10', category: 'Strength', durationMinutes: 30 }]);
  assert.equal(b.covers('2026-11-10', 'Strength', 45), true);
  assert.equal(b.covers('2026-11-10', 'Strength', 45), false, 'nothing is left for a second watch session');
});

test('overlap: a Gym log session is several rows (one per exercise); together they cover the watch session', () => {
  const rows = Array.from({ length: 5 }, () => ({ date: '2026-11-10', category: 'Strength', durationMinutes: 6 }));
  assert.equal(manualBudget(rows).covers('2026-11-10', 'Strength', 60), true, '5 x 6 = 30 minutes of 60');
  assert.equal(manualBudget(rows.slice(0, 2)).covers('2026-11-10', 'Strength', 60), false, '12 minutes of 60 is not enough');
});

test('overlap: bad numbers never cover anything', () => {
  const b = manualBudget([{ date: 'd', category: 'Strength', durationMinutes: 'abc' }, { date: 'd', category: 'Strength', durationMinutes: -5 }]);
  assert.equal(b.covers('d', 'Strength', 30), false);
  assert.equal(b.covers('d', 'Strength', 0), false);
  assert.equal(groupOf('strength'), 'strength'); assert.equal(groupOf(undefined), 'other');
});

// ---- the same rule over imported AND new watch sessions together: the result does not depend on what arrived first
const man = (date, category, durationMinutes) => ({ date, category, durationMinutes });
const ex = (id, date, category, durationMinutes) => ({ _id: id, date, category, durationMinutes });
const fr = (clientId, date, category, durationMinutes, startMs = 0) => ({ clientId, date, category, durationMinutes, startMs });

test('partitionHc: an imported session your own entry now covers is dropped; one it does not cover stays', () => {
  const r = partitionHc({ manualRows: [man('d', 'Strength', 30)], existing: [ex('a', 'd', 'Strength', 60)], fresh: [] });
  assert.deepEqual(r.dropExisting, ['a']); assert.equal(r.skipFresh.size, 0);
  const none = partitionHc({ manualRows: [man('d', 'Strength', 10)], existing: [ex('a', 'd', 'Strength', 60)], fresh: [] });
  assert.deepEqual(none.dropExisting, []);
  assert.deepEqual(partitionHc({ manualRows: [], existing: [ex('a', 'd', 'Strength', 60)], fresh: [fr('hc:n', 'd', 'Strength', 30)] }).dropExisting, [], 'no own entries: nothing is covered');
});
test('partitionHc: imported and new sessions compete together, longest first', () => {
  // 30 logged minutes: the 60-minute session (already imported) is the one covered, the new 45-minute one is kept
  const r = partitionHc({ manualRows: [man('d', 'Strength', 30)], existing: [ex('long', 'd', 'Strength', 60)], fresh: [fr('hc:short', 'd', 'Strength', 45)] });
  assert.deepEqual(r.dropExisting, ['long']); assert.equal(r.skipFresh.has('hc:short'), false);
  // the other way round (the new one is the longer): the new one is the one not imported, the imported shorter one stays
  const r2 = partitionHc({ manualRows: [man('d', 'Strength', 30)], existing: [ex('short', 'd', 'Strength', 45)], fresh: [fr('hc:long', 'd', 'Strength', 60)] });
  assert.deepEqual(r2.dropExisting, []); assert.equal(r2.skipFresh.has('hc:long'), true);
});
test('partitionHc: a tie goes to the already-imported session, so a sync never swaps them', () => {
  const r = partitionHc({ manualRows: [man('d', 'Strength', 30)], existing: [ex('old', 'd', 'Strength', 45)], fresh: [fr('hc:new', 'd', 'Strength', 45)] });
  assert.deepEqual(r.dropExisting, ['old']); assert.equal(r.skipFresh.size, 0);
});
test('partitionHc: other days and other kinds of activity are untouched', () => {
  const r = partitionHc({ manualRows: [man('d1', 'Strength', 60)], existing: [ex('a', 'd2', 'Strength', 60), ex('b', 'd1', 'Walking', 30)], fresh: [] });
  assert.deepEqual(r.dropExisting, []);
});
