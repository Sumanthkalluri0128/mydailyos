// Create-once helper for offline-queued writes. The mobile app attaches a client-generated
// `clientId` to every create; if the request reached the server but the response was lost,
// the replay returns the existing record instead of creating a duplicate.
async function createOnce(Model, userId, clientId, doc) {
  if (clientId) {
    const existing = await Model.findOne({ userId, clientId });
    if (existing) return { doc: existing, duplicate: true };
  }
  try {
    const created = await Model.create({ ...doc, userId, ...(clientId ? { clientId } : {}) });
    return { doc: created, duplicate: false };
  } catch (e) {
    if (e && e.code === 11000 && clientId) {
      const existing = await Model.findOne({ userId, clientId });
      if (existing) return { doc: existing, duplicate: true };
    }
    throw e;
  }
}

// Create unless the person already has exactly this item. For things people add by typing a name (a habit, a medicine, a goal, a template): a second tap, or a
// retry after a timeout, returns the one that exists instead of making a twin. "Exactly" = same name AND every other field the request set; a change to any of
// them is a different item, so adding a similar one on purpose still works. `key` is the field that is cheap to look up by (the name or title).
const canon = (x) => {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object' && !(x instanceof Date)) {
    if (typeof x.toHexString === 'function') return String(x);            // an ObjectId
    return Object.fromEntries(Object.keys(x).filter((k) => k !== '_id' && x[k] !== undefined).sort().map((k) => [k, canon(x[k])]));
  }
  return x instanceof Date ? x.toISOString() : x;
};
/** An item of this person's with exactly these fields (and, with `withinMs`, created that recently), or null. */
async function findSame(Model, userId, data, key, { withinMs = 0 } = {}) {
  const probe = new Model({ userId, ...data }).toObject();                  // casts and defaults applied, the way the saved copy will look
  const filter = { userId, [key]: probe[key] };
  if (withinMs) filter.createdAt = { $gte: new Date(Date.now() - withinMs) };
  const candidates = await Model.find(filter).limit(25).lean();
  const pick = (o) => JSON.stringify(canon(Object.fromEntries(Object.keys(data).map((k) => [k, o[k]]))));
  const want = pick(probe);
  return candidates.find((c) => pick(c) === want) || null;
}
async function createUnlessSame(Model, userId, data, key, opts) {
  const same = await findSame(Model, userId, data, key, opts);
  if (same) return { doc: same, duplicate: true };
  return { doc: await Model.create({ userId, ...data }), duplicate: false };
}

module.exports = { createOnce, createUnlessSame, findSame };
