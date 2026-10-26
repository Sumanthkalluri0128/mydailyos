// Coaching part 1 (Section G): rough-day mode, 7-day experiments, weight-jump explainer, sleep-to-eating link, goal-date range,
// learning coach and weekly treat allowance. Pure rules: data in, message/decision out. Wording is cautious ("likely", "may") and never punishing.
const { addDays, diffDays, weekday } = require('./dates');
const { smoothTrend } = require('./trendWeight');

const r0 = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;
const r10 = (x) => Math.round(x / 10) * 10;
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7));

// ---------------------------------------------------------------- 1. minimum-viable day ("rest arc")
const ROUGH_ACTIONS = [
  { id: 'meal', title: 'Log one meal', done: (d) => d && d.calories > 0 },
  { id: 'water', title: 'Drink some water', hint: 'About three glasses is plenty today.', done: (d) => d && d.waterMl >= 750 },
  { id: 'walk', title: 'Walk for 10 minutes', done: (d) => d && (d.exerciseMinutes >= 10 || d.steps >= 1000) },
];
/** state.rough = { date } (on only for that same day). day = today's aggregated row. */
function roughDayView({ state = {}, day = null, today }) {
  const on = !!(state.rough && state.rough.date === today);
  if (!on) return { on: false };
  const actions = ROUGH_ACTIONS.map((a) => ({ id: a.id, title: a.title, hint: a.hint || '', done: !!a.done(day) }));
  const done = actions.filter((a) => a.done).length;
  const message = done === 0 ? 'Rough day? That is okay. Three tiny things are enough, and your streak is safe.'
    : done < 3 ? `${done} of 3 done. That counts, and your streak is kept.` : 'All three done on a rough day. That is real strength. Rest now.';
  return { on: true, actions, done, keepsStreak: true, message, reminders: { maxPerDay: 2, kinds: ['meal', 'water'] }, scene: done === 3 ? 'cheer' : 'rest' };
}
/** Dates on which rough-day mode was on AND at least one tiny action happened keep the streak alive. */
function roughKeptDates(roughDates, daysByDate) {
  return (roughDates || []).filter((d) => ROUGH_ACTIONS.some((a) => a.done(daysByDate[d])));
}

// ---------------------------------------------------------------- 2. 7-day experiments ("side quests")
const dayOk = (ctx, d) => (ctx.byDate || {})[d];
const EXPERIMENTS = [
  { id: 'protein-breakfast', title: 'Protein at breakfast', quest: 'Add an egg, paneer, curd or dal to breakfast.', why: 'Protein early keeps hunger steadier through the day.', weak: ['protein-weekdays', 'protein-low'],
    auto: (d, ctx) => (ctx.breakfastProtein || {})[d] >= 15, metric: { label: 'breakfast protein', unit: 'g', value: (d, ctx) => (ctx.breakfastProtein || {})[d] } },
  { id: 'walk-after-dinner', title: 'A 10-minute walk after dinner', quest: 'Step out for ten easy minutes after dinner.', why: 'A short walk after eating helps digestion and adds steps.', weak: ['steps'],
    auto: (d, ctx) => { const x = dayOk(ctx, d); return !!x && (x.exerciseMinutes >= 10 || x.steps >= 4000); }, metric: { label: 'steps', unit: '', value: (d, ctx) => (dayOk(ctx, d) || {}).steps || null } },
  { id: 'water-with-meals', title: 'A glass of water with each meal', quest: 'One glass with breakfast, lunch and dinner.', why: 'It is an easy way to reach your water goal.', weak: ['water'],
    auto: (d, ctx) => { const x = dayOk(ctx, d); return !!x && !!ctx.waterMl && x.waterMl >= ctx.waterMl; }, metric: { label: 'water', unit: 'ml', value: (d, ctx) => (dayOk(ctx, d) || {}).waterMl || null } },
  { id: 'swap-snack', title: 'One lighter snack a day', quest: 'Swap one snack for fruit, roasted chana or buttermilk.', why: 'Snacks add up quietly; a swap keeps the treat feeling.', weak: ['snacks'],
    auto: (d, ctx) => (ctx.snackKcal || {})[d] !== undefined && ctx.snackKcal[d] <= 150, metric: { label: 'snack calories', unit: 'kcal', value: (d, ctx) => (ctx.snackKcal || {})[d] } },
  { id: 'log-everything', title: 'Log every day', quest: 'Log something every day, even a rough guess.', why: 'Tips only work when there is something to learn from.', weak: ['log-more'],
    auto: (d, ctx) => { const x = dayOk(ctx, d); return !!x && x.calories > 0; }, metric: null },
  { id: 'sleep-7', title: 'Aim for 7 hours of sleep', quest: 'Wind down a little earlier and log your sleep.', why: 'Better sleep makes cravings easier.', weak: [],
    auto: (d, ctx) => (ctx.sleepByDate || {})[d] >= 7, metric: { label: 'sleep', unit: 'h', value: (d, ctx) => (ctx.sleepByDate || {})[d] } },
];
const byId = (id) => EXPERIMENTS.find((e) => e.id === id);
const windowDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

