# Phase 5 — Fixes found while checking the base: tests, a widget crash, a dark-mode bug, duplicates in both orders

## 1. The 15 server tests that already failed on your original code: all fixed (none was a product bug)
| Failing tests | Cause | Fix |
|---|---|---|
| 11 body-plan route tests | the test stubs predate the sleep/energy check-ins and the auto-calorie-target refresh, so the real database was called and waited 10 s to time out | stub `Readiness`, `CoachState`, an awaitable `Profile.findOne`, `findOneAndUpdate`; update the saved-setup shape (`weekdays: []`). The file now runs in under a second |
| custom foods | the shared catalogue is cached; the test added a food straight to the database | clear the cache (`clearFoodCache()`), as the seed scripts do before the server starts |
| weight | it assumed no weigh-in today, but the test before it had made one; that early failure had also been hiding that its leftovers change a later test's step-calorie maths | start clean, clean up after itself; the progress test makes its own weigh-ins |
| security | the file runs with `AUTH_LIMITS_SCALE=100`, so the login limit of 5 is 500 there; the real limits are tested in `authLimits.unit.test.js` | check the route is behind the limiter (advertises 5 x scale) instead of an unreachable 429 |
| Google sign-in | the callback now also looks for other spellings of the same Gmail mailbox (`User.find`) and the test never stubbed it | stub it |

Server suite: **854 of 854** (was 15 failing), and about 10 s faster.

## 2. Phone: 3 failing suites and 8 TypeScript errors, all fixed. Two were real bugs
* **Android widget (real crash):** `FlexFitWidget.tsx` used React fragments (`<>…</>`). The widget library's tree builder cannot draw fragments (it keeps calling `element.type(...)`, which is a Symbol), so building the widget would fail on a device. Replaced the two fragments with keyed arrays, which the library does flatten. Caught by the project's own `widgetTree` test once it could run.
* **Dark mode (real bug):** the network "saving…" pill read `colors.text`, which does not exist in the theme, so its message fell back to black on a dark card. Now `colors.ink`.
* `Training.tsx`: `ExState` combined `Item` (where `sets` is a number) with a list of set rows, an impossible type; now `Omit<Item, 'sets'>`. `optimistic.ts`: the `weight+` type gains the optional `scaleId` the code already sets.
* Jest: `react-native` is mapped to a 3-line stand-in (the real entry file is Flow source Jest can't parse); `parseSets.test.ts` mocks the API layer it never calls. The photo test only failed because my extraction skipped images.
* Phone suite: **63 of 63 suites, 552 tests**; **0 TypeScript errors** (was 8).

## 3. Same workout from the watch and from you: counted once in either order, and old duplicates are cleaned up
Phase 3 handled "your entry first, then the watch". Now also "watch first, then your entry": `lib/hcImport.partitionHc` compares a day's already-imported and new watch sessions with your own entries together (longest first, an imported one wins a tie), and `lib/hcReconcile.js` runs after every route that creates your own exercise entries (Exercise page, Gym log, Workout tab, smart plan, templates, guided sessions). Each watch sync also removes a watch copy that was already duplicated before this update. Deleting your entry lets the next sync bring the session back. Tests: both orders give the same final result; a Gym log session growing past 40 % removes the watch copy; legacy duplicates are cleaned; two deliberate breakages were each caught.

## 4. Smaller
* The exercise catalogue now matches on web and phone ("Reverse Crunch" added to the phone source); `gymSync.js` regenerated (null-safe incline check, no behaviour change).
* `docs/CALCULATIONS.md` and the Phase 3 note updated to say the overlap rule works in both orders.

## Left alone on purpose
* 19 lint errors that were already in `Training.tsx` and `NetworkActivity.tsx` (React-Compiler rules: setState in effects, refs read during render). The screens work; refactoring them is risky and was not asked for.
