// Sticker album & packs. GET /api/album, POST /api/album/open { who?, today? }
const express = require('express');
const Collection = require('../models/Collection');
const { requireAuth } = require('../middleware/auth');
const { wrap, HttpError } = require('../lib/http');
const v = require('../lib/validate');
const { loadJourney } = require('../lib/journeyData');
const { packsEarned, rollSticker, summary, allStickers } = require('../lib/album');
const { todayUtc } = require('../lib/dates');

const router = express.Router();
router.use(requireAuth);
const WHO = new Set(allStickers().map((s) => s.who));

async function state(uid, today) {
  const [j, col] = await Promise.all([loadJourney(uid, today), Collection.findOne({ userId: uid }).lean()]);
  const owned = col?.owned || [], opened = col?.packsOpened || 0;
  const earned = packsEarned(j.level.xp, j.chests);
  return { j, owned, opened, earned, available: Math.max(0, earned - opened), recent: col?.recent || [] };
}
// `summary()` returns { owned: <COUNT>, total, byWho }. It must never be spread over the response AFTER the `owned` array:
// that silently turned `owned` (the list of sticker ids) into a number, and the apps crashed on `new Set(1)`.
// So: `owned` is always the array of ids, and the count travels as `ownedCount` (clients may use owned.length too).
const view = ({ owned, opened, earned, available, recent, j }) => {
  const { owned: ownedCount, total, byWho } = summary(owned);
  return { success: true, packs: { earned, opened, available, nextAtXp: (Math.floor(j.level.xp / 50) + 1) * 50, xp: j.level.xp, chests: j.chests }, owned, ownedCount, total, byWho, recent: recent.slice(-12) };
};

router.get('/', wrap(async (req, res) => {
  const today = req.query.today ? v.date(req.query.today, 'today') : todayUtc();
  res.json(view(await state(req.user.id, today)));
}));

router.post('/open', wrap(async (req, res) => {
  const uid = req.user.id;
  const today = req.body?.today ? v.date(req.body.today, 'today') : todayUtc();
  const who = req.body?.who ? String(req.body.who) : null;
  if (who && !WHO.has(who)) throw new HttpError(400, 'Unknown character');
  const st = await state(uid, today);
  if (st.available <= 0) throw new HttpError(400, `No packs ready — the next one comes at ${(Math.floor(st.j.level.xp / 50) + 1) * 50} XP. Log meals, water or a workout to earn it.`);
  const sticker = rollSticker(st.owned, { who, seed: `${uid}:${st.opened}` });
  if (!sticker) throw new HttpError(400, 'Your album is complete! 🎉');
  // The pack number is part of the filter, so two quick taps can never open the same pack twice.
  const upd = await Collection.findOneAndUpdate({ userId: uid, packsOpened: st.opened }, { $inc: { packsOpened: 1 }, $addToSet: { owned: sticker.id }, $push: { recent: { $each: [{ id: sticker.id, at: new Date() }], $slice: -30 } } }, { new: true });
  if (!upd) {
    if (st.opened === 0 && !(await Collection.exists({ userId: uid }))) {
      try { await Collection.create({ userId: uid, owned: [sticker.id], packsOpened: 1, recent: [{ id: sticker.id, at: new Date() }] }); }
      catch { throw new HttpError(409, 'Please try that again'); }
    } else throw new HttpError(409, 'Please try that again');
  }
  const after = await state(uid, today);
  res.json({ ...view(after), sticker: { id: sticker.id, who: sticker.who, name: sticker.name, cat: sticker.cat, rarity: sticker.rarity } });
}));

module.exports = router;
module.exports.view = view; // exported for the regression test
