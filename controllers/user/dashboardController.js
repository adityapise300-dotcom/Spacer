const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const ParkingZone = require('../../models/ParkingZone');
const Slot = require('../../models/Slot');
const Transaction = require('../../models/Transaction');
const availability = require('../../services/availabilityService');
const pricing = require('../../services/pricingService');
const fmt = require('../../utils/helpers');
const { HELD_STATUSES } = require('../../utils/constants');
const { HOUR, humanDuration, isOpenNow, categoryOf, statusIcon, amenityIcon } = require('../../utils/dashboardHelpers');

const LISTING_SIZE = 6;
const ACTIVE_STATUSES = ['pending_payment', 'confirmed', 'checked_in'];

// "Starts in 2 h 15 m" / "Pay within 8 m" / "In progress, ends in 1 h 5 m"
function countdownFor(b, now) {
  if (b.status === 'pending_payment') {
    const left = b.paymentExpiresAt ? +new Date(b.paymentExpiresAt) - +now : 0;
    return { text: left > 0 ? `Pay within ${humanDuration(left)}` : 'Payment needed', tone: 'warn' };
  }
  const start = +new Date(b.startTime);
  const end = +new Date(b.endTime);
  if (start > +now) {
    const left = start - +now;
    return { text: `Starts in ${humanDuration(left)}`, tone: left < HOUR ? 'soon' : 'ok' };
  }
  return { text: `In progress, ends in ${humanDuration(end - +now)}`, tone: 'live' };
}

exports.dashboard = async (req, res) => {
  const userId = req.session.user.id;
  const userOid = new mongoose.Types.ObjectId(userId);
  await availability.expireStaleHolds({ user: userId });

  const now = new Date();
  const nowWindowEnd = new Date(+now + 60 * 1000); // "right now" = a one-minute window

  // ---- Round 1: everything that does not depend on another result ----
  const [upcoming, recent, byZone, spentAgg, zones, activeZoneCount] = await Promise.all([
    Booking.find({ user: userId, status: { $in: ACTIVE_STATUSES }, endTime: { $gt: now } })
      .populate('zone', 'name address location images').sort({ startTime: 1 }).limit(4).lean(),
    Booking.find({ user: userId }).populate('zone', 'name').sort({ createdAt: -1 }).limit(5).lean(),
    // per-zone counts of real (paid / held) bookings; hours only count finished stays
    Booking.aggregate([
      { $match: { user: userOid, status: { $in: HELD_STATUSES } } },
      { $group: { _id: '$zone', count: { $sum: 1 }, hours: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$durationHours', 0] } } } },
    ]),
    // net spend = successful payments minus refunds (same rule the owner revenue pages use)
    Transaction.aggregate([
      { $match: { user: userOid, status: { $in: ['success', 'refunded'] } } },
      { $group: { _id: null, net: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } },
    ]),
    ParkingZone.find({ isActive: true })
      .select('name description address city category location images basePricePerHour openTime closeTime amenities vehicleTypesAllowed')
      .sort({ createdAt: -1 }).limit(60).lean(),
    ParkingZone.countDocuments({ isActive: true }),
  ]);

  // ---- Round 2: needs the zone ids / favourite zone ----
  const zoneIds = zones.map((z) => z._id);
  const favRow = byZone.slice().sort((a, b) => b.count - a.count || b.hours - a.hours)[0];
  const [slotAgg, busyNow, favZone] = await Promise.all([
    Slot.aggregate([
      { $match: { zone: { $in: zoneIds }, status: 'available' } },
      { $group: { _id: '$zone', total: { $sum: 1 } } },
    ]),
    Booking.find({ zone: { $in: zoneIds }, ...availability.overlapFilter(now, nowWindowEnd), ...availability.blockingFilter(now) })
      .select('zone slot').lean(),
    favRow ? ParkingZone.findById(favRow._id).select('name').lean() : null,
  ]);

  // ---- "Parking you may like": rank cheaply, then price only the zones we show ----
  const totalByZone = Object.fromEntries(slotAgg.map((s) => [String(s._id), s.total]));
  const busySlotsByZone = {};
  busyNow.forEach((b) => {
    const k = String(b.zone);
    (busySlotsByZone[k] = busySlotsByZone[k] || new Set()).add(String(b.slot));
  });

  const ranked = zones
    .map((z) => {
      const total = totalByZone[String(z._id)] || 0;
      const busy = busySlotsByZone[String(z._id)] ? busySlotsByZone[String(z._id)].size : 0;
      return { z, total, free: Math.max(0, total - busy), open: isOpenNow(z, now) };
    })
    .sort((a, b) =>
      (b.total > 0) - (a.total > 0) || b.open - a.open || b.free - a.free || a.z.basePricePerHour - b.z.basePricePerHour)
    .slice(0, LISTING_SIZE);

  const listing = await Promise.all(
    ranked.map(async ({ z, total, free, open }) => {
      let price = z.basePricePerHour;
      let priceLive = false;
      try {
        const q = await pricing.quote(z, now, new Date(+now + HOUR));
        if (q && q.pricePerHour > 0) { price = q.pricePerHour; priceLive = true; }
      } catch (e) { /* quote failed: fall back to the owner's base price */ }
      const cat = categoryOf(z.category);
      return {
        zone: z,
        categoryLabel: `${cat.label} · ${z.city || 'Pune'}`,
        categoryTone: cat.tone,
        image: z.images && z.images[0] ? z.images[0] : null,
        amenities: (z.amenities || []).map((a) => ({ label: a, icon: amenityIcon(a) })),
        price, priceLive, total, free, open,
        lat: fmt.hasCoords(z) ? z.location.coordinates[1] : null,
        lng: fmt.hasCoords(z) ? z.location.coordinates[0] : null,
      };
    })
  );

  // ---- Stat tiles: only values we can really compute ----
  const totalBookings = byZone.reduce((a, r) => a + r.count, 0);
  const hoursParked = Math.round(byZone.reduce((a, r) => a + r.hours, 0) * 10) / 10;
  const netSpent = spentAgg[0] ? spentAgg[0].net : 0;
  const stats = [
    { label: 'Total bookings', value: String(totalBookings), count: totalBookings, icon: 'bi-calendar-check', sub: 'not counting cancelled or expired' },
    { label: 'Hours parked', value: String(hoursParked), count: Number.isInteger(hoursParked) ? hoursParked : null, icon: 'bi-clock-history', sub: 'completed stays' },
    { label: 'Total spent', value: fmt.currency(netSpent), count: Number.isInteger(netSpent) ? netSpent : null, prefix: '₹', icon: 'bi-wallet2', sub: 'net of refunds' },
  ];
  if (favRow && favZone) {
    stats.push({ label: 'Favourite zone', value: favZone.name, text: true, icon: 'bi-heart', sub: `${favRow.count} booking${favRow.count === 1 ? '' : 's'}` });
  }

  const withCountdown = upcoming.map((b) => ({ ...b, countdown: countdownFor(b, now) }));
  const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);

  res.render('user/dashboard', {
    pageTitle: 'Dashboard',
    nextBooking: withCountdown[0] || null,
    laterBookings: withCountdown.slice(1),
    recent: recent.map((b) => ({ ...b, icon: statusIcon(b.status) })),
    stats,
    listing,
    activeZoneCount,
    defaults: { start: fmt.toInputValue(nextHour), end: fmt.toInputValue(new Date(+nextHour + 2 * HOUR)) },
  });
};
