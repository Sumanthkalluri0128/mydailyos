// App tour: pure rules (no database, no network), shared by the route and the tests.
// The steps, paths, checklist and hints live in ONE data file (data/tourContent.json, identical to client/src/tour/tourContent.json
// and the mobile copy). The server stores only progress: which steps and actions are done, what was seen, and the Rookie reward.
const CONTENT = require('../data/tourContent.json');

const GOALS = CONTENT.goals.map((g) => g.id);
const MODES = ['simple', 'advanced'];
const STATUSES = ['', 'active', 'done', 'skipped'];
const ACTIONS = [...new Set([...Object.values(CONTENT.steps).map((s) => s.action).filter(Boolean), ...CONTENT.checklist.items.map((i) => i.action)])];
const STEP_IDS = Object.keys(CONTENT.steps);
const HINT_IDS = Object.values(CONTENT.coachmarks).flat().map((h) => h.id);
const NEW_IDS = CONTENT.whatsNew.map((w) => w.id);

const uniq = (a) => [...new Set(a)];
const onlyKnown = (arr, known) => uniq((Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string' && known.includes(x)));

/** The tour path for a goal (and Simple / Advanced mode if the person has one). At most 5 steps; unknown goals fall back to "healthy". */
function pathFor(goal, mode) {
  const base = CONTENT.paths[GOALS.includes(goal) ? goal : 'healthy'];
  const swap = (mode === 'advanced' && CONTENT.modeSwap.advanced) || {};
  return base.map((id) => swap[id] || id).filter((id) => CONTENT.steps[id]).slice(0, 5);
}

/** Goal from what the profile already knows: a target below the current weight = lose, above = build, equal = healthy. '' when unknown (then we ask). */
function goalFromProfile(profile) {
  const g = (profile && profile.goals) || {};
  const cur = Number(profile && profile.currentWeightKg), tgt = Number(g.targetWeightKg);
  if (!(cur > 0) || !(tgt > 0)) return '';
  if (tgt < cur - 0.5) return 'lose';
  if (tgt > cur + 0.5) return 'build';
  return 'healthy';
}

const blank = () => ({ status: '', goal: '', mode: '', step: 0, stepsDone: [], events: [], never: false, checklistDismissed: false, coachmarksSeen: [], whatsNewSeen: [], startedAt: '', completedAt: '', stickerAt: '', version: CONTENT.version });

/** Clean stored tour data into the shape the apps expect. */
function normalise(raw) {
  const t = { ...blank(), ...(raw || {}) };
  const out = blank();
  out.status = STATUSES.includes(t.status) ? t.status : '';
  out.goal = GOALS.includes(t.goal) ? t.goal : '';
  out.mode = MODES.includes(t.mode) ? t.mode : '';
  out.step = Number.isInteger(t.step) && t.step >= 0 && t.step < 5 ? t.step : 0;
  out.stepsDone = onlyKnown(t.stepsDone, STEP_IDS);
  out.events = onlyKnown(t.events, ACTIONS);
  out.never = !!t.never;
  out.checklistDismissed = !!t.checklistDismissed;
  out.coachmarksSeen = onlyKnown(t.coachmarksSeen, HINT_IDS);
  out.whatsNewSeen = onlyKnown(t.whatsNewSeen, NEW_IDS);
  for (const k of ['startedAt', 'completedAt', 'stickerAt']) out[k] = typeof t[k] === 'string' ? t[k].slice(0, 40) : '';
  out.version = CONTENT.version;
  return out;
}

/** Apply a client patch. Only known fields and known ids pass; lists only grow (a hint stays seen); the sticker can never be set by a client. */
function applyPatch(tour, patch, nowIso) {
  const t = normalise(tour), p = patch && typeof patch === 'object' ? patch : {};
  if (STATUSES.includes(p.status) && p.status) {
    t.status = p.status;
    if (p.status === 'active' && !t.startedAt) t.startedAt = nowIso;
    if ((p.status === 'done' || p.status === 'skipped') && !t.completedAt) t.completedAt = nowIso;
  }
  if (GOALS.includes(p.goal)) t.goal = p.goal;
  if (MODES.includes(p.mode)) t.mode = p.mode;
  if (Number.isInteger(p.step) && p.step >= 0 && p.step < 5) t.step = p.step;
  if (typeof p.never === 'boolean') t.never = p.never;
  if (typeof p.checklistDismissed === 'boolean') t.checklistDismissed = p.checklistDismissed;
  t.stepsDone = uniq([...t.stepsDone, ...onlyKnown(p.stepsDone, STEP_IDS)]);
  t.coachmarksSeen = uniq([...t.coachmarksSeen, ...onlyKnown(p.coachmarksSeen, HINT_IDS)]);
  t.whatsNewSeen = uniq([...t.whatsNewSeen, ...onlyKnown(p.whatsNewSeen, NEW_IDS)]);
  return t;
}

/** A real action happened (water logged, ...). Marks that action and every step that waits for it. Unknown actions are ignored. */
function applyEvent(tour, action) {
  const t = normalise(tour);
  if (!ACTIONS.includes(action)) return t;
  t.events = uniq([...t.events, action]);
  for (const [id, s] of Object.entries(CONTENT.steps)) if (s.action === action) t.stepsDone = uniq([...t.stepsDone, id]);
  return t;
}

const COUNT_FOR = { food_logged: 'food', water_logged: 'water', weight_logged: 'weight', plan_created: 'plan', activity_logged: 'activity' };

/** The "Your first week" list. An item is done when its action was reported, or the person's data (made since the tour began) shows it. */
function checklistFrom({ tour, counts, coachChosen }) {
  const t = normalise(tour), c = counts || {};
  const items = CONTENT.checklist.items.map((i) => {
    const key = COUNT_FOR[i.action];
    const done = t.events.includes(i.action) || (key ? Number(c[key]) > 0 : false) || (i.action === 'coach_opened' && !!coachChosen);
    return { id: i.id, label: i.label, done };
  });
  const doneCount = items.filter((i) => i.done).length;
  return { title: CONTENT.checklist.title, items, doneCount, total: items.length, complete: doneCount === items.length };
}

/** Finishing the tour (or the checklist) unlocks the Rookie sticker and journey step once. Returns the new state and whether it was just unlocked. */
function reward(tour, nowIso) {
  const t = normalise(tour);
  const first = !t.stickerAt;
  if (first) t.stickerAt = nowIso;
  return { tour: t, unlocked: first };
}

/** Which What's-new hotspots are live today and not yet seen. */
function whatsNewFor(tour, today) {
  const seen = normalise(tour).whatsNewSeen;
  return CONTENT.whatsNew.filter((w) => !seen.includes(w.id) && (!w.from || today >= w.from) && (!w.until || today <= w.until));
}

/** Words in a piece of copy, for the 20-word rule. */
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

module.exports = { CONTENT, GOALS, STEP_IDS, ACTIONS, HINT_IDS, NEW_IDS, pathFor, goalFromProfile, blank, normalise, applyPatch, applyEvent, checklistFrom, reward, whatsNewFor, words };
