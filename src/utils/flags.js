// Feature flags on the client: the server decides (per person), the app only caches and reads the answer.
// Pure helpers here so they can be tested; the fetching and the React hook are in flagStore.js.
export const FLAGS_TTL_MS = 6 * 3600 * 1000; // ask the server again after 6 hours (or when the app starts and the copy is older)

/** Only keeps { key: true|false } pairs, whatever the server (or a damaged cache) sent. */
export function parseFlags(raw) {
  const out = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === "boolean") out[k] = v;
  return out;
}
/** Is the saved copy {at, flags} still fresh? */
export const flagsFresh = (entry, now = Date.now(), ttl = FLAGS_TTL_MS) => !!entry && Number.isFinite(entry.at) && now - entry.at >= 0 && now - entry.at < ttl;
/** The flag's value, or `fallback` for a flag the server does not know (new features default to off). */
export const flagOn = (flags, key, fallback = false) => (flags && typeof flags[key] === "boolean" ? flags[key] : fallback);
