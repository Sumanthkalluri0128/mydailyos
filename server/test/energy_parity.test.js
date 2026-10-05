// The website's copy of the energy model must give exactly the same numbers as the server's (and, through the shared
// fixtures, the mobile app's). This catches the "web says one thing, phone says another" class of bug before release.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const server = require('../lib/energy');
const fx = require('./fixtures/energy-fixtures.json');

test('web client energy model == server energy model (fixtures + 3000 random people)', async () => {
  const web = await import(pathToFileURL(path.join(__dirname, '../../client/src/utils/energy.js')).href);
  for (const c of fx.plans) assert.deepEqual(JSON.parse(JSON.stringify(web.expectedEnergy(c.profile))), JSON.parse(JSON.stringify(server.expectedEnergy(c.profile))), c.name);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sexes = ['male', 'female', 'other', ''], acts = ['sedentary', 'light', 'moderate', 'very_active', 'extra_active'];
  for (let i = 0; i < 3000; i++) {
    const w = 40 + rnd() * 100;
    const p = { age: 16 + Math.floor(rnd() * 60), sex: sexes[Math.floor(rnd() * 4)], heightCm: 140 + Math.floor(rnd() * 60), currentWeightKg: Math.round(w * 10) / 10, activityLevel: acts[Math.floor(rnd() * 5)],
      goals: { targetWeightKg: rnd() < 0.2 ? null : Math.round((w + (rnd() - 0.5) * 40) * 10) / 10, weeklyPaceKg: [0.25, 0.5, 0.75, 1, undefined][Math.floor(rnd() * 5)], calorieMode: rnd() < 0.3 ? 'manual' : 'auto', calorieTarget: 1000 + Math.floor(rnd() * 2500) } };
    const day = { eaten: Math.floor(rnd() * 3500), workout: Math.floor(rnd() * 900), steps: Math.floor(rnd() * 600) };
    assert.equal(JSON.stringify([web.expectedEnergy(p), web.dayBalance(p, day), web.dailyTarget(p)]), JSON.stringify([server.expectedEnergy(p), server.dayBalance(p, day), server.dailyTarget(p)]));
  }
});
