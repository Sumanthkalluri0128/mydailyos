// ONE content file for the tour, the first-week checklist, the screen hints and the "what's new" dots.
// Web and mobile keep a byte-identical copy of this file (and of tourEngine.js) so the two apps teach exactly the same things.
// Rules (checked by tests): at most 20 words per step, at most 5 interactive "first win" steps, at most 3 hints per screen.
// `anchor` = the name of the element: data-tour="..." on web, testID="tour-..." on mobile.
const content = {
  version: 1,
  welcome: [
    { id: 'what', emoji: '👋', title: 'Welcome to FlexFit', text: 'Log food, water and workouts in seconds. Your coach turns it into a simple plan.' },
    { id: 'goal', emoji: '🎯', title: 'What is your goal?', text: 'Pick one. We shape the tour around it.', choice: 'goal' },
    { id: 'coach', emoji: '🧑‍🏫', title: 'Choose your coach', text: 'Your coach guides you and cheers you on. You can change them any time.', choice: 'coach' },
  ],
  goals: [
    { id: 'lose', label: 'Lose weight' },
    { id: 'build', label: 'Build muscle' },
    { id: 'stay', label: 'Stay healthy' },
  ],
  // step id -> what to show. `event` = the real action we wait for (null = the person just taps Next).
  steps: {
    water: { screen: 'home', anchor: 'add-water', title: 'Log a glass of water', text: 'Tap + and log a glass of water. Your first win!', event: 'water.logged', cheer: 'Nice sip! Water logged.' },
    food: { screen: 'log', anchor: 'food-search', title: 'Add your first food', text: "Search 'dal' and add it to today.", event: 'food.logged', cheer: 'Yum. Your first meal is in.' },
    weight: { screen: 'weight', anchor: 'weight-add', title: 'Add your weight', text: 'Enter today\'s weight. It stays blurred until you tap it.', event: 'weight.logged', cheer: 'Starting point saved.' },
    plan: { screen: 'planner', anchor: 'planner-plan', title: 'Plan tomorrow', text: 'Open the planner and plan tomorrow in one tap.', event: 'plan.created', cheer: 'Tomorrow is sorted.' },
    coach: { screen: 'home', anchor: 'coach', title: 'Meet your coach', text: 'Tap your coach and ask what to do next.', event: 'coach.met', cheer: 'Your coach says hello!' },
    goalcard: { screen: 'home', anchor: 'goal-card', title: 'Your one goal', text: 'This card shows progress and your likely finish date.', event: null, cheer: '' },
    sensei: { screen: 'planner', anchor: 'planner-plan', title: 'Planning sensei', text: 'Answer three quick questions and get a plan that fits you.', event: null, cheer: '' },
  },
  // goal -> ordered step ids. Interactive ones (those with an event) are capped at 5.
  paths: {
    lose: ['water', 'food', 'goalcard', 'weight', 'plan', 'sensei', 'coach'],
    build: ['food', 'water', 'plan', 'sensei', 'weight', 'goalcard', 'coach'],
    stay: ['water', 'food', 'plan', 'sensei', 'goalcard', 'coach'],
  },
  // "Your first week" checklist on Home. Each item is ticked by a real event.
  checklist: [
    { id: 'meal', label: 'Log a meal', event: 'food.logged' },
    { id: 'water', label: 'Log water', event: 'water.logged' },
    { id: 'weight', label: 'Add your weight', event: 'weight.logged' },
    { id: 'plan', label: 'Plan tomorrow', event: 'plan.created' },
    { id: 'coach', label: 'Meet your coach', event: 'coach.met' },
  ],
  checklistReward: { text: 'First week complete. Rookie sticker unlocked!', sticker: 'rookie' },
  // Hints shown once on the first visit to a main screen (1-3 each).
  hints: {
    log: [
      { id: 'log-1', anchor: 'food-search', text: 'Search, scan or type a meal like "2 rotis and dal".' },
      { id: 'log-2', anchor: null, text: 'Nothing logged yet? Try Type a meal. It is the fastest way.' },
    ],
    planner: [
      { id: 'planner-1', anchor: 'planner-plan', text: 'Your planning sensei asks a few questions, then builds your week.' },
      { id: 'planner-2', anchor: null, text: 'Lock a meal you love, then shuffle the rest.' },
    ],
    progress: [
      { id: 'progress-1', anchor: 'goal-card', text: 'Progress comes first: kilos done, then your likely finish range.' },
      { id: 'progress-2', anchor: null, text: 'The trend line ignores daily scale noise.' },
    ],
    tasks: [{ id: 'tasks-1', anchor: null, text: 'Tasks and habits keep your routine steady. Add one small one.' }],
    profile: [
      { id: 'profile-1', anchor: null, text: 'Targets, reminders and your data live here.' },
      { id: 'profile-2', anchor: null, text: 'Replay this tour any time from Help.' },
    ],
  },
  // What's new: add an entry when a feature ships. A dot appears on `anchor` until the one-time tooltip is seen.
  whatsNew: [
    { id: 'wn-simple-progress', since: '37', anchor: 'goal-card', text: 'New: one goal, three quests, one level. Everything else is under Details.' },
  ],
  // Which real API calls count as which event (method + path prefix).
  events: [
    { method: 'POST', prefix: '/api/water', event: 'water.logged' },
    { method: 'POST', prefix: '/api/food-logs', event: 'food.logged' },
    { method: 'POST', prefix: '/api/weight', event: 'weight.logged' },
    { method: 'POST', prefix: '/api/meal-plans', event: 'plan.created', not: ['/lock', '/clear', '/templates', '/log', '/swap'] },
    { method: 'POST', prefix: '/api/assistant/ask', event: 'coach.met' },
  ],
};
export default content;
