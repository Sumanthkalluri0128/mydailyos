// The companion's "brain": pure functions only (no React, no network, no storage) so it can be unit-tested.
// Input is the /api/goals/journey payload that journeyCtx.ts already fetches. It answers:
//   how is the day going compared with where you SHOULD be at this hour (pace)?   -> analyze()
//   what is the single best next move?                                           -> Analysis.top
//   should the character speak up now, and about what?                           -> nudgeFor() / badgeFor()
//   what would it say to a typed question?                                       -> answerLocal() (no server needed)
//   a short 60-second challenge that fits your mood and gaps                     -> dareFor()
export type Mood = 'great' | 'ok' | 'tired' | 'stressed';
export const MOODS: { k: Mood; emoji: string; label: string }[] = [
  { k: 'great', emoji: '🔥', label: 'Pumped' }, { k: 'ok', emoji: '🙂', label: 'Okay' },
  { k: 'tired', emoji: '😴', label: 'Tired' }, { k: 'stressed', emoji: '😖', label: 'Stressed' },
];
export type Kind = 'water' | 'calories' | 'protein' | 'steps' | 'move' | 'weight' | 'habit' | 'other';
export type Pace = 'done' | 'ahead' | 'on' | 'behind' | 'late' | 'over';
export type QuestRead = {
  id: string; kind: Kind; title: string; value: number; target: number; unit: string; pct: number;
  expected: number; gap: number; pace: Pace; left: number; projected: number; hint: string; done: boolean;
};
export type MoveAction = { type: 'water'; ml: number } | { type: 'route'; path: string; params?: Record<string, string> } | { type: 'dare' };
export type Move = { kind: Kind; emoji: string; cta: string; why: string; short: string; action: MoveAction };
export type Tone = 'great' | 'good' | 'push' | 'fresh';
export type Analysis = {
  empty: boolean; hour: number; score: number; verdict: string; tone: Tone; summary: string;
  quests: QuestRead[]; done: number; total: number; allDone: boolean;
  top: Move | null; flags: string[]; wins: string[]; forecast: string;
  streak: { current: number; best: number; atRisk: boolean; toNext: number; next: string };
  level: { level: number; rank: string; xpToNext: number } | null;
  weight: { pct: number; weeksLeft: number; reached: boolean } | null;
  xpLeft: number; mood: Mood | null;
};

export const EMOJI: Record<Kind, string> = { water: '💧', calories: '🍽️', protein: '🥚', steps: '👟', move: '💪', weight: '⚖️', habit: '✅', other: '🎯' };

export function kindOf(q: { id?: string; title?: string }): Kind {
  const t = `${q?.id || ''} ${q?.title || ''}`.toLowerCase();
  if (/water|hydrat/.test(t)) return 'water';
  if (/protein/.test(t)) return 'protein';
  if (/calor|kcal|meal|food|eat/.test(t)) return 'calories';
  if (/step|walk/.test(t)) return 'steps';
  if (/move|exercise|workout|active|train/.test(t)) return 'move';
  if (/weigh/.test(t)) return 'weight';
  if (/habit|task/.test(t)) return 'habit';
  return 'other';
}

// Where you "should" be (0..1) at a given hour, per kind of goal. Piecewise-linear.
const CURVES: Record<Kind, [number, number][]> = {
  water: [[6, 0], [22, 1]],
  steps: [[6, 0], [21, 1]],
  calories: [[6, 0], [9.5, 0.25], [14, 0.6], [20.5, 1]],
  protein: [[6, 0], [9.5, 0.2], [14, 0.55], [20.5, 1]],
  move: [[6, 0], [12, 0.1], [20, 1]],
  weight: [[6, 0], [22, 1]],
  habit: [[7, 0], [21, 1]],
  other: [[7, 0], [21, 1]],
};
export function expectedFrac(kind: Kind, hour: number): number {
  const p = CURVES[kind] || CURVES.other;
  if (hour <= p[0][0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (hour <= p[i][0]) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; return y0 + ((hour - x0) / (x1 - x0)) * (y1 - y0); }
  }
  return 1;
}

const num = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const fmtNum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtHour = (h: number) => { const x = Math.floor(h) % 24; return `${x % 12 || 12} ${x < 12 ? 'am' : 'pm'}`; };

