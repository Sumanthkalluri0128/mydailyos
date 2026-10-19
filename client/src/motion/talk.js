// What the characters say. Lines are written per mood, with a personal flavour for each character, and the "ctx"
// (today's progress from /api/goals/journey) lets them comment on how YOU are doing rather than say generic things.
import { CHARS } from "./chars";

const pick = (a, seed) => a[Math.floor((seed ?? Math.random()) * a.length) % a.length];

// A voice for each character (original lines, in the spirit of the character).
export const VOICE = {
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
  vegeta: ["Pathetic? No. You'll get stronger!", "Train harder than yesterday!", "A prince doesn't skip leg day.", "Surpass your old self. Now."],
  zenitsu: ["Aaah! Don't skip your meal!!", "I can do it… I think… YES I can!", "Sleeping is my special move.", "You did it?! That's amazing!"],
  bakugo: ["DON'T SLACK, DAMMIT!", "Win. Then win again.", "Log it. NOW. Move!", "Number one isn't built on excuses!"],
};

const MOOD = {
  hype: ["Let's go!", "Yes! That's the energy!", "You're on fire today!", "Keep this up!"],
  laugh: ["Haha, nice one!", "Today's a good day.", "Smile — you're making progress!"],
  thumbs: ["Solid work.", "Right on target.", "Good job, really."],
  eat: ["Mmm — fuel for the day!", "Eat well, move well.", "Good food logged = good data."],
  drink: ["Hydration check ✅", "Water makes everything work better."],
  lift: ["Reps build habits.", "Strong body, strong mind."],
  sleep: ["Zzz… recovery is part of the plan.", "Sleep is when you grow."],
  sad: ["It's okay — tomorrow's a fresh start.", "One off day doesn't undo the streak of effort."],
  party: ["Party time — you earned it!", "A win is a win. Celebrate!"],
  think: ["Hmm… what's your next target?", "Plan first, then crush it."],
  cool: ["Easy.", "Cool, calm, consistent."],
  love: ["You're doing this for you — love that.", "Proud of you!"],
  shock: ["Whoa! That's a big number!", "Wait, really?!"],
  angry: ["No excuses!", "Get back on track!"],
  game: ["Gaming break? Stand up and stretch after!", "Level up in life too."],
};

/** One line for a mood, mixing the character's voice in about every other time. */
export function say(who, mood = "hype", seed) {
  const r = seed ?? Math.random();
  const voice = VOICE[who];
  if (voice && r > 0.5) return pick(voice, (r - 0.5) * 2);
  return pick(MOOD[mood] || MOOD.hype, r * 2);
}

const n0 = (x) => Math.round(x || 0);
const hour = () => new Date().getHours();

/** Comments about what is happening in the person's day. Returns [{mood, text}], best first. */
export function insights(ctx, who) {
  if (!ctx) return [];
  const out = [];
  const name = CHARS[who] || "";
  const q = ctx.today, lv = ctx.level, st = ctx.streak;
  if (st?.current >= 3) out.push({ mood: "hype", text: `${st.current}-day streak! ${st.next ? `${st.toNext} more day${st.toNext === 1 ? "" : "s"} to hit ${st.next}.` : "You're a legend."}`, w: 3 });
  else if (st?.current === 0 && st?.best > 0) out.push({ mood: "sad", text: `Your streak reset — best was ${st.best}. Log one thing today and we start again!`, w: 3 });
  if (q?.quests?.length) {
    const open = q.quests.filter((x) => !x.done);
    if (!open.length) out.push({ mood: "party", text: "All of today's quests are done! That's a perfect day. 🎉", w: 4 });
    else {
      const next = [...open].sort((a, b) => b.pct - a.pct)[0];
      out.push({ mood: next.id === "water" ? "drink" : next.id === "move" || next.id === "steps" ? "lift" : next.id === "protein" || next.id === "calories" ? "eat" : "think", text: `${next.title}: ${next.value}/${next.target} ${next.unit} (${next.pct}%). ${next.hint || ""}`.trim(), w: 2 });
    }
    out.push({ mood: "think", text: `${q.done}/${q.total} quests done today — ${q.xpAvailable - q.xpEarned} XP still up for grabs.`, w: 1 });
  }
  if (lv) out.push({ mood: "hype", text: `Level ${lv.level} ${lv.rank} — only ${lv.xpToNext} XP to level ${lv.level + 1}!`, w: 1 });
  const wj = ctx.weightJourney;
  if (wj && !wj.reached) out.push({ mood: "thumbs", text: `${wj.pct}% of the way to ${wj.targetKg} kg — ${wj.remainingKg} kg to go (about ${wj.weeksLeft} weeks at your pace).`, w: 2 });
  if (wj?.reached) out.push({ mood: "party", text: `You reached ${wj.targetKg} kg!! Time to set the next goal.`, w: 4 });
  const behind = (ctx.goals || []).find((g) => g.progress?.status === "behind");
  if (behind) out.push({ mood: "angry", text: `"${behind.title}" is slipping behind (${behind.progress.pct}% done, ${behind.progress.daysLeft} days left). Small push today!`, w: 2 });
  const near = (ctx.goals || []).find((g) => g.progress?.status === "active" && g.progress.pct >= 80);
  if (near) out.push({ mood: "hype", text: `"${near.title}" is at ${near.progress.pct}% — almost there!`, w: 3 });
  const h = hour();
  if (h < 10) out.push({ mood: "lift", text: `Good morning! Start with water and a protein-rich breakfast.`, w: 1 });
  else if (h >= 12 && h < 15) out.push({ mood: "eat", text: `Lunchtime — log it so ${name} can keep score.`, w: 1 });
  else if (h >= 22 || h < 5) out.push({ mood: "sleep", text: `It's late — sleep is part of the plan. Good night!`, w: 2 });
  return out.sort((a, b) => b.w - a.w);
}

