const ParkingZone = require('../../models/ParkingZone');
const User = require('../../models/User');
const ExpressError = require('../../utils/ExpressError');
const availability = require('../../services/availabilityService');
const pricing = require('../../services/pricingService');
const { parseLocal, escapeRegex, distanceKm } = require('../../utils/helpers');

exports.search = async (req, res) => {
  const { q, lat, lng, vehicleType, maxPrice } = req.query;
  const start = parseLocal(req.query.start);
  const end = parseLocal(req.query.end);

  const filter = { isActive: true };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { address: rx }, { city: rx }];
  }
  if (vehicleType) filter.vehicleTypesAllowed = vehicleType;
  if (maxPrice !== undefined) filter.basePricePerHour = { $lte: maxPrice };
  const hasGeo = lat !== undefined && lng !== undefined;
  if (hasGeo) {
    // $near returns nearest first
    filter.location = { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 15000 } };
  }

  const zones = await ParkingZone.find(filter).limit(24).lean();

  const windowGiven = Boolean(req.query.start && req.query.end);
  const windowError = windowGiven ? availability.windowProblem(null, start, end) : null;
  const useWindow = windowGiven && !windowError;

  const results = await Promise.all(
    zones.map(async (zone) => {
      const info = { zone };
      if (hasGeo) info.distanceKm = distanceKm(lat, lng, zone.location.coordinates[1], zone.location.coordinates[0]);
      if (useWindow) {
        const zoneProblem = availability.windowProblem(zone, start, end, vehicleType || undefined);
        if (zoneProblem) {
          info.unavailableReason = zoneProblem;
          info.free = 0;
        } else {
          info.free = await availability.countFree(zone, vehicleType, start, end);
          if (info.free > 0) info.quote = await pricing.quote(zone, start, end);
        }
      }
      return info;
    })
  );
  if (useWindow) results.sort((a, b) => (a.free === 0) - (b.free === 0)); // full zones last

  const detailQuery = new URLSearchParams();
  if (useWindow) { detailQuery.set('start', req.query.start); detailQuery.set('end', req.query.end); }
  if (vehicleType) detailQuery.set('vehicleType', vehicleType);

  res.render('user/search', {
    pageTitle: 'Find parking', results, query: req.query, windowError, useWindow,
    detailQuery: detailQuery.toString(),
  });
};

exports.show = async (req, res) => {
  const zone = await ParkingZone.findById(req.params.id).lean();
  if (!zone || !zone.isActive) throw new ExpressError(404, 'Parking zone not found');

  const vehicleType = zone.vehicleTypesAllowed.includes(req.query.vehicleType)
    ? req.query.vehicleType
    : zone.vehicleTypesAllowed[0];
  const start = parseLocal(req.query.start);
  const end = parseLocal(req.query.end);
  const windowGiven = Boolean(req.query.start && req.query.end);
  const problem = windowGiven ? availability.windowProblem(zone, start, end, vehicleType) : null;

  const data = { pageTitle: zone.name, zone, vehicleType, start, end, windowGiven, problem, statuses: null, quote: null, vehicles: [] };

  if (windowGiven && !problem) {
    await availability.expireStaleHolds({ zone: zone._id });
    [data.statuses, data.quote] = await Promise.all([
      availability.getSlotStatuses(zone, start, end, vehicleType),
      pricing.quote(zone, start, end),
    ]);
  }
  const me = await User.findById(req.session.user.id).select('vehicles').lean();
  data.vehicles = (me && me.vehicles) || [];
  res.render('user/zoneDetails', data);
};
