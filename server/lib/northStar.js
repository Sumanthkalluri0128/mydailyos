// One north-star plan ("lose 6 kg by March"). The app derives a safe pace, picks three weekly focus habits, and everything else
// (daily quests, scores, badges) hangs underneath it. Also: user-chosen rewards, maintenance breaks and event mode.
const { addDays, diffDays } = require('./dates');
const { maxSafeWeeklyLossKg } = require('./trendWeight');
const { bmi } = require('./safety');

const r1 = (x) => Math.round(x * 10) / 10;
const r05 = (x) => Math.round(x * 20) / 20;
const r2 = (x) => Math.round(x * 100) / 100;
const floor05 = (x) => Math.floor(x * 20 + 1e-9) / 20;

const HABITS = {
  logging: { id: 'logging', icon: '📒', title: 'Log your food on 6 days', target: 6 },
  protein: { id: 'protein', icon: '🥚', title: 'Hit your protein on 5 days', target: 5 },
  steps: { id: 'steps', icon: '👟', title: 'Reach your step goal on 4 days', target: 4 },
  water: { id: 'water', icon: '💧', title: 'Hit your water goal on 5 days', target: 5 },
  sleep: { id: 'sleep', icon: '😴', title: 'Sleep 7+ hours on 4 nights', target: 4 },
  strength: { id: 'strength', icon: '🏋️', title: 'Do 2 strength sessions', target: 2 },
};

/** Pick three habits: the ones you are weakest at (0..1 adherence last 4 weeks), always keeping logging in unless it is already strong. */
function pickFocus(adherence = {}, count = 3) {
  const order = ['logging', 'protein', 'steps', 'water', 'strength', 'sleep'];
  const score = (k) => (typeof adherence[k] === 'number' ? adherence[k] : (k === 'logging' ? 0.5 : k === 'protein' ? 0.55 : k === 'steps' ? 0.6 : 0.8));
  const ranked = [...order].sort((a, b) => score(a) - score(b) || order.indexOf(a) - order.indexOf(b));
  return ranked.slice(0, count);
}

/**
 * @param byDate YYYY-MM-DD the person wants to be there by
 */
function derivePlan({ currentKg, targetKg, byDate, today, heightCm = null, adherence = {} }) {
  const c = Number(currentKg), g = Number(targetKg);
  if (!(c > 0) || !(g > 0)) return { ok: false, reason: 'Add your current weight and your goal weight first.' };
  if (Math.abs(c - g) < 0.4) return { ok: true, direction: 'maintain', paceKg: 0.25, feasible: true, focus: pickFocus(adherence), weeks: 0, note: 'Your goal is to stay where you are. We will focus on steady habits.' };
  const direction = g < c ? 'lose' : 'gain';
  const out = { ok: true, direction };
  const goalBmi = bmi(g, Number(heightCm));
  if (direction === 'lose' && goalBmi !== null && goalBmi < 18.5) {
    const minKg = r1(18.5 * ((Number(heightCm) / 100) ** 2));
    return { ok: false, reason: `A goal of ${g} kg is below the healthy range for your height. Please choose ${minKg} kg or more.`, minTargetKg: minKg };
  }
  const total = Math.abs(c - g);
  const cap = direction === 'lose' ? maxSafeWeeklyLossKg(c) : 0.5;
  const weeks = byDate ? Math.max(1, diffDays(today, byDate) / 7) : null;
  const needed = weeks ? total / weeks : cap > 0.5 ? 0.5 : cap;
  const pace = Math.min(1, Math.max(0.1, Math.min(r05(needed), Math.max(0.1, floor05(cap)))));
  const feasible = needed <= cap + 0.001;
  const realistic = Math.ceil(total / pace);
  Object.assign(out, {
    paceKg: pace, neededPaceKg: r2(needed), capKg: cap, feasible, weeks: realistic, totalKg: r1(total),
    suggestedDate: addDays(today, realistic * 7), focus: pickFocus(adherence),
    note: feasible ? `About ${pace} kg a week gets you there in roughly ${realistic} weeks. That is a steady, safe pace.` : `Reaching it by then would need about ${r2(needed)} kg a week, which is faster than the ${cap} kg we recommend. A date around ${addDays(today, realistic * 7)} is safer.`,
  });
  return out;
}

/** Rewards the person chose ("new shoes at 3 kg"). `lostKg` = trend weight lost so far. */
function rewardLadder(rewards = [], lostKg = 0) {
  return rewards.map((r) => ({ ...r, reached: lostKg + 1e-9 >= r.atKg, remainingKg: Math.max(0, r1(r.atKg - lostKg)) })).sort((a, b) => a.atKg - b.atKg);
}

