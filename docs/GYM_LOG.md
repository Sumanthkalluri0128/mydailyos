# Gym log (private, offline)

Log exercises (sets x reps x weight), body weight and tape measurements, set a body goal, see progress, and download everything.

**Privacy:** all data stays on the device (phone: AsyncStorage key `flexfit_gymlog_v1`; web: localStorage, same key). There is no API call in any gym-log file, it is not in the server backup or account export. Data leaves only via the Export tab.

## Where
- Phone: Workout tab -> "Gym log & body tracker" card -> `src/app/gym-log.tsx`
- Web: menu -> Move & body -> Gym log (also Workout page -> More) -> `client/src/pages/GymLogPage.jsx`

## Code map
| File | Job |
|---|---|
| `utils/gymMath` | pure maths: e1RM, volume, PRs, trend, goal progress + ETA, BMI, Navy body fat |
| `utils/gymClean` | validation of stored/imported data |
| `utils/gymCatalog` | ~200-exercise catalogue merged into the picker |
| `utils/gymExport` | CSV (workouts: one row per set; body) and JSON backup builders |
| `utils/gymStore` | local storage + hook (phone: AsyncStorage, web: localStorage) |
| `utils/gymShare` (phone) / `gymDownload` (web) | share sheet / browser download |

The web `gymMath/gymClean/gymExport.js` are GENERATED from the phone's typed `.ts` files: edit the `.ts`, then run `node tools/genGymFromMobile.cjs` in the web repo (expects the two repos side by side).

Units: stored as kg / cm. Weight can be shown in kg or lb; tape measurements are cm.
Tests: phone `npx jest src/utils/__tests__/gymMath.test.ts`; web `npm test`.

## Calories burned (estimate)
`gymMath.entryKcal`: MET x 3.5 x body kg / 200 per minute (same formula as the Workout tab). Time per set = reps x 3 s + 60 s rest; holds use their seconds; cardio uses its minutes. MET comes from `metFor` (compound lifts 5, isolation/core 3.5, holds 3, cardio 2.3-9 by type). Body weight = your latest logged weight on or before that day, else 70 kg (the screen says when it is assuming 70). Shown in the editor, per exercise, per day, per week, and as `est_kcal` per set in the workouts CSV. It is an estimate only.

## Exercise catalogue
`gymCatalog` has ~200 common gym lifts (barbell/dumbbell/cable/machine/bodyweight/cardio/full-body). It is merged into the picker after the app's own library, by name, so nothing appears twice. It does not feed the workout plans or exercise photos. Add lines to `RAW` in `gymCatalog.ts` (phone) and regenerate the web copy.

## Treadmill / run pace
For minute-timed cardio (Treadmill, Running, Walking...) each set also takes an optional **average pace per km** (`GymSet.pace`, typed as `6:30` or `6.5`, accepted 2:00-30:00). With a pace, time x pace gives the distance, and calories come from the speed (ACSM equations, level ground: VO2 = 0.1 x speed m/min + 3.5 walking, 0.2 x speed + 3.5 running, MET = VO2 / 3.5; 6-8 km/h is blended so there is no jump). Without a pace the old per-exercise MET is used. Distance shows in the day list and as `pace_min_per_km` / `distance_km` in the workouts CSV. The synced Exercise row keeps the pace and km in its note. Helpers: `parsePace`, `fmtPace`, `speedKph`, `metForPace`, `setKm`, `entryKm` in `gymMath`.
