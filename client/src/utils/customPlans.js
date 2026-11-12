// Personal workout plans: plans YOU make, edit and delete (the "Smart program" stays the one the server builds from your progress).
// Pure (no React, no network, no storage), so it is unit-tested with plain `node --test` (customPlans.test.js).
// A stored plan is small: { id, name, createdAt, days: [{ dow: 1..7, title, items: [{ id, name, sets, reps }] }] }.
// customToDays() turns it into the same day shape the fixed plan uses (data/workoutPlan.js), so Today, My plan, the live
// workout, History and the exercise sheet run on it unchanged. Weights step up by the same rule as the classic plan
// (hit the top of the rep range on every set -> a little heavier), because suggestNext() reads your logged history.

export const CUSTOM_PREFIX = "custom:";
export const CUSTOM_SOURCE = "custom"; // day.source for days built from a personal plan
export const MAX_PLANS = 12;
export const MAX_ITEMS = 20;
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const clampInt = (n, lo, hi, d) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const text = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);

/** "custom:cp-abc" -> "cp-abc"; anything else -> "". */
export const customIdOf = (source) => (typeof source === "string" && source.startsWith(CUSTOM_PREFIX) ? source.slice(CUSTOM_PREFIX.length) : "");
export const sourceFor = (planId) => `${CUSTOM_PREFIX}${planId}`;

export const planId = (now = Date.now(), rnd = Math.random) => `cp-${now.toString(36)}${Math.floor(rnd() * 1296).toString(36)}`;

/** "8-12", "10", "12 - 15" -> { lo, hi, label }. Falls back to 8-12 when it cannot be read. */
export function parseReps(raw) {
  const m = String(raw == null ? "" : raw).match(/(\d{1,3})\s*(?:[-–to]+\s*(\d{1,3}))?/);
  let lo = m ? parseInt(m[1], 10) : 8, hi = m && m[2] ? parseInt(m[2], 10) : lo;
  if (!(lo >= 1)) lo = 8;
  if (!(hi >= 1)) hi = lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  lo = Math.min(lo, 200); hi = Math.min(hi, 200);
  return { lo, hi, label: lo === hi ? String(lo) : `${lo}-${hi}` };
}

export const emptyDays = () => SHORT.map((_, i) => ({ dow: i + 1, title: "", items: [] }));

export function newPlan(name, now = Date.now()) {
  return { id: planId(now), name: text(name, 40) || "My plan", createdAt: now, days: emptyDays() };
}

/** Copy of a fixed-plan style `days` array (blocks of type "sets") as an editable personal plan. */
export function planFromDays(name, days, now = Date.now()) {
  const p = newPlan(name, now);
  for (const d of days || []) {
    const slot = p.days.find((x) => x.dow === d.dow);
    if (!slot) continue;
    const items = [];
    for (const b of d.blocks || []) {
      if (b.type !== "sets") continue;
      for (const it of b.items || []) if (items.length < MAX_ITEMS && !items.some((x) => x.id === it.id)) items.push({ id: it.id, name: it.name, sets: clampInt(it.sets, 1, 10, 3), reps: it.reps || "8-12" });
    }
    slot.items = items;
    slot.title = items.length ? text(d.title, 30) : "";
  }
  return p;
}

/** Clean whatever was stored (older versions, hand edits, a bad import) so the page can never crash on it. */
export function cleanPlans(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const p of raw) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    const days = emptyDays();
    for (const d of Array.isArray(p.days) ? p.days : []) {
      const slot = days.find((x) => x.dow === Number(d && d.dow));
      if (!slot) continue;
      slot.title = text(d.title, 30);
      const ids = new Set();
      for (const it of Array.isArray(d.items) ? d.items : []) {
        const id = text(it && it.id, 80), name = text(it && it.name, 60);
        if (!id || !name || ids.has(id) || slot.items.length >= MAX_ITEMS) continue;
        ids.add(id);
        slot.items.push({ id, name, sets: clampInt(it.sets, 1, 10, 3), reps: parseReps(it.reps).label });
      }
    }
    out.push({ id: p.id, name: text(p.name, 40) || "My plan", createdAt: Number(p.createdAt) || 0, days });
    if (out.length >= MAX_PLANS) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- edits (each returns a NEW array / plan)
export const addPlan = (plans, plan) => (plans.length >= MAX_PLANS ? plans : [...plans, plan]);
export const removePlan = (plans, id) => plans.filter((p) => p.id !== id);
export const renamePlan = (plans, id, name) => plans.map((p) => (p.id === id ? { ...p, name: text(name, 40) || p.name } : p));
const editPlan = (plans, id, fn) => plans.map((p) => (p.id === id ? { ...p, days: p.days.map((d) => fn(d)) } : p));

