const Booking = require('../../models/Booking');
const ExpressError = require('../../utils/ExpressError');
const paymentService = require('../../services/paymentService');

function assertPayable(booking) {
  if (booking.status === 'expired' || (booking.status === 'pending_payment' && booking.paymentExpiresAt <= new Date())) {
    throw new ExpressError(410, 'This hold has expired and the slot was released. Please book again.');
  }
  if (booking.status !== 'pending_payment') throw new ExpressError(400, 'This booking is not waiting for payment.');
}

exports.payPage = async (req, res) => {
  const booking = req.booking;
  if (booking.status !== 'pending_payment' && booking.status !== 'expired') {
    req.flash('success', 'This booking is already paid.');
    return res.redirect(`/user/bookings/${booking._id}`);
  }
  assertPayable(booking);
  res.render('user/payment', { pageTitle: 'Payment', booking });
};

exports.pay = async (req, res) => {
  const booking = req.booking;
  assertPayable(booking);

  const { success } = await paymentService.charge({
    booking, userId: req.session.user.id, ownerId: booking.zone.owner, method: req.body.payment.method,
  });

  if (!success) {
    req.flash('error', 'Payment failed. No money was taken. You can retry while the hold is active.');
    return res.redirect(`/user/bookings/${booking._id}/pay`);
  }

  // Only confirm if still pending (guards against paying twice in two tabs)
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending_payment' },
    { $set: { status: 'confirmed' }, $unset: { paymentExpiresAt: '' } }
  );
  if (!confirmed) throw new ExpressError(409, 'This booking was already updated.');

  req.flash('success', 'Payment successful. Your parking is confirmed.');
  res.redirect(`/user/bookings/${booking._id}/receipt`);
};
