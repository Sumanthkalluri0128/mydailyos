// Body plan: ADAPTATION. The weekly program from lib/trainingPlan is a starting point; this module reads what the person actually did
// (sessions logged on the Body plan screen, other workouts in the activity log, weigh-ins, waist tape) and works out THIS week:
// which session is next, what to lift, how many sets, whether to ease off, catch up, or step up, and why.
// Pure (no database), deterministic, unit-tested. Every change comes with a plain "why", and nothing here edits calories (the app's
// own weight-trend engine does that); it only gives training advice and, for the person to accept with one tap, setup changes.
//
// Rules in one place (each is a widely used coaching rule of thumb, not a diagnosis):
//   * Double progression per exercise: add reps up to the top of the range, then add the smallest weight step (+2 kg upper, +5 kg lower).
//   * Two sessions in a row 2+ reps down = tired, not weak: keep the weight, cut one set.
//   * Easy week by evidence (hard sessions, regressions, pain) or by cadence (every 5 or 6 training weeks), never twice in a row.
//   * After a break: 8-14 days away = loads x0.95, 15-28 = x0.9, over 28 = x0.8 and a relearn week. Detraining is quick, regaining is quicker.
//   * Sets move by one at a time, only where a muscle is under its weekly range, only when recovery looks good, and never above the range.
//   * A skipped lift is moved to a free day when that keeps a rest day and no 3 lifting days in a row; otherwise it is let go (no doubling up).
//   * Extra workouts count. Several weeks of doing more than planned with good recovery = offer one more day; more lifting on top of a full
//     week of sets = say so honestly, more is not better.
//   * Cardio ramps from what was done last week (+10 minutes), not from the calendar.
const { addDays, diffDays, weekday } = require('./dates');
const { smoothTrend, trendRate, maxSafeWeeklyLossKg } = require('./trendWeight');

const r1 = (x) => Math.round(x * 10) / 10;
const r05 = (x) => Math.round(x * 2) / 2;
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LOWER = new Set(['squat', 'hinge', 'lunge', 'glute', 'quad', 'ham', 'calf']);
const PAIN_AREAS = ['knee', 'back', 'shoulder', 'wrist', 'elbow'];
const mondayOf = (date) => addDays(date, -((weekday(date) + 6) % 7));

// ------------------------------------------------------------------------------------------------------------------ session records
/** A logged session counts fully when done, half when partial, nothing when skipped. */
const credit = (s) => (s.status === 'done' ? 1 : s.status === 'partial' ? 0.5 : 0);

/** Other workouts from the activity log that were not logged through the Body plan: lifting counts, cardio adds minutes. */
function otherActivity(activity, sessionDates) {
  const out = { strengthDays: new Map(), cardioMin: new Map() };
  for (const a of activity || []) {
    if (!a || !a.date || String(a.clientId || '').startsWith('bp-')) continue; // rows the Body plan wrote itself are already counted
    const wk = mondayOf(a.date);
    const sets = (a.sets || []).filter((s) => num(s.reps) > 0).length;
    const strengthLike = /strength|weight/i.test(a.category || '') || sets > 0;
    if (strengthLike) {
      if (sessionDates.has(a.date)) continue;
      const cur = out.strengthDays.get(a.date) || { week: wk, sets: 0, minutes: 0 };
      cur.sets += sets; cur.minutes += num(a.durationMinutes);
      out.strengthDays.set(a.date, cur);
    } else out.cardioMin.set(wk, (out.cardioMin.get(wk) || 0) + num(a.durationMinutes));
  }
  return out;
}
const strengthCredit = (d) => (d.sets >= 8 || d.minutes >= 30 ? 1 : 0.5);

// ------------------------------------------------------------------------------------------------------------------ per-exercise targets
function stepFor(slot, weightKg) {
  const lower = LOWER.has(slot);
  const s = lower ? (weightKg >= 40 ? 5 : 2.5) : weightKg >= 10 ? 2 : 1;
  return Math.max(0.5, Math.min(s, r05(weightKg * 0.1))); // never more than +10 % in one jump
}

/** What was done for one exercise in one logged session: the working weight and the reps at it. */
function performance(rec, ex) {
  const sets = (ex.sets || []).filter((s) => num(s.reps) > 0 || num(s.seconds) > 0);
  if (!sets.length) return null;
  const val = (s) => (num(s.reps) > 0 ? num(s.reps) : num(s.seconds));
  const top = Math.max(...sets.map((s) => num(s.weightKg)));
  const atTop = sets.filter((s) => num(s.weightKg) === top);
  return { date: rec.date, weightKg: top, reps: atTop.map(val), allReps: sets.map(val), n: sets.length, feel: rec.feel || '', phase: rec.phase || '' };
}

