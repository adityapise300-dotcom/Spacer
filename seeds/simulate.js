/**
 * SIMULATION FOR THE COMPETITION POSTER   (npm run simulate)
 *
 * 1. Generates 8 weeks of SYNTHETIC booking history per zone (weekday office peaks, weekend mall peaks,
 *    random noise, a few event days) using a seeded random generator, so results are reproducible.
 * 2. Holds out the final week as the test set and evaluates the demand forecast against the naive
 *    "same hour yesterday" baseline (MAE and MAPE).
 * 3. Simulates average search-and-park time with and without SPACER.
 * 4. Saves the synthetic bookings to MongoDB (so the Insights page has data) unless --no-save is passed.
 *
 * Everything here is simulated and indicative, NOT field-measured.
 * Options: --no-save   --seed=123
 */
process.env.TZ = 'Asia/Kolkata';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const ParkingZone = require('../models/ParkingZone');
const Slot = require('../models/Slot');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const forecast = require('../services/forecastService');
const { openHourRange } = require('../services/availabilityService');

const HOUR = 36e5;
const DAY = 24 * HOUR;
const WEEKS_TOTAL = 8;
const SAVE = !process.argv.includes('--no-save');
const SEED = parseInt((process.argv.find((a) => a.startsWith('--seed=')) || '--seed=42').split('=')[1], 10);

// ---- Assumptions for the search-time model (documented in the README) ----
const TRIPS_PER_ZONE = 2000;
const BASELINE_SEARCH_MIN = [8, 15];   // circling for street/lot parking without SPACER
const SPACER_FIND_MIN = [1, 3];        // walking to a pre-assigned, held bay
const SPACER_FALLBACK_RATE = 0.05;     // 5% of trips fall back to circling (late arrival, blocked bay...)

// ---- Seeded PRNG so every run gives the same numbers ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
function poisson(lambda) {
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian()));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

// Target occupancy (0..1) by area type, weekday and hour: the "true" demand pattern behind the noise
function targetOccupancy(category, dow, h) {
  const wk = dow >= 1 && dow <= 5;
  switch (category) {
    case 'office':
      if (!wk) return h >= 10 && h < 18 ? 0.12 : 0.05;
      return h < 7 ? 0.05 : h < 9 ? 0.55 : h < 11 ? 0.85 : h < 17 ? 0.8 : h < 19 ? 0.5 : 0.1;
    case 'mall':
      if (wk) return h < 11 ? 0.1 : h < 17 ? 0.3 : h < 21 ? 0.55 : 0.3;
      return h < 11 ? 0.2 : h < 14 ? 0.6 : h < 18 ? 0.75 : h < 22 ? 0.9 : 0.5;
    case 'market':
      if (wk) return h < 11 ? 0.15 : h < 15 ? 0.5 : h < 18 ? 0.4 : h < 22 ? 0.8 : 0.3;
      return h < 11 ? 0.2 : h < 18 ? 0.6 : h < 23 ? 0.9 : 0.4;
    case 'transit':
      if (wk) return h < 6 ? 0.3 : h < 10 ? 0.8 : h < 17 ? 0.5 : h < 21 ? 0.8 : 0.4;
      return 0.45;
    case 'residential':
      if (wk) return h >= 20 || h < 7 ? 0.75 : 0.3;
      return 0.5;
    default:
      return 0.4;
  }
}

const DURATIONS = {
  office: [6, 8, 9, 9, 10], transit: [3, 6, 10, 12], residential: [2, 4, 8, 10], default: [1, 2, 2, 3, 3, 4],
};
const TYPE_WEIGHTS = { car: 0.55, bike: 0.25, suv: 0.1, ev: 0.1 };

function weightedType(types) {
  const total = types.reduce((a, t) => a + TYPE_WEIGHTS[t], 0);
  let r = rand() * total;
  for (const t of types) { r -= TYPE_WEIGHTS[t]; if (r <= 0) return t; }
  return types[0];
}

