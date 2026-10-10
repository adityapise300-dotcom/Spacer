const Booking = require('../../models/Booking');
const availability = require('../../services/availabilityService');
const { toInputValue } = require('../../utils/helpers');

exports.dashboard = async (req, res) => {
  const user = req.session.user.id;
  await availability.expireStaleHolds({ user });
  const now = new Date();
  const [upcoming, recent] = await Promise.all([
    Booking.find({ user, status: { $in: ['pending_payment', 'confirmed', 'checked_in'] }, endTime: { $gt: now } })
      .populate('zone', 'name').sort({ startTime: 1 }).limit(5).lean(),
    Booking.find({ user }).populate('zone', 'name').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  res.render('user/dashboard', {
    pageTitle: 'Dashboard', upcoming, recent,
    defaults: { start: toInputValue(nextHour), end: toInputValue(new Date(+nextHour + 2 * 36e5)) },
  });
};
