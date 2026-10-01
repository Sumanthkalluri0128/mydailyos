const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Server is not configured (missing JWT_SECRET)' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };
