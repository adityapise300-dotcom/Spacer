const rateLimit = require('express-rate-limit');
const ExpressError = require('../utils/ExpressError');

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new ExpressError(429, 'Too many attempts. Please wait 15 minutes and try again.')),
});
