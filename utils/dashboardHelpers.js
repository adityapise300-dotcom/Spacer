// Small pure helpers shared by the two dashboard controllers.
// (A new file, so no existing helper or service is changed.)

const HOUR = 36e5;

/** 8100000 ms -> "2 h 15 m". Never returns an empty string. */
function humanDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return 'less than a minute';
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m ? `${h} h ${m} m` : `${h} h`;
  return `${m} m`;
}

const toMin = (s) => {
  const [h, m] = String(s || '00:00').split(':').map(Number);
  return h * 60 + m;
};

/**
 * Is the zone inside its opening hours at `now`?
 * Mirrors availabilityService: "00:00" / "23:59" as a close time means "until midnight",
 * and a booking day cannot cross midnight (so there is no overnight case).
 * The process runs in IST (see app.js), so getHours() is Pune time.
 */
function isOpenNow(zone, now = new Date()) {
  const open = toMin(zone.openTime);
  let close = toMin(zone.closeTime);
  if (close === 0 || close >= 1439) close = 1440;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= open && cur < close;
}

// Zone category -> label + colour modifier used by .db-cat--<tone>
const CATEGORY = {
  office: { label: 'Office', tone: 'office' },
  mall: { label: 'Mall', tone: 'mall' },
  market: { label: 'Market', tone: 'market' },
  transit: { label: 'Transit', tone: 'transit' },
  residential: { label: 'Residential', tone: 'residential' },
  other: { label: 'Parking', tone: 'other' },
};
const categoryOf = (c) => CATEGORY[c] || CATEGORY.other;

// Booking status -> Bootstrap Icons class (timeline dots / list rows)
const STATUS_ICON = {
  pending_payment: 'bi-hourglass-split',
  confirmed: 'bi-check-circle-fill',
  checked_in: 'bi-car-front-fill',
  completed: 'bi-flag-fill',
  cancelled: 'bi-x-circle-fill',
  expired: 'bi-clock-history',
  no_show: 'bi-person-x-fill',
};
const statusIcon = (s) => STATUS_ICON[s] || 'bi-circle-fill';

const AMENITY_ICON = {
  CCTV: 'bi-camera-video',
  Covered: 'bi-umbrella',
  'EV charging': 'bi-ev-station',
  Security: 'bi-shield-check',
};
const amenityIcon = (a) => AMENITY_ICON[a] || 'bi-check2-circle';

module.exports = { HOUR, humanDuration, isOpenNow, categoryOf, statusIcon, amenityIcon };
