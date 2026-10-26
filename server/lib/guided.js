// Guided meditate and stretch sessions: text cues, a breathing pattern and a timeline. No audio is licensed or shipped;
// clients may play a simple generated tone or stay silent. Pure functions.
const MIN_MINUTES = 3, MAX_MINUTES = 10;
const ACTIVITY_NAME = { meditate: 'Cult – Meditation', stretch: 'Cult – Stretching / Mobility' };
const WHO = { meditate: 'kakashi', stretch: 'zoro' };

// Seconds: inhale, hold, exhale, rest. Slow and easy; nobody is asked to hold their breath for long.
const BREATH = { inhale: 4, hold: 2, exhale: 6, rest: 0 };
const breathCycleSec = (b = BREATH) => b.inhale + b.hold + b.exhale + b.rest;

const STRETCHES = [
  ['Neck side tilt', 'Drop one ear toward the shoulder. Keep the other shoulder soft.'],
  ['Shoulder rolls', 'Roll both shoulders back in slow circles.'],
  ['Chest opener', 'Clasp the hands behind you and lift gently.'],
  ['Cat and cow', 'On hands and knees, round and arch the back slowly.'],
  ['Hamstring stretch', 'Sit, extend one leg and reach toward the toes. Keep the knee soft.'],
  ['Quad stretch', 'Stand, hold one ankle and bring the heel toward you.'],
  ['Hip flexor lunge', 'Step into a low lunge and let the hips sink forward.'],
  ["Child's pose", 'Sit back on your heels, arms long, forehead down.'],
  ['Spinal twist', 'Lying down, drop both knees to one side and look the other way.'],
];

const MEDITATE_CUES = [
  'Sit comfortably and let your shoulders drop.',
  'Close your eyes, or rest your gaze on one spot.',
  'Breathe in through the nose as the circle grows. Breathe out slowly as it shrinks.',
  'If your mind wanders, that is normal. Come back to the breath.',
  'Notice the feet, the seat and the breath, one at a time.',
  'Let each out-breath be a little slower than the last.',
];

const clampMinutes = (m) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(Number(m) || 5)));

/** Timeline of cues: [{atSec, text, title?}] and total seconds. kind = 'meditate' | 'stretch'. */
function buildGuided(kind, minutes) {
  const k = kind === 'stretch' ? 'stretch' : 'meditate';
  const mins = clampMinutes(minutes);
  const total = mins * 60;
  const cues = [];
  if (k === 'meditate') {
    const gap = Math.max(20, Math.floor(total / (MEDITATE_CUES.length + 1)));
    MEDITATE_CUES.forEach((text, i) => cues.push({ atSec: i * gap, text }));
    cues.push({ atSec: Math.max(0, total - 10), text: 'Take one last deep breath, then open your eyes slowly.' });
  } else {
    const per = Math.max(30, Math.min(60, Math.floor(total / STRETCHES.length)));
    const count = Math.max(1, Math.min(STRETCHES.length, Math.floor(total / per)));
    for (let i = 0; i < count; i += 1) cues.push({ atSec: i * per, title: STRETCHES[i][0], text: `${STRETCHES[i][1]} Ease off if it hurts.` });
  }
  return {
    kind: k, minutes: mins, totalSec: total, who: WHO[k], scene: k === 'meditate' ? 'health' : 'plan',
    breath: BREATH, breathCycleSec: breathCycleSec(), cues,
    note: 'Stop if you feel pain. This is a relaxing routine, not medical advice.',
  };
}

/** The cue that should be showing at a given second. */
const cueAt = (guided, sec) => guided.cues.reduce((cur, c) => (c.atSec <= sec ? c : cur), guided.cues[0]);

/** Breathing phase at a second: {phase:'inhale'|'hold'|'exhale'|'rest', left, progress 0..1 for the animation (circle size)}. */
function breathPhase(sec, b = BREATH) {
  const cycle = breathCycleSec(b);
  const t = ((Math.floor(sec) % cycle) + cycle) % cycle;
  if (t < b.inhale) return { phase: 'inhale', left: b.inhale - t, progress: t / b.inhale };
  if (t < b.inhale + b.hold) return { phase: 'hold', left: b.inhale + b.hold - t, progress: 1 };
  const e = t - b.inhale - b.hold;
  if (e < b.exhale) return { phase: 'exhale', left: b.exhale - e, progress: 1 - e / b.exhale };
  return { phase: 'rest', left: cycle - t, progress: 0 };
}

module.exports = { MIN_MINUTES, MAX_MINUTES, ACTIVITY_NAME, WHO, BREATH, breathCycleSec, buildGuided, cueAt, breathPhase, clampMinutes, STRETCHES, MEDITATE_CUES };
