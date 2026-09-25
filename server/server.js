require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const profileRoutes = require('./routes/profileRoutes');
const foodRoutes = require('./routes/foodRoutes');
const foodLogRoutes = require('./routes/foodLogRoutes');
const activityRoutes = require('./routes/activityRoutes');
const taskRoutes = require('./routes/taskRoutes');
const habitRoutes = require('./routes/habitRoutes');
const waterRoutes = require('./routes/waterRoutes');
const weightRoutes = require('./routes/weightRoutes');
const progressRoutes = require('./routes/progressRoutes');
const stepRoutes = require('./routes/stepRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 5001;

const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    service: 'MyDailyOS API',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (req, res) => {
  res.status(200).json({
    success: true,
    version: '2.4.0-samsung-health-steps',
    service: 'MyDailyOS API',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/food-logs', foodLogRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/water', waterRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/steps', stepRoutes);
// Backward-compatible history namespace for older web/mobile builds.
app.use('/api/history', progressRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'MyDailyOS API is running 🚀' });
});

// Always return JSON for unknown API routes. This prevents the frontend from
// receiving an HTML 404 page and then failing with "Unexpected token '<'".
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found',
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MyDailyOS server running on port ${PORT}`);
      console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  });