function paceOf(kind: Kind, pct: number, expected: number, done: boolean, hour: number): Pace {
  if (kind === 'calories' && pct > 108) return 'over';
  if (done || pct >= 100) return 'done';
  if (hour >= 20 && pct < 50) return 'late';
  if (expected < 20) return 'on';            // too early in the day to call anything "behind"
  const gap = pct - expected;
  if (gap < -12) return 'behind';
  if (gap > 10) return 'ahead';
  return 'on';
}

function readQuest(q: any, hour: number): QuestRead {
  const kind = kindOf(q);
  const target = num(q?.target), value = num(q?.value);
  const pct = Number.isFinite(Number(q?.pct)) ? num(q.pct) : target > 0 ? Math.round((value / target) * 100) : 0;
  const expected = Math.round(expectedFrac(kind, hour) * 100);
  const done = !!q?.done || pct >= 100;
  const pace = paceOf(kind, pct, expected, done, hour);
  const projected = expected >= 15 ? Math.round(clamp((pct / expected) * 100, 0, 200)) : pct;
  return { id: String(q?.id || q?.title || kind), kind, title: String(q?.title || kind), value, target, unit: String(q?.unit || ''), pct, expected, gap: pct - expected, pace, left: Math.max(0, target - value), projected, hint: String(q?.hint || ''), done };
}

function moveFor(r: QuestRead): Move {
  const e = EMOJI[r.kind];
  const left = `${fmtNum(r.left)}${r.unit ? ` ${r.unit}` : ''}`;
  const timePhrase = `the day is about ${r.expected}% through`;
  switch (r.kind) {
    case 'water': return { kind: r.kind, emoji: e, cta: 'Log a glass (+250 ml)', short: `Water's at ${r.pct}%. Grab a glass?`, why: `Water is at ${r.pct}% and ${timePhrase}. ${r.left <= 250 ? 'One glass finishes it.' : 'One glass now closes most of the gap.'}`, action: { type: 'water', ml: 250 } };
    case 'calories':
      if (r.pace === 'over') return { kind: r.kind, emoji: '🌿', cta: 'Fix my day', short: `Calories are at ${r.pct}%. Lighter next meal?`, why: `You're at ${r.pct}% of your calories. A lighter next meal rebalances the day, no guilt needed.`, action: { type: 'route', path: '/(tabs)', params: { open: 'fix' } } };
      return { kind: r.kind, emoji: e, cta: 'Log a meal', short: `Calories at ${r.pct}%. Log your meal?`, why: `Calories are at ${r.pct}% and ${timePhrase}. Logging your next meal keeps the numbers honest.`, action: { type: 'route', path: '/food' } };
    case 'protein': return { kind: r.kind, emoji: e, cta: 'Add protein to a meal', short: `Protein's at ${r.pct}%.`, why: `Protein is at ${r.pct}% (${left} to go). Eggs, dal, paneer or curd in your next meal will move it.`, action: { type: 'route', path: '/food' } };
    case 'steps': return { kind: r.kind, emoji: e, cta: 'Take a 2-minute walk challenge', short: `${fmtNum(r.left)} steps to go. Quick walk?`, why: `${fmtNum(r.left)} steps left and ${timePhrase}. A 10-minute walk is roughly 1,000 steps.`, action: { type: 'dare' } };
    case 'move': return { kind: r.kind, emoji: e, cta: 'Start a workout', short: `Exercise is at ${r.pct}%. Even 10 minutes counts.`, why: `Exercise is at ${r.pct}% with ${left} to go. A short session still counts and keeps your streak safe.`, action: { type: 'route', path: '/exercise' } };
    case 'weight': return { kind: r.kind, emoji: e, cta: 'Log your weight', short: 'Weigh-in is still open today.', why: 'A weigh-in takes ten seconds and the trend matters more than any single number.', action: { type: 'route', path: '/weight' } };
    case 'habit': return { kind: r.kind, emoji: e, cta: 'Tick a habit', short: 'A habit is still open.', why: r.hint || `${r.title} is at ${r.pct}%. Small ticks keep the streak alive.`, action: { type: 'route', path: '/habits' } };
    default: return { kind: r.kind, emoji: e, cta: r.title, short: `${r.title} is at ${r.pct}%.`, why: r.hint || `${r.title} is at ${r.pct}% with ${left} to go.`, action: { type: 'route', path: '/(tabs)' } };
  }
}

