const Joi = require('joi');
const { VEHICLE_TYPES, AMENITIES, ZONE_CATEGORIES, PAYMENT_METHODS } = require('../utils/constants');

const objectId = Joi.string().hex().length(24);
const dtLocal = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).messages({
  'string.pattern.base': '{{#label}} must be a valid date and time',
});
const dateOnly = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);

const password = Joi.string().min(8).max(72).pattern(/[A-Za-z]/).pattern(/\d/).required().messages({
  'string.min': 'Password must be at least 8 characters',
  'string.pattern.base': 'Password must contain at least one letter and one number',
});
const phone = Joi.string().trim().pattern(/^(\+91)?[6-9]\d{9}$/).required().messages({
  'string.pattern.base': 'Enter a valid 10-digit Indian mobile number',
});
const plate = Joi.string().trim().uppercase().replace(/[\s-]/g, '').pattern(/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/).messages({
  'string.pattern.base': 'Vehicle number looks wrong (example: MH12AB1234)',
});

const registerSchema = (key, withBusiness) =>
  Joi.object({
    [key]: Joi.object({
      name: Joi.string().trim().min(2).max(80).required(),
      email: Joi.string().trim().lowercase().email().required(),
      phone,
      ...(withBusiness ? { businessName: Joi.string().trim().min(2).max(120).required() } : {}),
      password,
      confirmPassword: Joi.any().valid(Joi.ref('password')).required().messages({ 'any.only': 'Passwords do not match' }),
    }).required(),
  }).required();

const loginSchema = Joi.object({
  login: Joi.object({
    email: Joi.string().trim().lowercase().email().required(),
    password: Joi.string().max(72).required(),
  }).required(),
}).required();

const profileSchema = (withBusiness) =>
  Joi.object({
    user: Joi.object({
      name: Joi.string().trim().min(2).max(80).required(),
      phone,
      ...(withBusiness ? { businessName: Joi.string().trim().min(2).max(120) } : {}),
      vehicles: Joi.array().items(
        Joi.object({ plateNumber: plate.required(), type: Joi.string().valid(...VEHICLE_TYPES).required() })
      ).max(5).default([]),
    }).required(),
  }).required();

const zoneSchema = Joi.object({
  zone: Joi.object({
    name: Joi.string().trim().min(3).max(120).required(),
    description: Joi.string().trim().max(1000).allow(''),
    address: Joi.string().trim().min(5).max(250).required(),
    city: Joi.string().trim().min(2).max(60).required(),
    category: Joi.string().valid(...ZONE_CATEGORIES).default('other'),
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
    vehicleTypesAllowed: Joi.array().items(Joi.string().valid(...VEHICLE_TYPES)).single().min(1).required()
      .messages({ 'array.min': 'Select at least one vehicle type' }),
    basePricePerHour: Joi.number().min(5).max(5000).required(),
    openTime: hhmm.required(),
    closeTime: hhmm.required(),
    amenities: Joi.array().items(Joi.string().valid(...AMENITIES)).single().default([]),
    imagesText: Joi.string().allow('').max(3000).default(''), // one image URL per line
    isActive: Joi.boolean().truthy('on').falsy('off').default(false),
  })
    .custom((v, helpers) => {
      // closeTime 00:00 means "until midnight"; otherwise it must be after openTime
      if (v.closeTime !== '00:00' && v.closeTime <= v.openTime) return helpers.message('Closing time must be after opening time');
      return v;
    })
    .required(),
}).required();

const slotCreateSchema = Joi.object({
  slot: Joi.object({
    prefix: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,6}$/).required()
      .messages({ 'string.pattern.base': 'Label prefix must be 1-6 letters or digits' }),
    count: Joi.number().integer().min(1).max(50).required(),
    vehicleType: Joi.string().valid(...VEHICLE_TYPES).required(),
    hasEVCharger: Joi.boolean().truthy('on').falsy('off').default(false),
  }).required(),
}).required();

const slotUpdateSchema = Joi.object({
  slot: Joi.object({ status: Joi.string().valid('available', 'maintenance').required() }).required(),
}).required();

const bookingSchema = Joi.object({
  booking: Joi.object({
    startTime: dtLocal.required(),
    endTime: dtLocal.required(),
    vehicleType: Joi.string().valid(...VEHICLE_TYPES).required(),
    vehiclePlate: plate.required(),
    slotId: objectId.allow('').default(''),
  }).required(),
}).required();

const paymentSchema = Joi.object({
  payment: Joi.object({ method: Joi.string().valid(...PAYMENT_METHODS).required() }).required(),
}).required();

const searchQuerySchema = Joi.object({
  q: Joi.string().trim().max(100).allow(''),
  lat: Joi.number().min(-90).max(90).empty(''),
  lng: Joi.number().min(-180).max(180).empty(''),
  start: dtLocal.allow(''),
  end: dtLocal.allow(''),
  vehicleType: Joi.string().valid(...VEHICLE_TYPES).allow(''),
  maxPrice: Joi.number().min(0).max(10000).empty(''),
});

const zoneDetailsQuerySchema = Joi.object({
  start: dtLocal.allow(''),
  end: dtLocal.allow(''),
  vehicleType: Joi.string().valid(...VEHICLE_TYPES).allow(''),
});

const ownerBookingStatusSchema = Joi.object({
  booking: Joi.object({ status: Joi.string().valid('checked_in', 'completed', 'no_show').required() }).required(),
}).required();

const ownerBookingsQuerySchema = Joi.object({
  zone: objectId.allow(''),
  status: Joi.string().valid('pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'no_show').allow(''),
  from: dateOnly.allow(''),
  to: dateOnly.allow(''),
});

const revenueQuerySchema = Joi.object({ range: Joi.number().valid(7, 30, 90).default(30) });
const insightsQuerySchema = Joi.object({ zone: objectId.allow('') });

module.exports = {
  registerUserSchema: registerSchema('user', false),
  registerOwnerSchema: registerSchema('owner', true),
  loginSchema,
  profileSchema: profileSchema(false),
  zoneSchema, slotCreateSchema, slotUpdateSchema, bookingSchema, paymentSchema,
  searchQuerySchema, zoneDetailsQuerySchema, ownerBookingStatusSchema, ownerBookingsQuerySchema,
  revenueQuerySchema, insightsQuerySchema,
};
