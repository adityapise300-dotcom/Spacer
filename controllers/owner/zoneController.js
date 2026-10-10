const ParkingZone = require('../../models/ParkingZone');
const Slot = require('../../models/Slot');
const Booking = require('../../models/Booking');
const Transaction = require('../../models/Transaction');
const ExpressError = require('../../utils/ExpressError');
const availability = require('../../services/availabilityService');

// One URL per line -> clean array of http(s) URLs
const parseImages = (text) =>
  String(text || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\/\S+$/i.test(s)).slice(0, 8);

const toZoneFields = (z) => ({
  name: z.name, description: z.description || '', address: z.address, city: z.city, category: z.category,
  location: { type: 'Point', coordinates: [z.lng, z.lat] },
  vehicleTypesAllowed: z.vehicleTypesAllowed, basePricePerHour: z.basePricePerHour,
  openTime: z.openTime, closeTime: z.closeTime, amenities: z.amenities,
  images: parseImages(z.imagesText), isActive: z.isActive,
});

async function futureActiveBookings(filter) {
  await availability.expireStaleHolds(filter);
  return Booking.countDocuments({
    ...filter, endTime: { $gt: new Date() }, status: { $in: ['pending_payment', 'confirmed', 'checked_in'] },
  });
}

exports.index = async (req, res) => {
  const zones = await ParkingZone.find({ owner: req.session.user.id }).sort({ createdAt: -1 }).lean();
  const counts = await Slot.aggregate([
    { $match: { zone: { $in: zones.map((z) => z._id) } } },
    { $group: { _id: '$zone', total: { $sum: 1 } } },
  ]);
  const slotCount = Object.fromEntries(counts.map((c) => [String(c._id), c.total]));
  res.render('owner/zones/index', { pageTitle: 'My zones', zones, slotCount });
};

exports.newForm = (req, res) => {
  res.render('owner/zones/new', { pageTitle: 'New zone', zone: null });
};

exports.create = async (req, res) => {
  const zone = await ParkingZone.create({ owner: req.session.user.id, ...toZoneFields(req.body.zone) });
  req.flash('success', 'Zone created. Now add some parking slots.');
  res.redirect(`/owner/zones/${zone._id}/slots/new`);
};

exports.show = async (req, res) => {
  const zone = req.zone.toObject();
  await availability.expireStaleHolds({ zone: zone._id });
  const now = new Date();
  const [slots, upcoming] = await Promise.all([
    Slot.find({ zone: zone._id }).lean(),
    Booking.find({ zone: zone._id, endTime: { $gt: now }, status: { $in: ['confirmed', 'checked_in'] } })
      .populate('user', 'name').sort({ startTime: 1 }).limit(8).lean(),
  ]);
  slots.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  res.render('owner/zones/show', { pageTitle: zone.name, zone, slots, upcoming });
};

exports.editForm = (req, res) => {
  res.render('owner/zones/edit', { pageTitle: 'Edit zone', zone: req.zone.toObject() });
};

exports.update = async (req, res) => {
  req.zone.set(toZoneFields(req.body.zone));
  await req.zone.save();
  req.flash('success', 'Zone updated.');
  res.redirect(`/owner/zones/${req.zone._id}`);
};

exports.destroy = async (req, res) => {
  const zone = req.zone;
  if (await futureActiveBookings({ zone: zone._id })) {
    throw new ExpressError(409, 'This zone has upcoming bookings. Wait for them to finish or ask drivers to cancel first.');
  }
  // Cascade: remove slots, bookings and their transactions for this zone
  await Promise.all([
    Slot.deleteMany({ zone: zone._id }),
    Booking.deleteMany({ zone: zone._id }),
    Transaction.deleteMany({ zone: zone._id }),
  ]);
  await zone.deleteOne();
  req.flash('success', 'Zone deleted.');
  res.redirect('/owner/zones');
};

module.exports.futureActiveBookings = futureActiveBookings;
