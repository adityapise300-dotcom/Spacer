const ExpressError = require('../utils/ExpressError');

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const isDev = process.env.NODE_ENV !== 'production';
  let status = err.statusCode || 500;
  let message = err.message || 'Something went wrong.';

  if (err.name === 'ValidationError') {
    // Mongoose validation
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join('. ');
  } else if (err.name === 'CastError') {
    // Bad ObjectId in the URL
    status = 404;
    message = 'We could not find what you were looking for.';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    if (field === 'email') message = 'Email already registered. Try logging in instead.';
    else if (field === 'label' || field === 'zone') message = 'A slot with that label already exists in this zone.';
    else message = 'That record already exists.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request could not be read.';
  } else if (!(err instanceof ExpressError)) {
    status = 500;
    console.error(err);
    if (!isDev) message = 'Something went wrong on our side. Please try again.';
  }

  // Safe defaults in case the error happened before the locals middleware ran
  res.locals.currentUser = res.locals.currentUser || null;
  res.locals.success = res.locals.success || [];
  res.locals.error = res.locals.error || [];
  res.locals.currentPath = res.locals.currentPath || req.path;
  res.locals.fmt = res.locals.fmt || require('../utils/helpers');
  res.locals.useCharts = false;

  const accept = req.get('Accept') || '';
  const wantsJson = req.path.endsWith('.json') || (accept.includes('application/json') && !accept.includes('text/html'));
  if (wantsJson) return res.status(status).json({ error: message, status });

  const payload = { status, message, stack: isDev && status >= 500 ? err.stack : null, pageTitle: `Error ${status}` };
  res.status(status).render(status === 404 ? 'errors/404' : 'errors/error', payload);
};
