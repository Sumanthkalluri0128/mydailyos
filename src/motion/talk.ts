// What the characters say (mobile twin of the web talk.js). Lines are per mood with a personal voice per character,
// and `ctx` (the /api/goals/journey payload) lets them comment on real progress.
import { CHARS, type Who } from './chars';

export type Ctx = any;
export type Line = { mood: string; text: string; w?: number };
const pick = <T,>(a: T[], seed?: number): T => a[Math.floor(seed ?? Math.random() * a.length) % a.length];
const rnd = () => Math.random();

export const VOICE: Record<string, string[]> = {
  asta: ["No magic needed — just effort!", "Push-ups until I drop! Join me!", "I'm not quitting, and neither are you!", "Louder! Believe it with your whole body!"],
  luffy: ["Meat! Did someone say meat?!", "Adventure time — let's go move!", "Shishishi! You're doing great!", "I'm hungry. Log my lunch first!"],
  naruto: ["Believe it — you've got this!", "I never go back on my word. Do you?", "Ramen later. Reps first!", "Hard work beats talent, dattebayo!"],
  jinwoo: ["Level up. Quietly. Daily.", "Arise — your streak needs you.", "Weak today, stronger tomorrow.", "The system rewards the consistent."],
  goku: ["Wow, I'm so hungry! Let's train!", "Let's get stronger together!", "That was fun! One more round?", "Power comes from rest and food!"],
  kakashi: ["Hm? Be on time. Log your meals.", "Teamwork — you and your habits.", "Pay attention to the small things.", "Even a ninja needs a steady routine."],
  zoro: ["Heavier. Always heavier.", "I'm not lost. The gym is this way.", "Sleep is training too. Respect it.", "Cut the excuses. Not the meals."],
  gojo: ["Relax — you're doing fine. I'm just stronger.", "Sweet stuff? Sure, but earn it~", "Throughout heaven and earth, you're consistent.", "Easy! Try the harder set."],
  tanjiro: ["Steady breathing, steady progress.", "Don't give up — I believe in you!", "Rest well, eat well, train well.", "Every small step counts. Truly."],
  killua: ["Tch… fine, I'll cheer you on.", "Speed matters. So does recovery.", "Don't overthink it — just go.", "Not bad. Not bad at all."],
  vegeta: ["You're stronger than you think!", "Train harder than yesterday!", "A prince doesn't skip leg day.", "Surpass your old self. Now."],
  zenitsu: ["Aaah! Don't skip your meal!!", "I can do it… I think… YES I can!", "Sleeping is my special move.", "You did it?! That's amazing!"],
  bakugo: ["KEEP GOING, YOU'VE GOT THIS!", "Win. Then win again.", "Log it. NOW. Move!", "Number one isn't built on excuses!"],
};
const MOOD: Record<string, string[]> = {
  hype: ["Let's go!", "Yes! That's the energy!", "You're on fire today!", "Keep this up!"],
  laugh: ["Haha, nice one!", "Today's a good day.", "Smile — you're making progress!"],
  thumbs: ["Solid work.", "Right on target.", "Good job, really."],
  eat: ["Mmm — fuel for the day!", "Eat well, move well.", "Good food logged = good data."],
  drink: ["Hydration check ✅", "Water makes everything work better."],
  lift: ["Reps build habits.", "Strong body, strong mind."],
  sleep: ["Zzz… recovery is part of the plan.", "Sleep is when you grow."],
  sad: ["It's okay — tomorrow's a fresh start.", "One off day doesn't undo the effort."],
  party: ["Party time — you earned it!", "A win is a win. Celebrate!"],
  think: ["Hmm… what's your next target?", "Plan first, then crush it."],
};
// Tone (gentle / strict): lines come from the server once; "funny" keeps the built-in character lines above.
let TONE: any = null;
export function setToneBundle(b: any) { TONE = b && b.mood ? b : null; }
export function say(who: string, mood = 'hype'): string {
  if (TONE) {
    const tv = TONE.voice?.[who];
    if (tv && rnd() > 0.5) return pick(tv);
    return pick(TONE.mood[mood] || TONE.mood.hype);
  }
  const v = VOICE[who];
  if (v && rnd() > 0.5) return pick(v);
  return pick(MOOD[mood] || MOOD.hype);
}
/**
 * One line about the next open quest. Protein is judged against a RANGE (e.g. 125 to 160 g), so "88% of 139 g" next to "2 g to go"
 * (2 g to the bottom of the range) used two different yardsticks in one sentence. For protein we say what you have and the distance to the range.
 */
export function questLine(q: any): string {
  if (q.id === 'protein' && q.hint) return `${q.title}: ${q.value} g so far. ${q.hint}`.trim();
  return `${q.title}: ${q.value}/${q.target} ${q.unit} (${q.pct}%). ${q.hint || ''}`.trim();
}

