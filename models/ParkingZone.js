const mongoose = require('mongoose');
const { VEHICLE_TYPES, AMENITIES, ZONE_CATEGORIES } = require('../utils/constants');

const zoneSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    city: { type: String, required: true, trim: true, default: 'Pune' },
    category: { type: String, enum: ZONE_CATEGORIES, default: 'other' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point', required: true },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (c) => Array.isArray(c) && c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
          message: 'Location must be [longitude, latitude]',
        },
      },
    },
    vehicleTypesAllowed: {
      type: [{ type: String, enum: VEHICLE_TYPES }],
      validate: [(v) => v.length > 0, 'Select at least one vehicle type'],
    },
    basePricePerHour: { type: Number, required: true, min: 5, max: 5000 },
    openTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '06:00' },
    closeTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '23:00' },
    amenities: [{ type: String, enum: AMENITIES }],
    // Image URLs (https links). Leave empty until you have photos; the UI shows a placeholder.
    images: [{ type: String, trim: true, match: [/^https?:\/\/\S+$/i, 'Image must be a valid http(s) URL'] }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

zoneSchema.index({ location: '2dsphere' });
zoneSchema.index({ city: 1, isActive: 1 });

module.exports = mongoose.model('ParkingZone', zoneSchema);
