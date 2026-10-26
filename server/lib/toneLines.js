// Coach tone copy, written once on the server and sent to web and mobile (GET /api/coach/tone).
// Three tones: gentle, strict, funny. "Strict" means short and firm, never shaming: every line passes lib/safety.toneCheck in the tests.
// Characters keep their own voice in each tone; `funny` is the default and clients keep their built-in character comments for it.
const TONES = ['gentle', 'strict', 'funny'];

const MOOD = {
  gentle: {
    hype: ['That is lovely progress.', 'Well done. Gentle and steady wins.', 'You are doing really well.'],
    thumbs: ['That is a good step.', 'Right where you want to be.', 'Nicely done.'],
    eat: ['Thank you for logging that. Eating well looks after you.', 'A good meal is a kind thing to do for yourself.'],
    drink: ['A sip of water is a small kindness.', 'Water noted. Lovely.'],
    lift: ['Move in a way that feels good today.', 'Any movement counts, however small.'],
    sleep: ['Rest is part of the plan. Sleep well.', 'Be kind to yourself and rest.'],
    sad: ['It is okay. Tomorrow is a fresh start.', 'One tough day changes nothing. You are still on your way.'],
    party: ['That is worth celebrating!', 'A lovely win. Enjoy it.'],
    think: ['What would feel good to do next?', 'Take your time. What is one small thing?'],
    cool: ['Calm and steady.', 'No rush at all.'],
    love: ['You are looking after yourself, and that matters.', 'So proud of you for showing up.'],
    shock: ['That is a big number, and that is all right.', 'Whoa. Let us look at it calmly.'],
    angry: ['Let us gently get back on track.', 'A small step is enough for now.'],
    game: ['Enjoy your break, then stretch a little.', 'Rest well. Stand up and stretch after.'],
  },
  strict: {
    hype: ['Good. Keep going.', 'Right pace. Hold it.', 'Strong work. Next.'],
    thumbs: ['On target.', 'Good. That is the standard.', 'Solid.'],
    eat: ['Logged. Next meal on time.', 'Fuel in. Keep the rhythm.'],
    drink: ['Water logged. Keep it up.', 'Hydration on track.'],
    lift: ['Train today. Show up.', 'Reps. Rest. Repeat.'],
    sleep: ['Sleep is training. Lights out on time.', 'Recovery matters. Rest now.'],
    sad: ['Off day. Reset and carry on.', 'One day does not decide anything. Back to it tomorrow.'],
    party: ['Earned. Enjoy it, then back to the plan.', 'Good result. Stay consistent.'],
    think: ['Decide your next step. Then do it.', 'Plan it, then act.'],
    cool: ['Stay steady.', 'Calm. Consistent.'],
    love: ['Good discipline. Keep it.', 'You showed up. That counts.'],
    shock: ['Big number. Note it and move on.', 'Noted. Stay on plan.'],
    angry: ['Back to the plan. One step now.', 'Refocus. Small action, right away.'],
    game: ['Short break only. Then move.', 'Stand up and stretch after.'],
  },
  funny: {
    hype: ['Look at you go! My cape is flapping.', 'Even the rice is clapping.', 'Plot twist: you are doing great.'],
    thumbs: ['Chef\'s kiss for that one.', 'Two thumbs up, and I only brought two.'],
    eat: ['Delicious data, thank you.', 'Meal logged. The spreadsheet purrs.'],
    drink: ['Hydrated hero, reporting in.', 'Water: the original smoothie.'],
    lift: ['The weights missed you. Dramatic, I know.', 'Reps today, bragging rights tomorrow.'],
    sleep: ['Pillow side quest unlocked.', 'Even heroes nap. Go on.'],
    sad: ['Rough day? Even anime heroes have a filler episode.', 'Tomorrow is a brand new episode.'],
    party: ['Confetti! Imaginary but sincere.', 'Victory dance time.'],
    think: ['Hmm, what is the next scene?', 'Plot your next move, mastermind.'],
    cool: ['Smooth as ghee.', 'Cool, calm, curry-fuelled.'],
    love: ['Aww. You are doing this for you, and it shows.', 'Heart eyes for your effort.'],
    shock: ['Whoa, that is a big number! We shall not speak of it.', 'Plot twist indeed.'],
    angry: ['Time to get back to the plan, hero!', 'Villain defeated: the snack drawer. Maybe.'],
    game: ['Gaming break? Stretch after, player one.', 'Level up in life too.'],
  },
};

