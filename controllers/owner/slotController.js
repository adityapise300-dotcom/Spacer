const Slot = require('../../models/Slot');
const ExpressError = require('../../utils/ExpressError');
const { futureActiveBookings } = require('./zoneController');

exports.newForm = (req, res) => {
  res.render('owner/slots/new', { pageTitle: 'Add slots', zone: req.zone.toObject() });
};

// Bulk create: prefix "A" + count 5 -> A-01 ... A-05, continuing after the highest existing number
exports.create = async (req, res) => {
  const zone = req.zone;
  const { prefix, count, vehicleType, hasEVCharger } = req.body.slot;

  if (!zone.vehicleTypesAllowed.includes(vehicleType)) {
    throw new ExpressError(400, `This zone does not allow ${vehicleType} vehicles. Edit the zone first.`);
  }
  const existing = await Slot.find({ zone: zone._id, label: new RegExp(`^${prefix}-\\d+$`) }).select('label').lean();
  const highest = existing.reduce((m, s) => Math.max(m, parseInt(s.label.split('-')[1], 10)), 0);

  const docs = Array.from({ length: count }, (_, i) => ({
    zone: zone._id, label: `${prefix}-${String(highest + i + 1).padStart(2, '0')}`,
    vehicleType, hasEVCharger: vehicleType === 'ev' ? true : hasEVCharger,
  }));
  await Slot.insertMany(docs);
  req.flash('success', `Added ${count} slot${count > 1 ? 's' : ''} (${docs[0].label}${count > 1 ? ' to ' + docs[count - 1].label : ''}).`);
  res.redirect(`/owner/zones/${zone._id}`);
};

async function loadSlot(req) {
  const slot = await Slot.findOne({ _id: req.params.slotId, zone: req.zone._id });
  if (!slot) throw new ExpressError(404, 'Slot not found in this zone.');
  return slot;
}

exports.update = async (req, res) => {
  const slot = await loadSlot(req);
  const { status } = req.body.slot;
  if (status === 'maintenance' && (await futureActiveBookings({ slot: slot._id }))) {
    throw new ExpressError(409, 'This slot has upcoming bookings, so it cannot go into maintenance yet.');
  }
  slot.status = status;
  await slot.save();
  req.flash('success', `Slot ${slot.label} is now ${status}.`);
  res.redirect(`/owner/zones/${req.zone._id}`);
};

exports.destroy = async (req, res) => {
  const slot = await loadSlot(req);
  if (await futureActiveBookings({ slot: slot._id })) {
    throw new ExpressError(409, 'This slot has upcoming bookings and cannot be removed.');
  }
  await slot.deleteOne();
  req.flash('success', `Slot ${slot.label} removed.`);
  res.redirect(`/owner/zones/${req.zone._id}`);
};
