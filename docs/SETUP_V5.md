# FlexFit server v2.7 — deployment guide

## 0. FIRST: check what is actually deployed
Run this from the `server/` folder on your computer (it only reads, it never sends email):

    node scripts/check-deploy.js https://mydailyos.onrender.com https://mydailyos.vercel.app

It prints PASS/FAIL for each item below and tells you the exact fix for every FAIL. Quick manual version: open
`https://mydailyos.onrender.com/api/health` — it must show `"version":"2.7.0"` (or newer), `"mail":"gmail"` and `"google":"configured"`.
**If there is no `version` field, Render is still running an OLD build** (that is what your phone screenshot showed:
the raw "Google is not set up…" JSON comes from the old code). Deploy the new code first.

### Deployment checklist
| # | Where | Check | If it is wrong |
|---|-------|-------|----------------|
| 1 | GitHub | The new server code is pushed to the branch Render deploys | Copy the zip contents into the repo, commit, push |
| 2 | Render -> Deploys | Latest deploy says "Live" and is the newest commit | Manual Deploy -> "Deploy latest commit"; read Logs if it failed |
| 3 | Render -> Environment | `MONGO_URI`, `JWT_SECRET` (32+ random chars), `CLIENT_URL` = your Vercel URL (no trailing slash; several allowed, comma-separated) | Add/fix, then redeploy |
| 4 | Render -> Environment | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | See section 2 |
| 5 | Render -> Environment | `GMAIL_REFRESH_TOKEN` | See section 1 |
| 6 | Render -> Logs (after start) | Lines `Mail: sending via gmail` and `Google: sign-in enabled` | They tell you which variable is missing |
| 7 | Google Cloud | Redirect URI is exactly `https://mydailyos.onrender.com/api/google/callback` | The checker prints the exact value the server uses |
| 8 | Google Cloud | Consent screen is **"In production"** (Audience -> Publish app) | Otherwise only hand-added Test users can sign in; everyone else sees "Access blocked … Error 403: access_denied" |
| 9 | Vercel | Website redeployed after the new code | Redeploy; the checker confirms it points at your API |

Free-tier tip: Render sleeps after ~15 min idle and takes ~50 s to wake — that is the main reason everything feels slow.
Create a free monitor at uptimerobot.com that opens `https://mydailyos.onrender.com/api/health` every 5 minutes and it stays awake.

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
- Keep the OAuth consent screen "In production" (Publish app). In "Testing" Google expires the Gmail token after 7 days — the classic symptom is: the first reset emails arrive, then later ones fail with "We could not send the email right now".
- To see the exact reason without reading logs, run `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... node scripts/check-mail.js` (add an email address as an argument to also send a test message). `invalid_grant` = token expired/revoked: publish the app, run `scripts/gmail-token.js` again and replace `GMAIL_REFRESH_TOKEN` on Render.
- If you also set `BREVO_API_KEY` (or Resend/SMTP), the server now falls back to it automatically when Gmail fails, so one expired credential no longer blocks resets.
- Fallbacks: `BREVO_API_KEY` (note: Brevo cannot authenticate a gmail.com sender, so it substitutes its own address and mail may land in spam; best with your own domain), `RESEND_API_KEY`, or `SMTP_URL` on paid hosts.
- If email is not configured the app now says so instead of claiming a code was sent, and a failing provider shows "We could not send the email" on the reset screen.

## 2. "Continue with Google" sign-in
FlexFit only uses Google to **sign people in** (scopes `openid email profile`). It does not read or write Drive, Sheets or anything else, and it stores nothing from Google except the account id.
1. console.cloud.google.com -> your project -> Google Auth Platform (OAuth consent screen) -> External.
2. **Audience -> Publish app** (status must read "In production"). These sign-in scopes need no Google review/verification, so after publishing *any* Google account can sign in.
   - While the app is in **Testing**, only the Test users you list can sign in; everyone else gets **"Access blocked: … has not completed the Google verification process — Error 403: access_denied"**. That is a Google Cloud setting, not an app bug.
3. Credentials -> Create OAuth client ID -> **Web application** -> Authorized redirect URI: `https://mydailyos.onrender.com/api/google/callback`
4. Render env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redeploy.
5. You can remove the Google Sheets API / Drive scope from the project — they are no longer used.

## Mobile app
Rebuild the app (new native pieces: expo-intent-launcher, expo-web-browser, SCHEDULE_EXACT_ALARM permission):
`eas build -p android --profile preview`
