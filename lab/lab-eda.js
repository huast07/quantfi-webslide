/* EDA evidence lab for slide 10 ("Where the profit comes from"). Each step walks one finding from
 * question to baseline to what the data shows to the conclusion and the strategy it produced. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const E = QF.eda;
  const DAY_NAMES = { '-2': 'Day −2', '-1': 'Day −1', 0: 'Day 0' };
  const REAL_DAY = (value) => K.dayControl(value);
  const pct = (x, d = 0) => `${fmt(100 * x, d)}%`;
  const memo = new Map();
  const cached = (key, build) => {
    if (!memo.has(key)) memo.set(key, build());
    return memo.get(key);
  };

  /** Question → baseline → observed → conclusion → strategy: the reasoning chain shown at the top of every step. */
  function chain({ question, baseline, observed, conclusion, strategy }) {
    const cell = (cls, title, body) => `<li class="${cls}"><b>${title}</b><p>${body}</p></li>`;
    return `<ol class="eda-chain">${cell('q', 'Question', question)}${cell('base', 'If there were no structure', baseline)}${cell('obs', 'What the data shows', observed)}${cell('verdict', 'So we concluded', conclusion)}${cell('strategy', 'Which became', strategy)}</ol>`;
  }

  /** x-axis labels for a series that joins the three days end to end. */
  const threeDayTicks = (n) => QF.DAYS.map((d, i) => ({ x: Math.round(((i + 0.5) * n) / 3), label: DAY_NAMES[d] }));
  const dayBoundaries = (n) => [1, 2].map((i) => ({ x: Math.round((i * n) / 3), color: '#c3d1e8' }));

  /* ---------- 1. Fixed anchor ---------- */

  const anchorStep = {
    title: 'Fixed anchor: AMETHYST never moves from 10,000',
    controls: [{ id: 'seed', label: 'Simulated random walk (draw)', min: 1, max: 20, step: 1, value: 3 }],
    render(p) {
      const a = cached('anchor', () => E.anchor());
      const next = QF.rng(7919 * p.seed);
      let level = a.level;
      const walk = a.xs.map(() => (level += a.step * QF.gaussian(next)));
      const lo = Math.min(9960, ...walk);
      const hi = Math.max(10040, ...walk);
      const values = a.values.map((v) => fmt(v.value, 1)).join(' · ');
      const chart = lines({
        n: a.xs.length, h: 240, y: [lo - 5, hi + 5], yLabel: 'AMETHYST mid (blue) vs a random walk with the same step size (grey)', xTicks: threeDayTicks(a.xs.length),
        series: [{ ys: walk, color: COLORS.slate, width: 1.3, dash: '5 3' }, { ys: a.xs, color: COLORS.blue, width: 2 }],
        hlines: [{ y: a.level, color: COLORS.green, dash: '4 3', label: '10,000' }],
        vlines: dayBoundaries(a.xs.length),
      });
      return chain({
        question: 'Does AMETHYST have a moving fair value that we need to estimate?',
        baseline: `A random walk with AMETHYST’s own step size drifts about ±${fmt(a.randomWalkSd, 0)} over three days (grey line).`,
        observed: `Only three prices ever appear: ${values}. In ${fmt(a.xs.length)} snapshots the mid is never more than ${fmt(a.maxDev, 1)} from 10,000.`,
        conclusion: 'Fair value is a known constant, not an estimate. Every fill away from 10,000 is pure spread capture, with no risk of the price drifting away from us.',
        strategy: 'S1 quotes AMETHYST around a fixed 10,000 (slide 16).',
      }) + chart + K.split(
        K.facts(a.values.map((v) => [`Share of snapshots at ${fmt(v.value, 1)}`, pct(v.share, 1)])),
        K.facts([['This random walk ends', `${signed(walk.at(-1) - a.level, 1)} from 10,000`]]) + K.takeaway('Change the draw: every random walk with AMETHYST’s step size wanders tens of points away. The real price never leaves the half-tick band around 10,000.'),
      );
    },
  };

  /* ---------- 2. Mean reversion ---------- */

  const HORIZONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const TOFFEE_ANCHOR = 5000;
  const REVERSION_WINDOW = 500;

  const reversionStep = {
    title: 'Mean reversion: TOFFEE_CAKE keeps returning to ~5,000',
    controls: [
      { id: 'ki', label: 'Horizon k (ticks)', min: 0, max: HORIZONS.length - 1, step: 1, value: HORIZONS.length - 1, format: (i) => fmt(HORIZONS[i]) },
      { id: 'band', label: 'Excursion band ± around 5,000', min: 10, max: 40, step: 5, value: 20 },
    ],
    render(p) {
      const spread = cached('spread', () => E.horizonSpread('toffee', HORIZONS));
      const rev = cached(`rev:${p.band}`, () => E.reversion('toffee', TOFFEE_ANCHOR, p.band, REVERSION_WINDOW));
      const at = spread[p.ki];
      const spreadChart = lines({
        n: HORIZONS.length, h: 220, y: [0, 150], yLabel: 'Typical size of a k-tick move: TOFFEE (blue) vs random walk √k (grey)',
        series: [{ ys: spread.map((s) => s.randomWalk), color: COLORS.slate, width: 2, dash: '6 4' }, { ys: spread.map((s) => s.actual), color: COLORS.blue, width: 2.5 }],
        markers: [{ x: p.ki, y: at.actual, color: COLORS.blue, r: 6 }, { x: p.ki, y: at.randomWalk, color: COLORS.slate, r: 6 }],
        xTicks: HORIZONS.map((k, i) => ({ x: i, label: fmt(k) })).filter((_, i) => i % 2 === 0 || i === HORIZONS.length - 1),
      });
      const mids = cached('toffeeMids', () => QF.DAYS.flatMap((d) => Array.from(QF.book(d, 'toffee').mid)));
      const priceChart = lines({
        n: mids.length, h: 200, yLabel: `TOFFEE_CAKE mid, all three days · band 5,000 ± ${p.band}`, xTicks: threeDayTicks(mids.length),
        series: [{ ys: mids, color: COLORS.blue, width: 1.1 }],
        bands: [{ y0: TOFFEE_ANCHOR - p.band, y1: TOFFEE_ANCHOR + p.band, color: '#2fb36a1c' }],
        hlines: [{ y: TOFFEE_ANCHOR, color: COLORS.green, dash: '4 3', label: '5,000' }],
        vlines: dayBoundaries(mids.length),
      });
      return chain({
        question: 'Is TOFFEE_CAKE a random walk, or is something pulling it back?',
        baseline: `For a random walk the typical move grows like √k: ±${fmt(at.randomWalk, 0)} over ${fmt(at.k)} ticks.`,
        observed: `TOFFEE moves only ±${fmt(at.actual, 0)} over ${fmt(at.k)} ticks (${pct(at.actual / at.randomWalk)} of the random walk), and ${pct(rev.share, 1)} of ${fmt(rev.leaves)} trips beyond ±${p.band} come back within ${fmt(REVERSION_WINDOW)} ticks.`,
        conclusion: 'Moves stop growing after a few hundred ticks and excursions come back: the price is pulled toward ~5,000. Distance from the mean is itself a forecast of the next move.',
        strategy: 'S1 models TOFFEE as an Ornstein-Uhlenbeck process and leans quotes and inventory against the gap (slides 16 and 33).',
      }) + spreadChart + priceChart;
    },
  };

  /* ---------- 3. Sum constraint ---------- */

  const SHORT = { PINK_PEARLS: 'PINK', BLUE_PEARLS: 'BLUE', BLACK_PEARLS: 'BLACK', GOLDEN_PEARLS: 'GOLDEN', WHITE_PEARLS: 'WHITE' };
  const SET_OPTIONS = [['all', 'All five pearls'], ['no:PINK_PEARLS', 'Leave out PINK'], ['no:WHITE_PEARLS', 'Leave out WHITE'], ['no:BLUE_PEARLS', 'Leave out BLUE'], ['only:PINK_PEARLS', 'PINK alone']];
  const pearlSet = (key) => {
    if (key === 'all') return E.PEARLS;
    const [mode, name] = key.split(':');
    return mode === 'only' ? [name] : E.PEARLS.filter((x) => x !== name);
  };

  const sumStep = {
    title: 'Sum constraint: the five pearls always add up to 50,000',
    controls: [
      { id: 'set', label: 'Pearls in the total', type: 'select', value: 'all', options: SET_OPTIONS },
      { id: 'minMove', label: 'Restoring move of at least', min: 3, max: 10, step: 1, value: 5 },
    ],
    render(p) {
      const s = cached(`sum:${p.set}`, () => E.pearlSum(pearlSet(p.set)));
      const r = cached(`restore:${p.minMove}`, () => E.restoration(p.minMove));
      const widest = s.pearls.reduce((a, b) => (b.width > a.width ? b : a));
      const chart = lines({
        n: s.sum.length, h: 210, yLabel: `Total of: ${pearlSet(p.set).map((x) => SHORT[x]).join(' + ')}`, xTicks: threeDayTicks(s.sum.length),
        series: [{ ys: s.sum, color: s.complete ? COLORS.green : COLORS.coral, width: 1.3 }],
        y: s.complete ? [E.PEARL_TOTAL - 40, E.PEARL_TOTAL + 40] : undefined,
        hlines: s.complete ? [{ y: E.PEARL_TOTAL, color: COLORS.slate, dash: '4 3', label: '50,000' }] : [],
        vlines: dayBoundaries(s.sum.length),
      });
      const widths = bars({
        w: 520, h: 190, categories: [...s.pearls.map((x) => SHORT[x.product]), 'TOTAL OF 5'], showValues: true, valueFormat: (v) => fmt(v, 1),
        groups: [{ label: 'range over three days', color: COLORS.purple, values: [...s.pearls.map((x) => x.width), cached('sum:all', () => E.pearlSum()).width] }],
      });
      const observed = s.complete
        ? `The total never leaves ${fmt(s.lo, 1)} to ${fmt(s.hi, 1)} (sd ${fmt(s.sd, 1)}), although single pearls range up to ${fmt(widest.width)}. PINK leads ${pct(r.pinkShare)} of restoring moves of ${p.minMove}+, and all ${r.pinkJumps} of its jumps moved the total back toward 50,000.`
        : `Without all five pearls the total wanders ${fmt(s.width)} wide. The constraint only appears in the full sum, so it is a property of the whole set.`;
      return chain({
        question: 'Do the five pearls move independently, or are they linked?',
        baseline: `Independent prices would make the total at least as volatile as its parts: WHITE alone ranges ${fmt(s.pearls.find((x) => x.product === 'WHITE_PEARLS').width)}. Each pearl would share restoring moves equally (${pct(r.equalShare)} each).`,
        observed,
        conclusion: 'The pearls are tied to a hard total of 50,000 and PINK is the one that snaps it back. The deviation D = total − 50,000 forecasts PINK’s next move.',
        strategy: 'S2 trades PINK against D, sizing with a jump hazard and slope fitted to these jumps (slides 17, 34 and 35).',
      }) + chart + K.split(widths, K.facts([
        ['Restoring moves of the total', fmt(r.restoring)],
        ['Led by PINK', `${fmt(r.pinkLed)} <small>(${pct(r.pinkShare)} vs ${pct(r.equalShare)} if shared equally)</small>`],
        ['PINK jumps of 3+ that reduced |D|', `${fmt(r.pinkJumpsRestoring)} of ${fmt(r.pinkJumps)}`],
      ]));
    },
  };

  /* ---------- 4. Step-downs ---------- */

  const STEP_WINDOW = { before: 150, after: 350 };
  // Leave headroom above the plateau so the chart title and line labels sit clear of the data.
  const stepRange = (s) => {
    const lo = Math.min(s.before, s.after);
    const hi = Math.max(s.before, s.after);
    return [lo - 0.15 * (hi - lo), hi + 0.45 * (hi - lo)];
  };

  const stepStep = {
    title: 'Step-downs: GOLDEN_PEARLS stays flat, then drops',
    controls: [
      { id: 'which', label: 'Step', type: 'select', value: '0', options: [['0', 'Step 1'], ['1', 'Step 2'], ['2', 'Step 3']] },
      { id: 'thr', label: 'Trigger: move from plateau ≥', min: 1, max: 60, step: 1, value: 5 },
    ],
    render(p) {
      const g = cached('golden', () => E.goldenSteps());
      const found = E.stepDetection(g.steps, p.thr);
      const s = found[Math.min(+p.which, found.length - 1)];
      const from = Math.max(0, s.start - STEP_WINDOW.before);
      const to = Math.min(s.mid.length, s.start + STEP_WINDOW.after);
      const zoom = Array.from(s.mid.slice(from, to));
      const chart = lines({
        n: zoom.length, h: 230, y: stepRange(s), yLabel: `GOLDEN_PEARLS mid, ${DAY_NAMES[s.day]} · ${fmt(s.before, 1)} → ${fmt(s.after, 1)}`,
        series: [{ ys: zoom, color: COLORS.blue, width: 1.8 }],
        hlines: [{ y: s.before, color: COLORS.slate, dash: '4 3', label: `plateau ${fmt(s.before, 1)}` }, { y: s.after, color: COLORS.green, dash: '4 3', label: `new level ${fmt(s.after, 1)}` }],
        vlines: [{ x: s.start - from, color: COLORS.slate, label: 'step starts', row: 1 }, { x: s.detect - from, color: COLORS.coral, label: `trigger +${s.lag} ticks`, row: 2 }],
        markers: [{ x: s.detect - from, y: s.mid[s.detect], color: COLORS.coral, r: 6, title: `detected at ${fmt(s.mid[s.detect], 1)}` }],
        xTicks: [0, 100, 200, 300, 400, 499].filter((x) => x < zoom.length).map((x) => ({ x, label: `${x - (s.start - from) >= 0 ? '+' : ''}${x - (s.start - from)}` })),
      });
      const remaining = bars({
        w: 520, h: 190, categories: found.map((x, i) => `Step ${i + 1} (${DAY_NAMES[x.day]})`), showValues: true, valueFormat: (v) => `${fmt(v, 0)}%`, y: [0, 100],
        groups: [{ label: 'move still ahead at the trigger', color: COLORS.green, values: found.map((x) => 100 * Math.max(0, x.remainingShare)) }],
      });
      return chain({
        question: 'GOLDEN mostly sits still. Is there anything to trade?',
        baseline: 'If each drop were a single-tick gap, it would be over before anyone could react and nothing would be left to trade after seeing it.',
        observed: `Between steps the mid stays within ±1 of a flat plateau ${pct(g.calmShare, 1)} of the time. Each drop is a ramp: with a ${p.thr}-point trigger we are in ${s.lag} ticks after it starts and ${pct(Math.max(0, s.remainingShare))} of the move (${fmt(s.remaining, 1)}) is still ahead.`,
        conclusion: 'The steps are ramps, not gaps. A detector that ignores the ±1 quote noise but reacts within a few ticks catches them early enough to trade most of the move. Waiting for certainty (a large trigger) gives the move away.',
        strategy: 'S2’s GOLDEN component runs a CUSUM step detector and trades the remaining move (slides 17 and 35).',
      }) + chart + K.split(remaining, K.legend([[COLORS.green, 'Share of each step still ahead when the trigger fires']]) + K.takeaway('Drag the trigger: a small trigger keeps ~90% of every step, a 40-point trigger keeps under 60%, and on the 50-point step it keeps almost nothing.'));
    },
  };

  /* ---------- 5. Big jumps ---------- */

  const formatTiny = (x) => (x >= 0.01 ? fmt(x, 2) : x > 0 ? `≈ 10<sup>${Math.floor(Math.log10(x))}</sup>` : '≈ 0');

  const jumpStep = {
    title: 'Big jumps: TELLURIUM jumps 150+ points, 8-13 times a day',
    controls: [REAL_DAY('-1'), { id: 'thr', label: 'Count moves larger than', min: 10, max: 150, step: 5, value: 50 }],
    render(p) {
      const j = cached(`jump:${p.day}:${p.thr}`, () => E.jumpEvidence(p.day, p.thr));
      const chart = lines({
        n: j.change.length, h: 230, y: [-330, 330], yLabel: `TELLURIUM change per tick, ${DAY_NAMES[p.day]}`, xTicks: QF.chart.dayTicks(j.change.length),
        series: [{ ys: j.change, color: COLORS.slate, width: 1 }],
        bands: [{ y0: -p.thr, y1: p.thr, color: '#2fb36a14' }],
        hlines: [{ y: p.thr, color: COLORS.coral, dash: '5 4', label: `±${p.thr}` }, { y: -p.thr, color: COLORS.coral, dash: '5 4' }],
        markers: j.jumps.map((x) => ({ x: x.tick - 1, y: j.change[x.tick - 1], color: x.dir > 0 ? COLORS.green : COLORS.coral, r: 5, title: `${x.dir > 0 ? 'Up' : 'Down'} ${fmt(x.size, 1)}` })),
      });
      const sameSide = Math.max(j.up, j.down);
      const direction = `${j.up} up / ${j.down} down: a split this one-sided happens by chance ${pct(j.sameSideP, j.sameSideP < 0.01 ? 1 : 0)} of the time`;
      return chain({
        question: 'Is TELLURIUM just noisy, or does it jump?',
        baseline: `If moves were normal with the calm σ of ${fmt(j.sigmaCalm, 2)}, a move above ${p.thr} would happen ${formatTiny(j.expected)} times a day.`,
        observed: `${fmt(j.observed)} moves above ${p.thr}; tail weight (kurtosis) ${fmt(j.kurtosis)} against 3 for a normal. ${direction}.`,
        conclusion: `TELLURIUM is a calm random walk plus rare discrete jumps that a threshold separates cleanly. Jumps can share a direction within a day (${sameSide} of ${j.up + j.down} here), but not on every day, so direction has to be learned live, not assumed.`,
        strategy: 'S4 detects jumps with a volatility threshold and learns their direction with a Beta-Binomial posterior (slides 19 and 37).',
      }) + chart + K.facts([
        [`Moves larger than ${p.thr}`, fmt(j.observed)],
        ['Expected if moves were normal', formatTiny(j.expected)],
        ['Kurtosis (normal = 3)', fmt(j.kurtosis)],
        ['Same-direction split by chance', pct(j.sameSideP, 1)],
      ]);
    },
  };

  /* ---------- 6. Mispriced options ---------- */

  const volStep = {
    title: 'Mispriced options: vouchers are priced ~20-30% too high',
    controls: [REAL_DAY('-1')],
    render(p) {
      const v = cached(`vol:${p.day}`, () => E.volEvidence(p.day));
      const iv = v.implied.map((x) => 100 * x.iv);
      const chart = lines({
        n: iv.length, h: 230, y: [1.2, 2.6], yLabel: `Volatility per √day (%), ${DAY_NAMES[p.day]}: implied by vouchers (green) vs LYCHEE realised (blue)`, yFormat: (x) => `${x.toFixed(1)}%`,
        series: [{ ys: iv, color: COLORS.green, width: 2.5 }, { ys: iv.map(() => 100 * v.realised), color: COLORS.blue, width: 2.5, dash: '6 4' }],
        bands: [{ y0: 100 * v.realised, y1: 100 * v.meanIv, color: '#2fb36a1c' }],
        xTicks: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: Math.round(f * (iv.length - 1)), label: fmt(Math.round(f * 10000)) })),
      });
      return chain({
        question: 'Are the vouchers priced fairly for how much LYCHEE actually moves?',
        baseline: 'A fairly priced option implies the same volatility the underlying delivers: implied ÷ realised ≈ 1.',
        observed: `LYCHEE realised ${fmt(100 * v.realised, 2)}% per √day; at-the-money vouchers implied ${fmt(100 * v.meanIv, 2)}% on average: ${fmt(v.ratio, 2)}×, about ${pct(v.ratio - 1)} too expensive.`,
        conclusion: 'Vouchers carry a persistent volatility premium. LYCHEE’s own direction is unpredictable, so the edge is relative: price every strike off one fitted smile and trade the strikes that stray from it, hedged.',
        strategy: 'S3 fits the smile, sells rich strikes, buys cheap ones and delta-hedges with LYCHEE (slides 18 and 36).',
      }) + chart + K.facts(QF.DAYS.map((d) => {
        const x = cached(`vol:${d}`, () => E.volEvidence(d));
        return [`${DAY_NAMES[d]}: implied ÷ realised`, `${fmt(x.ratio, 2)}× <small>(${fmt(100 * x.meanIv, 2)}% vs ${fmt(100 * x.realised, 2)}%)</small>`];
      }));
    },
  };

  /* ---------- scorecard: every finding against its baseline ---------- */

  function scorecardRows() {
    return cached('scorecard', () => {
      const a = E.anchor();
      const spread = E.horizonSpread('toffee', [2000])[0];
      const all = E.pearlSum();
      const widest = Math.max(...all.pearls.map((x) => x.width));
      const g = E.stepDetection(E.goldenSteps().steps, 5);
      const jumps = QF.DAYS.map((d) => E.jumpEvidence(d, 50));
      const vols = QF.DAYS.map((d) => E.volEvidence(d));
      const gaps = E.continuity().flatMap((x) => x.gaps.map(Math.abs)).sort((x, y) => x - y);
      const imb = ['toffee', 'pink', 'tellurium'].flatMap((x) => [1, 10, 100].map((h) => Math.abs(E.imbalanceCorrelation(x, h).corr)));
      const prints = ['toffee', 'pink'].map((x) => E.tradePrints(x));
      return [
        ['9', 'Clean, continuous data', `median overnight gap ${fmt(gaps[Math.floor(gaps.length / 2)], 2)} normal moves`, 'a reset day opens far from the close', 'One state carried across days'],
        ['9', 'Order book doesn’t predict', `|correlation| ≤ ${fmt(Math.max(...imb), 3)}`, 'a usable signal needs ≫ 0.035', 'No imbalance signal built'],
        ['9', 'Most traders are random', `${pct(Math.min(...prints.map((x) => x.atTouchShare)))} of prints at the touch; maker keeps ${fmt(prints[0].meanEdge, 1)} vs ${fmt(prints[0].meanHalf, 1)} half spread`, 'informed flow erases the maker’s edge', 'S1 / S5 quote the touch'],
        ['10', 'Fixed anchor', `max |mid − 10,000| = ${fmt(a.maxDev, 1)}`, `random walk ±${fmt(a.randomWalkSd, 0)}`, 'S1 AMETHYST'],
        ['10', 'Mean reversion', `2,000-tick move ±${fmt(spread.actual, 0)}`, `random walk ±${fmt(spread.randomWalk, 0)}`, 'S1 TOFFEE_CAKE'],
        ['10', 'Sum constraint', `total ranges ${fmt(all.width, 1)}`, `widest pearl ranges ${fmt(widest)}`, 'S2 PINK'],
        ['10', 'Step-downs', `${pct(Math.min(...g.map((x) => x.remainingShare)))}+ of each step left after a 5-point trigger`, '0% if steps were instant', 'S2 GOLDEN'],
        ['10', 'Big jumps', `${jumps.map((x) => x.observed).join(' / ')} moves > 50 per day`, 'normal tails: ≈ 0', 'S4 TELLURIUM'],
        ['10', 'Mispriced options', `implied ÷ realised ${vols.map((x) => fmt(x.ratio, 2)).join(' / ')}`, '1.00 if fairly priced', 'S3 vouchers'],
      ];
    });
  }

  function scorecard() {
    const rows = scorecardRows().map(([slide, finding, stat, base, built]) => `<tr><td>${slide}</td><td><b>${finding}</b></td><td>${stat}</td><td>${base}</td><td>${built}</td></tr>`).join('');
    return `<table class="lab-table eda-scorecard"><thead><tr><th>Slide</th><th>Finding</th><th>What the data shows</th><th>No-structure baseline</th><th>Built into</th></tr></thead><tbody>${rows}</tbody></table>`
      + K.takeaway('Every row is computed live from the price and trade data in this deck. Each finding was accepted only because the data sits far from what a structureless market would produce, and each one maps to the strategy that exploits it.');
  }

  QF.edaKit = { chain, scorecard, threeDayTicks, cached, pct, DAY_NAMES };

  QF.labs.register('eda', {
    deriveLabel: 'Evidence',
    kicker: 'EDA EVIDENCE · SLIDE 10',
    title: 'Where the profit comes from: from data to conclusion',
    evidence: 'Each finding on slide 10 starts as a question. We compare the data with what a market with no structure would look like, and keep only the patterns the data clearly separates from that baseline. Each one became a strategy.',
    source: 'All statistics are recomputed live from backtester/QuantFi Price Data and Trades Data (days −2, −1, 0). Three-day series use the deck’s saved 10-tick sample; the rest use every tick.',
    steps: [anchorStep, reversionStep, sumStep, stepStep, jumpStep, volStep],
    replay: {
      label: 'Scorecard · every finding vs its baseline',
      controls: [],
      render: scorecard,
      note: 'The baseline column is what we would expect with no exploitable structure: a random walk, independent prices, instant gaps, normal tails or fair option prices.',
    },
  });
})(window);