/** A comment for something that just happened (a toast message), e.g. "Added Ramen" or "Water logged". */
export function reactTo(text = "", type = "success", ctx, who) {
  const t = text.toLowerCase();
  if (type === "error" || type === "warning") return { mood: "sad", text: say(who, "sad") };
  if (/water|ml\b|drink/.test(t)) {
    const w = ctx?.today?.quests?.find((x) => x.id === "water");
    return { mood: "drink", text: w ? (w.done ? "Water goal done! 💧" : `${w.pct}% of your water goal — keep sipping!`) : say(who, "drink") };
  }
  if (/food|meal|calorie|ate |eaten|added|logged|recipe/.test(t)) {
    const c = ctx?.today?.quests?.find((x) => x.id === "calories");
    return { mood: "eat", text: c && c.value ? `${c.value} of ${c.target} kcal so far today (${c.pct}%).` : say(who, "eat") };
  }
  if (/exercise|workout|activity|training|steps?|walk/.test(t)) return { mood: "lift", text: say(who, "lift") };
  if (/weight|weigh/.test(t)) return { mood: "thumbs", text: "Weigh-ins build the picture. Trends matter more than one day." };
  if (/goal/.test(t)) return { mood: "party", text: "A new target! I'll keep you honest." };
  if (/task|habit|streak|done|completed/.test(t)) return { mood: "thumbs", text: say(who, "thumbs") };
  return { mood: "hype", text: say(who, "hype") };
}

/** Answers to the quick chat chips. */
export const CHIPS = ["How am I doing?", "Motivate me", "What's next?", "Tell me a joke"];
const JOKES = ["Why did the banana go to the gym? To get more a-peeling!", "I told my scale a joke. It didn't laugh — it just weighed in.", "Carbs and I broke up. It was too complicated.", "Why don't eggs tell jokes? They'd crack each other up."];
export function reply(chip, who, ctx) {
  const ins = insights(ctx, who);
  if (chip === "How am I doing?") return ins.length ? { mood: ins[0].mood, text: ins.slice(0, 2).map((i) => i.text).join(" ") } : { mood: "think", text: "Log a meal or some water and I'll tell you exactly how you're doing." };
  if (chip === "What's next?") { const q = ctx?.today?.quests?.find((x) => !x.done); return q ? { mood: "think", text: `Next up: ${q.title}. ${q.hint || ""}` } : { mood: "party", text: "Everything's done today. Rest, or get ahead on tomorrow's meals!" }; }
  if (chip === "Tell me a joke") return { mood: "laugh", text: pick(JOKES) };
  return { mood: "hype", text: pick(VOICE[who] || MOOD.hype) };
}

// ---- Micronutrients: a character explains a low nutrient in their own voice (plain facts stay plain underneath) ----
const LOW_LEAD = {
  asta: "Hey, no magic needed —", luffy: "Shishishi, listen —", naruto: "Believe it —", jinwoo: "Status check:", goku: "Hey, quick thing!",
  kakashi: "Pay attention to the small things:", zoro: "Straight talk:", gojo: "Relax, easy fix~", tanjiro: "Gently, steady steps:",
  killua: "Tch, simple fix:", vegeta: "Listen up:", zenitsu: "Aaah, don't panic —", bakugo: "Hey! Listen!",
};
const HELPERS = { iron: "dal, rajma, spinach, ragi or jaggery", calcium: "curd, milk, paneer, ragi or sesame", potassium: "banana, coconut water, potato or beans", magnesium: "nuts, seeds, whole grains or greens", zinc: "pulses, nuts, seeds or whole grains", vitaminA: "carrot, papaya, mango or leafy greens", vitaminB12: "milk, curd, eggs or paneer", vitaminC: "amla, guava, lemon or orange", vitaminD: "morning sun and eggs or fortified milk", folate: "dals, greens or sprouts" };
/** One line: the character says what is low and which foods help. `own` = names from the person's own foods (used first). */
export function explainNutrient(who, nutrient, own = []) {
  const lead = LOW_LEAD[who] || "Heads up:";
  const ideas = own.length ? own.slice(0, 3).join(", ") : HELPERS[nutrient.key] || "a varied plate";
  return `${lead} ${nutrient.label.toLowerCase()} is low today. ${own.length ? "From your own foods, try" : "Foods that help:"} ${ideas}.`;
}
export const MICRO_CHEER = { victory: "Power level high — most nutrients are in range!", power: "Good progress — a few nutrients still to fill.", support: "A few gaps today — small additions at the next meal will help.", unknown: "Log a few more foods with nutrient data and I'll read your bars." };
