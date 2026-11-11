/* Shared helpers for the strategy labs: data decoding and small numeric utilities.
 * Runs in the browser (window.QF) and in Node tests (module.exports). */
(function (root) {
  'use strict';
  const QF = (root.QF = root.QF || {});

  const DAYS = ['-2', '-1', '0'];
  const cache = new Map();

  /** Decode a delta-encoded array of doubled prices into real prices. */
  function decodePrices(deltas) {
    const out = new Float64Array(deltas.length);
    let acc = 0;
    for (let i = 0; i < deltas.length; i++) {
      acc += deltas[i];
      out[i] = acc / 2;
    }
    return out;
  }

  function rawDay(day) {
    const data = root.labData;
    if (!data || !data.days[day]) throw new Error(`Lab data for day ${day} is not loaded`);
    return data.days[day];
  }

  function memo(key, build) {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  }

  /** Best-level book for one product: bid, ask, mid, volumes and market prints. */
  function book(day, product) {
    return memo(`${day}:${product}`, () => {
      const raw = rawDay(day)[product];
      const bid = decodePrices(raw.bid);
      const ask = decodePrices(raw.ask);
      const mid = bid.map((b, i) => (b + ask[i]) / 2);
      const trades = (raw.trades || []).map(([tick, price2, qty]) => ({ tick, price: price2 / 2, qty }));
      return { bid, ask, mid, bidVol: raw.bidVol, askVol: raw.askVol, trades };
    });
  }

  function pearlSum(day) {
    return memo(`${day}:pearlSum`, () => decodePrices(rawDay(day).pink.sum));
  }

  function goldenMid(day) {
    return memo(`${day}:golden`, () => decodePrices(rawDay(day).golden));
  }

  /** Voucher snapshots: LYCHEE mid and one mid series per strike, sampled every `every` ticks. */
  function vouchers(day) {
    return memo(`${day}:vouchers`, () => {
      const raw = rawDay(day).vouchers;
      return {
        every: raw.every,
        strikes: root.labData.strikes,
        lychee: decodePrices(raw.lychee),
        mids: raw.mids.map(decodePrices),
      };
    });
  }

  const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  const ewmaAlpha = (span) => 2 / (span + 1);

  function mean(values) {
    let s = 0;
    for (const v of values) s += v;
    return values.length ? s / values.length : 0;
  }

  function sd(values) {
    const m = mean(values);
    let s = 0;
    for (const v of values) s += (v - m) * (v - m);
    return values.length > 1 ? Math.sqrt(s / (values.length - 1)) : 0;
  }

  /** Deterministic PRNG (mulberry32) so simulated paths are reproducible. */
  function rng(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(next) {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  }

  /** Log-gamma (Lanczos), used for Beta-function weights in the S4 posterior. */
  function logGamma(x) {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  const logBeta = (a, b) => logGamma(a) + logGamma(b) - logGamma(a + b);

  Object.assign(QF, {
    DAYS, book, pearlSum, goldenMid, vouchers,
    clip, sign, ewmaAlpha, mean, sd, rng, gaussian, logGamma, logBeta,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = QF;
})(typeof window !== 'undefined' ? window : globalThis);
