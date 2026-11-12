/* S4 model: TELLURIUM jump detection, the concentration-mixed Beta-Binomial direction
 * posterior, and a DirectionTilt-style replay (Trading_Algorithm/strategies/S4/NOTES.md). */
(function (root) {
  'use strict';
  const QF = root.QF;

  const DEFAULTS = Object.freeze({
    floor: 38.75,        // JUMP_FLOOR: half the smallest real jump (77.5)
    z: 10,               // JUMP_Z: multiple of calm sigma
    sigmaAlpha: 0.002,   // EWMA weight of calm squared changes
    sigma0: 1.6,         // calm sigma prior
    concentration: 0.55, // Beta(c, c) prior centre for the day's up-probability
    tiltFull: 0.5,       // |2p - 1| at which the tilt reaches the full limit
    limit: 40,
  });
  const SIM = Object.freeze({ seed: 20260, jumps: 9, sigma: 1.6, meanSize: 170, sizeSd: 55, halfSpread: 3 });

  /** Threshold detector: |dmid| > max(floor, z * sigmaCalm), confirmed when the next tick is calm. */
  function detect(mid, overrides = {}) {
    const p = { ...DEFAULTS, ...overrides };
    const n = mid.length;
    const threshold = new Float64Array(n);
    const change = new Float64Array(n);
    const jumps = [];
    let variance = p.sigma0 * p.sigma0;
    for (let t = 1; t < n; t++) {
      const d = mid[t] - mid[t - 1];
      const limit = Math.max(p.floor, p.z * Math.sqrt(variance));
      change[t] = d;
      threshold[t] = limit;
      if (Math.abs(d) > limit) {
        const next = t + 1 < n ? mid[t + 1] - mid[t] : 0;
        if (Math.abs(next) <= limit) jumps.push({ tick: t, size: Math.abs(d), dir: QF.sign(d) });
      } else {
        variance += p.sigmaAlpha * (d * d - variance);
      }
    }
    return { change, threshold, jumps, sigmaCalm: Math.sqrt(variance) };
  }

  /** 6-point log-normal grid over the Beta concentration c (centre 0.55, log sd 1.1). */
  function concentrationGrid(centre) {
    const zs = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
    return zs.map((z) => ({ c: centre * Math.exp(1.1 * z), prior: Math.exp(-0.5 * z * z) }));
  }

  /** Predictive P(next jump is up) after nUp / nDown jumps, mixing over the concentration. */
  function directionPosterior(nUp, nDown, centre = DEFAULTS.concentration) {
    const grid = concentrationGrid(centre);
    const logW = grid.map((g) => Math.log(g.prior) + QF.logBeta(g.c + nUp, g.c + nDown) - QF.logBeta(g.c, g.c));
    const top = Math.max(...logW);
    const w = logW.map((l) => Math.exp(l - top));
    const total = w.reduce((a, b) => a + b, 0);
    const n = nUp + nDown;
    const pUp = grid.reduce((acc, g, i) => acc + (w[i] / total) * (g.c + nUp) / (2 * g.c + n), 0);
    return { pUp, weights: grid.map((g, i) => ({ c: g.c, weight: w[i] / total })) };
  }

  /** Simple (single-c) Beta-Binomial predictive, shown alongside the mixture. */
  const simplePosterior = (nUp, nDown, c = DEFAULTS.concentration) => (c + nUp) / (2 * c + nUp + nDown);

  /** A simulated calm random walk plus one-way jumps, like real day −1. */
  function simulate(overrides = {}) {
    const s = { ...SIM, ...overrides };
    const next = QF.rng(s.seed);
    const n = 10000;
    const jumpTicks = new Set();
    while (jumpTicks.size < s.jumps) jumpTicks.add(300 + Math.floor(next() * (n - 600)));
    const mid = new Float64Array(n);
    let price = 6000;
    for (let t = 0; t < n; t++) {
      price += s.sigma * QF.gaussian(next);
      if (jumpTicks.has(t)) price += Math.max(77.5, s.meanSize + s.sizeSd * QF.gaussian(next));
      mid[t] = Math.round(price * 2) / 2;
    }
    return { mid, bid: mid.map((m) => m - s.halfSpread), ask: mid.map((m) => m + s.halfSpread) };
  }

  function source(day) {
    if (day === 'sim') return simulate();
    const b = QF.book(day, 'tellurium');
    return { mid: b.mid, bid: b.bid, ask: b.ask };
  }

  /** Replay: after each confirmed jump, tilt the position toward the posterior direction. */
  function replay(day, overrides = {}) {
    const p = { ...DEFAULTS, ...overrides };
    const { mid, bid, ask } = source(day);
    const det = detect(mid, p);
    const n = mid.length;
    const confirmAt = new Map(det.jumps.map((j) => [j.tick + 1, j]));
    const out = {
      mid, change: det.change, threshold: det.threshold, jumps: det.jumps,
      pUp: new Float64Array(n), position: new Float64Array(n), pnl: new Float64Array(n), fills: [],
    };
    let nUp = 0;
    let nDown = 0;
    let pUp = 0.5;
    let q = 0;
    let cash = 0;
    for (let t = 0; t < n; t++) {
      const jump = confirmAt.get(t);
      if (jump) {
        if (jump.dir > 0) nUp += 1;
        else nDown += 1;
        pUp = directionPosterior(nUp, nDown, p.concentration).pUp;
        const target = Math.round(p.limit * QF.clip((2 * pUp - 1) / p.tiltFull, -1, 1));
        if (target !== q) {
          const side = QF.sign(target - q);
          const qty = Math.abs(target - q);
          const price = side > 0 ? ask[t] : bid[t];
          cash -= side * qty * price;
          q = target;
          out.fills.push({ tick: t, side, price, qty, kind: 'take' });
        }
      }
      out.pUp[t] = pUp;
      out.position[t] = q;
      out.pnl[t] = cash + q * mid[t];
    }
    return out;
  }

  QF.s4 = { DEFAULTS, SIM, detect, directionPosterior, simplePosterior, simulate, source, replay };
})(typeof window !== 'undefined' ? window : globalThis);
