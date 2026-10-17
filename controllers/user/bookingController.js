const Booking = require('../../models/Booking');
const Slot = require('../../models/Slot');
const ParkingZone = require('../../models/ParkingZone');
const Transaction = require('../../models/Transaction');
const ExpressError = require('../../utils/ExpressError');
const availability = require('../../services/availabilityService');
const pricing = require('../../services/pricingService');
const paymentService = require('../../services/paymentService');
const { parseLocal } = require('../../utils/helpers');
const { HOLD_MINUTES, FREE_CANCEL_HOURS, LATE_CANCEL_REFUND } = require('../../utils/constants');

exports.create = async (req, res) => {
  const zone = await ParkingZone.findById(req.params.id);
  if (!zone || !zone.isActive) throw new ExpressError(404, 'Parking zone not found');

  const { vehicleType, vehiclePlate, slotId } = req.body.booking;
  const start = parseLocal(req.body.booking.startTime);
  const end = parseLocal(req.body.booking.endTime);

  // Rule 3: future start, end after start, 1-24h, inside opening hours, vehicle type allowed
  availability.validateWindow(zone, start, end, vehicleType);
  await availability.expireStaleHolds({ zone: zone._id });

  let slot;
  if (slotId) {
    slot = await Slot.findOne({ _id: slotId, zone: zone._id });
    if (!slot) throw new ExpressError(404, 'That slot does not exist in this zone.');
    if (slot.status !== 'available') throw new ExpressError(400, 'That slot is under maintenance.');
    if (slot.vehicleType !== vehicleType) throw new ExpressError(400, 'That slot is not for your vehicle type.');
    if (!(await availability.isSlotFree(slot._id, start, end))) throw new ExpressError(409, 'That slot was just taken. Please pick another.');
  } else {
    slot = await availability.findFreeSlot(zone, vehicleType, start, end);
    if (!slot) throw new ExpressError(409, 'No free slots for that vehicle type and time. Try another time.');
  }

  // Price is locked on the booking so later price changes never alter it
  const quote = await pricing.quote(zone, start, end);

  const booking = await Booking.create({
    user: req.session.user.id, zone: zone._id, slot: slot._id, slotLabel: slot.label,
    vehiclePlate, vehicleType, startTime: start, endTime: end,
    durationHours: quote.hours, pricePerHourApplied: quote.pricePerHour, totalAmount: quote.total,
    priceBreakdown: quote, status: 'pending_payment',
    paymentExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
  });

  // Guarded write: re-check for a simultaneous booking on the same slot
  await availability.resolveRace(booking);

  req.flash('success', `Slot ${slot.label} is held for ${HOLD_MINUTES} minutes. Complete payment to confirm.`);
  res.redirect(`/user/bookings/${booking._id}/pay`);
};

exports.list = async (req, res) => {
  await availability.expireStaleHolds({ user: req.session.user.id });
  const bookings = await Booking.find({ user: req.session.user.id })
    .populate('zone', 'name address location').sort({ startTime: -1 }).limit(100).lean();
  res.render('user/bookings', { pageTitle: 'My bookings', bookings });
};

exports.show = async (req, res) => {
  const booking = req.booking;
  res.render('user/bookingConfirm', { pageTitle: 'Booking details', booking, refund: refundFor(booking) });
};

// Rule 6: free cancellation more than 2h before start, otherwise 50% refund
function refundFor(booking) {
  if (booking.status !== 'confirmed') return { allowed: booking.status === 'pending_payment', amount: 0, full: false };
  const hoursBefore = (booking.startTime - Date.now()) / 36e5;
  if (hoursBefore <= 0) return { allowed: false, amount: 0, full: false };
  const full = hoursBefore > FREE_CANCEL_HOURS;
  return { allowed: true, full, amount: full ? booking.totalAmount : Math.round(booking.totalAmount * LATE_CANCEL_REFUND * 100) / 100 };
}

exports.cancel = async (req, res) => {
  const booking = req.booking;
  const refund = refundFor(booking);
  if (!refund.allowed) throw new ExpressError(400, 'This booking can no longer be cancelled.');

  // Guarded update: only flips the status once, so a double-click can't refund twice
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { $set: { status: 'cancelled', cancelledAt: new Date(), refundAmount: refund.amount } },
    { new: true }
  );
  if (!updated) throw new ExpressError(409, 'This booking was already changed.');

  if (booking.status === 'confirmed' && refund.amount > 0) {
    try {
      await paymentService.refund({
        booking, userId: req.session.user.id, ownerId: booking.zone.owner, amount: refund.amount,
      });
    } catch (e) {
      console.error('Refund failed:', e.message);
      req.flash('error', 'Booking cancelled, but the refund could not be processed automatically. Please contact the owner.');
      return res.redirect(`/user/bookings/${booking._id}`);
    }
  }
  req.flash('success', refund.amount > 0
    ? `Booking cancelled. ₹${refund.amount} will be refunded${refund.full ? ' in full' : ' (50%, late cancellation)'}.`
    : 'Booking cancelled.');
  res.redirect(`/user/bookings/${booking._id}`);
};

exports.receipt = async (req, res) => {
  const booking = req.booking;
  const transactions = await Transaction.find({ booking: booking._id, status: { $in: ['success', 'refunded'] } }).sort({ createdAt: 1 }).lean();
  if (!transactions.some((t) => t.status === 'success')) {
    req.flash('error', 'There is no receipt yet because this booking has not been paid.');
    return res.redirect(`/user/bookings/${booking._id}`);
  }
  res.render('user/receipt', { pageTitle: 'Receipt', booking, transactions });
};
