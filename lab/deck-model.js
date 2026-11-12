/* Pure helpers over the slide list (data/notes.js) and glossary (data/glossary.js): slide lookup,
 * which lab buttons a slide offers, and the HTML for the Explain panel and the slide index.
 * No DOM access, so it runs under Node for tests. */
(function (root) {
  'use strict';
  const QF = (root.QF = root.QF || {});

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  const pad = (n) => String(n).padStart(2, '0');

  const total = () => QF.deck.slides.length;
  const slide = (n) => (Number.isInteger(n) && n >= 1 && n <= total() ? QF.deck.slides[n - 1] : null);

  /* ---------- labs ---------- */

  const STRATEGY_ACTIONS = [
    { tab: 'derive', icon: '∂', text: 'DERIVATION', secondary: true },
    { tab: 'replay', icon: '▶', text: 'STRATEGY IN ACTION' },
  ];
  const EVIDENCE_ACTIONS = [
    { tab: 'derive', icon: '∂', text: 'SEE THE EVIDENCE' },
    { tab: 'replay', icon: '▦', text: 'SCORECARD', secondary: true },
  ];
  const LAB_ACTIONS = {
    eda: EVIDENCE_ACTIONS,
    'eda-data': EVIDENCE_ACTIONS,
    orch: [{ tab: 'replay', icon: '▶', text: 'STEP THROUGH' }],
    backtest: [
      { tab: 'derive', icon: '∂', text: 'CASE EXPLORER' },
      { tab: 'replay', icon: '▶', text: 'CASE IN ACTION', secondary: true },
    ],
  };
  const LAB_BLURBS = {
    eda: 'Evidence lab: each finding is rebuilt from the raw data and compared with a market that has no structure.',
    'eda-data': 'Evidence lab: each of the four facts is tested against a no-structure baseline, live from the raw data.',
    s1: 'S1 lab: derive the fair value and quotes step by step, then watch the rule trade the real TOFFEE_CAKE order book.',
    s2: 'S2 lab: derive the PINK expected-move formula from the pearl sum, then replay the corrective trades.',
    s3: 'S3 lab: fit the smile, see the residuals revert, and replay one delta-hedged voucher strike.',
    s4: 'S4 lab: run the jump detector on real TELLURIUM prices and watch the direction estimate update.',
    s5: 'S5 lab: change each product\'s edge and volatility and watch the risk budget move between them.',
    orch: 'Orchestrator lab: step through routing, netting and limit clipping with your own numbers.',
    backtest: 'Backtest lab: see what each of the 42 cases changes in the market and how the trader reacts.',
  };

  /** The buttons a lab offers, in display order: none without a key, the strategy-lab pair unless the lab has its own. */
  function labActions(key) {
    if (!key) return [];
    return LAB_ACTIONS[key] || STRATEGY_ACTIONS;
  }
  const labKind = (key) => (String(key).startsWith('eda') ? 'EDA' : 'LAB');

  /* ---------- Explain panel ---------- */

  const MAX_LABEL_LENGTH = 40;

  /** "Left: profit by product." becomes a bold lead-in plus the rest, when the line opens with a short label. */
  function readingNote(line) {
    const cut = line.indexOf(': ');
    if (cut < 1 || cut > MAX_LABEL_LENGTH) return `<li>${esc(line)}</li>`;
    return `<li><b>${esc(line.slice(0, cut + 1))}</b> ${esc(line.slice(cut + 2))}</li>`;
  }

  const block = (heading, body) => `<section class="explain-block"><h3>${heading}</h3>${body}</section>`;

  function termsBlock(keys) {
    const entries = (keys || []).map((key) => QF.glossary[key]).filter(Boolean);
    if (!entries.length) return '';
    const items = entries.map((e) => `<details><summary>${esc(e.term)}</summary><p>${esc(e.def)}</p></details>`).join('');
    return block('KEY TERMS', `<div class="explain-terms">${items}</div>`);
  }

  function labBlock(key) {
    const actions = labActions(key);
    if (!actions.length) return '';
    const buttons = actions.map((a) => `<button class="${a.secondary ? 'secondary' : ''}" data-open-lab="${esc(key)}" data-tab="${a.tab}">${a.icon} ${esc(a.text)}</button>`).join('');
    const blurb = LAB_BLURBS[key] ? `<p class="explain-blurb">${esc(LAB_BLURBS[key])}</p>` : '';
    return block('GO DEEPER', `${blurb}<div class="explain-actions">${buttons}</div>`);
  }

  function relatedBlock(numbers) {
    const links = (numbers || []).filter((n) => slide(n))
      .map((n) => `<button data-goto="${n}"><span>${pad(n)}</span>${esc(slide(n).title)}</button>`).join('');
    return links ? block('RELATED SLIDES', `<div class="explain-related">${links}</div>`) : '';
  }

  /** The Explain panel's content for slide `n`, or an empty string when there is no such slide. */
  function explainHtml(n) {
    const s = slide(n);
    if (!s) return '';
    return `<p class="explain-kicker">SLIDE ${n} OF ${total()} · ${esc(s.section.toUpperCase())}</p>
      <h2 class="explain-title" tabindex="-1">${esc(s.title)}</h2>
      <p class="explain-gist">${esc(s.gist)}</p>
      ${block('HOW TO READ THIS SLIDE', `<ul class="explain-read">${s.read.map(readingNote).join('')}</ul>`)}
      ${termsBlock(s.terms)}${labBlock(s.lab)}${relatedBlock(s.related)}`;
  }

  /* ---------- slide index ---------- */

  /** The slide index drawer: every slide once, grouped under its agenda section. */
  function indexHtml() {
    return QF.deck.sections.map((section) => {
      const rows = QF.deck.slides
        .map((s, i) => (s.section === section ? `<button data-slide="${i + 1}"><span>${pad(i + 1)}</span>${esc(s.title)}</button>` : ''))
        .join('');
      return rows ? `<h3 class="index-section">${esc(section)}</h3>${rows}` : '';
    }).join('');
  }

  QF.deckModel = { esc, pad, total, slide, labActions, labKind, explainHtml, indexHtml };
})(typeof window !== 'undefined' ? window : globalThis);
