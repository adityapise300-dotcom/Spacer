const ExpressError = require('../utils/ExpressError');
const ParkingZone = require('../models/ParkingZone');
const Booking = require('../models/Booking');
const { expireStaleHolds } = require('../services/availabilityService');

const loginUrlFor = (req) => (req.originalUrl.startsWith('/owner') ? '/owner/login' : '/user/login');

exports.isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl; // come back here after login
    req.flash('error', 'Please log in to continue.');
    return res.redirect(loginUrlFor(req));
  }
  next();
};

// Role isolation: wrong role gets a real 403, not a silent redirect
exports.requireRole = (role) => (req, res, next) => {
  if (!req.session.user || req.session.user.role !== role) {
    return next(new ExpressError(403, `This page is only available to ${role === 'owner' ? 'parking owners' : 'drivers'}.`));
  }
  next();
};

exports.redirectIfLoggedIn = (req, res, next) => {
  if (req.session.user) return res.redirect(`/${req.session.user.role}/dashboard`);
  next();
};

// Loads the zone from :id or :zoneId and checks it belongs to the logged-in owner
exports.isZoneOwner = async (req, res, next) => {
  try {
    const zone = await ParkingZone.findById(req.params.id || req.params.zoneId);
    if (!zone) throw new ExpressError(404, 'Zone not found');
    if (String(zone.owner) !== req.session.user.id) throw new ExpressError(403, 'You do not own this zone.');
    req.zone = zone;
    next();
  } catch (e) {
    next(e);
  }
};

// Loads a booking from :id and checks it belongs to the logged-in driver
exports.isBookingOwner = async (req, res, next) => {
  try {
    await expireStaleHolds({ _id: req.params.id });
    const booking = await Booking.findById(req.params.id).populate('zone');
    if (!booking) throw new ExpressError(404, 'Booking not found');
    if (String(booking.user) !== req.session.user.id) throw new ExpressError(403, 'This booking belongs to another account.');
    req.booking = booking;
    next();
  } catch (e) {
    next(e);
  }
};

exports.driverOnly = [exports.isLoggedIn, exports.requireRole('user')];
exports.ownerOnly = [exports.isLoggedIn, exports.requireRole('owner')];
