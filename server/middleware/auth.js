const jwt = require('jsonwebtoken');
const session = require('../lib/session');

/** Who is asking? An Authorization header (phone, scripts) wins; otherwise the httpOnly session cookie (website). */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookies = session.parseCookies(req.headers.cookie);
  const cookieToken = !bearer && session.enabled() ? cookies[session.SESSION] : null;
  const token = bearer || cookieToken;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Server is not configured (missing JWT_SECRET)' });
  }
  // A cookie is sent by the browser on its own, so a write that relies on it must pass the CSRF check.
  if (cookieToken && !session.csrfOk(req, (req.app && req.app.locals && req.app.locals.allowedOrigins) || [])) {
    return res.status(403).json({ success: false, message: 'Request blocked (missing or wrong security token). Reload the page and try again.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    // Sliding session: use the app after a day and the cookie is renewed, so an active person is never signed out, an idle one is after 14 days.
    if (cookieToken && payload.iat && Math.floor(Date.now() / 1000) - payload.iat > session.RENEW_AFTER_S) {
      session.issue(res, jwt.sign({ sub: payload.sub, email: payload.email }, process.env.JWT_SECRET, { expiresIn: '14d' }));
    }
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };
