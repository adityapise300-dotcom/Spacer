const ExpressError = require('../utils/ExpressError');

// validate(schema, "body" | "query" | "params")
// Collects every Joi message, throws a 400, and replaces the input with the cleaned value.
module.exports = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source] || {}, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    const msg = error.details.map((d) => d.message.replace(/"/g, '')).join('. ');
    return next(new ExpressError(400, msg));
  }
  req[source] = value;
  next();
};