function generateZoneHistory(zone, slots, nowHour) {
  const { openH, closeH } = openHourRange(zone);
  const popularity = between(0.85, 1.15);
  const start0 = nowHour - WEEKS_TOTAL * 7 * DAY;
  const slotsByType = {};
  slots.forEach((s) => { (slotsByType[s.vehicleType] = slotsByType[s.vehicleType] || []).push({ slot: s, busy: [] }); });
  const types = Object.keys(slotsByType);
  const durations = DURATIONS[zone.category] || DURATIONS.default;
  const meanDur = durations.reduce((a, b) => a + b, 0) / durations.length;

  // A few event days with extra evening demand
  const eventDays = new Set();
  for (let i = 0; i < 4; i++) eventDays.add(Math.floor(rand() * WEEKS_TOTAL * 7));

  const bookings = [];
  for (let t = start0; t < nowHour; t += HOUR) {
    const d = new Date(t);
    const h = d.getHours();
    if (h < openH || h >= closeH) continue;
    const dayIndex = Math.floor((t - start0) / DAY);
    let target = targetOccupancy(zone.category, d.getDay(), h) * popularity * Math.exp(0.15 * gaussian());
    if (eventDays.has(dayIndex) && h >= 17 && h < 22) target *= 1.3;
    const arrivals = poisson(Math.max(0, (target * slots.length) / meanDur));

    for (let a = 0; a < arrivals; a++) {
      const type = weightedType(types);
      const start = t + Math.floor(rand() * 4) * 15 * 60000;
      let hours = pick(durations);
      const dayClose = new Date(d.getFullYear(), d.getMonth(), d.getDate(), closeH).getTime(); // closeH 24 -> next midnight
      let end = start + hours * HOUR;
      if (end > dayClose) end = dayClose;
      if (end > nowHour) end = nowHour;
      hours = (end - start) / HOUR;
      if (hours < 1) continue;
      const free = slotsByType[type].find((s) => !s.busy.some(([bs, be]) => bs < end && be > start));
      if (!free) continue; // zone is full: the driver is turned away
      free.busy.push([start, end]);
      bookings.push({ slot: free.slot, type, start, end, hours, target });
    }
  }
  return bookings;
}