// Per-character voices for the gentle and strict tones (funny keeps the built-in character lines on the clients).
const VOICE = {
  gentle: {
    asta: ['Small steps count. I am cheering for you.', 'You do not have to be perfect to move forward.'],
    luffy: ['Adventures have slow days too. I am with you.', 'Snack, rest, then onward. All good.'],
    naruto: ['You never gave up on yourself. That is real strength.', 'Today is enough. Tomorrow we try again.'],
    jinwoo: ['Quiet consistency is power. Rest when you need to.', 'Every small action is a level gained.'],
    goku: ['Rest is part of training. Eat well and feel good.', 'Take it easy today. We will train again soon.'],
    kakashi: ['Slow and steady is a fine path.', 'Be kind to yourself. Routine will follow.'],
    zoro: ['Rest well. Strength grows in the quiet.', 'No need to rush. You will get there.'],
    gojo: ['Relax, you are doing just fine.', 'Take your time. I will be right here.'],
    tanjiro: ['Breathe. One small step is enough.', 'You are doing your best, and that is wonderful.'],
    killua: ['Fine, I will say it nicely: well done.', 'Go at your own speed. It is okay.'],
    vegeta: ['You are stronger than you think. Rest, then grow.', 'Even a prince rests. Easy does it.'],
    zenitsu: ['It is okay to be nervous. You are doing great!', 'Small win! I am so happy for you.'],
    bakugo: ['Hey. You are doing fine. Keep going at your pace.', 'One small step. That counts.'],
  },
  strict: {
    asta: ['Show up today. That is all.', 'Do the next small thing.'],
    luffy: ['Log your meal. Then we move.', 'Stay on course.'],
    naruto: ['Keep your promise to yourself.', 'Do today\'s part.'],
    jinwoo: ['Daily. Quiet. Consistent.', 'Complete today\'s quests.'],
    goku: ['Train, eat, rest. In that order.', 'Stay disciplined today.'],
    kakashi: ['Be on time. Log your meals.', 'Routine is the method.'],
    zoro: ['Train. Eat. Sleep. Repeat.', 'Stay on your line.'],
    gojo: ['Do the basics well.', 'Stay on the plan today.'],
    tanjiro: ['Steady effort. No shortcuts.', 'Finish today\'s step.'],
    killua: ['Fast, focused, done.', 'Log it and move.'],
    vegeta: ['Train harder than yesterday.', 'Surpass your last best.'],
    zenitsu: ['Focus! Do the next step!', 'You can do this. Go!'],
    bakugo: ['Log it. Now. Move!', 'Finish today strong!'],
  },
};

// Notification and review copy by tone (used by mobile reminders and the weekly review).
const NOTIFY = {
  meal: {
    gentle: { title: 'A gentle reminder', body: 'When you are ready, log your {meal}. No rush.' },
    strict: { title: 'Log your {meal}', body: 'Takes one minute. Do it now.' },
    funny: { title: 'Your {meal} is waiting', body: 'It would like to be in the diary. Tap to log.' },
  },
  tiffin: {
    gentle: { title: 'Tomorrow\'s lunch', body: 'A minute tonight makes tomorrow easier.' },
    strict: { title: 'Plan tomorrow\'s lunch', body: 'Pick a favourite. Done in a minute.' },
    funny: { title: 'Lunch side quest', body: 'Pick tomorrow\'s lunch before the hunger boss appears.' },
  },
  water: {
    gentle: { title: 'Sip of water?', body: 'A glass of water would feel nice right now.' },
    strict: { title: 'Water', body: 'Drink a glass now.' },
    funny: { title: 'Hydration quest', body: 'Your water bottle is feeling lonely.' },
  },
};
const REVIEW = {
  gentle: { celebrate: ['A lovely week', 'You showed up and it shows. Be proud.'], good: ['A steady week', 'You are building the habit, gently. One small idea below may help.'], encourage: ['A fresh week ahead', 'Every week is a new beginning. Start with one small thing.'] },
  strict: { celebrate: ['Strong week', 'Good consistency. Repeat it.'], good: ['Solid week', 'Good base. One change below will help most.'], encourage: ['Reset week', 'Last week was light. Pick one thing from the list and do it.'] },
  funny: { celebrate: ['What a week!', 'The leaderboard has your name on it.'], good: ['Solid week, hero', 'The habit is forming. One tweak below will help.'], encourage: ['Filler episode, now the next arc', 'Pick one thing from the list. That is all it takes.'] },
};

const SUPPORT_NOTE = {
  text: 'If thinking about food feels stressful, or you are worried about how you eat, you do not have to handle it alone. A doctor, a counsellor, or someone you trust can help. Talking about it is a strong thing to do.',
  india: 'In India you can call Tele-MANAS on 14416 (free, 24 hours). Please check the number for your own country.',
};

const norm = (t) => (TONES.includes(t) ? t : 'funny');
function toneBundle(tone) {
  const t = norm(tone);
  return {
    tone: t, tones: TONES, mood: MOOD[t], voice: VOICE[t] || null, review: REVIEW[t], support: SUPPORT_NOTE,
    notify: Object.fromEntries(Object.entries(NOTIFY).map(([k, v]) => [k, v[t]])),
  };
}
const reviewLine = (tone, mood) => REVIEW[norm(tone)][mood] || REVIEW.funny[mood];

module.exports = { TONES, MOOD, VOICE, NOTIFY, REVIEW, SUPPORT_NOTE, toneBundle, reviewLine, norm };
