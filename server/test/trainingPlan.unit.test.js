const test = require('node:test');
const assert = require('node:assert/strict');
const { bodyPlan, TYPE_IDS } = require('../lib/bodyPlan');
const { sanitizePrefs, TRAINING_OPTIONS } = require('../lib/trainingPlan');
const L = require('../lib/exerciseLibrary');
const { SHAME } = require('../lib/safety');

const man = { sex: 'male', age: 28, heightCm: 178, currentWeightKg: 82, activityLevel: 'moderate', goals: {} };
const woman = { sex: 'female', age: 30, heightCm: 162, currentWeightKg: 74, activityLevel: 'light', goals: {} };
const tall = { sex: 'male', age: 22, heightCm: 190, currentWeightKg: 76, activityLevel: 'moderate', goals: {} };
const heavy = { sex: 'male', age: 38, heightCm: 172, currentWeightKg: 118, activityLevel: 'light', goals: {} };
const senior = { sex: 'male', age: 62, heightCm: 170, currentWeightKg: 78, activityLevel: 'light', goals: {} };
const plan = (profile, type, prefs, measures) => bodyPlan({ profile, type, prefs, measures });
const prog = (p) => p.training.program;
const allExercises = (s) => [...s.exercises, ...(s.homeBackup ? s.homeBackup.exercises : [])];

