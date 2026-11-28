# Companion 2.0

Tap the floating character -> `CompanionPanel`. Hold -> quick menu. Double-tap -> celebrate. Drag -> throw.

How it decides (all in `src/motion/brain.ts`, pure and unit-tested):
- **Pace**: each quest kind has an "expected by this hour" curve (water and steps linear through the day, calories/protein in meal steps, exercise back-loaded). Before ~20% of the day nothing is called "behind".
- **Score** = 70% pace + 30% actual completion, 0-100. Mornings with nothing logged read "Fresh start", not a failure.
- **Best next move** = biggest weighted gap. Mood changes weights: Tired lowers exercise/steps, Pumped raises them. Calories over target -> "Fix my day".
- **Nudges** (`nudgeFor`): quiet 22:00-07:00, 45 min cooldown that grows with each ignored nudge, never the same one twice running.
- **Typed questions** (`answerLocal`): common ones answered on the device; others go to `/api/assistant/ask`.

Tuning knobs: `CURVES`, `WEIGHT_BY_KIND`, the 45-minute base in `nudgeFor`, the 30 s check interval in `Companions.tsx`, `DARES` for challenges.
Quest kinds are detected from the quest id/title (`kindOf`), so a new server quest like "Sleep" shows up as a generic row until you add a kind for it.