function adherence(exp, state, ctx) {
  const e = byId(exp.id); const manual = exp.manual || {};
  const days = windowDays(exp.startDate).map((date) => {
    const auto = !!(e && e.auto(date, ctx));
    return { date, auto, manual: !!manual[date], done: auto || !!manual[date] };
  });
  return days;
}
function metricAvg(e, dates, ctx) {
  if (!e || !e.metric) return null;
  const vals = dates.map((d) => e.metric.value(d, ctx)).filter((v) => v !== undefined && v !== null && Number(v) > 0);
  return vals.length >= 3 ? avg(vals.map(Number)) : null;
}
function resultOf(exp, ctx) {
  const e = byId(exp.id); const days = adherence(exp, null, ctx);
  const doneDays = days.filter((d) => d.done).length;
  const during = metricAvg(e, windowDays(exp.startDate), ctx);
  const before = metricAvg(e, windowDays(addDays(exp.startDate, -7)), ctx);
  const rewarded = doneDays >= 5;
  let message = rewarded ? `You did "${e.title}" on ${doneDays} of 7 days. Side quest complete!` :
    doneDays >= 1 ? `You did "${e.title}" on ${doneDays} of 7 days. A good try; some weeks just do not fit, and that is fine.` :
      `"${e.title}" did not fit this week, and that is fine. Here is a new one.`;
  if (e.metric && during !== null && before !== null) message += ` Your ${e.metric.label} averaged ${r0(before)}${e.metric.unit ? ' ' + e.metric.unit : ''} the week before and ${r0(during)}${e.metric.unit ? ' ' + e.metric.unit : ''} this week.`;
  return { id: exp.id, title: e.title, startDate: exp.startDate, doneDays, rewarded, announced: false, message };
}
function pickNext(history, tipIds = [], skipIds = []) {
  const recent = history.slice(-2).map((h) => h.id);
  const ok = EXPERIMENTS.filter((e) => !recent.includes(e.id) && !skipIds.includes(e.id));
  const pool = ok.length ? ok : EXPERIMENTS.filter((e) => !skipIds.includes(e.id));
  const weakHit = pool.find((e) => e.weak.some((w) => tipIds.includes(w)));
  if (weakHit) return weakHit.id;
  const rank = (pool.length ? pool : EXPERIMENTS).filter((e) => e.id !== 'sleep-7' || (e.auto && true));
  return rank[history.length % rank.length].id;
}
/**
 * Advances the experiment state for `today`. Returns { state, current, last }. Pure: the caller saves `state`.
 * state.exp = { id, startDate, manual:{date:true} }; state.expHistory = [{id,startDate,doneDays,rewarded,announced,message}]
 */
function rollExperiment({ state = {}, today, ctx = {}, tipIds = [] }) {
  const st = { ...state, expHistory: [...(state.expHistory || [])] };
  if (st.exp && diffDays(st.exp.startDate, today) >= 7) { st.expHistory.push(resultOf(st.exp, ctx)); st.expHistory = st.expHistory.slice(-20); st.exp = null; }
  if (!st.exp && !st.expPaused) st.exp = { id: pickNext(st.expHistory, tipIds), startDate: today, manual: {} };
  const last = st.expHistory.length ? st.expHistory[st.expHistory.length - 1] : null;
  const e = st.exp && byId(st.exp.id);
  const current = e ? (() => {
    const days = adherence(st.exp, st, ctx).map((d) => ({ ...d, future: d.date > today }));
    return { id: e.id, title: e.title, quest: e.quest, why: e.why, startDate: st.exp.startDate, endDate: addDays(st.exp.startDate, 6), daysLeft: Math.max(0, 6 - diffDays(st.exp.startDate, today)), days, doneDays: days.filter((d) => d.done).length };
  })() : null;
  return { state: st, current, last: last && diffDays(last.startDate, today) <= 15 ? last : null };
}
/** Manual tick for days with no automatic data. Only days inside the current window. */
function tickExperiment(state, date, today) {
  if (!state.exp || date < state.exp.startDate || date > addDays(state.exp.startDate, 6) || date > today) return state;
  const manual = { ...(state.exp.manual || {}) };
  if (manual[date]) delete manual[date]; else manual[date] = true;
  return { ...state, exp: { ...state.exp, manual } };
}
function skipExperiment(state, today, ctx, tipIds) {
  if (!state.exp) return state;
  const history = state.expHistory || [];
  const id = pickNext(history, tipIds, [state.exp.id]);
  return { ...state, exp: { id, startDate: today, manual: {} } };
}

