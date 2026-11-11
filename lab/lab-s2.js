/* S2 lab: PINK_PEARLS corrective jumps and GOLDEN_PEARLS step detection (slides 17, 35, 36). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, dayTicks, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const PINK_HALF_SPREAD = 2; // PINK spread is ~4 on every real day

  const memo = new Map();
  const cached = (key, build) => {
    if (!memo.has(key)) memo.set(key, build());
    return memo.get(key);
  };

  const sumStep = {
    title: 'Evidence: the five pearls sum to 50,000',
    controls: [K.dayControl('-1')],
    render(p) {
      const dev = QF.s2.deviation(p.day);
      const mid = QF.book(p.day, 'pink').mid;
      const big = dev.filter((d) => Math.abs(d) >= 10).length;
      const chart = lines({
        n: dev.length, h: 210, y: [-22, 22], yLabel: 'Pearl-sum deviation D = Σ pearl mids − 50,000',
        series: [{ ys: dev, color: COLORS.blue, width: 1.1 }],
        bands: [{ y0: 10, y1: 22, color: '#e0644c14' }, { y0: -10, y1: -22, color: '#2fb36a14' }],
        hlines: [{ y: 10, color: COLORS.coral, dash: '5 4', label: 'D ≥ 10: PINK expected to fall' }, { y: -10, color: COLORS.green, dash: '5 4', label: 'D ≤ −10: PINK expected to rise' }, { y: 0 }],
        xTicks: dayTicks(dev.length),
      });
      const pink = lines({
        n: mid.length, h: 150, yLabel: 'PINK_PEARLS mid: flat, then instant jumps', series: [{ ys: mid, color: COLORS.purple, width: 1.3 }], xTicks: dayTicks(mid.length),
      });
      return chart + pink + K.split(
        K.facts([
          ['Mean deviation this day', fmt(QF.mean(dev), 2)],
          ['Ticks with |D| ≥ 10', `${fmt(big)} <small>(${fmt((big / dev.length) * 100, 1)}%)</small>`],
          ['PINK jumps this day', fmt(QF.s2.jumps([p.day]).length)],
        ]),
        K.takeaway('The sum stays pinned near 50,000. When the other pearls drift the sum away, PINK jumps to restore it: the deviation is a forecast of PINK’s next move (slide 10, “Sum constraint”).'),
      );
    },
  };

  const evidenceStep = {
    title: 'Historical evidence: PINK corrects the deviation',
    controls: [{ id: 'horizon', label: 'Forecast horizon H (ticks)', min: 1, max: 100, step: 1, value: 20 }],
    render(p) {
      const ev = cached(`ev:${p.horizon}`, () => QF.s2.evidence(QF.DAYS, p.horizon));
      const chart = bars({
        h: 250, categories: ev.map((b) => b.label), subLabels: ev.map((b) => `n=${fmt(b.n)}`),
        groups: [{ label: `mean PINK change over ${p.horizon} ticks`, color: COLORS.blue, values: ev.map((b) => b.mean) }],
        errors: ev.map((b) => ({ lo: b.lo, hi: b.hi })), showValues: true, valueFormat: (v) => fmt(v, 2),
        y: [-12, 12], label: 'Mean PINK move by deviation bucket',
      });
      return chart + K.split(
        K.formula(`E[ΔPINK<sub>t→t+${p.horizon}</sub> | D<sub>t</sub> bucket], pooled over days −2, −1, 0<br>
          D ≤ −10 → <strong>${signed(ev[0].mean, 2)}</strong> &nbsp; D ≥ 10 → <strong>${signed(ev[5].mean, 2)}</strong>`),
        K.takeaway('This recomputes the slide-17 chart live from the price CSVs (95% intervals use plain standard errors; the slide used a moving-block bootstrap). Slide the horizon: the correction builds over ~20 ticks and then flattens, which is why H = 20.'),
      );
    },
  };

  const betaStep = {
    title: 'Jump size: estimate the correction slope β',
    controls: [],
    render() {
      const rows = cached('jumps', () => QF.s2.jumps(QF.DAYS));
      const beta = QF.s2.fitBeta(rows);
      const xs = rows.map((r) => r.dev);
      const lo = Math.floor(Math.min(...xs));
      const hi = Math.ceil(Math.max(...xs));
      const grid = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      const chart = lines({
        n: grid.length, h: 260, y: [-30, 30], yLabel: 'PINK jump size vs deviation just before it',
        series: [{ ys: grid.map((d) => beta * d), color: COLORS.blue, width: 2.5 }],
        markers: rows.map((r) => ({ x: r.dev - lo, y: r.move, color: '#7a5af5aa', r: 3.2, title: `D ${fmt(r.dev, 1)} → jump ${fmt(r.move, 1)}` })),
        hlines: [{ y: 0 }],
        xTicks: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: Math.round(f * (grid.length - 1)), label: fmt(grid[Math.round(f * (grid.length - 1))]) })),
      });
      return chart + K.split(
        K.formula(`jump = β · D + ε &nbsp;(least squares through the origin)<br>β̂ = Σ D·jump / Σ D² = <strong>${fmt(beta, 3)}</strong> &nbsp;from ${fmt(rows.length)} jumps`),
        K.takeaway('Every jump moves PINK against the deviation, and by slightly more than the deviation itself: β ≈ −1.1, the value in the S2 notes. A jump does not just close the gap, it overshoots it a little.'),
      );
    },
  };

  const hazardStep = {
    title: 'Jump timing: hazard rate by deviation size',
    controls: [],
    render() {
      const fitted = cached('hazards', () => QF.s2.fitHazards(QF.DAYS));
      const labels = ['|D| < 5', '5 ≤ |D| < 10', '|D| ≥ 10'];
      const chart = bars({
        h: 230, categories: labels, subLabels: fitted.map((f) => `${fmt(f.jumps)} jumps in ${fmt(f.ticks)} ticks`),
        groups: [
          { label: 'measured h', color: COLORS.blue, values: fitted.map((f) => f.h) },
          { label: 'prior (params.json)', color: COLORS.mint, values: QF.s2.HAZARD_PRIOR.map((b) => b.h) },
        ],
        showValues: true, valueFormat: (v) => fmt(v, 4), y: [0, 0.08],
      });
      return chart + K.split(
        K.formula(`h(|D|) = P(jump next tick | |D|)<br>P(at least one jump in H) = 1 − (1 − h)<sup>H</sup><br>
          |D| ≥ 10, H = 20: 1 − (1 − ${fmt(fitted[2].h, 3)})<sup>20</sup> = <strong>${fmt(QF.s2.jumpProbability(fitted[2].h, 20), 2)}</strong>`),
        K.takeaway('Blue = measured from the data, green = the prior S2 starts from. Jumps almost never happen while the sum is in balance and become ~150× more likely once it is 10 or more out. S2 keeps a Beta-Bernoulli posterior per bucket so the hazard adapts live.'),
      );
    },
  };

  const forecastStep = {
    title: 'Expected move and the trade decision',
    controls: [
      { id: 'dev', label: 'Deviation D', min: -25, max: 25, step: 0.5, value: 12 },
      { id: 'h', label: 'Hazard h (per tick)', min: 0.001, max: 0.15, step: 0.001, value: 0.05, format: (v) => v.toFixed(3) },
      { id: 'beta', label: 'Slope β', min: -1.5, max: -0.5, step: 0.01, value: -1.1, format: (v) => v.toFixed(2) },
      { id: 'H', label: 'Horizon H', min: 1, max: 60, step: 1, value: 20 },
    ],
    render(p) {
      const prob = QF.s2.jumpProbability(p.h, p.H);
      const e = QF.s2.expectedMove(p.dev, p.h, p.beta, p.H);
      const devs = Array.from({ length: 101 }, (_, i) => -25 + i * 0.5);
      const curve = devs.map((d) => QF.s2.expectedMove(d, QF.s2.hazardFor(Math.abs(d)), p.beta, p.H));
      const yMax = Math.max(18, ...curve.map(Math.abs), Math.abs(e)) * 1.1;
      const action = e > PINK_HALF_SPREAD ? '<b class="buy">BUY PINK</b>' : e < -PINK_HALF_SPREAD ? '<b class="sell">SELL PINK</b>' : 'wait (edge below the crossing cost)';
      const chart = lines({
        n: devs.length, h: 230, y: [-yMax, yMax], yLabel: 'E[ΔPINK] using the bucketed hazard',
        series: [{ ys: curve, color: COLORS.blue, width: 2.5 }],
        bands: [{ y0: -PINK_HALF_SPREAD, y1: PINK_HALF_SPREAD, color: '#7d8fb022' }],
        hlines: [{ y: PINK_HALF_SPREAD, color: COLORS.slate, dash: '4 3', label: 'half spread = 2' }, { y: -PINK_HALF_SPREAD, color: COLORS.slate, dash: '4 3' }],
        markers: [{ x: (p.dev + 25) * 2, y: e, color: COLORS.amber, r: 6, title: 'your inputs' }],
        xTicks: [-25, -10, 0, 10, 25].map((d) => ({ x: (d + 25) * 2, label: `${d}` })),
      });
      return chart + K.split(
        K.formula(`E[ΔP] = [1 − (1 − h)<sup>H</sup>] · β · D<br>= [1 − (1 − ${fmt(p.h, 3)})<sup>${p.H}</sup>] × ${fmt(p.beta, 2)} × ${fmt(p.dev, 1)}<br>
          = ${fmt(prob, 3)} × ${fmt(p.beta * p.dev, 2)} = <strong>${signed(e, 2)}</strong><br>Decision: ${action}`),
        K.takeaway('This is the formula on slide 17. With D = 12, h = 0.05 and β = −1.1 the jump probability is 0.64 and the expected move is −8.5, so S2 sells PINK. The step in the blue curve shows why only |D| ≥ 10 clears the 2-point crossing cost.'),
      );
    },
  };

  const goldenStep = {
    title: 'GOLDEN + BLACK: CUSUM step detection',
    controls: [
      K.dayControl('0'),
      { id: 'k', label: 'Drift allowance k', min: 0.25, max: 4, step: 0.25, value: 1 },
      { id: 'h', label: 'Alarm threshold h', min: 1, max: 30, step: 0.5, value: 5 },
    ],
    render(p) {
      const c = QF.s2.cusum(p.day, { k: p.k, h: p.h });
      const stat = c.up.map((u, i) => Math.max(u, c.down[i]));
      const price = lines({
        n: c.mid.length, h: 220, yLabel: 'GOLDEN_PEARLS mid and tracked plateau', xTicks: dayTicks(c.mid.length),
        series: [{ ys: c.mid, color: COLORS.blue, width: 1.3 }, { ys: c.plateau, color: COLORS.amber, width: 1.4, dash: '5 4' }],
        markers: c.alarms.map((a) => ({ x: a.tick, y: c.mid[a.tick], color: COLORS.coral, shape: a.dir > 0 ? 'up' : 'down', r: 7, title: `CUSUM alarm at tick ${a.tick}` })),
      });
      const cus = lines({
        n: stat.length, h: 130, y: [0, Math.max(p.h * 1.4, 2)], yLabel: 'max(S⁺, S⁻)', xTicks: dayTicks(stat.length),
        series: [{ ys: stat, color: COLORS.purple, width: 1.2 }], hlines: [{ y: p.h, color: COLORS.coral, dash: '5 4', label: `alarm at h = ${p.h}` }],
      });
      return price + cus + K.split(
        K.formula(`x<sub>t</sub> = mid<sub>t</sub> − plateau<sub>t</sub><br>S⁺ = max(0, S⁺ + x<sub>t</sub> − k), &nbsp;S⁻ = max(0, S⁻ − x<sub>t</sub> − k)<br>alarm when S⁺ or S⁻ &gt; h → <strong>${c.alarms.length} step${c.alarms.length === 1 ? '' : 's'}</strong> detected`),
        K.takeaway('GOLDEN sits flat for long stretches, then steps by about 50 to 100 over a short ramp. CUSUM accumulates small departures that a single-tick test would miss, so S2 catches the step about 2 ticks in and trades the remaining move (EDA: price kept falling ~33 over the next 20 ticks). Lower k or h and noise starts raising false alarms.'),
      );
    },
  };

  const replay = {
    label: 'Strategy in action · PINK on real days',
    controls: [
      K.dayControl('-2'),
      { id: 'beta', label: 'Slope β', min: -1.5, max: -0.5, step: 0.01, value: -1.1, format: (v) => v.toFixed(2) },
      { id: 'hurdle', label: 'Extra hurdle over half spread', min: 0, max: 6, step: 0.25, value: 2 },
      { id: 'exitBand', label: 'Flatten when |D| below', min: 0, max: 10, step: 0.5, value: 4 },
      { id: 'horizon', label: 'Horizon H', min: 5, max: 60, step: 1, value: 20 },
    ],
    run: (p) => QF.s2.replay(p.day, { beta: p.beta, hurdle: p.hurdle, exitBand: p.exitBand, horizon: p.horizon }),
    length: (r) => r.mid.length,
    view(r, i) {
      const n = r.mid.length;
      const ticks = dayTicks(n);
      const dev = lines({
        n, w: 1150, h: 150, y: [-22, 22], yLabel: 'Deviation D (trade zone |D| ≥ 10)', cursor: i, xTicks: ticks,
        series: [{ ys: r.dev, to: i + 1, color: COLORS.blue, width: 1.1 }],
        hlines: [{ y: 10, color: COLORS.coral, dash: '5 4' }, { y: -10, color: COLORS.green, dash: '5 4' }, { y: 0 }],
      });
      const price = lines({
        n, w: 1150, h: 190, yLabel: 'PINK_PEARLS mid with trades', cursor: i, xTicks: ticks,
        series: [{ ys: r.mid, to: i + 1, color: COLORS.purple, width: 1.4 }],
        markers: K.fillMarkers(r.fills, i, (f) => f.price),
        y: [Math.min(...r.mid) - 3, Math.max(...r.mid) + 3],
      });
      const position = lines({
        n, w: 570, h: 160, y: [-23, 23], yLabel: 'Position (limit ±20)', cursor: i, xTicks: ticks,
        series: [{ ys: r.position, to: i + 1, color: COLORS.purple, width: 1.6 }],
        hlines: [{ y: 20, color: COLORS.coral, dash: '4 3' }, { y: -20, color: COLORS.coral, dash: '4 3' }, { y: 0 }],
      });
      const pnl = lines({
        n, w: 570, h: 160, yLabel: 'P&L (marked to mid)', cursor: i, xTicks: ticks,
        series: [{ ys: r.pnl, to: i + 1, color: COLORS.green, width: 2 }],
        y: [Math.min(0, ...r.pnl) - 200, Math.max(...r.pnl) * 1.05 + 200], hlines: [{ y: 0 }],
      });
      const s = K.tradeSummary(r.fills, i);
      return {
        panels: [dev, price, position, pnl],
        fullWidth: 2,
        stats: [
          ['P&L', signed(r.pnl[i]), r.pnl[i] >= 0 ? 'good' : 'bad'],
          ['Position', signed(r.position[i])],
          ['Deviation D', signed(r.dev[i], 1)],
          ['E[ΔPINK, H]', signed(r.expected[i], 2)],
          ['Trades', fmt(r.fills.filter((f) => f.tick <= i).length)],
        ],
        event: K.lastFillText(s.last, s.last ? ` · D was ${signed(r.dev[s.last.tick], 1)}` : ''),
      };
    },
    note: `<b>Simplified re-implementation of the PINK component on real order books.</b> It crosses the real spread to enter when E[ΔPINK] beats the half spread plus the hurdle, and to exit once the sum is back in balance.
      The submitted S2 also rests passive quotes at the touch, updates the hazard and slope online, and adds restorative-jump and slope safeguards.
      In the ablation, removing the PINK correction cut S2’s development P&L from 21,080 to 10,428 (its single largest component).`,
  };

  QF.labs.register('s2', {
    kicker: 'STRATEGY LAB · S2 STRUCTURAL ALPHA',
    title: 'S2 · PINK corrective jumps and GOLDEN step detection',
    evidence: 'Estimate the probability and magnitude of corrective jumps in the five-pearl sum; detect emerging steps and trade the remaining move (slides 17, 35, 36). Each step below derives one piece of E[ΔP] = [1 − (1 − h)<sup>H</sup>]βd from the raw data.',
    source: 'Sources: Team 05 deck slides 10, 17, 35 and 36; Trading_Algorithm/strategies/S2/NOTES.md; Strategy_EDA_and_Ablation_Explained.pdf. Prices: backtester/QuantFi Price Data (days −2, −1, 0).',
    steps: [sumStep, evidenceStep, betaStep, hazardStep, forecastStep, goldenStep],
    replay,
  });
})(window);
