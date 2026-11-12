/* Orchestrator lab: routing, netting and limit enforcement, and the slide-22 TOFFEE_CAKE walkthrough. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { signed } = K;

  // v3 fixed routing (Trading_Algorithm/README.md section 5).
  const ROUTES = [
    ['S1', 'TOFFEE_CAKE, AMETHYST, PAPER_LANTERNS, WHITE_PEARLS'],
    ['S2', 'PINK_PEARLS, GOLDEN_PEARLS, BLACK_PEARLS, BLUE_PEARLS'],
    ['S3', 'LYCHEE and all 10 vouchers'],
    ['S4', 'TELLURIUM'],
    ['S5', 'JELLY'],
    ['none', 'FRUIT_BASKET, PEANUT_BUTTER and the three fruits (no qualifying strategy)'],
  ];

  const side = (q) => (q > 0 ? `BUY ${Math.abs(q)}` : q < 0 ? `SELL ${Math.abs(q)}` : 'NO ORDER');
  const pct = (q, limit) => `${(50 + (50 * QF.clip(q, -limit, limit)) / limit).toFixed(2)}%`;

  /** Horizontal position gauge from -limit to +limit with the before / after positions. */
  function gauge(before, after, limit) {
    const lo = Math.min(before, after);
    const hi = Math.max(before, after);
    return `<div class="orch-gauge" role="img" aria-label="Position ${signed(before)} to ${signed(after)} of ±${limit}">
      <div class="orch-track"><span class="orch-zero"></span>
        <span class="orch-move" style="left:${pct(lo, limit)};right:calc(100% - ${pct(hi, limit)})"></span>
        <span class="orch-pin before" style="left:${pct(before, limit)}" title="before"></span>
        <span class="orch-pin after" style="left:${pct(after, limit)}" title="after"></span>
      </div>
      <div class="orch-scale"><span>−${limit}</span><span>0</span><span>+${limit}</span></div></div>`;
  }

  const GAUGE_LEGEND = K.legend([['#8aa0c4', 'Position before'], ['#1e4fb2', 'Position after'], ['#82e19c', 'Change this tick']]);
  const plain = (q) => (q < 0 ? `−${-q}` : String(q));

  const card = (title, big, text) => `<section class="orch-card"><h5>${title}</h5><strong>${big}</strong><p>${text}</p></section>`;

  function walkthrough(p) {
    const r = QF.s5.orchestrate({ position: p.position, limit: p.limit, proposal: p.proposal, filled: p.filled });
    const room = r.next >= 0 ? `${r.buyRoom} lots of buy capacity remain.` : `${r.sellRoom} lots of sell capacity remain.`;
    const validate = r.clipped > 0
      ? `Position ${signed(p.position)}, limit ±${p.limit}. The orchestrator clips the order to ${Math.abs(r.approved)}.`
      : `Position ${signed(p.position)}, limit ±${p.limit}. The order fits, so it passes unchanged.`;
    const cards = card('1. Route &amp; Signal', `S1 → ${side(p.proposal)}`, 'S1 owns TOFFEE_CAKE, identifies an opportunity and proposes an order.')
      + card('2. Validate', `${Math.abs(p.proposal)} → ${Math.abs(r.approved)}`, validate)
      + card('3. Execute', side(r.approved), `The approved order is submitted. The engine fills ${Math.abs(r.fill)} unit${Math.abs(r.fill) === 1 ? '' : 's'}.`)
      + card('4. Reconcile', `${signed(p.position)} → ${signed(r.next)}`, 'The next tick uses the actual fills and the updated position.');
    return `<div class="orch-grid">${cards}</div>
      <div class="orch-inventory"><div><h5>Inventory after execution</h5><strong>${plain(r.next)}/${p.limit}</strong></div><p>${room}</p></div>
      ${GAUGE_LEGEND}${gauge(p.position, r.next, p.limit)}`;
  }

  const routeStep = {
    title: 'Route: one owner per product',
    controls: [],
    render() {
      const rows = ROUTES.map(([owner, products]) => `<tr><td>${owner}</td><td>${products}</td></tr>`).join('');
      return `<table class="lab-table orch-routes"><thead><tr><th>Owner</th><th>Products</th></tr></thead><tbody>${rows}</tbody></table>`
        + K.split(
          K.formula('each tick:<br>1. attribute last tick’s fills to the strategies that could have made them<br>2. keep virtual positions summing to the real one<br>3. collect orders, net crossing orders, clip to the real limit'),
          K.takeaway('Fixed routing gives each product to the strategy that scored best on the dev seeds (and was positive on the real days). The owner trades at its full limit; strategies run independently and never see each other.'),
        );
    },
  };

  const nettingStep = {
    title: 'Coordinate and control: netting, then the limit',
    controls: [
      { id: 'a', label: 'Strategy A order', min: -40, max: 40, step: 1, value: 25 },
      { id: 'b', label: 'Strategy B order', min: -40, max: 40, step: 1, value: -10 },
      { id: 'position', label: 'Current position', min: -50, max: 50, step: 1, value: 30 },
      { id: 'limit', label: 'Position limit', min: 10, max: 100, step: 5, value: 50 },
    ],
    render(p) {
      const net = p.a + p.b;
      const crossing = Math.sign(p.a) * Math.sign(p.b) < 0 ? Math.min(Math.abs(p.a), Math.abs(p.b)) : 0;
      const r = QF.s5.orchestrate({ position: p.position, limit: p.limit, proposal: net, filled: Math.abs(net) });
      const gross = Math.max(p.position + Math.max(p.a, 0) + Math.max(p.b, 0), -(p.position + Math.min(p.a, 0) + Math.min(p.b, 0)));
      const naiveBreach = gross > p.limit;
      return GAUGE_LEGEND + gauge(p.position, r.next, p.limit) + K.split(
        K.formula(`net = ${signed(p.a)} ${p.b < 0 ? '−' : '+'} ${Math.abs(p.b)} = <strong>${signed(net)}</strong> &nbsp;(${crossing} lots crossed internally, no spread paid)<br>
          room on that side = ${r.room} &nbsp;→ approved <strong>${side(r.approved)}</strong>${r.clipped > 0 ? ` (clipped ${r.clipped})` : ''}<br>
          position ${signed(p.position)} → ${signed(r.next)} if fully filled`),
        K.facts([
          ['Sent to the exchange', side(r.approved)],
          ['Without netting and clipping', naiveBreach ? '<span class="sell">breach: every order on the product cancelled this tick</span>' : 'fits, but pays the spread twice on crossed lots'],
        ]) + K.takeaway('The exchange cancels all of a product’s orders for the tick if they could breach its limit, so one central check protects every strategy sharing that product.'),
      );
    },
  };

  QF.labs.register('orch', {
    kicker: 'STRATEGY LAB · ORCHESTRATOR',
    title: 'One centralized orchestrator: route, coordinate, control',
    evidence: 'Specialized strategies. Unified execution. Centralized risk. Every tick the orchestrator routes orders, nets them and enforces position limits before anything reaches the exchange (slides 21, 22 and 32).',
    source: 'Sources: deck slides 21, 22 and 32; Trading_Algorithm/README.md section 5 (tournament/orchestrator_core.py).',
    steps: [routeStep, nettingStep],
    replay: {
      label: 'Walkthrough · TOFFEE_CAKE (slide 22)',
      controls: [
        { id: 'position', label: 'Position before', min: -50, max: 50, step: 1, value: 40 },
        { id: 'limit', label: 'Position limit', min: 10, max: 100, step: 5, value: 50 },
        { id: 'proposal', label: 'S1 proposal (+ buy / − sell)', min: -30, max: 30, step: 1, value: 15 },
        { id: 'filled', label: 'Lots the engine fills', min: 0, max: 30, step: 1, value: 6 },
      ],
      render: walkthrough,
      note: 'Defaults reproduce slide 22 exactly: position +40, limit 50, S1 proposes BUY 15, the orchestrator clips it to 10, the engine fills 6 and the position becomes +46 with 4 lots of buy room. Move the sliders to try other cases.',
    },
  });
})(window);
