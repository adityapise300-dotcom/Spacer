/**
 * DEMAND FORECAST
 * ---------------
 * Occupancy of a zone in a given clock hour = (slot-hours booked) / (slots in the zone), 0..1.
 *
 * Forecast for (weekday, hour) = weighted moving average of the SAME weekday-hour in the previous
 * WEEKS weeks, with weights decaying by DECAY per week back (recent weeks matter more). This is
 * equivalent to simple exponential smoothing across weekly observations.
 *
 * Baseline (to beat) = naive "same hour yesterday".
 *
 * Evaluation is out-of-sample: the forecast for hour t only uses data from t-7d and earlier.
 * Assumption: India has no daylight-saving shifts, so "t - k weeks" is always the same clock hour.
 */
const Booking = require('../models/Booking');
const Slot = require('../models/Slot');
const { HELD_STATUSES } = require('../utils/constants');
const { openHourRange } = require('./availabilityService');
const { DAYS, hourLabel } = require('../utils/helpers');

const HOUR = 36e5;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const WEEKS = 8;
const DECAY = 0.8;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const hourStart = (ms) => {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/** Pure: bookings [{startTime,endTime}] -> Map(hourStartMs -> occupancy 0..1) */
function buildSeries(bookings, totalSlots) {
  const map = new Map();
  if (!totalSlots) return map;
  for (const b of bookings) {
    const s = +new Date(b.startTime);
    const e = +new Date(b.endTime);
    for (let t = hourStart(s); t < e; t += HOUR) {
      const overlap = Math.min(e, t + HOUR) - Math.max(s, t);
      if (overlap > 0) map.set(t, (map.get(t) || 0) + overlap / HOUR / totalSlots);
    }
  }
  for (const [k, v] of map) map.set(k, Math.min(1, v));
  return map;
}

/** series = { map, historyStart, nowHour, totalSlots } */
function makeSeries(bookings, totalSlots, nowMs = Date.now()) {
  const nowHour = hourStart(nowMs);
  const map = buildSeries(bookings, totalSlots);
  let historyStart = null;
  for (const b of bookings) {
    const s = hourStart(+new Date(b.startTime));
    if (historyStart === null || s < historyStart) historyStart = s;
  }
  return { map, historyStart, nowHour, totalSlots };
}

// Observed value for an hour; hours with no booking inside the history window count as 0.
function observed(series, ms) {
  if (series.historyStart === null || ms < series.historyStart || ms >= series.nowHour) return undefined;
  return series.map.get(ms) || 0;
}

function wmaForecast(series, t) {
  let num = 0;
  let den = 0;
  for (let k = 1; k <= WEEKS; k++) {
    const v = observed(series, t - k * WEEK);
    if (v === undefined) continue;
    const w = Math.pow(DECAY, k - 1);
    num += w * v;
    den += w;
  }
  return den ? num / den : null;
}

const naiveForecast = (series, t) => {
  const v = observed(series, t - DAY);
  return v === undefined ? null : v;
};

/** Predicted occupancy at any time; future targets are folded back into the next 7 days. */
function predictAt(series, t) {
  let target = t;
  if (target >= series.nowHour) target -= Math.floor((target - series.nowHour) / WEEK) * WEEK;
  return wmaForecast(series, target);
}

/** Pure evaluation over a list of hour timestamps. Used by the page AND seeds/simulate.js */
function evaluateHours(series, hours) {
  const rows = [];
  let n = 0, ae = 0, aeB = 0, ape = 0, apeB = 0, nApe = 0;
  for (const t of hours) {
    const actual = observed(series, t);
    const pred = wmaForecast(series, t);
    const base = naiveForecast(series, t);
    rows.push({ t, actual: actual === undefined ? null : actual, pred, base });
    if (actual === undefined || pred === null || base === null) continue;
    n++;
    ae += Math.abs(actual - pred);
    aeB += Math.abs(actual - base);
    if (actual >= 0.05) { // MAPE is only meaningful when actual is not ~0
      nApe++;
      ape += Math.abs(actual - pred) / actual;
      apeB += Math.abs(actual - base) / actual;
    }
  }
  const mae = n ? ae / n : null;
  const baseMae = n ? aeB / n : null;
  return {
    rows,
    metrics: {
      n,
      mae: mae === null ? null : mae * 100, // percentage points of occupancy
      baselineMae: baseMae === null ? null : baseMae * 100,
      mape: nApe ? (ape / nApe) * 100 : null,
      baselineMape: nApe ? (apeB / nApe) * 100 : null,
      improvementPct: mae !== null && baseMae > 0 ? ((baseMae - mae) / baseMae) * 100 : null,
    },
  };
}

function lastWeekHours(series, zone) {
  const { openH, closeH } = openHourRange(zone);
  const hours = [];
  for (let t = series.nowHour - WEEK; t < series.nowHour; t += HOUR) {
    const h = new Date(t).getHours();
    if (h >= openH && h < closeH) hours.push(t);
  }
  return hours;
}

async function getSeries(zone) {
  const key = String(zone._id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.series;

  const nowHour = hourStart(Date.now());
  const from = new Date(nowHour - (WEEKS + 2) * WEEK);
  const [bookings, totalSlots] = await Promise.all([
    Booking.find({
      zone: zone._id, status: { $in: HELD_STATUSES },
      startTime: { $lt: new Date(nowHour) }, endTime: { $gt: from },
    }).select('startTime endTime').lean(),
    Slot.countDocuments({ zone: zone._id, status: 'available' }),
  ]);
  const series = makeSeries(bookings, totalSlots);
  cache.set(key, { at: Date.now(), series });
  return series;
}

/** 7 (Sun..Sat) x 24 matrix of predicted occupancy for the coming week */
function weeklyProfile(series) {
  const m = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (let i = 0; i < 168; i++) {
    const t = series.nowHour + i * HOUR;
    const d = new Date(t);
    m[d.getDay()][d.getHours()] = predictAt(series, t);
  }
  return m;
}

function raisePct(p) { return p >= 0.9 ? 25 : p >= 0.85 ? 20 : p >= 0.8 ? 15 : p >= 0.75 ? 10 : 0; }
function cutPct(p) { return p <= 0.15 ? 15 : p <= 0.25 ? 10 : 0; }

/** Turns the predicted profile into plain-language price suggestions for the owner. */
function suggestPrices(profile, zone) {
  const { openH, closeH } = openHourRange(zone);
  const out = [];
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    let run = null;
    const flush = () => {
      if (run && run.hours.length >= 2) {
        const avg = run.hours.reduce((a, b) => a + b.p, 0) / run.hours.length;
        const pct = Math.round(run.hours.reduce((a, b) => a + b.pct, 0) / run.hours.length / 5) * 5;
        out.push({
          day: DAYS[dow], action: run.action, pct, avgOccupancy: Math.round(avg * 100),
          from: hourLabel(run.hours[0].h), to: hourLabel(run.hours[run.hours.length - 1].h + 1),
        });
      }
      run = null;
    };
    for (let h = openH; h < closeH; h++) {
      const p = profile[dow][h];
      let action = null, pct = 0;
      if (p !== null) {
        if (raisePct(p)) { action = 'raise'; pct = raisePct(p); }
        else if (cutPct(p)) { action = 'cut'; pct = cutPct(p); }
      }
      if (!action) { flush(); continue; }
      if (run && run.action !== action) flush();
      if (!run) run = { action, hours: [] };
      run.hours.push({ h, p, pct });
    }
    flush();
  }
  const raises = out.filter((s) => s.action === 'raise').sort((a, b) => b.avgOccupancy - a.avgOccupancy);
  const cuts = out.filter((s) => s.action === 'cut').sort((a, b) => a.avgOccupancy - b.avgOccupancy);
  return [...raises.slice(0, 5), ...cuts.slice(0, 3)];
}

async function report(zone) {
  const series = await getSeries(zone);
  if (series.historyStart === null) return { hasData: false };
  const { rows, metrics } = evaluateHours(series, lastWeekHours(series, zone));
  const pct = (v) => (v === null ? null : Math.round(v * 1000) / 10);
  const fmtLabel = (t) => { const d = new Date(t); return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:00`; };
  const profile = weeklyProfile(series);
  return {
    hasData: true,
    historyDays: Math.round((series.nowHour - series.historyStart) / DAY),
    metrics,
    chart: {
      labels: rows.map((r) => fmtLabel(r.t)),
      actual: rows.map((r) => pct(r.actual)),
      predicted: rows.map((r) => pct(r.pred)),
      baseline: rows.map((r) => pct(r.base)),
    },
    profile,
    suggestions: suggestPrices(profile, zone),
  };
}

module.exports = {
  WEEKS, DECAY, HOUR, DAY, WEEK, hourStart, buildSeries, makeSeries, observed, wmaForecast, naiveForecast,
  predictAt, evaluateHours, getSeries, weeklyProfile, suggestPrices, report,
};
