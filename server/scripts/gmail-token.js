#!/usr/bin/env node
// One-time helper: get a refresh token so the server can send password-reset emails FROM YOUR OWN GMAIL
// (Gmail API over HTTPS — works on Render's free tier, no domain needed).
//
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/gmail-token.js
//
// Before running: in Google Cloud -> Credentials -> your OAuth client -> add this Authorized redirect URI:
//   http://localhost:53682/oauth2callback
// and enable the "Gmail API" for the project. Copy the printed GMAIL_REFRESH_TOKEN into Render's environment.
const http = require('http');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'); process.exit(1); }

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}/oauth2callback`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
  scope: 'https://www.googleapis.com/auth/gmail.send', access_type: 'offline', prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirectUri);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404); return res.end(); }
  const code = u.searchParams.get('code');
  if (!code) { res.end('No code received. You can close this tab.'); return finish(1, 'Google did not return a code: ' + (u.searchParams.get('error') || 'unknown')); }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
    });
    const body = await r.json();
    if (!body.refresh_token) throw new Error(body.error_description || body.error || 'No refresh token returned (revoke FlexFit at myaccount.google.com/permissions and retry)');
    res.end('Done! You can close this tab and go back to the terminal.');
    console.log('\nAdd this to Render -> Environment:\n\nGMAIL_REFRESH_TOKEN=' + body.refresh_token + '\n');
    finish(0);
  } catch (e) { res.end('Failed: ' + e.message); finish(1, e.message); }
});
function finish(code, msg) { if (msg) console.error(msg); server.close(() => process.exit(code)); setTimeout(() => process.exit(code), 500); }
server.listen(PORT, () => console.log('Open this URL in your browser and approve with the Gmail account that should SEND the emails:\n\n' + url + '\n'));
