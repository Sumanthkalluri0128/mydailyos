// Tiny HTTP helpers shared by all routes.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wraps an async route so thrown errors become JSON responses (Express 4 doesn't do this). */
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err && err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err && err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate entry' });
    }
    return next(err);
  });

module.exports = { HttpError, wrap };
