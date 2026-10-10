const mongoose = require('mongoose');
const Transaction = require('../../models/Transaction');

exports.show = async (req, res) => {
  const range = req.query.range;
  const ownerId = new mongoose.Types.ObjectId(req.session.user.id);
  const since = new Date(Date.now() - range * 24 * 36e5);
  const tz = 'Asia/Kolkata';
  const net = { $cond: [{ $eq: ['$status', 'refunded'] }, { $multiply: ['$amount', -1] }, '$amount'] };
  const groupBy = (format) => [
    { $group: { _id: { $dateToString: { format, date: '$paidAt', timezone: tz } }, net: { $sum: net }, count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } } } },
    { $sort: { _id: -1 } },
    { $limit: 31 },
  ];

  const [result] = await Transaction.aggregate([
    { $match: { owner: ownerId, status: { $in: ['success', 'refunded'] }, paidAt: { $gte: since } } },
    {
      $facet: {
        totals: [{ $group: {
          _id: null, net: { $sum: net },
          gross: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, '$amount', 0] } },
          refunds: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$amount', 0] } },
          count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        } }],
        byDay: groupBy('%Y-%m-%d'),
        byWeek: groupBy('%G-W%V'),
        byZone: [
          { $group: { _id: '$zone', net: { $sum: net }, count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } } } },
          { $lookup: { from: 'parkingzones', localField: '_id', foreignField: '_id', as: 'zone' } },
          { $project: { net: 1, count: 1, name: { $ifNull: [{ $arrayElemAt: ['$zone.name', 0] }, 'Unknown zone'] } } },
          { $sort: { net: -1 } },
        ],
      },
    },
  ]);

  res.render('owner/revenue', {
    pageTitle: 'Revenue', range,
    totals: result.totals[0] || { net: 0, gross: 0, refunds: 0, count: 0 },
    byDay: result.byDay, byWeek: result.byWeek, byZone: result.byZone,
  });
};
