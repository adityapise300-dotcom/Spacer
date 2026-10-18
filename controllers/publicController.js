const ParkingZone = require('../models/ParkingZone');
const Slot = require('../models/Slot');

/* ------------------------------------------------------------------
 * LANDING PAGE SETTINGS  (edit this block, restart the server)
 * ------------------------------------------------------------------ */

// Allowed values for the Premium AI occupancy badge. Anything else falls back to the first one.
const PREMIUM_STATUSES = ['Planned feature', 'Prototype'];
const premiumStatus = PREMIUM_STATUSES.includes(process.env.PREMIUM_STATUS)
  ? process.env.PREMIUM_STATUS
  : PREMIUM_STATUSES[0];

// Optional simulated results. Leave a value as null and its tile is not shown.
// Fill these only with numbers printed by `npm run simulate`; they are simulated, not field-measured.
//   forecastErrorVsBaseline : % by which the forecast error is LOWER than the "same hour yesterday" baseline (e.g. 18)
//   avgSearchTimeBefore     : average minutes to find parking without SPACER (e.g. 11)
//   avgSearchTimeAfter      : average minutes with SPACER (e.g. 2)
const LANDING_CONFIG = {
  forecastErrorVsBaseline: null,
  avgSearchTimeBefore: null,
  avgSearchTimeAfter: null,
};

/* ------------------------------------------------------------------ */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nf = new Intl.NumberFormat('en-IN');

function premiumCopy(status) {
  if (status === 'Prototype') {
    return {
      status,
      summary: 'A prototype exists for this Premium owner tier. It is not a released feature yet.',
      faq: 'Not yet. The Premium AI occupancy tier is at prototype stage: it is being tried out but is not a released feature, and it is not part of the standard SPACER experience today.',
    };
  }
  return {
    status,
    summary: 'This is a planned Premium owner tier. It is not built or available yet.',
    faq: 'Not yet. It is a planned feature and has not been built. The idea is for an owner\u2019s CCTV feed to reach SPACER through an API, so computer vision can detect slot occupancy and record exact arrival, departure and dwell time. Only events (slot, state, time) would be stored, not raw video.',
  };
}

/** Real counts from the database. Returns null on any failure so the template hides the section. */
async function loadLiveStats() {
  try {
    const zones = await ParkingZone.find({ isActive: true }).select('_id').maxTimeMS(1500).lean();
    const zoneIds = zones.map((z) => z._id);
    const slotCount = zoneIds.length
      ? await Slot.countDocuments({ zone: { $in: zoneIds } }).maxTimeMS(1500)
      : 0;
    return { zones: zoneIds.length, slots: slotCount };
  } catch (err) {
    console.error('Landing stats unavailable:', err.message);
    return null;
  }
}

/** Builds the tiles shown in the numbers section. Empty array means: hide the section. */
function buildTiles(live) {
  if (!live) return []; // database failed, hide the whole section

  const tiles = [];
  if (live.zones > 0) tiles.push({ value: nf.format(live.zones), label: 'Active parking zones', note: 'Demo data, Pune' });
  if (live.slots > 0) tiles.push({ value: nf.format(live.slots), label: 'Parking slots', note: 'Demo data, Pune' });

  const c = LANDING_CONFIG;
  if (isNum(c.forecastErrorVsBaseline)) {
    tiles.push({
      value: `${c.forecastErrorVsBaseline}%`,
      label: 'Lower forecast error than a \u201csame hour yesterday\u201d baseline',
      note: 'From simulated data',
    });
  }
  if (isNum(c.avgSearchTimeBefore)) {
    tiles.push({ value: `${c.avgSearchTimeBefore} min`, label: 'Average search time without SPACER', note: 'From simulated data' });
  }
  if (isNum(c.avgSearchTimeAfter)) {
    tiles.push({ value: `${c.avgSearchTimeAfter} min`, label: 'Average search time with SPACER', note: 'From simulated data' });
  }
  return tiles;
}

exports.home = async (req, res) => {
  const live = await loadLiveStats();
  res.render('public/home', {
    pageTitle: null,
    premium: premiumCopy(premiumStatus),
    tiles: buildTiles(live),
  });
};

exports.about = (req, res) => res.render('public/about', { pageTitle: 'About' });
