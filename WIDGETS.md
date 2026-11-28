# Home-screen widget (Android) - weekly anime artwork

**Status: built (themed).** `src/widgets/` draws the live numbers on top of one anime artwork per week.
Shows: date, streak, calories (left / over), protein, steps, water (7 drops), and four mission ticks
(protein, steps, calories in budget, water). Tap the **water drops** to add 250 ml; tap anywhere else to open the app.

## Weekly artwork
`assets/widget/bg-<who>.jpg` (1000x500, 2:1). There are 7 themes: naruto, luffy, goku, tanjiro, gojo, asta, jinwoo.
Every **Monday** the widget picks one of them at random, and it keeps that artwork until the next Monday.
A theme is **never repeated until all 7 have been shown**; then a new round starts (and never begins with the theme that just ended).
The pick is saved on the phone (`ff.widgetTheme`: week, current theme, themes already used), so every redraw in a week shows the same art.
Logic: `src/utils/widgetTheme.ts` (pure, tested in `__tests__/widgetTheme.test.ts`); storage: `src/widgets/widgetTheme.ts`.
The new theme appears on the first widget refresh of the week (Android refreshes every 30 min, and the app refreshes it whenever you open Home).

The artwork already contains the cards, icons and EMPTY slots. The code only draws numbers into them, using the boxes in
`src/widgets/widgetZones.ts` (pixels of the original 1774x887 art, scaled to the widget size; the art is centred, never stretched).

### Adding or replacing a day's artwork
1. Make the image 2:1 with the same card layout and empty value boxes (no text on it). Save as `assets/widget/bg-<who>.jpg`, 1000x500, under ~200 KB.
2. Add `<who>: require('../../assets/widget/bg-<who>.jpg')` in `src/widgets/widgetBackgrounds.ts`.
3. Add a zones entry in `src/widgets/widgetZones.ts`. If the cards sit in the same place as `asta` copy that entry; otherwise measure the boxes.
4. `npx jest src/widgets` checks that every zone is inside the art.

## How the numbers get there
* `widgetData.ts` reads the saved login token (SecureStore) and calls the existing `GET /api/progress/day`, plus
  `GET /api/health-logs/steps/day` and `GET /api/progress/streaks` (in parallel; if one fails that number shows a dash).
* The Home screen calls `syncWidget()` whenever its numbers change (calories, water, protein, steps, streak), so the widget updates
  immediately; otherwise Android refreshes it every 30 min. The last good snapshot is cached so it works offline.
* Gentle mode / "hide numbers": no calorie number and no calorie mission is shown. kJ / fl oz settings are respected.
* States: normal, *Sign in to FlexFit*, *Can't reach FlexFit*.

## Layout rule
Each live element sits in its own full-size layer of an `OverlapWidget` and is moved into place with `marginLeft` / `marginTop`
(see `put()` in `FlexFitWidget.tsx`). Only the water drops are tappable; the rest of the widget opens the app.

## After changing widget code or artwork
Needs a new build (the artwork ships inside the app). Then **remove and re-add the widget once**, because the widget's size options changed
(it is now resizable, 4x2 by default). iOS (WidgetKit) and Wear OS are not built.