/**
 * Healthy rhythm: after 8–12 weeks of dieting, a maintenance break of about two weeks. `weeksSince` = weeks since the plan started
 * or since the last break ended. Never pushed while a break is on.
 */
function breakAdvice({ weeksSince, onBreak = false }) {
  if (onBreak) return { state: 'on-break', message: 'You are on a maintenance break. Eat at maintenance for two weeks; it helps your body and your head.' };
  if (weeksSince >= 12) return { state: 'due', message: `You have been dieting for ${Math.floor(weeksSince)} weeks. A two-week maintenance break now is a good idea and does not undo your progress.` };
  if (weeksSince >= 8) return { state: 'soon', message: `${Math.floor(weeksSince)} weeks in. A maintenance break is worth planning in the next few weeks.` };
  return { state: 'none', message: '' };
}

/**
 * Event mode (Diwali, weddings, travel): bank a little ahead, relax on the day, recover gently afterwards, with no guilt.
 * @returns {phase, adjust, message, name} where adjust is the kcal to add to today's target (negative while banking / recovering)
 */
function eventAdvice(events, today, target, floor = 1200) {
  for (const e of events || []) {
    const before = diffDays(today, e.startDate), after = diffDays(e.endDate, today);
    const room = Math.max(0, target - floor);
    if (before >= 1 && before <= 3) { const bank = Math.min(150, Math.round(room)); return { phase: 'before', name: e.title, adjust: -bank, message: `${e.title} is in ${before} day${before === 1 ? '' : 's'}. Eating about ${bank} kcal lighter each day until then banks a little room. Totally optional.` }; }
    if (before <= 0 && after <= 0) return { phase: 'during', name: e.title, adjust: 0, message: `Enjoy ${e.title}. Log roughly or not at all. One event does not decide your progress.` };
    if (after >= 1 && after <= 4) { const trim = Math.min(200, Math.round(room)); return { phase: 'after', name: e.title, adjust: -trim, message: `Back to normal after ${e.title}. About ${trim} kcal lighter for a few days balances it out, gently and with no pressure.` }; }
  }
  return { phase: 'none', adjust: 0, message: '' };
}

const { weekday } = require('./dates');
/** This Mon–Sun week's progress on each chosen focus habit. */
function focusProgress(focus, days, t, sleep, strengthDates, today) {
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const week = days.filter((d) => d.date >= monday && d.date <= today);
  const count = {
    logging: week.filter((d) => d.calories > 0).length,
    protein: t.protein > 0 ? week.filter((d) => d.calories > 0 && d.protein >= t.protein * 0.9).length : 0,
    steps: t.steps > 0 ? week.filter((d) => d.steps >= t.steps).length : 0,
    water: t.waterMl > 0 ? week.filter((d) => d.waterMl >= t.waterMl).length : 0,
    sleep: week.filter((d) => sleep[d.date] >= 7).length,
    strength: week.filter((d) => strengthDates.has(d.date)).length,
  };
  return (focus || []).filter((id) => HABITS[id]).map((id) => ({ ...HABITS[id], value: Math.min(count[id], HABITS[id].target), done: count[id] >= HABITS[id].target }));
}
/** 0..1 adherence per habit over the last 28 days, used to pick what to focus on. */
function adherenceOf(days, t, sleep, strengthDates, today) {
  const win = days.filter((d) => d.date > addDays(today, -28) && d.date <= today);
  const n = Math.max(1, win.length);
  const strengthWeeks = Math.max(1, n / 7);
  return {
    logging: win.filter((d) => d.calories > 0).length / n,
    protein: t.protein > 0 ? win.filter((d) => d.calories > 0 && d.protein >= t.protein * 0.9).length / n : 1,
    steps: t.steps > 0 ? win.filter((d) => d.steps >= t.steps).length / n : 1,
    water: t.waterMl > 0 ? win.filter((d) => d.waterMl >= t.waterMl).length / n : 1,
    sleep: Object.keys(sleep).length >= 7 ? win.filter((d) => sleep[d.date] >= 7).length / n : 1,
    strength: Math.min(1, [...strengthDates].filter((d) => d > addDays(today, -28)).length / (2 * strengthWeeks)),
  };
}

module.exports = { focusProgress, adherenceOf, derivePlan, pickFocus, rewardLadder, breakAdvice, eventAdvice, HABITS };
