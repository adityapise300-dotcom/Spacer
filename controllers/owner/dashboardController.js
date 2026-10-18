const mongoose = require('mongoose');
const ParkingZone = require('../../models/ParkingZone');
const Slot = require('../../models/Slot');
const Booking = require('../../models/Booking');
const Transaction = require('../../models/Transaction');
const availability = require('../../services/availabilityService');
const pricing = require('../../services/pricingService');
const fmt = require('../../utils/helpers');
const { HELD_STATUSES } = require('../../utils/constants');
const { HOUR, isOpenNow, statusIcon } = require('../../utils/dashboardHelpers');

// Premium (CCTV occupancy) is NOT live. Allowed values: 'Planned feature' | 'Prototype'.
// Change this one line if the status ever changes; anything else falls back to the default.
const PREMIUM_STATUSES = ['Planned feature', 'Prototype'];
const premiumStatus = 'Planned feature';

const MAX_ZONE_CARDS = 6;
const TZ = 'Asia/Kolkata';
const WHEN = 'this time yesterday';
const PAID = ['success', 'refunded'];
// refunds count against revenue (same rule as the old dashboard and the revenue page)
const NET = { $cond: [{ $eq: ['$status', 'refunded'] }, { $multiply: ['$amount', -1] }, '$amount'] };

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');

// Only called when there IS yesterday data; otherwise the tile has no trend at all.
function trend(diff, text) {
  if (diff === 0) return { dir: 'flat', text: `Same as ${WHEN}` };
  return { dir: diff > 0 ? 'up' : 'down', text: `${text} vs ${WHEN}` };
}

function zoneBadge(z, total, busy, now) {
  if (!z.isActive) return { label: 'Paused', tone: 'muted' };
  if (!isOpenNow(z, now)) return { label: 'Closed', tone: 'closed' };
  if (total > 0 && busy >= total) return { label: 'Full', tone: 'full' };
  return { label: 'Open now', tone: 'open' };
}