export const setDayTitle = (plans, id, dow, title) => editPlan(plans, id, (d) => (d.dow === dow ? { ...d, title: text(title, 30) } : d));
/** Adds an exercise to a day. A day never holds the same exercise twice (its sets are tracked by exercise id). */
export const addItem = (plans, id, dow, item) => editPlan(plans, id, (d) => {
  if (d.dow !== dow || d.items.length >= MAX_ITEMS || d.items.some((x) => x.id === item.id)) return d;
  return { ...d, items: [...d.items, { id: text(item.id, 80), name: text(item.name, 60), sets: clampInt(item.sets, 1, 10, 3), reps: parseReps(item.reps).label }] };
});
export const updateItem = (plans, id, dow, itemId, patch) => editPlan(plans, id, (d) => (d.dow !== dow ? d : {
  ...d, items: d.items.map((x) => (x.id !== itemId ? x : { ...x, ...(patch.sets !== undefined ? { sets: clampInt(patch.sets, 1, 10, x.sets) } : {}), ...(patch.reps !== undefined ? { reps: parseReps(patch.reps).label } : {}) })),
}));
export const removeItem = (plans, id, dow, itemId) => editPlan(plans, id, (d) => (d.dow !== dow ? d : { ...d, items: d.items.filter((x) => x.id !== itemId) }));
export const moveItem = (plans, id, dow, itemId, dir) => editPlan(plans, id, (d) => {
  if (d.dow !== dow) return d;
  const i = d.items.findIndex((x) => x.id === itemId), j = i + dir;
  if (i < 0 || j < 0 || j >= d.items.length) return d;
  const items = d.items.slice(); [items[i], items[j]] = [items[j], items[i]];
  return { ...d, items };
});
export const clearDay = (plans, id, dow) => editPlan(plans, id, (d) => (d.dow === dow ? { ...d, title: "", items: [] } : d));

export const trainingDays = (plan) => (plan ? plan.days.filter((d) => d.items.length) : []);

// ---------------------------------------------------------------------------------------------------------------- to the shared day shape
const MUSCLES = ["chest", "back", "shoulders", "arms", "core", "legs", "glutes"];

/**
 * `lookup(id)` returns the library exercise (with its photo, steps and alternatives) or null for an exercise the library does not know.
 * A day with no exercise is a rest day, so the week strip, the streak and Today keep working.
 */
export function customToDays(plan, lookup = () => null) {
  if (!plan) return [];
  return plan.days.map((d) => {
    const base = { n: d.dow, dow: d.dow, short: SHORT[d.dow - 1], id: `${plan.id}-d${d.dow}`, source: CUSTOM_SOURCE, planId: plan.id, level: "Your plan" };
    if (!d.items.length) {
      return {
        ...base, title: d.title || "Rest", kind: "rest", minutes: "10–20", kcal: 60, focus: "Recovery", muscles: ["mobility"],
        blocks: [{ id: "reset", type: "check", title: "Rest day", items: [
          { id: `${plan.id}-r${d.dow}a`, name: "Full rest", dose: "today", targets: ["mobility"], fig: "", slot: "", steps: ["Rest is when your body adapts."], avoid: "", alts: [], kind: "" },
          { id: `${plan.id}-r${d.dow}b`, name: "Light walk (optional)", dose: "5–10 min", targets: ["mobility"], fig: "", slot: "", steps: ["Easy pace, no tracking."], avoid: "", alts: [], kind: "" },
        ] }],
      };
    }
    const targets = new Set();
    const items = d.items.map((it) => {
      const lib = lookup(it.id) || {};
      const r = parseReps(it.reps);
      const t = (lib.targets && lib.targets.length ? lib.targets : ["core"]).slice();
      t.forEach((x) => targets.add(x));
      return {
        id: it.id, name: it.name, sets: it.sets, reps: r.label, repsMin: r.lo, repsMax: r.hi, rest: lib.rest || 75,
        targets: t, helpers: lib.helpers || [], kind: lib.kind || "", fig: lib.fig || (lib.id || ""), slot: lib.slot || "",
        main: false, // never "+1 set from week 5": a personal plan keeps exactly the sets you chose bw: !!lib.bw, timed: !!lib.timed, perSide: !!lib.perSide, unit: lib.unit || "",
        steps: lib.steps || [], avoid: lib.avoid || "", optional: false, alts: (lib.alts || []).map((a) => ({ ...a })),
      };
    });
    const muscles = MUSCLES.filter((m) => targets.has(m));
    return {
      ...base, title: d.title || `Day ${d.dow}`, kind: "strength", minutes: `${Math.max(20, d.items.length * 7 + 10)}`, kcal: Math.round(d.items.length * 40 + 60),
      focus: muscles.length ? muscles.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ") : "Full body", muscles: muscles.length ? muscles : ["core"],
      blocks: [{ id: "main", type: "sets", title: "Main workout", items }],
    };
  });
}
