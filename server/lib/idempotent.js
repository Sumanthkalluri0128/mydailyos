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

module.exports = { createOnce };
