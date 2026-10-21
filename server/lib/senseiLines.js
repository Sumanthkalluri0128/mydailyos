// What the Planning sensei says. Neutral lines per tone (cheer / calm / strict) plus a short flavour for each anime coach, so a question
// is asked "by the day's character or the chosen coach in the chosen tone", and every answer gets a short in-character reaction.
// Original wording (no quotes from any series). Nothing here shames: the test suite runs every line through lib/safety.toneCheck.
const TONES = ['cheer', 'calm', 'strict'];

const ASK = {
  cheer: ['Quick one!', 'Next question, you are doing great.', 'Tell me this and I can cook up something good.', 'Easy one coming up.'],
  calm: ['One small question.', 'Whenever you are ready.', 'This helps me plan gently for you.', 'Just one more thing.'],
  strict: ['Answer this and we move on.', 'I need this to plan properly.', 'Short answer is fine.', 'One detail I need.'],
};
const INTRO = {
  cheer: ['Welcome to the kitchen! Let me ask a few quick things so your plan feels like yours.', 'Ready to build a plan you will actually enjoy? A few quick questions first.'],
  calm: ['Hello. A few gentle questions and I will build a plan that fits your life.', 'Let us set this up together, one small step at a time.'],
  strict: ['Good. Four questions at most, then your plan.', 'Plan setup. I only ask what I need.'],
};
const UPDATE = {
  cheer: ['Welcome back! I only need to check what changed.', 'Let us tune your plan: just a couple of quick ones.'],
  calm: ['Welcome back. Only what may have changed, nothing more.', 'A short check-in so the plan stays right for you.'],
  strict: ['Back again. Only the changes.', 'Quick update. Then the plan.'],
};
const GENERIC_REACT = {
  cheer: ['Got it!', 'Lovely, noted!', 'Perfect, that helps a lot.', 'Nice choice!'],
  calm: ['Thank you, noted.', 'That is helpful.', 'Understood.', 'Good to know.'],
  strict: ['Noted.', 'Recorded.', 'Understood.', 'Good.'],
};
const SKIP = { cheer: ['No problem, we will skip it!', 'Skipped. I will use a sensible default.'], calm: ['That is fine, we can skip it.', 'No worries, I will leave it.'], strict: ['Skipped.', 'Fine. Default it is.'] };
const USUAL = { cheer: ['Your usual, coming right up!', 'Same as always, got it.'], calm: ['Your usual it is.', 'Keeping things as they are.'], strict: ['Usual kept.', 'Same as before.'] };
const DONE = { cheer: ['All set! Your Meal Sensei sticker is ready.', 'Setup done! Here comes your plan.'], calm: ['That is everything. Your plan is ready to preview.', 'All set. Take a look at your plan.'], strict: ['Setup complete. Preview below.', 'Done. Review your plan.'] };

// reactions that matter (a promise about allergies, a time limit ...). {v} = the chosen labels.
const REACT = {
  avoid: {
    any: { cheer: ['Locked in: {v} will never be in any plan, swap or suggestion.', 'Safety first! I will keep {v} out of everything.'], calm: ['I will keep {v} out of every plan, swap and suggestion. That does not change.', 'Noted: {v} stays out, always.'], strict: ['{v}: excluded everywhere. No exceptions.', 'Rule set: {v} never appears.'] },
    none: { cheer: ['Great, nothing to avoid!'], calm: ['Nothing to avoid, good to know.'], strict: ['No exclusions recorded.'] },
  },
  health: {
    any: { cheer: ['Thanks for telling me. I will keep your plan comfortable and add a doctor note.'], calm: ['Thank you for trusting me with that. I will keep targets gentle and suggest checking with your doctor.'], strict: ['Understood. Gentle targets and a doctor note.'] },
  },
  cookTime: { any: { cheer: ['Short on time? I will keep the cooking quick!'], calm: ['I will respect the time you have for each meal.'], strict: ['Cook-time limits set.'] } },
  prep: { twice: { cheer: ['Cook once, eat twice. Smart!'], calm: ['Leftovers can make the week easier. I will plan for them.'], strict: ['Batch logic enabled.'] }, sunday: { cheer: ['Sunday batch-cook, here we go!'], calm: ['A Sunday batch will lighten your weekdays.'], strict: ['Sunday batch-cook enabled.'] } },
  fasting: { any: { cheer: ['Timing noted, I will plan around it!'], calm: ['I will plan around your fasting times.'], strict: ['Fasting schedule applied.'] } },
  household: { any: { cheer: ['Cooking for a crowd! I will scale the shopping list.'], calm: ['I will scale the shopping list for everyone.'], strict: ['Shopping list will scale to your household.'] } },
  budget: { low: { cheer: ['Budget-friendly it is!'], calm: ['I will keep it affordable.'], strict: ['Low-cost foods preferred.'] } },
};

// flavour per coach: a short opening and a short closing, original lines in the spirit of each character
const COACH = {
  asta: { open: 'Alright, no giving up!', close: 'Let us cook with all our heart!' }, luffy: { open: 'Shishishi!', close: 'Let us eat well!' }, naruto: { open: 'Believe it!', close: 'Plan first, ramen after.' },
  jinwoo: { open: 'Understood.', close: 'Level up, one meal at a time.' }, goku: { open: 'Alright!', close: 'Time to power up!' }, kakashi: { open: 'Hm, let me see.', close: 'A calm, prepared week.' },
  zoro: { open: 'Hm.', close: 'Fuel first, then train.' }, gojo: { open: 'Easy question:', close: 'Leave the rest to me.' }, tanjiro: { open: 'Let us do our best,', close: 'Every meal counts.' },
  killua: { open: 'Quick one:', close: 'Easy. Next.' }, vegeta: { open: 'Listen carefully:', close: 'Eat like a champion.' }, zenitsu: { open: 'Um, okay, one question!', close: 'We did it, I think!' },
  bakugo: { open: 'Hey, pay attention:', close: 'Now eat it all!' },
};

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

module.exports = { TONES, ASK, INTRO, UPDATE, GENERIC_REACT, SKIP, USUAL, DONE, REACT, COACH, pick };
