const helpers = require('../utils/helpers');

module.exports = (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentPath = req.originalUrl.split('?')[0];
  res.locals.fmt = helpers;
  res.locals.useCharts = false;
  next();
};
