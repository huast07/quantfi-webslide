/* S1 lab: TOFFEE_CAKE mean-reversion market making (slides 16 and 33). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, dayTicks, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const HALF_SPREAD = 7;      // TOFFEE spread is ~14 on every real day
  const OU_SIGMA = 2.24;      // per-tick innovation sd from params.json

  /** Variance ratio Var(x[t+k] - x[t]) / (k Var(x[t+1] - x[t])): 1 for a random walk, < 1 when reverting. */
  function varianceRatio(x, k) {
    const diffs = (lag) => Array.from({ length: x.length - lag }, (_, i) => x[i + lag] - x[i]);
    const v1 = QF.sd(diffs(1)) ** 2;
    return (QF.sd(diffs(k)) ** 2) / (k * v1);
  }

  const replays = new Map();
  const defaultReplay = (day) => {
    if (!replays.has(day)) replays.set(day, QF.s1.replay(day));
    return replays.get(day);
  };

  const evidenceStep = {
    title: 'Evidence: TOFFEE keeps returning to ~5,000',
    controls: [K.dayControl('-1')],
    render(p) {
      const mid = QF.book(p.day, 'toffee').mid;
      const within = mid.filter((m) => Math.abs(m - 5000) <= 23).length / mid.length;
      let crossings = 0;
      for (let t = 1; t < mid.length; t++) if ((mid[t] - 5000) * (mid[t - 1] - 5000) < 0) crossings += 1;
      const chart = lines({
        n: mid.length, h: 250, yLabel: 'TOFFEE_CAKE mid',
        series: [{ ys: mid, color: COLORS.blue, width: 1.4 }],
        bands: [{ y0: 4977, y1: 5023, color: '#2fb36a1f' }],
        hlines: [{ y: 5000, color: COLORS.amber, dash: '6 4', label: 'anchor μ ≈ 5,000' }],
        xTicks: dayTicks(mid.length),
      });
      return chart + K.split(
        K.facts([
          ['Time within ±23 of 5,000 (one stationary sd)', `${fmt(within * 100, 0)}%`],
          ['Crossings of 5,000 this day', fmt(crossings)],
          ['Variance ratio at 1,000 ticks', `${fmt(varianceRatio(mid, 1000), 2)} <small>(random walk = 1)</small>`],
        ]),
        K.takeaway('A random walk would wander off and its variance ratio would be ~1. TOFFEE keeps crossing its anchor and its long-horizon variance collapses: a <b>mean-reverting</b> price. Slide 10: “TOFFEE_CAKE keeps returning to ~5,000.”'),
      );
    },
  };

  const ouStep = {
    title: 'Model: Ornstein–Uhlenbeck reversion',
    controls: [
      { id: 'kappa', label: 'Reversion speed κ (per tick)', min: 0.001, max: 0.02, step: 0.0002, value: 0.0046, format: (v) => v.toFixed(4) },
      { id: 'fair', label: 'Current fair value Fₜ', min: 4920, max: 5080, step: 1, value: 4980 },
      { id: 'h', label: 'Horizon h (ticks)', min: 0, max: 600, step: 5, value: 150 },
    ],
    render(p) {
      const mu = 5000;
      const phi = 1 - p.kappa;
      const span = 600;
      const mean = Array.from({ length: span + 1 }, (_, h) => mu + (p.fair - mu) * phi ** h);
      const sdAt = (h) => OU_SIGMA * Math.sqrt((1 - phi ** (2 * h)) / (1 - phi * phi));
      const hi = mean.map((m, h) => m + sdAt(h));
      const lo = mean.map((m, h) => m - sdAt(h));
      const half = QF.s1.halfLife(p.kappa);
      const atH = mean[p.h];
      const chart = lines({
        n: span + 1, h: 240, y: [Math.min(4915, p.fair - 10), Math.max(5085, p.fair + 10)], yLabel: 'E[Fₜ₊ₕ] ± 1 sd',
        series: [
          { ys: hi, color: COLORS.slate, width: 1, dash: '4 3' },
          { ys: lo, color: COLORS.slate, width: 1, dash: '4 3' },
          { ys: mean, color: COLORS.blue, width: 2.5 },
        ],
        hlines: [{ y: mu, color: COLORS.amber, dash: '6 4', label: 'μ = 5,000' }],
        vlines: [{ x: Math.min(span, Math.round(half)), label: `half-life ${fmt(half)}`, color: COLORS.purple }],
        markers: [{ x: p.h, y: atH, color: COLORS.coral, r: 6, title: `E at h = ${p.h}` }],
        xTicks: [0, 150, 300, 450, 600].map((x) => ({ x, label: `${x}` })),
      });
      return chart + K.split(
        K.formula(`dF = κ(μ − F)dt + σ dW<br>⇒ E[F<sub>t+h</sub> | F<sub>t</sub>] = μ + (F<sub>t</sub> − μ)(1 − κ)<sup>h</sup><br>
          = 5,000 + (${fmt(p.fair)} − 5,000)·${fmt(phi ** p.h, 3)} = <strong>${fmt(atH, 1)}</strong><br>
          half-life = ln 2 / −ln(1 − κ) = <strong>${fmt(half, 0)} ticks</strong>`),
        K.takeaway(`The forecast closes ${fmt((1 - phi ** p.h) * 100, 0)}% of the gap in ${p.h} ticks. With the fitted κ = 0.0046 the half-life is ~150 ticks: from 4,980, half the gap is gone after 150 ticks and the forecast is 4,990, exactly the worked example in the strategy notes.`),
      );
    },
  };

  const quoteStep = {
    title: 'From forecast to quotes: reservation price and size',
    controls: [
      { id: 'fair', label: 'Fair value Fₜ', min: 4940, max: 5060, step: 1, value: 4985 },
      { id: 'q', label: 'Current inventory q', min: -50, max: 50, step: 1, value: 10 },
      { id: 'k', label: 'Inventory penalty k (per lot)', min: 0.05, max: 0.6, step: 0.005, value: 0.175, format: (v) => v.toFixed(3) },
    ],
    render(p) {
      const v = QF.s1.forecast(p.fair, 5000, 0.0046, 50);
      const bid = Math.round(p.fair) - HALF_SPREAD;
      const ask = Math.round(p.fair) + HALF_SPREAD;
      const target = (price) => QF.clip((v - price) / p.k, -50, 50);
      const bidSize = QF.clip(Math.floor(target(bid)) - p.q, 0, 50 - p.q);
      const askSize = QF.clip(p.q - Math.ceil(target(ask)), 0, 50 + p.q);
      const grid = Array.from({ length: 121 }, (_, i) => bid - 20 + i * ((ask - bid + 40) / 120));
      const chart = lines({
        n: grid.length, h: 230, y: [-55, 55], yLabel: 'target inventory at price p',
        series: [{ ys: grid.map(target), color: COLORS.blue, width: 2.5 }],
        hlines: [{ y: p.q, color: COLORS.amber, dash: '6 4', label: `q = ${p.q}` }, { y: 0, color: '#a9bddb' }],
        vlines: [
          { x: (bid - grid[0]) / (grid[1] - grid[0]), label: `bid ${bid}`, color: COLORS.green },
          { x: (v - grid[0]) / (grid[1] - grid[0]), label: `v ${fmt(v, 1)}`, color: COLORS.purple },
          { x: (ask - grid[0]) / (grid[1] - grid[0]), label: `ask ${ask}`, color: COLORS.coral },
        ],
        xTicks: [0, 30, 60, 90, 120].map((i) => ({ x: i, label: fmt(grid[i], 0) })),
      });
      const sizes = bars({
        h: 150, categories: ['Bid size (buy)', 'Ask size (sell)'], showValues: true, valueFormat: (x) => fmt(x),
        groups: [{ label: 'lots', color: COLORS.blue, values: [bidSize, askSize] }], y: [0, 60],
      });
      return chart + K.split(
        K.formula(`v = E[F<sub>t+50</sub>] = <strong>${fmt(v, 1)}</strong><br>target(p) = (v − p) / k<br>
          bid size = target(${bid}) − q = <strong>${fmt(bidSize)}</strong><br>ask size = q − target(${ask}) = <strong>${fmt(askSize)}</strong>`)
          + K.takeaway('Quotes sit <b>at the touch</b>: the engine fills a resting order against any print at its price, so improving the price only gives away edge (slide 12, “Quote at the touch”). Size is the distance between where we are and where the forecast says we should be.'),
        sizes,
      );
    },
  };

  const takeStep = {
    title: 'When to cross the spread',
    controls: [
      { id: 'dev', label: 'Gap to anchor μ − Fₜ', min: -90, max: 90, step: 1, value: 45 },
      { id: 'hurdle', label: 'Take hurdle (price)', min: 0, max: 8, step: 0.5, value: 2 },
      { id: 'H', label: 'Forecast horizon H (ticks)', min: 10, max: 200, step: 5, value: 50 },
    ],
    render(p) {
      const shrink = 1 - (1 - 0.0046) ** p.H;
      const devs = Array.from({ length: 181 }, (_, i) => i - 90);
      const edge = devs.map((d) => shrink * d);
      const need = HALF_SPREAD + p.hurdle;
      const trigger = need / shrink;
      const now = shrink * p.dev;
      const action = now >= need ? '<b class="buy">BUY at the ask</b>' : now <= -need ? '<b class="sell">SELL at the bid</b>' : 'stay passive at the touch';
      const days = QF.DAYS.map((d) => defaultReplay(d).fills.filter((f) => f.kind === 'take'));
      const chart = lines({
        n: devs.length, h: 230, y: [-25, 25], yLabel: 'expected edge v − mid',
        series: [{ ys: edge, color: COLORS.blue, width: 2.5 }],
        bands: [{ y0: need, y1: 25, color: '#2fb36a1a' }, { y0: -need, y1: -25, color: '#e0644c1a' }],
        hlines: [{ y: need, color: COLORS.green, dash: '5 4', label: `buy: edge ≥ ${fmt(need, 1)}` }, { y: -need, color: COLORS.coral, dash: '5 4', label: `sell: edge ≤ −${fmt(need, 1)}` }],
        markers: [{ x: p.dev + 90, y: now, color: COLORS.amber, r: 6 }],
        xTicks: [-90, -45, 0, 45, 90].map((d) => ({ x: d + 90, label: `${d}` })),
      });
      return chart + K.split(
        K.formula(`edge = v − mid = (1 − (1 − κ)<sup>H</sup>)(μ − F) = ${fmt(shrink, 3)} × ${p.dev} = <strong>${signed(now, 1)}</strong><br>
          cross when |edge| ≥ half spread + hurdle = ${HALF_SPREAD} + ${p.hurdle} → |μ − F| ≥ <strong>${fmt(trigger, 0)}</strong><br>Action: ${action}`),
        K.facts([
          ['Takes in the default replay', days.map((d) => fmt(d.length)).join(' / ') + ' <small>(days −2 / −1 / 0)</small>'],
          ['Lots taken per day', days.map((d) => fmt(d.reduce((s, f) => s + f.qty, 0))).join(' / ')],
        ]) + K.takeaway('Crossing pays the 7-point half spread, so S1 only takes when the forecast is far enough through the book. Takes are sized with a 4× looser penalty (TAKE_BAND_MULT = 4).'),
      );
    },
  };

  const replay = {
    label: 'Strategy in action · real days',
    controls: [
      K.dayControl('-2'),
      { id: 'kappa', label: 'κ (reversion per tick)', min: 0.001, max: 0.015, step: 0.0002, value: 0.0046, format: (v) => v.toFixed(4) },
      { id: 'hold', label: 'Forecast horizon H', min: 10, max: 200, step: 5, value: 50 },
      { id: 'penalty', label: 'Inventory penalty k', min: 0.05, max: 0.6, step: 0.005, value: 0.175, format: (v) => v.toFixed(3) },
      { id: 'takeHurdle', label: 'Take hurdle', min: 0, max: 8, step: 0.5, value: 2 },
    ],
    run: (p) => QF.s1.replay(p.day, { kappa: p.kappa, hold: p.hold, penalty: p.penalty, takeHurdle: p.takeHurdle }),
    length: (r) => r.mid.length,
    view(r, i) {
      const n = r.mid.length;
      const ticks = dayTicks(n);
      const price = lines({
        n, w: 1150, h: 260, yLabel: 'Price · mid, forecast v, anchor μ', cursor: i, xTicks: ticks,
        series: [
          { ys: r.mid, to: i + 1, color: '#9fb3d4', width: 1 },
          { ys: r.anchor, to: i + 1, color: COLORS.amber, width: 1.5, dash: '6 4' },
          { ys: r.forecast, to: i + 1, color: COLORS.blue, width: 1.6 },
        ],
        markers: K.fillMarkers(r.fills.filter((f) => f.kind === 'take'), i, (f) => f.price),
        y: [Math.min(...r.mid) - 4, Math.max(...r.mid) + 4],
      });
      const position = lines({
        n, w: 570, h: 170, y: [-55, 55], yLabel: 'Position (limit ±50)', cursor: i, xTicks: ticks,
        series: [{ ys: r.position, to: i + 1, color: COLORS.purple, width: 1.6 }],
        hlines: [{ y: 50, color: COLORS.coral, dash: '4 3' }, { y: -50, color: COLORS.coral, dash: '4 3' }, { y: 0 }],
      });
      const pnl = lines({
        n, w: 570, h: 170, yLabel: 'P&L (marked to mid)', cursor: i, xTicks: ticks,
        series: [{ ys: r.pnl, to: i + 1, color: COLORS.green, width: 2 }],
        y: [Math.min(0, ...r.pnl) - 500, Math.max(...r.pnl) * 1.05 + 500],
        hlines: [{ y: 0 }],
      });
      const s = K.tradeSummary(r.fills, i);
      return {
        panels: [price, position, pnl],
        stats: [
          ['P&L', signed(r.pnl[i]), r.pnl[i] >= 0 ? 'good' : 'bad'],
          ['Position', signed(r.position[i])],
          ['Bought', `${fmt(s.buyLots)} @ ${Number.isFinite(s.avgBuy) ? fmt(s.avgBuy, 1) : '–'}`],
          ['Sold', `${fmt(s.sellLots)} @ ${Number.isFinite(s.avgSell) ? fmt(s.avgSell, 1) : '–'}`],
          ['Forecast − mid', signed(r.forecast[i] - r.mid[i], 1)],
        ],
        event: K.lastFillText(s.last),
      };
    },
    note: `<b>Simplified re-implementation on real order books.</b> Takes cross the real best level up to its real volume; passive quotes fill only against real market prints at the touch.
      The submitted S1 adds a Kalman fair value, an adverse-selection estimate, Thompson-sampled quote offsets and jump guards.
      For reference, the backtested S1 earned <b>82,598 on TOFFEE_CAKE over the 3 days</b> (slide 16); this replay earns about 77k with the default settings.`,
  };

  QF.labs.register('s1', {
    kicker: 'STRATEGY LAB · S1 MARKET MAKING',
    title: 'S1 · TOFFEE_CAKE mean reversion and market making',
    evidence: 'Fair price → quote at the touch → manage inventory. ~97k over 3 days, 85% from TOFFEE_CAKE (slide 16). Walk through the derivation, then watch the rule trade the real order books.',
    source: 'Sources: Team 05 deck slides 10, 12, 16 and 33; Trading_Algorithm/strategies/S1/NOTES.md; Strategy_EDA_and_Ablation_Explained.pdf. Prices: backtester/QuantFi Price Data (days −2, −1, 0).',
    steps: [evidenceStep, ouStep, quoteStep, takeStep],
    replay,
  });
})(window);
