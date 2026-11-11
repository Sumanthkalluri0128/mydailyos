// Pure helpers behind the Coach hub, auto-adjust and the coach changelog. The routes only load data and save; every decision lives here
// so it can be tested without a database.
//
// AUTO-ADJUST ("safe" mode) applies a weekly change on its own ONLY when it is small and reversible:
//   * a steps goal rise (never above the 12,000 cap the ladder already enforces), or
//   * a calorie / pace change of at most 150 kcal that stays at or above the person's own floor.
// Diet breaks, anything bigger, and anything while a decision is not "apply"-type always wait for a tap. Every automatic change is
// written to the changelog and can be undone with one tap; an undone change is not auto-applied again for 14 days.
const { diffDays } = require('./dates');

const AUTO = { maxKcal: 150, stepsMax: 12000, undoDays: 14, keep: 30, judgeAfterDays: 10 };

/** @param apply decision.apply   @param ctx {target, floor} the plan's current calorie target and the safe floor */
function autoSafe(apply, { target, floor } = {}) {
  if (!apply || typeof apply !== 'object') return false;
  if (apply.type === 'steps') return Number(apply.stepsTarget) > 0 && Number(apply.stepsTarget) <= AUTO.stepsMax && Number(apply.stepsTarget) > Number(apply.from || 0) && Number(apply.stepsTarget) - Number(apply.from || 0) <= 2000;
  if (apply.type === 'calorie' || apply.type === 'pace') {
    const want = Number(apply.calorieTarget);
    if (!(want > 0) || !(Number(target) > 0)) return false;
    if (floor && want < floor) return false;
    return Math.abs(want - Number(target)) <= AUTO.maxKcal;
  }
  return false;                                           // diet breaks and unknown types always need a tap
}

function describeChange(apply, { target = null } = {}) {
  if (!apply) return '';
  if (apply.type === 'steps') return `Daily steps goal ${Number(apply.from || 0).toLocaleString('en-US')} to ${Number(apply.stepsTarget).toLocaleString('en-US')}`;
  if (apply.type === 'calorie' || apply.type === 'pace') return `Calories ${apply.from && apply.type === 'calorie' ? `${apply.from} to ` : target ? `${target} to ` : 'now '}${apply.calorieTarget} a day`;
  if (apply.type === 'dietBreak') return `${apply.days || 7}-day diet break`;
  if (apply.type === 'targetDate') return `Target date ${apply.from || 'none'} to ${apply.byDate}`;
  return 'Plan change';
}

/** What to remember so the change can be undone: only the goal fields a weekly change can touch. */
function snapshotGoals(profile, { withPlan = false } = {}) {
  const g = (profile && profile.goals) || {};
  const pl = (profile && profile.plan) || {};
  const out = { stepsTarget: g.stepsTarget ?? null, calorieMode: g.calorieMode ?? 'auto', calorieTarget: g.calorieTarget ?? null, weeklyPaceKg: g.weeklyPaceKg ?? null };
  // The target date and the plan pace are remembered ONLY by changes that touch them (lib/targetOffer.js), so undoing an unrelated change
  // can never put back an old date the person has since edited themselves.
  if (withPlan) { out.planByDate = typeof pl.byDate === 'string' ? pl.byDate : ''; out.planPaceKg = pl.paceKg ?? null; }
  return out;
}
/** Mongo $set that puts a snapshot back. Null fields are skipped so an undo never writes junk. */
function restoreSet(snap) {
  const set = {};
  if (!snap) return set;
  if (Number(snap.stepsTarget) > 0) set['goals.stepsTarget'] = Number(snap.stepsTarget);
  if (snap.calorieMode === 'auto' || snap.calorieMode === 'manual') set['goals.calorieMode'] = snap.calorieMode;
  if (Number(snap.calorieTarget) > 0) set['goals.calorieTarget'] = Number(snap.calorieTarget);
  if (Number(snap.weeklyPaceKg) > 0) set['goals.weeklyPaceKg'] = Number(snap.weeklyPaceKg);
  if (typeof snap.planByDate === 'string' && 'planByDate' in snap) set['plan.byDate'] = snap.planByDate;      // '' puts back "no date"; older snapshots have no such key and are untouched
  if (Number(snap.planPaceKg) > 0) set['plan.paceKg'] = Number(snap.planPaceKg);
  return set;
}

function logEntry({ dec, today, auto = false, target = null }) {
  return {
    date: today, action: dec.action, headline: dec.headline, change: describeChange(dec.apply, { target }), auto: !!auto, undone: false,
    rateBefore: dec.metrics && dec.metrics.rateKgWk !== undefined ? dec.metrics.rateKgWk : null,
  };
}
const pushLog = (list, entry) => [entry, ...(list || [])].slice(0, AUTO.keep);

/** The changelog for the screen, with "what happened afterwards" once a change is old enough to judge. rateNow = trend kg/week now (negative = losing). */
function changelogView(entries = [], { today, rateNow = null, direction = 'lose' } = {}) {
  return (entries || []).map((e) => {
    const out = { ...e };
    const age = diffDays(e.date, today);
    if (!e.undone && age >= AUTO.judgeAfterDays && rateNow !== null && e.rateBefore !== null && e.rateBefore !== undefined) {
      const toward = (r) => (direction === 'gain' ? r : direction === 'lose' ? -r : -Math.abs(r));
      const before = toward(e.rateBefore), now = toward(rateNow);
      const delta = Math.round((now - before) * 100) / 100;
      out.after = { rateBefore: e.rateBefore, rateNow, verdict: delta >= 0.1 ? 'better' : delta <= -0.1 ? 'worse' : 'same',
        text: delta >= 0.1 ? `It helped: the trend moved about ${Math.abs(delta)} kg a week in the right direction.` : delta <= -0.1 ? `The trend moved about ${Math.abs(delta)} kg a week the wrong way since this change. The coach will take that into account.` : 'The trend is about the same so far. The coach waits a little longer before judging.' };
    }
    return out;
  });
}

/** Can the last automatic change still be undone? */
function undoView(autoUndo, today) {
  if (!autoUndo || !autoUndo.date) return null;
  if (diffDays(autoUndo.date, today) > AUTO.undoDays) return null;
  return { date: autoUndo.date, action: autoUndo.action, change: autoUndo.change || '', auto: !!autoUndo.auto };
}
/** Auto-apply is skipped for 14 days after an undo, so the coach never fights the person. */
const undoneRecently = (weekly, today) => !!(weekly && weekly.undoneOn && diffDays(weekly.undoneOn, today) < AUTO.undoDays);

module.exports = { AUTO, autoSafe, describeChange, snapshotGoals, restoreSet, logEntry, pushLog, changelogView, undoView, undoneRecently };
