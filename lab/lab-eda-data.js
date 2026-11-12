/* EDA evidence lab for slide 9 ("EDA results: data"): data quality, the order book and who trades,
 * each walked from question to baseline to conclusion. Shares the reasoning chain with lab-eda.js. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const E = QF.eda;
  const { chain, scorecard, cached, pct } = QF.edaKit;
  const PRODUCTS = 26;
  const SNAPSHOTS = PRODUCTS * QF.DAYS.length * 10000;
  const BOOK_OPTIONS = [['toffee', 'TOFFEE_CAKE'], ['pink', 'PINK_PEARLS'], ['tellurium', 'TELLURIUM']];
  const SHORT_CODE = (p) => p.replace('VOUCHER_', 'V').replace('_PEARLS', '').replace('_', ' ').slice(0, 7);

  const continuityStep = {
    title: 'Clean, continuous data: each day opens where the last closed',
    controls: [],
    render() {
      const rows = cached('continuity', () => E.continuity().slice().sort((a, b) => b.worst - a.worst));
      const all = rows.flatMap((r) => r.gaps.map(Math.abs)).sort((a, b) => a - b);
      const median = all[Math.floor(all.length / 2)];
      const worst = rows[0];
      const chart = bars({
        w: 1150, h: 230, categories: rows.map((r) => SHORT_CODE(r.product)), y: [0, 5], valueFormat: (v) => fmt(v, 2),
        groups: [{ label: 'largest overnight gap', color: COLORS.blue, values: rows.map((r) => r.worst) }],
        hlines: [{ y: 2, color: COLORS.green, dash: '5 4', label: 'two ordinary 10-tick moves' }],
      });
      return chain({
        question: 'Can the three days be treated as one continuous market, or do they need stitching?',
        baseline: 'If each day were reset or re-based, the open would jump away from the previous close by far more than an ordinary move.',
        observed: `Across ${PRODUCTS} products and 2 overnight boundaries, the median gap between close and next open is ${fmt(median, 2)} ordinary 10-tick moves. The largest is ${fmt(worst.worst, 1)} (${worst.product}). Every product has 10,000 snapshots per day: ${fmt(SNAPSHOTS)} in total.`,
        conclusion: 'Each day opens where the last one closed. Fair values, positions and fitted parameters can carry straight across days, and the series can be joined for estimation.',
        strategy: 'Every strategy keeps one state across days and is fitted on the joined three-day series.',
      }) + K.legend([[COLORS.blue, 'Largest |open − previous close| per product, in units of a normal 10-tick move']]) + chart;
    },
  };

  const imbalanceStep = {
    title: 'Order book doesn’t predict price',
    controls: [
      { id: 'product', label: 'Product', type: 'select', value: 'toffee', options: BOOK_OPTIONS },
      { id: 'h', label: 'Predict the move over', type: 'select', value: '1', options: [['1', 'next tick'], ['10', 'next 10 ticks'], ['100', 'next 100 ticks']] },
    ],
    render(p) {
      const r = cached(`imb:${p.product}:${p.h}`, () => E.imbalanceCorrelation(p.product, +p.h));
      const name = BOOK_OPTIONS.find(([v]) => v === p.product)[1];
      const shown = r.bins.filter((b) => b.n >= 30);
      const scale = Math.max(1, ...shown.map((b) => Math.abs(b.mean))) * 1.3;
      const chart = bars({
        h: 230, categories: shown.map((b) => `${b.lo.toFixed(1)}…${b.hi.toFixed(1)}`), subLabels: shown.map((b) => `n=${fmt(b.n)}`),
        showValues: true, valueFormat: (v) => fmt(v, 2), y: [-scale, scale],
        groups: [{ label: 'mean next move', color: COLORS.purple, values: shown.map((b) => b.mean) }],
      });
      const detectable = Math.abs(r.corr) > r.noiseBand;
      const r2 = r.corr * r.corr;
      return chain({
        question: 'Does order-book imbalance (more size on the bid than the ask) predict where the price goes next?',
        baseline: 'If imbalance carried information, the average next move would climb steadily from ask-heavy books (left) to bid-heavy books (right).',
        observed: `${name}, ${p.h === '1' ? 'next tick' : `next ${p.h} ticks`}: correlation ${signed(r.corr, 4)} (noise band ±${fmt(r.noiseBand, 4)} from ${fmt(r.n)} snapshots). ${detectable ? 'Statistically detectable, but' : 'Indistinguishable from zero:'} imbalance explains ${fmt(100 * r2, 3)}% of the move.`,
        conclusion: 'The shape of the book is noise for direction. Every product stays below |0.035| (slide 9), far too weak to pay a spread, so we did not build an order-book signal.',
        strategy: 'Effort went into the structural patterns on slide 10 instead of microstructure prediction.',
      }) + K.legend([[COLORS.purple, 'Average mid change after each imbalance bucket (bid − ask) / (bid + ask)']]) + chart;
    },
  };

  const MARKOUTS = [1, 5, 10, 20, 50, 100, 200];

  const traderStep = {
    title: 'Most traders are random: noise bots pay half the spread',
    controls: [{ id: 'product', label: 'Product', type: 'select', value: 'toffee', options: BOOK_OPTIONS.slice(0, 2) }],
    render(p) {
      const curve = cached(`markout:${p.product}`, () => MARKOUTS.map((h) => E.tradePrints(p.product, h)));
      const base = curve[MARKOUTS.indexOf(20)];
      const name = BOOK_OPTIONS.find(([v]) => v === p.product)[1];
      const places = [['below bid', (o) => o < -1.01], ['at the bid', (o) => o >= -1.01 && o <= -0.99], ['inside', (o) => o > -0.99 && o < 0.99], ['at the ask', (o) => o >= 0.99 && o <= 1.01], ['above ask', (o) => o > 1.01]];
      const where = bars({
        w: 520, h: 200, categories: places.map(([l]) => l), showValues: true, valueFormat: (v) => fmt(v, 0),
        groups: [{ label: 'market prints', color: COLORS.blue, values: places.map(([, f]) => base.prints.filter((x) => f(x.offset)).length) }],
      });
      const markout = lines({
        n: MARKOUTS.length, w: 520, h: 200, y: [0, Math.max(...curve.map((c) => c.meanEdge), base.meanHalf) * 1.3], yLabel: 'Passive side’s gain per lot, k ticks after the print',
        series: [{ ys: curve.map((c) => c.meanEdge), color: COLORS.green, width: 2.5 }],
        hlines: [{ y: base.meanHalf, color: COLORS.slate, dash: '5 4', label: `half spread ${fmt(base.meanHalf, 1)}` }],
        markers: curve.map((c, i) => ({ x: i, y: c.meanEdge, color: COLORS.green, r: 4, title: `${MARKOUTS[i]} ticks: ${fmt(c.meanEdge, 2)}` })),
        xTicks: MARKOUTS.map((k, i) => ({ x: i, label: `${k}` })),
      });
      return chain({
        question: 'Who is on the other side of our quotes, and do they know where the price is going?',
        baseline: 'Informed traders hit quotes just before the price moves their way, so a market maker’s gain would fade to zero or below in the ticks after each trade.',
        observed: `${name}: ${pct(base.atTouchShare)} of ${fmt(base.prints.length)} market prints happen exactly at the best bid or ask. 20 ticks later the passive side is still up ${fmt(base.meanEdge, 1)} per lot against a half spread of ${fmt(base.meanHalf, 1)}: the price does not follow the trade.`,
        conclusion: 'The flow is uninformed: it crosses the spread and the price ignores it. Resting quotes at the best bid and ask collect that half spread.',
        strategy: 'S1 and S5 quote at the touch and skew size to manage inventory (slides 16 and 20).',
      }) + K.split(K.legend([[COLORS.blue, 'Where market trades print']]) + where, K.legend([[COLORS.green, 'Maker gain after the print'], [COLORS.slate, 'Half spread']]) + markout);
    },
  };

  const STRUCTURES = [
    ['Fixed anchor', 'AMETHYST never moves from 10,000', 'S1'],
    ['Mean reversion', 'TOFFEE_CAKE keeps returning to ~5,000', 'S1'],
    ['Sum constraint', 'The five pearls add up to 50,000', 'S2'],
    ['Step-downs', 'GOLDEN_PEARLS stays flat, then drops', 'S2'],
    ['Big jumps', 'TELLURIUM jumps 150+ points', 'S4'],
    ['Mispriced options', 'Vouchers priced ~20-30% too high', 'S3'],
  ];

  const structureStep = {
    title: 'Profit comes from structure',
    controls: [],
    render() {
      const cards = STRUCTURES.map(([name, claim, s], i) => `<button class="eda-link" data-open-lab="eda" data-step="${i}"><b>${name}</b><span>${claim}</span><em>${s} · see the evidence →</em></button>`).join('');
      return chain({
        question: 'If the order book and the trade flow carry no forecast, where can a strategy earn more than the spread?',
        baseline: 'With no structure, prices would be random walks and the half spread from noise traders would be the only edge.',
        observed: 'Six products break the random walk in specific, testable ways: a fixed price, a pull to a mean, a sum constraint, slow steps, discrete jumps and an option premium.',
        conclusion: 'Profit comes from exploiting each product’s structure, one specialised strategy per pattern, on top of market making.',
        strategy: 'Five strategy families (S1-S5) under one orchestrator (slides 13 to 21).',
      }) + `<div class="eda-links">${cards}</div>`;
    },
  };

  QF.labs.register('eda-data', {
    deriveLabel: 'Evidence',
    kicker: 'EDA EVIDENCE · SLIDE 9',
    title: 'EDA results: what the data allowed us to conclude',
    evidence: 'Before building strategies we tested what the data could and could not support. Each card on slide 9 is a test against a no-structure baseline, recomputed here from the raw data.',
    source: 'Statistics recomputed live from backtester/QuantFi Price Data and Trades Data (days −2, −1, 0). Overnight gaps use the deck’s saved 10-tick sample for all 26 products; the book and trade tests use every tick for the products stored with full books.',
    steps: [continuityStep, imbalanceStep, traderStep, structureStep],
    replay: {
      label: 'Scorecard · every finding vs its baseline',
      controls: [],
      render: scorecard,
      note: 'The baseline column is what we would expect with no exploitable structure. Slide 9 rows explain what we chose not to build; slide 10 rows explain what we did build.',
    },
  });
})(window);