function targetFor(allHist, ex, phase) {
  // Easy weeks and return weeks are lighter on purpose, so progress is judged from the last normal sessions, not from them.
  const normal = allHist.filter((h) => h.phase !== 'easy' && h.phase !== 'back');
  const hist = normal.length ? normal : allHist;
  const hi = ex.repsHi, lo = ex.repsLo;
  const baseSets = ex.sets;
  const last = hist[hist.length - 1];
  if (!last) return { action: 'start', weightKg: null, reps: lo, sets: baseSets, last: null, note: ex.weightHint || 'Find a weight where the last rep of the last set still leaves reps in reserve.' };
  const bodyweight = last.weightKg === 0;
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  const prev2 = hist.length > 2 ? hist[hist.length - 3] : null;
  const lastInfo = { date: last.date, weightKg: last.weightKg, reps: Math.min(...last.reps) };
  const doneAllSets = last.n >= Math.max(2, baseSets - 1);
  const allAtTop = doneAllSets && last.reps.length >= Math.max(2, baseSets - 1) && last.reps.every((r) => r >= hi);
  const total = (h) => h.reps.reduce((a, b) => a + b, 0);
  const dropped = prev && prev2 && prev.weightKg === last.weightKg && prev2.weightKg === last.weightKg && total(prev) <= total(prev2) - 2 && total(last) <= total(prev) - 2;

  let t;
  if (dropped) t = { action: 'recover', weightKg: last.weightKg, reps: lo, sets: Math.max(2, baseSets - 1), note: 'Your reps dipped two sessions in a row. That is tiredness, not weakness. Same weight, one set fewer this week, then build again.' };
  else if (allAtTop && bodyweight) t = { action: 'harder', weightKg: 0, reps: lo, sets: baseSets, note: ex.swaps && ex.swaps.harder ? `Every set reached ${hi}. Time for a harder version: ${ex.swaps.harder.name}.` : `Every set reached ${hi}. Slow the tempo (3 seconds down) or add a loaded backpack, and start again at ${lo}.` };
  else if (allAtTop) { const w = r05(last.weightKg + stepFor(ex.slot, last.weightKg)); t = { action: 'addWeight', weightKg: w, reps: lo, sets: baseSets, note: `Every set reached ${hi} at ${last.weightKg} kg. Add a small step to ${w} kg and start again at ${lo} reps.` }; }
  else {
    const low = Math.min(...last.reps);
    const reps = clamp(low + 1, lo, hi);
    t = { action: 'addRep', weightKg: last.weightKg, reps, sets: baseSets, note: bodyweight ? `Last time ${low} on your weakest set. Aim for ${reps} on every set.` : `Last time ${low} reps at ${last.weightKg} kg on your weakest set. Aim for ${reps} on every set at the same weight.` };
  }
  t.last = lastInfo;
  // The phase changes how much to lift, never how well you did: easy week and return weeks are lighter, then the build resumes.
  if (t.weightKg > 0 && phase.loadFactor < 1 && t.action !== 'recover') {
    const base = t.action === 'addWeight' ? last.weightKg : t.weightKg;
    t.weightKg = r05(base * phase.loadFactor); t.reps = clamp(Math.min(...last.reps), lo, hi);
    t.note = `${phase.name === 'Easy week' ? 'Easy week' : 'Ramping back in'}: about ${Math.round(phase.loadFactor * 100)} percent of your last weight, ${t.weightKg} kg. ${t.action === 'addWeight' ? `Next block starts at ${r05(last.weightKg + stepFor(ex.slot, last.weightKg))} kg.` : 'Then build again.'}`;
    t.action = 'ease';
  }
  if (phase.setDelta < 0) t.sets = Math.max(2, t.sets + phase.setDelta);
  return t;
}

// ------------------------------------------------------------------------------------------------------------------ the engine
/**
 * @param o.program   plan.training.program from lib/trainingPlan
 * @param o.prefs     the person's setup ({days, level, limits, ...})
 * @param o.mode      'lose' | 'recomp' | 'build'
 * @param o.today     'YYYY-MM-DD' (the person's local date)
 * @param o.startedOn when the person saved this plan ('YYYY-MM-DD'); falls back to the first session
 * @param o.sessions  BodyPlanSession-like rows (any order): {date, sessionId, status, reason, feel, pain[], phase, exercises[{id, slot, done, sets[]}]}
 * @param o.activity  ActivityLog-like rows: {date, category, durationMinutes, sets, clientId}
 * @param o.weights   [{date, weightKg}]    o.waists [{date, value}] (cm)
 * @param o.paceKgPerWeek planned loss pace (lose mode)    o.maxDays the most days a week this person should train
 */
