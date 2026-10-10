const ParkingZone = require('../../models/ParkingZone');
const Booking = require('../../models/Booking');
const ExpressError = require('../../utils/ExpressError');
const availability = require('../../services/availabilityService');
const { parseLocalDate } = require('../../utils/helpers');

exports.list = async (req, res) => {
  const zones = await ParkingZone.find({ owner: req.session.user.id }).select('name').lean();
  const zoneIds = zones.map((z) => z._id);
  await availability.expireStaleHolds({ zone: { $in: zoneIds } });

  const { zone, status, from, to } = req.query;
  const filter = { zone: { $in: zoneIds } };
  // A zone id from the query is only honoured if it is one of MY zones
  if (zone && zoneIds.some((id) => String(id) === zone)) filter.zone = zone;
  if (status) filter.status = status;
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);
  if (fromDate || toDate) {
    filter.startTime = {};
    if (fromDate) filter.startTime.$gte = fromDate;
    if (toDate) filter.startTime.$lt = new Date(+toDate + 24 * 36e5);
  }

  const bookings = await Booking.find(filter).populate('zone', 'name').populate('user', 'name phone')
    .sort({ startTime: -1 }).limit(200).lean();
  res.render('owner/bookings', { pageTitle: 'Bookings', bookings, zones, query: req.query });
};

// Allowed moves: confirmed -> checked_in | no_show,  checked_in -> completed
const TRANSITIONS = { confirmed: ['checked_in', 'no_show'], checked_in: ['completed'] };

exports.updateStatus = async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('zone', 'owner');
  if (!booking) throw new ExpressError(404, 'Booking not found');
  if (String(booking.zone.owner) !== req.session.user.id) throw new ExpressError(403, 'This booking is not in one of your zones.');

  const next = req.body.booking.status;
  if (!(TRANSITIONS[booking.status] || []).includes(next)) {
    throw new ExpressError(400, `A ${booking.status.replace('_', ' ')} booking cannot be marked ${next.replace('_', ' ')}.`);
  }
  if (next === 'no_show' && booking.startTime > new Date()) {
    throw new ExpressError(400, 'You can only mark a no-show after the booking start time.');
  }
  booking.status = next;
  await booking.save();
  req.flash('success', `Booking marked ${next.replace('_', ' ')}.`);
  res.redirect(req.get('Referer') || '/owner/bookings');
};