const WEIGHT_BY_KIND: Record<Kind, number> = { water: 1, steps: 0.9, calories: 0.9, protein: 0.85, move: 0.8, weight: 0.5, habit: 0.6, other: 0.6 };

export function analyze(ctx: any, now: Date = new Date(), mood: Mood | null = null): Analysis {
  const hour = now.getHours() + now.getMinutes() / 60;
  const st = ctx?.streak || {};
  const streak = { current: num(st.current), best: num(st.best), atRisk: false, toNext: num(st.toNext), next: String(st.next || '') };
  const lv = ctx?.level ? { level: num(ctx.level.level), rank: String(ctx.level.rank || ''), xpToNext: num(ctx.level.xpToNext) } : null;
  const wj = ctx?.weightJourney ? { pct: num(ctx.weightJourney.pct), weeksLeft: num(ctx.weightJourney.weeksLeft), reached: !!ctx.weightJourney.reached } : null;
  const raw: any[] = Array.isArray(ctx?.today?.quests) ? ctx.today.quests : [];
  const base: Analysis = { empty: true, hour, score: 0, verdict: '', tone: 'fresh', summary: '', quests: [], done: 0, total: 0, allDone: false, top: null, flags: [], wins: [], forecast: '', streak, level: lv, weight: wj, xpLeft: 0, mood };
  if (!raw.length) return base;

  const quests = raw.map((q) => readQuest(q, hour));
  const total = quests.length, done = quests.filter((q) => q.done && q.pace !== 'over').length;
  const open = quests.filter((q) => !q.done || q.pace === 'over');
  const allDone = open.length === 0;

  // score: 70% "are you keeping pace?" + 30% "how much is actually done"
  const att = quests.map((q) => {
    if (q.pace === 'done') return 1;
    if (q.pace === 'over') return clamp(1 - (q.pct - 108) / 60, 0.3, 1);
    return Math.min(1, q.pct / Math.max(q.expected, 15));
  });
  const paceScore = att.reduce((a, b) => a + b, 0) / total;
  const doneScore = quests.reduce((a, q) => a + Math.min(1, q.pct / 100), 0) / total;
  const score = Math.round(100 * (0.7 * paceScore + 0.3 * doneScore));
  const untouched = quests.every((q) => q.pct === 0);
  const tone: Tone = untouched && hour < 12 ? 'fresh' : score >= 85 ? 'great' : score >= 65 ? 'good' : score >= 40 ? 'push' : 'fresh';
  const verdict = allDone ? 'Perfect day' : tone === 'fresh' ? (untouched ? 'Fresh start' : 'Reset and go') : tone === 'great' ? 'Crushing it' : tone === 'good' ? 'On track' : 'Needs a push';

  streak.atRisk = streak.current >= 2 && done === 0 && hour >= 17;
  const flags: string[] = [];
  if (streak.atRisk) flags.push('streak_risk');
  if (quests.some((q) => q.pace === 'over')) flags.push('calories_over');
  if (quests.some((q) => q.kind === 'water' && (q.pace === 'behind' || q.pace === 'late'))) flags.push('water_behind');
  if (quests.some((q) => q.kind === 'steps' && (q.pace === 'behind' || q.pace === 'late'))) flags.push('steps_behind');
  if (allDone) flags.push('all_done');

  // best next move: biggest weighted gap, with a mood twist (tired -> lighter things first, pumped -> push harder)
  let top: Move | null = null;
  if (open.length) {
    const scored = open.map((q) => {
      let w = WEIGHT_BY_KIND[q.kind] ?? 0.6;
      if (mood === 'tired' && (q.kind === 'move')) w *= 0.35;
      if (mood === 'tired' && q.kind === 'steps') w *= 0.7;
      if (mood === 'great' && (q.kind === 'move' || q.kind === 'steps')) w *= 1.3;
      const urgency = q.pace === 'over' ? 0.35 : Math.max(0, -q.gap) / 100 + (q.pace === 'late' ? 0.25 : 0);
      return { q, s: urgency * w + (q.kind === 'water' ? 0.02 : 0) + (q.pace === 'on' ? 0.001 : 0) };
    }).sort((a, b) => b.s - a.s);
    top = moveFor(scored[0].q);
  }

  const wins: string[] = [];
  quests.filter((q) => q.pace === 'done').forEach((q) => wins.push(`${q.title} done ✅`));
  if (streak.current >= 3) wins.push(`${streak.current}-day streak 🔥`);

  const behind = open.filter((q) => q.pace === 'behind' || q.pace === 'late');
  let forecast = '';
  if (allDone) forecast = 'Everything is done today. Rest up, or get ahead on tomorrow’s meals.';
  else {
    const worst = [...open].filter((q) => q.pace !== 'over').sort((a, b) => a.projected - b.projected)[0];
    if (worst && worst.expected >= 15 && worst.projected < 90) forecast = `At this pace ${worst.title.toLowerCase()} ends the day around ${worst.projected}%${worst.left ? `, ${fmtNum(worst.left)}${worst.unit ? ` ${worst.unit}` : ''} short` : ''}.`;
    else forecast = 'Every goal is pacing to finish today if you keep this rhythm.';
  }
  const summary = untouched && hour < 12 ? 'A clean slate. Your first log sets the tone.' : `${done}/${total} quests done, ${behind.length ? `${behind.length} behind pace` : 'all pacing well'}.`;
  const xpLeft = Math.max(0, num(ctx?.today?.xpAvailable) - num(ctx?.today?.xpEarned));
  return { empty: false, hour, score, verdict, tone, summary, quests, done, total, allDone, top, flags, wins, forecast, streak, level: lv, weight: wj, xpLeft, mood };
}

