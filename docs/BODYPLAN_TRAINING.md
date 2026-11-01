# Body plan: training program and body analysis

## 1. What the old Body plan did, and what was wrong with it

The plan worked out calories, macros, a target weight and a pace well. Its training advice was three fixed sentences per body goal
(`TRAINING` in `lib/bodyPlan.js`), the same for every person. Run on seven different bodies it gave the same text to all of them.

| Gap | Example found by running the engine |
|---|---|
| No exercises, sets, reps, rest, progression | "4 strength sessions: 2 upper, 2 lower" and nothing else |
| Ignored body size | A 108 kg man (BMI 36) on "athletic" was told to do 1 to 2 hard interval sessions; a 188 cm, 70 kg man got the same lines as a 160 cm man |
| No gym / home / active choice | Only one imaginary setting |
| No alternatives when a machine is busy or missing | None |
| No injury handling | None |
| No experience level | Beginners and 5-year lifters got the same advice |
| Days fixed by goal | Could not fit a 2- or 5-day week |
| Pace promised could not be reached | A 45-year-old, 88 kg woman: calories held at the 1,200 floor, yet "0.65 kg a week, 31 weeks". The floor allows about 0.55, so about 37 weeks |
| Underfed lighter frames | A tall 70 kg man choosing "muscular" is put at maintenance calories (not changed here, see section 7) |

## 2. What was built

**`server/lib/exerciseLibrary.js`**: 130 exercises, each tagged by movement slot (squat, hinge, press, row...), difficulty, equipment,
the injuries that rule it out, and body tags (good for tall frames, joint-friendly, glute-biased...). A ranking function picks the best
exercise for a slot for this person. `swapsFor` returns alternatives of different kinds (machine / cable / free weight / bodyweight).

**`server/lib/trainingPlan.js`**: builds the analysis and the weekly program.

**`server/lib/bodyPlan.js`**: now passes the person's setup in, returns `plan.analysis` and `plan.training.program`, and slows the pace
honestly when the calorie floor limits it. `plan.training.sessions` (plain lines) is kept so older apps still show something.

**API** (`routes/bodyPlanRoutes.js`): `GET /api/body-plan?type=..&place=..&level=..&days=..&minutes=..&equipment=a,b&limits=..&focus=..`
previews without saving; `POST /api/body-plan/apply { type, training }` saves the goal and the setup. `Profile.training` stores it.

**Screens**: web `BodyPlanPage.jsx` + `TrainingSections.jsx`; phone `app/body-plan.tsx` + `components/TrainingSections.tsx`.

## 3. The setup the person gives

Where (gym / home / both) · experience (3 levels) · days a week (2 to 6) · minutes a session · home equipment (dumbbells, bands, bench,
pull-up bar, kettlebell) · anything that hurts (knee, lower back, shoulder, wrist, elbow, heart or blood pressure) · up to 3 muscles to bring up.
If not given, the plan assumes beginner, gym, and says so on screen.

## 4. How the body analysis works

From height, weight, age, sex, body fat (tape if available) and the latest tape readings:

* Frame: height class (tall / average / shorter, cut-offs by sex), build class (higher weight, extra body fat, lighter, medium), lean and fat mass,
  fat-free mass index. If the FFMI is higher than is realistic, the band is hidden and the person is told the body-fat estimate is probably low.
* Proportions: waist to height (0.5 marker), chest to waist (men), waist to hips (women), each with a plain reading.
* Muscles to bring up: by sex and goal, plus the person's own choices.
* "What your body changed in the plan": every adjustment with its reason (see table).
* Expectations: weeks to target, muscle gain in kg a month (rule-of-thumb ranges by level, halved for women, reduced in a deficit), recovery needs.

| If the person is... | The plan does |
|---|---|
| Tall (male 180+, female 168+ cm) | Leg press, hack squat, box squat, trap-bar and cable work ahead of the barbell back squat; pulldowns before pull-ups |
| Shorter (male 165-, female 153- cm) | Goblet and barbell patterns, floor presses, push-ups; tips for seat and cable heights |
| BMI 30+ or much extra fat | Guided machines first, no jumping or running, intervals skipped, cardio ramps up from 90 minutes a week, cardio options all low impact |
| BMI 35+ | The above, plus 15 seconds more rest and a "check with your doctor" notice |
| Lighter (BMI under 20) | Heavy simple lifts, cardio capped at 60 minutes a week, reminder to eat enough |
| Female | Glutes twice a week or more (hip thrust, single-leg work), back and shoulders for shape |
| 45+ / 60+ | Longer warm-up, +30 s rest, effort kept 3 to 4 reps from the limit, joint-friendly variants, fewer days (max 4 over 55) |
| Beginner / intermediate / advanced | 3 sets of 8-12 at 3 in reserve / 6-10 at 2 / 5-8 at 2 with more sets |
| In a deficit | Volume capped, strength is the scoreboard, easy week every 5 weeks |
| Muscular / athletic / lean / balanced goal | Heavy compounds first, extra shoulder and back width, 3 full-body days, or shorter 2-3 day plans |

