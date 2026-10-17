const TZ = 'Asia/Kolkata';
const { VEHICLE_LABELS, VEHICLE_ICONS } = require('./constants');

const pad = (n) => String(n).padStart(2, '0');

const currency = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const dateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '—';

const dateOnly = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const timeOnly = (d) =>
  d ? new Date(d).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

// "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> (process runs in IST)
const toInputValue = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

// Parses a datetime-local string as local (IST) time. Returns null if invalid.
const parseLocal = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d.getTime()) ? null : d;
};

// "YYYY-MM-DD" -> Date at local midnight (or null)
const parseLocalDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
};

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 36e5;

const STATUS_CLASS = {
  pending_payment: 'warning', confirmed: 'success', checked_in: 'primary', completed: 'secondary',
  cancelled: 'danger', expired: 'dark', no_show: 'danger',
};
const statusClass = (s) => STATUS_CLASS[s] || 'secondary';
const statusLabel = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabel = (h) => {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 === 0 ? 12 : hh % 12} ${suffix}`;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Great-circle distance in km
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// ---- Google Maps deep links (Maps URLs: https://developers.google.com/maps/documentation/urls/get-started) ----
// These are plain links, so NO API key, billing or JavaScript SDK is needed.
// "origin" is left out on purpose: Google Maps then starts from the driver's current location.
// Maps cannot route to an individual bay, so directions always go to the zone entrance (zone.location);
// the slot label is shown beside the button instead.
const hasCoords = (zone) =>
  Boolean(zone && zone.location && Array.isArray(zone.location.coordinates) && zone.location.coordinates.length === 2);

const mapsDirectionsUrl = (zone, { mode = 'driving', navigate = false } = {}) => {
  if (!hasCoords(zone)) return null;
  const [lng, lat] = zone.location.coordinates; // GeoJSON order is [longitude, latitude]
  const params = new URLSearchParams({ api: '1', destination: `${lat},${lng}`, travelmode: mode });
  if (navigate) params.set('dir_action', 'navigate'); // on phones, starts turn-by-turn straight away
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

module.exports = {
  TZ, currency, dateTime, dateOnly, timeOnly, toInputValue, parseLocal, parseLocalDate, hoursBetween,
  statusClass, statusLabel, DAYS, hourLabel, escapeRegex, distanceKm, hasCoords, mapsDirectionsUrl,
  vehicleLabel: (t) => VEHICLE_LABELS[t] || t,
  vehicleIcon: (t) => VEHICLE_ICONS[t] || 'bi-car-front',
};