/** The "thinking out loud" lines shown while the character works it out. Every line quotes a real number. */
export function thinkingSteps(a: Analysis): string[] {
  if (a.empty) return ['Looking for today’s quests…', 'Nothing logged yet, so I’ll start simple.'];
  const avg = Math.round(a.quests.reduce((s, q) => s + q.expected, 0) / a.quests.length);
  const gapQ = [...a.quests].filter((q) => !q.done).sort((x, y) => x.gap - y.gap)[0];
  const out = [`Reading ${a.total} quests for today…`, `It's ${fmtHour(a.hour)}, so you should be about ${avg}% in.`];
  out.push(gapQ ? `Biggest gap: ${gapQ.title} at ${gapQ.pct}% vs ${gapQ.expected}% expected.` : 'No gaps. Checking your streak…');
  out.push(a.top ? `Best next move: ${a.top.cta.toLowerCase()}.` : 'Picking a reward for you…');
  return out;
}

export function badgeFor(a: Analysis | null): { emoji: string; urgent: boolean } | null {
  if (!a || a.empty) return null;
  if (a.flags.includes('streak_risk')) return { emoji: '🔥', urgent: true };
  if (a.allDone) return { emoji: '✨', urgent: false };
  const q = a.quests.find((x) => x.kind === a.top?.kind);
  if (a.top && q && (q.pace === 'behind' || q.pace === 'late' || q.pace === 'over')) return { emoji: a.top.emoji, urgent: q.pace === 'late' };
  return null;
}

export type NudgeState = { now: number; lastNudgeAt: number; dismissStreak: number; lastKey?: string };
export type Nudge = { key: string; text: string; mood: string };
/** Should the character speak up on its own? Backs off after ignored nudges (45 min, then 90, 135, 180). Quiet 22:00-07:00. */
export function nudgeFor(a: Analysis | null, st: NudgeState, hour: number): Nudge | null {
  if (!a || a.empty || hour < 7 || hour >= 22) return null;
  const gap = 45 * 60000 * (1 + Math.min(3, Math.max(0, st.dismissStreak)));
  if (st.now - st.lastNudgeAt < gap) return null;
  const cands: Nudge[] = [];
  if (a.flags.includes('streak_risk')) cands.push({ key: 'streak', mood: 'angry', text: `Your ${a.streak.current}-day streak needs one log today. Water counts!` });
  if (a.allDone) cands.push({ key: 'all_done', mood: 'party', text: 'All quests done. Perfect day! 🎉' });
  if (a.top) {
    const q = a.quests.find((x) => x.kind === a.top!.kind);
    if (q && (q.pace === 'behind' || q.pace === 'late' || q.pace === 'over')) cands.push({ key: `move:${q.kind}:${q.pace}`, mood: q.kind === 'water' ? 'drink' : q.kind === 'calories' || q.kind === 'protein' ? 'eat' : q.kind === 'move' || q.kind === 'steps' ? 'lift' : 'think', text: a.top.short });
  }
  const c = cands.find((x) => x.key !== st.lastKey);
  return c || null;
}

