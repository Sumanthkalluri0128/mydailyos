# Phase 3 / Section C: the app tour (web + mobile + server)

## What it is
1. **Welcome (3 screens)**: what the app gives you, your goal, your coach. Screens for facts we already know (goal from onboarding, coach from the Planning sensei) become a one-line confirmation with "Change", so nobody is asked twice. The path changes with the goal (lose / build / healthy) and with Simple vs Advanced mode (the `mode` field is ready for Section I).
2. **First-win steps (max 5)**: the person does the real thing (log water, search "dal", add weight, plan tomorrow, say hi to the coach). The real action is detected (every successful or queued write goes through one place: `apiFetch` on web, `write()` on mobile), the character cheers with the power-up scene.
3. **Real spotlight**: dimmed overlay with a cut-out measured around the actual element (`getBoundingClientRect` on web, `measureInWindow` on mobile), pulse ring, pointer, tooltip that flips above/below/centre and is clamped inside a 360 x 640 screen. It follows scroll, resize/rotation and the keyboard. A step whose anchor never shows up (3 s) is skipped, never shown broken. On do-steps the dimmer lets go as soon as the person taps the highlighted element (web) or never blocks touches (mobile), so they can finish what the element opens (e.g. the planner's chat).
4. **"Your first week" checklist** on Home (collapsed by default, "3 of 5", resumable, dismissible). Items are computed on the server from the person's own data made since the tour began plus reported actions. Finishing the tour unlocks the **Rookie** sticker and journey step once.
5. **Coachmarks**: 1-3 hints on the first visit to Log, Planner, Progress, Tasks, Profile, "Got it" marks them seen (server + device). A "?" on each of those screens replays them.
6. **Control**: Skip any time (progress is kept), Resume ("Continue tour"), Replay from Profile, "Don't show again" (tour step card and Profile switch). **What's new** dots driven by the `whatsNew` list in the content file (dates + anchor + one line).
7. **One content file**: `tourContent.json` (identical in `client/src/tour/`, `server/data/` and mobile `src/utils/`). Tones: cheer / calm / strict (same three as the Planning sensei). Every line is at most 20 words (tested).
8. **Accessibility**: web dialogs are `role="dialog"`, focus is trapped (including the highlighted element, so the action stays reachable), Esc exits, live region announces each step, 44 px targets, visible focus, reduced-motion respected. Mobile: modal welcome/finish, live regions, `accessibilityRole`s, 44 px targets, Android back = skip (resumable).

## Server
`GET/PATCH/DELETE /api/tour`, `POST /api/tour/event`, `POST /api/tour/complete`. Progress lives in `Profile.tour` (so it is in the account export and deleted with the account). Clients can never set the sticker; lists only grow; unknown ids are dropped.

## Honest notes
- I could not browse the web in this session, so the patterns (Duolingo first win, Notion/Linear checklists, Appcues spotlights, Headspace personalisation, Material feature discovery, driver.js/Shepherd popovers) come from my own knowledge of those products, not from fresh research.
- Web: I built a small **custom** component instead of driver.js: no new dependency, nothing to license-check. Mobile: React Native `Animated`, no paid library.
- Existing accounts do not get the welcome automatically (only brand-new accounts after onboarding); they can start it from Profile. They do see coachmarks and What's-new dots.
- Mobile was type-checked (`tsc --noEmit` clean) and unit-tested with jest (246 pass); it was NOT run on a device, so please check spotlight alignment on your phone (especially Android with a translucent status bar). The web build (`vite build`) succeeds; I did not run it in a browser.
- Not done: automatic Rookie journey-step display inside the Goals page (the server returns `rookie` in `/api/tour`; the sticker shows on the finish screen and the checklist). Say if you want it added to the badge shelf.

## Tests
Server `test/tour.unit.test.js` (11): copy limits, paths, goal reuse, copy parity, patch rules, events, checklist, reward-once, what's new.
Web `client/src/tour/engine.test.js` and mobile `src/utils/__tests__/tourEngine.test.ts` (16 each, same cases): next/back/skip/resume, missing-anchor fallback, goal paths, tooltip fit on 360 x 640, coachmark once, request-to-action.
