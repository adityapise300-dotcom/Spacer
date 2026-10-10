const mongoose = require('mongoose');
const { VEHICLE_TYPES } = require('../utils/constants');

const vehicleSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: VEHICLE_TYPES, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    // select:false so the hash is never loaded unless login asks for it explicitly
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'owner'], required: true, default: 'user' },
    vehicles: { type: [vehicleSchema], default: undefined }, // drivers only
    businessName: { type: String, trim: true, maxlength: 120 }, // owners only
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
