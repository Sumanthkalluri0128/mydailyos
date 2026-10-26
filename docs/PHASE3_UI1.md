# Phase 3, Section I: UI part 1

## 1. Simple and advanced mode
- New users see a short core set: Home, Log food, Progress, Tasks, Profile, plus Water, Weight, Exercise, Meal planner and My foods.
- More screens unlock from simple usage (server rules in `server/lib/features.js`, fixture-tested):
  Recipes (5 meals logged or a day planned), Health (3 active days), Goals (2 weigh-ins or 5 active days), Habits (7 days),
  Achievements (5 days), Weekly summary (7 days), My plan / North Star (14 days).
- A small sensei (Kakashi) explains this once and announces each unlock ("New: Recipes is now unlocked").
- **Profile > Show all features** shows everything at once. Nothing is deleted and every screen still opens from a link.
  The locked list in Profile says how each one unlocks. The setting follows the account (`CoachState.showAll`) and is in the data export.
- If the app cannot reach the server for the first time, everything stays visible (never hide features because of a network problem).
- The existing tour only visits core screens (home, log, weight, planner), so it is unaffected.

## 2. Adaptive Home
Same hero card, no new cards. `server/lib/nextStep.js` picks ONE step from the hour and what is logged:
breakfast prompt (morning), water first thing, lunch, water or steps in the afternoon, dinner, "Fix my day" in the evening when over budget,
weigh-in on the weigh-in day, wind-down and plan tomorrow. Copy is calm and never shaming (tested against the tone check).
When the server cannot answer, Home keeps the earlier coach line.

## 3. Undo instead of confirm
- Web: `utils/undo.js` (`undoGate`) hides the item at once, shows a 5-second Undo toast with the sensei, and only then calls the server.
  If you close or hide the tab inside the window, the delete is sent right away.
- Mobile: the existing `undoableDelete` now covers every single-item delete (food entries, saved meals, foods, recipes, templates, workouts).
- Real confirmation stays for irreversible, bulk or account-level actions: clear a day, clear the week, copy last week, reset what the coach learned,
  start a maintenance break, repeating-task series choice, log out and delete account.

## 4. Languages (Hindi, Telugu, Tamil)
- Files: `client/src/i18n/{en,hi,te,ta}.json` (copied to `mobile/src/i18n`). English is the source; any missing or empty string falls back to English, then to the key.
- **I wrote the Hindi, Telugu and Tamil strings myself (no machine translation service). They are first drafts and are flagged `needsReview: true`.**
  Profile says so under the language chips.
- Fixing wording without code: `node tools/i18n.js export hi` -> edit the `translation` column in Excel/Sheets -> `node tools/i18n.js import hi.csv`
  (placeholders such as `{name}` must stay; mismatches are skipped and reported). `node tools/i18n.js check` lists gaps. `reviewed hi` clears the flag.
  After editing on web, copy the four JSON files to `mobile/src/i18n`.
- Translated today: navigation and tabs, Profile language/mode section, undo messages, Home next-step titles and lines, quick-add palette, shortcuts list,
  meal reminders on mobile (breakfast/lunch/dinner), and the sensei lines.
- Not translated yet (stays English): most page bodies, server-written tips, weekly review text, tone-based coach lines and the other notifications.

## 5. Web power features
- **Ctrl/Cmd+K** quick add: `water 250`, `w 2 glasses`, `weight 70.5`, `workout 30 yoga`, `food rice`, `go progress`. Arrow keys and Enter; each row has a character icon.
  Unclear text is never guessed; it shows nothing to run.
- **?** shows shortcuts. `g` then `h / f / p / r` jumps to Home / Food / Plan / Progress. Esc closes.
- Wide screens (1500px and up) get more room, tablets get a two-column Home; phones are unchanged.

## Honest limits
- Mobile has no keyboard palette (phones); it gets items 1-4.
- Language choice affects labels and the listed strings only; the server still writes some tips in English.
- Unlock rules are simple counts. They are tuned guesses; adjust `UNLOCKS` in `features.js`.
