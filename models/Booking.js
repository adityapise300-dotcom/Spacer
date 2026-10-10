const mongoose = require('mongoose');
const { VEHICLE_TYPES, BOOKING_STATUSES } = require('../utils/constants');

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingZone', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    slotLabel: { type: String, required: true }, // snapshot, survives slot deletion
    vehiclePlate: { type: String, required: true, uppercase: true, trim: true },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationHours: { type: Number, required: true, min: 1, max: 24 },
    pricePerHourApplied: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    priceBreakdown: { type: mongoose.Schema.Types.Mixed }, // the "Why this price?" snapshot
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending_payment' },
    paymentExpiresAt: { type: Date },
    razorpayOrderId: { type: String },
    refundAmount: { type: Number, default: 0 },
    cancelledAt: { type: Date },
    isSimulated: { type: Boolean, default: false }, // true for synthetic history
  },
  { timestamps: true }
);

bookingSchema.index({ slot: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ user: 1, startTime: -1 });
bookingSchema.index({ zone: 1, startTime: 1 });
bookingSchema.index({ status: 1, paymentExpiresAt: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
