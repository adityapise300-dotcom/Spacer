const mongoose = require('mongoose');
const ParkingZone = require('../../models/ParkingZone');
const Slot = require('../../models/Slot');
const Booking = require('../../models/Booking');
const Transaction = require('../../models/Transaction');
const availability = require('../../services/availabilityService');

exports.dashboard = async (req, res) => {
  const ownerId = new mongoose.Types.ObjectId(req.session.user.id);
  const zones = await ParkingZone.find({ owner: ownerId }).select('name isActive').lean();
  const zoneIds = zones.map((z) => z._id);
  await availability.expireStaleHolds({ zone: { $in: zoneIds } });

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(+dayStart + 24 * 36e5);

  const [revenueAgg, slotsPerZone, busyNow, upcomingCount, recent] = await Promise.all([
    Transaction.aggregate([
      { $match: { owner: ownerId, status: { $in: ['success', 'refunded'] }, paidAt: { $gte: dayStart, $lt: dayEnd } } },
      { $group: { _id: null, net: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } },
    ]),
    Slot.aggregate([
      { $match: { zone: { $in: zoneIds }, status: 'available' } },
      { $group: { _id: '$zone', total: { $sum: 1 } } },
    ]),
    Booking.find({ zone: { $in: zoneIds }, status: { $in: ['confirmed', 'checked_in'] }, startTime: { $lte: now }, endTime: { $gt: now } })
      .select('zone slot').lean(),
    Booking.countDocuments({ zone: { $in: zoneIds }, status: 'confirmed', startTime: { $gt: now } }),
    Booking.find({ zone: { $in: zoneIds } }).populate('zone', 'name').populate('user', 'name').sort({ createdAt: -1 }).limit(6).lean(),
  ]);

  const totalSlots = slotsPerZone.reduce((a, s) => a + s.total, 0);
  const busyByZone = {};
  const busySlots = new Set();
  busyNow.forEach((b) => {
    if (!busySlots.has(String(b.slot))) {
      busySlots.add(String(b.slot));
      busyByZone[b.zone] = (busyByZone[b.zone] || 0) + 1;
    }
  });
  const totalByZone = Object.fromEntries(slotsPerZone.map((s) => [String(s._id), s.total]));

  res.render('owner/dashboard', {
    pageTitle: 'Dashboard',
    kpis: {
      todayRevenue: revenueAgg[0] ? revenueAgg[0].net : 0,
      occupancy: totalSlots ? Math.round((busySlots.size / totalSlots) * 100) : 0,
      activeNow: busyNow.length,
      upcoming: upcomingCount,
    },
    zoneRows: zones.map((z) => ({
      zone: z, total: totalByZone[z._id] || 0, busy: busyByZone[z._id] || 0,
    })),
    recent,
  });
};