// ---------------------------------------------------------------- 3. weight-jump explainer
/**
 * @param weights [{date, weightKg}], @param days [{date,calories,sodium,carbohydrates,steps}], @param sleepByDate {date: hours}
 * A "jump" is a weigh-in 0.8 kg or more away from the trend line. Reasons use words like "likely" and "may".
 */
function explainJump({ weights, days = [], sleepByDate = {}, today, minKg = 0.8 }) {
  const recent = (weights || []).filter((w) => w.date <= today && diffDays(w.date, today) <= 28);
  const series = smoothTrend(recent);
  if (series.length < 4) return { status: 'insufficient', needed: 4, have: series.length, message: 'Weigh in at least 4 times in a month and FlexFit can tell a real change from daily noise.' };
  const last = series[series.length - 1];
  if (diffDays(last.date, today) > 3) return { status: 'none', message: 'No very recent weigh-in to explain.' };
  const prev = series[series.length - 2];
  const jump = last.weightKg - prev.trendKg;
  const chart = series.slice(-21);
  if (Math.abs(jump) < minKg) return { status: 'steady', series: chart, trendKg: last.trendKg, message: 'Your weigh-in is close to your trend line. Day-to-day swings of a kilo or so are normal.' };

  const up = jump > 0;
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const win = [addDays(last.date, -2), addDays(last.date, -1), last.date].map((d) => byDate[d]).filter((d) => d && d.calories > 0);
  const base = days.filter((d) => d.date < addDays(last.date, -2) && diffDays(d.date, last.date) <= 16 && d.calories > 0);
  const reasons = [];
  if (win.length && base.length >= 5) {
    const cmp = (k) => ({ w: avg(win.map((d) => Number(d[k]) || 0)), b: avg(base.map((d) => Number(d[k]) || 0)) });
    const na = cmp('sodium'), ca = cmp('carbohydrates'), ka = cmp('calories');
    if (up) {
      if (na.b > 0 && na.w >= na.b * 1.25 && na.w - na.b >= 500) reasons.push({ id: 'sodium', text: `You ate more salt than usual in the last two days (about ${r10(na.w)} mg a day vs ${r10(na.b)} mg). Salt makes the body hold water, so this may be part of it.` });
      if (ca.b > 0 && ca.w >= ca.b * 1.3 && ca.w - ca.b >= 60) reasons.push({ id: 'carbs', text: `Carbs were higher than usual (about ${r0(ca.w)} g a day vs ${r0(ca.b)} g). Each gram of carbohydrate is stored with water, so this likely adds scale weight that is not fat.` });
      if (ka.b > 0 && ka.w >= ka.b * 1.25 && ka.w - ka.b >= 300) reasons.push({ id: 'bigger-meals', text: 'You ate more than usual recently, so food still being digested may be weighing on the scale.' });
    } else {
      if (ca.b > 0 && ca.w <= ca.b * 0.7 && ca.b - ca.w >= 60) reasons.push({ id: 'carbs-low', text: 'Carbs were lower than usual, which can release stored water for a while. This is likely temporary.' });
      if (na.b > 0 && na.w <= na.b * 0.75 && na.b - na.w >= 500) reasons.push({ id: 'sodium-low', text: 'You ate less salt than usual, so the body may be holding less water.' });
    }
    const st = (d) => Number(d.steps) || 0;
    const sb = avg(base.map(st).filter((x) => x > 0)), sw = avg(win.map(st).filter((x) => x > 0));
    if (up && sb > 0 && sw > 0 && sw <= sb * 0.7) reasons.push({ id: 'steps', text: `Steps were lower than usual (about ${r0(sw)} vs ${r0(sb)}). Less movement may mean slower digestion and a little more water held.` });
    if (!up && sb > 0 && sw >= sb * 1.4) reasons.push({ id: 'steps-up', text: 'You were more active than usual, which may explain a lower reading.' });
  }
  const sl = [sleepByDate[last.date], sleepByDate[addDays(last.date, -1)]].filter((x) => x > 0);
  if (up && sl.length && Math.min(...sl) < 6) reasons.push({ id: 'sleep', text: 'You slept under 6 hours recently. Short sleep can raise water retention and the hormone cortisol, so this may be part of it.' });
  const kg = r1(Math.abs(jump));
  return {
    status: 'jump', direction: up ? 'up' : 'down', kg, trendKg: last.trendKg, series: chart,
    headline: up ? `Up ${kg} kg from your trend. Please do not panic.` : `Down ${kg} kg from your trend. Nice, but treat it as noise.`,
    reasons: reasons.slice(0, 3),
    fallback: reasons.length ? '' : 'Nothing in your logs stands out. Water, salt, digestion and time of day can each move the scale by a kilo or two.',
    reassure: `Your trend line is the real signal, and it is at ${last.trendKg} kg. Fat does not change this fast, so one reading is not a result.`,
  };
}

