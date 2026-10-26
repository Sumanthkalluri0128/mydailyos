// Muscle groups for exercises. Pure data + matching, shared by the activity catalogue, volume and the daily suggestion.
// Catalogue entries carry `muscles` explicitly; custom or older names fall back to keyword matching.
// Unknown stays unknown: an exercise we cannot place returns [] and is simply left out of muscle volume.
const GROUPS = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs', 'glutes'];

// Order matters: the first rule that matches wins, so specific names come before general ones.
const KEYWORDS = [
  [/deadlift|romanian|rdl/, ['back', 'glutes', 'legs']],
  [/hip thrust|glute bridge|glute/, ['glutes']],
  [/squat|lunge|leg press|leg extension|leg curl|calf|step[- ]?up/, ['legs', 'glutes']],
  [/bench|push[- ]?up|press[- ]?up|chest|fly|flye|dip/, ['chest', 'arms', 'shoulders']],
  [/overhead|shoulder|lateral raise|military|arnold/, ['shoulders', 'arms']],
  [/pull[- ]?up|chin[- ]?up|lat pull|row|pulldown|face pull/, ['back', 'arms']],
  [/curl|tricep|bicep|skull/, ['arms']],
  [/plank|crunch|sit[- ]?up|core|ab wheel|leg raise|russian twist|mountain climber/, ['core']],
];

const CATEGORY_FALLBACK = { 'Mind & Mobility': [] };

function muscleGroupsFor(name, category, explicit) {
  if (Array.isArray(explicit) && explicit.length) return explicit.filter((m) => GROUPS.includes(m));
  const n = String(name || '').toLowerCase();
  for (const [re, groups] of KEYWORDS) if (re.test(n)) return groups.slice();
  if (n in CATEGORY_FALLBACK) return CATEGORY_FALLBACK[n];
  if (/bodyweight circuit/.test(n)) return ['chest', 'legs', 'core'];
  return [];
}

module.exports = { GROUPS, muscleGroupsFor };
