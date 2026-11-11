/* Backtest lab for slides 27 and 28: what each of the 42 synthetic cases changes in the market, how each
 * strategy in the submitted trader reacted, and where the P&L moved, always against the regular day on
 * the same seed (cases share random numbers, so the difference is the case itself). */
(function (root) {
  'use strict';
  const QF = root.QF;
  const K = QF.kit;
  const { lines, bars, COLORS, esc, fmt } = QF.chart;
  const { signed } = K;
  const B = QF.bt;
  const T = QF.btKit;
  const { SIGNALS, FAMILY_COLORS, FAMILY_NAMES, TIER_LABELS, kilo } = T;
  const SEED_COLORS = ['#2e5fc4', '#7a5af5', '#2fb36a'];
  const TIER_FILTER = { id: 'tier', label: 'Tier', type: 'select', value: 'all', options: [['all', 'All 42 cases'], ...B.TIERS.map((t) => [t, TIER_LABELS[t]])] };
  /** Changed cells are highlighted neutrally: a wider spread or more prints is neither good nor bad by itself. */
  const ratio = (r) => (Math.abs(Math.log(r || 1)) < 0.05 ? '' : 'chg');
  const tierCases = (tier) => B.cases().filter((c) => tier === 'all' || c.tier === tier);
  const delta = (c) => B.totals(c).mean - B.totals(B.baseline()).mean;
  /** x-axis labels for a total-P&L path sampled every `totalEvery` ticks. */
  const totalTicks = (n) => [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const x = Math.round(f * (n - 1));
    return { x, label: fmt(x * B.data().totalEvery) };
  });

  /* ---------- 1. the case board ---------- */

  const boardStep = {
    title: 'The 42 unseen days: which cases cost us and which helped',
    controls: [TIER_FILTER, { id: 'sort', label: 'Order', type: 'select', value: 'effect', options: [['effect', 'Worst effect first'], ['catalogue', 'Catalogue order']] }],
    render(p) {
      const list = tierCases(p.tier).slice();
      if (p.sort === 'effect') list.sort((a, b) => delta(a) - delta(b));
      const maxAbs = Math.max(...B.cases().map((c) => Math.abs(delta(c))));
      const rows = list.map((c) => {
        const d = delta(c);
        const width = (50 * Math.abs(d)) / maxAbs;
        const bar = `<i class="${d < 0 ? 'neg' : 'pos'}" style="left:${d < 0 ? 50 - width : 50}%;width:${width}%"></i>`;
        return `<button class="bt-row" data-bt-case="${c.id}" data-step="1"><span class="bt-tier ${c.tier}">${TIER_LABELS[c.tier]}</span>
          <span class="bt-name"><b>${esc(c.title)}</b><small>${esc(c.summary)}</small></span><span class="bt-bar">${bar}</span>
          <span class="bt-val ${d < 0 ? 'down' : 'up'}">${kilo(d)}</span><span class="bt-worst">worst seed ${fmt(B.totals(c).worst)}</span></button>`;
      }).join('');
      const all = B.cases();
      const below = all.filter((c) => delta(c) < 0);
      const worst = all.reduce((a, b) => (delta(b) < delta(a) ? b : a));
      const best = all.reduce((a, b) => (delta(b) > delta(a) ? b : a));
      const worstDay = Math.min(...all.map((c) => B.totals(c).worst));
      return K.split(K.facts([
        ['Tier-weighted mean (slide 28)', fmt(B.weightedMean())],
        ['Regular day, mean of seeds 3-5', fmt(B.totals(B.baseline()).mean)],
        ['Cases below the regular day', `${below.length} of ${all.length}`],
        ['Worst single day (any case, any seed)', fmt(worstDay)],
      ]), K.takeaway(`Every case starts from the regular day and changes one thing, on the same random numbers, so each bar is the exact cost or gain of that one change.
          The worst is <b>${esc(worst.title)}</b> (${kilo(delta(worst))} a day); the best is <b>${esc(best.title)}</b> (${kilo(delta(best))}), where the trader profits from the extra movement.
          ${worstDay > 0 ? 'No case and no seed loses money over the day.' : ''} Click a case to see why.`))
        + `<p class="bt-axis">Change in mean daily P&L vs the regular day (seeds 3, 4 and 5) <span>loss ◂ │ ▸ gain</span></p><div class="bt-board">${rows}</div>`;
    },
  };

  /* ---------- 2. what the case changes in the market ---------- */

  function marketTable(c) {
    const rows = B.marketChanges(c).filter((m) => m.size > 0.05).slice(0, 8);
    if (!rows.length) return K.takeaway('Spreads, prints and tick volatility are unchanged on every product: this case changes prices or directions, not how the market trades. The chart shows where.');
    const cell = (a, b, r, d) => `<td class="${ratio(r)}">${fmt(a, d)} → <b>${fmt(b, d)}</b></td>`;
    const body = rows.map((m) => {
      const fam = T.owner(m.product);
      return `<tr><td><b>${m.product}</b></td><td>${fam ? FAMILY_NAMES[fam] : '<em>not traded</em>'}</td>${cell(m.bSpread, m.spread, m.ratios.spread, 2)}${cell(m.bPrints, m.prints, m.ratios.prints, 0)}${cell(m.bVol, m.vol, m.ratios.vol, 2)}</tr>`;
    }).join('');
    return `<table class="lab-table bt-market"><thead><tr><th>Product</th><th>Traded by</th><th>Mean spread</th><th>Market prints</th><th>Tick σ</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  const marketStep = {
    title: 'What the case changes in the market',
    get controls() { return [T.caseControl()]; },
    render(p) {
      const c = T.useCase(p);
      const list = [...new Set([...c.moved, ...c.focus])];
      const product = T.useProduct(list);
      const t = B.trace(c, product);
      const base = B.trace(B.baseline(), product);
      const gap = t.mid.map((v, i) => v - base.mid[i]);
      const maxGap = Math.max(...gap.map(Math.abs));
      const fam = T.owner(product);
      const priceChart = T.compare({ caseYs: t.mid, baseYs: base.mid, label: `${product} mid price, seed ${B.data().traceSeed}` });
      const gapChart = maxGap > 0.5 ? T.compare({ caseYs: gap, color: COLORS.amber, h: 130, label: 'Case − regular day', hlines: [{ y: 0 }] }) : '';
      return T.caseHeader(c) + T.chips(list, product, (x) => (T.owner(x) ? '' : ' <small>not traded</small>'))
        + T.legend([[COLORS.blue, 'This case'], T.baseLegend()]) + priceChart + gapChart
        + K.takeaway(maxGap > 0.5
          ? `${product}’s mid is up to ${fmt(maxGap, 1)} away from the regular day. ${fam ? `${FAMILY_NAMES[fam]} trades it, so this is what its models had to absorb.` : 'We do not trade it, so this change can only reach our P&L through products we do trade.'}`
          : `${product}’s mid follows the regular day almost exactly: the case acts on how ${product} trades rather than where its price goes.`)
        + `<h4 class="bt-h">How the market traded, regular day → this case (seed ${B.data().traceSeed})</h4>` + marketTable(c);
    },
  };

  /* ---------- 3. how the strategy reacted ---------- */

  function reactionFacts(c, product, signal) {
    const now = B.behaviour(c, product);
    const was = B.behaviour(B.baseline(), product);
    const d = B.productDelta(c).find((x) => x.product === product);
    const rows = [
      ['Owner', FAMILY_NAMES[T.owner(product)]],
      [`P&L on seed ${B.data().traceSeed}`, `${fmt(was.finalPnl)} → <b>${fmt(now.finalPnl)}</b>`],
      ['Change, seeds 3 / 4 / 5', `${d.bySeed.map((x) => signed(x)).join(' / ')}${d.sameSign ? '' : ' <small>(mixed)</small>'}`],
      ['Average |position|', `${fmt(was.exposure, 1)} → <b>${fmt(now.exposure, 1)}</b> <small>(peak ${fmt(now.maxExposure)})</small>`],
      ['Fills', `${fmt(was.fills)} → <b>${fmt(now.fills)}</b>`],
    ];
    if (signal) rows.push([SIGNALS[signal].label, `${fmt(was.sig[signal].mean, SIGNALS[signal].digits)} → <b>${fmt(now.sig[signal].mean, SIGNALS[signal].digits)}</b> <small>(day average)</small>`]);
    return { rows, now, was, d };
  }

  function reactionStory(product, signal, { now, was, d }) {
    const exposure = now.exposure > 1.25 * was.exposure ? `carried more inventory (${fmt(was.exposure, 1)} → ${fmt(now.exposure, 1)} lots on average)`
      : now.exposure < 0.8 * was.exposure ? `cut its inventory (${fmt(was.exposure, 1)} → ${fmt(now.exposure, 1)} lots on average)` : 'kept its inventory about the same';
    const trades = now.fills > 1.25 * was.fills ? 'traded more' : now.fills < 0.8 * was.fills ? 'traded less' : 'traded about as often';
    const verdict = d.sameSign ? `on all three seeds the change has the same sign (${kilo(d.mean)} a day on average), so it is the case, not luck` : `the change flips sign across seeds (${d.bySeed.map((x) => kilo(x)).join(', ')}), so on this product the case’s effect depends on the day`;
    return `${FAMILY_NAMES[T.owner(product)]} ${exposure} and ${trades}; ${verdict}. ${signal ? SIGNALS[signal].how : ''}`;
  }

  const reactionStep = {
    title: 'How the strategy reacted',
    get controls() { return [T.caseControl()]; },
    render(p) {
      const c = T.useCase(p);
      const focus = B.focusProducts(c);
      const product = T.useProduct(focus);
      const t = B.trace(c, product);
      const base = B.trace(B.baseline(), product);
      const signal = T.primarySignal(t);
      const fair = t.sig.fair ? [{ ys: t.sig.fair, color: COLORS.green, width: 1.4 }] : [];
      const price = T.compare({ caseYs: t.mid, baseYs: base.mid, extra: fair, h: 200, label: `${product} mid${fair.length ? ' and the fair value the strategy used' : ''}` });
      const position = T.compare({ caseYs: t.pos, baseYs: base.pos, w: 570, h: 180, label: 'Our position', hlines: [{ y: 0 }] });
      const belief = signal ? T.compare({ caseYs: t.sig[signal], baseYs: base.sig[signal], color: COLORS.amber, w: 570, h: 180, y: SIGNALS[signal].y, label: SIGNALS[signal].label, yFormat: (v) => fmt(v, SIGNALS[signal].digits) }) : '';
      const pnl = T.compare({ caseYs: t.pnl, baseYs: base.pnl, color: COLORS.green, w: 570, h: 180, label: `${product} P&L`, hlines: [{ y: 0 }] });
      const facts = reactionFacts(c, product, signal);
      return T.caseHeader(c)
        + T.chips(focus, product, (x) => ` <small>${kilo(B.productDelta(c).find((d) => d.product === x).mean)}</small>`)
        + T.legend([[COLORS.blue, 'This case'], T.baseLegend(), ...(fair.length ? [[COLORS.green, 'Strategy fair value']] : [])]) + price
        + K.split(position, belief || pnl)
        + K.split(belief ? pnl : K.facts(facts.rows), belief ? K.facts(facts.rows) : K.takeaway(reactionStory(product, signal, facts)))
        + (belief ? K.takeaway(reactionStory(product, signal, facts)) : '');
    },
  };

  /* ---------- 4. where the P&L moved, seed by seed ---------- */

  const seedStep = {
    title: 'Where the P&L moved, seed by seed',
    get controls() { return [T.caseControl()]; },
    render(p) {
      const c = T.useCase(p);
      const fam = B.familyDelta(c);
      const seeds = B.seeds();
      const touched = fam.filter((f) => f.bySeed.some((x) => Math.abs(x) >= B.MIN_EFFECT));
      const chart = !touched.length ? K.takeaway('No strategy’s P&L moves by 100 or more on any seed: the trader is indifferent to this case.') : bars({
        h: 230, categories: touched.map((f) => FAMILY_NAMES[f.family]), showValues: true, valueFormat: (v) => kilo(v),
        groups: seeds.map((s, k) => ({ label: `seed ${s}`, color: SEED_COLORS[k], values: touched.map((f) => f.bySeed[k]) })),
      });
      const gapPaths = seeds.map((s, k) => {
        const cur = B.totalPath(c, s);
        const reg = B.totalPath(B.baseline(), s);
        return { ys: cur.map((v, i) => v - reg[i]), color: SEED_COLORS[k], width: 1.7 };
      });
      const n = gapPaths[0].ys.length;
      const gap = lines({ n, h: 190, y: T.paddedRange(gapPaths.map((s) => s.ys)), yLabel: 'Total P&L: case − regular day, through the day', series: gapPaths, hlines: [{ y: 0 }], xTicks: totalTicks(n) });
      const top = B.productDelta(c).filter((d) => Math.abs(d.mean) >= 50).slice(0, 6);
      const rows = top.map((d) => `<tr><td><b>${d.product}</b></td><td>${d.family ? FAMILY_NAMES[d.family] : '<em>not traded</em>'}</td>${d.bySeed.map((x) => `<td class="${x < 0 ? 'down' : 'up'}">${signed(x)}</td>`).join('')}<td>${d.sameSign ? '✓ same sign' : 'mixed'}</td></tr>`).join('');
      const consistent = fam.filter((f) => Math.abs(f.mean) >= 500 && f.bySeed.every((x) => Math.sign(x) === Math.sign(f.mean)));
      const biggest = fam.reduce((a, b) => (Math.abs(b.mean) > Math.abs(a.mean) ? b : a));
      return T.caseHeader(c)
        + T.legend(seeds.map((s, k) => [SEED_COLORS[k], `Seed ${s}`])) + chart + gap
        + (rows ? `<table class="lab-table bt-market"><thead><tr><th>Product</th><th>Traded by</th>${seeds.map((s) => `<th>Seed ${s}</th>`).join('')}<th>Across seeds</th></tr></thead><tbody>${rows}</tbody></table>` : '')
        + K.takeaway(`${FAMILY_NAMES[biggest.family]} moves most (${kilo(biggest.mean)} a day on average). ${consistent.length ? `${consistent.map((f) => f.family).join(', ')} ${consistent.length === 1 ? 'moves' : 'move'} the same way on every seed, so that effect belongs to the case.` : 'No strategy moves by more than 500 the same way on every seed: this case mostly reshuffles luck.'} The lines show when in the day the gap opened.`);
    },
  };

  /* ---------- 5. every case against every strategy ---------- */

  const mapStep = {
    title: 'Every case × every strategy',
    controls: [TIER_FILTER],
    render(p) {
      const list = tierCases(p.tier);
      const scale = Math.max(...B.cases().flatMap((c) => B.familyDelta(c).map((f) => Math.abs(f.mean))));
      const tint = (v) => {
        // Square-root scale, so one huge effect does not wash out every other cell.
        const a = Math.sqrt(Math.min(1, Math.abs(v) / scale)) * 0.8;
        return v < 0 ? `rgba(224,100,76,${a.toFixed(3)})` : `rgba(47,179,106,${a.toFixed(3)})`;
      };
      const body = list.map((c) => {
        const cells = B.familyDelta(c).map((f) => `<td style="background:${tint(f.mean)}">${Math.abs(f.mean) < 50 ? '·' : kilo(f.mean)}</td>`).join('');
        return `<tr data-bt-case="${c.id}" data-step="2" tabindex="0"><th><span class="bt-tier ${c.tier}">${TIER_LABELS[c.tier][0]}</span>${esc(c.title)}</th>${cells}<td class="${delta(c) < 0 ? 'down' : 'up'}"><b>${Math.abs(delta(c)) < 50 ? '·' : kilo(delta(c))}</b></td></tr>`;
      }).join('');
      const worstFor = B.FAMILIES.map((f) => {
        const hit = B.cases().map((c) => [c, B.familyDelta(c).find((x) => x.family === f).mean]).reduce((a, b) => (b[1] < a[1] ? b : a));
        return `<b style="color:${FAMILY_COLORS[f]}">${f}</b> ${esc(hit[0].title)} (${kilo(hit[1])})`;
      });
      return `<div class="bt-map-wrap"><table class="lab-table bt-map"><thead><tr><th>Case</th>${B.FAMILIES.map((f) => `<th style="color:${FAMILY_COLORS[f]}">${FAMILY_NAMES[f]}</th>`).join('')}<th>Total</th></tr></thead><tbody>${body}</tbody></table></div>`
        + K.takeaway(`Each cell is the change in that strategy’s mean daily P&L vs the regular day; green helped, red hurt. Each strategy’s worst case: ${worstFor.join(' · ')}. Because each strategy owns its own products, a case that breaks one model leaves the others untouched, which is the point of the modular design (slide 29). Click a row to see the reaction.`);
    },
  };

  /* ---------- replay: the case day in action ---------- */

  function runReplay(p) {
    const c = T.useCase(p);
    const focus = B.focusProducts(c);
    const product = focus[Math.min(+p.rank, focus.length - 1)];
    const t = B.trace(c, product);
    const base = B.trace(B.baseline(), product);
    const seed = String(B.data().traceSeed);
    return { c, product, t, base, signal: T.primarySignal(t), total: B.totalPath(c, seed), baseTotal: B.totalPath(B.baseline(), seed), n: t.mid.length };
  }

  function replayView(r, i) {
    const { every, totalEvery } = B.data();
    const j = Math.min(r.total.length - 1, Math.floor((i * every) / totalEvery));
    const total = lines({
      n: r.total.length, w: 1150, h: 170, y: T.paddedRange([r.total, r.baseTotal]), yLabel: `Total P&L, all products · ${r.c.title} vs regular day`, cursor: j, xTicks: totalTicks(r.total.length),
      series: [{ ys: r.baseTotal, to: j + 1, ...T.BASE_STYLE }, { ys: r.total, to: j + 1, color: COLORS.green, width: 2 }],
    });
    const fair = r.t.sig.fair ? [{ ys: r.t.sig.fair, color: COLORS.green, width: 1.3 }] : [];
    const price = T.compare({ caseYs: r.t.mid, baseYs: r.base.mid, extra: fair, cursor: i, h: 190, label: `${r.product} mid${fair.length ? ' · fair value' : ''}` });
    const position = T.compare({ caseYs: r.t.pos, baseYs: r.base.pos, cursor: i, w: 570, h: 170, label: 'Our position', hlines: [{ y: 0 }] });
    const side = r.signal
      ? T.compare({ caseYs: r.t.sig[r.signal], baseYs: r.base.sig[r.signal], color: COLORS.amber, cursor: i, w: 570, h: 170, y: SIGNALS[r.signal].y, label: SIGNALS[r.signal].label, yFormat: (v) => fmt(v, SIGNALS[r.signal].digits) })
      : T.compare({ caseYs: r.t.pnl, baseYs: r.base.pnl, color: COLORS.green, cursor: i, w: 570, h: 170, label: `${r.product} P&L` });
    const gapTotal = r.total[j] - r.baseTotal[j];
    const gapProduct = r.t.pnl[i] - r.base.pnl[i];
    const stats = [
      ['Total vs regular day', kilo(gapTotal), gapTotal >= 0 ? 'good' : 'bad'],
      [`${r.product} P&L`, `${fmt(r.t.pnl[i])} vs ${fmt(r.base.pnl[i])}`, gapProduct >= 0 ? 'good' : 'bad'],
      ['Position', `${signed(r.t.pos[i])} vs ${signed(r.base.pos[i])}`],
    ];
    if (r.signal) stats.push([SIGNALS[r.signal].label.split(',')[0], `${fmt(r.t.sig[r.signal][i], SIGNALS[r.signal].digits)} vs ${fmt(r.base.sig[r.signal][i], SIGNALS[r.signal].digits)}`]);
    const jumps = r.product === 'TELLURIUM' ? r.c.jumps.filter((x) => x[0] <= i * every) : [];
    const last = jumps.at(-1);
    const event = last
      ? `Jump ${jumps.length} at tick ${fmt(last[0])}: ${last[1] > 0 ? '<b class="buy">UP</b>' : '<b class="sell">DOWN</b>'} ${fmt(last[2], 1)} · ${jumps.filter((x) => x[1] > 0).length} up, ${jumps.filter((x) => x[1] < 0).length} down so far`
      : `${r.product}: ${gapProduct >= 0 ? 'ahead of' : 'behind'} the regular day by ${fmt(Math.abs(gapProduct))} at tick ${fmt(i * every)}`;
    return { panels: [total, price, position, side], fullWidth: 2, stats, event, tickLabel: `Tick ${fmt(i * every)} / 10,000` };
  }

  QF.labs.register('backtest', {
    deriveLabel: 'Case explorer',
    kicker: 'BACKTEST LAB · SLIDES 27 AND 28',
    title: 'Backtesting: what each case does, and how the strategies adapt',
    evidence: 'Our submitted trader run on all 42 synthetic day-1 cases through the unmodified prosperity3bt engine. Every case changes one thing from the regular day on the same random numbers, so case minus regular day is the exact effect of that change.',
    source: 'Generated by slideshow/tools/build_case_data.py: Trading_Algorithm/trader2.py on backtester cases × seeds 3, 4 and 5 (the held-out seeds on slide 28). Traces and strategy states are from seed 3, sampled every 20 ticks; strategy states are read from the trader’s own traderData.',
    steps: [boardStep, marketStep, reactionStep, seedStep, mapStep],
    replay: {
      label: 'Case in action',
      get controls() {
        return [T.caseControl(), { id: 'rank', label: 'Product', type: 'select', value: '0', options: [['0', 'Most affected product'], ['1', '2nd most affected'], ['2', '3rd most affected']] }];
      },
      run: runReplay,
      length: (r) => r.n,
      view: replayView,
      speedScale: 0.1,
      note: '<b>The real submitted trader, not a re-implementation.</b> Both days use seed 3, so the dashed line is what would have happened without the case. Products are ranked by how much the case changed their P&L across seeds 3-5.',
    },
  });
})(window);
