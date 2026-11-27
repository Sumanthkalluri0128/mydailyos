# Phase 1 — Duplicate guards (web + mobile)

Goal: the same action twice (double tap, retry after a timeout, offline-queue replay) never leaves two copies behind.
Nothing here changes saved data. The only schema change is one new optional field (`FoodLog.copiedFrom`).

## Server (deploy this first; old clients keep working)
| File | Change | Why |
|---|---|---|
| `server/models/FoodLog.js` | new optional `copiedFrom` | remembers which entry a copy came from |
| `server/routes/foodLogRoutes.js` `POST /copy` | replay-safe via `clientId`; skips entries already copied to that day; refuses copying a day onto itself (400) | a second tap / queue replay used to copy everything again |
| `server/routes/mealPlanRoutes.js` `POST /copy-week` | skips day+meal+food the destination week already has; returns `alreadyThere` | copying twice doubled the plan and shopping list |
| `server/routes/foodRoutes.js` `POST /` , `POST /:id/duplicate` | identical custom food returns the existing one (`duplicate: true`); copies are numbered "(copy 2)" | double tap made twin foods |
| `server/test/duplicateGuards.integration.test.js` | 4 new tests (fail 4/4 on the old code, pass 4/4 now) | |

## Web client
| File | Change |
|---|---|
| `client/src/utils/attemptId.js` (+ test) | request id that stays the same for the same retried request, changes if the content changes |
| `client/src/pages/FoodLogger.jsx`, `components/foodlogger/LoggerCard.jsx` | multi-add: synchronous lock, button disabled ("Adding…"), stable id |
| `components/RepeatPreview.jsx`, `pages/PlannerPage.jsx`, `components/FoodForm.jsx`, `components/FoodFormModal.jsx` | honest messages when the server says "already there" |

## Mobile client
| File | Change |
|---|---|
| `src/utils/attemptId.ts` (+ test) | same helper as web |
| `src/app/food.tsx` | multi-add and saved-meal log: lock, disabled button, stable id; message when a food already exists |
| `src/components/RepeatPreview.tsx`, `src/app/plan.tsx` | "already there" messages |

## Behaviour changes to know about
* Copying the same entry to the same day twice is now ignored on purpose.
* Copying a day onto itself returns an error.
* Saving an identical custom food returns the existing one instead of creating a twin.

## Verified
* Server: 810 tests, 795 pass, 15 fail — the same 15 fail on the original code (pre-existing, see below). No regressions.
* Web client: 227/227 tests, `vite build` OK.
* Mobile: `tsc` same 8 pre-existing errors, 0 new; lint identical on touched files; Jest 531 pass, same 3 pre-existing failing suites.

## Pre-existing problems found (not changed)
* Server: 15 failing tests (custom foods search returns 0 for a just-created food; weight; security headers; body-plan routes; Google login).
* Mobile: 8 TypeScript errors (Training.tsx, optimistic.ts, NetworkActivity.tsx); 3 failing Jest suites.

## Not in Phase 1
* Health Connect vs manual/gym workout overlap (needs a decision on the matching rule).
