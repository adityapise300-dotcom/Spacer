const User = require('../../models/User');
const ExpressError = require('../../utils/ExpressError');

// Runs BEFORE validation: drops empty vehicle rows from the form
exports.cleanVehicles = (req, res, next) => {
  if (req.body.user && req.body.user.vehicles) {
    req.body.user.vehicles = Object.values(req.body.user.vehicles)
      .filter((v) => v && String(v.plateNumber || '').trim());
  }
  next();
};

exports.show = async (req, res) => {
  const user = await User.findById(req.session.user.id).lean();
  res.render('user/profile', { pageTitle: 'Profile', profile: user });
};

exports.update = async (req, res) => {
  const { name, phone, vehicles } = req.body.user;
  const user = await User.findByIdAndUpdate(req.session.user.id, { name, phone, vehicles }, { new: true, runValidators: true });
  if (!user) throw new ExpressError(404, 'Account not found');
  req.session.user.name = user.name;
  req.flash('success', 'Profile updated.');
  res.redirect('/user/profile');
};
