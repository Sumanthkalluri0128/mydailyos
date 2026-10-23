# Phase 3 / Section E: faster food logging, part 1
| Item | Where |
|---|---|
| E1 Copy / repeat, multi-select | `GET /api/food-logs/repeat` (preview, nothing saved), `POST /copy` now takes `ids` + `edits`, `POST /bulk`; `lib/repeatMeal.js`; web `RepeatPreview.jsx`, "Select several" in `FoodLogger.jsx`; mobile `RepeatPreview.tsx`, `app/food.tsx` |
| E2 Voice logging | speech-to-text runs on the device; `lib/voiceText.js` tidies the text (English, Hindi, Telugu, Tamil number words, filler, "for lunch"); `POST /api/foods/parse` with `spoken:true` returns `heardText` + `meal`; always an editable review. Web `VoiceMic.jsx` + `utils/speech.js` (hidden where unsupported). Mobile `utils/speech.ts` + `VoiceMic.tsx` |
| E3 Shared pot | `lib/sharedPot.js`; `POST /api/recipes/:id/cook` {servings,totalG}, `POST /:id/eat` {portions or grams}; `Recipe.potServingG` |
| E4 Paste ingredients | `lib/ingredientParse.js`; `POST /api/recipes/parse-ingredients`; uses `lib/oil.js` for the added-oil line |
| E5 Portion guides | `portionGuides.js` (identical on web and mobile) drawn with SVG; `PortionGuide.jsx/.tsx` |
| E6 Chai counter | `lib/chaiCounter.js`; `POST /api/food-logs/chai`, `GET /chai/preview`, `GET /chai/weekly`; `FoodLog.chai` |
Stickers: first spoken meal ("Mic Check") and first shared-pot meal ("Pot Boss") are announced when the server sees the first `source: voice|pot` log.

## Honest limits
* **Voice on mobile needs a development build** and the package `expo-speech-recognition` (3.x). Install it with `npx expo install expo-speech-recognition`, add its config plugin and microphone / speech permissions in `app.json` as its README says, then build a new dev client. It was NOT added to `package.json` here because the lockfile cannot be regenerated offline. Whether the 3.x line supports Expo SDK 57 could not be verified here: check its README before building. The app asks for ON-DEVICE recognition only; a phone without an offline model for the chosen language shows a message instead of sending audio anywhere. Hindi / Telugu / Tamil depend on the phone having those offline models.
* **Voice on web** uses the browser's SpeechRecognition. Chrome processes speech on Google's servers; the app cannot change that. Browsers without it show no mic.
* Spoken food names in Devanagari / Telugu / Tamil script are mapped for ~30 very common foods only; anything else appears under "couldn't find".
* **Cup and spoon weights** for staples (rice 190 g, dal 200 g per cup, and similar) are typical values and are labelled as such. For anything not in the table the weight is left empty for you to enter.
* **Raw to cooked factors:** white rice about x2.8, brown rice x3.0, dal x3.0 (range 2.5 to 4.5). For the catalogue's cooked rice and dal the factor is worked out so the pot keeps the calories of the raw ingredient (typical raw values 360 / 340 kcal per 100 g; check against IFCT). You can edit every amount.
* **Chai:** a cup is 50 % milk by default (this matches the catalogue's "Chai (no sugar)" = 50 kcal per 150 ml). Calories use the catalogue's milk and sugar values; if either food is missing the counter refuses rather than guess.
* The chai counter does not send reminders, so quiet hours and the daily reminder cap are untouched.
* Sticker unlocks are shown as a message when they happen; there is no sticker shelf yet.
