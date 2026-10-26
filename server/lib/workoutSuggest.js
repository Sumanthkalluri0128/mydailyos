// Today's workout suggestion. Rule-based and explainable: every choice comes with a plain reason built from the person's own data.
// Unknown inputs (null) are skipped, never guessed. The person can always pick something else.
const { buildGuided, clampMinutes } = require('./guided');

const LABEL = { legs: 'Legs', back: 'Back', chest: 'Chest', shoulders: 'Shoulders', core: 'Core', arms: 'Arms', glutes: 'Glutes' };
const CANDIDATES = ['legs', 'back', 'chest', 'shoulders', 'core'];
const POOL = {
  none: {
    legs: ['Bodyweight Squat', 'Reverse Lunge', 'Glute Bridge'],
    back: ['Superman Hold', 'Glute Bridge', 'Mountain Climbers'],
    chest: ['Push-ups', 'Incline Push-ups', 'Mountain Climbers'],
    shoulders: ['Push-ups', 'Incline Push-ups', 'Mountain Climbers'],
    core: ['Plank', 'Mountain Climbers', 'Superman Hold'],
  },
  gym: {
    legs: ['Goblet Squat', 'Leg Press', 'Romanian Deadlift'],
    back: ['Lat Pulldown', 'Seated Cable Row', 'Romanian Deadlift'],
    chest: ['Dumbbell Bench Press', 'Push-ups', 'Triceps Pushdown'],
    shoulders: ['Dumbbell Shoulder Press', 'Push-ups', 'Biceps Curl'],
    core: ['Plank', 'Mountain Climbers', 'Superman Hold'],
  },
};
const PLURAL = new Set(['legs', 'shoulders', 'arms', 'glutes']);
const HOLDS = new Set(['Plank', 'Superman Hold']);
const COUNT = { 10: 2, 20: 3, 40: 5 };

const roundMinutes = (m) => (Number(m) >= 40 ? 40 : Number(m) >= 20 ? 20 : 10);
const hours = (h) => `${Math.round(h * 10) / 10}`.replace(/\.0$/, '');

function item(name, sets) { return HOLDS.has(name) ? { name, sets, reps: 30, type: 'hold' } : { name, sets, reps: 10, type: 'reps' }; }

/**
 * ctx = { minutes, equipment, sleepHours, yesterday:{minutes,strengthSets}|null, yesterdaySteps, daysSince:{legs:3,...}, weekly:{legs:{sets}},
 *         programSession (from programs.nextSession) | null, deload:'ok'|'watch'|'deload' }
 */
function suggestWorkout(ctx = {}) {
  const minutes = roundMinutes(ctx.minutes);
  const equipment = ctx.equipment === 'gym' ? 'gym' : 'none';
  const reasons = [];
  const sleep = Number.isFinite(ctx.sleepHours) && ctx.sleepHours > 0 ? ctx.sleepHours : null;
  const y = ctx.yesterday || null;
  const lowSleep = sleep !== null && sleep < 6;
  const heavyYesterday = !!y && ((y.minutes || 0) >= 60 || (y.strengthSets || 0) >= 18);
  const rest = ctx.deload === 'deload';

  if (sleep !== null) reasons.push(lowSleep ? `You slept ${hours(sleep)} h, so today is a lighter one.` : `You slept ${hours(sleep)} h, a good base for training.`);
  if (heavyYesterday) reasons.push('Yesterday was a big day, so today goes easier.');
  if (rest) reasons.push('Your lifts have been level for a few weeks, so this is a rest arc: lighter weights, fewer sets.');
  const steps = Number.isFinite(ctx.yesterdaySteps) ? ctx.yesterdaySteps : null;
  const walkTip = steps !== null && steps < 3000 ? 'Yesterday was a quiet step day, so a short walk after this would be a nice add-on.' : '';

  // 1. Recovery day: low sleep AND a big day before, or too little rest for every muscle group.
  const rested = CANDIDATES.map((g) => ({ g, days: ctx.daysSince?.[g] ?? null, sets: ctx.weekly?.[g]?.sets || 0 }));
  const score = (r) => (r.days === null ? 99 : r.days);
  const best = rested.slice().sort((a, b) => score(b) - score(a) || a.sets - b.sets)[0];
  const allTired = rested.every((r) => r.days !== null && r.days < 2);
  if ((lowSleep && heavyYesterday) || allTired) {
    if (allTired) reasons.push('Every muscle group was trained in the last day or so, so stretching is a good choice.');
    const g = buildGuided('stretch', Math.min(10, Math.max(3, minutes / 2)));
    return { type: 'stretch', title: 'Easy stretch and breathe', intensity: 'recovery', minutes: g.minutes, who: 'zoro', scene: 'plan', items: [], guided: { kind: 'stretch', minutes: g.minutes }, reasons, walkTip };
  }

  // 2. Today's episode from an active program, trimmed to the time chosen.
  if (ctx.programSession) {
    const s = ctx.programSession;
    const keep = Math.min(s.exercises.length, COUNT[minutes]);
    const easier = lowSleep || heavyYesterday;
    reasons.unshift(`Today is episode ${s.week}, day ${s.day} of your training arc.`);
    return {
      type: 'program', title: `${s.episode}: day ${s.day}`, intensity: rest || easier ? 'easy' : 'normal', minutes,
      who: s.who, scene: s.scene, program: { week: s.week, day: s.day },
      items: s.exercises.slice(0, keep).map((e) => ({ ...e, sets: easier ? Math.max(1, e.sets - 1) : e.sets })), reasons, walkTip,
    };
  }

  // 3. Train the muscle group that has rested longest.
  const easy = lowSleep || heavyYesterday || rest;
  const sets = easy ? 2 : 3;
  const groups = [best.g];
  if (minutes === 40) groups.push(rested.filter((r) => r.g !== best.g).sort((a, b) => score(b) - score(a) || a.sets - b.sets)[0].g);
  const names = [];
  for (const g of groups) for (const n of POOL[equipment][g]) if (!names.includes(n)) names.push(n);
  const items = names.slice(0, COUNT[minutes]).map((n) => item(n, sets));
  if (best.days === null) reasons.unshift(`${LABEL[best.g]} ${PLURAL.has(best.g) ? 'have' : 'has'} not been logged recently, so ${PLURAL.has(best.g) ? 'they are' : 'it is'} up next.`);
  else reasons.unshift(`${LABEL[best.g]} rested for ${best.days} day${best.days === 1 ? '' : 's'}.`);
  return {
    type: 'strength', title: `${groups.map((g) => LABEL[g]).join(' + ')} day`, intensity: easy ? 'easy' : 'normal', minutes,
    who: easy ? 'kakashi' : 'goku', scene: easy ? 'health' : 'lift', items, reasons, walkTip,
  };
}

module.exports = { suggestWorkout, roundMinutes, POOL };
