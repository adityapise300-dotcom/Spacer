/**
 * MOCK PAYMENT GATEWAY
 * Replace the body of charge()/refund() with Razorpay (create order -> verify signature) later;
 * keep the same inputs and the same { success, transaction } result so controllers don't change.
 */
const crypto = require('crypto');
const Transaction = require('../models/Transaction');

const makeRef = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

async function charge({ booking, userId, ownerId, method }) {
  const rate = parseFloat(process.env.PAYMENT_SUCCESS_RATE ?? '0.9');
  const success = Math.random() < rate;
  const transaction = await Transaction.create({
    booking: booking._id,
    user: userId,
    zone: booking.zone._id || booking.zone,
    owner: ownerId,
    amount: booking.totalAmount,
    method,
    status: success ? 'success' : 'failed',
    referenceId: makeRef('SPC'),
    paidAt: success ? new Date() : undefined,
  });
  return { success, transaction };
}

async function refund({ booking, userId, ownerId, amount, method = 'wallet' }) {
  const transaction = await Transaction.create({
    booking: booking._id,
    user: userId,
    zone: booking.zone._id || booking.zone,
    owner: ownerId,
    amount,
    method,
    status: 'refunded',
    referenceId: makeRef('RFD'),
    paidAt: new Date(),
  });
  return { success: true, transaction };
}

module.exports = { charge, refund, makeRef };
