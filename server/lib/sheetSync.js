// Keeps each connected person's Google Sheet in step with the database.
//
// Design: MongoDB stays the fast working store (the dashboard needs aggregation, dedupe and instant answers, which
// Sheets can't give: ~60 reads/min quota, ~300ms per call, no queries). Every successful write schedules a
// debounced "mirror" so the sheet in the person's OWN Google Drive always holds a complete, readable copy.
const mongoose = require('mongoose');
const google = require('./googleClient');
const { buildTabs, TAB_NAMES } = require('./sheetData');
const { decrypt } = require('./cryptoBox');

const DEBOUNCE_MS = Number(process.env.SHEET_SYNC_DEBOUNCE_MS) || 45_000;
const timers = new Map();   // userId -> timeout
const running = new Set();  // userId currently syncing
const rerun = new Set();    // changed again while a sync was running

async function loadUserData(userId) {
  const M = (n) => mongoose.model(n);
  const q = (n, sort = { date: 1 }) => M(n).find({ userId }).sort(sort).lean();
  const [user, profile, foodLogs, waterLogs, weightLogs, activityLogs, tasks, habitLogs, healthLogs, fasts] = await Promise.all([
    M('User').findById(userId).select('name email').lean(), M('Profile').findOne({ userId }).lean(),
    q('FoodLog'), q('WaterLog'), q('WeightLog'), q('ActivityLog'), q('Task'), q('HabitLog'), q('HealthLog'), q('Fast', { startedAt: 1 }),
  ]);
  return { user, profile, foodLogs, waterLogs, weightLogs, activityLogs, tasks, habitLogs, healthLogs, fasts, now: Date.now() };
}

/** Runs one full mirror. Returns { ok, url } or { ok:false, error }. Never throws. */
async function syncUser(userId, deps = {}) {
  const User = mongoose.model('User');
  const g = deps.google || google;
  const env = deps.env || process.env;
  const user = await User.findById(userId).select('+google.refreshTokenEnc');
  if (!user?.google?.refreshTokenEnc) return { ok: false, error: 'Google is not connected' };

  const fail = async (e) => {
    user.google.lastSyncError = String(e.message || e).slice(0, 300);
    if (e.needsReconnect) user.google.needsReconnect = true;
    await user.save().catch(() => {});
    return { ok: false, error: user.google.lastSyncError, needsReconnect: !!e.needsReconnect };
  };

  try {
    const token = await g.refreshAccessToken({ refreshToken: decrypt(user.google.refreshTokenEnc, env), clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET });
    const data = await (deps.loadData || loadUserData)(userId);
    const tabs = buildTabs(data);

    let id = user.google.spreadsheetId;
    const create = async () => {
      const s = await g.createSpreadsheet(token, { title: 'FlexFit data', tabs: TAB_NAMES });
      user.google.spreadsheetId = s.id; user.google.spreadsheetUrl = s.url; id = s.id;
    };
    if (!id) await create();
    else {
      try { await g.ensureTabs(token, id, TAB_NAMES); }
      catch (e) { if (e.notFound) await create(); else throw e; } // person deleted the sheet -> make a fresh one
    }
    await g.writeTabs(token, id, tabs);

    user.google.lastSyncAt = new Date(); user.google.lastSyncError = ''; user.google.needsReconnect = false;
    await user.save();
    return { ok: true, url: user.google.spreadsheetUrl };
  } catch (e) {
    return fail(e);
  }
}

/** Debounced: bursts of writes (logging 5 foods) collapse into a single sync a little later. */
function scheduleSync(userId, deps = {}) {
  const id = String(userId);
  if (running.has(id)) { rerun.add(id); return; }
  clearTimeout(timers.get(id));
  const t = setTimeout(async () => {
    timers.delete(id);
    running.add(id);
    try { await (deps.sync || syncUser)(id); }
    catch (e) { console.warn('sheet sync failed:', e.message); }
    finally { running.delete(id); if (rerun.delete(id)) scheduleSync(id, deps); }
  }, deps.delayMs ?? DEBOUNCE_MS);
  if (t.unref) t.unref();
  timers.set(id, t);
}

const pending = () => timers.size;
module.exports = { syncUser, scheduleSync, loadUserData, pending };

// Cheap guard used by the write hook: only people who connected Google (and left auto-sync on) get a sync scheduled.
// The answer is cached for a minute so ordinary writes don't pay an extra DB read each time.
const connectedCache = new Map(); // userId -> { at, connected }
async function scheduleSyncIfConnected(userId) {
  const id = String(userId);
  const hit = connectedCache.get(id);
  let connected;
  if (hit && Date.now() - hit.at < 60_000) connected = hit.connected;
  else {
    const u = await mongoose.model('User').findOne({ _id: id, 'google.connectedAt': { $ne: null }, 'google.autoSync': { $ne: false } }).select('_id').lean().catch(() => null);
    connected = !!u;
    connectedCache.set(id, { at: Date.now(), connected });
  }
  if (connected) scheduleSync(id);
}
module.exports.scheduleSyncIfConnected = scheduleSyncIfConnected;
module.exports.forgetConnectedCache = (userId) => connectedCache.delete(String(userId));
