// Record-level sync between a person's devices (first user: the Gym log). Pure rules, no database.
//
// Every record is { kind, rid, data, updatedAt, deleted }. The newest updatedAt wins; a tie goes to the copy the server already has,
// so every device ends on the same answer. A deletion is a record too (deleted: true, no data), so it reaches the other devices.
const SPACES = { gym: ['entry', 'body', 'goal', 'profile'] };
const MAX_DATA_BYTES = 20_000;      // one record (a logged exercise with its sets, a body measurement, ...)
const MAX_RECORDS_PER_PUSH = 500;
const MAX_RECORDS_PER_PERSON = 20_000;
const DAY_MS = 86_400_000;

const isSpace = (s) => Object.prototype.hasOwnProperty.call(SPACES, s);

/** One raw record from a device -> a clean record, or null when it is unusable. `now` keeps a device with a wrong clock from winning forever. */
function cleanIncoming(raw, space, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || !isSpace(space)) return null;
  const kind = String(raw.kind || ''), rid = String(raw.rid || '');
  if (!SPACES[space].includes(kind) || !/^[\w.:@-]{1,80}$/.test(rid)) return null;
  let updatedAt = Number(raw.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) return null;
  updatedAt = Math.min(Math.round(updatedAt), now + DAY_MS);          // a clock a day ahead is clamped, never trusted
  if (raw.deleted === true) return { kind, rid, data: null, updatedAt, deleted: true };
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return null;
  let size = 0;
  try { size = Buffer.byteLength(JSON.stringify(raw.data)); } catch { return null; }
  if (size > MAX_DATA_BYTES) return null;
  return { kind, rid, data: raw.data, updatedAt, deleted: false };
}

/** Does the incoming record replace what the server has? Strictly newer wins; a tie keeps the server's copy. */
const incomingWins = (existing, incoming) => !existing || incoming.updatedAt > Number(existing.updatedAt || 0);

module.exports = { SPACES, MAX_DATA_BYTES, MAX_RECORDS_PER_PUSH, MAX_RECORDS_PER_PERSON, isSpace, cleanIncoming, incomingWins };