const fmt1 = (x) => (x === null || x === undefined ? 'n/a' : x.toFixed(1));

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI missing. Copy .env.example to .env first.');
  await mongoose.connect(process.env.MONGO_URI);

  const [zones, drivers] = await Promise.all([ParkingZone.find().lean(), User.find({ role: 'user' }).lean()]);
  if (!zones.length || !drivers.length) throw new Error('No zones or drivers found. Run `npm run seed` first.');

  const nowHour = forecast.hourStart(Date.now());
  console.log(`\nSPACER simulation  (seed ${SEED}, ${WEEKS_TOTAL} weeks of synthetic history, last week held out for testing)\n`);

  if (SAVE) {
    const old = await Booking.find({ isSimulated: true }).select('_id').lean();
    const ids = old.map((b) => b._id);
    for (let i = 0; i < ids.length; i += 5000) await Transaction.deleteMany({ booking: { $in: ids.slice(i, i + 5000) } });
    await Booking.deleteMany({ isSimulated: true });
  }

  const evalRows = [];
  const searchRows = [];
  let refCounter = 0;

  for (const zone of zones) {
    const slots = await Slot.find({ zone: zone._id, status: 'available' }).lean();
    if (!slots.length) continue;
    const history = generateZoneHistory(zone, slots, nowHour);

    // ---- Forecast evaluation on the held-out final week ----
    const series = forecast.makeSeries(history.map((b) => ({ startTime: b.start, endTime: b.end })), slots.length, nowHour);
    const { openH, closeH } = openHourRange(zone);
    const testHours = [];
    for (let t = nowHour - 7 * DAY; t < nowHour; t += HOUR) {
      const h = new Date(t).getHours();
      if (h >= openH && h < closeH) testHours.push(t);
    }
    const { metrics: m } = forecast.evaluateHours(series, testHours);
    evalRows.push({
      Zone: zone.name, Type: zone.category, Bookings: history.length,
      'MAE (pts)': +fmt1(m.mae), 'Baseline MAE': +fmt1(m.baselineMae),
      'Error cut %': +fmt1(m.improvementPct), 'MAPE %': +fmt1(m.mape), 'Baseline MAPE %': +fmt1(m.baselineMape),
    });

    // ---- Search-and-park time ----
    let base = 0, withSpacer = 0;
    for (let i = 0; i < TRIPS_PER_ZONE; i++) {
      const circling = between(...BASELINE_SEARCH_MIN);
      base += circling;
      withSpacer += rand() < SPACER_FALLBACK_RATE ? between(...BASELINE_SEARCH_MIN) : between(...SPACER_FIND_MIN);
    }
    searchRows.push({ Zone: zone.name, 'Without SPACER (min)': +(base / TRIPS_PER_ZONE).toFixed(1), 'With SPACER (min)': +(withSpacer / TRIPS_PER_ZONE).toFixed(1) });

    // ---- Save synthetic bookings ----
    if (SAVE) {
      const docs = history.map((b) => {
        const user = pick(drivers);
        const plate = (user.vehicles && user.vehicles[0] && user.vehicles[0].plateNumber) || 'MH12SM' + String(1000 + Math.floor(rand() * 8999));
        const total = Math.round(zone.basePricePerHour * b.hours * (0.9 + 0.5 * Math.min(1, b.target)));
        return {
          user: user._id, zone: zone._id, slot: b.slot._id, slotLabel: b.slot.label, vehiclePlate: plate, vehicleType: b.type,
          startTime: new Date(b.start), endTime: new Date(b.end), durationHours: b.hours,
          pricePerHourApplied: Math.round(total / b.hours), totalAmount: total,
          status: rand() < 0.96 ? 'completed' : 'no_show', isSimulated: true,
          createdAt: new Date(b.start - between(1, 48) * HOUR),
        };
      });
      for (let i = 0; i < docs.length; i += 1000) {
        const created = await Booking.insertMany(docs.slice(i, i + 1000), { ordered: false });
        await Transaction.insertMany(created.map((bk) => ({
          booking: bk._id, user: bk.user, zone: zone._id, owner: zone.owner, amount: bk.totalAmount,
          method: pick(['upi', 'upi', 'card', 'wallet']), status: 'success',
          referenceId: `SIM-${Date.now().toString(36).toUpperCase()}-${++refCounter}`,
          paidAt: new Date(+bk.startTime - HOUR),
        })), { ordered: false });
      }
    }
  }

  // ---- Print results ----
  const avg = (rows, key) => rows.reduce((a, r) => a + r[key], 0) / rows.length;
  evalRows.push({
    Zone: 'AVERAGE', Type: '', Bookings: Math.round(avg(evalRows, 'Bookings')),
    'MAE (pts)': +avg(evalRows, 'MAE (pts)').toFixed(1), 'Baseline MAE': +avg(evalRows, 'Baseline MAE').toFixed(1),
    'Error cut %': +avg(evalRows, 'Error cut %').toFixed(1), 'MAPE %': +avg(evalRows, 'MAPE %').toFixed(1),
    'Baseline MAPE %': +avg(evalRows, 'Baseline MAPE %').toFixed(1),
  });
  console.log('1) DEMAND FORECAST ACCURACY on the held-out final week');
  console.log('   Forecast = weighted moving average of the same weekday-hour over previous weeks (decay 0.8).');
  console.log('   Baseline = same hour yesterday. "pts" = percentage points of occupancy. Lower is better.\n');
  console.table(evalRows);

  const bAvg = avg(searchRows, 'Without SPACER (min)');
  const sAvg = avg(searchRows, 'With SPACER (min)');
  searchRows.push({ Zone: 'AVERAGE', 'Without SPACER (min)': +bAvg.toFixed(1), 'With SPACER (min)': +sAvg.toFixed(1) });
  console.log('\n2) AVERAGE SEARCH-AND-PARK TIME (simulated trips)');
  console.log(`   Assumptions: without SPACER a driver circles ${BASELINE_SEARCH_MIN[0]}-${BASELINE_SEARCH_MIN[1]} min (uniform);`);
  console.log(`   with SPACER the driver walks to a held bay in ${SPACER_FIND_MIN[0]}-${SPACER_FIND_MIN[1]} min, and ${SPACER_FALLBACK_RATE * 100}% of trips fall back to circling.`);
  console.log(`   ${TRIPS_PER_ZONE} trips per zone.\n`);
  console.table(searchRows);
  console.log(`\n   Average time saved per trip: ${(bAvg - sAvg).toFixed(1)} min (${(((bAvg - sAvg) / bAvg) * 100).toFixed(0)}% less)`);
  console.log('\nNOTE: all numbers above come from SIMULATED data and documented assumptions. They are indicative, not field-measured.');
  console.log(SAVE ? '\nSynthetic bookings were saved (isSimulated: true). Open the owner Insights page to see the chart.' : '\nRun without --no-save to store the data so the Insights page can use it.');
}

if (require.main === module) {
  run()
    .catch((e) => { console.error('Simulation failed:', e.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}

module.exports = { generateZoneHistory, targetOccupancy };
