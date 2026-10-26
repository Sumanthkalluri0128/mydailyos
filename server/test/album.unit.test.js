const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../lib/album');
const J = require('../lib/journey');

test('catalogue: every sticker has a unique id and a rarity', () => {
  const all = A.allStickers(); const ids = new Set(all.map((s) => s.id));
  assert.equal(ids.size, all.length); assert.ok(all.length > 250);
  for (const s of all) assert.ok(['common', 'rare', 'epic'].includes(s.rarity));
});
test('packs: welcome pack, one per 50 XP, one per good week', () => {
  assert.equal(A.packsEarned(0, 0), 1); assert.equal(A.packsEarned(49, 0), 1); assert.equal(A.packsEarned(50, 0), 2); assert.equal(A.packsEarned(520, 2), 1 + 10 + 2); assert.equal(A.packsEarned(-5, -1), 1);
});
test('roll: deterministic, never a duplicate, respects the chosen character', () => {
  const a = A.rollSticker([], { seed: 'u:0' }), b = A.rollSticker([], { seed: 'u:0' });
  assert.equal(a.id, b.id);
  const owned = new Set([a.id]);
  for (let n = 1; n < 60; n++) { const s = A.rollSticker(owned, { seed: `u:${n}` }); assert.ok(!owned.has(s.id)); owned.add(s.id); }
  const z = A.rollSticker([], { who: 'zoro', seed: 'u:3' }); assert.equal(z.who, 'zoro');
});
test('roll: finishing a character falls back to others, and a full album returns null', () => {
  const all = A.allStickers(); const zoro = all.filter((s) => s.who === 'zoro').map((s) => s.id);
  assert.notEqual(A.rollSticker(zoro, { who: 'zoro', seed: 'x' }).who, 'zoro');
  assert.equal(A.rollSticker(all.map((s) => s.id), { seed: 'x' }), null);
});
test('rarity: epics are rare in practice (~6%)', () => {
  let epic = 0; const N = 4000;
  for (let n = 0; n < N; n++) if (A.rollSticker([], { seed: `r:${n}` }).rarity === 'epic') epic++;
  assert.ok(epic / N > 0.03 && epic / N < 0.1, `epic share ${epic / N}`);
});
test('summary counts per character', () => {
  const all = A.allStickers(); const s = A.summary([all[0].id, all[1].id]);
  assert.equal(s.owned, 2); assert.equal(s.total, all.length); assert.ok(s.byWho[all[0].who].owned >= 1);
});
test('weekly chapter: Monday-first stones, chest at 5 logged days', () => {
  const T = { calories: 2000, direction: 'lose', waterMl: 3000 };
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((date) => ({ date, calories: 1900, waterMl: 3000, exerciseMinutes: 0, steps: 0, protein: 0 }));
  const c = J.weekChapter(days, T, '2026-10-16');
  assert.equal(c.start, '2026-10-12'); assert.equal(c.stones.length, 7); assert.equal(c.logged, 5); assert.equal(c.chestReady, true);
  assert.equal(c.stones[4].today, true); assert.equal(c.stones[5].future, true); assert.equal(c.daysLeft, 2);
  assert.equal(J.weekChests(days, T), 1); assert.equal(J.weekChests(days.slice(0, 4), T), 0);
});

test('API view: `owned` stays the array of sticker ids (regression: summary().owned count used to overwrite it)', () => {
  const { view } = require('../routes/albumRoutes');
  const all = A.allStickers(); const ids = [all[0].id, all[1].id, all[2].id];
  const out = view({ owned: ids, opened: 3, earned: 4, available: 1, recent: [], j: { level: { xp: 120 }, chests: 0 } });
  assert.ok(Array.isArray(out.owned)); assert.deepEqual(out.owned, ids);
  assert.equal(out.ownedCount, 3); assert.equal(out.total, all.length); assert.ok(out.byWho[all[0].who]);
  assert.equal(out.packs.available, 1); assert.equal(out.packs.nextAtXp, 150);
  // the shape the web/mobile clients feed straight into new Set(...)
  assert.doesNotThrow(() => new Set(out.owned));
  // an empty album still returns an array, never a number
  const empty = view({ owned: [], opened: 0, earned: 1, available: 1, recent: [], j: { level: { xp: 0 }, chests: 0 } });
  assert.deepEqual(empty.owned, []); assert.equal(empty.ownedCount, 0);
});