export function insights(ctx: Ctx, who: string): Line[] {
  if (!ctx) return [];
  const out: Line[] = [];
  const name = (CHARS as any)[who] || '';
  const q = ctx.today, lv = ctx.level, st = ctx.streak;
  if (st?.current >= 3) out.push({ mood: 'hype', text: `${st.current}-day streak! ${st.next ? `${st.toNext} more day${st.toNext === 1 ? '' : 's'} to hit ${st.next}.` : "You're a legend."}`, w: 3 });
  else if (st?.current === 0 && st?.best > 0) out.push({ mood: 'sad', text: `Your streak reset — best was ${st.best}. Log one thing today and we start again!`, w: 3 });
  if (q?.quests?.length) {
    const open = q.quests.filter((x: any) => !x.done);
    if (!open.length) out.push({ mood: 'party', text: "All of today's quests are done! That's a perfect day. 🎉", w: 4 });
    else {
      const next = [...open].sort((a: any, b: any) => b.pct - a.pct)[0];
      out.push({ mood: next.id === 'water' ? 'drink' : next.id === 'move' || next.id === 'steps' ? 'lift' : next.id === 'protein' || next.id === 'calories' ? 'eat' : 'think', text: questLine(next), w: 2 });
    }
    out.push({ mood: 'think', text: `${q.done}/${q.total} quests done today — ${q.xpAvailable - q.xpEarned} XP still up for grabs.`, w: 1 });
  }
  if (lv) out.push({ mood: 'hype', text: `Level ${lv.level} ${lv.rank} — only ${lv.xpToNext} XP to level ${lv.level + 1}!`, w: 1 });
  const wj = ctx.weightJourney;
  if (wj && !wj.reached) out.push({ mood: 'thumbs', text: `${wj.pct}% of the way to your goal weight, about ${wj.weeksLeft} weeks at your pace. Power level rising!`, w: 2 });
  if (wj?.reached) out.push({ mood: 'party', text: 'You reached your goal weight!! Time to set the next goal.', w: 4 });
  const behind = (ctx.goals || []).find((g: any) => g.progress?.status === 'behind');
  if (behind) out.push({ mood: 'angry', text: `"${behind.title}" is slipping behind (${behind.progress.pct}% done, ${behind.progress.daysLeft} days left). Small push today!`, w: 2 });
  const near = (ctx.goals || []).find((g: any) => g.progress?.status === 'active' && g.progress.pct >= 80);
  if (near) out.push({ mood: 'hype', text: `"${near.title}" is at ${near.progress.pct}% — almost there!`, w: 3 });
  const h = new Date().getHours();
  if (h < 10) out.push({ mood: 'lift', text: 'Good morning! Start with water and a protein-rich breakfast.', w: 1 });
  else if (h >= 12 && h < 15) out.push({ mood: 'eat', text: `Lunchtime — log it so ${name} can keep score.`, w: 1 });
  else if (h >= 22 || h < 5) out.push({ mood: 'sleep', text: "It's late — sleep is part of the plan. Good night!", w: 2 });
  return out.sort((a, b) => (b.w || 0) - (a.w || 0));
}
export function reactTo(text = '', kind = 'success', ctx: Ctx, who: string): Line {
  const t = text.toLowerCase();
  if (kind === 'error' || kind === 'warning') return { mood: 'sad', text: say(who, 'sad') };
  if (/water|\bml\b|drink/.test(t)) { const w = ctx?.today?.quests?.find((x: any) => x.id === 'water'); return { mood: 'drink', text: w ? (w.done ? 'Water goal done! 💧' : `${w.pct}% of your water goal — keep sipping!`) : say(who, 'drink') }; }
  if (/food|meal|calorie|ate |eaten|added|logged|recipe/.test(t)) { const c = ctx?.today?.quests?.find((x: any) => x.id === 'calories'); return { mood: 'eat', text: c && c.value ? `${c.value} of ${c.target} kcal so far today (${c.pct}%).` : say(who, 'eat') }; }
  if (/exercise|workout|activity|training|steps?|walk/.test(t)) return { mood: 'lift', text: say(who, 'lift') };
  if (/weight|weigh/.test(t)) return { mood: 'thumbs', text: 'Weigh-ins build the picture. Trends matter more than one day.' };
  if (/goal/.test(t)) return { mood: 'party', text: "A new target! I'll keep you honest." };
  return { mood: 'hype', text: say(who, 'hype') };
}
export const CHIPS = ['How am I doing?', 'Motivate me', "What's next?", 'Tell me a joke'];
const JOKES = ['Why did the banana go to the gym? To get more a-peeling!', "I told my scale a joke. It didn't laugh — it just weighed in.", 'Carbs and I broke up. It was too complicated.', "Why don't eggs tell jokes? They'd crack each other up."];
export function reply(chip: string, who: string, ctx: Ctx): Line {
  const ins = insights(ctx, who);
  if (chip === 'How am I doing?') return ins.length ? { mood: ins[0].mood, text: ins.slice(0, 2).map((i) => i.text).join(' ') } : { mood: 'think', text: "Log a meal or some water and I'll tell you exactly how you're doing." };
  if (chip === "What's next?") { const q = ctx?.today?.quests?.find((x: any) => !x.done); return q ? { mood: 'think', text: `Next up: ${q.title}. ${q.hint || ''}` } : { mood: 'party', text: "Everything's done today. Rest, or get ahead on tomorrow's meals!" }; }
  if (chip === 'Tell me a joke') return { mood: 'laugh', text: pick(JOKES) };
  return { mood: 'hype', text: pick(VOICE[who] || MOOD.hype) };
}
