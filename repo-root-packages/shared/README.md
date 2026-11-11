# @mydailyos/shared

The ONE place for code the website and the phone both use. Edit files here, then from the repo root run:

    node tools/syncShared.mjs            copies them into web/ and mobile/ (the apps stay self-contained)
    node tools/syncShared.mjs --check    exits 1 if any copy was edited by hand or is out of date (CI runs this)

| File here | Web copy | Phone copy |
|---|---|---|
| `src/exerciseFigure.js` | `web/client/src/utils/exerciseFigure.js` | `mobile/.../src/utils/exerciseFigure.ts` (with `// @ts-nocheck`) |
| `src/training.js` | `.../utils/training.js` | `.../utils/training.js` |
| `src/coneGeometry.js` | `.../utils/coneGeometry.js` | `.../utils/coneGeometry.ts` (with `// @ts-nocheck`) |
| `src/i18n/{en,hi,ta,te}.json` | `.../i18n/*.json` | `.../i18n/*.json` |

`data/exerciseImages` is generated from the web file by `node tools/syncExerciseImages.mjs` (in the phone folder) and checked by `tools/checkSharedFiles.mjs`.

## Why copies, not an import
A real workspace import needs Metro (phone) and Vite (web) to both be taught to look outside their own folder, and a mistake there breaks a build I cannot test from here. Copies generated from one source, plus a check that fails on any difference, give the same guarantee (nothing drifts) with no build risk. Moving to a true workspace later only means deleting the copy step.

## React 18 (web) vs 19 (phone)
Decision: leave them different. Expo SDK 57 / React Native 0.86 requires React 19; the website stays on 18.3.1 until all of its libraries support 19. This is safe because shared code is **framework-free**: the sync tool refuses to copy a shared file that imports `react` or `react-native`. If you want the web on 19, do it as its own change (upgrade, run the web tests, check charts and animations).
