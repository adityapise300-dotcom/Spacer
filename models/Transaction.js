const mongoose = require('mongoose');
const { PAYMENT_METHODS } = require('../utils/constants');

const transactionSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // zone + owner are copied here so revenue reports need no joins
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingZone', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: ['success', 'failed', 'refunded'], required: true },
    referenceId: { type: String, required: true, unique: true },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

transactionSchema.index({ owner: 1, paidAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
