// Admin-only routes are protected by an env var: ADMIN_EMAILS="me@example.com,other@example.com" (case-insensitive).
const { HttpError } = require('./http');
const adminEmails = (env = process.env) => String(env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const isAdmin = (user, env = process.env) => !!user?.email && adminEmails(env).includes(String(user.email).toLowerCase());
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return next(new HttpError(403, 'Admin only'));
  next();
}
module.exports = { adminEmails, isAdmin, requireAdmin };
