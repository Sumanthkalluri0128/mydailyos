// Flow test for the weekly coach: auto-adjust, changelog, undo, and the 14-day pause. The database layer is replaced by small in-memory
// fakes, so this runs without MongoDB (and without express / mongoose installed): any module that cannot be found is stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// ---- stub whatever is not installed (express, mongoose, jsonwebtoken ...) so route files can be loaded
const stub = new Proxy(function stubFn() {}, { get: (t, k) => (Object.prototype.hasOwnProperty.call(t, k) ? t[k] : k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub), apply: () => stub, construct: () => stub });
const STUB_ID = path.join(__dirname, '__stub__.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, ...rest) {
  try { return origResolve.call(this, request, ...rest); } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !request.startsWith('/')) { require.cache[STUB_ID] = { id: STUB_ID, filename: STUB_ID, loaded: true, exports: stub }; return STUB_ID; }
    throw err;
  }
};

const E = require('../lib/energy');
const { addDays } = require('../lib/dates');
const DB = { state: null, profile: null, days: [] };
// every database / network call takes a real round trip (a macrotask), so concurrent requests interleave like they do in production
let OPS = 0;                                        // every fake database call counts as one operation (the free MongoDB tier is limited by operations)
const io = () => { OPS += 1; return new Promise((r) => setImmediate(r)); };
const chain = (rows = []) => { const c = { select: () => c, sort: () => c, limit: () => c, lean: async () => { OPS += 1; return rows; }, then: undefined }; return c; };
const inject = (rel, exports) => { const f = require.resolve(rel); require.cache[f] = { id: f, filename: f, loaded: true, exports }; };
const setPath = (obj, dotted, val) => { const parts = dotted.split('.'); let o = obj; parts.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); o[parts[parts.length - 1]] = val; };

class FakeState {
  constructor(init = {}) { Object.assign(this, { weekly: null, changelog: [], autoUndo: null, dietBreak: { kind: '', from: '', to: '' } }, init); }
  markModified() {}
  async save() { await io(); DB.state = this; }
  // like a real database: every request gets its OWN copy, and the last save wins (this is what makes concurrent requests race)
  static async findOne() { await io(); return DB.state ? new FakeState(JSON.parse(JSON.stringify(DB.state))) : null; }
  static async updateOne(f, upd) { await io(); if (DB.state && DB.state.weekly) for (const [k, v] of Object.entries(upd.$set || {})) if (k === 'weekly.dirty') DB.state.weekly.dirty = v; return {}; }
}
const FakeProfile = {
  findOne: () => { const o = { select: () => o, lean: async () => { await io(); return JSON.parse(JSON.stringify(DB.profile)); } }; return o; },
  findOneAndUpdate: async (f, upd) => { await io(); for (const [k, v] of Object.entries(upd.$set || {})) setPath(DB.profile, k, v); return JSON.parse(JSON.stringify(DB.profile)); },
};
inject('../models/CoachState', FakeState);
inject('../models/Profile', FakeProfile);
DB.foodRows = []; DB.readiness = []; DB.waists = []; DB.weighDates = []; DB.sessions = [];
const one = (row) => ({ select: () => one(row), lean: async () => { OPS += 1; return row; } });
inject('../models/BodyPlanSession', { find: () => chain(DB.sessions), findOne: () => one(null) });
inject('../models/ActivityLog', { find: () => chain([]) });
inject('../models/Readiness', { find: () => chain(DB.readiness), findOne: () => one(DB.readiness.find((r) => r.date === TODAY) || null) });
inject('../models/HealthLog', { find: () => chain(DB.waists) });
inject('../models/WeightLog', { find: () => chain([]), distinct: async () => { OPS += 1; return DB.weighDates; } });
inject('../models/FoodLog', { find: () => chain(DB.foodRows), findOne: () => one(null), distinct: async () => { OPS += 1; return [...new Set(DB.foodRows.map((r) => r.date))]; } });
// a database-style lease: a second owner is refused (E11000) until the first lets go, exactly like the unique index in models/CoachLock.js
const LOCKS = new Map();
inject('../models/CoachLock', {
  async findOneAndUpdate(f, upd) { await io(); const k = String(f.userId); const cur = LOCKS.get(k); const who = upd.$set.owner;
    if (cur && cur.until > Date.now() && cur.owner !== who) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
    LOCKS.set(k, { owner: who, until: upd.$set.until.getTime() }); return {}; },
  async deleteOne(f) { await io(); const cur = LOCKS.get(String(f.userId)); if (cur && cur.owner === f.owner) LOCKS.delete(String(f.userId)); return {}; },
});
inject('../routes/bodyPlanRoutes', { build: async () => ({ plan: { adapt: null } }) });
inject('../lib/dailyCoachData', { loadDaily: async () => { await io(); return { profile: DB.profile, days: DB.days, strengthDates: new Set(), proteinTarget: 130, diet: 'vegetarian', weights: [], sleep: {} }; }, refreshAutoActivity: async () => DB.profile, strengthDatesIn: async () => new Set() });
const routes = require('../routes/coachRoutes');

