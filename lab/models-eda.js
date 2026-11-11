/* EDA evidence: the statistics behind each finding on slides 9 and 10. Each function returns the
 * observed statistic together with what a "no structure" baseline would predict, so the labs can
 * show how the data rules the baseline out. Pure functions over window.edaData and window.labData. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const PEARLS = Object.freeze(['PINK_PEARLS', 'BLUE_PEARLS', 'BLACK_PEARLS', 'GOLDEN_PEARLS', 'WHITE_PEARLS']);
  const PEARL_TOTAL = 50000;
  const EDA_EVERY = 10; // window.edaData keeps one mid every 10 ticks (1,000 per day)
  const TICKS_PER_DAY = 10000;

  const eda = () => root.edaData;
  const edaSeries = (product) => QF.DAYS.flatMap((d) => eda()[d][product]);
  const diffs = (xs, k = 1) => Array.from({ length: Math.max(xs.length - k, 0) }, (_, i) => xs[i + k] - xs[i]);
  const range = (xs) => [Math.min(...xs), Math.max(...xs)];
  const withinDays = (fn) => QF.DAYS.flatMap((d) => fn(d));

  /* ---------- slide 10: Fixed anchor ---------- */

  /** AMETHYST: every observed mid and how often it occurs, versus the anchor 10,000. */
  function anchor(product = 'AMETHYST', level = 10000) {
    const xs = edaSeries(product);
    const counts = new Map();
    for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
    const values = [...counts.keys()].sort((a, b) => a - b).map((v) => ({ value: v, share: counts.get(v) / xs.length }));
    const maxDev = Math.max(...xs.map((x) => Math.abs(x - level)));
    const step = QF.sd(diffs(xs));
    return { xs, level, values, maxDev, step, randomWalkSd: step * Math.sqrt(xs.length) };
  }

  /* ---------- slide 10: Mean reversion (and the random-walk baseline for any series) ---------- */

  /**
   * Spread of k-tick price changes versus a random walk with the same 1-tick volatility.
   * A random walk spreads like sd1 * sqrt(k); a mean-reverting price stops spreading.
   */
  function horizonSpread(product, ks) {
    const days = QF.DAYS.map((d) => Array.from(QF.book(d, product).mid));
    const sd1 = QF.sd(days.flatMap((m) => diffs(m)));
    return ks.map((k) => ({ k, actual: QF.sd(days.flatMap((m) => diffs(m, k))), randomWalk: sd1 * Math.sqrt(k) }));
  }

  /** Share of excursions beyond `band` from `level` that come back within half the band inside `within` ticks. */
  function reversion(product, level, band, within) {
    let leaves = 0;
    let returns = 0;
    for (const d of QF.DAYS) {
      const mid = QF.book(d, product).mid;
      for (let t = 1; t < mid.length - within; t++) {
        const out = Math.abs(mid[t] - level) > band;
        if (!out || Math.abs(mid[t - 1] - level) > band) continue;
        leaves += 1;
        for (let s = t + 1; s <= t + within; s++) {
          if (Math.abs(mid[s] - level) <= band / 2) { returns += 1; break; }
        }
      }
    }
    return { leaves, returns, share: leaves ? returns / leaves : NaN };
  }

  /* ---------- slide 10: Sum constraint ---------- */

  /** Sum of the chosen pearls over all three days (edaData resolution) and the range of each pearl. */
  function pearlSum(included = PEARLS) {
    const sum = withinDays((d) => eda()[d].PINK_PEARLS.map((_, i) => included.reduce((s, p) => s + eda()[d][p][i], 0)));
    const pearls = PEARLS.map((p) => {
      const [lo, hi] = range(edaSeries(p));
      return { product: p, lo, hi, width: hi - lo };
    });
    const [lo, hi] = range(sum);
    return { sum, lo, hi, width: hi - lo, sd: QF.sd(sum), pearls, complete: included.length === PEARLS.length };
  }

  /** Who restores the sum: PINK's share of restoring moves of at least `minMove`, and what PINK's own jumps do. */
  function restoration(minMove = 5, pinkJump = 3) {
    let restoring = 0;
    let pinkLed = 0;
    let pinkJumps = 0;
    let pinkJumpsRestoring = 0;
    for (const d of QF.DAYS) {
      const pink = QF.book(d, 'pink').mid;
      const sum = QF.pearlSum(d);
      for (let t = 1; t < sum.length; t++) {
        const dSum = sum[t] - sum[t - 1];
        const dPink = pink[t] - pink[t - 1];
        const closer = Math.abs(sum[t] - PEARL_TOTAL) < Math.abs(sum[t - 1] - PEARL_TOTAL);
        if (Math.abs(dPink) >= pinkJump) {
          pinkJumps += 1;
          if (closer) pinkJumpsRestoring += 1;
        }
        if (Math.abs(dSum) < minMove || !closer) continue;
        restoring += 1;
        if (Math.sign(dPink) === Math.sign(dSum) && Math.abs(dPink) >= Math.abs(dSum) / 2) pinkLed += 1;
      }
    }
    return { restoring, pinkLed, pinkShare: restoring ? pinkLed / restoring : NaN, equalShare: 1 / PEARLS.length, pinkJumps, pinkJumpsRestoring };
  }

  /* ---------- slide 10: Step-downs ---------- */

  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };

  /** GOLDEN steps: the level before and after each CUSUM alarm, and the noise around a plateau. */
  function goldenSteps() {
    const steps = [];
    let calm = 0;
    let calmNear = 0;
    for (const d of QF.DAYS) {
      const mid = QF.goldenMid(d);
      const c = QF.s2.cusum(d, { k: 1, h: 5 });
      const daySteps = [];
      for (const a of c.alarms) {
        const before = median(mid.slice(Math.max(0, a.tick - 400), Math.max(1, a.tick - 120)));
        const after = median(mid.slice(Math.min(mid.length - 1, a.tick + 200), Math.min(mid.length, a.tick + 500)));
        if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(after - before) < 10) continue;
        let start = a.tick;
        while (start > 0 && Math.abs(mid[start - 1] - before) > 2) start -= 1;
        daySteps.push({ day: d, alarm: a.tick, start, before, after, size: after - before, mid });
      }
      for (let t = 0; t < mid.length; t++) {
        if (daySteps.some((s) => t >= s.start - 50 && t <= s.alarm + 250)) continue;
        calm += 1;
        if (Math.abs(mid[t] - c.plateau[t]) <= 1) calmNear += 1;
      }
      steps.push(...daySteps);
    }
    return { steps, calmShare: calm ? calmNear / calm : NaN };
  }

  /** For a detection threshold, how far into each step we are and how much of the move is still ahead. */
  function stepDetection(steps, threshold) {
    return steps.map((s) => {
      const dir = Math.sign(s.size);
      let t = s.start;
      while (t < s.mid.length - 1 && dir * (s.mid[t] - s.before) < threshold) t += 1;
      const remaining = dir * (s.after - s.mid[t]);
      return { ...s, detect: t, lag: t - s.start, remaining, remainingShare: remaining / Math.abs(s.size) };
    });
  }

  /* ---------- slide 10: Big jumps ---------- */

  /** TELLURIUM: jumps above a threshold versus what a normal distribution with the calm sigma predicts. */
  function jumpEvidence(day, threshold) {
    const { mid } = QF.s4.source(day);
    const det = QF.s4.detect(mid);
    const change = Array.from(det.change).slice(1);
    const observed = change.filter((x) => Math.abs(x) > threshold).length;
    const expected = change.length * 2 * (1 - QF.s3.normCdf(threshold / det.sigmaCalm));
    const m = QF.mean(change);
    const s = QF.sd(change);
    const kurtosis = QF.mean(change.map((x) => ((x - m) / s) ** 4));
    const up = det.jumps.filter((j) => j.dir > 0).length;
    const n = det.jumps.length;
    return { mid, change, sigmaCalm: det.sigmaCalm, observed, expected, kurtosis, jumps: det.jumps, up, down: n - up, sameSideP: binomialTail(n, Math.max(up, n - up)) };
  }

  /** P(at least `k` of `n` fair coin flips land on the same side), two-sided. */
  function binomialTail(n, k) {
    let p = 0;
    for (let i = k; i <= n; i++) p += Math.exp(QF.logGamma(n + 1) - QF.logGamma(i + 1) - QF.logGamma(n - i + 1) - n * Math.LN2);
    return Math.min(1, 2 * p);
  }

  /* ---------- slide 10: Mispriced options ---------- */

  /** LYCHEE realised vol per sqrt(day) versus the at-the-money voucher implied vol, sampled over the day. */
  function volEvidence(day, sampleEvery = 25) {
    const v = QF.vouchers(day);
    const S = v.lychee;
    const logReturns = S.slice(1).map((x, i) => Math.log(x / S[i]));
    const realised = QF.sd(logReturns) * Math.sqrt(TICKS_PER_DAY / v.every);
    const implied = [];
    for (let k = 0; k < S.length; k += sampleEvery) {
      const snap = QF.s3.snapshot(day, k);
      const atm = snap.rows.reduce((a, b) => (Math.abs(Math.log(b.K / snap.S)) < Math.abs(Math.log(a.K / snap.S)) ? b : a));
      if (Number.isFinite(atm.iv)) implied.push({ tick: k * v.every, iv: atm.iv, K: atm.K });
    }
    const meanIv = QF.mean(implied.map((x) => x.iv));
    return { realised, implied, meanIv, ratio: meanIv / realised };
  }

  /* ---------- slide 9: data quality, order book, noise traders ---------- */

  /** Overnight gap (next open minus previous close) in units of a normal 10-tick move, per product. */
  function continuity() {
    const products = Object.keys(eda()['-2']);
    return products.map((p) => {
      const gaps = [['-2', '-1'], ['-1', '0']].map(([a, b]) => {
        const prev = eda()[a][p];
        const step = QF.sd(diffs(prev)) || 1;
        return (eda()[b][p][0] - prev.at(-1)) / step;
      });
      return { product: p, gaps, worst: Math.max(...gaps.map(Math.abs)) };
    });
  }

  const IMBALANCE_BINS = 10;

  /** Correlation between top-of-book imbalance and the mid change over the next `horizon` ticks, plus binned means. */
  function imbalanceCorrelation(product, horizon = 1) {
    const xs = [];
    const ys = [];
    for (const d of QF.DAYS) {
      const b = QF.book(d, product);
      for (let t = 0; t + horizon < b.mid.length; t++) {
        const total = b.bidVol[t] + b.askVol[t];
        if (!total) continue;
        xs.push((b.bidVol[t] - b.askVol[t]) / total);
        ys.push(b.mid[t + horizon] - b.mid[t]);
      }
    }
    const bins = Array.from({ length: IMBALANCE_BINS }, (_, i) => ({ lo: -1 + (2 * i) / IMBALANCE_BINS, sum: 0, n: 0 }));
    xs.forEach((x, i) => {
      const b = bins[Math.min(IMBALANCE_BINS - 1, Math.floor(((x + 1) / 2) * IMBALANCE_BINS))];
      b.sum += ys[i];
      b.n += 1;
    });
    const binned = bins.map((b) => ({ lo: b.lo, hi: b.lo + 2 / IMBALANCE_BINS, n: b.n, mean: b.n ? b.sum / b.n : 0 }));
    return { corr: correlation(xs, ys), n: xs.length, noiseBand: 2 / Math.sqrt(xs.length), bins: binned, moveSd: QF.sd(ys) };
  }

  function correlation(xs, ys) {
    const mx = QF.mean(xs);
    const my = QF.mean(ys);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  /** Where market trades print relative to the book, in half-spreads from the mid, and what follows them. */
  function tradePrints(product, markout = 20) {
    const prints = [];
    for (const d of QF.DAYS) {
      const b = QF.book(d, product);
      for (const tr of b.trades) {
        const half = (b.ask[tr.tick] - b.bid[tr.tick]) / 2;
        if (!(half > 0)) continue;
        const side = Math.sign(tr.price - b.mid[tr.tick]);
        const later = b.mid[Math.min(b.mid.length - 1, tr.tick + markout)];
        prints.push({ offset: (tr.price - b.mid[tr.tick]) / half, edge: side ? side * (tr.price - later) : 0, half, qty: tr.qty });
      }
    }
    const atTouch = prints.filter((p) => Math.abs(p.offset) >= 0.99).length;
    const sided = prints.filter((p) => p.offset !== 0);
    return {
      prints, atTouchShare: prints.length ? atTouch / prints.length : NaN,
      meanEdge: QF.mean(sided.map((p) => p.edge)), meanHalf: QF.mean(prints.map((p) => p.half)),
    };
  }

  QF.eda = {
    PEARLS, PEARL_TOTAL, EDA_EVERY,
    anchor, horizonSpread, reversion, pearlSum, restoration, goldenSteps, stepDetection,
    jumpEvidence, binomialTail, volEvidence, continuity, imbalanceCorrelation, correlation, tradePrints,
  };
})(typeof window !== 'undefined' ? window : globalThis);
