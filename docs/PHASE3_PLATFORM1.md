# Phase 3, Section L: platform, speed and reliability, part 1

Each item says first whether it is possible for free and what it needs.

| # | Item | Free? | Needs a new native build? | Status |
|---|---|---|---|---|
| L.1 | Instant open | Yes | No | Built (web and mobile) |
| L.2 | Biometric app lock (Android) | Yes | Yes, once (new native module) | Built |
| L.3 | Weather-aware water goal | Yes, non-commercial only | No | Built (web and mobile) |
| L.4 | Android widget, Wear OS | Widget: yes. Wear OS: yes but separate app | Yes, both | Data part built; native part is a plan (below) |
| L.5 | Health Connect: sleep, heart rate, workouts | Yes | Yes, once (new manifest permissions) | Built |

## L.1 Instant open

What already existed: the web app paints the last saved dashboard (same day, same person) before the server answers, and the mobile app opens every screen from its saved copy (`peek`) and refreshes in the background. What was missing, and is now added: a small strip with the day's character that says **"Your last saved day · updated 12 min ago"** while the saved copy is on screen (web `InstantOpenStrip`, mobile `InstantOpenStrip`). It disappears when fresh data arrives, and stays (with the age) when you are offline. A saved copy from another day or another person is never shown (`usableCopy`). Pure rules and tests: `utils/freshness.js`.

## L.2 Biometric app lock (mobile)

Off by default. Profile > App lock. Uses `expo-local-authentication`: fingerprint or face, **with the phone's own PIN / pattern as the fallback** (the system prompt offers it). Timeout setting: every time, 30 s, 1 min or 5 min away. Turning it on first asks you to unlock once, so the lock can always be opened. If the phone has no screen lock at all, the app never locks (nobody is trapped out of their own data). The lock screen shows Zoro in a guard pose. Rules and tests: `utils/appLockPure.ts`.
Needs: `expo-local-authentication` added to `package.json` and `app.json` plugins, so **a new build is needed**. Run `npx expo install expo-local-authentication` once to align its exact version with your Expo SDK. It also works in Expo Go for testing.

## L.3 Weather-aware water goal

Rule: from 28 °C daily high the goal rises 200 ml, 300 ml from 30 °C, 400 ml from 32 °C, 500 ml from 35 °C, 600 ml from 38 °C, never more than 20% of the usual goal. The reason is shown on the Water page ("Hot day (34°C expected): your water goal is up by 400 ml.") and the raised number is used on Home and the dashboard. Off by default; you pick a city once (no location permission). Offline or no answer: the goal silently stays as it was. A saved forecast is trusted for 3 hours, and for the rest of the day when offline.
**Open-Meteo terms** (checked on open-meteo.com/en/terms): the free API needs no key but is for **non-commercial use only**; apps with subscriptions or ads, and commercial products, need a paid plan. Free limits: under 10,000 calls a day, 5,000 an hour, 600 a minute. Data is CC BY 4.0, so the credit line "Weather data by Open-Meteo.com" is shown next to the feature. Only the city name and coordinates rounded to 2 decimals are sent. Rules and fixtures tests: `utils/weatherWater.js`.

## L.4 Android widget and Wear OS: honest feasibility

**Built (free, tested):** the widget's data, `utils/widgetSnapshot.ts`: calories left (hidden in gentle mode), water so far and goal, the +250 ml step, the day's character, and a "stale" check so a widget never shows yesterday's numbers.

**Not built, because it needs native code I cannot compile or test here:**
1. *Home-screen widget.* Expo apps cannot make widgets with JavaScript alone. Free route: add `react-native-android-widget` (it ships an Expo config plugin), run `npx expo prebuild`, and build with EAS (the free plan allows a limited number of builds) or locally with Android Studio. It cannot run in Expo Go. Plan: (a) widget layout with a text line for calories left, a water bar, a "+250 ml" button and the character picture (bundled PNG of the day's sticker); (b) a task handler that calls `buildSnapshot()` and, for the button, posts to `/api/water` with a `clientId`; (c) the app writes the latest snapshot to shared storage whenever Home refreshes, so the widget can draw even when the app is closed; (d) the widget refreshes about every 30 minutes (Android's minimum) and on tap.
2. *Wear OS quick log.* A watch app is a separate Android app (Kotlin, Compose for Wear OS) installed on the watch. It cannot be part of this Expo project. Plan: a small Kotlin app with two buttons (water +250 ml, add steps from Health Services) that talks to the phone app through the Wearable Data Layer, or calls the FlexFit API directly with a stored token. Needs Android Studio, a Wear OS emulator or watch, and a one-off Google Play developer account only if you publish it (sideloading is free). Not feasible from this environment, so no half-working code was added.

## L.5 Health Connect: sleep, heart rate, workouts

Profile > More from Health Connect: three separate switches, all off until you choose.

| Switch | Android permissions | What FlexFit does |
|---|---|---|
| Sleep | `READ_SLEEP` | Reads your sleep sessions, counts time actually asleep (awake stages left out, two apps recording the same night counted once), saves one reading per wake-up day. A sleep value you typed yourself is never overwritten. |
| Heart rate | `READ_RESTING_HEART_RATE`, `READ_HEART_RATE` | Saves your resting heart rate each day (lowest reading). With Workouts also on, shows average and peak bpm on each workout. No medical advice. |
| Workouts | `READ_EXERCISE` | Imports workout sessions as activities. Each one shows its source ("from Samsung Health") and, if allowed, heart rate. |

Only the permissions of switches you turn on are requested, each with a plain-words explanation first; Android shows its own dialog. FlexFit only reads. **Duplicate protection:** every session imports once (stable id `hc:<id>`), and the same workout recorded by two apps (overlapping 60% or more of the shorter one) is skipped. Calories for imported workouts are estimated from the activity and your weight (Health Connect sessions do not carry calories), and labelled estimated. Sleep and heart rate sync when the app opens and when it returns to the foreground (at most every 5 minutes).
Needs: the four new permissions are in `app.json`, so **a new native build is required** (a normal JS update is not enough). Rules and tests: server `lib/hcImport.js`, mobile `healthConnectPure.ts`.

## Limits

- The web build, mobile build and database-backed route tests could not be run here (no package registry). Pure rules have tests that pass; screens are syntax-checked only.
- Health Connect exercise type numbers are mapped from Android's documented list; types without a closer match go to "Other workout" and the title is kept in the notes.
- No audio, no tones on mobile; the lock text and weather texts are English only for now.
