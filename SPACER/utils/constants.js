module.exports = {
  VEHICLE_TYPES: ['bike', 'car', 'suv', 'ev'],
  VEHICLE_LABELS: { bike: 'Bike', car: 'Car', suv: 'SUV', ev: 'EV' },
  VEHICLE_ICONS: { bike: 'bi-bicycle', car: 'bi-car-front', suv: 'bi-truck-front', ev: 'bi-ev-front' },
  AMENITIES: ['CCTV', 'Covered', 'EV charging', 'Security'],
  ZONE_CATEGORIES: ['office', 'mall', 'market', 'transit', 'residential', 'other'],
  BOOKING_STATUSES: ['pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'no_show'],
  // A slot is busy for these statuses (pending_payment only while its hold is alive)
  BLOCKING_STATUSES: ['confirmed', 'checked_in'],
  // Statuses that count as real demand when forecasting and for revenue
  HELD_STATUSES: ['confirmed', 'checked_in', 'completed', 'no_show'],
  PAYMENT_METHODS: ['upi', 'card', 'wallet'],
  HOLD_MINUTES: 10,
  FREE_CANCEL_HOURS: 2,
  LATE_CANCEL_REFUND: 0.5,
};