const START = '2026-01-05', TODAY = addDays(START, 34);
const mkProfile = (auto) => ({ _id: 'p1', age: 26, sex: 'male', heightCm: 173, currentWeightKg: 79, activityLevel: 'moderate', activityMode: 'manual', training: { weekdays: [0, 1, 2, 4, 5] },
  goals: { targetWeightKg: 69, weeklyPaceKg: 0.65, stepsTarget: 10000, calorieMode: 'auto', calorieTarget: 1800, coachAuto: auto } });
const flatDays = (p) => { const t = E.expectedEnergy(p).calorieTarget; return Array.from({ length: 35 }, (_, i) => ({ date: addDays(START, i), calories: t, protein: 140, steps: 10000, exerciseMinutes: 60, caloriesBurned: 350, weightKg: 79, weighIn: true })); };
const fresh = (auto) => { DB.profile = mkProfile(auto); DB.days = flatDays(DB.profile); DB.state = null; };

test('safe auto-adjust applies a small change, logs it, and can be undone', async () => {
  fresh('safe');
  const { decision } = await routes.weeklyView('u1', TODAY);
  assert.equal(decision.action, 'LADDER_STEPS');
  assert.equal(decision.applied, true);
  assert.equal(decision.auto, true);
  assert.equal(DB.profile.goals.stepsTarget, 11500);
  assert.equal(DB.state.changelog.length, 1);
  assert.equal(DB.state.changelog[0].auto, true);
  assert.match(DB.state.changelog[0].change, /10,000 to 11,500/);
  assert.equal(DB.state.weekly.lastChangeKind, 'steps');

  const st = DB.state;
  await routes.undoLast({ uid: 'u1', st, today: TODAY });
  await st.save();
  assert.equal(DB.profile.goals.stepsTarget, 10000);
  assert.equal(DB.state.changelog[0].undone, true);
  assert.equal(DB.state.autoUndo, null);
  assert.equal(DB.state.weekly.undoneOn, TODAY);

  // the coach does not fight the person: the same suggestion comes back, but waits for a tap
  const again = await routes.weeklyView('u1', TODAY);
  assert.equal(again.decision.apply && again.decision.apply.type, 'steps');
  assert.equal(again.decision.applied, false);
  assert.equal(DB.profile.goals.stepsTarget, 10000);
});

test('without auto-adjust nothing changes until the person taps apply; then it is logged and undoable', async () => {
  fresh('off');
  const { decision, st } = await routes.weeklyView('u1', TODAY);
  assert.equal(decision.applied, false);
  assert.equal(DB.profile.goals.stepsTarget, 10000);
  await routes.applyDecision({ uid: 'u1', st, today: TODAY, auto: false });
  await st.save();
  assert.equal(DB.profile.goals.stepsTarget, 11500);
  assert.equal(DB.state.changelog[0].auto, false);
  assert.equal(DB.state.autoUndo.auto, false);
  await assert.rejects(() => routes.applyDecision({ uid: 'u1', st: DB.state, today: TODAY }), /Nothing to apply/);   // never twice
});

test('undo with nothing to undo is refused, and a refused automatic change stays a suggestion', async () => {
  fresh('off');
  await assert.rejects(() => routes.undoLast({ uid: 'u1', st: new FakeState(), today: TODAY }), /Nothing to undo/);
  fresh('safe');
  DB.profile.goals.calorieFloor = 3000;           // an apply that would break the floor must not slip through; steps are unaffected, so force a pace case below
  const r = await routes.weeklyView('u1', TODAY);
  assert.ok(r.decision);                           // never throws into the screen
});

