const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const T = require('../lib/tour');
const C = T.CONTENT;

const allCopy = () => {
  const out = [];
  for (const [id, s] of Object.entries(C.steps)) {
    for (const k of ['say', 'done']) if (s[k]) for (const [tone, txt] of Object.entries(s[k])) out.push([`${id}.${k}.${tone}`, txt]);
    if (s.empty) out.push([`${id}.empty`, s.empty]);
  }
  for (const [screen, hs] of Object.entries(C.coachmarks)) hs.forEach((h) => out.push([h.id, h.text]));
  C.whatsNew.forEach((w) => out.push([w.id, w.text]));
  C.welcome.forEach((w) => { out.push([`${w.id}.body`, w.body]); if (w.knownBody) out.push([`${w.id}.known`, w.knownBody]); });
  for (const [tone, txt] of Object.entries(C.reward.line)) out.push([`reward.${tone}`, txt]);
  return out;
};

test('every piece of copy is at most 20 words', () => {
  for (const [id, txt] of allCopy()) assert.ok(T.words(txt) <= C.maxWords, `${id}: ${T.words(txt)} words`);
});

test('every step has all three tones and a known route/kind', () => {
  for (const [id, s] of Object.entries(C.steps)) {
    for (const tone of ['cheer', 'calm', 'strict']) assert.ok(s.say[tone], `${id} say ${tone}`);
    assert.ok(['do', 'look'].includes(s.kind));
    if (s.kind === 'do') { assert.ok(s.action, `${id} needs an action`); for (const tone of ['cheer', 'calm', 'strict']) assert.ok(s.done[tone]); }
  }
});

test('paths: at most 5 steps, all known, change with the goal', () => {
  for (const g of T.GOALS) { const p = T.pathFor(g); assert.ok(p.length <= 5 && p.length >= 3); p.forEach((id) => assert.ok(C.steps[id])); }
  assert.notDeepEqual(T.pathFor('lose'), T.pathFor('build'));
  assert.ok(T.pathFor('build').includes('workout'));
  assert.ok(T.pathFor('lose').includes('weight'));
  assert.deepEqual(T.pathFor('nonsense'), T.pathFor('healthy'));
  assert.ok(T.pathFor('lose', 'advanced').includes('progress'));
  assert.ok(!T.pathFor('lose', 'simple').includes('progress'));
});

test('goalFromProfile reuses onboarding data and says unknown when it cannot know', () => {
  assert.equal(T.goalFromProfile({ currentWeightKg: 80, goals: { targetWeightKg: 72 } }), 'lose');
  assert.equal(T.goalFromProfile({ currentWeightKg: 60, goals: { targetWeightKg: 66 } }), 'build');
  assert.equal(T.goalFromProfile({ currentWeightKg: 70, goals: { targetWeightKg: 70.2 } }), 'healthy');
  assert.equal(T.goalFromProfile({ currentWeightKg: 70, goals: {} }), '');
  assert.equal(T.goalFromProfile(null), '');
});

test('the three content copies are identical (web client, server, mobile if present)', () => {
  const a = fs.readFileSync(path.join(__dirname, '../data/tourContent.json'), 'utf8');
  assert.equal(fs.readFileSync(path.join(__dirname, '../../client/src/tour/tourContent.json'), 'utf8'), a);
  const m = path.join(__dirname, '../../../m/src/utils/tourContent.json');
  if (fs.existsSync(m)) assert.equal(fs.readFileSync(m, 'utf8'), a);
});

test('normalise drops unknown ids and bad values', () => {
  const t = T.normalise({ status: 'weird', goal: 'x', step: 99, stepsDone: ['water', 'zzz'], events: ['water_logged', 'hack'], coachmarksSeen: ['log.1', 'no'], stickerAt: 5 });
  assert.equal(t.status, ''); assert.equal(t.goal, ''); assert.equal(t.step, 0);
  assert.deepEqual(t.stepsDone, ['water']); assert.deepEqual(t.events, ['water_logged']); assert.deepEqual(t.coachmarksSeen, ['log.1']); assert.equal(t.stickerAt, '');
});

test('applyPatch: resume, lists only grow, a client can never set the sticker', () => {
  let t = T.applyPatch(null, { status: 'active', goal: 'lose', step: 2, stepsDone: ['water', 'food'] }, '2026-10-22T10:00:00Z');
  assert.equal(t.status, 'active'); assert.equal(t.step, 2); assert.equal(t.startedAt, '2026-10-22T10:00:00Z');
  t = T.applyPatch(t, { stepsDone: ['weight'], coachmarksSeen: ['log.1'], stickerAt: 'x' }, 'later');
  assert.deepEqual(t.stepsDone, ['water', 'food', 'weight']); assert.equal(t.stickerAt, ''); assert.equal(t.startedAt, '2026-10-22T10:00:00Z');
  t = T.applyPatch(t, { coachmarksSeen: [] }, 'later');
  assert.deepEqual(t.coachmarksSeen, ['log.1'], 'a hint stays seen');
  t = T.applyPatch(t, { status: 'skipped', never: true }, 'z');
  assert.equal(t.status, 'skipped'); assert.equal(t.never, true); assert.equal(t.completedAt, 'z');
});

test('applyEvent marks the action and the step waiting for it; unknown actions are ignored', () => {
  let t = T.applyEvent(null, 'water_logged');
  assert.ok(t.events.includes('water_logged')); assert.ok(t.stepsDone.includes('water'));
  const same = T.applyEvent(t, 'drop_database');
  assert.deepEqual(same, t);
  assert.deepEqual(T.applyEvent(t, 'water_logged').stepsDone, ['water'], 'idempotent');
});

test('checklist: from events, from data made since the tour began, and from the coach choice', () => {
  const empty = T.checklistFrom({ tour: T.blank(), counts: {}, coachChosen: false });
  assert.equal(empty.total, 5); assert.equal(empty.doneCount, 0); assert.equal(empty.complete, false);
  const t = T.applyEvent(T.blank(), 'water_logged');
  const c = T.checklistFrom({ tour: t, counts: { food: 2, weight: 1 }, coachChosen: false });
  assert.deepEqual(c.items.filter((i) => i.done).map((i) => i.id).sort(), ['meal', 'water', 'weight']);
  const all = T.checklistFrom({ tour: t, counts: { food: 1, weight: 1, plan: 1 }, coachChosen: true });
  assert.equal(all.complete, true); assert.equal(all.doneCount, 5);
});

test('reward is given once', () => {
  const a = T.reward(T.blank(), '2026-10-22'); assert.equal(a.unlocked, true);
  const b = T.reward(a.tour, '2026-10-23'); assert.equal(b.unlocked, false); assert.equal(b.tour.stickerAt, '2026-10-22');
});

test("what's new: live between its dates, hidden once seen", () => {
  assert.deepEqual(T.whatsNewFor(T.blank(), '2026-10-22').map((w) => w.id), ['wn.sensei', 'wn.quests']);
  assert.deepEqual(T.whatsNewFor(T.blank(), '2028-01-01'), []);
  assert.deepEqual(T.whatsNewFor({ whatsNewSeen: ['wn.sensei'] }, '2026-10-22').map((w) => w.id), ['wn.quests']);
});
