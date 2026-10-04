# FlexFit server v2.5 — what to set up

## 1. Password-reset email (fixes "code sent" but nothing arrives)
Render's free tier blocks outbound SMTP, so email must go over HTTPS. Best free option with no domain: **send through your own Gmail using the Gmail API** — mail genuinely comes from your gmail.com address, so it is not spam-filtered.

Do section 2 first (you need the Google Cloud project and OAuth client), then:
1. Google Cloud -> APIs & Services -> enable **Gmail API**.
2. Credentials -> your OAuth client -> add Authorized redirect URI `http://localhost:53682/oauth2callback`.
3. On your computer, in `server/`:
   `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/gmail-token.js`
   Open the printed link, approve with the Gmail that should send the mail, copy the printed `GMAIL_REFRESH_TOKEN=...`.
4. Render -> Environment: add `GMAIL_REFRESH_TOKEN`. Redeploy.
5. Check `https://<your-api>.onrender.com/api/health` shows `"mail":"gmail"`. The Render log also prints `Mail: sending via gmail` at startup.

Notes
- Keep the OAuth consent screen "In production" (Publish app). In "Testing" Google expires the token every 7 days.
- Fallbacks: `BREVO_API_KEY` (note: Brevo cannot authenticate a gmail.com sender, so it substitutes its own address and mail may land in spam; best with your own domain), `RESEND_API_KEY`, or `SMTP_URL` on paid hosts.
- If email is not configured the app now says so instead of claiming a code was sent, and a failing provider shows "We could not send the email" on the reset screen.

## 2. Google sign-in + "FlexFit data" Google Sheet
1. console.cloud.google.com -> new project -> APIs & Services -> enable **Google Sheets API**.
2. OAuth consent screen -> External -> add your own Gmail as a **Test user**.
3. Credentials -> Create OAuth client ID -> **Web application** ->
   Authorized redirect URI: `https://mydailyos.onrender.com/api/google/callback`
4. Render env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redeploy.
5. App: Profile -> Google Sheets backup -> Connect Google.

Scope is `drive.file` only: FlexFit can see just the one sheet it creates, never the rest of your Drive.
While the consent screen is in "Testing", Google expires the token after 7 days; press "Publish app" (no review needed for this scope) to make it permanent.

## Mobile app
Rebuild the app (new native pieces: expo-intent-launcher, expo-web-browser, SCHEDULE_EXACT_ALARM permission):
`eas build -p android --profile preview`