test('the hub: one next action, today plan, weak-meal advice, rest-of-day plan and measurement prompts', async () => {
  fresh('off');
  DB.foodRows = [];
  for (let i = 1; i <= 8; i += 1) { const date = addDays(TODAY, -i); DB.foodRows.push({ date, mealType: 'breakfast', nutritionTotal: { protein: 7, calories: 300 } }, { date, mealType: 'lunch', nutritionTotal: { protein: 40, calories: 600 } }, { date, mealType: 'dinner', nutritionTotal: { protein: 40, calories: 600 } }); }
  DB.foodRows.push({ date: TODAY, mealType: 'breakfast', nutritionTotal: { protein: 10, calories: 350 } });
  DB.days[DB.days.length - 1].calories = 350;
  const h = await routes.buildHub('u1', TODAY, 13);
  assert.equal(h.success, true);
  assert.equal(h.nextAction.kind, 'decision');                         // the weekly change waits for a tap before anything else
  assert.ok(h.dayPlan && h.dayPlan.proteinG > 0);
  const weak = h.advisories.find((a) => a.id === 'weak-meal');
  assert.ok(weak && /breakfast/.test(weak.title) && !/chicken|egg/i.test(weak.detail));
  assert.ok(h.restOfDay && h.restOfDay.plan.some((p) => p.slot === 'lunch') && h.restOfDay.plan.every((p) => p.slot !== 'breakfast'));
  assert.ok(h.prompts.some((p) => p.id === 'waist'));
  assert.equal(h.auto, 'off');
  assert.equal(h.restOfDay && (await routes.buildHub('u1', TODAY)).restOfDay, null);   // no hour given: no rest-of-day plan
});

