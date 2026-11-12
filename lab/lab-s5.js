/* S5 lab: Kelly sizing and the risk-budget allocator across products (slides 20, 39 and 40). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, COLORS } = QF.chart;
  const { fmt } = K;
  const MU_SCALE = 1000; // sliders show mu in units of 1e-3 per lot per tick
  const LAMBDA_SCALE = 1e4;
  const DEFAULT_BUDGET = 300;
  const SHORT = { TOFFEE_CAKE: 'TOFFEE', AMETHYST: 'AMETHYST', PAPER_LANTERNS: 'LANTERNS', JELLY: 'JELLY', PEANUT_BUTTER: 'P. BUTTER', PINK_PEARLS: 'PINK', LYCHEE: 'LYCHEE' };
  const RULE_COLORS = { EQ: COLORS.slate, A1: COLORS.coral, A2: COLORS.green, A3: COLORS.purple };
  const RULE_FORMULAS = { EQ: 'w = 1', A1: 'w = σ', A2: 'w = μ / σ (Kelly)', A3: 'w = 1 / σ' };
  const ruleKeys = Object.keys(QF.s5.RULES);
  const stats = root.labData.allocation;
  const short = (p) => SHORT[p] || p;

  const budgetControl = { id: 'budget', label: 'Risk budget B (σ·lots)', min: 50, max: 800, step: 10, value: DEFAULT_BUDGET };
  const muControls = stats.map((s) => ({
    id: `mu_${s.product}`, label: `μ ${short(s.product)} (×10⁻³ / lot / tick)`, min: 0, max: 100, step: 0.1,
    value: Math.round(QF.s5.defaultMu(s) * MU_SCALE * 10) / 10, format: (v) => v.toFixed(1),
  }));
  const productsFrom = (p) => stats.map((s) => ({ ...s, mu: (p[`mu_${s.product}`] ?? QF.s5.defaultMu(s) * MU_SCALE) / MU_SCALE }));
  const edgeOf = (products, caps) => products.reduce((s, x, i) => s + caps[i] * x.mu, 0);

  const kellyStep = {
    title: 'One product: the Kelly / mean-variance size',
    controls: [
      { id: 'mu', label: 'Edge μ (×10⁻³ / lot / tick)', min: 1, max: 100, step: 1, value: 85 },
      { id: 'sigma', label: 'Risk σ per lot', min: 0.5, max: 6, step: 0.05, value: 2.3, format: (v) => v.toFixed(2) },
      { id: 'lambda', label: 'Risk aversion λ (×10⁻⁴)', min: 0.5, max: 20, step: 0.5, value: 3, format: (v) => v.toFixed(1) },
      { id: 'limit', label: 'Position limit', min: 10, max: 100, step: 5, value: 50 },
    ],
    render(p) {
      const mu = p.mu / MU_SCALE;
      const lambda = p.lambda / LAMBDA_SCALE;
      const qStar = QF.s5.kellyQ(mu, p.sigma, lambda);
      const qUsed = Math.min(qStar, p.limit);
      const Q_MAX = 150;
      const qs = Array.from({ length: Q_MAX + 1 }, (_, q) => q);
      const u = qs.map((q) => QF.s5.utility(q, mu, p.sigma, lambda));
      const uMax = Math.max(...u, 0.01);
      const chart = lines({
        n: qs.length, h: 240, y: [-uMax * 0.6, uMax * 1.25], yLabel: 'Utility U(q) = qμ − ½λq²σ² per tick', yFormat: (v) => v.toFixed(1),
        series: [{ ys: u, color: COLORS.blue, width: 2.5 }],
        vlines: [
          { x: Math.min(Q_MAX, Math.round(qStar)), color: COLORS.green, label: `q* = ${fmt(qStar, 1)}`, row: 1 },
          { x: p.limit, color: COLORS.coral, label: `limit ${p.limit}` },
        ],
        hlines: [{ y: 0 }],
        markers: [{ x: Math.round(qUsed), y: QF.s5.utility(qUsed, mu, p.sigma, lambda), color: COLORS.amber, r: 6, title: `traded size ${fmt(qUsed, 1)}` }],
        xTicks: [0, 25, 50, 75, 100, 125, 150].map((x) => ({ x, label: String(x) })),
      });
      return chart + K.split(
        K.formula(`dU/dq = μ − λqσ² = 0<br>q* = μ / (λσ²) = ${mu.toFixed(3)} / (${lambda.toExponential(1)} × ${p.sigma.toFixed(2)}²) = <strong>${fmt(qStar, 1)}</strong><br>
          traded: min(q*, limit) = <strong>${fmt(qUsed, 1)}</strong> lots`),
        K.takeaway('Size grows with edge and shrinks with the square of risk. Across products this becomes the Kelly rule A2: give each product risk in proportion to μ/σ, so lots Q = B·w/σ end up proportional to μ/σ².'),
      );
    },
  };

  function allocationTable(products, result) {
    const rows = products.map((x, i) => {
      const atLimit = result.caps[i] >= x.limit - 1e-9;
      return `<tr><td>${short(x.product)}</td><td>${x.sigma.toFixed(2)}</td><td>${(x.mu * MU_SCALE).toFixed(1)}</td><td>${fmt(result.caps[i], 1)}${atLimit ? ' <small>(limit)</small>' : ''}</td><td>${fmt(result.caps[i] * x.sigma, 1)}</td></tr>`;
    }).join('');
    return `<table class="lab-table"><thead><tr><th>Product</th><th>σ</th><th>μ ×10⁻³</th><th>Lots Q</th><th>Risk Qσ</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const shareStep = {
    title: 'Many products: risk shares Q = B·w / σ',
    controls: [
      { id: 'rule', label: 'Allocation rule', type: 'select', value: 'A2', options: ruleKeys.map((k) => [k, QF.s5.RULES[k].label]) },
      budgetControl,
    ],
    render(p) {
      const products = productsFrom({});
      const result = QF.s5.allocate(products, p.rule, p.budget);
      const chart = bars({
        h: 230, categories: products.map((x) => short(x.product)), showValues: true, valueFormat: (v) => fmt(v, 0),
        groups: [{ label: 'risk Qσ', color: RULE_COLORS[p.rule], values: result.caps.map((q, i) => q * products[i].sigma) }],
      });
      return K.legend([[RULE_COLORS[p.rule], `Risk used Qσ per product under ${QF.s5.RULES[p.rule].label}`]]) + chart + K.split(
        K.formula(`${RULE_FORMULAS[p.rule]},&nbsp; Qᵢ = B wᵢ / (σᵢ Σw)<br>Σ Qᵢσᵢ = ${fmt(result.risk, 1)} of B = ${p.budget}${result.unused > 0.05 ? ` (${fmt(result.unused, 1)} unused: every product at its limit)` : ''}<br>
          expected edge Σ Qᵢμᵢ = <strong>${edgeOf(products, result.caps).toFixed(2)}</strong> per tick`)
          + K.takeaway('When a product’s slice would exceed its position limit, it is clipped and the leftover budget is water-filled across the rest in proportion to w. σ is the real per-tick mid volatility; μ is passive print flow × half spread plus each signal’s edge.'),
        allocationTable(products, result),
      );
    },
  };

  function renderAllocator(p) {
    const products = productsFrom(p);
    const results = ruleKeys.map((k) => ({ key: k, ...QF.s5.allocate(products, k, p.budget) }));
    const edges = results.map((r) => edgeOf(products, r.caps));
    const best = edges.indexOf(Math.max(...edges));
    const chart = bars({
      w: 1150, h: 270, categories: products.map((x) => short(x.product)), valueFormat: (v) => fmt(v, 1),
      groups: results.map((r) => ({ label: QF.s5.RULES[r.key].label, color: RULE_COLORS[r.key], values: r.caps })),
    });
    const rows = results.map((r, i) => `<tr class="${i === best ? 'best' : ''}"><td>${QF.s5.RULES[r.key].label}</td><td>${RULE_FORMULAS[r.key]}</td><td>${fmt(r.risk, 0)} / ${p.budget}</td><td>${edges[i].toFixed(2)}</td></tr>`).join('');
    const table = `<table class="lab-table"><thead><tr><th>Rule</th><th>Weight</th><th>Risk used</th><th>Expected edge / tick</th></tr></thead><tbody>${rows}</tbody></table>`;
    return K.legend(results.map((r) => [RULE_COLORS[r.key], `${QF.s5.RULES[r.key].label} (lots)`])) + chart + K.split(
      table,
      K.takeaway('Lots per product under each rule for the same budget. A2 puts the most risk where μ/σ is high (TOFFEE, PINK and the quiet makers) and starves PEANUT_BUTTER and LYCHEE, which is where its backtested gain over EQ came from. Raise a product’s μ to watch A2 move budget toward it.'),
    );
  }

  QF.labs.register('s5', {
    kicker: 'STRATEGY LAB · S5 PORTFOLIO ALLOCATION',
    title: 'S5 · Risk budgeting across products',
    evidence: 'One risk budget B is split across products by a rule; each product’s lots are its risk share divided by its volatility, water-filled against the position limits (slides 20, 39 and 40).',
    source: 'Sources: deck slides 20, 39 and 40; Trading_Algorithm/strategies/S5/NOTES.md. σ, spreads and print rates are measured from backtester/QuantFi Price Data and Trades Data for the 7 products in this lab.',
    steps: [kellyStep, shareStep],
    replay: {
      label: 'Allocator · compare the four rules',
      controls: [budgetControl, ...muControls],
      render: renderAllocator,
      note: `<b>Interactive allocator using the measured σ of 7 products</b> and a simple μ estimate you can override. The submitted S5 runs this over 15 products with B = 800 and moves each share by at most 0.002 per tick.
        Backtested, A2 beat EQ by <b>+5,146</b> [3,466, 6,720] weighted P&L and earned <b>82.2k</b> on the three real days.`,
    },
  });
})(window);
