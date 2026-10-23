// Admin-only routes: allowed when the signed-in email is listed in the ADMIN_EMAILS environment variable (comma separated).
// With the variable empty or missing, nobody is an admin and these routes answer 403.
const { requireAuth } = require('./auth');

const admins = () => String(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdminEmail = (email) => !!email && admins().includes(String(email).toLowerCase());

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!isAdminEmail(req.user?.email)) return res.status(403).json({ success: false, message: 'Admins only' });
    return next();
  });
}
module.exports = { requireAdmin, isAdminEmail };
