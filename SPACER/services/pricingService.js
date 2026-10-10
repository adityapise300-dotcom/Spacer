/**
 * DYNAMIC PRICING
 * price/hour = basePrice x demandMultiplier x timeMultiplier x occupancyMultiplier
 * Every factor is clamped, and the overall multiplier is clamped to 0.8x - 2.0x of base.
 * The result carries a breakdown that is shown to the driver as "Why this price?".
 */
const forecast = require('./forecastService');
const availability = require('./availabilityService');

const HOUR = 36e5;
const OVERALL = { min: 0.8, max: 2.0 };

// ---- Configurable rules (edit freely) ----
const PEAK_HOURS = { weekday: [[8, 11], [17, 21]], weekend: [[11, 21]] };
// "YYYY-MM-DD" for one-off dates, "MM-DD" for dates that repeat every year
const FESTIVAL_DATES = ['2026-10-20', '2026-11-08', '2026-12-25', '01-01', '01-26', '08-15', '2027-01-26'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

function isFestival(d) {
  const full = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return FESTIVAL_DATES.includes(full) || FESTIVAL_DATES.includes(full.slice(5));
}

function timeMultiplier(date) {
  const dow = date.getDay();
  const h = date.getHours();
  const weekend = dow === 0 || dow === 6;
  const ranges = weekend ? PEAK_HOURS.weekend : PEAK_HOURS.weekday;
  const reasons = [];
  let m = 1;
  if (ranges.some(([a, b]) => h >= a && h < b)) { m *= 1.15; reasons.push('peak hours'); }
  if (h >= 23 || h < 6) { m *= 0.9; reasons.push('late night'); }
  if (weekend) { m *= 1.05; reasons.push('weekend'); }
  if (isFestival(date)) { m *= 1.2; reasons.push('festival day'); }
  return { value: clamp(m, 0.85, 1.5), reasons };
}

// 0% booked -> 0.95x, 100% booked -> 1.40x
const occupancyMultiplier = (ratio) => clamp(0.95 + 0.45 * ratio, 0.95, 1.4);
// forecast 0% -> 0.90x, 100% -> 1.40x; no history -> neutral 1.0x
const demandMultiplier = (p) => (p === null || p === undefined ? 1 : clamp(0.9 + 0.5 * p, 0.9, 1.4));

async function quote(zone, start, end) {
  const base = zone.basePricePerHour;
  const [ratio, series] = await Promise.all([
    availability.occupancyRatio(zone._id, start, end),
    forecast.getSeries(zone),
  ]);
  const occ = occupancyMultiplier(ratio);

  let total = 0, hours = 0, wTime = 0, wDemand = 0, wPred = 0, wPredHours = 0;
  const timeReasons = new Set();

  // Price hour by hour so a booking that crosses from off-peak into peak is priced fairly.
  for (let cursor = +start; cursor < +end; cursor += HOUR) {
    const frac = Math.min(HOUR, +end - cursor) / HOUR;
    const when = new Date(cursor);
    const tm = timeMultiplier(when);
    const p = forecast.predictAt(series, forecast.hourStart(cursor));
    const dm = demandMultiplier(p);
    const seg = clamp(tm.value * dm * occ, OVERALL.min, OVERALL.max);

    total += base * seg * frac;
    hours += frac;
    wTime += tm.value * frac;
    wDemand += dm * frac;
    if (p !== null) { wPred += p * frac; wPredHours += frac; }
    tm.reasons.forEach((r) => timeReasons.add(r));
  }

  const timeM = r2(wTime / hours);
  const demandM = r2(wDemand / hours);
  const expected = wPredHours ? wPred / wPredHours : null;
  const roundedTotal = Math.round(total);

  return {
    basePricePerHour: base,
    hours: r2(hours),
    timeMultiplier: timeM,
    demandMultiplier: demandM,
    occupancyMultiplier: r2(occ),
    occupancyRatio: r2(ratio),
    expectedOccupancy: expected === null ? null : r2(expected),
    finalMultiplier: r2(roundedTotal / (base * hours)),
    pricePerHour: r2(roundedTotal / hours),
    total: roundedTotal,
    lines: [
      { label: 'Base rate', multiplier: null, note: `₹${base} per hour set by the owner` },
      { label: 'Time of day', multiplier: timeM, note: timeReasons.size ? [...timeReasons].join(', ') : 'regular hours' },
      {
        label: 'Expected demand', multiplier: demandM,
        note: expected === null ? 'not enough booking history yet' : `forecast ${Math.round(expected * 100)}% full at this time`,
      },
      {
        label: 'Current bookings', multiplier: r2(occ),
        note: `${Math.round(ratio * 100)}% of slots already reserved for this window`,
      },
    ],
  };
}

module.exports = { quote, timeMultiplier, occupancyMultiplier, demandMultiplier, FESTIVAL_DATES, PEAK_HOURS, OVERALL };
