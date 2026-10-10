/**
 * RAZORPAY PAYMENT SERVICE (works in Razorpay Test Mode with rzp_test_ keys)
 * Flow: createOrder() -> browser Checkout -> isValidSignature() -> recordPayment()
 */
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Transaction = require('../models/Transaction');
const ExpressError = require('../utils/ExpressError');

let client = null;
function gateway() {
  if (!client) {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new ExpressError(500, 'Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.');
    }
    client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return client;
}

const makeRef = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

// Step 1: ask Razorpay for an order (amount is in paise)
async function createOrder(booking) {
  return gateway().orders.create({
    amount: Math.round(booking.totalAmount * 100),
    currency: 'INR',
    receipt: String(booking._id),
    notes: { bookingId: String(booking._id) },
  });
}

// Step 2: prove the payment really came from Razorpay (HMAC-SHA256 of "orderId|paymentId")
function isValidSignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Step 3: double-check with Razorpay's server, then save the Transaction
async function recordPayment({ booking, userId, ownerId, orderId, paymentId }) {
  const rz = gateway();
  let payment = await rz.payments.fetch(paymentId);
  if (payment.order_id !== orderId || payment.amount !== Math.round(booking.totalAmount * 100)) {
    throw new ExpressError(400, 'Payment details do not match this booking.');
  }
  if (payment.status === 'authorized') payment = await rz.payments.capture(paymentId, payment.amount, 'INR');
  if (payment.status !== 'captured') throw new ExpressError(402, 'The payment was not completed.');

  const method = ['upi', 'card', 'wallet', 'netbanking', 'emi', 'paylater'].includes(payment.method) ? payment.method : 'other';
  return Transaction.create({
    booking: booking._id, user: userId, zone: booking.zone._id || booking.zone, owner: ownerId,
    amount: booking.totalAmount, method, status: 'success',
    referenceId: paymentId, razorpayOrderId: orderId, razorpayPaymentId: paymentId, paidAt: new Date(),
  });
}

// Refund through Razorpay when the original payment came from Razorpay.
// Older seeded/simulated transactions have no Razorpay id, so those are only recorded locally.
async function refund({ booking, userId, ownerId, amount }) {
  const paid = await Transaction.findOne({ booking: booking._id, status: 'success' });
  let referenceId = makeRef('RFD');
  if (paid && paid.razorpayPaymentId) {
    const r = await gateway().payments.refund(paid.razorpayPaymentId, {
      amount: Math.round(amount * 100), speed: 'normal', notes: { bookingId: String(booking._id) },
    });
    referenceId = r.id;
  }
  return Transaction.create({
    booking: booking._id, user: userId, zone: booking.zone._id || booking.zone, owner: ownerId,
    amount, method: paid ? paid.method : 'other', status: 'refunded', referenceId,
    razorpayPaymentId: paid ? paid.razorpayPaymentId : undefined, paidAt: new Date(),
  });
}

module.exports = { createOrder, isValidSignature, recordPayment, refund, makeRef };
