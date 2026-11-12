/* S3 lab: LYCHEE voucher implied-vol smile, residual mean reversion and the VoucherRV rule (slides 18 and 37). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, dayTicks, COLORS } = QF.chart;
  const { fmt, signed } = K;
  const SNAPSHOTS = 500;
  const STRIKE_OPTIONS = root.labData.strikes.map((k, i) => [String(i), `VOUCHER_${k}`]);

  const snapshotControls = [
    K.dayControl('-1'),
    { id: 'k', label: 'Time of day (tick)', min: 0, max: SNAPSHOTS - 1, step: 1, value: 250, format: (v) => fmt(v * 20) },
  ];

  const SMILE_LEGEND = K.legend([[COLORS.blue, 'Market IV above the smile: rich (r &gt; 0)'], [COLORS.green, 'Market IV below the smile: cheap (r &lt; 0)']]);

  function smileChart(snap) {
    const ms = snap.rows.map((r) => r.m);
    const lo = Math.min(...ms);
    const hi = Math.max(...ms);
    const grid = Array.from({ length: 81 }, (_, i) => lo + ((hi - lo) * i) / 80);
    const toX = (m) => ((m - lo) / (hi - lo)) * 80;
    const ivs = snap.rows.map((r) => r.iv).filter(Number.isFinite);
    return lines({
      n: grid.length, h: 230, y: [Math.min(...ivs) * 0.93, Math.max(...ivs) * 1.05], yLabel: 'Implied vol per √day vs moneyness m = ln(K/S)/√T',
      yFormat: (v) => v.toFixed(4),
      series: [{ ys: grid.map(snap.smileIv), color: COLORS.blue, width: 2.5 }],
      markers: snap.rows.map((r) => ({ x: toX(r.m), y: r.iv, r: 5.5, color: r.resid > 0 ? COLORS.blue : COLORS.green, stroke: '#fff', title: `${r.K}: IV ${r.iv.toFixed(4)}, fit ${r.fitIv.toFixed(4)}` })),
      xTicks: snap.rows.filter((_, i) => i % 2 === 0).map((r) => ({ x: toX(r.m), label: `K ${r.K}` })),
    });
  }

  const ivStep = {
    title: 'Implied vol: invert Black–Scholes per strike',
    controls: snapshotControls,
    render(p) {
      const snap = QF.s3.snapshot(p.day, p.k);
      const table = `<table class="lab-table"><thead><tr><th>Strike</th><th>Mid</th><th>IV</th><th>Delta</th></tr></thead><tbody>${snap.rows.map((r) => `<tr><td>${r.K}</td><td>${fmt(r.mid, 1)}</td><td>${r.iv.toFixed(4)}</td><td>${r.delta.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;
      return SMILE_LEGEND + smileChart(snap) + K.split(
        K.formula(`C(S, K, T, σ) = S·N(d₁) − K·N(d₂)<br>d₁ = [ln(S/K) + σ²T/2] / (σ√T), &nbsp;d₂ = d₁ − σ√T<br>
          Newton: σ ← σ − (C(σ) − mid) / vega(σ)<br>LYCHEE S = <strong>${fmt(snap.S, 1)}</strong>, T = <strong>${fmt(snap.T, 2)}</strong> days`)
          + K.takeaway('Each voucher price is turned into the volatility that makes Black–Scholes match it. The live strategy warm-starts from the last tick, so 3 Newton steps per tick are enough. IV per √day sits near 0.019–0.022, as on slide 18.'),
        table,
      );
    },
  };

  const smileStep = {
    title: 'Fit the smile and measure residuals',
    controls: snapshotControls,
    render(p) {
      const snap = QF.s3.snapshot(p.day, p.k);
      const stats = QF.s3.residualStats(QF.s3.residuals(p.day));
      const resid = bars({
        h: 210, categories: snap.rows.map((r) => String(r.K)), showValues: true, valueFormat: (v) => fmt(v, 1),
        groups: [{ label: 'r = mid − smile price', color: COLORS.blue, values: snap.rows.map((r) => r.resid) }],
        errors: stats.map((s) => ({ lo: -s.sd, hi: s.sd })), y: [-12, 12],
      });
      return SMILE_LEGEND + smileChart(snap) + resid + K.split(
        K.formula(`Smile IV = a + b·m + c·m² (GLS, vega² weights)<br>a = ${fmt(snap.fit.a, 4)}, b = ${fmt(snap.fit.b, 4)}, c = ${fmt(snap.fit.c, 3)}<br>
          r = mid − BS(S, K, T, smile IV) &nbsp;(price units)`),
        K.takeaway('Bars are the residuals at this instant; the black whiskers are each strike’s ±1 sd over the day (widest around 7,300–7,600, as on slide 18). r &gt; 0 is rich (sell), r &lt; 0 is cheap (buy). Scrub the time slider to watch residuals open and close.'),
      );
    },
  };

  const arStep = {
    title: 'Residuals mean-revert: AR(1) and the value v = F + ρr',
    controls: [
      K.dayControl('-1'),
      { id: 'strike', label: 'Strike', type: 'select', value: '5', options: STRIKE_OPTIONS },
      { id: 'H', label: 'Holding horizon H (ticks)', min: 10, max: 400, step: 10, value: 120 },
    ],
    render(p) {
      const res = QF.s3.residuals(p.day);
      const i = +p.strike;
      const st = QF.s3.residualStats(res)[i];
      const rho = st.phiTick ** p.H;
      const half = Math.log(2) / -Math.log(st.phiTick);
      const series = res.series[i];
      const chart = lines({
        n: series.length, h: 220, yLabel: `Residual r for VOUCHER_${res.strikes[i]} over the day`,
        series: [{ ys: series, color: COLORS.blue, width: 1.3 }],
        bands: [{ y0: -2 * st.sd, y1: 2 * st.sd, color: '#2e5fc414' }],
        hlines: [{ y: 2 * st.sd, color: COLORS.coral, dash: '5 4', label: '+2 sd: rich' }, { y: -2 * st.sd, color: COLORS.green, dash: '5 4', label: '−2 sd: cheap' }, { y: 0 }],
        xTicks: dayTicks(series.length, res.every),
      });
      const edge = 2 * st.sd * (1 - rho) - 1.5;
      return chart + K.split(
        K.formula(`r<sub>t+1</sub> = φ·r<sub>t</sub> + ε &nbsp;→ φ̂ = <strong>${st.phiTick.toFixed(4)}</strong> per tick<br>
          half-life = ln 2 / −ln φ = <strong>${fmt(half)} ticks</strong><br>ρ = φ<sup>H</sup> = ${st.phiTick.toFixed(4)}<sup>${p.H}</sup> = <strong>${rho.toFixed(2)}</strong><br>
          v = F + ρ·r &nbsp;→ ${fmt((1 - rho) * 100)}% of r reverts within H`),
        K.facts([
          ['Residual sd (this strike, this day)', fmt(st.sd, 2)],
          ['Edge per lot at 2 sd, after 1.5 take edge', `${signed(edge, 1)}`],
          ['Slide 18 reference (7,500, H = 120)', 'φ 0.992–0.994, ρ ≈ 0.43, ≈ 4.2 per lot'],
        ]) + K.takeaway('Fitted from the day’s residuals. A 2-sd mispricing pays |r|(1 − ρ) minus costs if it reverts as the AR(1) predicts.'),
      );
    },
  };

  const sizingStep = {
    title: 'Size by edge: the reservation curve v(q)',
    controls: [
      { id: 'z', label: 'Residual r (in sd)', min: -3, max: 3, step: 0.1, value: 2, format: (v) => `${v.toFixed(1)} sd` },
      { id: 'sd', label: 'Residual sd', min: 1, max: 6, step: 0.1, value: 4.5, format: (v) => v.toFixed(1) },
      { id: 'ra', label: 'Risk aversion', min: 0.1, max: 1.5, step: 0.05, value: 0.35, format: (v) => v.toFixed(2) },
      { id: 'rho', label: 'ρ = φᴴ', min: 0, max: 1, step: 0.01, value: 0.43, format: (v) => v.toFixed(2) },
    ],
    render(p) {
      const r = p.z * p.sd;
      const F = 100;
      const mid = F + r;
      const v = F + p.rho * r;
      const slope = (p.ra * p.sd) / 50;
      const takeEdge = 1.5;
      const half = 1.5;
      const qs = Array.from({ length: 101 }, (_, i) => i - 50);
      const curve = qs.map((q) => v - slope * q);
      const sellTarget = Math.max(-50, Math.ceil((v + takeEdge - (mid - half)) / slope));
      const buyTarget = Math.min(50, Math.floor((v - takeEdge - (mid + half)) / slope));
      const target = buyTarget > 0 ? buyTarget : sellTarget < 0 ? sellTarget : 0;
      const chart = lines({
        n: qs.length, h: 230, yLabel: 'Reservation value v(q) = v − slope·q vs position q',
        series: [{ ys: curve, color: COLORS.blue, width: 2.5 }],
        hlines: [
          { y: mid - half - takeEdge, color: COLORS.coral, dash: '5 4', label: 'bid − take edge (sell while curve is below)' },
          { y: mid + half + takeEdge, color: COLORS.green, dash: '5 4', label: 'ask + take edge (buy while curve is above)' },
        ],
        vlines: [{ x: target + 50, color: COLORS.purple, label: `target ${target}` }],
        xTicks: [-50, -25, 0, 25, 50].map((q) => ({ x: q + 50, label: `${q}` })),
        y: [Math.min(...curve, mid - 8) - 2, Math.max(...curve, mid + 8) + 2],
      });
      return chart + K.split(
        K.formula(`v = F + ρr = ${fmt(F)} + ${p.rho.toFixed(2)}×${fmt(r, 1)} = <strong>${fmt(v, 2)}</strong><br>slope = RA·sd/50 = ${slope.toFixed(4)}<br>
          target position = <strong>${target}</strong> &nbsp;(${target < 0 ? 'sell the rich strike' : target > 0 ? 'buy the cheap strike' : 'no trade'})`),
        K.takeaway('The more mispriced the strike, the further the curve sits from the book and the larger the target. With RA = 0.35 a ~2 sd residual already reaches the full 50-lot limit (slide 37). The LYCHEE leg then hedges −Σ qᵢΔᵢ inside a ±50 delta band.'),
      );
    },
  };

  const allStrikes = new Map();
  function dayTotal(day, params) {
    const key = `${day}:${params.horizon}:${params.takeEdge}:${params.riskAversion}`;
    if (!allStrikes.has(key)) {
      const total = root.labData.strikes.reduce((s, _, i) => s + QF.s3.replay(day, i, params).pnl.at(-1), 0);
      allStrikes.set(key, total);
    }
    return allStrikes.get(key);
  }

  const replay = {
    label: 'Strategy in action · one strike, delta-hedged',
    controls: [
      K.dayControl('-1'),
      { id: 'strike', label: 'Strike', type: 'select', value: '5', options: STRIKE_OPTIONS },
      { id: 'horizon', label: 'Horizon H', min: 20, max: 400, step: 10, value: 120 },
      { id: 'takeEdge', label: 'Take edge', min: 0, max: 4, step: 0.25, value: 1.5 },
      { id: 'riskAversion', label: 'Risk aversion', min: 0.1, max: 1.5, step: 0.05, value: 0.35, format: (v) => v.toFixed(2) },
    ],
    speedScale: 1 / 20,
    run(p) {
      const params = { horizon: p.horizon, takeEdge: p.takeEdge, riskAversion: p.riskAversion };
      const r = QF.s3.replay(p.day, +p.strike, params);
      return { ...r, dayTotal: dayTotal(p.day, params) };
    },
    length: (r) => r.resid.length,
    view(r, i, p) {
      const n = r.resid.length;
      const ticks = dayTicks(n, r.every);
      const toIndex = (f) => f.tick / r.every;
      const resid = lines({
        n, w: 1150, h: 220, yLabel: `Residual r = mid − smile price · VOUCHER_${root.labData.strikes[+p.strike]}`, cursor: i, xTicks: ticks,
        series: [{ ys: r.resid, to: i + 1, color: COLORS.blue, width: 1.4 }],
        bands: [{ y0: -2 * r.sd, y1: 2 * r.sd, color: '#2e5fc412' }],
        hlines: [{ y: 2 * r.sd, color: COLORS.coral, dash: '5 4', label: '+2 sd' }, { y: -2 * r.sd, color: COLORS.green, dash: '5 4', label: '−2 sd' }, { y: 0 }],
        markers: K.fillMarkers(r.fills, i, (f) => r.resid[toIndex(f)], toIndex),
      });
      const position = lines({
        n, w: 570, h: 170, y: [-55, 55], yLabel: 'Voucher (purple) · LYCHEE hedge (amber)', cursor: i, xTicks: ticks,
        series: [{ ys: r.position, to: i + 1, color: COLORS.purple, width: 1.8 }, { ys: r.hedge, to: i + 1, color: COLORS.amber, width: 1.4 }],
        hlines: [{ y: 0 }],
      });
      const pnl = lines({
        n, w: 570, h: 170, yLabel: 'Hedged P&L', cursor: i, xTicks: ticks,
        series: [{ ys: r.pnl, to: i + 1, color: COLORS.green, width: 2 }],
        y: [Math.min(0, ...r.pnl) - 300, Math.max(...r.pnl) * 1.05 + 300], hlines: [{ y: 0 }],
      });
      const s = K.tradeSummary(r.fills, i, toIndex);
      return {
        panels: [resid, position, pnl],
        stats: [
          ['P&L (this strike)', signed(r.pnl[i]), r.pnl[i] >= 0 ? 'good' : 'bad'],
          ['Voucher / hedge', `${signed(r.position[i])} / ${signed(r.hedge[i])}`],
          ['φ per tick · ρ', `${r.phiTick.toFixed(4)} · ${r.rho.toFixed(2)}`],
          ['Residual sd', fmt(r.sd, 2)],
          ['All 10 strikes, full day', signed(r.dayTotal)],
        ],
        event: K.lastFillText(s.last),
        tickLabel: `Tick ${fmt(i * r.every)} / ${fmt(n * r.every)}`,
      };
    },
    note: `<b>Simplified re-implementation of VoucherRV on real voucher mids</b>, sampled every 20 ticks, trading at mid ± 1.5 and hedging delta exactly with LYCHEE at mid.
      φ and the residual sd are estimated from the selected day itself (in-sample); the submitted S3 learns them online, smooths the smile shape over 1,000 ticks, rests ≤ 10 lots where the rule-takers do not trade, and hedges inside a ±50 delta band.
      The backtested S3 earned <b>162.4k over the 3 real days</b> (62.5k, 54.2k, 45.6k; slide 37).`,
  };

  QF.labs.register('s3', {
    kicker: 'STRATEGY LAB · S3 VOUCHER RELATIVE VALUE',
    title: 'S3 · Voucher IV mispricing on LYCHEE',
    evidence: 'Implied vol runs 20–30% above realised vol. We don’t bet on LYCHEE’s direction: we price every strike off one smile, sell the rich strike, buy the cheap one, and hedge the rest (slides 18 and 37).',
    source: 'Sources: Team 05 deck slides 10, 18 and 37; Trading_Algorithm/strategies/S3/NOTES.md. T at each day’s open uses the EDA convention (8 / 7 / 6 days). Prices: backtester/QuantFi Price Data (voucher surface sampled every 20 ticks).',
    steps: [ivStep, smileStep, arStep, sizingStep],
    replay,
  });
})(window);
