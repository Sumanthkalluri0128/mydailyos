const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduleSync, pending } = require('../lib/sheetSync');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('scheduleSync: a burst of writes collapses into one sync', async () => {
  let runs = 0;
  const deps = { delayMs: 40, sync: async () => { runs += 1; } };
  for (let i = 0; i < 6; i++) scheduleSync('u1', deps);
  assert.equal(pending(), 1);
  await wait(120);
  assert.equal(runs, 1);
  assert.equal(pending(), 0);
});

test('scheduleSync: a write that lands while syncing triggers exactly one follow-up run', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const deps = { delayMs: 10, sync: async () => { runs += 1; if (runs === 1) await gate; } };
  scheduleSync('u2', deps);
  await wait(40);            // first sync is now running and blocked
  scheduleSync('u2', deps);  // new write during the run
  scheduleSync('u2', deps);
  release();
  await wait(100);
  assert.equal(runs, 2);
});

test('scheduleSync: different people never share a timer', async () => {
  const seen = [];
  const deps = { delayMs: 20, sync: async (id) => { seen.push(id); } };
  scheduleSync('a', deps); scheduleSync('b', deps);
  await wait(80);
  assert.deepEqual(seen.sort(), ['a', 'b']);
});