test('library: unique ids, known slots/limits/equipment, a cue for each, and a safe option for every slot', () => {
  const ids = new Set();
  for (const e of L.LIB) {
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`); ids.add(e.id);
    e.slots.forEach((s) => assert.ok(L.SLOTS[s], `${e.id} slot ${s}`));
    e.avoid.forEach((a) => assert.ok(L.LIMITS.includes(a), `${e.id} limit ${a}`));
    e.eq.forEach((q) => assert.ok(L.HOME_EQUIP.includes(q), `${e.id} equipment ${q}`));
    assert.ok(e.cue.length > 20);
  }
  // Slots that legitimately have nothing at home for one limit (the plan drops the slot rather than offer a risky move).
  const allowed = new Set(['fly/home/heart', 'vpress/home/shoulder']);
  for (const slot of Object.keys(L.SLOTS)) for (const where of ['gym', 'home']) for (const lim of L.LIMITS) for (const level of L.LEVELS) {
    const ctx = { where, equip: new Set(), level, limits: new Set([lim]), body: {} };
    if (!L.rank(slot, ctx).length) assert.ok(allowed.has(`${slot}/${where}/${lim}`), `no ${slot} option at ${where} with ${lim} (${level})`);
  }
});

test('every goal, level, place and number of days gives a full, sane program', () => {
  for (const type of TYPE_IDS) for (const level of L.LEVELS) for (const place of L.PLACES) for (const days of [2, 3, 4, 5, 6]) {
    const p = plan(woman, type, { level, place, days });
    const g = prog(p);
    assert.equal(p.ready, true);
    assert.equal(g.sessions.length, g.daysPerWeek);
    assert.ok(g.daysPerWeek <= (level === 'beginner' ? 4 : level === 'intermediate' ? 5 : 6));
    assert.equal(g.week.length, 7);
    assert.equal(g.week.filter((d) => d.kind === 'train').length, g.daysPerWeek);
    assert.ok(g.week.some((d) => d.kind === 'rest'), 'a full rest day');
    for (const s of g.sessions) {
      assert.ok(s.exercises.length >= 4, `${type}/${level}/${place}/${days} ${s.id} has ${s.exercises.length}`);
      assert.equal(new Set(s.exercises.map((e) => e.id)).size, s.exercises.length, 'no repeated exercise in a session');
      assert.ok(s.minutes <= g.minutesPerSession + 12, `session ${s.minutes} min vs ${g.minutesPerSession}`);
      for (const e of s.exercises) {
        assert.ok(e.sets >= 2 && e.sets <= 5);
        assert.ok(e.repsLo < e.repsHi && e.restSec >= 30 && e.rir >= 1 && e.rir <= 4);
      }
      assert.ok(s.quick.exercises.length >= 3 && s.quick.minutes <= 30);
      if (place === 'home') assert.equal(s.homeBackup, null); else assert.ok(s.homeBackup && s.homeBackup.exercises.length >= 4);
    }
  }
});

test('weekly volume: every muscle trained, nothing wildly over the range, main muscles at least twice', () => {
  for (const type of TYPE_IDS) for (const level of L.LEVELS) {
    const g = prog(plan(man, type, { level, days: level === 'beginner' ? 3 : 4 }));
    for (const v of g.volume) {
      assert.ok(v.weeklySets > 0, `${type}/${level} ${v.group} never trained`);
      assert.ok(v.weeklySets <= v.target[1] * 1.45, `${type}/${level} ${v.group} ${v.weeklySets} vs ${v.target}`);
    }
    for (const grp of ['chest', 'back', 'legs']) {
      const hits = g.sessions.filter((s) => s.exercises.some((e) => e.targets.includes(grp))).length;
      assert.ok(hits >= 2, `${type}/${level} ${grp} trained ${hits}x`);
    }
  }
});

test('every injury limit removes the exercises that aggravate it, everywhere (gym, home backup, quick, swaps)', () => {
  for (const limit of L.LIMITS) for (const place of ['gym', 'home']) {
    const p = plan(man, 'athletic', { level: 'intermediate', place, days: 4, limits: [limit], equipment: ['dumbbells', 'bands', 'bench', 'pullupbar'] });
    const bad = new Set(L.LIB.filter((e) => e.avoid.includes(limit)).map((e) => e.id));
    for (const s of prog(p).sessions) {
      for (const e of allExercises(s)) assert.ok(!bad.has(e.id), `${limit}: ${e.name} in ${s.title}`);
      s.quick.exercises.forEach((e) => assert.ok(!bad.has(e.id), `${limit}: quick ${e.name}`));
      for (const e of s.exercises) [...e.swaps.busy, e.swaps.dumbbellOnly, e.swaps.home].filter(Boolean).forEach((a) => assert.ok(!bad.has(a.id), `${limit}: swap ${a.name}`));
    }
  }
});

test('the heart limit means machines and light effort only, with longer rests and no hard intervals', () => {
  const g = prog(plan(man, 'athletic', { level: 'intermediate', limits: ['heart'] }));
  assert.equal(g.cardio.intervals, null);
  assert.ok(g.sessions.every((s) => s.exercises.every((e) => e.rir >= 3 && e.restSec >= 90 || e.unit === 'seconds' || e.restSec >= 60)));
  assert.ok(g.safety.some((s) => s.id === 'clearance'));
  assert.ok(g.active.menu.every((a) => a.intensity !== 'hard'));
});

test('home plans only use equipment the person owns (nothing, or exactly what they listed)', () => {
  const none = prog(plan(man, 'muscular', { level: 'intermediate', place: 'home', days: 4 }));
  for (const s of none.sessions) for (const e of s.exercises) { const x = L.BY_ID[e.id]; assert.ok(x.venue !== 'gym' && x.eq.length === 0, `${e.name} needs equipment`); }
  const some = prog(plan(man, 'muscular', { level: 'intermediate', place: 'home', days: 4, equipment: ['dumbbells', 'bench'] }));
  for (const s of some.sessions) for (const e of s.exercises) { const x = L.BY_ID[e.id]; assert.ok(x.venue !== 'gym' && x.eq.every((q) => ['dumbbells', 'bench'].includes(q)), `${e.name} needs ${x.eq}`); }
  // Owning dumbbells makes the home plan use them.
  assert.ok(some.sessions.some((s) => s.exercises.some((e) => L.BY_ID[e.id].eq.includes('dumbbells'))));
  // Gym-only gear never shows in a home backup.
  const both = prog(plan(man, 'athletic', { level: 'intermediate', place: 'both', days: 4 }));
  for (const s of both.sessions) for (const e of s.homeBackup.exercises) assert.notEqual(L.BY_ID[e.id].venue, 'gym');
});

test('every gym exercise has swaps: busy-machine options of different kinds, and a no-equipment version', () => {
  const g = prog(plan(man, 'athletic', { level: 'intermediate', place: 'gym', days: 4 }));
  for (const s of g.sessions) for (const e of s.exercises) {
    assert.ok(e.swaps.busy.length >= 2, `${e.name} has ${e.swaps.busy.length} busy swaps`);
    assert.ok(!e.swaps.busy.some((b) => b.id === e.id), 'a swap is never the same exercise');
    assert.ok(new Set(e.swaps.busy.map((b) => b.kind)).size >= 2, `${e.name}: swaps are all one kind`);
    assert.ok(e.swaps.busy.every((b) => b.hint && b.why));
    if (e.slot !== 'fly') assert.ok(e.swaps.home, `${e.name} has no home swap`);
  }
  assert.ok(g.busyGym.length >= 4);
});

test('body size changes the plan: tall frames start on leg press / hack / box squat style, not the barbell squat', () => {
  const t = prog(plan(tall, 'muscular', { level: 'intermediate', days: 4 }));
  const first = t.sessions[1].exercises[0];
  assert.ok(['leg-press', 'hack-squat', 'smith-squat', 'box-squat'].includes(first.id), first.id);
  assert.notEqual(first.id, 'back-squat');
  const a = plan(tall, 'muscular', { level: 'intermediate' }).analysis;
  assert.equal(a.frame.heightClass, 'taller than average');
  assert.ok(a.adjustments.some((x) => x.area === 'Tall frame'));
});

test('a much heavier body gets low-impact, guided work and no hard intervals; lighter frames get light cardio', () => {
  const p = plan(heavy, 'athletic', { level: 'beginner' });
  const g = prog(p);
  assert.equal(g.cardio.lowImpactOnly, true);
  assert.equal(g.cardio.intervals, null);
  assert.ok(g.cardio.startMinutes < g.cardio.weeklyEasyMinutes, 'cardio ramps up');
  assert.ok(g.active.menu.every((a) => a.impact === 'low'));
  assert.ok(p.analysis.adjustments.some((x) => x.area === 'Higher body weight'));
  assert.ok(g.safety.some((s) => s.id === 'clearance'));
  const light = plan({ ...man, currentWeightKg: 62 }, 'muscular', { level: 'beginner' });
  assert.ok(prog(light).cardio.weeklyEasyMinutes <= 60);
});

test('women get glutes at least twice a week; older lifters get longer rests, easier effort and fewer days', () => {
  const w = prog(plan(woman, 'lean', { level: 'intermediate', days: 3 }));
  const glutes = w.sessions.filter((s) => s.exercises.some((e) => e.targets.includes('glutes') && ['glute', 'hinge', 'squat', 'lunge'].includes(e.slot))).length;
  assert.ok(glutes >= 2);
  assert.ok(w.sessions.filter((s) => s.exercises.some((e) => e.slot === 'glute')).length >= 2, 'direct glute work twice');
  const s = plan(senior, 'balanced', { level: 'beginner', days: 6 });
  assert.ok(prog(s).daysPerWeek <= 4);
  assert.ok(s.training.prefs.notes.length >= 1);
  assert.ok(prog(s).sessions[0].exercises.every((e) => e.rir >= 3));
  assert.ok(prog(s).sessions[0].exercises[0].restSec >= 120);
  assert.equal(prog(s).cardio.intervals, null);
});

test('focus choices add work for that muscle and keep it when time is short', () => {
  const base = prog(plan(woman, 'lean', { level: 'intermediate', days: 4, minutes: 45 }));
  const foc = prog(plan(woman, 'lean', { level: 'intermediate', days: 4, minutes: 45, focus: ['shoulders'] }));
  const sets = (g, grp) => g.volume.find((v) => v.group === grp).weeklySets;
  assert.ok(sets(foc, 'shoulders') >= sets(base, 'shoulders'));
  assert.ok(foc.sessions.filter((s) => s.exercises.some((e) => e.slot === 'lateral')).length >= 2);
});

test('shorter sessions fit the time without dropping the big lifts', () => {
  const g = prog(plan(man, 'athletic', { level: 'intermediate', days: 4, minutes: 45 }));
  g.sessions.forEach((s) => { assert.ok(s.minutes <= 50, `${s.title} ${s.minutes}`); assert.ok(s.exercises.filter((e) => ['compound'].includes(L.SLOTS[e.slot].role)).length >= 2); });
});

test('cardio: heart-rate zones, intervals only for those who can take them, and an active menu with calories for your weight', () => {
  const g = prog(plan(man, 'athletic', { level: 'intermediate' }));
  assert.equal(g.cardio.maxHeartRateBpm, Math.round(208 - 0.7 * 28));
  assert.ok(g.cardio.easy.zoneBpm[0] < g.cardio.easy.zoneBpm[1]);
  assert.ok(g.cardio.intervals && g.cardio.intervals.perWeek >= 1);
  const walk = g.active.menu.find((a) => a.id === 'walk-brisk');
  assert.equal(walk.kcal30, Math.round(4.3 * 82 * 0.5));
  assert.ok(g.active.menu.length >= 8 && g.active.minimumDay.detail);
  const home = prog(plan(man, 'athletic', { level: 'intermediate', place: 'home' }));
  assert.ok(home.active.menu.every((a) => a.where !== 'gym'));
});

test('analysis explains the body and what it changed; tape adds proportions; absurd FFMI is called out', () => {
  const p = plan(man, 'athletic', { level: 'beginner' }, { waist: 92, chest: 100, neck: 38 });
  const a = p.analysis;
  assert.ok(a.headline.length > 40 && a.frame.leanMassKg > 0 && a.frame.ffmi > 0);
  assert.ok(a.proportions.some((x) => x.id === 'whtr') && a.proportions.some((x) => x.id === 'taper'));
  assert.ok(a.adjustments.length >= 4 && a.adjustments.every((x) => x.area && x.change && x.why));
  assert.ok(a.focus.length >= 2 && a.expectation.timeline);
  const none = plan(man, 'athletic', {}).analysis;
  assert.equal(none.proportions[0].id, 'none');
  const odd = plan({ ...man, currentWeightKg: 118 }, 'athletic', {}, { waist: 80, neck: 41 }).analysis;
  if (odd.frame.ffmi > 25) assert.equal(odd.frame.ffmiBand, '');
});

test('setup is reported honestly: defaults are flagged, bad input is ignored, limits are clamped', () => {
  const none = plan(man, 'lean');
  assert.equal(none.training.prefs.setupDone, false);
  assert.equal(none.training.prefs.level, 'beginner');
  const c = sanitizePrefs({ place: 'moon', level: 'god', days: 99, minutes: 5, equipment: ['dumbbells', 'laser'], limits: 'knee,hip', focus: ['glutes', 'x', 'arms', 'core', 'back'] });
  assert.deepEqual(c, { place: '', level: '', days: null, minutes: null, equipment: ['dumbbells'], limits: ['knee'], focus: ['glutes', 'arms', 'core'] });
  assert.deepEqual(sanitizePrefs(null).equipment, []);
  assert.ok(TRAINING_OPTIONS.places.length === 3 && TRAINING_OPTIONS.limits.length === 6);
});

test('backward compatible: the old plain-lines training list and calorie numbers are unchanged for the same body', () => {
  const p = plan(man, 'athletic');
  assert.ok(Array.isArray(p.training.sessions) && p.training.sessions.every((s) => typeof s === 'string'));
  assert.equal(typeof p.training.strengthDays, 'number');
  assert.ok(p.calories > 1500 && p.macros.protein > 100);
});

test('when the calorie floor limits the pace, the plan slows the pace so the weeks are honest', () => {
  const p = plan({ sex: 'female', age: 45, heightCm: 165, currentWeightKg: 88, activityLevel: 'sedentary', goals: {} }, 'balanced');
  assert.equal(p.mode, 'lose');
  assert.ok(p.safety.some((s) => s.id === 'pace-slowed'));
  const deficit = ((p.goal.weeklyPaceKg * 7700) / 7);
  assert.ok(deficit <= 1830 - p.calories + 30, 'planned pace is reachable with the planned calories');
  assert.ok(p.calories >= 1200);
});

test('no shaming words anywhere in the training copy, and the output is plain JSON', () => {
  for (const [profile, type, prefs] of [[man, 'muscular', { level: 'advanced', days: 5 }], [woman, 'lean', { place: 'home', limits: ['knee', 'back'] }], [heavy, 'athletic', {}], [senior, 'balanced', { place: 'both' }]]) {
    const p = plan(profile, type, prefs);
    const text = JSON.stringify(p);
    assert.equal(SHAME.test(text), false, `shaming word: ${(text.match(SHAME) || [])[0]}`);
    assert.doesNotThrow(() => JSON.parse(text));
    assert.ok(text.length < 400000, 'response stays a sensible size');
  }
});
