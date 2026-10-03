# FlexFit server v2.5 — what to set up

## 1. Fix the `mail error connect ENETUNREACH ...:465` log line
Render's free tier blocks outbound SMTP (ports 25/465/587) and has no IPv6, so Gmail-over-SMTP can never work there.
The mailer now sends over HTTPS. Easiest, no domain needed:
1. brevo.com -> free account -> SMTP & API -> create an API key.
2. Brevo -> Senders -> add and verify the address mail should come from (your Gmail works).
3. Render -> your service -> Environment:
   - `BREVO_API_KEY` = the key
   - `MAIL_FROM` = `FlexFit <your-verified-address@gmail.com>`
4. Redeploy. Forgot-password now returns instantly and the email goes out in the background.
(`RESEND_API_KEY` also works if you own a domain. `SMTP_URL` still works on paid hosts, now forced to IPv4 with timeouts.)

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