// ---- 60-second challenges ----
export type Dare = { id: string; emoji: string; title: string; how: string; seconds: number; bond: number };
export const DARES: Dare[] = [
  { id: 'squats', emoji: '🦵', title: '15 squats', how: 'Feet shoulder-width, chest up. Go!', seconds: 45, bond: 4 },
  { id: 'plank', emoji: '🧱', title: '30-second plank', how: 'Forearms down, body straight, breathe.', seconds: 30, bond: 4 },
  { id: 'walk', emoji: '👟', title: '2-minute walk', how: 'Up and walking. Stairs or hallway, anything.', seconds: 120, bond: 5 },
  { id: 'pushups', emoji: '💥', title: '10 push-ups', how: 'Knees are fine. Keep your back flat.', seconds: 40, bond: 4 },
  { id: 'stretch', emoji: '🧘', title: '1-minute stretch', how: 'Roll shoulders, reach up, touch toes.', seconds: 60, bond: 3 },
  { id: 'breathe', emoji: '🌬️', title: 'Box breathing', how: 'In 4, hold 4, out 4, hold 4. Repeat.', seconds: 60, bond: 3 },
  { id: 'water', emoji: '💧', title: 'Drink a glass of water', how: 'Slowly, all of it. Then log it!', seconds: 30, bond: 3 },
];
export function dareFor(a: Analysis | null, mood: Mood | null, hour: number, seed = 0): Dare {
  const by = (id: string) => DARES.find((d) => d.id === id)!;
  if (mood === 'stressed' || hour >= 22 || hour < 5) return by('breathe');
  if (mood === 'tired') return a?.flags.includes('water_behind') ? by('water') : by('stretch');
  if (a?.flags.includes('water_behind')) return by('water');
  if (a?.flags.includes('steps_behind')) return by('walk');
  const pool = mood === 'great' ? ['pushups', 'squats', 'plank'] : ['squats', 'plank', 'stretch', 'walk', 'pushups'];
  return by(pool[Math.abs(seed) % pool.length]);
}

// ---- bond ----
export const bondLevelOf = (xp = 0) => Math.floor(Math.sqrt(xp / 6)) + 1;
export function bondProgress(xp = 0): number {
  const L = bondLevelOf(xp), lo = 6 * (L - 1) ** 2, hi = 6 * L ** 2;
  return clamp((xp - lo) / (hi - lo), 0, 1);
}
const TITLES = ['New face', 'Acquaintance', 'Buddy', 'Training partner', 'Rival-friend', 'Nakama', 'Legendary duo'];
export const bondTitle = (level: number) => TITLES[clamp(level - 1, 0, TITLES.length - 1)];

