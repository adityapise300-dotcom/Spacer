const ParkingZone = require('../../models/ParkingZone');
const forecastService = require('../../services/forecastService');

exports.show = async (req, res) => {
  const zones = await ParkingZone.find({ owner: req.session.user.id }).sort({ name: 1 }).lean();
  const selected = zones.find((z) => String(z._id) === req.query.zone) || zones[0] || null;
  const report = selected ? await forecastService.report(selected) : null;
  res.render('owner/insights', { pageTitle: 'Insights', zones, selected, report, useCharts: true });
};

// JSON feed for the Chart.js chart (path ends in .json so errors are returned as JSON too)
exports.forecastJson = async (req, res) => {
  res.json(await forecastService.report(req.zone));
};
