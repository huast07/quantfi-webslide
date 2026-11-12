/* S4 lab: TELLURIUM jump detection, Bayesian direction persistence and the tilt (slides 19 and 37). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, dayTicks, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const LIMIT = 40;
  const MEAN_JUMP = 170;
  const SOURCE_CONTROL = (value) => K.dayControl(value, [['sim', 'Simulated day']]);
  const jumpMarker = (mid) => (j) => ({
    x: j.tick, y: mid[j.tick], color: j.dir > 0 ? COLORS.green : COLORS.coral, shape: j.dir > 0 ? 'up' : 'down', r: 6,
    title: `${j.dir > 0 ? 'Up' : 'Down'} jump ${fmt(j.size, 1)} at tick ${fmt(j.tick)}`,
  });
  const tiltTarget = (p, tiltFull) => Math.round(LIMIT * QF.clip((2 * p - 1) / tiltFull, -1, 1));

  const pathStep = {
    title: 'Evidence: a random walk punctuated by jumps',
    controls: [SOURCE_CONTROL('-1')],
    render(p) {
      const { mid } = QF.s4.source(p.day);
      const det = QF.s4.detect(mid);
      const up = det.jumps.filter((j) => j.dir > 0).length;
      const chart = lines({
        n: mid.length, h: 250, yLabel: 'TELLURIUM mid', xTicks: dayTicks(mid.length),
        series: [{ ys: mid, color: COLORS.blue, width: 1.4 }],
        markers: det.jumps.map(jumpMarker(mid)),
      });
      return chart + K.split(
        K.facts([
          ['Jumps detected', `${det.jumps.length} <small>(${up} up / ${det.jumps.length - up} down)</small>`],
          ['Mean jump size', fmt(QF.mean(det.jumps.map((j) => j.size)), 1)],
          ['Calm σ per tick (end of day)', fmt(det.sigmaCalm, 2)],
        ]),
        K.takeaway('Between jumps the price is a small random walk (σ ≈ 1.6). A handful of single-tick jumps of about 80 to 300 carry almost all of the day’s movement, and within a day they tend to go the same way: 7 of 8 down on day −2, 9 of 9 up on day −1, mixed on day 0.'),
      );
    },
  };

  const detectorStep = {
    title: 'Jump detection: a threshold in the gap',
    controls: [
      SOURCE_CONTROL('0'),
      { id: 'floor', label: 'Floor (absolute)', min: 5, max: 80, step: 0.25, value: 38.75, format: (v) => v.toFixed(2) },
      { id: 'z', label: 'Multiple of calm σ', min: 3, max: 30, step: 0.5, value: 10 },
    ],
    render(p) {
      const { mid } = QF.s4.source(p.day);
      const det = QF.s4.detect(mid, { floor: p.floor, z: p.z });
      const truthTicks = new Set(QF.s4.detect(mid).jumps.map((j) => j.tick));
      const hit = det.jumps.filter((j) => truthTicks.has(j.tick)).length;
      const falseAlarms = det.jumps.length - hit;
      const missed = truthTicks.size - hit;
      const abs = Array.from(det.change, Math.abs);
      const thr = Math.max(p.floor, p.z * det.sigmaCalm);
      const chart = lines({
        n: abs.length, h: 240, y: [0, 320], yLabel: '|Δmid| per tick', xTicks: dayTicks(abs.length),
        series: [{ ys: abs, color: COLORS.slate, width: 1 }],
        bands: [{ y0: 0, y1: thr, color: '#2fb36a14' }],
        hlines: [
          { y: thr, color: COLORS.coral, dash: '6 4', label: `threshold ${fmt(thr, 2)}` },
          { y: 77.5, color: COLORS.green, dash: '3 3', label: 'smallest real jump 77.5' },
        ],
        markers: det.jumps.map((j) => ({ x: j.tick, y: j.size, color: truthTicks.has(j.tick) ? COLORS.green : COLORS.coral, r: 5, title: `${fmt(j.size, 1)} at tick ${fmt(j.tick)}` })),
      });
      return chart + K.split(
        K.formula(`jump if |Δmid| &gt; max(floor, z·σ<sub>calm</sub>)<br>= max(${fmt(p.floor, 2)}, ${p.z} × ${fmt(det.sigmaCalm, 2)}) = <strong>${fmt(thr, 2)}</strong><br>
          confirmed only if the next tick is calm`),
        K.facts([
          ['Detected', fmt(det.jumps.length)],
          ['False alarms (vs default detector)', `<span class="${falseAlarms ? 'sell' : ''}">${fmt(falseAlarms)}</span>`],
          ['Missed jumps', `<span class="${missed ? 'sell' : ''}">${fmt(missed)}</span>`],
        ]) + K.takeaway('On the real days every calm move is below 13.5 and every jump is above 77.5, so any threshold in that gap is perfect. Drag the floor below ~14 to watch false alarms appear.'),
      );
    },
  };

  function posteriorDensity(grid, post, up, down) {
    return grid.map((x) => post.weights.reduce((s, w) => {
      const a = w.c + up;
      const b = w.c + down;
      return s + w.weight * Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - QF.logBeta(a, b));
    }, 0));
  }

  const posteriorStep = {
    title: 'Direction: a Beta-Binomial posterior',
    controls: [
      { id: 'up', label: 'Up jumps so far n↑', min: 0, max: 12, step: 1, value: 3 },
      { id: 'down', label: 'Down jumps so far n↓', min: 0, max: 12, step: 1, value: 0 },
      { id: 'c', label: 'Prior concentration centre c', min: 0.1, max: 5, step: 0.05, value: 0.55, format: (v) => v.toFixed(2) },
    ],
    render(p) {
      const post = QF.s4.directionPosterior(p.up, p.down, p.c);
      const GRID_N = 199;
      const grid = Array.from({ length: GRID_N }, (_, i) => (i + 1) / (GRID_N + 1));
      const density = posteriorDensity(grid, post, p.up, p.down);
      const yMax = Math.min(12, Math.max(...density) * 1.1);
      const toIndex = (x) => QF.clip(Math.round(x * (GRID_N + 1)) - 1, 0, GRID_N - 1);
      const chart = lines({
        n: GRID_N, h: 220, y: [0, yMax], yLabel: 'Posterior density of the day’s up-probability',
        series: [{ ys: density.map((d) => Math.min(d, yMax)), color: COLORS.blue, width: 2.5 }],
        vlines: [{ x: toIndex(post.pUp), color: COLORS.coral, label: `P(next up) = ${post.pUp.toFixed(3)}` }],
        xTicks: [0.01, 0.25, 0.5, 0.75, 0.99].map((f) => ({ x: toIndex(f), label: f.toFixed(2) })),
      });
      const weights = bars({
        w: 460, h: 230, categories: post.weights.map((w) => w.c.toFixed(2)), showValues: true, valueFormat: (v) => fmt(v, 2),
        groups: [{ label: 'posterior weight', color: COLORS.purple, values: post.weights.map((w) => w.weight) }], y: [0, 1],
      });
      const single = QF.s4.simplePosterior(p.up, p.down, p.c);
      return chart + K.split(
        K.formula(`p ~ Beta(c, c) per day, &nbsp;each jump up with prob. p<br>P(up | n↑, n↓, c) = (c + n↑) / (2c + n↑ + n↓)<br>
          single c: (${p.c.toFixed(2)} + ${p.up}) / (${(2 * p.c).toFixed(2)} + ${p.up + p.down}) = ${single.toFixed(3)}<br>
          mixed over c (weights right): <strong>${post.pUp.toFixed(3)}</strong>`)
          + K.takeaway('Three one-way jumps already push P(up) close to 0.9. Mixed evidence shifts weight toward large c, so p stays near 0.5 and the tilt switches itself off: the whipsaw kill switch.'),
        K.legend([[COLORS.purple, 'Posterior weight of each concentration c']]) + weights,
      );
    },
  };

  const sizingStep = {
    title: 'From belief to position: the tilt',
    controls: [
      { id: 'p', label: 'P(next jump up)', min: 0, max: 1, step: 0.01, value: 0.87, format: (v) => v.toFixed(2) },
      { id: 'tiltFull', label: '|2p − 1| for full size', min: 0.1, max: 1, step: 0.05, value: 0.5, format: (v) => v.toFixed(2) },
    ],
    render(p) {
      const ps = Array.from({ length: 101 }, (_, i) => i / 100);
      const now = tiltTarget(p.p, p.tiltFull);
      const chart = lines({
        n: ps.length, h: 220, y: [-50, 60], yLabel: 'Target TELLURIUM position vs P(up)',
        series: [{ ys: ps.map((x) => tiltTarget(x, p.tiltFull)), color: COLORS.blue, width: 2.5 }],
        hlines: [{ y: LIMIT, color: COLORS.coral, dash: '4 3', label: `limit +${LIMIT}` }, { y: -LIMIT, color: COLORS.coral, dash: '4 3', label: `limit −${LIMIT}` }, { y: 0 }],
        markers: [{ x: Math.round(p.p * 100), y: now, color: COLORS.amber, r: 6 }],
        xTicks: [0, 25, 50, 75, 100].map((x) => ({ x, label: (x / 100).toFixed(2) })),
      });
      return chart + K.split(
        K.formula(`E[next jump] ≈ (2p − 1) × ${MEAN_JUMP} = <strong>${signed(MEAN_JUMP * (2 * p.p - 1), 0)}</strong> per lot<br>
          target = ${LIMIT} × clip((2p − 1) / ${p.tiltFull.toFixed(2)}, −1, 1) = <strong>${signed(now)}</strong><br>
          full S4: q* = μ / (γσ²), clipped to ±${LIMIT}, at the horizon with the best |μ|/σ`),
        K.takeaway(`The position limit is the per-jump stop: the worst loss is ${LIMIT} lots × one jump, taken only when the posterior expects the next jump to go our way. The submitted S4 nets this DirectionTilt with DriftRider (post-jump drift and give-back) before sizing.`),
      );
    },
  };

  function replayView(r, i) {
    const n = r.mid.length;
    const ticks = dayTicks(n);
    const seen = r.jumps.filter((j) => j.tick <= i);
    const price = lines({
      n, w: 1150, h: 230, yLabel: 'TELLURIUM mid · detected jumps', cursor: i, xTicks: ticks,
      series: [{ ys: r.mid, to: i + 1, color: COLORS.blue, width: 1.4 }],
      markers: seen.map(jumpMarker(r.mid)),
      y: [Math.min(...r.mid) - 20, Math.max(...r.mid) + 20],
    });
    const belief = lines({
      n, w: 570, h: 170, y: [0, 1], yLabel: 'P(next jump up)', cursor: i, xTicks: ticks, yFormat: (v) => v.toFixed(2),
      series: [{ ys: r.pUp, to: i + 1, color: COLORS.amber, width: 2 }], hlines: [{ y: 0.5 }],
    });
    const pnl = lines({
      n, w: 570, h: 170, yLabel: 'P&L', cursor: i, xTicks: ticks,
      series: [{ ys: r.pnl, to: i + 1, color: COLORS.green, width: 2 }],
      y: [Math.min(-5000, ...r.pnl) * 1.08, Math.max(5000, ...r.pnl) * 1.08], hlines: [{ y: 0 }],
    });
    const up = seen.filter((j) => j.dir > 0).length;
    const last = seen.at(-1);
    const after = last ? Math.min(n - 1, last.tick + 1) : 0;
    return {
      panels: [price, belief, pnl],
      stats: [
        ['P&L', signed(r.pnl[i]), r.pnl[i] >= 0 ? 'good' : 'bad'],
        ['Position', `${signed(r.position[i])} / ±${LIMIT}`],
        ['Jumps seen', `${seen.length} (${up}↑ ${seen.length - up}↓)`],
        ['P(next up)', r.pUp[i].toFixed(3)],
      ],
      event: last
        ? `Last jump at tick ${fmt(last.tick)}: ${last.dir > 0 ? '<b class="buy">UP</b>' : '<b class="sell">DOWN</b>'} ${fmt(last.size, 1)} → P(up) ${r.pUp[after].toFixed(3)}, target ${signed(r.position[after])}`
        : 'Watching for the first jump…',
    };
  }

  const replay = {
    label: 'Strategy in action · DirectionTilt on TELLURIUM',
    controls: [
      SOURCE_CONTROL('-1'),
      { id: 'tiltFull', label: '|2p − 1| for full size', min: 0.1, max: 1, step: 0.05, value: 0.5, format: (v) => v.toFixed(2) },
      { id: 'concentration', label: 'Prior concentration centre c', min: 0.1, max: 5, step: 0.05, value: 0.55, format: (v) => v.toFixed(2) },
      { id: 'floor', label: 'Detector floor', min: 5, max: 80, step: 0.25, value: 38.75, format: (v) => v.toFixed(2) },
    ],
    run: (p) => QF.s4.replay(p.day, { tiltFull: p.tiltFull, concentration: p.concentration, floor: p.floor }),
    length: (r) => r.mid.length,
    view: replayView,
    note: `<b>DirectionTilt alone, re-implemented on the real TELLURIUM book</b> (plus a simulated day). After each confirmed jump it updates the posterior and crosses the real spread to the tilted target.
      It shines on one-way days and loses on the mixed day 0, which is exactly why the submitted S4 nets it with DriftRider.
      The backtested S4 earned <b>49,974 / 27,534 / 44,398</b> on days −2 / −1 / 0.`,
  };

  QF.labs.register('s4', {
    kicker: 'STRATEGY LAB · S4 JUMP DIFFUSION',
    title: 'S4 · TELLURIUM jumps and Bayesian directional persistence',
    evidence: 'Track tick-to-tick volatility thresholds to identify outsized jumps instantly, then use a Beta-Binomial posterior on up versus down jumps to forecast short-term direction (slide 19).',
    source: 'Sources: deck slides 10, 19 and 37; Trading_Algorithm/strategies/S4/NOTES.md; backtester/QuantFi Price Data. The simulated day is a seeded calm random walk (σ 1.6) with 9 up jumps, as on real day −1.',
    steps: [pathStep, detectorStep, posteriorStep, sizingStep],
    replay,
  });
})(window);
