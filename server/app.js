// Builds the Express app. Kept separate from server.js (which connects to MongoDB and listens)
// so the app can be imported by tests without a database.
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const pkg = require('./package.json');
const { securityHeaders } = require('./middleware/security');
const { rateLimit } = require('./middleware/rateLimit');
const { captureError } = require('./lib/monitoring');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const profileRoutes = require('./routes/profileRoutes');
const foodRoutes = require('./routes/foodRoutes');
const foodLogRoutes = require('./routes/foodLogRoutes');
const activityRoutes = require('./routes/activityRoutes');
const templateRoutes = require('./routes/templateRoutes');
const taskRoutes = require('./routes/taskRoutes');
const habitRoutes = require('./routes/habitRoutes');
const waterRoutes = require('./routes/waterRoutes');
const weightRoutes = require('./routes/weightRoutes');
const progressRoutes = require('./routes/progressRoutes');

function createApp({ allowedOrigins = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render terminates TLS in front of the app; needed for correct client IPs

  app.use(securityHeaders);
  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header = native mobile app / curl / server-to-server: always allowed.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      exposedHeaders: ['Content-Disposition', 'RateLimit-Remaining', 'Retry-After'],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) =>
    res.status(200).json({ success: true, status: 'healthy', service: 'FlexFit API', timestamp: new Date().toISOString() })
  );
  app.get('/api/version', (req, res) => res.status(200).json({ success: true, version: pkg.version, service: 'FlexFit API' }));

  // Generous global ceiling per IP; auth and export routes have their own, tighter limits.
  app.use('/api', rateLimit({ windowMs: 60_000, max: 400 }));

  app.use('/api/auth', authRoutes);
  app.use('/api/account', accountRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/foods', foodRoutes);
  app.use('/api/food-logs', foodLogRoutes);
  app.use('/api/activities', activityRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/habits', habitRoutes);
  app.use('/api/water', waterRoutes);
  app.use('/api/weight', weightRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/history', progressRoutes); // backward-compatible alias for older builds

  app.get('/', (req, res) => res.json({ message: 'FlexFit API is running 🚀' }));

  // Always JSON for unknown API routes (prevents "Unexpected token '<'" in the clients).
  app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'API route not found', path: req.originalUrl }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Request body is not valid JSON' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request body is too large' });
    if (err && /^CORS blocked/.test(err.message || '')) return res.status(403).json({ success: false, message: 'Origin not allowed' });
    console.error('Server error:', err);
    captureError(err, { path: req.originalUrl, method: req.method });
    if (res.headersSent) return next(err);
    // Never leak internals in production.
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
    res.status(500).json({ success: false, message });
  });

  return app;
}

module.exports = { createApp };