## 5. The program

* Split by days: 2 full body, 3 full body, 4 upper/lower, 5 upper/lower/push/pull/legs, 6 push/pull/legs twice.
* Each session: warm-up, exercises (sets, rep range, rest, reps in reserve, cue, how to progress), cool-down.
* Time: slots are trimmed to the session length, never the big lifts, and never below 4 exercises. Priority slots (women's glutes, athletic
  side shoulders, chosen focus) keep their weekly count.
* Weekly volume per muscle is counted (helper muscles at half credit) and shown against a range for the level.
* **For each exercise**: up to 3 busy-machine options of different kinds with how to adjust the load, one dumbbell-and-bench option, one
  no-equipment option, and the next easier and harder version.
* **For each day**: a home version (uses only the equipment the person owns), and a 20-minute quick circuit.
* **Active days**: 14 activities with calories for the person's weight (MET x kg x hours), filtered for impact and the heart limit;
  a 10-minute minimum day; cardio zones from the Tanaka max heart rate; intervals only when joints, heart, age and level allow.
* **Progression**: double progression (reps, then weight), 2 learning weeks, an easy week every 5 or 6 weeks, a home ladder (tempo, pause,
  single-leg, loaded backpack), and what to do when stuck.
* **Injuries** remove the moves that commonly aggravate them everywhere (main plan, home version, quick circuit and every swap). If a slot has
  no safe option, it is dropped rather than replaced with a risky move.

Wording avoids "failure": effort is "stop with N reps left" (the app's tone check bans shaming words, and the tests enforce it).

## 6. Honest limits

* A sound starting program from established strength-training practice, not a diagnosis. The first weeks are for finding the right weights.
* Body fat from height/weight/age is an estimate that can be several points off. FFMI and the focus list inherit that.
* Muscle-gain and fat-loss numbers are rule-of-thumb ranges.
* Injury handling removes common aggravators; it does not replace a physiotherapist.
* Exercise cues are short. A gym trainer should check squat, hinge and press once.

## 7. Found but not changed (your decision)

* **Maintenance calories in "build" and light "recomp" cases.** The note says "maintenance or slightly above", but the number is exactly
  maintenance. The plan now tells the person to set a target weight above their current one in Goals to get a small surplus. Changing the
  calorie engine would need the same change in the web and phone copies of `energy` and new fixtures.
* The Home screen could show "Today's session" from this program (it knows the day and session). Not built.
* Tape types are waist, chest, hips, arm, thigh, neck. Shoulder width and calf are not tracked.

## 8. Tests

`server/test/trainingPlan.unit.test.js` (18) and `server/test/bodyPlanRoutes.unit.test.js` (6, real router over HTTP with the database stubbed).
They cover every goal x level x place x days combination, every injury limit across all outputs, equipment honesty at home, swaps,
body-size behaviour, volume, time fitting, honest pace, input cleaning, schema validation and the tone check.

## 9. Adapting to what you actually do (v55)

The program above is the starting point. `lib/bodyPlanAdapt.js` re-works it every time the screen loads, from:
sessions logged on the Body plan (BodyPlanSession), other workouts in the activity log (lifting counts, cardio adds minutes), weigh-ins,
waist readings. Nothing is guessed: with no history the plan says "find your weight" and waits for the first session.

| You... | The plan does | Why |
|---|---|---|
| Hit the top of the rep range on every set | Weight up a small step, reps restart at the bottom | Double progression |
| Are mid-range | Aim for +1 rep at the same weight | Same |
| Drop 2+ reps two sessions in a row | Same weight, one set fewer | Tired, not weak |
| Skip a session | Slides it to the next open day (keeps a rest day, no 3 lifting days in a row), else lets it go | Never double up |
| Feel "hard" in half your recent sessions, or report soreness twice | Easy week: weights x0.9, one set fewer | Recovery |
| Train 5-6 weeks without an easy week | Easy week | Planned deload |
| Come back after 8+ days away | Weights x0.95 / x0.9 / x0.8 | Detraining is quick, regaining is quicker |
| Are consistent, fresh, and a muscle is under its weekly range | +1 set there | Volume only where it is missing |
| Do more than planned for 3+ weeks and recover well | Offers one more day (max for your level and age) | More only helps if recovery keeps up |
| Report pain in the same area twice | Offers to remove moves that load it | Train around it |
| Lose weight faster than the safe pace | Says so; eat a little more, keep lifting | Protect muscle |
| Stall while cutting | Steps first, then the app's own calorie engine | Steps do not cost recovery |

Not changed: calories and macros (the app's weight-trend engine owns those), and the exercise library. Limits: advice comes from general
strength-training practice and your own logged numbers; it is not medical advice, and logging is only as good as what is entered.
