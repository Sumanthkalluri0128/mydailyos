// Adaptive Home: ONE next step that changes with the time of day and what is already logged.
// Pure and rule-based. Returns { id, text, cta: { label, page } | null, scene }.  Copy is plain and never shaming.
const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };

function nextStep(s = {}) {
  const hour = Math.min(23, Math.max(0, Math.floor(n(s.hour))));
  const meals = s.meals || {};
  const has = (k) => n(meals[k]) > 0;
  const waterT = n(s.waterTargetMl), water = n(s.waterMl);
  const stepsT = n(s.stepsTarget), steps = n(s.steps);
  const budget = n(s.budget), eaten = n(s.eaten);
  const waterFrac = waterT > 0 ? water / waterT : 1;
  const stepsFrac = stepsT > 0 ? steps / stepsT : 1;
  const over = budget > 0 && eaten > budget * 1.05;

  if (hour < 11 && !has('breakfast')) return { id: 'breakfast', scene: 'eat', text: 'Good morning! Log your breakfast, even a rough guess is fine.', cta: { label: 'Log breakfast', page: 'foodLogger' } };
  if (hour >= 5 && hour < 11 && waterFrac < 0.15) return { id: 'water-am', scene: 'drink', text: 'A glass of water first thing is an easy start.', cta: { label: 'Add water', page: 'water' } };
  if (hour >= 11 && hour < 15 && !has('lunch')) return { id: 'lunch', scene: 'eat', text: 'Lunch time. Log it when you eat, so the day stays simple.', cta: { label: 'Log lunch', page: 'foodLogger' } };
  if (hour >= 12 && hour < 18) {
    if (waterT > 0 && waterFrac < 0.5) return { id: 'water', scene: 'drink', text: 'Your water is a little behind. A glass now helps.', cta: { label: 'Add water', page: 'water' } };
    if (stepsT > 0 && stepsFrac < 0.5) return { id: 'steps', scene: 'walk', text: 'A 10-minute walk fits nicely into this part of the day.', cta: { label: 'Log steps', page: 'exercise' } };
  }
  if (hour >= 18) {
    if (over) return { id: 'fix', scene: 'plan', text: 'A little over today is fine. Want a light plan for the rest of the day?', cta: { label: 'Fix my day', page: null } };
    if (!has('dinner')) return { id: 'dinner', scene: 'eat', text: 'Dinner time. Log it so tomorrow can build on today.', cta: { label: 'Log dinner', page: 'foodLogger' } };
    if (!s.weightLogged && hour >= 20 && s.weighDay) return { id: 'weight', scene: 'scale', text: 'It is your weigh-in day. A quick entry is enough.', cta: { label: 'Log weight', page: 'weight' } };
    return { id: 'wind-down', scene: 'health', text: 'Nice work today. Prepare tomorrow\'s plan, then rest well.', cta: { label: 'Plan tomorrow', page: 'planner' } };
  }
  if (!has('lunch') && hour >= 15) return { id: 'late-lunch', scene: 'eat', text: 'Did you eat lunch? Log it so your day stays accurate.', cta: { label: 'Log a meal', page: 'foodLogger' } };
  return { id: 'steady', scene: 'wave', text: 'You are on track. Log what you eat as you go.', cta: null };
}

module.exports = { nextStep };
