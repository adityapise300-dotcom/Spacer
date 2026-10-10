const mongoose = require('mongoose');
const { VEHICLE_TYPES } = require('../utils/constants');

const slotSchema = new mongoose.Schema(
  {
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingZone', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 20 },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
    status: { type: String, enum: ['available', 'maintenance'], default: 'available' },
    hasEVCharger: { type: Boolean, default: false },
  },
  { timestamps: true }
);

slotSchema.index({ zone: 1, label: 1 }, { unique: true });

module.exports = mongoose.model('Slot', slotSchema);
