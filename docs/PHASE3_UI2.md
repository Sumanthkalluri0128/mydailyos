# Phase 3, Section J: UI part 2

## 6. Accessibility
- **Palette check:** `node tools/a11y-check.js` tests web and mobile palettes (light and dark): text contrast 4.5:1, white-on-button 4.5:1, status/metric colours 3:1 as graphics,
  and green vs red must differ in lightness for protan/deutan/tritan simulations. The same rules run as tests (`a11y.unit.test.js`, mobile `a11yPalette.test.ts`).
  The check found real problems, now fixed: danger red was too close to success green in lightness (red darker in light mode, green lighter in dark mode),
  white text on the dark-mode purple/red buttons was 3.9:1 and 2.8:1 (new `--primary-solid` / `--danger-solid`, `primarySolid` / `dangerSolid` tokens used behind white text),
  and the light-mode calorie orange was 2.7:1 (now 3.3:1).
- Status is never shown by colour alone: an icon or words always go with it.
- **Large text (web):** Profile > Accessibility, scales the page by 20% (CSS zoom) and enlarges touch targets. On this device only.
  **Mobile has no separate switch:** text follows the phone's font-size setting (nothing caps it); Profile says so.
- Focus: all controls already show a visible focus ring (existing). Screen-reader labels: scan of every icon-only button found one unlabeled control (mobile toast dismiss), fixed. Toasts are announced politely (`aria-live`).
- Honest limit: I could not run a screen reader or the colour-blind simulator on real devices here.

## 7. Body measurements and progress photos
- Waist, hips, chest, arm, thigh trends sit next to weight on the Weight screen (90 days, sparkline, change, one plain sentence when the numbers support it, e.g. waist down while the scale is flat).
  Measurements are the existing Health entries; `GET /api/health-logs/measure-trends`. Hidden weight numbers in Gentle mode.
- Photos: web (new) keep photos only in this browser (IndexedDB); mobile (already) only on the phone. Never uploaded, no cloud AI.
  Before/after side by side with a date slider (web: two range sliders; mobile: date dots with arrows). Deleting uses Undo.
  Photos are **not** in the server export (they never leave the device) and are removed with the account on that device.
  Web: clearing site data also removes them; on a shared computer use Delete.

## 8. Medicines and supplements
- Daily checklist (tick each dose), times 1-6 a day, weekdays, edit and delete (with Undo). "Not marked yet" is used, never "missed".
- Always shows: "This is a reminder tool, not medical advice. Follow what your doctor or pharmacist told you." No dose advice or interaction checks.
- Reminders: mobile schedules local notifications two days ahead; web shows a browser notification only while FlexFit is open (opt-in).
  Quiet hours (mobile: your setting, web: 22:00 to 07:00): a dose inside quiet time rings when quiet time ends; a late-evening dose waits for tomorrow morning.
- Private: separate collections, in the JSON and CSV export (`medicines`, `medLogs`) and deleted with the account.
- On web it lives on the Health page (unlocked after 3 active days or with "Show all features"); on mobile under Profile > Notifications.

## 9. Monthly season recap ("Wrapped")
- `GET /api/wrapped?month=YYYY-MM` returns numbers only. The picture is drawn in the browser (canvas) or on the phone (SVG to PNG) from one shared layout (`wrappedCard.js`). No server image API.
- Shows: best streak, days logged, best week, three favourite foods, partner character (the one with most stickers), characters unlocked and sticker count.
  Health numbers (workout days, average calories, weight change) are drawn only if you switch them on. No name, no weight on the default card.
- Web: Download or Share (system share where supported). Mobile: Share image. Mobile draws the character name and colour; the sticker picture is added on web only.

## 10. Accountability link
- Profile > Share a weekly summary. One private page for ONE person: `https://<server>/s/<secret>`. You pick the fields; each is opt-in; weight and calories are marked as health numbers and off by default.
- Only a hash of the secret is stored, so the address is shown **once** when created. "New link" replaces it, "Turn off" deletes it. No account needed to view; no feed, no leaderboard.
- The page is `noindex`, `no-store`, has no scripts, and a locked-down Content-Security-Policy. It is rate-limited per IP.
- It shows the last 7 days up to today **in UTC**, so near midnight it can be a few hours off your local day.
- The link record is in the export (without the hash) and deleted with the account.

## Honest limits
- Not tried on real devices: notifications, share sheets, camera, the canvas image, a screen reader.
- Mobile large-text switch, sticker picture on the mobile card and web background reminders are not included (reasons above).
