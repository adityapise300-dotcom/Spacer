const Booking = require('../../models/Booking');
const User = require('../../models/User');
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

// JSON: creates the Razorpay order and returns what Checkout needs
exports.createOrder = async (req, res) => {
  const booking = req.booking;
  assertPayable(booking);
  const order = await paymentService.createOrder(booking);
  booking.razorpayOrderId = order.id;
  await booking.save();
  const me = await User.findById(req.session.user.id).select('name email phone').lean();
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    description: `${booking.zone.name} - slot ${booking.slotLabel}`,
    prefill: { name: me.name, email: me.email, contact: me.phone },
  });
};

// JSON: verifies Razorpay's signature, saves the transaction, confirms the booking
exports.verify = async (req, res) => {
  const booking = req.booking;
  assertPayable(booking);
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;

  if (!booking.razorpayOrderId || booking.razorpayOrderId !== orderId) {
    throw new ExpressError(400, 'This payment does not belong to this booking.');
  }
  if (!paymentService.isValidSignature(orderId, paymentId, signature)) {
    throw new ExpressError(400, 'Payment signature could not be verified.');
  }

  await paymentService.recordPayment({
    booking, userId: req.session.user.id, ownerId: booking.zone.owner, orderId, paymentId,
  });

  // Only confirm if still pending (guards against a double submit)
  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending_payment' },
    { $set: { status: 'confirmed' }, $unset: { paymentExpiresAt: '' } }
  );
  if (!confirmed) throw new ExpressError(409, 'This booking was already updated.');

  req.flash('success', 'Payment successful. Your parking is confirmed.');
  res.json({ redirect: `/user/bookings/${booking._id}/receipt` });
};
