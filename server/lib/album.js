// The sticker album: the long-term "collect them all" reward. Showing up earns packs; a pack reveals one sticker you
// don't own yet. Rolls are deterministic per (user, pack number) so a pack can't be re-rolled by refreshing.
const CATALOG = require('../data/stickerCatalog.json');

const EPIC = new Set(['power']);
const RARE = new Set(['party', 'love', 'lift', 'cool', 'game', 'sleep', 'sport']);
const WEIGHT = { common: 70, rare: 24, epic: 6 };
const rarityOf = (cat) => (EPIC.has(cat) ? 'epic' : RARE.has(cat) ? 'rare' : 'common');

/** Every sticker in the game: [{ id: 'naruto/hype-0', who, cat, name, rarity }]. */
function allStickers(catalog = CATALOG) {
  const out = [];
  for (const who of Object.keys(catalog).sort()) for (const cat of Object.keys(catalog[who]).sort()) for (const name of catalog[who][cat]) out.push({ id: `${who}/${name}`, who, cat, name, rarity: rarityOf(cat) });
  return out;
}

/** Packs earned so far: one welcome pack, one per 50 XP, one per week with 5+ days of logging. */
const packsEarned = (xp, chests = 0) => 1 + Math.floor(Math.max(0, xp) / 50) + Math.max(0, chests);

function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Pick the sticker inside pack number `n` for this user. `who` limits the pack to one character (if they have any left). */
function rollSticker(owned, { who = null, seed = 'x', catalog = CATALOG } = {}) {
  const have = owned instanceof Set ? owned : new Set(owned);
  let pool = allStickers(catalog).filter((s) => !have.has(s.id));
  if (who) { const mine = pool.filter((s) => s.who === who); if (mine.length) pool = mine; }
  if (!pool.length) return null;
  const rng = mulberry32(hashStr(seed));
  const tiers = ['common', 'rare', 'epic'].filter((t) => pool.some((s) => s.rarity === t));
  const total = tiers.reduce((a, t) => a + WEIGHT[t], 0);
  let r = rng() * total, tier = tiers[tiers.length - 1];
  for (const t of tiers) { if (r < WEIGHT[t]) { tier = t; break; } r -= WEIGHT[t]; }
  const bucket = pool.filter((s) => s.rarity === tier);
  return bucket[Math.floor(rng() * bucket.length)];
}

/** Totals for the album screen. */
function summary(owned, catalog = CATALOG) {
  const have = new Set(owned); const all = allStickers(catalog);
  const byWho = {};
  for (const s of all) { const b = (byWho[s.who] ||= { owned: 0, total: 0 }); b.total++; if (have.has(s.id)) b.owned++; }
  return { owned: all.filter((s) => have.has(s.id)).length, total: all.length, byWho };
}

module.exports = { allStickers, rarityOf, packsEarned, rollSticker, summary, mulberry32, hashStr, WEIGHT };
