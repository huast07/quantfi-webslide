/* S5 model: risk-budget allocation rules (EQ, A1, A2 Kelly, A3) with limit water-filling,
 * plus the slide-23 orchestrator step (Trading_Algorithm/strategies/S5/NOTES.md, README section 5). */
(function (root) {
  'use strict';
  const QF = root.QF;

  const RULES = Object.freeze({
    EQ: { label: 'EQ equal risk', weight: () => 1 },
    A1: { label: 'A1 vol seeking', weight: (p) => p.sigma },
    A2: { label: 'A2 Kelly', weight: (p) => Math.max(p.mu, 0) / p.sigma },
    A3: { label: 'A3 inverse vol', weight: (p) => 1 / p.sigma },
  });
  const TOFFEE_KAPPA = 0.0046;
  const TOFFEE_MEAN_ABS_DEV = 18; // E|F - mu| for an OU with stationary sd ~23
  const PINK_SIGNAL_EDGE = 0.05;  // ~hazard x 1.105 x |dev| averaged over the day

  /** Default expected edge per lot per tick: passive print flow x half spread, plus the signal edge. */
  function defaultMu(stats) {
    const passive = (stats.printsPerTick * stats.lotsPerPrint * stats.halfSpread) / stats.limit;
    const signal = stats.product === 'TOFFEE_CAKE' ? TOFFEE_KAPPA * TOFFEE_MEAN_ABS_DEV
      : stats.product === 'PINK_PEARLS' ? PINK_SIGNAL_EDGE : 0;
    return passive + signal;
  }

  /**
   * Q_i = B w_i / sigma_i with sum Q_i sigma_i <= B. Products that hit their limit are
   * clipped and the unused budget is water-filled across the rest in proportion to w.
   */
  function allocate(products, ruleKey, budget) {
    const rule = RULES[ruleKey];
    const weights = products.map((p) => Math.max(rule.weight(p), 0));
    const caps = products.map(() => 0);
    let open = products.map((_, i) => i).filter((i) => weights[i] > 0);
    let remaining = budget;
    while (open.length && remaining > 1e-9) {
      const total = open.reduce((s, i) => s + weights[i], 0);
      const clipped = open.filter((i) => (remaining * weights[i]) / total / products[i].sigma >= products[i].limit);
      if (!clipped.length) {
        for (const i of open) caps[i] = (remaining * weights[i]) / total / products[i].sigma;
        remaining = 0;
        break;
      }
      for (const i of clipped) {
        caps[i] = products[i].limit;
        remaining -= products[i].limit * products[i].sigma;
      }
      open = open.filter((i) => !clipped.includes(i));
    }
    const risk = caps.reduce((s, q, i) => s + q * products[i].sigma, 0);
    return { caps, risk, unused: Math.max(budget - risk, 0) };
  }

  /** Mean-variance utility U(q) = q mu - (lambda / 2) q^2 sigma^2 and its maximiser. */
  const utility = (q, mu, sigma, lambda) => q * mu - 0.5 * lambda * q * q * sigma * sigma;
  const kellyQ = (mu, sigma, lambda) => mu / (lambda * sigma * sigma);

  /** Slide 23: route a proposal, clip it to the limit, fill part of it, reconcile the position. */
  function orchestrate({ position, limit, proposal, filled }) {
    const room = proposal >= 0 ? limit - position : limit + position;
    const approved = QF.sign(proposal) * Math.min(Math.abs(proposal), Math.max(room, 0));
    const fill = QF.sign(approved) * Math.min(Math.abs(filled), Math.abs(approved));
    const next = position + fill;
    return {
      room, approved, fill, next,
      clipped: Math.abs(proposal) - Math.abs(approved),
      buyRoom: limit - next,
      sellRoom: limit + next,
    };
  }

  QF.s5 = { RULES, defaultMu, allocate, utility, kellyQ, orchestrate };
})(typeof window !== 'undefined' ? window : globalThis);
