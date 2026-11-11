# One source of truth for targets and progress

Choose a body goal once and every screen follows. There is no second copy of the rules.

## The two functions everything uses
Source: `packages/shared/src/energy.js` (in this zip: `repo-root-packages/shared/src/energy.js`).
Generated copies (do not edit): `server/lib/energy.js`, `client/src/utils/energy.js`, and the phone's `src/utils/energy.ts`.
Regenerate with `node tools/syncShared.mjs` from the repo root. `--check` fails CI if a copy was edited by hand.

- `resolveTargets(profile)` -> calories, macros, healthy ranges, limits, water, steps, exercise minutes, goal weight, weeks to goal,
  body-goal label, and whether protein is automatic or your own number.
- `weightProgress({ startKg, currentKg, targetKg, paceKgPerWeek })` -> kg done, kg to go, %, weeks left, reached.

## Where each number comes from now
| Thing | One definition |
|---|---|
| Calories, macros, water, steps | `resolveTargets` (Home, My Plan, Profile, Progress, Food, Coach, Weekly, widget, rings, emails, onboarding) |
| Kg done / to go / % | `weightProgress`; start = plan start, now = plan trend (7-day average), goal = plan goal |
| Server + apps | `GET/PATCH /api/profile` also returns `profile.targets` and `profile.progress` |
| Choosing a body goal | `POST /api/body-plan/apply` now also starts or ends the progress record (`plan.*`), so progress follows the goal |

## What was wrong
1. Home read a saved protein override that My Plan ignored. The web Profile form and phone onboarding pinned protein to 140/130/160 g.
2. Three different "kg done" formulas (journey, goal card, plan page) with different starts and "now" weights.
3. Applying a body goal saved macros but never started the progress record, so progress cards stayed empty or stale.
4. Water precedence differed between server (saved first) and apps (weight first); rings and Home had fixed 140 g / 1800 kcal fallbacks.

## Guards
- `server/test/singleSource.unit.test.js`: fails if any file outside `energy.js` calls `macroTargets` / `macroRanges`, and checks that the goal card, journey and profile view agree.
- `server/test/macroSync.unit.test.js`: My Plan equals Home for all four body goals.
- `tools/syncShared.mjs` now refuses to overwrite a translation file that has keys the shared source lacks.
  **Your shared i18n source has 115 keys; the web/phone copies have 380. Merge the copies into `packages/shared/src/i18n/*.json` before running the sync, or it will (correctly) refuse.**

## If Home still shows 140 g
Profile > Protein > clear the box > Save (or save your body plan once).

## Crash guard
`resolveTargets` never returns null (no profile = answers like an empty profile), so a screen that renders before the profile loads cannot crash.
`cd client && node ../tools/smokeRender.mjs` renders Home, Macros, Rings, Workout plan and Account with no / empty / full profiles and fails on any crash. Run it in CI before deploying.