exports.dashboard = async (req, res) => {
  const ownerId = new mongoose.Types.ObjectId(req.session.user.id);
  const zones = await ParkingZone.find({ owner: ownerId })
    .select('name address images isActive openTime closeTime basePricePerHour category').sort({ name: 1 }).lean();
  const zoneIds = zones.map((z) => z._id);
  await availability.expireStaleHolds({ zone: { $in: zoneIds } });

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dayStart = new Date(y, m, d);
  const dayEnd = new Date(y, m, d + 1);
  const yStart = new Date(y, m, d - 1);
  const yCut = new Date(+now - 24 * HOUR); // same moment, one day earlier
  const weekStart = new Date(y, m, d - 6);

  const [
    todayByZone, ydayAgg, weekAgg, slotsPerZone, busyNow, upcomingCount, recent,
    todayBookings, bookingsTodayAgg, ydayBusy, hasBookingDoc,
  ] = await Promise.all([
    Transaction.aggregate([
      { $match: { owner: ownerId, status: { $in: PAID }, paidAt: { $gte: dayStart, $lt: dayEnd } } },
      { $group: { _id: '$zone', net: { $sum: NET } } },
    ]),
    Transaction.aggregate([
      { $match: { owner: ownerId, status: { $in: PAID }, paidAt: { $gte: yStart, $lt: yCut } } },
      { $group: { _id: null, net: { $sum: NET }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { owner: ownerId, status: { $in: PAID }, paidAt: { $gte: weekStart, $lt: dayEnd } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: TZ } }, net: { $sum: NET } } },
    ]),
    Slot.aggregate([
      { $match: { zone: { $in: zoneIds } } },
      { $group: { _id: '$zone', total: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } }, all: { $sum: 1 } } },
    ]),
    Booking.find({ zone: { $in: zoneIds }, status: { $in: ['confirmed', 'checked_in'] }, startTime: { $lte: now }, endTime: { $gt: now } })
      .select('zone slot').lean(),
    Booking.countDocuments({ zone: { $in: zoneIds }, status: 'confirmed', startTime: { $gt: now } }),
    Booking.find({ zone: { $in: zoneIds } }).populate('zone', 'name').populate('user', 'name').sort({ createdAt: -1 }).limit(6).lean(),
    Booking.find({ zone: { $in: zoneIds }, status: { $ne: 'expired' }, startTime: { $lt: dayEnd }, endTime: { $gt: dayStart } })
      .populate('zone', 'name').populate('user', 'name').sort({ startTime: 1 }).limit(30).lean(),
    Booking.aggregate([
      { $match: { zone: { $in: zoneIds }, status: { $in: HELD_STATUSES }, startTime: { $gte: dayStart, $lt: dayEnd } } },
      { $group: { _id: '$zone', count: { $sum: 1 } } },
    ]),
    Booking.find({ zone: { $in: zoneIds }, status: { $in: HELD_STATUSES }, startTime: { $lte: yCut }, endTime: { $gt: yCut } })
      .select('slot').lean(),
    Booking.exists({ zone: { $in: zoneIds }, status: { $in: HELD_STATUSES } }),
  ]);

  // ---- Bays and occupancy (same logic as before) ----
  const totalByZone = Object.fromEntries(slotsPerZone.map((s) => [String(s._id), s.total]));
  const allByZone = Object.fromEntries(slotsPerZone.map((s) => [String(s._id), s.all]));
  const totalSlots = slotsPerZone.reduce((a, s) => a + s.total, 0);
  const totalSlotDocs = slotsPerZone.reduce((a, s) => a + s.all, 0);
  const busyByZone = {};
  const busySlots = new Set();
  busyNow.forEach((b) => {
    if (!busySlots.has(String(b.slot))) {
      busySlots.add(String(b.slot));
      busyByZone[String(b.zone)] = (busyByZone[String(b.zone)] || 0) + 1;
    }
  });
  const revenueByZone = Object.fromEntries(todayByZone.map((r) => [String(r._id), r.net]));
  const bookingsByZone = Object.fromEntries(bookingsTodayAgg.map((r) => [String(r._id), r.count]));

  const todayRevenue = todayByZone.reduce((a, r) => a + r.net, 0);
  const occupancy = totalSlots ? Math.round((busySlots.size / totalSlots) * 100) : 0;
  const activeNow = busyNow.length;

  // ---- KPI tiles + trends (a trend appears only if yesterday has something to compare) ----
  const tRevenue = ydayAgg[0] && ydayAgg[0].count > 0
    ? trend(todayRevenue - ydayAgg[0].net, `${signed(todayRevenue - ydayAgg[0].net)}${fmt.currency(Math.abs(todayRevenue - ydayAgg[0].net))}`)
    : null;
  const ydayOcc = totalSlots && ydayBusy.length ? Math.round((new Set(ydayBusy.map((b) => String(b.slot))).size / totalSlots) * 100) : null;
  const tOcc = ydayOcc !== null ? trend(occupancy - ydayOcc, `${signed(occupancy - ydayOcc)}${Math.abs(occupancy - ydayOcc)} pts`) : null;
  const tActive = ydayBusy.length ? trend(activeNow - ydayBusy.length, `${signed(activeNow - ydayBusy.length)}${Math.abs(activeNow - ydayBusy.length)}`) : null;

  const tiles = [
    { label: "Today's revenue (net of refunds)", value: fmt.currency(todayRevenue), count: Number.isInteger(todayRevenue) ? todayRevenue : null, prefix: '₹', icon: 'bi-currency-rupee', trend: tRevenue },
    { label: 'Occupancy right now', value: `${occupancy}%`, count: occupancy, suffix: '%', icon: 'bi-pie-chart', trend: tOcc },
    { label: 'Active bookings', value: String(activeNow), count: activeNow, icon: 'bi-activity', trend: tActive },
    { label: 'Upcoming bookings', value: String(upcomingCount), count: upcomingCount, icon: 'bi-calendar-event', trend: null },
  ];

  // ---- Zone cards (first few only; quote the live price for those) ----
  const cards = await Promise.all(
    zones.slice(0, MAX_ZONE_CARDS).map(async (z) => {
      const id = String(z._id);
      const total = totalByZone[id] || 0;
      const busy = busyByZone[id] || 0;
      let priceNow = z.basePricePerHour;
      let priceLive = false;
      try {
        const q = await pricing.quote(z, now, new Date(+now + HOUR));
        if (q && q.pricePerHour > 0) { priceNow = q.pricePerHour; priceLive = true; }
      } catch (e) { /* keep the base price */ }
      return {
        id, name: z.name, address: z.address,
        image: z.images && z.images[0] ? z.images[0] : null,
        badge: zoneBadge(z, total, busy, now),
        total, busy, pct: total ? Math.round((busy / total) * 100) : 0,
        hasSlots: (allByZone[id] || 0) > 0,
        revenueToday: revenueByZone[id] || 0,
        bookingsToday: bookingsByZone[id] || 0,
        priceNow, priceLive,
      };
    })
  );

  // ---- Revenue, last 7 days (zero-filled so every day has a bar) ----
  const netByDay = Object.fromEntries(weekAgg.map((r) => [r._id, r.net]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m, d - 6 + i);
    const label = i === 6 ? 'Today' : `${dt.toLocaleDateString('en-IN', { weekday: 'short', timeZone: TZ })} ${dt.getDate()}`;
    days.push({ label, net: netByDay[dayKey(dt)] || 0 });
  }
  const week = {
    days,
    hasRevenue: weekAgg.length > 0,
    total: days.reduce((a, x) => a + x.net, 0),
    ariaLabel: `Bar chart of net revenue per day for the last 7 days. ${days.map((x) => `${x.label}: ${fmt.currency(x.net)}`).join('. ')}.`,
  };

  // ---- What should an empty section tell the owner to do next? ----
  const zoneWithoutSlots = zones.find((z) => !allByZone[String(z._id)]);
  const first = zones[0];
  let nextStep;
  if (!zones.length) nextStep = { label: 'Add your first zone', href: '/owner/zones/new', icon: 'bi-plus-lg' };
  else if (zoneWithoutSlots) nextStep = { label: 'Add slots', href: `/owner/zones/${zoneWithoutSlots._id}/slots/new`, icon: 'bi-grid-3x3-gap' };
  else nextStep = { label: 'Open insights', href: '/owner/insights', icon: 'bi-graph-up-arrow' };

  const slotsHref = zoneWithoutSlots ? `/owner/zones/${zoneWithoutSlots._id}/slots/new` : zones.length === 1 ? `/owner/zones/${first._id}/slots/new` : '/owner/zones';
  const quickActions = [
    { label: 'Add zone', icon: 'bi-plus-circle', href: '/owner/zones/new', hint: 'List a new space' },
    {
      label: 'Add slots', icon: 'bi-grid-3x3-gap',
      href: zones.length ? slotsHref : '/owner/zones/new',
      hint: !zones.length ? 'Add a zone first' : zones.length === 1 || zoneWithoutSlots ? 'Add bays to a zone' : 'Choose a zone first',
    },
    { label: 'View revenue', icon: 'bi-cash-stack', href: '/owner/revenue', hint: 'Payments and refunds' },
    { label: 'Open insights', icon: 'bi-graph-up-arrow', href: '/owner/insights', hint: 'Demand and price tips' },
  ];

  // ---- Onboarding checklist: every tick comes from real data ----
  const steps = [
    { label: 'Add your first zone', hint: 'Name, address, opening hours and a photo.', done: zones.length > 0, href: '/owner/zones/new' },
    { label: 'Add slots', hint: 'Create the bays drivers can book.', done: totalSlotDocs > 0, href: zones.length ? slotsHref : '/owner/zones/new' },
    { label: 'Set your price', hint: 'Your base hourly rate (dynamic pricing builds on it).', done: zones.some((z) => z.basePricePerHour > 0), href: first ? `/owner/zones/${first._id}/edit` : '/owner/zones/new' },
    { label: 'Get your first booking', hint: 'It shows up here as soon as a driver pays.', done: Boolean(hasBookingDoc), href: '/owner/zones' },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);
  steps.forEach((s, i) => { s.current = i === firstOpen; });
  const onboarding = { show: firstOpen !== -1, done: steps.filter((s) => s.done).length, total: steps.length, steps };

  res.render('owner/dashboard', {
    pageTitle: 'Dashboard',
    todayLabel: now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }),
    tiles,
    kpis: { todayRevenue, occupancy, activeNow, upcoming: upcomingCount },
    cards,
    zoneCount: zones.length,
    ring: { pct: occupancy, busy: busySlots.size, total: totalSlots },
    week,
    quickActions,
    timeline: todayBookings.map((b) => ({ ...b, icon: statusIcon(b.status) })),
    recent,
    nextStep,
    onboarding,
    premium: (() => {
      const status = PREMIUM_STATUSES.includes(premiumStatus) ? premiumStatus : PREMIUM_STATUSES[0];
      return {
        status,
        note: status === 'Prototype'
          ? 'Prototype only. It is not switched on for any account yet.'
          : 'Not available yet. It is shown here so you can see what is planned.',
      };
    })(),
  });
};