// ---------------------------------------------------------------- 4. sleep-to-eating link
const SLEEP_MIN = { short: 5, other: 5, shortBelow: 6 };
/** days: [{date, calories}]; sleepByDate: {date: hours} (sleep logged on the morning of that date). */
function sleepEating({ days, sleepByDate }) {
  const short = [], other = [];
  for (const d of days || []) {
    const h = sleepByDate[d.date];
    if (!(h > 0) || !(d.calories > 0)) continue;
    (h < SLEEP_MIN.shortBelow ? short : other).push(d.calories);
  }
  const needed = { short: SLEEP_MIN.short, other: SLEEP_MIN.other, text: `Needs at least ${SLEEP_MIN.short} days after under ${SLEEP_MIN.shortBelow} hours of sleep and ${SLEEP_MIN.other} days after more.` };
  const have = { short: short.length, other: other.length };
  if (short.length < needed.short || other.length < needed.other) return { enough: false, have, needed, message: `${needed.text} You have ${have.short} and ${have.other} so far.` };
  const diff = r10(avg(short) - avg(other));
  const message = Math.abs(diff) < 50 ? `Over ${have.short + have.other} days, short sleep has made no clear difference to how much you eat (within 50 kcal).`
    : diff > 0 ? `On days after under ${SLEEP_MIN.shortBelow} hours of sleep you eat about ${diff} kcal more.` : `On days after under ${SLEEP_MIN.shortBelow} hours of sleep you eat about ${-diff} kcal less.`;
  return { enough: true, have, needed, diffKcal: diff, avgShort: r10(avg(short)), avgOther: r10(avg(other)), message, note: 'This is a pattern in your own logs, not proof of cause.' };
}

