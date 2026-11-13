// Finds the full record (muscles, steps, picture hint, rest...) for any exercise id a plan can hold:
// built-in library ids, "x-..." extras, wide-catalogue ids ("gc-...") and the ones a person typed ("custom:...").
// Cached: the library is built once, so opening a plan or a picker with 200+ exercises stays instant.
import { libraryList } from "../data/workoutPlan.js";
import { GYM_CATALOG } from "./gymCatalog.js";
import { detailFor } from "./exerciseDetail.js";

let cache = null;
function index() {
  if (cache) return cache;
  const byId = new Map(), byName = new Map();
  const key = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const e of libraryList()) { byId.set(e.id, e); byName.set(key(e.name), e); }
  for (const c of GYM_CATALOG) { byId.set(c.id, c); if (!byName.has(key(c.name))) byName.set(key(c.name), c); }
  cache = { byId, byName, key };
  return cache;
}

/** The record for `id`; falls back to the name (older saved plans), then to a derived record so nothing opens empty. */
export function lookupExercise(id, item) {
  const { byId, byName, key } = index();
  const hit = byId.get(id) || (item && item.name ? byName.get(key(item.name)) : null);
  if (hit) return hit.derived || (hit.steps && hit.steps.length && hit.targets && hit.targets.length) ? hit : detailFor(hit);
  if (item && item.name) return detailFor({ id, name: item.name, cat: item.cat || "other", unit: item.unit });
  return null;
}
export const resetLookupCache = () => { cache = null; };
