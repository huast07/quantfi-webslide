/* S3 model: LYCHEE voucher smile fit, price-space residuals and the VoucherRV rule
 * v = F + rho * r (Trading_Algorithm/strategies/S3/NOTES.md). */
(function (root) {
  'use strict';
  const QF = root.QF;

  // Days to expiry at each real day's open (the EDA convention); day 1 opens at 5.
  const T_AT_OPEN = Object.freeze({ '-2': 8, '-1': 7, '0': 6 });
  const DEFAULTS = Object.freeze({ horizon: 120, takeEdge: 1.5, riskAversion: 0.35, halfSpread: 1.5, limit: 50 });
  const NEWTON_STEPS = 30;

  function normCdf(x) {
    // Abramowitz-Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf = 1 - poly * Math.exp(-z * z);
    return 0.5 * (1 + (x >= 0 ? erf : -erf));
  }
  const normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  /** Black-Scholes call (zero rate) with sigma per sqrt(day) and T in days. */
  function bs(S, K, T, sigma) {
    const st = sigma * Math.sqrt(T);
    const d1 = (Math.log(S / K) + 0.5 * st * st) / st;
    const d2 = d1 - st;
    return { price: S * normCdf(d1) - K * normCdf(d2), delta: normCdf(d1), vega: S * normPdf(d1) * Math.sqrt(T) };
  }

  /** Implied volatility by Newton's method, falling back to bisection when vega is tiny. */
  function impliedVol(price, S, K, T) {
    const intrinsic = Math.max(S - K, 0);
    if (!(price > intrinsic) || price >= S) return NaN;
    let lo = 1e-4;
    let hi = 0.5;
    let sigma = 0.02;
    for (let i = 0; i < NEWTON_STEPS; i++) {
      const { price: model, vega } = bs(S, K, T, sigma);
      const err = model - price;
      if (Math.abs(err) < 1e-6) return sigma;
      if (err > 0) hi = sigma;
      else lo = sigma;
      const step = vega > 1e-8 ? sigma - err / vega : NaN;
      sigma = step > lo && step < hi ? step : (lo + hi) / 2;
    }
    return sigma;
  }

  /** Weighted least squares fit iv = a + b m + c m^2 (3x3 normal equations, Cramer's rule). */
  function fitQuadratic(points) {
    const s = new Array(5).fill(0);
    const t = new Array(3).fill(0);
    for (const { m, iv, w } of points) {
      for (let k = 0; k < 5; k++) s[k] += w * Math.pow(m, k);
      for (let k = 0; k < 3; k++) t[k] += w * iv * Math.pow(m, k);
    }
    const A = [[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]];
    const det3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
      - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det3(A);
    if (Math.abs(D) < 1e-18) return null;
    const solve = (col) => det3(A.map((row, i) => row.map((v, j) => (j === col ? t[i] : v)))) / D;
    return { a: solve(0), b: solve(1), c: solve(2) };
  }

  /** One snapshot of the surface: IVs, the vega^2-weighted smile and price residuals. */
  function snapshot(day, index) {
    const v = QF.vouchers(day);
    const S = v.lychee[index];
    const T = T_AT_OPEN[day] - (index * v.every) / 10000;
    const rows = v.strikes.map((K, i) => {
      const mid = v.mids[i][index];
      const iv = impliedVol(mid, S, K, T);
      const m = Math.log(K / S) / Math.sqrt(T);
      const vega = Number.isFinite(iv) ? bs(S, K, T, iv).vega : 0;
      return { K, mid, iv, m, w: vega * vega };
    });
    const fit = fitQuadratic(rows.filter((r) => Number.isFinite(r.iv) && r.w > 0));
    const smileIv = (m) => (fit ? fit.a + fit.b * m + fit.c * m * m : NaN);
    for (const r of rows) {
      r.fitIv = smileIv(r.m);
      const model = bs(S, r.K, T, r.fitIv);
      r.fair = model.price;
      r.delta = model.delta;
      r.resid = r.mid - r.fair;
    }
    return { S, T, fit, rows, smileIv };
  }

  const residualCache = new Map();

  /** Residual series for every strike across one day (one value per snapshot), memoised per day. */
  function residuals(day) {
    if (!residualCache.has(day)) residualCache.set(day, computeResiduals(day));
    return residualCache.get(day);
  }

  function computeResiduals(day) {
    const v = QF.vouchers(day);
    const count = v.lychee.length;
    const series = v.strikes.map(() => new Float64Array(count));
    const fair = v.strikes.map(() => new Float64Array(count));
    const delta = v.strikes.map(() => new Float64Array(count));
    for (let k = 0; k < count; k++) {
      snapshot(day, k).rows.forEach((r, i) => {
        series[i][k] = r.resid;
        fair[i][k] = r.fair;
        delta[i][k] = r.delta;
      });
    }
    return { every: v.every, strikes: v.strikes, lychee: v.lychee, mids: v.mids, series, fair, delta };
  }

  /** Per-strike residual sd and per-tick AR(1) phi, estimated from the sampled series. */
  function residualStats(res) {
    return res.series.map((x) => {
      const m = QF.mean(x);
      let num = 0;
      let den = 0;
      for (let k = 1; k < x.length; k++) {
        num += (x[k] - m) * (x[k - 1] - m);
        den += (x[k - 1] - m) * (x[k - 1] - m);
      }
      const phiSample = QF.clip(num / den, 0.01, 0.9999);
      return { sd: QF.sd(x), phiTick: Math.pow(phiSample, 1 / res.every) };
    });
  }

  /** VoucherRV replay for one strike: reservation curve v(q) = v - slope q, delta-hedged with LYCHEE. */
  function replay(day, strikeIndex, overrides = {}) {
    const p = { ...DEFAULTS, ...overrides };
    const res = residuals(day);
    const stats = residualStats(res)[strikeIndex];
    const rho = Math.pow(stats.phiTick, p.horizon);
    const slope = (p.riskAversion * stats.sd) / p.limit;
    const r = res.series[strikeIndex];
    const n = r.length;
    const out = {
      every: res.every, rho, sd: stats.sd, phiTick: stats.phiTick, resid: r,
      position: new Float64Array(n), hedge: new Float64Array(n), pnl: new Float64Array(n), fills: [],
    };
    let q = 0;
    let h = 0;
    let cash = 0;
    for (let k = 0; k < n; k++) {
      const mid = res.mids[strikeIndex][k];
      const value = res.fair[strikeIndex][k] + rho * r[k];
      const buyTarget = Math.floor((value - p.takeEdge - (mid + p.halfSpread)) / slope);
      const sellTarget = Math.ceil((value + p.takeEdge - (mid - p.halfSpread)) / slope);
      let target = q;
      if (buyTarget > q) target = Math.min(buyTarget, p.limit);
      else if (sellTarget < q) target = Math.max(sellTarget, -p.limit);
      if (target !== q) {
        const side = QF.sign(target - q);
        const price = mid + side * p.halfSpread;
        cash -= (target - q) * price;
        out.fills.push({ tick: k * res.every, side, price, qty: Math.abs(target - q), kind: 'take' });
        q = target;
      }
      const hedgeTarget = Math.round(-q * res.delta[strikeIndex][k]);
      cash -= (hedgeTarget - h) * res.lychee[k];
      h = hedgeTarget;
      out.position[k] = q;
      out.hedge[k] = h;
      out.pnl[k] = cash + q * mid + h * res.lychee[k];
    }
    return out;
  }

  QF.s3 = { T_AT_OPEN, DEFAULTS, normCdf, bs, impliedVol, fitQuadratic, snapshot, residuals, residualStats, replay };
})(typeof window !== 'undefined' ? window : globalThis);
