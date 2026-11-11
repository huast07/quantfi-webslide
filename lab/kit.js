/* Small presentation helpers shared by the lab definitions. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { fmt, COLORS } = QF.chart;

  const DAY_OPTIONS = [['-2', 'Day −2'], ['-1', 'Day −1'], ['0', 'Day 0']];

  const kit = {
    fmt,
    signed: (v, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}`,
    formula: (html) => `<div class="lab-formula">${html}</div>`,
    takeaway: (html) => `<p class="lab-takeaway">${html}</p>`,
    split: (left, right) => `<div class="lab-split"><div>${left}</div><div>${right}</div></div>`,
    facts: (rows) => `<dl class="lab-facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`,
    legend: (items) => `<div class="lab-legend">${items.map(([color, label]) => `<span><i style="background:${color}"></i>${label}</span>`).join('')}</div>`,
    dayControl: (value = '-1', extra = []) => ({ id: 'day', label: 'Real day', type: 'select', value, options: [...extra, ...DAY_OPTIONS] }),

    /** Buy/sell markers for fills up to tick `upTo`; `y` maps a fill to its chart value. */
    fillMarkers(fills, upTo, y, toIndex = (f) => f.tick) {
      const markers = [];
      for (const f of fills) {
        const x = toIndex(f);
        if (x > upTo) break;
        markers.push({
          x, y: y(f), shape: f.side > 0 ? 'up' : 'down', color: f.side > 0 ? COLORS.green : COLORS.coral,
          r: f.kind === 'passive' ? 3.5 : 4.5,
          title: `${f.side > 0 ? 'Buy' : 'Sell'} ${f.qty} @ ${fmt(f.price, 1)} (${f.kind})`,
        });
      }
      return markers;
    },

    /** Lots and average prices of the fills up to tick `upTo`. */
    tradeSummary(fills, upTo, toIndex = (f) => f.tick) {
      const acc = { buyLots: 0, buyCash: 0, sellLots: 0, sellCash: 0, last: null };
      for (const f of fills) {
        if (toIndex(f) > upTo) break;
        if (f.side > 0) { acc.buyLots += f.qty; acc.buyCash += f.qty * f.price; }
        else { acc.sellLots += f.qty; acc.sellCash += f.qty * f.price; }
        acc.last = f;
      }
      acc.avgBuy = acc.buyLots ? acc.buyCash / acc.buyLots : NaN;
      acc.avgSell = acc.sellLots ? acc.sellCash / acc.sellLots : NaN;
      return acc;
    },

    lastFillText(last, extra = '') {
      if (!last) return 'Waiting for the first trade…';
      const verb = last.side > 0 ? '<b class="buy">BUY</b>' : '<b class="sell">SELL</b>';
      return `Last trade at tick ${fmt(last.tick)}: ${verb} ${last.qty} @ ${fmt(last.price, 1)} (${last.kind})${extra}`;
    },
  };

  QF.kit = kit;
})(window);
