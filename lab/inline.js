/* On-slide interactivity: the footer lab dock and the evidence hotspots on slides 9 and 10.
 * Which lab a slide offers comes from data/notes.js; the buttons come from QF.deckModel.labActions.
 * Listens for the `slidechange` event dispatched by deck.js. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { esc } = QF.chart;

  const M = QF.deckModel;

  const dockButton = (key, a) => `<button class="${a.secondary ? 'secondary' : ''}" data-lab="${key}" data-tab="${a.tab}" aria-label="Open lab: ${a.text.toLowerCase()}" title="Open lab: ${a.text.toLowerCase()}">${a.icon}<span class="dock-text"> ${a.text}</span></button>`;

  function mountDock(key) {
    const dock = document.getElementById('labDock');
    if (!dock) return;
    if (!key || !QF.labs.has(key)) {
      dock.innerHTML = '';
      return;
    }
    dock.innerHTML = `<span class="dock-label">${M.labKind(key)}</span>${M.labActions(key).map((a) => dockButton(key, a)).join('')}`;
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

  const EMBEDS = { 9: evidenceSpots('eda-data', SLIDE9_SPOTS), 10: evidenceSpots('eda', SLIDE10_SPOTS) };

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
    const slide = M.slide(n);
    mountDock(slide && slide.lab);
  });
})(window);