function adapt({ program, prefs = {}, mode = 'recomp', today, startedOn, sessions = [], activity = [], weights = [], waists = [], paceKgPerWeek = 0, maxDays = 5 } = {}) {
  if (!program || !today) return null;
  const planned = program.daysPerWeek;
  const weekStart = mondayOf(today);
  const recs = sessions.filter((s) => s && s.date && s.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const done = recs.filter((s) => credit(s) > 0);
  const sessionDates = new Set(recs.map((s) => s.date));
  const other = otherActivity(activity, sessionDates);
  const start = startedOn || (done[0] && done[0].date) || today;

  // ---- weeks: the last 4 plus this one
  const trainOffsets = program.week.map((d, i) => (d.kind === 'train' ? i : -1)).filter((i) => i >= 0);
  const weeks = [];
  for (let k = 26; k >= 0; k -= 1) {
    const ws = addDays(weekStart, -7 * k), we = addDays(ws, 6);
    if (we < start) continue; // before the plan began
    const due = trainOffsets.filter((o) => { const d = addDays(ws, o); return d >= start && (k > 0 || d < today); }).length;
    const inWeek = done.filter((s) => s.date >= ws && s.date <= we);
    let got = inWeek.reduce((t, s) => t + credit(s), 0);
    let fromLog = 0;
    for (const [d, v] of other.strengthDays) if (v.week === ws && d <= today) fromLog += strengthCredit(v);
    got += fromLog;
    const plannedFull = trainOffsets.filter((o) => addDays(ws, o) >= start).length;
    weeks.push({ weekStart: ws, planned: plannedFull, due, done: r1(got), extra: r1(Math.max(0, got - plannedFull)), sessions: inWeek.length, cardioMin: other.cardioMin.get(ws) || 0, current: k === 0 });
  }
  const past = weeks.filter((w) => !w.current && w.planned > 0);   // every full week since the plan began (up to 26)
  const recent = past.slice(-4);                                      // adherence looks at the last 4 weeks only
  const duePast = recent.reduce((t, w) => t + w.planned, 0);
  const gotPast = recent.reduce((t, w) => t + Math.min(w.done, w.planned), 0);
  const adherence = duePast ? clamp(gotPast / duePast, 0, 1) : null;
  const extraAvg = recent.length ? recent.slice(-3).reduce((t, w) => t + w.extra, 0) / Math.min(3, recent.length) : 0;

  const lastLift = [...done.map((s) => s.date), ...[...other.strengthDays.keys()]].sort().pop() || null;
  const gapDays = lastLift ? diffDays(lastLift, today) : null;
  const everLifted = !!lastLift;

  // ---- history per exercise, newest last
  const byId = new Map();
  for (const rec of done) for (const ex of rec.exercises || []) {
    if (ex.done === false) continue;
    const p = performance(rec, ex);
    if (p) { if (!byId.has(ex.id)) byId.set(ex.id, []); byId.get(ex.id).push(p); }
  }
  const recentRecs = done.slice(-6);
  const hardShare = recentRecs.length ? recentRecs.filter((s) => s.feel === 'hard').length / recentRecs.length : 0;
  const painRecent = done.filter((s) => s.date >= addDays(today, -14)).flatMap((s) => s.pain || []);

  // ---- phase: counted in weeks the person really trained, restarted after a long break or an easy week
  const trained = past.filter((w) => w.done >= Math.max(1, Math.ceil(w.planned * 0.5)));
  const lastEasyWeek = [...past].reverse().find((w) => done.some((s) => s.date >= w.weekStart && s.date <= addDays(w.weekStart, 6) && s.phase === 'easy'));
  const afterEasy = lastEasyWeek ? trained.filter((w) => w.weekStart > lastEasyWeek.weekStart).length : trained.length;
  const every = (program.progression && program.progression.deloadEveryWeeks) || 6;
  const learnWeeks = prefs.level === 'beginner' ? 2 : prefs.level === 'intermediate' ? 1 : 0;
  const easyLastWeek = done.some((s) => s.phase === 'easy' && s.date >= addDays(weekStart, -7) && s.date < weekStart);
  const easyThisWeek = done.some((s) => s.phase === 'easy' && s.date >= weekStart);   // an easy week stays easy until Sunday
  const backThisWeek = done.some((s) => s.phase === 'back' && s.date >= weekStart);
  const regress = [...byId.entries()].filter(([, h]) => h.length >= 3 && (() => { const t = (x) => x.reps.reduce((a, b) => a + b, 0); const [a, b, c] = h.slice(-3); return a.weightKg === c.weightKg && b.weightKg === c.weightKg && t(b) <= t(a) - 2 && t(c) <= t(b) - 2; })()).map(([id]) => id);
  const fatigue = (recentRecs.length >= 3 && hardShare >= 0.5) || regress.length >= 2 || painRecent.length >= 2;

  let name = 'Build', loadFactor = 1, setDelta = 0, rirAdd = 0, why = '', tier;
  if (!everLifted) tier = diffDays(start, today) >= 14 ? 'restart' : 'new';
  else if (gapDays >= 10) tier = 'returning';
  else if (adherence === null) tier = 'new';
  else if (extraAvg >= 1 && adherence >= 0.9 && recent.length >= 3) tier = 'ahead';
  else if (adherence >= 0.85) tier = 'strong';
  else if (adherence >= 0.6) tier = 'steady';
  else if (adherence >= 0.3) tier = 'slipping';
  else tier = 'restart';

  if (easyThisWeek) {
    name = 'Easy week'; loadFactor = 0.9; setDelta = -1; rirAdd = 1;
    why = 'You are in your easy week: about 10 percent lighter, one set fewer. Finish it, then build again.';
  } else if (backThisWeek) {
    name = 'Welcome back'; loadFactor = 0.9; rirAdd = 1;
    why = 'You are easing back in this week: a little lighter than before, then you build again.';
  } else if (tier === 'returning') {
    name = 'Welcome back';
    loadFactor = gapDays > 28 ? 0.8 : gapDays > 14 ? 0.9 : 0.95; rirAdd = 1; setDelta = gapDays > 28 ? -1 : 0;
    why = `${gapDays} days since your last lift. Strength fades a little in a break and comes back fast. Start at about ${Math.round(loadFactor * 100)} percent of your last weights${gapDays > 28 ? ' with one set fewer' : ''}, keep 1 more rep in reserve, and build again from here.`;
  } else if (fatigue && !easyLastWeek && everLifted) {
    name = 'Easy week'; loadFactor = 0.9; setDelta = -1; rirAdd = 1;
    why = painRecent.length >= 2 ? 'You reported discomfort in two recent sessions, so this week is lighter while it settles.' : regress.length >= 2 ? 'Reps have slipped on two or more lifts for two sessions in a row. That is tiredness, so this week is lighter and you come back stronger.' : 'Most of your recent sessions felt hard. A lighter week now protects the progress you are making.';
  } else if (everLifted && afterEasy + 1 >= every && !easyLastWeek) {
    name = 'Easy week'; loadFactor = 0.9; setDelta = -1; rirAdd = 1;
    why = `This is training week ${afterEasy + 1} since your last easy week. A lighter week on schedule keeps joints and energy fresh. Weights are about 10 percent lighter, one set fewer.`;
  } else if (everLifted && afterEasy < learnWeeks) {
    name = 'Learn the moves'; rirAdd = 1;
    why = 'Your first weeks are for learning the movements and finding your weights. Stay smooth and stop with reps left.';
  } else why = tier === 'new' ? 'Your first session sets the starting weights. Stop each set with the reps in reserve shown, and log what you lift.' : 'Build week: add a rep or a small step of weight where the plan says so.';

  const phase = { name, loadFactor, setDelta, rirAdd, why, trainingWeeksSinceEasy: afterEasy, easyEvery: every, key: name === 'Easy week' ? 'easy' : name === 'Welcome back' ? 'back' : name === 'Learn the moves' ? 'learn' : 'build' };

  // ---- targets for every exercise in the program (main, home and quick versions)
  const targets = {};
  const allEx = [...program.sessions.flatMap((s) => [...s.exercises, ...(s.homeBackup ? s.homeBackup.exercises : []), ...(s.quick ? s.quick.exercises : [])])];
  for (const ex of allEx) if (!targets[ex.id]) targets[ex.id] = targetFor(byId.get(ex.id) || [], ex, phase);

  // ---- sets: add one where a muscle is under its range, recovery is good and the person is consistent (never above the range)
  const boosted = [];
  const canAdd = !fatigue && phase.key === 'build' && adherence !== null && adherence >= 0.85 && recent.length >= 3 && hardShare <= 0.34 && !regress.length;
  if (canAdd) {
    const room = new Map(program.volume.filter((v) => v.status === 'low' || (v.status === 'ok' && v.weeklySets <= v.target[0] + 1 && mode !== 'lose')).map((v) => [v.group, v.target[1] - v.weeklySets]));
    for (const s of program.sessions) for (const ex of s.exercises) {
      const g = ex.targets[0];
      const t = targets[ex.id];
      if (!t || t.action === 'start' || t.action === 'recover' || ex.sets >= 5) continue;
      if ((room.get(g) || 0) >= 1) { t.sets += 1; room.set(g, room.get(g) - 1); boosted.push({ id: ex.id, name: ex.name, group: g }); t.note += ' Plus one extra set: you are consistent and this muscle is under its weekly range.'; }
    }
  }

  // ---- this week, day by day, and what is next
  const sessionById = new Map(program.sessions.map((s) => [s.id, s]));
  const lastDoneOf = new Map();
  for (const s of done) lastDoneOf.set(s.sessionId, s.date);
  const rotation = [...program.sessions].sort((a, b) => (lastDoneOf.get(a.id) || '0000').localeCompare(lastDoneOf.get(b.id) || '0000') || a.id.localeCompare(b.id));
  const nextSession = rotation[0];
  const days = program.week.map((d, i) => {
    const date = addDays(weekStart, i);
    const rec = recs.find((s) => s.date === date && credit(s) > 0);
    const skipped = recs.find((s) => s.date === date && s.status === 'skipped');
    const log = other.strengthDays.get(date);
    let status = 'upcoming', note = '';
    if (rec) status = rec.status === 'partial' ? 'partial' : 'done';
    else if (log) status = 'done', note = 'Logged from your workouts';
    else if (skipped) status = 'skipped', note = skipped.reason === 'sick' ? 'Rest was the right call.' : skipped.reason === 'pain' ? 'Rest and let it settle.' : '';
    else if (date === today) status = 'today';
    else if (date < today) status = d.kind === 'train' && date >= start ? 'notdone' : 'past';
    if ((rec || log) && d.kind !== 'train') status = 'extra';
    return { day: DAY[i], date, kind: d.kind, sessionId: d.sessionId || null, label: d.label, status, note };
  });
  // Re-plan the rest of the week: sessions still owed slide onto the next open days (calendar lifting days first, then the free day with
  // the most space around it), always in rotation order, never three lifting days in a row, never Sunday (the full rest day).
  const isDone = (i) => ['done', 'partial', 'extra'].includes(days[i].status);
  const cur0 = weeks[weeks.length - 1];
  const owed = cur0 ? Math.max(0, Math.ceil(cur0.planned - cur0.done - 0.01)) : 0;
  const lifts = new Set(days.map((d, i) => (isDone(i) ? i : -1)).filter((i) => i >= 0));
  const fits = (i) => !(lifts.has(i - 1) && lifts.has(i - 2)) && !(lifts.has(i + 1) && lifts.has(i + 2)) && !(lifts.has(i - 1) && lifts.has(i + 1));
  const open = (i) => i !== 6 && days[i].date >= today && !isDone(i) && days[i].status !== 'skipped';
  const chosen = [];
  for (let i = 0; i < 7 && chosen.length < owed; i += 1) if (days[i].kind === 'train' && open(i) && fits(i)) { chosen.push(i); lifts.add(i); }
  while (chosen.length < owed) {
    let best = -1, bestGap = -1;
    for (let i = 0; i < 7; i += 1) {
      if (!open(i) || lifts.has(i) || !fits(i)) continue;
      const gap = Math.min(9, ...[...lifts].map((j) => Math.abs(i - j)));
      if (gap > bestGap) { best = i; bestGap = gap; }
    }
    if (best < 0) break;
    chosen.push(best); lifts.add(best);
  }
  chosen.sort((a, b) => a - b);
  const queue = rotation.map((x) => x.id);
  chosen.forEach((i, k) => {
    const id = queue[k], d = days[i];
    const shifted = d.sessionId !== id || d.kind !== 'train';
    const was = d.kind;
    Object.assign(d, { kind: 'train', sessionId: id, label: sessionById.get(id).title, minutes: sessionById.get(id).minutes, status: d.date === today ? 'today' : 'planned', shifted });
    d.note = was !== 'train' ? `${d.label} added here to keep your week on track.` : shifted ? `${d.label}: carried forward so every session still happens.` : '';
  });
  const fitsAll = chosen.length >= owed;
  for (const d of days) {
    if (d.status === 'notdone') d.note = owed > 0 && fitsAll ? 'Not done. It slides along, so nothing is lost.' : 'Not done. No need to double up; your next session picks up from here.';
    else if (d.kind === 'train' && d.date >= today && !chosen.includes(days.indexOf(d)) && !isDone(days.indexOf(d)) && d.status !== 'skipped') { d.status = 'spare'; d.note = 'Optional: you are ahead of plan this week.'; }
  }
  const nextIdx = chosen.find((i) => days[i].date >= today);
  const nextUp = nextIdx !== undefined ? { sessionId: days[nextIdx].sessionId, day: days[nextIdx].day, date: days[nextIdx].date, title: days[nextIdx].label } : null;

  const todayIdx = days.findIndex((d) => d.date === today);
  const todayDay = days[todayIdx];
  const doneToday = isDone(todayIdx);
  let todaySuggestion;
  if (doneToday) todaySuggestion = { kind: 'done', text: 'Today is done. Nice work. Walk, stretch, eat well.' };
  else if (todayDay.status === 'skipped') todaySuggestion = { kind: 'rest', text: 'Rest today. Coming back fresh beats pushing through.' };
  else if (chosen.includes(todayIdx)) {
    const t = sessionById.get(todayDay.sessionId).title;
    todaySuggestion = { kind: 'train', sessionId: todayDay.sessionId, text: tier === 'returning' || phase.key === 'back' ? `${t}, a little lighter than before. Easing back in beats rushing.` : todayDay.shifted ? `${t} is up today, carried forward from earlier in the week.` : `Today: ${t}.` };
  } else if (nextUp) todaySuggestion = { kind: 'rest', text: `${todayDay.kind === 'active' ? 'Easy cardio or a walk today.' : 'Rest day. Walk, stretch, sleep well.'} Next lift: ${nextUp.title} on ${nextUp.day}.` };
  else todaySuggestion = { kind: 'rest', text: todayDay.kind === 'active' ? 'Easy cardio or a walk today. Lifting again tomorrow is better than lifting tired.' : 'Rest day. Walk, stretch, sleep well.' };
  const anyTrainAnyway = !doneToday && !chosen.includes(todayIdx) && nextSession ? { sessionId: nextSession.id, title: nextSession.title, note: lastLift && diffDays(lastLift, today) < 1 ? 'You lifted yesterday, so give those muscles a day.' : 'You can train today. The next session on your rotation is ready.' } : null;

  // ---- cardio ramps from what was actually done
  const cur = weeks[weeks.length - 1];
  const prevW = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const c = program.cardio;
  const cardioTarget = prevW && prevW.cardioMin >= 0.7 * c.startMinutes ? clamp(Math.round((prevW.cardioMin + 10) / 5) * 5, c.startMinutes, c.weeklyEasyMinutes) : c.startMinutes;
  const cardio = { targetMin: cardioTarget, doneMin: cur ? Math.round(cur.cardioMin) : 0, fullTargetMin: c.weeklyEasyMinutes };

  // ---- body feedback: weight, waist, strength
  const series = smoothTrend(weights);
  const rate = trendRate(series, today, 21); // kg per week (negative = losing)
  const wNow = series.length ? series[series.length - 1].trendKg : null;
  const wasteSorted = [...waists].filter((w) => num(w.value) > 0).sort((a, b) => a.date.localeCompare(b.date));
  const waistRecent = wasteSorted.filter((w) => w.date >= addDays(today, -35));
  const waistChange = waistRecent.length >= 2 ? r1(waistRecent[waistRecent.length - 1].value - waistRecent[0].value) : null;
  const progressing = [...byId.keys()].filter((id) => ['addWeight', 'addRep', 'harder'].includes((targets[id] || {}).action)).length;
  const body = { weightTrendKg: wNow, ratePerWeekKg: rate, waistChangeCm: waistChange, liftsProgressing: progressing, liftsTracked: byId.size, verdict: null, detail: '' };
  const changes = [], suggestions = [];
  const weeklyPct = wNow && rate !== null ? (rate / wNow) * 100 : null;
  if (rate === null) { body.verdict = 'need-data'; body.detail = 'Weigh in once or twice a week for a few weeks and this card tells you if the plan is working.'; }
  else if (mode === 'lose') {
    const loss = -rate, plan = paceKgPerWeek || 0.5, cap = maxSafeWeeklyLossKg(wNow);
    if (loss > cap * 1.1) { body.verdict = 'too-fast'; body.detail = `Weight is falling about ${r1(loss)} kg a week, faster than the ${cap} kg a week the plan allows. Fast loss costs muscle. Eat a little more and keep lifting.`; suggestions.push({ id: 'eat-more', title: 'Losing faster than planned', detail: body.detail, why: 'Keeping your strength while the scale drops means the loss is fat, not muscle.' }); }
    else if (loss >= plan * 0.6) { body.verdict = 'on-track'; body.detail = `Weight is trending down about ${r1(Math.max(0, loss))} kg a week against ${plan} planned. ${progressing ? 'Your lifts are holding or rising, a good sign the loss is fat.' : ''}`.trim(); }
    else if (adherence !== null && adherence < 0.6) { body.verdict = 'slow-consistency'; body.detail = 'Weight is moving slower than planned, and training has been inconsistent. Getting back to your sessions is the first lever, before changing food.'; }
    else if (loss <= 0.05 && (waistChange === null || waistChange >= -0.5)) { body.verdict = 'stalled'; body.detail = 'Weight and waist have held for about 3 weeks. Add 1,000 steps a day first. If it still holds after 2 weeks, the app can trim calories a little.'; suggestions.push({ id: 'steps-up', title: 'Add 1,000 steps a day', detail: body.detail, why: 'Steps burn calories without costing recovery or muscle, so they come before cutting food.' }); }
    else { body.verdict = 'slow'; body.detail = `Weight is down about ${r1(Math.max(0, loss))} kg a week, a little under the ${plan} planned. That is still progress.${waistChange !== null && waistChange < 0 ? ` Your waist is down ${Math.abs(waistChange)} cm, which counts more than the scale.` : ''}`; }
  } else if (mode === 'build') {
    if (weeklyPct > 0.5) { body.verdict = 'gaining-fast'; body.detail = 'Weight is rising faster than muscle can be built, so part of it is fat. Trim food a little or add steps.'; }
    else if (weeklyPct >= 0.05) { body.verdict = 'on-track'; body.detail = 'Weight is rising slowly, which is how lean gain looks.'; }
    else if (adherence !== null && adherence >= 0.7 && done.length >= 6) { body.verdict = 'flat'; body.detail = 'Weight has held for 3 weeks while you train well. To build, eat about 150 calories more a day, mostly protein and carbs.'; suggestions.push({ id: 'eat-more-build', title: 'Eat a little more to build', detail: body.detail, why: 'Muscle needs a small surplus. Set a target weight above your current one in Goals to give the app a surplus.' }); }
    else { body.verdict = 'flat'; body.detail = 'Weight is steady. Consistent sessions come first.'; }
  } else {
    if (Math.abs(rate) <= 0.2) { body.verdict = 'steady'; body.detail = `Weight is steady${waistChange !== null && waistChange < 0 ? ` and your waist is down ${Math.abs(waistChange)} cm: shape is changing at the same weight` : progressing ? ', and your lifts are rising: that is how shape changes at the same weight' : ''}.`; }
    else { body.verdict = rate < 0 ? 'drifting-down' : 'drifting-up'; body.detail = rate < 0 ? 'Weight is drifting down a little. If you want to keep your weight, eat slightly more.' : 'Weight is drifting up a little. If you want to hold steady, add steps or trim a snack.'; }
  }

  // ---- headline
  const pctTxt = adherence === null ? null : Math.round(adherence * 100);
  const status = ({
    new: { headline: 'Let us get your first session logged', detail: 'The plan learns from what you lift. After your first session it sets weights, and after a week it starts adjusting.' },
    returning: { headline: 'Welcome back', detail: phase.why },
    ahead: { headline: 'You are ahead of plan', detail: `You have done more than planned for ${Math.min(3, recent.length)} weeks. If energy is good, one more day a week would fit. Do not add more than that: recovery is where you grow.` },
    strong: { headline: 'Right on track', detail: `${pctTxt}% of planned sessions done over the last ${recent.length} week${recent.length > 1 ? 's' : ''}. The plan is moving up as you do.` },
    steady: { headline: 'Steady progress', detail: `${pctTxt}% of planned sessions done lately. That is enough to progress. A short Quick 20 on a busy day keeps the habit.` },
    slipping: { headline: 'A lighter stretch', detail: `${pctTxt}% of planned sessions done lately, and that is fine: life happens. This week keeps the key lifts and trims the extras, so each session is shorter and still counts.` },
    restart: { headline: 'A fresh start', detail: 'Training has been quiet. Start with just two short sessions this week. The 10-minute floor counts, and momentum comes back faster than you think.' },
  })[tier];

  // ---- changes this week (what moved and why), then suggestions the person can accept
  if (phase.key !== 'build') changes.push({ id: 'phase', title: phase.name, detail: phase.why });
  if (boosted.length) changes.push({ id: 'sets-up', title: `One extra set on ${boosted.length} lift${boosted.length > 1 ? 's' : ''}`, detail: `${boosted.map((b) => b.name).join(', ')}. You have been consistent and these muscles are under their weekly range.` });
  const upCount = Object.values(targets).filter((t) => t.action === 'addWeight').length;
  if (upCount) changes.push({ id: 'weight-up', title: `Heavier on ${upCount} lift${upCount > 1 ? 's' : ''}`, detail: 'You reached the top of the rep range on every set, so the weight goes up by a small step and reps restart at the bottom.' });
  if (regress.length) changes.push({ id: 'recover', title: 'One set fewer where reps dipped', detail: 'Two sessions in a row came in 2 or more reps lower. Same weight, one set fewer, then build again.' });
  if (tier === 'slipping' || tier === 'restart') changes.push({ id: 'trim', title: 'Shorter sessions this week', detail: 'Do the first 4 to 5 exercises of each session, or the Quick 20. The big lifts come first, so they are never the ones that get dropped.' });
  const shiftedDays = days.filter((d) => d.shifted && d.date >= today);
  if (shiftedDays.length) changes.push({ id: 'move', title: 'Your week shifted', detail: shiftedDays.map((d) => `${d.day}: ${d.label}`).join(', ') + '. Sessions slide to the next open day so you still get the full week, with a rest day kept.' });

  if (tier === 'ahead' && planned < maxDays) suggestions.push({ id: 'add-day', title: `Make it ${planned + 1} days a week`, detail: `You have been doing about ${r1(planned + extraAvg)} sessions a week with good recovery. The plan can add a day and spread the work.`, why: 'More days only help when recovery keeps up. Your sessions have not felt hard, so there is room.', apply: { prefs: { days: planned + 1 } } });
  if (tier === 'ahead' && planned >= maxDays) suggestions.push({ id: 'ahead-hold', title: 'Keep your week as it is', detail: `You are already at ${planned} days, the most this plan recommends for you. Extra effort goes into your weights and food, not more sessions.`, why: 'Past this point extra sessions add tiredness faster than muscle.' });
  if (prefs.level === 'beginner' && recent.length >= 3 && trained.length >= 12 && adherence >= 0.8) suggestions.push({ id: 'level-up', title: 'Move up to some experience', detail: 'You have trained steadily for 12 weeks or more. The next level uses heavier, lower-rep main lifts and more weekly sets.', why: 'Beginner gains slow down. A stronger program keeps progress going.', apply: { prefs: { level: 'intermediate' } } });
  const painCount = {};
  for (const p of painRecent) painCount[p] = (painCount[p] || 0) + 1;
  for (const area of PAIN_AREAS) if (painCount[area] >= 2 && !(prefs.limits || []).includes(area)) suggestions.push({ id: `pain-${area}`, title: `Remove moves that load your ${area}`, detail: `You noted ${area} discomfort in two recent sessions. The plan can swap out the moves that commonly aggravate it.`, why: 'Training around a sore joint beats pushing through it. If it lasts more than two weeks, see a physiotherapist.', apply: { prefs: { limits: [...(prefs.limits || []), area] } } });
  if (painRecent.includes('dizzy')) suggestions.unshift({ id: 'dizzy', title: 'Stop and check with a doctor', detail: 'You noted dizziness, chest pressure or unusual breathlessness while training. Stop lifting until a doctor has checked it.', why: 'These can be signs of something that needs attention.', level: 'alert' });
  if (fatigue && !easyLastWeek && phase.key === 'easy') suggestions.push({ id: 'sleep', title: 'Check sleep and protein this week', detail: 'Hard sessions and dipping reps usually trace back to sleep under 7 hours or too little protein.', why: 'Recovery is where strength is built.' });
  const stalled = [...byId.entries()].filter(([, h]) => h.length >= 4 && h.slice(-4).every((x) => x.weightKg === h[h.length - 1].weightKg && Math.min(...x.reps) <= Math.min(...h[h.length - 4].reps))).map(([id]) => id);
  for (const id of stalled.slice(0, 2)) {
    const ex = allEx.find((e) => e.id === id);
    const alt = ex && ex.swaps && ex.swaps.busy && ex.swaps.busy[0];
    suggestions.push({ id: `stall-${id}`, title: `${ex ? ex.name : 'One lift'} has held for 4 sessions`, detail: alt ? `Try ${alt.name} for 4 to 6 weeks, then come back to it.` : 'Check sleep and food, then try a variation for 4 to 6 weeks.', why: 'A new angle often restarts progress when a lift stalls.' });
  }
  if (cardio.targetMin > c.startMinutes && cardio.doneMin === 0 && cur && cur.current && weekday(today) >= 3) suggestions.push({ id: 'cardio', title: `Cardio goal this week: ${cardio.targetMin} minutes`, detail: 'Easy cardio counts: a brisk walk is enough.', why: 'Cardio steps up 10 minutes a week from what you managed last week.' });

  return {
    engine: 'adapt-v1', today, weekStart, tier, status,
    phase, adherence: { pct: adherence === null ? null : Math.round(adherence * 100), weeks: weeks.map((w) => ({ weekStart: w.weekStart, planned: w.planned, done: w.done, extra: w.extra })) },
    week: { planned, doneSoFar: cur ? cur.done : 0, extra: cur ? cur.extra : 0, days },
    todayPlan: todaySuggestion, trainAnyway: anyTrainAnyway, nextSessionId: nextSession ? nextSession.id : null,
    nextUp, daysSinceLastLift: gapDays,
    targets, boosted, cardio, body, changes, suggestions,
  };
}

/** Copy of the program with each exercise carrying `next` (today's target) and `setsToday`, so screens only have to show it. */
function applyAdapt(program, a) {
  if (!a) return program;
  const mark = (e) => { const t = a.targets[e.id]; return t ? { ...e, next: t, setsToday: t.sets, effortToday: a.phase.rirAdd ? `Stop with about ${Math.min(5, (e.rir || 3) + a.phase.rirAdd)} reps left` : e.effort } : e; };
  return {
    ...program,
    sessions: program.sessions.map((s) => ({
      ...s, exercises: s.exercises.map(mark),
      homeBackup: s.homeBackup ? { ...s.homeBackup, exercises: s.homeBackup.exercises.map(mark) } : s.homeBackup,
      quick: s.quick ? { ...s.quick, exercises: s.quick.exercises.map(mark) } : s.quick,
    })),
    week: program.week.map((d, i) => ({ ...d, kind: a.week.days[i].kind, sessionId: a.week.days[i].sessionId, label: a.week.days[i].label, date: a.week.days[i].date, status: a.week.days[i].status, statusNote: a.week.days[i].note, shifted: !!a.week.days[i].shifted })),
  };
}

/** After a session is saved: the good news worth showing (heavier, more reps, first time). Compares with earlier sessions only. */
function sessionHighlights(prior, rec) {
  const out = [];
  for (const ex of rec.exercises || []) {
    if (ex.done === false) continue;
    const now = performance(rec, ex);
    if (!now) continue;
    const before = [];
    for (const s of prior || []) for (const e of s.exercises || []) if (e.id === ex.id && e.done !== false) { const p = performance(s, e); if (p) before.push(p); }
    if (!before.length) { out.push({ id: ex.id, name: ex.name, text: 'First time logged. This is your starting point.' }); continue; }
    const bestW = Math.max(...before.map((b) => b.weightKg));
    const bestAtW = (w) => Math.max(0, ...before.filter((b) => b.weightKg === w).map((b) => Math.max(...b.reps)));
    if (now.weightKg > bestW) out.push({ id: ex.id, name: ex.name, text: `Heaviest yet: ${now.weightKg} kg (was ${bestW} kg).` });
    else if (Math.max(...now.reps) > bestAtW(now.weightKg) && bestAtW(now.weightKg) > 0) out.push({ id: ex.id, name: ex.name, text: `More reps at ${now.weightKg} kg: ${Math.max(...now.reps)} (was ${bestAtW(now.weightKg)}).` });
  }
  return out.slice(0, 6);
}

module.exports = { adapt, applyAdapt, sessionHighlights, mondayOf, performance, targetFor, stepFor, PAIN_AREAS };
