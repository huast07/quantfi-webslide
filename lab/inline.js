/* On-slide interactivity: lab launch buttons, the evidence hotspots on slides 9 and 10, and the
 * content for the blank appendix slides 37 and 38.
 * Listens for the `slidechange` event dispatched by deck.js. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { esc } = QF.chart;

  const LAUNCHERS = {
    9: 'eda-data', 10: 'eda',
    16: 's1', 33: 's1',
    17: 's2', 34: 's2', 35: 's2',
    18: 's3', 36: 's3',
    19: 's4', 37: 's4',
    20: 's5', 38: 's5',
    21: 'orch', 22: 'orch',
    26: 'backtest', 27: 'backtest',
  };

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
      : key === 'backtest'
        ? `<span class="dock-label">LAB</span>${dockButton(key, 'derive', '∂', 'CASE EXPLORER')}${dockButton(key, 'replay', '▶', 'CASE IN ACTION', 'secondary')}`
      : evidence
        ? `<span class="dock-label">EDA</span>${dockButton(key, 'derive', '∂', 'SEE THE EVIDENCE')}${dockButton(key, 'replay', '▦', 'SCORECARD', 'secondary')}`
        : `<span class="dock-label">LAB</span>${dockButton(key, 'derive', '∂', 'DERIVATION', 'secondary')}${dockButton(key, 'replay', '▶', 'STRATEGY IN ACTION')}`;
    dock.onclick = (e) => {
      const b = e.target.closest('[data-lab]');
      if (b) QF.labs.open(b.dataset.lab, b.dataset.tab);
    };
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

  /* ---------- slides 37 and 38: appendix content from the S4 / S5 notes ---------- */

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

  const EMBEDS = { 9: evidenceSpots('eda-data', SLIDE9_SPOTS), 10: evidenceSpots('eda', SLIDE10_SPOTS), 37: appendixS4, 38: appendixS5 };

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
