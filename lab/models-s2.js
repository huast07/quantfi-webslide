/* S2 model: PINK_PEARLS corrective jumps in the five-pearl sum, and the
 * GOLDEN_PEARLS CUSUM step detector (Trading_Algorithm/strategies/S2/NOTES.md). */
(function (root) {
  'use strict';
  const QF = root.QF;

  const NORMAL_TOTAL = 50000;
  const PINK_JUMP = 3; // |one-tick PINK mid change| above this counts as a jump (noise sd ~0.5)
  // Bucket edges and labels match the evidence chart on slide 17.
  const BUCKETS = [
    { label: '≤ −10', test: (d) => d <= -10 },
    { label: '(−10, −5]', test: (d) => d > -10 && d <= -5 },
    { label: '(−5, 0)', test: (d) => d > -5 && d < 0 },
    { label: '[0, 5)', test: (d) => d >= 0 && d < 5 },
    { label: '[5, 10)', test: (d) => d >= 5 && d < 10 },
    { label: '≥ 10', test: (d) => d >= 10 },
  ];
  // Hazard priors per |deviation| bucket, from the S2 notes (params.json).
  const HAZARD_PRIOR = [{ below: 5, h: 0.0004 }, { below: 10, h: 0.0097 }, { below: Infinity, h: 0.064 }];

  const DEFAULTS = Object.freeze({ horizon: 20, beta: -1.1, hurdle: 2, exitBand: 4, limit: 20 });

  const hazardFor = (absDev, table = HAZARD_PRIOR) => table.find((b) => absDev < b.below).h;
  const jumpProbability = (h, horizon) => 1 - Math.pow(1 - h, horizon);
  const expectedMove = (dev, h, beta, horizon) => jumpProbability(h, horizon) * beta * dev;

  function deviation(day) {
    return QF.pearlSum(day).map((s) => s - NORMAL_TOTAL);
  }

  /** Slide-17 evidence: mean PINK change over `horizon` ticks, bucketed by deviation. */
  function evidence(days, horizon) {
    const groups = BUCKETS.map(() => []);
    for (const day of days) {
      const dev = deviation(day);
      const mid = QF.book(day, 'pink').mid;
      for (let t = 0; t + horizon < mid.length; t++) {
        const k = BUCKETS.findIndex((b) => b.test(dev[t]));
        groups[k].push(mid[t + horizon] - mid[t]);
      }
    }
    return BUCKETS.map((b, k) => {
      const values = groups[k];
      const m = QF.mean(values);
      const se = QF.sd(values) / Math.sqrt(Math.max(values.length, 1));
      return { label: b.label, n: values.length, mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se };
    });
  }

  /** Every PINK jump with the deviation just before it: the data behind beta and h. */
  function jumps(days) {
    const rows = [];
    for (const day of days) {
      const dev = deviation(day);
      const mid = QF.book(day, 'pink').mid;
      for (let t = 1; t < mid.length; t++) {
        const move = mid[t] - mid[t - 1];
        if (Math.abs(move) > PINK_JUMP) rows.push({ day, tick: t, dev: dev[t - 1], move });
      }
    }
    return rows;
  }

  /** Least-squares slope through the origin: jump size = beta x deviation. */
  function fitBeta(rows) {
    let sxy = 0;
    let sxx = 0;
    for (const r of rows) {
      sxy += r.dev * r.move;
      sxx += r.dev * r.dev;
    }
    return sxx > 0 ? sxy / sxx : 0;
  }

  /** Empirical per-tick jump hazard in each |deviation| bucket. */
  function fitHazards(days) {
    const counts = HAZARD_PRIOR.map((b) => ({ below: b.below, ticks: 0, jumps: 0 }));
    for (const day of days) {
      const dev = deviation(day);
      const mid = QF.book(day, 'pink').mid;
      for (let t = 1; t < mid.length; t++) {
        const bucket = counts.find((c) => Math.abs(dev[t - 1]) < c.below);
        bucket.ticks += 1;
        if (Math.abs(mid[t] - mid[t - 1]) > PINK_JUMP) bucket.jumps += 1;
      }
    }
    return counts.map((c) => ({ below: c.below, ticks: c.ticks, jumps: c.jumps, h: c.jumps / Math.max(c.ticks, 1) }));
  }

  /** Replay the PINK correction trade on one real day, crossing the spread to enter and exit. */
  function replay(day, overrides = {}) {
    const p = { ...DEFAULTS, ...overrides };
    const b = QF.book(day, 'pink');
    const dev = deviation(day);
    const n = b.mid.length;
    const out = {
      mid: b.mid, dev, expected: new Float64Array(n),
      position: new Float64Array(n), pnl: new Float64Array(n), fills: [],
    };
    let q = 0;
    let cash = 0;
    const trade = (t, side, qty) => {
      if (qty <= 0) return;
      const price = side > 0 ? b.ask[t] : b.bid[t];
      q += side * qty;
      cash -= side * qty * price;
      out.fills.push({ tick: t, side, price, qty, kind: 'take' });
    };

    for (let t = 0; t < n; t++) {
      const e = expectedMove(dev[t], hazardFor(Math.abs(dev[t])), p.beta, p.horizon);
      const cost = (b.ask[t] - b.bid[t]) / 2;
      let target = q;
      if (Math.abs(e) > cost + p.hurdle) target = QF.sign(e) * p.limit;
      else if (Math.abs(dev[t]) < p.exitBand) target = 0;
      if (target > q) trade(t, 1, Math.min(target - q, b.askVol[t]));
      if (target < q) trade(t, -1, Math.min(q - target, b.bidVol[t]));
      out.expected[t] = e;
      out.position[t] = q;
      out.pnl[t] = cash + q * b.mid[t];
    }
    return out;
  }

  /** Two-sided CUSUM on mid minus a slow plateau (GOLDEN step detection). */
  function cusum(day, { k = 1, h = 5, span = 200 } = {}) {
    const mid = QF.goldenMid(day);
    const n = mid.length;
    const up = new Float64Array(n);
    const down = new Float64Array(n);
    const plateau = new Float64Array(n);
    const alarms = [];
    const alpha = QF.ewmaAlpha(span);
    let level = mid[0];
    let sPos = 0;
    let sNeg = 0;
    let cooldown = 0;
    for (let t = 0; t < n; t++) {
      const x = mid[t] - level;
      sPos = Math.max(0, sPos + x - k);
      sNeg = Math.max(0, sNeg - x - k);
      if (cooldown > 0) cooldown -= 1;
      if ((sPos > h || sNeg > h) && cooldown === 0) {
        alarms.push({ tick: t, dir: sPos > h ? 1 : -1 });
        cooldown = 100; // the GOLDEN ramp lasts ~85 ticks; one alarm per step
      }
      if (sPos > h || sNeg > h) {
        level = mid[t]; // reset the plateau onto the new level while the step runs
        sPos = 0;
        sNeg = 0;
      } else {
        level += alpha * (mid[t] - level);
      }
      plateau[t] = level;
      up[t] = sPos;
      down[t] = sNeg;
    }
    return { mid, plateau, up, down, alarms };
  }

  QF.s2 = {
    NORMAL_TOTAL, BUCKETS, HAZARD_PRIOR, DEFAULTS,
    hazardFor, jumpProbability, expectedMove, deviation, evidence, jumps, fitBeta, fitHazards, replay, cusum,
  };
})(typeof window !== 'undefined' ? window : globalThis);
