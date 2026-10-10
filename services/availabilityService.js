const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const ExpressError = require('../utils/ExpressError');
const { BLOCKING_STATUSES, HOLD_MINUTES } = require('../utils/constants');

const HOUR = 36e5;

/**
 * A booking "blocks" a slot when it is confirmed/checked_in, or when it is a
 * pending_payment hold whose 10-minute timer has NOT run out. Expired holds are
 * therefore treated as free even before they are lazily marked "expired".
 */
function blockingFilter(now = new Date()) {
  return {
    $or: [
      { status: { $in: BLOCKING_STATUSES } },
      { status: 'pending_payment', paymentExpiresAt: { $gt: now } },
    ],
  };
}

/** Two time ranges overlap when: existing.start < newEnd AND existing.end > newStart */
function overlapFilter(start, end) {
  return { startTime: { $lt: end }, endTime: { $gt: start } };
}

async function expireStaleHolds(extra = {}) {
  return Booking.updateMany(
    { status: 'pending_payment', paymentExpiresAt: { $lte: new Date() }, ...extra },
    { $set: { status: 'expired' } }
  );
}

async function isSlotFree(slotId, start, end, excludeBookingId) {
  const filter = { slot: slotId, ...overlapFilter(start, end), ...blockingFilter() };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return !(await Booking.exists(filter));
}

async function getBusySlotIds(zoneId, start, end) {
  const ids = await Booking.distinct('slot', { zone: zoneId, ...overlapFilter(start, end), ...blockingFilter() });
  return new Set(ids.map(String));
}

const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });

/** Slots of a zone with a colour state for the chosen window: available | booked | maintenance */
async function getSlotStatuses(zone, start, end, vehicleType) {
  const filter = { zone: zone._id };
  if (vehicleType) filter.vehicleType = vehicleType;
  const [slots, busy] = await Promise.all([Slot.find(filter).lean(), getBusySlotIds(zone._id, start, end)]);
  return slots.sort(byLabel).map((slot) => ({
    slot,
    state: slot.status === 'maintenance' ? 'maintenance' : busy.has(String(slot._id)) ? 'booked' : 'available',
  }));
}

async function findFreeSlot(zone, vehicleType, start, end) {
  const statuses = await getSlotStatuses(zone, start, end, vehicleType);
  const free = statuses.find((s) => s.state === 'available');
  return free ? free.slot : null;
}

async function countFree(zone, vehicleType, start, end) {
  const statuses = await getSlotStatuses(zone, start, end, vehicleType || undefined);
  return statuses.filter((s) => s.state === 'available').length;
}

/** Share of bookable slots already reserved in the window (0..1). Feeds dynamic pricing. */
async function occupancyRatio(zoneId, start, end) {
  const total = await Slot.countDocuments({ zone: zoneId, status: 'available' });
  if (!total) return 0;
  const busy = await getBusySlotIds(zoneId, start, end);
  return Math.min(1, busy.size / total);
}

// ---- Opening hours ----
const toMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
function normalisedHours(zone) {
  const open = toMin(zone.openTime);
  let close = toMin(zone.closeTime);
  if (close === 0 || close >= 1439) close = 1440; // "00:00" / "23:59" = until midnight
  return { open, close };
}
function openHourRange(zone) {
  const { open, close } = normalisedHours(zone);
  return { openH: Math.floor(open / 60), closeH: Math.ceil(close / 60) };
}
function isWithinOpenHours(zone, start, end) {
  const { open, close } = normalisedHours(zone);
  if (open === 0 && close === 1440) return true; // 24x7 zone
  const sMin = start.getHours() * 60 + start.getMinutes();
  let eMin = end.getHours() * 60 + end.getMinutes();
  const nextMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  if (end.getTime() === nextMidnight.getTime()) eMin = 1440;
  else if (start.toDateString() !== end.toDateString()) return false;
  return sMin >= open && eMin <= close;
}

/** Returns a human message for the first broken rule, or null when the window is fine. */
function windowProblem(zone, start, end, vehicleType) {
  if (!start || !end) return 'Choose a start and end time.';
  if (start <= new Date()) return 'Start time must be in the future.';
  if (end <= start) return 'End time must be after the start time.';
  const hrs = (end - start) / HOUR;
  if (hrs < 1) return 'The minimum booking is 1 hour.';
  if (hrs > 24) return 'The maximum booking is 24 hours.';
  if (zone && !isWithinOpenHours(zone, start, end)) {
    return `This zone is open ${zone.openTime} to ${zone.closeTime}. Bookings must fit within one day's opening hours.`;
  }
  if (zone && vehicleType && !zone.vehicleTypesAllowed.includes(vehicleType)) {
    return 'This zone does not accept that vehicle type.';
  }
  return null;
}

function validateWindow(zone, start, end, vehicleType) {
  const problem = windowProblem(zone, start, end, vehicleType);
  if (problem) throw new ExpressError(400, problem);
}

/**
 * Guarded write, step 2. MongoDB has no cheap multi-document lock without a replica set,
 * so after inserting we look for any OTHER live booking that overlaps the same slot.
 * If one exists, the booking with the smaller _id wins and the other deletes itself.
 * Both racers run the same comparison, so exactly one survives.
 */
async function resolveRace(booking) {
  const rival = await Booking.findOne({
    _id: { $ne: booking._id },
    slot: booking.slot,
    ...overlapFilter(booking.startTime, booking.endTime),
    ...blockingFilter(),
  }).select('_id');
  if (rival && String(rival._id) < String(booking._id)) {
    await Booking.deleteOne({ _id: booking._id });
    throw new ExpressError(409, 'Sorry, someone just booked that slot. Please pick another one.');
  }
}

module.exports = {
  HOLD_MINUTES, blockingFilter, overlapFilter, expireStaleHolds, isSlotFree, getBusySlotIds,
  getSlotStatuses, findFreeSlot, countFree, occupancyRatio, windowProblem, validateWindow,
  openHourRange, isWithinOpenHours, resolveRace,
};
