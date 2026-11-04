// Bumped whenever the phone app starts to rely on something new from the server. /api/health reports it, and tools/checkServerReady.mjs
// compares it with what the phone build needs, so "deploy the server first" can be CHECKED instead of remembered.
//   60  goal-range: remainingKg, likelyDays, startDate, endDate, same "now" as the goal card; goal card checkLine / lastWeighIn;
//       PUT /api/plan startMode ("keep" | "fresh") + startChoice in the preview; protein hint wording.
const API_LEVEL = 60;
const FEATURES = ['goal-range-v2', 'goal-check-line', 'plan-start-mode', 'protein-range-hint'];
module.exports = { API_LEVEL, FEATURES };