// ---------------------------------------------------------------- 5. goal-date range (cone)
const MAX_DAYS = 730;
/** Regression on the last 28 days of weigh-ins; the slope's uncertainty gives an earliest and latest arrival date. */
function goalRange({ weights, goalKg, today }) {
  const g = Number(goalKg);
  if (!(g > 0)) return { status: 'no_goal', message: 'Set a goal weight to see when you are likely to arrive.' };
  const pts = (weights || []).filter((w) => w.date <= today && diffDays(w.date, today) <= 28 && Number(w.weightKg) > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const span = pts.length ? diffDays(pts[0].date, pts[pts.length - 1].date) : 0;
  if (pts.length < 5 || span < 14) return { status: 'insufficient', needed: 'at least 5 weigh-ins over 14 days', have: pts.length, message: 'Log at least 5 weigh-ins over two weeks to see a likely date range.' };
  const xs = pts.map((p) => diffDays(pts[0].date, p.date)), ys = pts.map((p) => Number(p.weightKg));
  const n = xs.length, mx = avg(xs), my = avg(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const b = sxx ? sxy / sxx : 0;
  const a = my - b * mx;
  const sse = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx) || 0;
  const band = 1.28 * se;                       // about an 80% range
  const trend = smoothTrend(pts); const now = trend[trend.length - 1].trendKg;
  const remaining = g - now; const dir = remaining < 0 ? -1 : remaining > 0 ? 1 : 0;
  if (dir === 0 || Math.abs(remaining) < 0.2) return { status: 'arrived', nowKg: now, message: 'You are at your goal weight.' };
  const mid = b * dir, fast = (b + dir * band) * dir, slow = (b - dir * band) * dir;   // kg/day moving toward the goal
  const slopeWk = r1(b * 7);
  if (mid < 0.005) return { status: 'not_moving', nowKg: now, slopeKgPerWeek: slopeWk, message: 'Your trend is not heading toward your goal at the moment, so a date would be a guess. Check the plateau tips.' };
  const days = (rate) => (rate > 0.002 ? Math.min(MAX_DAYS, Math.ceil(Math.abs(remaining) / rate)) : null);
  const early = days(fast), likely = days(mid), late = days(slow);
  const cone = [];
  const horizon = Math.min(MAX_DAYS, late === null ? 182 : late + 7);
  for (let t = 0; t <= horizon; t += 7) {
    const clamp = (w) => (dir < 0 ? Math.max(w, g) : Math.min(w, g));
    cone.push({ date: addDays(today, t), mid: r1(clamp(now + dir * mid * t)), fast: r1(clamp(now + dir * fast * t)), slow: r1(clamp(now + dir * slow * t)) });
  }
  const fmt = (d) => (d === null ? null : addDays(today, d));
  return {
    status: 'ok', nowKg: now, goalKg: g, slopeKgPerWeek: slopeWk,
    earliest: fmt(early), likely: fmt(likely), latest: fmt(late), latestOpen: late === null || late >= MAX_DAYS,
    cone, message: late === null || late >= MAX_DAYS ? 'The later end is open-ended at your current pace, so treat the earliest date as a hope, not a promise.' : 'A range, not a promise. It moves as your trend does.',
  };
}

// ---------------------------------------------------------------- 6. coach that learns
const CAP = 40;
/** learn = { key: {shown, accepted} }; action 'shown' | 'accepted'. Halves counts past the cap so old habits fade. */
function learnRecord(learn = {}, key, action) {
  const k = String(key || '').slice(0, 60); if (!k || !['shown', 'accepted'].includes(action)) return learn;
  const cur = { shown: 0, accepted: 0, ...(learn[k] || {}) };
  cur[action] += 1;
  if (cur.shown > CAP) { cur.shown = Math.ceil(cur.shown / 2); cur.accepted = Math.floor(cur.accepted / 2); }
  if (cur.accepted > cur.shown) cur.shown = cur.accepted;
  return { ...learn, [k]: cur };
}
/** 0.6 (always ignored) … 1.4 (always accepted); 1 with no history. Smoothed so one tap never swings it. */
function learnWeight(learn, key) {
  const e = (learn || {})[key]; if (!e) return 1;
  return Math.round((0.6 + 0.8 * ((e.accepted + 1) / (e.shown + 2))) * 100) / 100;
}
function rankByLearning(items, learn, keyFn, scoreFn = (x) => x.impact || 0) {
  return [...items].sort((a, b) => scoreFn(b) * learnWeight(learn, keyFn(b)) - scoreFn(a) * learnWeight(learn, keyFn(a)));
}

// ---------------------------------------------------------------- 7. weekly treat allowance
/** state.treat = { weeklyKcal, entries:[{date,name,kcal}] }. The allowance is set aside inside the weekly budget. */
function treatView({ treat = {}, today }) {
  const allowance = Math.max(0, r0(Number(treat.weeklyKcal) || 0));
  if (!allowance) return { on: false };
  const monday = mondayOf(today);
  const entries = (treat.entries || []).filter((e) => e.date >= monday && e.date <= addDays(monday, 6));
  const used = entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
  const left = Math.max(0, allowance - used);
  const message = used === 0 ? `${allowance} kcal of treats are set aside this week. Enjoy them guilt-free.`
    : left > 0 ? `${used} of ${allowance} kcal of treats used, ${left} left to enjoy.`
      : 'Your treat allowance is used. Anything more simply comes out of the regular budget; nothing to worry about.';
  return { on: true, allowance, used, left, entries, message, todayKcal: entries.filter((e) => e.date === today).reduce((s, e) => s + e.kcal, 0) };
}
/** Sets the unused allowance aside from the rest of the week's everyday budget. Never produces a failure state. */
function applyTreat(weekBudget, tv) {
  if (!weekBudget || !tv || !tv.on) return weekBudget;
  const perDayLeft = Math.round((weekBudget.budget - weekBudget.usedBeforeToday - tv.left) / weekBudget.daysLeft);
  return { ...weekBudget, treatReserved: tv.left, perDayLeft, diffPerDay: perDayLeft - weekBudget.dailyTarget };
}

module.exports = {
  ROUGH_ACTIONS, roughDayView, roughKeptDates,
  EXPERIMENTS, rollExperiment, tickExperiment, skipExperiment, resultOf,
  explainJump, sleepEating, SLEEP_MIN, goalRange,
  learnRecord, learnWeight, rankByLearning, treatView, applyTreat, mondayOf,
};
