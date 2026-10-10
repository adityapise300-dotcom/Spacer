const ExpressError = require('../utils/ExpressError');

module.exports = (req, res, next) => next(new ExpressError(404, 'Page not found'));