// ---- typed questions answered on the device (instant, works offline). null = let the server handle it ----
export type LocalAnswer = { text: string; mood: string; actions?: { label: string; page?: string; water?: boolean; dare?: boolean }[] };
const JOKES = ['Why did the banana go to the gym? To get more a-peeling!', "I told my scale a joke. It didn't laugh. It just weighed in.", 'Carbs and I broke up. It was too complicated.', "Why don't eggs tell jokes? They'd crack each other up."];
export function answerLocal(q: string, a: Analysis | null, seed = 0): LocalAnswer | null {
  const t = q.toLowerCase().trim();
  if (!t) return null;
  const find = (k: Kind) => a?.quests.find((x) => x.kind === k);
  const none = (what: string): LocalAnswer => ({ mood: 'think', text: `I don't see a ${what} target for today yet. You can set one in your profile.` });
  const qa = (k: Kind, what: string, unitWord: string): LocalAnswer => {
    const r = find(k); if (!r) return none(what);
    if (r.pace === 'done') return { mood: 'party', text: `${what[0].toUpperCase() + what.slice(1)} goal done: ${fmtNum(r.value)}/${fmtNum(r.target)} ${unitWord}. 🎉` };
    const ahead = r.pace === 'ahead' ? 'You are ahead of pace.' : r.pace === 'on' ? 'Right on pace.' : r.pace === 'over' ? 'That is over today’s target.' : `It's ${fmtHour(a!.hour)} and you "should" be near ${r.expected}%.`;
    return { mood: k === 'water' ? 'drink' : k === 'steps' || k === 'move' ? 'lift' : 'eat', text: `${fmtNum(r.value)}/${fmtNum(r.target)} ${unitWord} (${r.pct}%), ${fmtNum(r.left)} to go. ${ahead}`, actions: k === 'water' ? [{ label: 'Log +250 ml', water: true }] : k === 'steps' ? [{ label: '2-min walk', dare: true }] : [{ label: k === 'move' ? 'Start workout' : 'Log food', page: k === 'move' ? 'exercise' : 'food' }] };
  };
  if (/\b(joke|funny|laugh)\b/.test(t)) return { mood: 'laugh', text: JOKES[Math.abs(seed) % JOKES.length] };
  if (/\b(thanks|thank you|thx)\b/.test(t)) return { mood: 'hype', text: 'Anytime! Now go make future-you proud.' };
  if (/\b(tired|sleepy|exhausted|lazy|no energy|can'?t be bothered)\b/.test(t)) return { mood: 'sleep', text: 'Rough day. Keep it tiny: a glass of water and a 1-minute stretch counts. Rest is part of the plan.', actions: [{ label: 'Try a 1-min stretch', dare: true }] };
  if (/\b(stress|anxious|overwhelmed|sad|down)\b/.test(t)) return { mood: 'sad', text: 'That sounds heavy. One minute of slow breathing helps more than it looks. Want to try?', actions: [{ label: 'Box breathing', dare: true }] };
  if (!a || a.empty) return /\b(hi|hello|hey)\b/.test(t) ? { mood: 'hype', text: 'Hey! Log a meal or a glass of water and I will tell you exactly how your day is going.' } : null;
  if (/\bwater|hydrat|drink\b/.test(t)) return qa('water', 'water', 'ml');
  if (/\bprotein\b/.test(t)) return qa('protein', 'protein', 'g');
  if (/\bcalor|kcal\b/.test(t)) return qa('calories', 'calorie', 'kcal');
  if (/\bsteps?\b/.test(t)) return qa('steps', 'steps', 'steps');
  if (/\b(exercise|workout|active)\b/.test(t)) return qa('move', 'exercise', 'min');
  if (/\bstreak\b/.test(t)) return { mood: a.streak.current >= 3 ? 'hype' : 'think', text: a.streak.current ? `${a.streak.current}-day streak${a.streak.best > a.streak.current ? ` (best ${a.streak.best})` : ' (your best!)'}.${a.streak.next ? ` ${a.streak.toNext} more day${a.streak.toNext === 1 ? '' : 's'} to ${a.streak.next}.` : ''}` : `No active streak yet${a.streak.best ? ` (best ${a.streak.best})` : ''}. Log one thing today and it starts.` };
  if (/\b(level|xp|rank)\b/.test(t)) return a.level ? { mood: 'hype', text: `Level ${a.level.level} ${a.level.rank}. ${a.level.xpToNext} XP to the next level${a.xpLeft ? `, and ${a.xpLeft} XP are available today` : ''}.` } : null;
  if (/\b(weight|goal weight|kg)\b/.test(t)) return a.weight ? { mood: a.weight.reached ? 'party' : 'thumbs', text: a.weight.reached ? 'You reached your goal weight! Time for the next goal.' : `${a.weight.pct}% of the way to your goal weight, about ${a.weight.weeksLeft} weeks at your pace.` } : null;
  if (/\b(next|what should i|todo|to do|suggest|help me)\b/.test(t)) return a.top ? { mood: 'think', text: `${a.top.why}`, actions: [{ label: a.top.cta, ...(a.top.action.type === 'water' ? { water: true } : a.top.action.type === 'dare' ? { dare: true } : { page: a.top.action.path === '/food' ? 'food' : a.top.action.path === '/exercise' ? 'exercise' : a.top.action.path === '/weight' ? 'weight' : a.top.action.path === '/habits' ? 'habit' : 'dashboard' }) }] } : { mood: 'party', text: 'Everything is done today. Rest, or plan tomorrow.', actions: [{ label: 'Plan tomorrow', page: 'planner' }] };
  if (/\b(how am i|doing|score|progress|today|status|report)\b/.test(t)) return { mood: a.tone === 'great' || a.allDone ? 'party' : a.tone === 'push' ? 'angry' : 'thumbs', text: `${a.verdict}: score ${a.score}/100. ${a.summary} ${a.forecast}` };
  return null;
}
