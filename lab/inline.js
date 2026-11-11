/* On-slide interactivity: lab launch buttons, the TELLURIUM charts that fill the empty
 * chart areas on slides 19 and 20, and the content for the blank appendix slides 38 and 39.
 * Listens for the `slidechange` event dispatched by deck.js. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { lines, dayTicks, COLORS, fmt, esc } = QF.chart;

  const LAUNCHERS = {
    9: 'eda-data', 10: 'eda',
    16: 's1', 34: 's1',
    17: 's2', 35: 's2', 36: 's2',
    18: 's3', 37: 's3',
    19: 's4', 20: 's4', 38: 's4',
    21: 's5', 39: 's5',
    22: 'orch', 23: 'orch',
  };
  const SOURCES = [['sim', 'Simulated day'], ['-2', 'Day −2'], ['-1', 'Day −1'], ['0', 'Day 0']];

  const dockButton = (key, tab, icon, text, cls = '') => `<button class="${cls}" data-lab="${key}" data-tab="${tab}" aria-label="Open lab: ${text.toLowerCase()}" title="Open lab: ${text.toLowerCase()}">${icon}<span class="dock-text"> ${text}</span></button>`;

  function mountDock(key) {
    const dock = document.getElementById('labDock');
    if (!dock) return;
    if (!key || !QF.labs.has(key)) {
      dock.innerHTML = '';
      return;
    }
    const evidence = key.startsWith('eda');
    dock.innerHTML = key === 'orch'
      ? `<span class="dock-label">LAB</span>${dockButton('orch', 'replay', '▶', 'STEP THROUGH')}`
      : evidence
        ? `<span class="dock-label">EDA</span>${dockButton(key, 'derive', '∂', 'SEE THE EVIDENCE')}${dockButton(key, 'replay', '▦', 'SCORECARD', 'secondary')}`
        : `<span class="dock-label">LAB</span>${dockButton(key, 'derive', '∂', 'DERIVATION', 'secondary')}${dockButton(key, 'replay', '▶', 'STRATEGY IN ACTION')}`;
    dock.onclick = (e) => {
      const b = e.target.closest('[data-lab]');
      if (b) QF.labs.open(b.dataset.lab, b.dataset.tab);
    };
  }

  function toolbar(state, options, readout, extra = '') {
    const buttons = options.map(([v, l]) => `<button data-source="${v}" aria-pressed="${String(state.source === v)}">${esc(l)}</button>`).join('');
    return `<div class="embed-toolbar">${buttons}${extra}<span class="embed-readout">${readout}</span></div>`;
  }

  /* ---------- slide 20: tick changes vs the detector threshold ---------- */

  function tickChangesEmbed() {
    const el = document.createElement('div');
    el.className = 'slide-embed';
    Object.assign(el.style, { left: '4.1%', right: '4.4%', top: '19.5%', bottom: '15.8%' });
    const state = { source: 'sim', floor: 38.75 };
    const render = () => {
      const { mid } = QF.s4.source(state.source);
      const det = QF.s4.detect(mid, { floor: state.floor });
      const jumpTicks = new Set(det.jumps.map((j) => j.tick));
      let maxCalm = 0;
      for (let t = 1; t < det.change.length; t++) if (!jumpTicks.has(t)) maxCalm = Math.max(maxCalm, Math.abs(det.change[t]));
      const up = det.jumps.filter((j) => j.dir > 0).length;
      const smallest = det.jumps.length ? Math.min(...det.jumps.map((j) => j.size)) : NaN;
      const thr = Math.max(state.floor, 10 * det.sigmaCalm);
      const readout = `<b>${det.jumps.length}</b> jumps (${up} up) · smallest <b>${fmt(smallest, 1)}</b> · largest calm move <b>${fmt(maxCalm, 1)}</b>`;
      const slider = `<label class="embed-threshold">floor <input type="range" min="5" max="80" step="0.25" value="${state.floor}" aria-label="Detector floor"><b>${fmt(state.floor, 2)}</b></label>`;
      const chart = lines({
        theme: 'dark', n: det.change.length, w: 1200, h: 470, y: [-330, 330], pad: { l: 52, b: 26 },
        yLabel: 'Δmid per tick', xTicks: dayTicks(det.change.length),
        series: [{ ys: det.change, color: '#ffffffd9', width: 1.1 }],
        bands: [{ y0: -thr, y1: thr, color: '#82e19c1c' }],
        hlines: [{ y: thr, color: COLORS.mint, dash: '6 4', label: `+max(${fmt(state.floor, 2)}, 10σ)` }, { y: -thr, color: COLORS.mint, dash: '6 4' }, { y: 0, color: '#ffffff40' }],
        markers: det.jumps.map((j) => ({ x: j.tick, y: det.change[j.tick], color: j.dir > 0 ? COLORS.mint : '#ff9b85', r: 6, title: `Jump of ${fmt(j.size, 1)} at tick ${fmt(j.tick)}` })),
      });
      el.innerHTML = toolbar(state, SOURCES, readout, slider) + chart;
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-source]');
      if (b) { state.source = b.dataset.source; render(); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.type === 'range') { state.floor = +e.target.value; render(); }
    });
    render();
    return el;
  }

  /* ---------- slide 19: TELLURIUM random walk with jumps ---------- */

  function telluriumPathEmbed() {
    const el = document.createElement('div');
    el.className = 'slide-embed light';
    Object.assign(el.style, { left: '49%', right: '5.3%', top: '39.6%', bottom: '11.5%' });
    const state = { source: '-1' };
    const render = () => {
      const { mid } = QF.s4.source(state.source);
      const { jumps } = QF.s4.detect(mid);
      const up = jumps.filter((j) => j.dir > 0).length;
      const chart = lines({
        n: mid.length, w: 760, h: 380, pad: { l: 58 }, yLabel: 'TELLURIUM mid', xTicks: dayTicks(mid.length),
        series: [{ ys: mid, color: COLORS.blue, width: 1.5 }],
        markers: jumps.map((j) => ({ x: j.tick, y: mid[j.tick], color: j.dir > 0 ? COLORS.green : COLORS.coral, shape: j.dir > 0 ? 'up' : 'down', r: 6, title: `${j.dir > 0 ? 'Up' : 'Down'} jump ${fmt(j.size, 1)}` })),
      });
      el.innerHTML = toolbar(state, SOURCES.slice(1), `<b>${jumps.length}</b> jumps · ${up} up / ${jumps.length - up} down`) + chart;
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-source]');
      if (b) { state.source = b.dataset.source; render(); }
    });
    render();
    return el;
  }

  /* ---------- slides 9 and 10: each EDA chart or card opens the step that shows its evidence ---------- */

  const SLIDE10_SPOTS = [
    [2.9, 18.8, 21.8, 23.6, 0, 'Fixed anchor'], [73, 19, 24.6, 23.6, 1, 'Mean reversion'],
    [2.7, 45.4, 22.5, 22.8, 2, 'Sum constraint'], [73.2, 45.4, 24.5, 22.8, 3, 'Step-downs'],
    [2.9, 73, 22, 21.5, 4, 'Big jumps'], [76.7, 71.4, 20.3, 23.6, 5, 'Mispriced options', 'tl'],
  ];
  const SLIDE9_SPOTS = [
    [9.5, 34, 30, 19.5, 0, 'Clean, continuous data', 'tr'], [61.5, 34, 33, 19.5, 1, 'Order book doesn’t predict price', 'tl'],
    [12, 59.5, 28, 19.5, 2, 'Most traders are random', 'tr'], [61.5, 59.5, 31, 19.5, 3, 'Profit comes from structure', 'tl'],
  ];

  function evidenceSpots(lab, spots) {
    return () => {
      const el = document.createElement('div');
      el.className = 'evidence-layer';
      el.innerHTML = spots.map(([x, y, w, h, step, name, corner = 'br']) => `<button class="evidence-spot ${corner}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" data-open-lab="${lab}" data-step="${step}" aria-label="See the evidence: ${esc(name)}"><span><b>SEE THE EVIDENCE</b></span></button>`).join('');
      return el;
    };
  }

  /* ---------- slides 38 and 39: appendix content from the S4 / S5 notes ---------- */

  const row = (tone, title, aside, trade, risk) => `<section class="row ${tone}"><h4>${title}<em>${aside}</em></h4>
    <div><b>TRADE</b><p>${trade}</p></div><div><b>RISK</b><p>${risk}</p></div></section>`;
  const tile = (value, label) => `<div class="tile"><strong>${value}</strong><span>${label}</span></div>`;

  function appendixS4() {
    const el = document.createElement('div');
    el.className = 'appendix';
    el.innerHTML = row('light', 'JUMP DETECTOR - One-tick outliers', '|Δmid| &gt; max(38.75, 10σ<sub>calm</sub>)',
      'Candidate confirmed when the next tick is calm. σ<sub>calm</sub> is an EWMA of calm squared changes, so it tracks vol regimes.',
      'Two outsized ticks within 5 = a ramp, not a jump: drop active jumps and pause new jump trades for 1,000 ticks.')
      + row('blue', 'DRIFTRIDER + DIRECTIONTILT - Netted per horizon', 'q* = μ / (γσ²), clipped to ±40',
        'Sum both components’ mean and variance for each horizon; trade the horizon with the best |μ|/σ. Take if the 100-tick move beats the half spread.',
        'Direction posterior mixes the Beta concentration: ~0.9 after 3 one-way jumps, ~0.5 on mixed days (the whipsaw kill switch).')
      + row('blue', 'GUARDS - What we switched off', 'Direction alone lost on mixed days',
        'ChaserSeller and CalmMaker added nothing; FlowLead raised false alarms on real trade bursts.',
        'GAMMA 3×10⁻⁵ and URGENT_H 100, both in the middle of flat, stable regions of the sweep.')
      + `<div class="tiles">${tile('121.9k', '3-day real P&L (standalone): 50.0k, 27.5k, 44.4k')}${tile('8 / 9 / 13', 'jumps detected on the real days · 0 false positives')}${tile('49.2k', 'held-out mean per day (seeds 3–5, single family)')}${tile('0', 'limit breaches on dev · worst case +35.4k (quiet day)')}</div>`;
    return el;
  }

  function appendixS5() {
    const el = document.createElement('div');
    el.className = 'appendix';
    el.innerHTML = row('light', 'ALLOCATOR - Risk budget across products', 'Qᵢ = B wᵢ / σᵢ,  Σ Qᵢσᵢ ≤ B = 800',
      'Shares come from the rule; slices are water-filled against each product’s limit; each share moves at most 0.002 per tick.',
      'σᵢ = √(γ₀ + 2γ₁): an MA(1) estimate that strips quote noise, with a 1,000-tick half-life.')
      + row('blue', 'EDGE ESTIMATE μᵢ - Flow plus signal', 'μ = print rate × lots × markout + signal edge',
        'Quote at the touch; sizes skew toward a centre so the position stays inside [centre − Q, centre + Q].',
        'Shock guard: a one-tick move above 8σ pauses that product’s passive quotes for 20 ticks.')
      + row('blue', 'RULES COMPARED - Same engine, same budget', 'A2 − EQ: +5,146 [3,466, 6,720]',
        'A2’s gain comes from TOFFEE (+6.9k vs EQ) and from cutting PEANUT_BUTTER and LYCHEE losses.',
        'A1 (vol seeking) trails A2 by 12,050; A3’s worst seed is −43,040.')
      + `<div class="tiles">${tile('34,040', 'weighted dev P&L for A2 (42 cases × 2 seeds)')}${tile('82.2k', 'real days: 28.0k, 22.0k, 32.3k')}${tile('34,580', 'held-out weighted P&L (seeds 3–5)')}${tile('0', 'breaches and crashes · 0.43–0.46 ms per tick')}</div>`;
    return el;
  }

  const EMBEDS = { 9: evidenceSpots('eda-data', SLIDE9_SPOTS), 10: evidenceSpots('eda', SLIDE10_SPOTS), 19: telluriumPathEmbed, 20: tickChangesEmbed, 38: appendixS4, 39: appendixS5 };

  // Any element with data-open-lab (slide hotspots, links inside a lab) opens that lab at data-step.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-lab]');
    if (b) QF.labs.open(b.dataset.openLab, b.dataset.tab || 'derive', Number(b.dataset.step) || 0);
  });

  document.addEventListener('slidechange', (e) => {
    const n = e.detail.slide;
    const overlays = document.getElementById('overlays');
    try {
      if (EMBEDS[n]) overlays.appendChild(EMBEDS[n]());
    } catch (err) {
      console.error(`Slide ${n} embed failed`, err);
    }
    mountDock(LAUNCHERS[n]);
  });
})(window);
