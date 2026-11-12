/* Shared pieces of the backtest lab: the selected case and product, what each strategy signal means,
 * and the case-versus-regular-day charts. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, COLORS, dayTicks, esc, fmt } = QF.chart;
  const { signed } = K;
  const B = QF.bt;

  const DEFAULT_CASE = 'tellurium-whipsaw';
  const FAMILY_COLORS = { S1: '#2a78d6', S2: '#eb6834', S3: '#1baf7a', S4: '#eda100', S5: '#e87ba4' };
  const FAMILY_NAMES = { S1: 'S1 market maker', S2: 'S2 pearl structure', S3: 'S3 voucher vol', S4: 'S4 TELLURIUM jumps', S5: 'S5 allocator' };
  const TIER_LABELS = { observed: 'Observed', plausible: 'Plausible', stress: 'Stress' };
  const BASE_STYLE = { color: COLORS.slate, width: 1.3, dash: '5 4' };

  /** What each recorded strategy signal is and how the strategy acts on it (see trader2.py). */
  const SIGNALS = {
    fair: { label: 'Fair value it quotes around', digits: 1, how: 'The strategy quotes and takes around this fair value, so when the case moves the price the fair value has to follow before the quotes do.' },
    vol: { label: 'Its volatility estimate (σ per tick)', digits: 2, how: 'An exponentially weighted estimate of squared mid changes, updated every tick. It is how the strategy notices that the market has become calmer or wilder.' },
    dev: { label: 'Pearl-sum deviation D', digits: 1, how: 'S2 trades PINK_PEARLS against D = pearl total − 50,000, sized by its fitted slope and jump hazard (slide 17).' },
    mode: { label: 'GOLDEN step detector (0 plateau, ±1 step)', digits: 0, how: 'S2 runs a CUSUM on GOLDEN_PEARLS: a flag of ±1 means it believes a step is under way and trades the remaining move (slide 35).' },
    mom: { label: 'BLUE momentum signal', digits: 3, how: 'S2 leans BLUE_PEARLS with its momentum signal (slide 34).' },
    iv: { label: 'Fitted implied volatility for this strike', digits: 4, how: 'S3 refits the voucher smile every tick and trades strikes priced away from it, delta-hedged with LYCHEE (slide 18).' },
    pup: { label: 'P(next jump up), S4’s direction posterior', digits: 2, y: [0, 1], how: 'After every confirmed jump S4 updates a Beta-Binomial posterior on direction and tilts its TELLURIUM position toward it (slide 19).' },
    follow: { label: 'Post-jump follow-through β', digits: 2, how: 'S4’s running estimate of how far TELLURIUM keeps drifting after a jump; it sizes the drift trade.' },
    share: { label: 'Risk share S5 gives this product', digits: 3, how: 'S5 shares risk by estimated edge over volatility; a share of 0 means it has stopped quoting (slide 20).' },
    edge: { label: 'Markout edge per lot (EWMA)', digits: 1, how: 'S5 marks every fill against the next mid; a negative edge means its quotes were being picked off.' },
    pause: { label: 'Shock pause (ticks left)', digits: 0, how: 'After a single-tick move of 8 long-run σ, S5 stops quoting the product for 20 ticks.' },
  };
  const PRIMARY = ['pup', 'iv', 'dev', 'share', 'mode', 'mom', 'vol'];

  const state = { caseId: DEFAULT_CASE, product: null };

  const caseOptions = () => B.cases().map((c) => [c.id, `${TIER_LABELS[c.tier]} · ${c.title}`]);
  const caseControl = () => ({ id: 'case', label: 'Case', type: 'select', value: state.caseId, options: caseOptions() });

  /** The case chosen in the control, remembered across steps and the replay. */
  function useCase(p) {
    if (p && p.case && p.case !== state.caseId) {
      state.caseId = p.case;
      state.product = null;
    }
    return B.caseById(state.caseId);
  }

  function useProduct(list) {
    if (!list.includes(state.product)) state.product = list[0];
    return state.product;
  }

  const kilo = (v) => `${signed(v / 1000, 1)}k`;
  const owner = (product) => B.data().owner[product] || null;
  const primarySignal = (t) => PRIMARY.find((k) => t && t.sig[k]) || null;

  function chips(list, active, note = () => '') {
    const items = list.map((p) => {
      const fam = owner(p);
      const dot = fam ? `<i style="background:${FAMILY_COLORS[fam]}"></i>` : '<i class="none"></i>';
      return `<button class="bt-chip${p === active ? ' active' : ''}" data-bt-product="${esc(p)}" aria-pressed="${p === active}">${dot}${esc(p)}${note(p)}</button>`;
    });
    return `<div class="bt-chips" role="group" aria-label="Product">${items.join('')}</div>`;
  }

  function caseHeader(c) {
    const t = B.totals(c);
    const base = B.totals(B.baseline());
    const refs = c.refs.length ? `<small>${c.refs.map(esc).join(' · ')}</small>` : '';
    return `<div class="bt-case"><div class="bt-case-top"><span class="bt-tier ${c.tier}">${TIER_LABELS[c.tier]}</span><b>${esc(c.title)}</b>
      <span class="bt-case-pnl">${fmt(t.mean)} a day <em class="${t.mean >= base.mean ? 'up' : 'down'}">${kilo(t.mean - base.mean)} vs regular day</em></span></div>
      <p>${esc(c.description)}</p>${refs}</div>`;
  }

  /** y-range over every series with headroom at the top, so the chart title never sits on the data. */
  function paddedRange(series) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const ys of series) for (const v of ys) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const span = hi - lo || Math.max(Math.abs(hi), 1);
    return [lo - 0.06 * span, hi + 0.22 * span];
  }

  /** Case (solid) against the regular day on the same seed (dashed), with optional extra series. */
  function compare({ caseYs, baseYs, color = COLORS.blue, label, extra = [], cursor, w = 1150, h = 210, y, yFormat, hlines = [], markers = [] }) {
    const n = caseYs.length;
    const upTo = cursor == null ? n : cursor + 1;
    const range = y || paddedRange([caseYs, ...(baseYs ? [baseYs] : []), ...extra.map((s) => s.ys)]);
    return lines({
      n, w, h, y: range, yLabel: label, cursor, yFormat, hlines, markers, xTicks: dayTicks(n, B.data().every),
      series: [
        ...(baseYs ? [{ ys: baseYs, to: upTo, ...BASE_STYLE }] : []),
        { ys: caseYs, to: upTo, color, width: 1.8 },
        // Extra series (the strategy's fair value) go on top, dashed, so they stay visible where they track the mid.
        ...extra.map((s) => ({ dash: '6 3', ...s, to: upTo })),
      ],
    });
  }

  const legend = (items) => K.legend(items);
  const baseLegend = (name = 'Regular day, same seed') => [COLORS.slate, name];

  // Product chips and case rows inside a lab change the shared state, then redraw the open lab.
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-bt-product]');
    if (chip) {
      state.product = chip.dataset.btProduct;
      QF.labs.refresh();
      return;
    }
    const row = e.target.closest('[data-bt-case]');
    if (row) {
      state.caseId = row.dataset.btCase;
      state.product = null;
      QF.labs.open('backtest', 'derive', Number(row.dataset.step) || 1);
    }
  });

  // Case-map rows are table rows, so give them the keyboard behaviour of a button.
  document.addEventListener('keydown', (e) => {
    const row = e.target.closest && e.target.closest('tr[data-bt-case]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      row.click();
    }
  });

  QF.btKit = {
    FAMILY_COLORS, FAMILY_NAMES, TIER_LABELS, SIGNALS, BASE_STYLE,
    state, caseControl, useCase, paddedRange, useProduct, kilo, owner, primarySignal, chips, caseHeader, compare, legend, baseLegend,
  };
})(window);