test('two screens asking at (almost) the same moment never apply the same change twice, and undo still restores the real original', async () => {
  const tick = () => new Promise((r) => setImmediate(r));
  for (let stagger = 0; stagger <= 14; stagger += 1) {                 // the second request arrives at every possible point of the first
    fresh('safe');
    const a = routes.weeklyView('u1', TODAY);
    for (let k = 0; k < stagger; k += 1) await tick();
    const b = routes.buildHub('u1', TODAY, 9);
    await Promise.all([a, b]);
    assert.equal(DB.profile.goals.stepsTarget, 11500, `stagger ${stagger}`);
    assert.equal(DB.state.changelog.length, 1, `stagger ${stagger}: one change, one log line`);
    await routes.undoLast({ uid: 'u1', st: DB.state, today: TODAY });
    assert.equal(DB.profile.goals.stepsTarget, 10000, `stagger ${stagger}: undo goes back to the real original`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Gaps closed in v68: early re-check, one lock across instances, a light Home endpoint, "behind plan" offers, cycle pause.
const lowRecovery = (n = 4) => Array.from({ length: n }, (_, i) => ({ date: addDays(TODAY, -i), sleepHours: 4.5, energy: 1, soreness: 5, stress: 5 }));

test('a new low-recovery pattern re-checks the cached decision early, without counting the slow week twice', async () => {
  fresh('off'); DB.readiness = []; DB.waists = []; DB.sessions = [];
  const first = await routes.weeklyView('u1', TODAY);
  assert.equal(first.cached, false);
  assert.equal(first.decision.action, 'LADDER_STEPS');
  const slow = DB.state.weekly.slowWeeks, reviewed = DB.state.weekly.lastReview;
  assert.equal(first.decision.refreshReason, '');
  assert.match(first.decision.id, /^LADDER_STEPS:[0-9a-f]{8}$/);

  // nothing changed: the second open is cached and makes no new decision
  const again = await routes.weeklyView('u1', TODAY);
  assert.equal(again.cached, true);

  // four rough check-ins arrive (the readiness route also marks the coach dirty), two days later
  const later = addDays(TODAY, 2);
  DB.readiness = lowRecovery(4).map((r, i) => ({ ...r, date: addDays(later, -i) }));
  await FakeState.updateOne({}, { $set: { 'weekly.dirty': true } });
  const re = await routes.weeklyView('u1', later);
  assert.equal(re.cached, false, 'it was re-checked, not served from the cache');
  assert.equal(re.decision.refreshReason, 'recovery-low');
  assert.equal(re.decision.refreshedFrom, 'LADDER_STEPS');
  assert.equal(DB.state.weekly.slowWeeks, slow, 'the slow week was counted once: a re-check starts from the state BEFORE the review');
  assert.equal(DB.state.weekly.lastReview, reviewed, 'the 7-day review clock is not restarted');
  assert.equal(DB.state.weekly.refreshedOn, later);

  // and only once a day
  DB.readiness = [];                                                   // recovery "ends" the same day: it waits until tomorrow
  await FakeState.updateOne({}, { $set: { 'weekly.dirty': true } });
  assert.equal((await routes.weeklyView('u1', later)).cached, true);
  const next = await routes.weeklyView('u1', addDays(later, 1));
  assert.equal(next.decision.refreshReason, 'recovery-back');
});

test('a decision that was applied is never re-checked, and the cheap read is skipped when nothing was written', async () => {
  fresh('safe'); DB.readiness = [];
  const first = await routes.weeklyView('u1', TODAY);
  assert.equal(first.decision.applied, true);
  DB.readiness = lowRecovery(4);
  await FakeState.updateOne({}, { $set: { 'weekly.dirty': true } });
  const r = await routes.weeklyView('u1', TODAY);
  assert.equal(r.cached, true);
  assert.equal(r.decision.applied, true);
  assert.equal(DB.profile.goals.stepsTarget, 11500);                   // still one change
  DB.readiness = [];
});

test('two server instances (no in-process queue at all) still apply one change, once', async () => {
  routes.__setProcessLock(false);
  try {
    for (let stagger = 0; stagger <= 10; stagger += 1) {
      fresh('safe'); LOCKS.clear();
      const a = routes.weeklyView('u1', TODAY);
      for (let k = 0; k < stagger; k += 1) await new Promise((r) => setImmediate(r));
      const b = routes.weeklyView('u1', TODAY);
      await Promise.all([a, b]);
      assert.equal(DB.profile.goals.stepsTarget, 11500, `stagger ${stagger}`);
      assert.equal(DB.state.changelog.length, 1, `stagger ${stagger}: one change, one log line`);
      assert.equal(LOCKS.size, 0, 'the lease is released');
    }
  } finally { routes.__setProcessLock(true); }
});

test('Home\'s light endpoint: one next step and the pending Apply, without building the gym plan', async () => {
  fresh('off'); DB.readiness = [];
  let built = 0; inject('../routes/bodyPlanRoutes', { build: async () => { built += 1; return { plan: { adapt: null } }; } });
  const n = await routes.buildNext('u1', TODAY);
  assert.equal(n.success, true);
  assert.equal(n.nextAction.kind, 'decision');
  assert.equal(n.apply.apply.type, 'steps');
  assert.match(n.apply.decisionId, /^LADDER_STEPS:/);
  assert.equal(built, 0, 'no gym plan was built for one line of text');
  // after the change is applied, the next step moves on to the check-in
  await routes.applyDecision({ uid: 'u1', st: DB.state, today: TODAY, auto: false }); await DB.state.save();
  const n2 = await routes.buildNext('u1', TODAY);
  assert.equal(n2.apply, null); assert.equal(n2.nextAction.kind, 'checkin');
});

test('a queued Apply tap only applies the suggestion the person saw', async () => {
  fresh('off');
  const { decision, st } = await routes.weeklyView('u1', TODAY);
  assert.doesNotThrow(() => routes.assertSameDecision(st, decision.id));
  assert.doesNotThrow(() => routes.assertSameDecision(st, undefined));          // older apps send no id: still allowed
  assert.throws(() => routes.assertSameDecision(st, 'LADDER_STEPS:deadbeef'), /suggestion has changed/);
});

const planned = (byDate = addDays(TODAY, 40)) => ({ active: true, startKg: 79, startDate: START, targetKg: 69, byDate, paceKg: 0.65 });
test('"behind plan": the offer appears in the hub, applies with one tap, keeps the plan in step, and undo puts the date back', async () => {
  fresh('off');
  DB.profile.plan = planned();
  DB.days = DB.days.map((d, i) => ({ ...d, weightKg: 79 - i * 0.02 }));      // a trend far slower than the plan
  const { st, decision } = await routes.weeklyView('u1', TODAY);
  // the weekly step waits for a tap: while it does, the coach shows ONE change only
  assert.equal(routes.offerFor({ profile: DB.profile, st, decision, today: TODAY }), null);
  await routes.applyDecision({ uid: 'u1', st, today: TODAY, auto: false }); await st.save();
  // right after a change the coach waits to see its effect
  assert.equal(routes.offerFor({ profile: DB.profile, st: DB.state, decision: DB.state.weekly.decision, today: TODAY }), null);
  // ten days later, still behind: now it offers
  const later = addDays(TODAY, 11);
  const stNow = DB.state;
  const offer = routes.offerFor({ profile: DB.profile, st: stNow, decision: { ...stNow.weekly.decision, applied: true, forecast: { direction: 'lose', remainingKg: 9.5, atCurrent: { weeks: 40, date: addDays(later, 280) }, atPlan: { weeks: 15, date: addDays(later, 105) } }, metrics: { adherence: 0.9 } }, today: later });
  assert.ok(offer && offer.date, 'a date offer');
  assert.ok(offer.date.key && offer.date.apply.byDate > DB.profile.plan.byDate);

  // apply the date change and undo it
  const dec = { action: 'TARGET_DATE', headline: 'Move your target date', apply: offer.date.apply, metrics: {} };
  await routes.applyChange({ uid: 'u1', st: DB.state, today: later, dec, auto: false, keepDecision: true }); await DB.state.save();
  assert.equal(DB.profile.plan.byDate, offer.date.apply.byDate);
  assert.equal(DB.state.changelog[0].action, 'TARGET_DATE');
  assert.match(DB.state.changelog[0].change, /^Target date /);
  await routes.undoLast({ uid: 'u1', st: DB.state, today: later }); await DB.state.save();
  assert.equal(DB.profile.plan.byDate, planned().byDate, 'the date is back');
  assert.ok(DB.state.weekly.decision, 'undoing an offer keeps the weekly decision on screen');
});

test('a target-date change needs a goal plan and a future date; an unrelated undo never touches the plan date', async () => {
  fresh('off'); DB.profile.plan = { active: false };
  await assert.rejects(() => routes.applyChange({ uid: 'u1', st: new FakeState(), today: TODAY, dec: { action: 'TARGET_DATE', headline: 'x', apply: { type: 'targetDate', byDate: addDays(TODAY, 90) }, metrics: {} } }), /goal plan/);
  DB.profile.plan = planned();
  await assert.rejects(() => routes.applyChange({ uid: 'u1', st: new FakeState(), today: TODAY, dec: { action: 'TARGET_DATE', headline: 'x', apply: { type: 'targetDate', byDate: addDays(TODAY, -1) }, metrics: {} } }), /future/);
  // a steps change, then the person edits their own date, then undoes the steps change: their date stays
  const st = new FakeState({ weekly: { decision: { action: 'LADDER_STEPS', apply: { type: 'steps', stepsTarget: 11500, from: 10000 } } } });
  await routes.applyChange({ uid: 'u1', st, today: TODAY, dec: st.weekly.decision, auto: false }); await st.save();
  DB.profile.plan.byDate = addDays(TODAY, 120);
  await routes.undoLast({ uid: 'u1', st: DB.state, today: TODAY });
  assert.equal(DB.profile.plan.byDate, addDays(TODAY, 120));
  assert.equal(DB.profile.goals.stepsTarget, 10000);
});

test('the cycle log pauses stall detection once, only while the water window explains it', async () => {
  fresh('off'); DB.readiness = [];
  const starts = [addDays(TODAY, -28 - 12), addDays(TODAY, -12)];            // today is day 13 of a 28-day cycle: well clear of the water window
  DB.state = new FakeState({ cycle: { enabled: true, starts, length: null } });
  assert.notEqual((await routes.weeklyView('u1', TODAY)).decision.action, 'WAIT_CYCLE');

  fresh('off');
  const inWindow = [addDays(TODAY, -28 - 22), addDays(TODAY, -22)];          // day 23 -> 24: the week before the next period
  DB.state = new FakeState({ cycle: { enabled: true, starts: inWindow, length: null } });
  const r = await routes.weeklyView('u1', TODAY);
  assert.equal(r.decision.action, 'WAIT_CYCLE');
  assert.equal(r.decision.apply, null);
  assert.equal(DB.state.weekly.cycleWaitedOn, TODAY);
  // a week later it is not allowed to wait again in the same cycle
  const wk = await routes.weeklyView('u1', addDays(TODAY, 7));
  assert.notEqual(wk.decision.action, 'WAIT_CYCLE');

  // off by default: the same data without the switch is not used
  fresh('off'); DB.state = new FakeState({ cycle: { enabled: false, starts: inWindow, length: null } });
  assert.notEqual((await routes.weeklyView('u1', TODAY)).decision.action, 'WAIT_CYCLE');
});

test('the hub carries the offer slot and the cycle summary, and never shows cycle data that is switched off', async () => {
  fresh('off'); DB.readiness = [];
  const h = await routes.buildHub('u1', TODAY, 9);
  assert.equal(h.cycle.enabled, false);
  assert.equal(Object.keys(h.cycle).length, 1);
  assert.ok('offer' in h);
  assert.equal(h.showCycle, false);                                         // the fixture is a man: the cycle card is not offered
  DB.profile.sex = 'female';
  assert.equal((await routes.buildHub('u1', TODAY, 9)).showCycle, true);
});

// The free MongoDB tier is limited by operations per second, so the common calls have a budget. These numbers must only ever go DOWN.
test('database budget: a settled weekly view is one read and takes no lock; Home\'s next step is one read when a change is waiting', async () => {
  fresh('off'); DB.readiness = [];
  const used = async (fn) => { const a = OPS; await fn(); return OPS - a; };
  await routes.weeklyView('u1', TODAY);                                   // the one real computation of the week
  LOCKS.clear(); let leases = 0; const orig = LOCKS.set.bind(LOCKS); LOCKS.set = (...a) => { leases += 1; return orig(...a); };
  assert.equal(await used(() => routes.weeklyView('u1', TODAY)), 1);
  assert.equal(await used(() => routes.weeklyView('u1', TODAY)), 1);
  assert.equal(leases, 0, 'no database lease was taken for a cached answer');
  assert.equal(await used(() => routes.buildNext('u1', TODAY)), 1, 'a pending change is the whole answer: nothing else is read');
  LOCKS.set = orig;
});

test('database budget: simultaneous identical requests share one answer, and a repeated check-in flag is not written again', async () => {
  fresh('off'); DB.readiness = [];
  await routes.weeklyView('u1', TODAY);
  await routes.applyDecision({ uid: 'u1', st: DB.state, today: TODAY, auto: false }); await DB.state.save();   // nothing pending now: /next reads a little more
  const used = async (fn) => { const a = OPS; const r = await fn(); return [OPS - a, r]; };
  const [one] = await used(() => routes.buildNext('u1', TODAY));
  assert.ok(one <= 5, `next step costs at most 5 reads when nothing is pending (was ${one})`);
  const [both, rs] = await used(() => Promise.all([1, 2, 3].map(() => routes.coalesce('next:u1', () => routes.buildNext('u1', TODAY)))));
  assert.ok(both <= one, `three callers at once cost the same as one (${both} vs ${one})`);
  assert.equal(rs[0].nextAction.kind, rs[2].nextAction.kind);
  const { markCoachDirty } = require('../lib/coachDirty');
  const seen = []; const fake = { updateOne: async (f) => { seen.push(f); } };
  await markCoachDirty(fake, 'u1'); await markCoachDirty(fake, 'u1');
  assert.equal(seen[0]['weekly.dirty'].$ne, true, 'the filter itself skips documents that are already flagged: a no-op, not a write');
});

test('a ladder pace change keeps the goal plan pace in step, and undo puts both back', async () => {
  fresh('off');
  DB.profile.plan = { active: true, startKg: 79, startDate: START, targetKg: 69, byDate: addDays(TODAY, 90), paceKg: 0.5 };
  DB.profile.goals.weeklyPaceKg = 0.5;
  const st = new FakeState({ weekly: { decision: { action: 'LADDER_CUT', apply: { type: 'pace', weeklyPaceKg: 0.6, from: 0.5, calorieTarget: 2000 } } } });
  await routes.applyChange({ uid: 'u1', st, today: TODAY, dec: st.weekly.decision, auto: false }); await st.save();
  assert.equal(DB.profile.goals.weeklyPaceKg, 0.6);
  assert.equal(DB.profile.plan.paceKg, 0.6);
  await routes.undoLast({ uid: 'u1', st: DB.state, today: TODAY });
  assert.equal(DB.profile.goals.weeklyPaceKg, 0.5); assert.equal(DB.profile.plan.paceKg, 0.5);
});

test('Home and the Coach page agree about a workout today: the page saves its answer, Home reuses it', async () => {
  fresh('off'); DB.readiness = [];
  await routes.weeklyView('u1', TODAY);
  await routes.applyDecision({ uid: 'u1', st: DB.state, today: TODAY, auto: false }); await DB.state.save();
  DB.profile.training = { weekdays: [] };                                   // the weekday guess would say "rest"
  DB.state.gymToday = { date: TODAY, kind: 'train' }; await DB.state.save();
  const n = await routes.buildNext('u1', TODAY);
  assert.equal(n.nextAction.kind === 'checkin' || n.nextAction.kind === 'train', true);
  DB.readiness = [{ date: TODAY, sleepHours: 7.5, energy: 4, soreness: 2, stress: 2 }];
  assert.equal((await routes.buildNext('u1', TODAY)).nextAction.kind, 'train', 'the saved plan answer wins over the weekday guess');
  DB.readiness = [];
});

test('body progress: every card is present or honestly empty, and it is only read when asked for', async () => {
  fresh('off'); DB.readiness = [];
  await routes.weeklyView('u1', TODAY);
  const a = OPS;
  const b = await routes.buildBody('u1', TODAY);
  assert.equal(b.success, true); assert.equal(b.hasGoal, true);
  for (const k of ['fatLean', 'recomp', 'ratios', 'maintenance', 'loggingGap', 'activityDrop', 'pace', 'taper', 'plateau', 'fatigue', 'realism', 'maintenancePhase', 'scenarios', 'leaks', 'nutrition', 'learned', 'measure']) assert.ok(k in b, `${k} is in the answer`);
  assert.equal(b.fatLean.ready, false, 'no tape measurements: no fat/lean claim');
  assert.equal(b.ratios, null);
  assert.equal(b.maintenance.ready, true); assert.ok(b.maintenance.low < b.maintenance.high);
  assert.ok(b.realism && b.realism.milestones.length >= 3);
  assert.ok(b.scenarios.rows.length === 4);
  assert.ok(OPS - a < 40, `body progress stays within a sane read budget (${OPS - a})`);
});

test('body progress reads the tape: with waist and neck on record it separates fat from muscle', async () => {
  fresh('off');
  DB.waists = [{ date: addDays(TODAY, -35), type: 'waist', value: 96 }, { date: TODAY, type: 'waist', value: 91 }, { date: addDays(TODAY, -35), type: 'neck', value: 38 }, { date: TODAY, type: 'neck', value: 38 }];
  const b = await routes.buildBody('u1', TODAY);
  DB.waists = [];
  assert.ok(b.ratios && b.ratios.whtr > 0.5, 'waist-to-height from the latest waist');
  assert.ok(b.measure && b.measure.missing.includes('hips'), 'asks for the measurements that are missing');
});

test('the "ease your pace for the finish" offer: only near the goal, one tap, and undoable', async () => {
  fresh('off');
  DB.profile.currentWeightKg = 71; DB.profile.goals.targetWeightKg = 69;
  const st = new FakeState({});
  const decision = { action: 'ON_TRACK', apply: null, applied: false, forecast: { direction: 'lose', remainingKg: 2, atCurrent: null, atPlan: null }, metrics: {} };
  const t = routes.taperFor({ profile: DB.profile, st, decision, today: TODAY });
  assert.ok(t && t.pace < 0.65 && t.kcalMore > 0, 'a gentler pace means MORE food');
  assert.equal(t.apply.type, 'pace'); assert.ok(t.key.startsWith('taper:'));
  assert.equal(routes.taperFor({ profile: DB.profile, st, decision: { ...decision, forecast: { ...decision.forecast, remainingKg: 12 } }, today: TODAY }), null, 'far from the goal: no easing');
  assert.equal(routes.taperFor({ profile: DB.profile, st, decision: { ...decision, apply: { type: 'steps' } }, today: TODAY }), null, 'one change at a time');
  await routes.applyChange({ uid: 'u1', st, today: TODAY, dec: { action: 'EASE_PACE', headline: 'Ease', apply: t.apply, metrics: {} }, auto: false, keepDecision: true }); await st.save();
  assert.equal(DB.profile.goals.weeklyPaceKg, t.pace);
  await routes.undoLast({ uid: 'u1', st: DB.state, today: TODAY });
  assert.equal(DB.profile.goals.weeklyPaceKg, 0.65);
});
