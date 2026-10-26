# Phase 3, Section K: strength and training

Everything is rule-based and free. No AI service, no licensed audio, no medical claims. Nothing here changes existing logs: old duration-only routines and logs work exactly as before.

## What is in it (K.1 to K.6)

| Item | What you get | Where it lives |
|---|---|---|
| K.1 Routines with sets | A routine item can carry target sets, reps, weight and rest (all optional). **Workout mode** steps through the exercises, you tick each set (reps and kg prefilled from last time), the rest timer stays, and Finish saves one workout. "Log as planned" still logs the old way. | `models/WorkoutTemplate.js`, `routes/templateRoutes.js` (`results`), `lib/workoutBuild.js`; web `components/Training.jsx`; mobile `components/Training.tsx` + `app/exercise.tsx` |
| K.2 Progression | Estimated 1RM by Epley **and** Brzycki with the formula shown, a "beat last time" hint, best set and volume per session for each lift, weekly sets per muscle group, a deload nudge, and a plate calculator (kg and lb, your own bar and plates). | `lib/strength.js`, `lib/muscles.js`, `routes/trainingRoutes.js` (`/overview`, `/progress`, `/last-sets`); `utils/training.js` on both clients |
| K.3 Beginner programs | "Training arcs": no-equipment 4 and 6 weeks, basic gym 8 weeks, three sessions a week with weekly "episodes". The step goal rises 500 a week from your own recent average and never passes the goal in your profile. | `lib/programs.js`, `models/TrainingProgram.js`, `/api/training/programs*` |
| K.4 Daily suggestion | One card, 10/20/40 minute choice, equipment choice. Built from yesterday's load, yesterday's steps, last night's sleep, days since each muscle was trained and your active arc. Every choice has a reason ("Legs rested for 3 days. You slept 7 h."). | `lib/workoutSuggest.js`, `/api/training/suggest` |
| K.5 Guided meditate and stretch | 3 to 10 minutes, a breathing circle (in 4 s, hold 2 s, out 6 s) led by Kakashi (meditate) or Zoro (stretch), text cues, optional soft generated tones on web, light haptics on mobile. Logged as the existing Meditation / Stretching activities. | `lib/guided.js`, `/api/training/guided`, `/guided/log` |
| K.6 Safety | Increases of more than 10% over your recent best ask "are you sure?" and can always be kept. Progress hints are small (one rep, or the smallest weight step). The note "Stop if you feel pain. This is a training guide, not medical advice." is shown on workout mode, programs and guided sessions. | `checkJump`, `beatLastTime`, `SAFETY_NOTE` |

## Rules in plain words

- **1RM**: Epley = weight x (1 + reps / 30). Brzycki = weight x 36 / (37 - reps), shown only up to 10 reps (above that it is not reliable, so we show nothing rather than a made-up number). One rep returns the weight itself.
- **Beat last time**: if every set last time reached 12 reps at the same weight, suggest the smallest weight step (2.5 kg from 40 kg, 1.25 kg from 10 kg, 0.5 kg below). Otherwise suggest one more rep at the same weight. Bodyweight moves only ever suggest more reps.
- **Deload nudge**: best 1RM per 7-day block over the last 4 weeks. Flat or lower for 2 weeks in a row gives a mild "watch"; for 3 weeks gives the rest-arc suggestion (about 60% of the weight, half the sets). A week with no session is never read as a stall.
- **Muscle volume**: sets in the last 7 days, counted for every muscle group the exercise trains. Exercises that cannot be placed on a muscle (unknown name) are left out, never guessed. Catalogue lifts carry explicit `muscles`; older or custom names fall back to keyword matching.
- **Training arcs**: a build week adds at most 25% total reps over the last build week; one extra set at most after 3 build weeks (never above 3 sets); programs of 6+ weeks have a **rest arc** in week 4 (under 60% of the load). Gym weights are left for you to pick; "beat last time" takes over after your first session.
- **Step goal**: base = average of your last 14 days of steps (zero days ignored, 3,000 if fewer than 3 days), +500 each week, capped at your profile goal. It is shown in the arc card and does not change your profile goal.
- **Daily suggestion** order: (1) low sleep (under 6 h) **and** a big day yesterday, or every muscle trained in the last day or so: easy guided stretch. (2) An active arc: today's episode trimmed to the time you chose. (3) Otherwise the muscle group rested longest (never logged counts as most rested). Low sleep, a big day yesterday or a deload make it easier (2 sets, calm character). Unknown sleep or steps are never invented.
- **Power level**: the sum of your best estimated 1RM per lift (kg). A fun number made only from your own logged sets. A "power up" scene plays when a finished workout beats your previous best 1RM (or heaviest set). The first time you do a lift is not announced as a record.

## Anime touch

Programs are training arcs with weekly episodes ("The First Step", "Finding Your Rhythm", "Power Awakens", "Rest Arc", "Second Wind", "Rising Strength", "The Big Push", "Final Episode"). Heavy days use Goku, Vegeta and Bakugo; technique and first-week days use Zoro; rest arcs and meditation use Kakashi; stretch uses Zoro. If a character's picture is missing from the sticker set, the app falls back to its normal sticker.

## API (all need login)

- `GET /api/training/overview?date=` power level, lifts, weekly muscle sets
- `GET /api/training/progress?name=&date=` one lift: history, estimates, hint, deload
- `GET /api/training/last-sets?names=a|b&date=` last sets and hint for workout-mode prefill
- `GET /api/training/suggest?date=&minutes=10|20|40&equipment=none|gym`
- `GET /api/training/programs`, `/programs/:id`, `/programs/active?date=`; `POST /programs/start`, `/programs/done`; `DELETE /programs/active`
- `POST /api/training/workout/log` (suggestion, program or any list of exercises); `POST /api/templates/:id/log` now also accepts `results`
- `GET /api/training/guided?kind=meditate|stretch&minutes=3..10`; `POST /guided/log`

## Privacy

The active arc (`TrainingProgram`) is personal data: it is in the account export (`trainingProgram`) and deleted with the account. Logged sets are part of the existing activity logs.

## Honest limits

- Needs a connection to load the suggestion, progress and programs; there is no offline queue for finishing a workout (an error is shown and nothing is lost on screen, so you can retry).
- Web had no routines screen before; this section adds one (Exercise page > Routines). Mobile already had templates and keeps them.
- Plate maths, 1RM maths and the breathing pattern are written twice (server and `utils/training.js`) so they work offline; parity tests keep them identical.
- The coach lines and reasons are English only (not yet in the Hindi, Telugu and Tamil files).
- Sleep comes from the Health page "sleep" entries, steps from step entries. No entry means that part of the reasoning is skipped.
- Step goal ramp does not change your profile goal and the arc does not auto-schedule reminders.
- Tones on web are optional and silent by default; mobile uses haptics only (no tones).
- The web build, mobile build and the database-backed route tests could not be run in this environment (no package registry). The pure logic is tested (server 298, web client 56 pass); routes and screens are syntax-checked only. Please run `npm test` on your side.
- Not medical advice: a training guide only.

## Tests

`server/test/strength.unit.test.js` (1RM formulas, history, beat last time, jump check, muscle volume, deload, plate calculator, records, program ramp rules, step goal, suggestion, guided timeline, workout log build); `client/src/utils/training.test.js` and `mobile/src/utils/__tests__/training.test.ts` (parity of the client maths, workout-mode prefill).
