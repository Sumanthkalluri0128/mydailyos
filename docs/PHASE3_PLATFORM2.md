# Phase 3, Section M: platform part 2

Items 6 to 10 (items 1 to 5 are in `PHASE3_PLATFORM1.md`). Everything here is free and rule-based.

## 6. Weekly backup email
- Opt-in, off by default: Profile → Reports & emails on the web, Profile → "Weekly data backup email" on the phone.
- Sent once a week (Sunday, UTC) with the data export attached: the complete JSON and a CSV for spreadsheets. If the files together pass 12 MB the email goes out without them and says to use Profile → Download my data.
- Uses the existing mailer (Gmail API, Brevo, Resend or SMTP). Attachments now work on all four providers.
- Every email has its own one-tap stop link (and the `List-Unsubscribe` headers). It is separate from the weekly summary link: stopping one never stops the other.
- The email says plainly that the file holds health and food data. Only the person's own data is attached, and it goes only to their own address.
- Server: `lib/backupMail.js` (pure), `lib/backupEmail.js` (database run), `scripts/sendBackups.js` (`npm run send-backups`, for hosts that sleep). Scheduler: `BACKUP_EMAIL_SCHEDULER=false` turns the built-in hourly check off.
- Honest limit: on the free host a sleeping server cannot send; keep-alive (item 7 shows if it works) or the cron script covers that.

## 7. Server health page (admins only)
- Open the web app and add `#admin` to the address. The server only answers people whose email is in `ADMIN_EMAILS`; everyone else sees "Admins only".
- Shows: last cold start (listening and database times), waits reported by the apps (typical, slowest 1 in 20, worst), keep-alive status by source (the server's own ping, the GitHub workflow, anything else), counts per day of server errors, failed syncs and dropped offline writes, and the latest server errors (path and message only).
- "Dropped offline write" means the server refused a queued change for good (for example a bad value), so it was removed from the waiting list.
- Numbers are aggregate only: no user ids, emails or request bodies. They are saved every 5 minutes (one document, `ServerStat`) so a restart does not erase them.
- The apps report through `POST /api/telemetry` (no login, 20 reports a minute per address, values clamped).
- Plain on purpose: no character on this page.

## 8. Feature flags
- Admin page → Feature flags: key, on/off, percent of people, allow list, deny list (emails or ids).
- Rules (`lib/flags.js`): master switch off wins; deny wins over everything; allow list is always on; percent 100 = everyone; otherwise a stable per-person bucket (0 to 99) decides, so raising the percentage only adds people.
- `GET /api/flags` returns `{key: true/false}` for the signed-in person. Web (`utils/flagStore.js`, `useFlag("key")`) and mobile (`utils/flagStore.ts`, `useFlag('key')`) keep the answer for 6 hours (per signed-in person) and work offline from the saved copy. Unknown flags are off.
- Nothing uses a flag yet; it is there for the next feature that needs a trial.

## 9. Web tests
- `cd client && npm test` runs 101 tests with Node's built-in runner (no new test library): offline queue and saved copies (`offline/offlineApi.test.js`: queueing, order, 5xx/401/429 keep, refusal drops one, other people's data, one-week limit), food logger totals (offline food counted once), water target, weight trend, auth gate decisions (`auth/gateLogic.js`, moved out of `AuthGate.jsx`), flags and telemetry.
- `npm run e2e` is a Playwright smoke test (`e2e/smoke.mjs`, free): sign-in page for visitors, app for signed-in people, assistant opens when asked straight away, water entry sent with a client id, offline entry kept and shown in the strip, sent exactly once when back online. The API is faked, so it needs no server. Run `npm run build` first, then `npm run e2e`; once per machine `npx playwright install chromium`.
- Honest limit: this build environment cannot install Vite, so the smoke test was run against an esbuild build of the same source (3 runs, all passed). Run it once on your side with the real `vite build`.
- Mobile: `utils/__tests__/flags.test.ts` and an extra widget test.

## 10. Performance
Measured with esbuild (React 19, minified) as a stand-in for `vite build`; compare numbers only with each other.

| | before (v48) | after |
|---|---|---|
| First-load JavaScript (`main.js`) | 264,967 B (81,516 gzip) | 248,669 B (76,688 gzip) |
| First-load CSS | 187,820 B (37,001 gzip) | 187,820 B (unchanged) |

- Pages were already split. New: the sign-in pages (signed-in visits never fetch them), the first-run setup page, the Ask FlexFit panel and the quick-add palette now load after the first screen (or the instant they are asked for; the request is replayed, so the first tap or Ctrl+K is not lost).
- The first-load script fell 6.2% even though this section adds the flags, telemetry and admin code (the admin page is its own chunk). React itself is 176 KB of what is left.
- The CSS is still one file. Splitting it needs each page to import its own style sheet, which is a bigger change; not done.
- Mobile lists: there is no `FlatList` in the app. The long lists are already capped (search results 40, history 3 days at a time, health logs 60), and the screens scroll as a whole, where a `FlatList` would not virtualize. The one unbounded list, past fasts, now shows 5 with "Show more".

## Anime touch
- The Android widget header shows the day's character (`TODAY · ZORO`); drawing the picture itself in a native widget needs bundled images and a development build.
- The lock screen already uses the guard pose; the admin page and flags stay plain.

## Tests added
Server: backup mail build (attachments, CSV wording, too-big case, tone, escaping), due-for-backup, MIME message with attachments, stats (counters, clamps, cold starts, keep-alive status, save and restore), flag evaluation and editing. Not run here: the unsubscribe-purpose test (needs `jsonwebtoken`, skipped without it) and the album route test (needs `express`).
